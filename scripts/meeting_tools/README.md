# Meeting Tools

Discord 멀티트랙 회의 녹음 폴더를 전사하고 요약하는 자동화 스크립트입니다.

## 준비

1. `.env.example`을 복사해 `.env`를 만듭니다.
2. GCP 프로젝트, 버킷, 서비스 계정 경로를 채웁니다.
3. FLAC 트랙을 청크로 나누려면 `ffmpeg`를 설치합니다.

```bash
cp .env.example .env
```

## GCP Speech-to-Text로 전사 생성

GCP Speech-to-Text V2 Dynamic Batch는 Cloud Storage에 있는 오디오 파일만 처리합니다. Craig에서 `Multi-track FLAC`으로 받은 파일을 `meetings/audio/<회의ID>`에 넣고 실행하세요.

`.env`에 아래 값을 채웁니다.

```env
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GCP_STT_BUCKET=your-gcs-bucket-name
GCP_STT_LOCATION=asia-northeast1
GCP_STT_MODEL=chirp_3
GCP_STT_LANGUAGE=ko-KR
GCP_STT_PROCESSING_STRATEGY=standard
GCP_STT_CHUNK_SECONDS=900
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account-key.json
```

`GCP_STT_LOCATION`을 `asia-northeast1`, `us`, `eu`처럼 `global`이 아닌 값으로 두면 스크립트가 자동으로 `https://<location>-speech.googleapis.com` 엔드포인트를 사용합니다.

시간 정보가 포함된 GCP BatchRecognize는 파일 하나가 20분을 넘으면 실패할 수 있으므로, 스크립트는 `ffmpeg`로 FLAC 트랙을 기본 15분 단위 청크로 나눈 뒤 업로드합니다.
`GCP_STT_PROCESSING_STRATEGY=standard`는 더 빠른 일반 batch이고, `dynamic`은 더 저렴하지만 처리 대기 시간이 길어질 수 있습니다.

루트 폴더 기준:

```bash
node scripts/meeting_tools/transcribe.js 260505
```

작업 제출만 하고 나중에 받기:

```bash
node scripts/meeting_tools/transcribe.js 260505 --submit-only
node scripts/meeting_tools/transcribe.js 260505 --poll-only
```

이미 GCS에 업로드된 청크를 재사용하고 Speech-to-Text 작업만 다시 제출하기:

```bash
node scripts/meeting_tools/transcribe.js 260505 --resubmit-only --submit-only
```

출력:

- `meetings/transcripts/260505/*.md`: 트랙별 전사
- `meetings/transcripts/260505/combined.md`: 전체 전사 묶음
- `meetings/transcripts/260505/transcript.json`: 기계 처리용 결과
- `meetings/transcripts/260505/gcp-dynamic-state.json`: GCP 작업 상태 저장

## Gemini API로 요약 생성

GCP 크레딧을 쓰기 위해 일반 Gemini API 키가 아니라 Vertex AI Gemini `generateContent`를 사용합니다. 기존 Speech-to-Text 서비스 계정 인증을 그대로 재사용할 수 있습니다.

`.env`에 아래 값을 추가하거나 기본값을 사용합니다.

```env
GCP_GEMINI_LOCATION=us-central1
GCP_GEMINI_MODEL=gemini-2.5-flash
GCP_GEMINI_TEMPERATURE=0.2
GCP_GEMINI_MAX_OUTPUT_TOKENS=8192
```

처음 쓰는 프로젝트라면 Google Cloud 콘솔에서 Vertex AI API(`aiplatform.googleapis.com`)를 활성화하고, 서비스 계정에 Vertex AI 호출 권한이 있어야 합니다.

루트 폴더 기준:

```bash
node scripts/meeting_tools/summarize.js 260505
```

기존 요약을 덮어쓰기:

```bash
node scripts/meeting_tools/summarize.js 260505 --force
```

입력은 기본적으로 `meetings/transcripts/<회의ID>/combined.md`이고, 출력은 `meetings/summaries/<회의ID>.md`입니다.

## 입력과 출력

입력:

- `meetings/audio/260505/*.flac`
- `meetings/audio/260505/info.txt`

출력:

- `meetings/transcripts/260505/*.md`: 트랙별 전사
- `meetings/transcripts/260505/combined.md`: 전체 전사 묶음
- `meetings/transcripts/260505/transcript.json`: 기계 처리용 결과
- `meetings/summaries/260505.md`: 회의 요약, 결정사항, 액션 아이템

## 옵션

```bash
node scripts/meeting_tools/transcribe.js 260505 --dry-run
node scripts/meeting_tools/transcribe.js 260505 --submit-only
node scripts/meeting_tools/transcribe.js 260505 --poll-only
node scripts/meeting_tools/summarize.js 260505 --force
node scripts/meeting_tools/summarize.js 260505 --dry-run
```

- `--dry-run`: 실제 API 호출 없이 처리 대상만 확인합니다.
- `--submit-only`: GCP 전사 작업을 제출만 하고 종료합니다.
- `--poll-only`: 이미 제출한 GCP 전사 작업 결과만 확인합니다.
- `--force`: 기존 Gemini 요약 파일이 있어도 다시 생성합니다.

## 코드 구조

- `transcribe.js`: GCP 전사 CLI 흐름 제어
- `summarize.js`: Gemini 요약 CLI 흐름 제어
- `lib/common.js`: 경로, `.env`, CLI 인자, 파일 유틸
- `lib/audio.js`: GCP용 FLAC 트랙 탐색, 청크 생성, repair WAV 생성
- `lib/gcp.js`: GCP 인증, GCS 업로드, Speech-to-Text 제출/poll
- `lib/transcripts.js`: GCP 응답 파싱, 시간대 보정, transcript 렌더링
- `lib/vertex-gemini.js`: Vertex AI Gemini 요약 API 호출
