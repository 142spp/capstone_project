import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  ensureDirectory,
  getMeetingPaths,
  installErrorHandlers,
  loadDefaultEnv,
  parseCliArgs,
  relative,
  repoRoot,
} from "./lib/common.js";
import { createAccessTokenProvider } from "./lib/gcp.js";
import {
  buildVertexGeminiConfig,
  summarizeTranscriptWithGemini,
  validateVertexGeminiConfig,
} from "./lib/vertex-gemini.js";

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
};
const paths = getMeetingPaths(cli.meetingId, "gemini-summary");
const transcriptPath = cli.value("input")
  ? path.resolve(cli.value("input"))
  : paths.combinedPath;
const summaryPath = cli.value("output")
  ? path.resolve(cli.value("output"))
  : path.join(repoRoot, "meetings", "summaries", `${cli.meetingId}.md`);
const config = buildVertexGeminiConfig();

printRunInfo(cli.meetingId, transcriptPath, summaryPath, config);

if (!existsSync(transcriptPath)) {
  throw new Error(`Transcript not found: ${relative(transcriptPath)}. Run GCP transcription first.`);
}

if (!options.force && existsSync(summaryPath)) {
  console.log(`Skipping existing summary: ${relative(summaryPath)}`);
  console.log("Use --force to regenerate it.");
  process.exit(0);
}

if (options.dryRun) {
  console.log("Dry run complete. No API calls were made.");
  process.exit(0);
}

validateVertexGeminiConfig(config);

await ensureDirectory(path.dirname(summaryPath));

const transcriptMarkdown = await fs.readFile(transcriptPath, "utf8");
console.log("Summarizing transcript with Gemini...");
const summary = await summarizeTranscriptWithGemini(transcriptMarkdown, {
  config,
  meetingId: cli.meetingId,
  tokenProvider: createAccessTokenProvider(),
});

await fs.writeFile(summaryPath, summary);
console.log(`Wrote ${relative(summaryPath)}`);
console.log("Done.");

function printRunInfo(meetingId, transcriptPath, summaryPath, config) {
  console.log(`Meeting: ${meetingId}`);
  console.log("Mode: Vertex AI Gemini summary");
  console.log(`Model: ${config.model}`);
  console.log(`Location: ${config.location}`);
  console.log(`Transcript: ${relative(transcriptPath)}`);
  console.log(`Output: ${relative(summaryPath)}`);
}

function printUsage() {
  console.log(`Usage:
  node scripts/meeting_tools/summarize.js <meeting-id> [--force] [--dry-run]

Options:
  --input=<path>    Use a custom transcript markdown file
  --output=<path>   Use a custom summary output path
  --force           Regenerate even if the summary already exists
  --dry-run         Print configuration without calling Gemini

Example:
  node scripts/meeting_tools/summarize.js 260505 --force`);
}
