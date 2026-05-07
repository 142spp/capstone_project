import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

export const execFileAsync = promisify(execFile);
export const toolDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = path.resolve(toolDir, "../..");

export function installErrorHandlers() {
  process.on("uncaughtException", exitWithError);
  process.on("unhandledRejection", exitWithError);
}

export function exitWithError(error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
}

export async function loadDefaultEnv() {
  await loadEnvFile(path.join(repoRoot, ".env"));
  await loadEnvFile(path.join(toolDir, ".env"));
}

export async function loadEnvFile(envPath) {
  if (!existsSync(envPath)) return;

  const content = await fs.readFile(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const [key, ...valueParts] = trimmed.split("=");
    if (process.env[key]) continue;

    const rawValue = valueParts.join("=").trim();
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

export function getMeetingPaths(meetingId, namespace = "gcp-dynamic") {
  const audioDir = path.join(repoRoot, "meetings", "audio", meetingId);
  const transcriptDir = path.join(repoRoot, "meetings", "transcripts", meetingId);

  return {
    audioDir,
    combinedPath: path.join(transcriptDir, "combined.md"),
    infoPath: path.join(audioDir, "info.txt"),
    statePath: path.join(transcriptDir, "gcp-dynamic-state.json"),
    transcriptDir,
    transcriptJsonPath: path.join(transcriptDir, "transcript.json"),
    workDir: path.join(repoRoot, ".tmp", "meeting_tools", namespace, meetingId),
  };
}

export async function ensureDirectory(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function readOptionalText(filePath) {
  if (!existsSync(filePath)) return "";
  return fs.readFile(filePath, "utf8");
}

export async function findExecutable(name) {
  const command = process.platform === "win32" ? "where" : "which";
  try {
    const { stdout } = await execFileAsync(command, [name]);
    return stdout.split(/\r?\n/).find(Boolean) || null;
  } catch {
    return null;
  }
}

export async function listFiles(dir, extension) {
  if (!existsSync(dir)) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(extension))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

export function formatBytes(bytes) {
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(1)}MB`;
}

export function relative(filePath) {
  return path.relative(repoRoot, filePath) || ".";
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function speakerNameFromTrack(fileName) {
  return stripExtension(fileName).replace(/^\d+-/, "");
}

export function stripExtension(fileName) {
  return fileName.replace(/\.[^.]+$/, "");
}

export function parseCliArgs(args) {
  const flags = new Set(args.filter((arg) => arg.startsWith("--") && !arg.includes("=")));
  const values = new Map(
    args
      .filter((arg) => arg.startsWith("--") && arg.includes("="))
      .map((arg) => {
        const index = arg.indexOf("=");
        return [arg.slice(2, index), arg.slice(index + 1)];
      })
  );

  return {
    meetingId: args.find((arg) => !arg.startsWith("--")),
    flag: (name) => flags.has(`--${name}`),
    value: (name) => values.get(name),
  };
}
