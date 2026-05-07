import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  ensureDirectory,
  execFileAsync,
  findExecutable,
  listFiles,
  relative,
  speakerNameFromTrack,
  stripExtension,
} from "./common.js";

export async function findFlacTracks(dir) {
  if (!existsSync(dir)) {
    throw new Error(`Audio directory does not exist: ${relative(dir)}`);
  }

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const tracks = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".flac")) continue;
    const filePath = path.join(dir, entry.name);
    const stat = await fs.stat(filePath);
    tracks.push({ fileName: entry.name, path: filePath, size: stat.size });
  }

  return tracks.sort((a, b) => a.fileName.localeCompare(b.fileName, "en", { numeric: true }));
}

export async function prepareRecognitionItems(tracks, options) {
  const ffmpegPath = await findExecutable("ffmpeg");
  if (!ffmpegPath) {
    throw new Error("ffmpeg is required because GCP BatchRecognize supports short audio chunks. Install ffmpeg and retry.");
  }

  const items = [];

  for (const track of tracks) {
    const trackKey = stripExtension(track.fileName);
    const chunkProfile = `${options.chunkSeconds}s`;
    const outputDir = path.join(options.workDir, chunkProfile, trackKey);
    await ensureDirectory(outputDir);

    let chunks = options.force ? [] : await listFiles(outputDir, ".flac");
    if (chunks.length === 0) {
      console.log(`Splitting ${track.fileName} into ${Math.floor(options.chunkSeconds / 60)} minute chunks...`);
      const outputPattern = path.join(outputDir, "chunk-%03d.flac");
      await execFileAsync(ffmpegPath, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        track.path,
        "-vn",
        "-ac",
        "1",
        "-f",
        "segment",
        "-segment_time",
        String(options.chunkSeconds),
        "-reset_timestamps",
        "1",
        outputPattern,
      ]);
      chunks = await listFiles(outputDir, ".flac");
    }

    if (chunks.length === 0) {
      throw new Error(`No chunks were created for ${track.fileName}.`);
    }

    chunks.forEach((chunkPath, index) => {
      const chunkName = `${trackKey}-${chunkProfile}-chunk-${String(index + 1).padStart(3, "0")}`;
      items.push({
        key: chunkName,
        trackKey,
        speaker: speakerNameFromTrack(track.fileName),
        sourcePath: track.path,
        path: chunkPath,
        fileName: `${chunkName}.flac`,
        chunkIndex: index + 1,
        chunkCount: chunks.length,
        offsetSeconds: index * options.chunkSeconds,
      });
    });
  }

  console.log(`Recognition chunks: ${items.length}`);
  return items;
}

export async function createRepairedWav(item, workDir) {
  const ffmpegPath = await findExecutable("ffmpeg");
  if (!ffmpegPath) {
    throw new Error("ffmpeg is required to repair an audio chunk.");
  }

  const outputDir = path.join(workDir, "repair", item.key);
  const outputPath = path.join(outputDir, "repaired.wav");
  await ensureDirectory(outputDir);

  console.log(`Repairing ${item.key} as 16kHz mono WAV...`);
  await execFileAsync(ffmpegPath, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    item.path,
    "-map",
    "0:a:0",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-sample_fmt",
    "s16",
    "-fflags",
    "+genpts",
    "-avoid_negative_ts",
    "make_zero",
    outputPath,
  ]);

  return { path: outputPath };
}
