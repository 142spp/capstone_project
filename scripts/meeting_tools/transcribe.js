import fs from "node:fs/promises";
import path from "node:path";
import { createRepairedWav, findFlacTracks, prepareRecognitionItems } from "./lib/audio.js";
import {
  ensureDirectory,
  formatBytes,
  getMeetingPaths,
  installErrorHandlers,
  loadDefaultEnv,
  parseCliArgs,
  readOptionalText,
  relative,
  repoRoot,
} from "./lib/common.js";
import {
  buildGcpConfig,
  createAccessTokenProvider,
  pollUntilComplete,
  submitBatchRecognize,
  uploadToGcs,
  validateGcpConfig,
} from "./lib/gcp.js";
import {
  groupTranscriptResults,
  readState,
  renderCombinedMarkdown,
  renderTrackMarkdown,
  writeState,
} from "./lib/transcripts.js";

installErrorHandlers();

const cli = parseCliArgs(process.argv.slice(2));

if (cli.flag("help") || cli.flag("h")) {
  printUsage();
  process.exit(0);
}

if (!cli.meetingId) {
  printUsage();
  process.exit(1);
}

await loadDefaultEnv();

const options = {
  dryRun: cli.flag("dry-run"),
  force: cli.flag("force"),
  onlyKey: cli.value("only"),
  pollOnce: cli.flag("poll-once"),
  pollOnly: cli.flag("poll-only"),
  rebuildOnly: cli.flag("rebuild-only"),
  repairKey: cli.value("repair"),
  resubmitOnly: cli.flag("resubmit-only"),
  submitOnly: cli.flag("submit-only"),
};

const config = buildGcpConfig();
const paths = getMeetingPaths(cli.meetingId, "gcp-dynamic");
await ensureDirectory(paths.transcriptDir);

const infoText = await readOptionalText(paths.infoPath);
const tracks = await findFlacTracks(paths.audioDir);
if (tracks.length === 0) {
  throw new Error(`No .flac tracks found in ${relative(paths.audioDir)}. Download Craig as multi-track FLAC first.`);
}

printMeetingInfo(cli.meetingId, config, paths.audioDir, tracks);

if (options.dryRun) {
  console.log("Dry run complete. No GCP calls were made.");
  process.exit(0);
}

validateGcpConfig(config);

let items = await prepareRecognitionItems(tracks, {
  chunkSeconds: config.chunkSeconds,
  force: options.force,
  workDir: paths.workDir,
});
items = filterItems(items, options.onlyKey);

const currentKeys = new Set(items.map((item) => item.key));
const state = await readState(paths.statePath, cli.meetingId);
const tokenProvider = createAccessTokenProvider();

if (!options.pollOnly && !options.rebuildOnly) {
  await submitItems(items, state, paths, config, tokenProvider, options);
}

if (options.submitOnly) {
  console.log(`Submitted jobs. Later, run: node scripts/meeting_tools/transcribe.js ${cli.meetingId} --poll-only`);
  process.exit(0);
}

if (!options.rebuildOnly) {
  await pollUntilComplete(state, paths.statePath, tokenProvider, config, currentKeys, { once: options.pollOnce });
}

const completed = items.filter((item) => state.tracks[item.key]?.done && !state.tracks[item.key]?.error);
if (completed.length !== items.length) {
  console.log(`Completed ${completed.length}/${items.length} chunks. Run with --poll-only later to finish.`);
  process.exit(0);
}

await writeTranscriptOutputs(items, state, paths, cli.meetingId, infoText, config);
console.log(`Wrote ${relative(paths.combinedPath)}`);
console.log(`Wrote ${relative(paths.transcriptJsonPath)}`);
console.log("Done.");

async function submitItems(items, state, paths, config, tokenProvider, options) {
  const accessToken = await tokenProvider.get();

  for (const item of items) {
    const entry = ensureStateEntry(state, item);

    if (options.repairKey === item.key) {
      await uploadRepair(item, entry, paths, config, accessToken);
    }

    if (!entry.gcsUri || (options.force && !options.resubmitOnly)) {
      await uploadChunk(item, entry, config, accessToken);
      await writeState(paths.statePath, state);
    }

    if (!entry.operationName || options.force || options.resubmitOnly) {
      if (!entry.gcsUri) {
        throw new Error(`Cannot resubmit ${item.key} because it has no GCS URI yet. Run without --resubmit-only once.`);
      }

      console.log(`Submitting ${config.modeLabel} job for ${item.fileName}...`);
      entry.operationName = await submitBatchRecognize(entry.gcsUri, config, accessToken);
      entry.submittedAt = new Date().toISOString();
      entry.processingStrategy = config.processingStrategy;
      entry.done = false;
      delete entry.error;
      delete entry.text;
      delete entry.segments;
      delete entry.rawResponse;
      delete entry.completedAt;
      await writeState(paths.statePath, state);
      console.log(`Operation: ${entry.operationName}`);
    }
  }
}

function ensureStateEntry(state, item) {
  if (!state.tracks[item.key]) {
    state.tracks[item.key] = {
      meetingId: cli.meetingId,
      speaker: item.speaker,
      sourceFile: path.relative(repoRoot, item.sourcePath),
      chunkFile: path.relative(repoRoot, item.path),
      chunkIndex: item.chunkIndex,
      chunkCount: item.chunkCount,
      offsetSeconds: item.offsetSeconds,
    };
  }

  return state.tracks[item.key];
}

async function uploadRepair(item, entry, paths, config, accessToken) {
  const repaired = await createRepairedWav(item, paths.workDir);
  const objectName = `${config.objectPrefix}/${cli.meetingId}/${item.key}-repaired.wav`;
  const gcsUri = `gs://${config.bucket}/${objectName}`;
  console.log(`Uploading repaired ${item.fileName} -> ${gcsUri}`);
  await uploadToGcs(repaired.path, config.bucket, objectName, accessToken, "audio/wav");
  entry.gcsUri = gcsUri;
  entry.chunkFile = path.relative(repoRoot, repaired.path);
  entry.repaired = true;
  await writeState(paths.statePath, state);
}

async function uploadChunk(item, entry, config, accessToken) {
  const objectName = `${config.objectPrefix}/${cli.meetingId}/${item.key}.flac`;
  const gcsUri = `gs://${config.bucket}/${objectName}`;
  console.log(`Uploading ${item.fileName} -> ${gcsUri}`);
  await uploadToGcs(item.path, config.bucket, objectName, accessToken, "audio/flac");
  entry.gcsUri = gcsUri;
}

async function writeTranscriptOutputs(items, state, paths, meetingId, infoText, config) {
  const results = groupTranscriptResults(items, state, {
    chunkSeconds: config.chunkSeconds,
    meetingId,
  });

  for (const result of results) {
    await fs.writeFile(path.join(paths.transcriptDir, `${result.trackKey}.json`), `${JSON.stringify(result, null, 2)}\n`);
    await fs.writeFile(path.join(paths.transcriptDir, `${result.trackKey}.md`), renderTrackMarkdown(result, config));
  }

  await fs.writeFile(paths.combinedPath, renderCombinedMarkdown(meetingId, infoText, results));
  await fs.writeFile(
    paths.transcriptJsonPath,
    `${JSON.stringify({ meetingId, provider: "gcp-speech-v2-batch", processingStrategy: config.processingStrategy, info: infoText, tracks: results }, null, 2)}\n`
  );
}

function filterItems(items, onlyKey) {
  if (!onlyKey) return items;

  const filtered = items.filter((item) => item.key === onlyKey || item.trackKey === onlyKey);
  if (filtered.length === 0) {
    throw new Error(`No recognition chunks matched --only=${onlyKey}.`);
  }

  console.log(`Filtered chunks with --only=${onlyKey}: ${filtered.length}`);
  return filtered;
}

function printMeetingInfo(meetingId, config, audioDir, tracks) {
  console.log(`Meeting: ${meetingId}`);
  console.log(`Mode: GCP Speech-to-Text V2 ${config.modeLabel}`);
  console.log(`Audio folder: ${relative(audioDir)}`);
  console.log(`Model: ${config.model}`);
  console.log(`Language: ${config.languageCode}`);
  console.log(`Endpoint: ${config.speechEndpoint}`);
  console.log(`Tracks: ${tracks.length}`);
  for (const track of tracks) {
    console.log(`- ${track.fileName} (${formatBytes(track.size)})`);
  }
}

function printUsage() {
  console.log(`Usage:
  node scripts/meeting_tools/transcribe.js <meeting-id> [--force] [--dry-run] [--submit-only] [--poll-only] [--poll-once] [--resubmit-only] [--rebuild-only] [--only=<chunk-or-track>] [--repair=<chunk>]

Examples:
  node scripts/meeting_tools/transcribe.js 260505 --dry-run
  node scripts/meeting_tools/transcribe.js 260505 --submit-only
  node scripts/meeting_tools/transcribe.js 260505 --poll-only
  node scripts/meeting_tools/transcribe.js 260505 --poll-only --poll-once
  node scripts/meeting_tools/transcribe.js 260505 --rebuild-only
  node scripts/meeting_tools/transcribe.js 260505 --resubmit-only --submit-only
  node scripts/meeting_tools/transcribe.js 260505 --only=1-142spp-900s-chunk-004 --resubmit-only --submit-only
  node scripts/meeting_tools/transcribe.js 260505 --only=1-142spp-900s-chunk-004 --repair=1-142spp-900s-chunk-004 --resubmit-only --submit-only`);
}
