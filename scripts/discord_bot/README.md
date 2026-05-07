# Graduation Project Discord Bot

3명 팀 기준의 졸업과제용 Discord 서버를 자동으로 세팅하는 스크립트입니다.

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

## 실행

```bash
npm install
npm run setup
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

스크립트는 같은 이름의 역할, 카테고리, 채널이 있으면 새로 만들지 않고 재사용합니다.
