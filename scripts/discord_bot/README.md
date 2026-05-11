# Graduation Project Discord Bot

졸업과제용 Discord 서버를 세팅하고, 운영 중 생성된 회의록/공지 파일을 채널에 올리는 자동화 스크립트입니다.

## 준비

1. Discord Developer Portal에서 봇 토큰을 확인합니다.
2. 봇을 서버에 초대할 때 아래 권한을 주세요.
   - Manage Channels
   - Manage Roles
   - Send Messages
   - View Channels
   - Read Message History
3. `.env.example`을 참고해서 `.env`를 채웁니다.

```env
DISCORD_TOKEN=봇_토큰
GUILD_ID=서버_ID
```

`GUILD_ID`는 봇이 서버 1개에만 들어가 있으면 생략해도 됩니다.

## 서버 초기 세팅

```bash
npm install
npm run setup
```

직접 실행:

```bash
node setup-server.js setup
```

## 채널에 파일 또는 메시지 올리기

회의 요약본처럼 로컬에 생성된 Markdown 파일을 Discord 채널에 올릴 수 있습니다. 긴 파일은 Discord 메시지 길이에 맞춰 자동으로 나누어 전송합니다.

```bash
npm run post -- --channel=회의록 --file=../../meetings/summaries/260505.md --title="260505 회의 요약"
```

짧은 공지는 메시지로 바로 보낼 수 있습니다.

```bash
npm run post -- --channel=공지사항 --message="오늘 16:30 IT관 508호 상담입니다."
```

## 생성되는 구조

- 역할: 팀장, 팀원
- 카테고리: 운영, 작업, 제출
- 채널:
  - 운영: 공지사항, 일정, 회의록, 전체-채팅
  - 작업: 작업-공유, 자료-링크, 개발, 발표준비
  - 제출: 최종제출, 산출물
- 주요 권한:
  - 공지사항, 최종제출은 팀장만 작성 가능
  - 나머지 채널은 팀원 모두 작성 가능

`setup`은 같은 이름의 역할, 카테고리, 채널이 있으면 새로 만들지 않고 재사용합니다.
`post`는 이미 존재하는 텍스트 채널을 찾아 메시지를 전송합니다.
