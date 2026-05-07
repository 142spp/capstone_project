# Capstone Project Workspace

졸업과제 운영 도구, 자동화 스크립트, 회의록 자료를 한 곳에서 관리하는 작업 폴더입니다.

## 폴더 구조

- `scripts/discord_bot`: 3명 팀용 Discord 서버 채널/역할 자동 생성
- `scripts/notion_bot`: Notion 졸업과제 홈, 일정, 할 일, 회의록, 자료, 산출물 DB 자동 생성
- `scripts/meeting_tools`: Discord 멀티트랙 회의 음성 전사와 요약 자동 생성
- `meetings/audio`: 회의 녹음 원본 파일 보관
- `meetings/transcripts`: 음성 파일을 텍스트로 변환한 원문 보관
- `meetings/summaries`: 회의 요약본, 결정사항, 액션 아이템 보관
- `docs`: 기획서, 요구사항, 발표 자료 같은 문서 보관
- `scripts`: Discord 봇, Notion 봇, 회의록 처리 같은 자동화 스크립트 보관

## 사용 흐름

1. `scripts/discord_bot/.env.example`, `scripts/notion_bot/.env.example`을 복사해 각각 `.env`를 만듭니다.
2. 각 폴더의 README를 보고 필요한 토큰과 ID를 채웁니다.
3. 봇 세팅은 각 폴더에서 `npm install`, `npm run setup`으로 실행합니다.
4. 회의 음성 파일은 `meetings/audio`에 저장하고, 변환 원문과 요약본은 각각 `meetings/transcripts`, `meetings/summaries`에 저장합니다.
5. GCP Dynamic Batch로 회의 전사만 만들 때는 `node scripts/meeting_tools/transcribe.js 260505`처럼 실행합니다.
6. GCP Gemini로 요약본을 만들 때는 `node scripts/meeting_tools/summarize.js 260505`처럼 실행합니다.

민감한 토큰과 대용량 회의 파일은 기본적으로 git에 올리지 않도록 루트 `.gitignore`에 등록해 두었습니다.
