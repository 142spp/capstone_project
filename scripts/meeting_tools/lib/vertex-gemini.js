export function buildVertexGeminiConfig(env = process.env) {
  const location = env.GCP_GEMINI_LOCATION || env.GOOGLE_CLOUD_LOCATION || "us-central1";
  return {
    projectId: env.GOOGLE_CLOUD_PROJECT,
    location,
    model: env.GCP_GEMINI_MODEL || "gemini-2.5-flash",
    temperature: Number(env.GCP_GEMINI_TEMPERATURE || 0.2),
    maxOutputTokens: Number(env.GCP_GEMINI_MAX_OUTPUT_TOKENS || 8192),
    endpoint: env.GCP_GEMINI_ENDPOINT || vertexEndpointForLocation(location),
  };
}

export function validateVertexGeminiConfig(config, env = process.env) {
  const missing = [];
  if (!config.projectId) missing.push("GOOGLE_CLOUD_PROJECT");
  if (!env.GCP_ACCESS_TOKEN && !env.GOOGLE_APPLICATION_CREDENTIALS && !env.GCP_SERVICE_ACCOUNT_KEY_JSON) {
    missing.push("GCP_ACCESS_TOKEN or GOOGLE_APPLICATION_CREDENTIALS or GCP_SERVICE_ACCOUNT_KEY_JSON");
  }

  if (missing.length > 0) {
    throw new Error(`Missing Gemini/GCP configuration: ${missing.join(", ")}. Add them to scripts/meeting_tools/.env.`);
  }
}

export async function summarizeTranscriptWithGemini(transcriptMarkdown, options) {
  const accessToken = await options.tokenProvider.get();
  const url = buildGenerateContentUrl(options.config);
  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildSummaryRequest(transcriptMarkdown, options)),
  });

  const payload = await parseJsonResponse(response, `Gemini summary failed with ${options.config.model}`);
  const summary = extractText(payload);
  validateSummaryMarkdown(summary);
  return summary;
}

function vertexEndpointForLocation(location) {
  if (location === "global") return "https://aiplatform.googleapis.com";
  return `https://${location}-aiplatform.googleapis.com`;
}

function buildGenerateContentUrl(config) {
  const modelPath = `projects/${config.projectId}/locations/${config.location}/publishers/google/models/${config.model}`;
  return `${config.endpoint}/v1/${modelPath}:generateContent`;
}

function buildSummaryRequest(transcriptMarkdown, options) {
  return {
    systemInstruction: {
      parts: [
        {
          text:
            "너는 한국어 졸업과제 팀 회의록을 작성하는 기록 담당자다. 전사 원문에 있는 결정, 근거, 질문, 구매 후보, 일정, 담당자를 빠뜨리지 않고 구조화한다. 원문에 없는 사실은 만들지 말고, 불명확한 내용은 반드시 불확실하다고 표시한다.",
        },
      ],
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: buildSummaryPrompt(options.meetingId, transcriptMarkdown),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: options.config.temperature,
      maxOutputTokens: options.config.maxOutputTokens,
    },
  };
}

function buildSummaryPrompt(meetingId, transcriptMarkdown) {
  return `아래 회의 전사본을 바탕으로 Notion에 바로 붙여넣을 수 있는 상세 회의록을 작성해줘.

목표:
- 단순 요약이 아니라, 회의 후 팀원이 실행할 수 있는 수준의 상세 기록을 만든다.
- 전사본에 나온 논의 흐름, 대안, 우려, 결정, 후속 질문, 구매 후보를 최대한 보존한다.
- 원문이 길어도 중요한 세부사항을 과하게 압축하지 않는다.

작성 규칙:
- 한국어 Markdown으로 작성한다.
- 제목은 반드시 "# ${meetingId} 회의 요약"으로 시작한다.
- 아래 섹션을 이 순서대로 모두 포함한다.
  1. "## 회의 정보"
  2. "## 한줄 요약"
  3. "## 핵심 논의"
  4. "## 결정사항"
  5. "## 액션 아이템"
  6. "## 상담 때 물어볼 질문"
  7. "## 구매/준비 후보"
  8. "## 리스크와 확인 필요 사항"
  9. "## 메모"
- 위 필수 섹션은 내용이 적더라도 절대 생략하지 않는다. 해당 내용이 없으면 "- 없음"이라고 쓴다.
- "## 핵심 논의"는 주제별 하위 제목을 5개 이상 만든다. 예: MCU, 로봇 키트/프레임, 모터/모터 드라이버, 전원/배터리, 센서, 예산/구매 일정.
- 각 핵심 논의 주제에는 "논의 내용", "나온 근거/우려", "남은 확인사항"을 포함한다.
- "## 결정사항"은 확정된 내용만 bullet로 쓴다. 확정이 아닌 것은 결정사항에 넣지 않는다.
- "## 액션 아이템"은 Markdown 표로 작성한다. 컬럼은 반드시 "담당", "할 일", "기한/상태", "근거/비고" 네 개다.
- 액션 아이템 표는 끝까지 완성해야 한다. 표 헤더만 쓰고 멈추면 안 된다.
- 담당자가 명확하지 않으면 "전체"라고 쓴다. 담당자가 전사에서 명확하면 해당 Discord 이름을 쓴다.
- 날짜가 상대 표현(내일, 수요일 등)으로 나오면 회의 날짜를 기준으로 가능한 한 절대 날짜로 바꾼다. 불확실하면 "전사 불확실"을 함께 적는다.
- 부품명, 모델명, 센서명, 예산, 구매 방식, 상담 질문은 사소해 보여도 보존한다.
- 음성 인식 오류로 보이는 단어는 억지로 확정하지 말고 "전사 불확실"로 표시한다.
- 전사에 없는 담당자, 날짜, 결론, 부품 스펙은 추측하지 않는다.
- 출력은 완성된 회의록 본문만 작성한다. "알겠습니다", "아래는" 같은 서론은 쓰지 않는다.

전사본:

${transcriptMarkdown}`;
}

function validateSummaryMarkdown(summary) {
  const requiredHeadings = [
    "# ",
    "## 회의 정보",
    "## 한줄 요약",
    "## 핵심 논의",
    "## 결정사항",
    "## 액션 아이템",
    "## 상담 때 물어볼 질문",
    "## 구매/준비 후보",
    "## 리스크와 확인 필요 사항",
    "## 메모",
  ];
  const missing = requiredHeadings.filter((heading) => !summary.includes(heading));
  if (missing.length > 0) {
    throw new Error(`Gemini summary missed required section(s): ${missing.join(", ")}`);
  }

  if (!summary.includes("| 담당 | 할 일 | 기한/상태 | 근거/비고 |")) {
    throw new Error("Gemini summary missed the required action item table.");
  }
}

function extractText(payload) {
  const parts = payload.candidates?.flatMap((candidate) => candidate.content?.parts || []) || [];
  const text = parts
    .map((part) => part.text)
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error(`Gemini response did not include summary text: ${JSON.stringify(payload)}`);
  }

  return `${text}\n`;
}

async function parseJsonResponse(response, context) {
  const text = await response.text();
  const payload = text ? parseJson(text) : {};

  if (!response.ok) {
    const message = payload.error?.message || text || response.statusText;
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
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  throw lastError || new Error("Network request failed.");
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}
