import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { repoRoot } from "./common.js";

export async function readState(filePath, meetingId) {
  if (!existsSync(filePath)) {
    return { meetingId, provider: "gcp-speech-v2-batch", tracks: {} };
  }

  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function writeState(filePath, state) {
  await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function extractTranscript(response, gcsUri) {
  const fileResult = response?.results?.[gcsUri];
  const recognitionResults = fileResult?.transcript?.results || fileResult?.inlineResult?.transcript?.results || [];
  const lines = [];

  for (const result of recognitionResults) {
    const transcript = result.alternatives?.[0]?.transcript?.trim();
    if (transcript) lines.push(transcript);
  }

  return lines.join("\n").trim();
}

export function extractTimedSegments(response, gcsUri, offsetSeconds, chunkSeconds = 900) {
  const fileResult = response?.results?.[gcsUri];
  const recognitionResults = fileResult?.transcript?.results || fileResult?.inlineResult?.transcript?.results || [];
  const segments = [];

  for (const result of recognitionResults) {
    const alternative = result.alternatives?.[0];
    const transcript = alternative?.transcript?.trim();
    if (!transcript) continue;

    const words = alternative.words || [];
    if (words.length > 0) {
      segments.push(...buildSegmentsFromWords(words, offsetSeconds, chunkSeconds));
    } else {
      const startSeconds = offsetSeconds + durationToSeconds(result.resultStartOffset || "0s");
      const endSeconds = offsetSeconds + durationToSeconds(result.resultEndOffset || "0s");
      segments.push(createSegment(startSeconds, endSeconds, transcript));
    }
  }

  return segments;
}

export function extractFileError(response, gcsUri) {
  return response?.results?.[gcsUri]?.error || null;
}

export function groupTranscriptResults(items, state, options) {
  const grouped = new Map();

  for (const item of items) {
    const entry = state.tracks[item.key];
    if (!grouped.has(item.trackKey)) {
      grouped.set(item.trackKey, {
        meetingId: options.meetingId,
        trackKey: item.trackKey,
        speaker: item.speaker,
        sourceFile: path.relative(repoRoot, item.sourcePath),
        chunks: [],
        gcsUris: [],
        text: "",
      });
    }

    const result = grouped.get(item.trackKey);
    const segments = extractTimedSegments(entry.rawResponse, entry.gcsUri, entry.offsetSeconds ?? item.offsetSeconds ?? 0, options.chunkSeconds);
    result.chunks.push({
      chunkIndex: item.chunkIndex,
      chunkCount: item.chunkCount,
      offsetSeconds: item.offsetSeconds,
      chunkFile: entry.chunkFile,
      gcsUri: entry.gcsUri,
      segments,
      text: segments.map((segment) => segment.text).join("\n") || entry.text || "",
    });
    result.gcsUris.push(entry.gcsUri);
  }

  return [...grouped.values()].map((result) => ({
    ...result,
    chunks: result.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex),
    text: result.chunks
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .map((chunk) => chunk.text)
      .filter(Boolean)
      .join("\n"),
    segments: result.chunks
      .flatMap((chunk) => chunk.segments || [])
      .sort((a, b) => a.startSeconds - b.startSeconds),
  }));
}

export function renderTrackMarkdown(result, config) {
  return `# ${result.meetingId} ${result.speaker} 전사

- Provider: GCP Speech-to-Text V2 ${config.modeLabel}
- Model: \`${config.model}\`
- 원본: \`${result.sourceFile}\`
- Chunks: ${result.chunks.length}
- GCS:
${result.gcsUris.map((uri) => `  - \`${uri}\``).join("\n")}

## Transcript

${result.text || "_전사 내용 없음_"}

## Timed Transcript

${renderTimedSegments(result.segments)}
`;
}

export function renderCombinedMarkdown(id, infoText, results) {
  const timeline = results
    .flatMap((result) => result.segments.map((segment) => ({ ...segment, speaker: result.speaker })))
    .sort((a, b) => a.startSeconds - b.startSeconds || a.speaker.localeCompare(b.speaker, "ko"));
  const sections = timeline.length
    ? timeline.map((segment) => `- [${segment.start} - ${segment.end}] **${segment.speaker}**: ${segment.text}`).join("\n")
    : "_전사 내용 없음_";

  return `# ${id} 회의 전사

${infoText ? `## Recording Info\n\n\`\`\`text\n${infoText.trim()}\n\`\`\`\n\n` : ""}## Timeline

${sections}
`;
}

function buildSegmentsFromWords(words, offsetSeconds, chunkSeconds) {
  const segments = [];
  let current = [];
  let currentStart = null;
  let currentEnd = null;

  for (const word of words) {
    const text = word.word?.trim();
    if (!text) continue;

    const localStart = normalizeLocalOffset(durationToSeconds(word.startOffset ?? word.endOffset ?? "0s"), chunkSeconds);
    let localEnd = normalizeLocalOffset(durationToSeconds(word.endOffset ?? word.startOffset ?? "0s"), chunkSeconds);
    if (localEnd < localStart || localEnd - localStart > 5) {
      localEnd = localStart + Math.min(1, Math.max(0.2, text.length * 0.08));
    }
    const start = offsetSeconds + localStart;
    const end = offsetSeconds + Math.max(localEnd, localStart);
    const gap = currentEnd == null ? 0 : start - currentEnd;
    const span = currentStart == null ? 0 : end - currentStart;

    if (current.length > 0 && (gap > 2.5 || span > 25 || /[.!?。？！]$/.test(current.at(-1)))) {
      const segment = createSegment(currentStart, currentEnd, current.join(" "));
      if (!isNoiseOnly(segment.text)) segments.push(segment);
      current = [];
      currentStart = null;
    }

    if (currentStart == null) currentStart = start;
    current.push(text);
    currentEnd = end;
  }

  if (current.length > 0) {
    const segment = createSegment(currentStart, currentEnd, current.join(" "));
    if (!isNoiseOnly(segment.text)) segments.push(segment);
  }

  return segments.filter((segment) => segment.text);
}

function createSegment(startSeconds, endSeconds, text) {
  const safeStart = Math.max(0, startSeconds || 0);
  const safeEnd = Math.max(safeStart, endSeconds || safeStart);
  return {
    start: formatTimestamp(safeStart),
    end: formatTimestamp(safeEnd),
    startSeconds: safeStart,
    endSeconds: safeEnd,
    text: cleanTranscriptText(text),
  };
}

function renderTimedSegments(segments = []) {
  if (!segments.length) return "_전사 내용 없음_";
  return segments.map((segment) => `- [${segment.start} - ${segment.end}] ${segment.text}`).join("\n");
}

function cleanTranscriptText(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\[\s+/g, "")
    .replace(/(?:으흐\s*){8,}/g, "[웃음/잡음]")
    .replace(/(?:음[.\s]*){12,}/g, "[무음/잡음]")
    .trim();
}

function isNoiseOnly(text) {
  const tokens = text
    .replace(/[.,!?。？！\[\]()]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) return true;

  return tokens.every((token) => /^(음+|아+|어+|응+|흐+|하+|으흐+|으흐흐+|흐흐+|으흐흐흐+)$/.test(token));
}

function normalizeLocalOffset(seconds, chunkSeconds) {
  if (!Number.isFinite(seconds)) return 0;
  if (seconds < 0) return 0;
  if (seconds > chunkSeconds + 5) return chunkSeconds;
  return seconds;
}

function durationToSeconds(duration) {
  if (!duration || typeof duration !== "string") return 0;
  const match = duration.match(/^(-?\d+)(?:\.(\d+))?s$/);
  if (!match) return 0;

  return Number(match[1]) + Number(`0.${match[2] || "0"}`);
}

function formatTimestamp(totalSeconds) {
  const rounded = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}
