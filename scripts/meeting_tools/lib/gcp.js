import fs from "node:fs/promises";
import crypto from "node:crypto";
import https from "node:https";
import path from "node:path";
import { sleep } from "./common.js";
import { extractFileError, extractTimedSegments, extractTranscript, writeState } from "./transcripts.js";

export function buildGcpConfig(env = process.env) {
  const config = {
    projectId: env.GOOGLE_CLOUD_PROJECT,
    bucket: normalizeBucketName(env.GCP_STT_BUCKET),
    location: env.GCP_STT_LOCATION || "asia-northeast1",
    model: env.GCP_STT_MODEL || "chirp_3",
    languageCode: env.GCP_STT_LANGUAGE || "ko-KR",
    objectPrefix: env.GCP_STT_INPUT_PREFIX || "capstone-meetings",
    chunkSeconds: Number(env.GCP_STT_CHUNK_SECONDS || 900),
    processingStrategy: (env.GCP_STT_PROCESSING_STRATEGY || "standard").toLowerCase(),
    pollIntervalSeconds: Number(env.GCP_STT_POLL_INTERVAL_SECONDS || 60),
    maxWaitHours: Number(env.GCP_STT_MAX_WAIT_HOURS || 24),
  };

  config.speechEndpoint = env.GCP_STT_ENDPOINT || speechEndpointForLocation(config.location);
  config.modeLabel = config.processingStrategy === "dynamic" ? "Dynamic Batch" : "Standard Batch";
  return config;
}

export function validateGcpConfig(options, env = process.env) {
  const missing = [];
  if (!options.projectId) missing.push("GOOGLE_CLOUD_PROJECT");
  if (!options.bucket) missing.push("GCP_STT_BUCKET");
  if (!env.GCP_ACCESS_TOKEN && !env.GOOGLE_APPLICATION_CREDENTIALS && !env.GCP_SERVICE_ACCOUNT_KEY_JSON) {
    missing.push("GCP_ACCESS_TOKEN or GOOGLE_APPLICATION_CREDENTIALS or GCP_SERVICE_ACCOUNT_KEY_JSON");
  }

  if (missing.length > 0) {
    throw new Error(`Missing GCP configuration: ${missing.join(", ")}. Add them to scripts/meeting_tools/.env.`);
  }

  if (!["standard", "dynamic"].includes(options.processingStrategy)) {
    throw new Error("GCP_STT_PROCESSING_STRATEGY must be either standard or dynamic.");
  }
}

export async function uploadToGcs(filePath, bucket, objectName, accessToken, contentType) {
  const url = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o`);
  url.searchParams.set("uploadType", "media");
  url.searchParams.set("name", objectName);

  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": contentType,
    },
    body: await fs.readFile(filePath),
  });

  await assertOk(response, `GCS upload failed for ${filePath}`);
}

export async function submitBatchRecognize(gcsUri, options, accessToken) {
  const recognizer = `projects/${options.projectId}/locations/${options.location}/recognizers/_`;
  const url = `${options.speechEndpoint}/v2/${recognizer}:batchRecognize`;
  const body = {
    config: {
      autoDecodingConfig: {},
      languageCodes: [options.languageCode],
      model: options.model,
      features: {
        enableWordTimeOffsets: true,
        enableAutomaticPunctuation: true,
      },
    },
    files: [{ uri: gcsUri }],
    recognitionOutputConfig: {
      inlineResponseConfig: {},
    },
  };

  if (options.processingStrategy === "dynamic") {
    body.processingStrategy = "DYNAMIC_BATCHING";
  }

  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await assertOk(response, `${options.modeLabel} submit failed for ${gcsUri}`);
  if (!payload.name) {
    throw new Error(`${options.modeLabel} submit response did not include an operation name for ${gcsUri}.`);
  }

  return payload.name;
}

export async function pollUntilComplete(state, stateFile, tokenProvider, options, currentKeys, pollOptions = {}) {
  const deadline = Date.now() + options.maxWaitHours * 60 * 60 * 1000;

  while (Date.now() < deadline) {
    let stillPending = 0;
    const accessToken = await tokenProvider.get();

    for (const [key, entry] of Object.entries(state.tracks)) {
      if (!currentKeys.has(key)) continue;
      if (entry.done && entry.text) continue;
      if (!entry.operationName) continue;

      console.log(`Polling ${key}...`);
      const operation = await getOperation(entry.operationName, options, accessToken);

      if (!operation.done) {
        stillPending += 1;
        continue;
      }

      if (operation.error) {
        entry.done = true;
        entry.error = operation.error;
        await writeState(stateFile, state);
        throw new Error(`GCP operation failed for ${key}: ${operation.error.message || JSON.stringify(operation.error)}`);
      }

      entry.done = true;
      entry.completedAt = new Date().toISOString();
      const fileError = extractFileError(operation.response, entry.gcsUri);
      if (fileError) {
        entry.error = fileError;
        await writeState(stateFile, state);
        throw new Error(`GCP file failed for ${key}: ${fileError.message || JSON.stringify(fileError)}`);
      }

      entry.segments = extractTimedSegments(operation.response, entry.gcsUri, entry.offsetSeconds || 0, options.chunkSeconds);
      entry.text = entry.segments.map((segment) => segment.text).join("\n").trim() || extractTranscript(operation.response, entry.gcsUri);
      entry.rawResponse = operation.response;
      await writeState(stateFile, state);
      console.log(`Completed ${key}`);
    }

    if (stillPending === 0) return;
    if (pollOptions.once) {
      console.log(`Still pending: ${stillPending} chunk(s).`);
      return;
    }

    console.log(`Waiting ${options.pollIntervalSeconds}s for BatchRecognize jobs...`);
    await sleep(options.pollIntervalSeconds * 1000);
  }

  throw new Error(`Timed out after ${options.maxWaitHours}h while waiting for BatchRecognize operations.`);
}

export function createAccessTokenProvider(env = process.env) {
  let cached = null;

  return {
    async get() {
      if (env.GCP_ACCESS_TOKEN) return env.GCP_ACCESS_TOKEN;
      if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

      const credentials = await loadServiceAccountCredentials(env);
      const assertion = createJwtAssertion(credentials);
      const body = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      });

      const response = await fetchWithRetryOrCurl("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });

      const payload = await assertOk(response, "Failed to mint Google OAuth access token");
      cached = {
        token: payload.access_token,
        expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
      };
      return cached.token;
    },
  };
}

async function getOperation(operationName, options, accessToken) {
  const response = await fetchWithRetry(`${options.speechEndpoint}/v2/${operationName}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return assertOk(response, `Failed to poll operation ${operationName}`);
}

async function loadServiceAccountCredentials(env) {
  if (env.GCP_SERVICE_ACCOUNT_KEY_JSON) {
    return JSON.parse(env.GCP_SERVICE_ACCOUNT_KEY_JSON);
  }

  const credentialsPath = env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) {
    throw new Error("Missing GOOGLE_APPLICATION_CREDENTIALS or GCP_SERVICE_ACCOUNT_KEY_JSON.");
  }

  return JSON.parse(await fs.readFile(path.resolve(credentialsPath), "utf8"));
}

function createJwtAssertion(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(credentials.private_key);
  return `${unsigned}.${base64Url(signature)}`;
}

async function assertOk(response, context) {
  const text = await response.text();
  const payload = text ? parseJson(text) : {};

  if (!response.ok) {
    const message = payload.error?.message || payload.error_description || text || response.statusText;
    throw new Error(`${context}: ${message}`);
  }

  return payload;
}

async function fetchWithRetry(url, options, retries = 4) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === retries) {
        return response;
      }

      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
    }

    const waitMs = Math.min(30_000, 1000 * 2 ** attempt);
    console.log(`Network request failed, retrying in ${Math.round(waitMs / 1000)}s...`);
    await sleep(waitMs);
  }

  throw lastError || new Error("Network request failed.");
}

async function fetchWithRetryOrCurl(url, options) {
  try {
    return await fetchWithRetry(url, options);
  } catch (error) {
    if (!shouldUseHttpsFallback(error)) throw error;
    console.log("Node fetch failed for Google OAuth, retrying with Node HTTPS over IPv4...");
    return fetchWithNodeHttps(url, options);
  }
}

function shouldUseHttpsFallback(error) {
  return error?.message === "fetch failed" || error?.cause?.code === "ETIMEDOUT";
}

function fetchWithNodeHttps(url, options) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: options.method || "GET",
        headers: options.headers || {},
        family: 4,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          resolve(
            new Response(Buffer.concat(chunks), {
              status: response.statusCode || 0,
              statusText: response.statusMessage || "",
              headers: response.headers,
            })
          );
        });
      }
    );

    request.setTimeout(90_000, () => request.destroy(new Error("Google OAuth HTTPS fallback timed out.")));
    request.on("error", reject);
    if (options.body) request.write(options.body.toString());
    request.end();
  });
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

function normalizeBucketName(bucket) {
  return bucket?.replace(/^gs:\/\//, "").replace(/\/.*$/, "");
}

function speechEndpointForLocation(location) {
  if (!location || location === "global") return "https://speech.googleapis.com";
  return `https://${location}-speech.googleapis.com`;
}

function base64UrlJson(value) {
  return base64Url(Buffer.from(JSON.stringify(value)));
}

function base64Url(value) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
