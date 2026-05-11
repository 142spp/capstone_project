# Graduation Project Notion Bot

졸업과제용 Notion 페이지/데이터베이스를 세팅하고, 운영 중 생성된 회의 요약본을 회의록 DB에 추가하는 자동화 스크립트입니다.

## 준비

1. Notion에서 Internal Integration을 만들고 Secret을 발급합니다.
2. 자동화할 부모 페이지를 하나 만듭니다.
3. 부모 페이지 오른쪽 상단 메뉴에서 Integration을 연결합니다.
4. `.env.example`을 참고해서 `.env`를 채웁니다.

```env
NOTION_TOKEN=Internal Integration Secret
NOTION_PARENT_PAGE_ID=부모_페이지_ID
NOTION_HOME_TITLE=졸업과제 홈
```

페이지 ID는 Notion 페이지 URL에 들어있는 32자리 문자열입니다. 하이픈이 있어도 되고 없어도 됩니다.

## 워크스페이스 초기 세팅

```bash
npm install
npm run setup
```

직접 실행:

```bash
node setup-notion.js setup
```

## 회의 요약본 추가

`meetings/summaries`에 생성된 Markdown 요약본을 Notion `회의록` 데이터베이스에 새 페이지로 추가합니다.

```bash
npm run add-meeting -- --file=../../meetings/summaries/260505.md --attendees="142spp, gimjuhwan9938, mseoky"
```

옵션:

```bash
node setup-notion.js add-meeting \
  --file=../../meetings/summaries/260505.md \
  --title="260505 회의 요약" \
  --date=2026-05-05 \
  --attendees="142spp, gimjuhwan9938, mseoky"
```

- `--file`: 추가할 Markdown 파일 경로
- `--title`: Notion 회의록 제목. 생략하면 Markdown의 첫 `# 제목`을 사용합니다.
- `--date`: 회의 날짜. 생략하면 제목의 `YYMMDD` 패턴에서 추정합니다.
- `--attendees`: 참석자 문자열
- `--database`: 대상 데이터베이스 이름. 기본값은 `회의록`입니다.

## 생성되는 구조

- `졸업과제 홈` 페이지
  - 프로젝트 한눈에 보기
  - 이번 주 운영 체크리스트
  - 팀원 역할 메모
  - 회의록 템플릿
  - 산출물 체크리스트
  - 대시보드 뷰: 일정, 할 일, 회의록, 자료 링크, 산출물을 홈에서 바로 확인
- `데이터 저장소` 페이지
  - 원본 데이터베이스를 보관하는 페이지
- 데이터베이스:
  - 일정: 킥오프 회의, 중간 점검, 최종 제출 예시 포함
  - 할 일: 초기 작업 3개 예시 포함
  - 회의록: 킥오프 회의록 예시 포함
  - 자료 링크: 과제 명세서, GitHub 저장소 자리 포함
  - 산출물: 요구사항 정의서, 중간 발표 자료, 최종 보고서 예시 포함

`setup`은 같은 부모 페이지 안에 같은 이름의 홈 페이지와 데이터베이스가 있으면 새로 만들지 않고 재사용합니다.
비어 있는 데이터베이스에만 예시 행을 추가하므로, 이미 입력한 데이터는 덮어쓰지 않습니다.
`add-meeting`은 기존 `회의록` 데이터베이스에 새 회의록 페이지를 추가합니다.

## object_not_found 오류

아래 오류가 나오면 부모 페이지가 Integration과 연결되지 않았거나 `NOTION_PARENT_PAGE_ID`가 잘못된 것입니다.

```text
Could not find block with ID ... Make sure the relevant pages and databases are shared with your integration
```

해결 방법:

1. Notion에서 부모 페이지를 엽니다.
2. 오른쪽 위 `...` 메뉴를 누릅니다.
3. `Connections` 또는 `Add connections`에서 Integration을 연결합니다.
4. `.env`의 `NOTION_PARENT_PAGE_ID`가 부모 페이지 URL의 32자리 ID인지 확인합니다.
