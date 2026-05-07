import 'dotenv/config';
import { Client } from '@notionhq/client';

const notionToken = process.env.NOTION_TOKEN;
const parentPageId = normalizePageId(process.env.NOTION_PARENT_PAGE_ID);
const homeTitle = process.env.NOTION_HOME_TITLE || '졸업과제 홈';
const storageTitle = '데이터 저장소';

if (!notionToken) {
  console.error('Missing NOTION_TOKEN. Add it to .env first.');
  process.exit(1);
}

if (!parentPageId) {
  console.error('Missing NOTION_PARENT_PAGE_ID. Add it to .env first.');
  process.exit(1);
}

const notion = new Client({ auth: notionToken });
const notionApiVersion = '2026-03-11';

const databasePlans = [
  {
    title: '일정',
    properties: {
      이름: { title: {} },
      날짜: { date: {} },
      종류: {
        select: {
          options: [
            { name: '회의', color: 'blue' },
            { name: '발표', color: 'purple' },
            { name: '제출', color: 'red' },
            { name: '개발', color: 'green' },
          ],
        },
      },
      담당자: { rich_text: {} },
      완료: { checkbox: {} },
    },
    samples: [
      {
        이름: titleProperty('킥오프 회의'),
        날짜: dateProperty(daysFromToday(1)),
        종류: selectProperty('회의'),
        담당자: richTextProperty('전체'),
      },
      {
        이름: titleProperty('중간 점검'),
        날짜: dateProperty(daysFromToday(14)),
        종류: selectProperty('발표'),
        담당자: richTextProperty('전체'),
      },
      {
        이름: titleProperty('최종 제출'),
        날짜: dateProperty(daysFromToday(35)),
        종류: selectProperty('제출'),
        담당자: richTextProperty('팀장'),
      },
    ],
  },
  {
    title: '할 일',
    properties: {
      작업: { title: {} },
      상태: {
        select: {
          options: [
            { name: '해야 함', color: 'gray' },
            { name: '진행 중', color: 'yellow' },
            { name: '완료', color: 'green' },
          ],
        },
      },
      담당자: { rich_text: {} },
      마감일: { date: {} },
      우선순위: {
        select: {
          options: [
            { name: '높음', color: 'red' },
            { name: '보통', color: 'yellow' },
            { name: '낮음', color: 'gray' },
          ],
        },
      },
    },
    samples: [
      {
        작업: titleProperty('주제와 목표 한 문장으로 정리'),
        상태: selectProperty('해야 함'),
        담당자: richTextProperty('팀장'),
        마감일: dateProperty(daysFromToday(2)),
        우선순위: selectProperty('높음'),
      },
      {
        작업: titleProperty('GitHub 저장소 만들고 README 초안 작성'),
        상태: selectProperty('해야 함'),
        담당자: richTextProperty('팀원 1'),
        마감일: dateProperty(daysFromToday(3)),
        우선순위: selectProperty('보통'),
      },
      {
        작업: titleProperty('발표 자료 목차 잡기'),
        상태: selectProperty('해야 함'),
        담당자: richTextProperty('팀원 2'),
        마감일: dateProperty(daysFromToday(5)),
        우선순위: selectProperty('보통'),
      },
    ],
  },
  {
    title: '회의록',
    properties: {
      회의명: { title: {} },
      날짜: { date: {} },
      참석자: { rich_text: {} },
      결정사항: { rich_text: {} },
      다음할일: { rich_text: {} },
    },
    samples: [
      {
        회의명: titleProperty('킥오프 회의록'),
        날짜: dateProperty(daysFromToday(1)),
        참석자: richTextProperty('팀장, 팀원 1, 팀원 2'),
        결정사항: richTextProperty('주제 후보를 좁히고 이번 주 역할을 나눕니다.'),
        다음할일: richTextProperty('각자 주제 후보 1개와 구현 범위 조사'),
      },
    ],
  },
  {
    title: '자료 링크',
    properties: {
      제목: { title: {} },
      URL: { url: {} },
      분류: {
        select: {
          options: [
            { name: '과제 명세', color: 'blue' },
            { name: 'GitHub', color: 'green' },
            { name: '디자인', color: 'pink' },
            { name: '발표', color: 'purple' },
            { name: '참고자료', color: 'gray' },
          ],
        },
      },
      메모: { rich_text: {} },
    },
    samples: [
      {
        제목: titleProperty('과제 명세서'),
        URL: { url: null },
        분류: selectProperty('과제 명세'),
        메모: richTextProperty('명세서 링크를 여기에 넣어두세요.'),
      },
      {
        제목: titleProperty('GitHub 저장소'),
        URL: { url: null },
        분류: selectProperty('GitHub'),
        메모: richTextProperty('저장소를 만들면 URL을 채워주세요.'),
      },
    ],
  },
  {
    title: '산출물',
    properties: {
      이름: { title: {} },
      버전: { rich_text: {} },
      상태: {
        select: {
          options: [
            { name: '초안', color: 'gray' },
            { name: '검토 중', color: 'yellow' },
            { name: '완료', color: 'green' },
            { name: '제출 완료', color: 'blue' },
          ],
        },
      },
      마감일: { date: {} },
      제출완료: { checkbox: {} },
      링크: { url: {} },
    },
    samples: [
      {
        이름: titleProperty('요구사항 정의서'),
        버전: richTextProperty('v0.1'),
        상태: selectProperty('초안'),
        마감일: dateProperty(daysFromToday(7)),
      },
      {
        이름: titleProperty('중간 발표 자료'),
        버전: richTextProperty('v0.1'),
        상태: selectProperty('초안'),
        마감일: dateProperty(daysFromToday(14)),
      },
      {
        이름: titleProperty('최종 보고서'),
        버전: richTextProperty('v0.1'),
        상태: selectProperty('초안'),
        마감일: dateProperty(daysFromToday(35)),
      },
    ],
  },
];

function normalizePageId(value) {
  if (!value) {
    return '';
  }

  const match = value.match(/[0-9a-fA-F]{32}/);
  if (match) {
    return match[0];
  }

  return value.replaceAll('-', '').trim();
}

function text(content) {
  return [{ type: 'text', text: { content } }];
}

function titleProperty(content) {
  return { title: text(content) };
}

function richTextProperty(content) {
  return { rich_text: text(content) };
}

function selectProperty(name) {
  return { select: { name } };
}

function dateProperty(start) {
  return { date: { start } };
}

function daysFromToday(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function paragraph(content) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: text(content) },
  };
}

function heading(content) {
  return {
    object: 'block',
    type: 'heading_2',
    heading_2: { rich_text: text(content) },
  };
}

function callout(content, emoji = '📌') {
  return {
    object: 'block',
    type: 'callout',
    callout: {
      rich_text: text(content),
      icon: { type: 'emoji', emoji },
      color: 'gray_background',
    },
  };
}

function divider() {
  return {
    object: 'block',
    type: 'divider',
    divider: {},
  };
}

function bullet(content) {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: text(content) },
  };
}

function todo(content) {
  return {
    object: 'block',
    type: 'to_do',
    to_do: { rich_text: text(content), checked: false },
  };
}

function toggle(content, children) {
  return {
    object: 'block',
    type: 'toggle',
    toggle: {
      rich_text: text(content),
      children,
    },
  };
}

async function notionRequest(path, options = {}) {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${notionToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': notionApiVersion,
      ...options.headers,
    },
  });

  const body = await response.json();
  if (!response.ok) {
    const message = body.message || `${response.status} ${response.statusText}`;
    throw new Error(`Notion API ${path} failed: ${message}`);
  }

  return body;
}

async function listAllChildBlocks(blockId) {
  const blocks = [];
  let cursor;

  do {
    const response = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });

    blocks.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return blocks;
}

async function getOrCreateHomePage() {
  const children = await listAllChildBlocks(parentPageId);
  const existing = children.find(
    (block) => block.type === 'child_page' && block.child_page.title === homeTitle,
  );

  if (existing) {
    console.log(`Home page exists: ${homeTitle}`);
    return existing.id;
  }

  const page = await notion.pages.create({
    parent: { page_id: parentPageId },
    icon: { type: 'emoji', emoji: '🎓' },
    properties: {
      title: {
        title: text(homeTitle),
      },
    },
    children: [
      callout('3명 팀 졸업과제 진행 상황을 한곳에서 관리합니다.', '🎓'),
    ],
  });

  console.log(`Home page created: ${homeTitle}`);
  return page.id;
}

async function ensureDashboardContent(pageId) {
  const children = await listAllChildBlocks(pageId);
  const hasDashboard = children.some(
    (block) =>
      block.type === 'heading_2' &&
      block.heading_2.rich_text.some((item) =>
        item.plain_text.includes('프로젝트 한눈에 보기'),
      ),
  );

  if (hasDashboard) {
    console.log('Dashboard content exists');
    return;
  }

  await notion.blocks.children.append({
    block_id: pageId,
    children: [
      heading('프로젝트 한눈에 보기'),
      callout('오늘 확인할 것: 일정, 진행 중인 할 일, 막힌 이슈, 제출물 상태', '✅'),
      callout('아래 대시보드 뷰에서 일정, 할 일, 회의록, 자료, 산출물을 바로 확인합니다.', '💬'),
      divider(),
      heading('이번 주 운영'),
      todo('이번 주 회의 날짜 확정하기'),
      todo('팀원 3명의 담당 영역 정하기'),
      todo('이번 주 마감 작업 3개만 고르기'),
      heading('팀원 역할 메모'),
      bullet('팀장: 일정 관리, 최종 제출 확인, 교수님/외부 커뮤니케이션'),
      bullet('팀원 1: 핵심 기능 구현, 기술 조사, 개발 기록'),
      bullet('팀원 2: 화면/발표 자료, 테스트, 산출물 정리'),
      heading('회의록 템플릿'),
      paragraph('날짜 / 참석자 / 결정한 것 / 다음 할 일 / 막힌 점 순서로 짧게 남깁니다.'),
      heading('산출물 체크리스트'),
      todo('요구사항 정의서'),
      todo('설계서'),
      todo('중간 발표 자료'),
      todo('최종 보고서'),
      todo('시연 영상 또는 시연 링크'),
      divider(),
      heading('대시보드 뷰'),
      paragraph('일정, 할 일, 회의록, 자료, 산출물이 이 아래에 펼쳐집니다. 원본 DB는 데이터 저장소 페이지에 보관됩니다.'),
    ],
  });

  console.log('Dashboard content added');
}

async function getOrCreateStoragePage(homePageId) {
  const children = await listAllChildBlocks(homePageId);
  const existing = children.find(
    (block) => block.type === 'child_page' && block.child_page.title === storageTitle,
  );

  if (existing) {
    console.log(`Storage page exists: ${storageTitle}`);
    return existing.id;
  }

  const page = await notion.pages.create({
    parent: { page_id: homePageId },
    icon: { type: 'emoji', emoji: '🗄️' },
    properties: {
      title: {
        title: text(storageTitle),
      },
    },
    children: [
      callout('이 페이지는 대시보드에서 쓰는 원본 데이터베이스를 보관합니다.', '🗄️'),
      paragraph('평소에는 졸업과제 홈에서 링크드 뷰로 확인하면 됩니다.'),
    ],
  });

  console.log(`Storage page created: ${storageTitle}`);
  return page.id;
}

async function getExistingDatabases(pageIds) {
  const entries = [];

  for (const pageId of pageIds) {
    const children = await listAllChildBlocks(pageId);
    entries.push(
      ...children
        .filter((block) => block.type === 'child_database')
        .map((block) => [block.child_database.title, block.id]),
    );
  }

  return new Map(entries);
}

async function getExistingHomeDatabaseBlocks(pageId) {
  const children = await listAllChildBlocks(pageId);
  return new Set(
    children
      .filter((block) => block.type === 'child_database')
      .map((block) => block.child_database.title),
  );
}

async function ensureDatabase(pageId, existingDatabases, plan) {
  if (existingDatabases.has(plan.title)) {
    console.log(`Database exists: ${plan.title}`);
    return existingDatabases.get(plan.title);
  }

  const database = await notion.databases.create({
    parent: { page_id: pageId },
    title: text(plan.title),
    properties: plan.properties,
  });

  console.log(`Database created: ${plan.title}`);
  return database.id;
}

async function getDatabaseDataSourceId(databaseId) {
  const database = await notionRequest(`/databases/${databaseId}`);
  const dataSource = database.data_sources?.[0];

  if (!dataSource?.id) {
    throw new Error(`Could not find data source for database ${databaseId}`);
  }

  return dataSource.id;
}

function viewConfig(plan) {
  return plan.title === '할 일'
    ? { type: 'table', sorts: [{ property: '마감일', direction: 'ascending' }] }
    : { type: 'table' };
}

async function ensureDashboardView(homePageId, existingHomeBlocks, databaseId, plan) {
  const viewName = `${plan.title} 대시보드`;
  if (existingHomeBlocks.has(viewName)) {
    console.log(`Dashboard view exists: ${viewName}`);
    return;
  }

  const dataSourceId = await getDatabaseDataSourceId(databaseId);
  const config = viewConfig(plan);

  await notionRequest('/views', {
    method: 'POST',
    body: JSON.stringify({
      create_database: {
        parent: {
          type: 'page_id',
          page_id: homePageId,
        },
      },
      data_source_id: dataSourceId,
      name: viewName,
      type: config.type,
      sorts: config.sorts,
    }),
  });

  console.log(`Dashboard view created: ${viewName}`);
}

async function seedDatabase(databaseId, plan) {
  if (!plan.samples?.length) {
    return;
  }

  const existingPages = await notion.databases.query({
    database_id: databaseId,
    page_size: 1,
  });

  if (existingPages.results.length > 0) {
    console.log(`Sample rows skipped: ${plan.title}`);
    return;
  }

  for (const properties of plan.samples) {
    await notion.pages.create({
      parent: { database_id: databaseId },
      properties,
    });
  }

  console.log(`Sample rows added: ${plan.title}`);
}

async function setupNotion() {
  const homePageId = await getOrCreateHomePage();
  await ensureDashboardContent(homePageId);
  const storagePageId = await getOrCreateStoragePage(homePageId);

  const existingDatabases = await getExistingDatabases([homePageId, storagePageId]);
  const databaseIds = new Map();

  for (const plan of databasePlans) {
    const databaseId = await ensureDatabase(storagePageId, existingDatabases, plan);
    databaseIds.set(plan.title, databaseId);
    await seedDatabase(databaseId, plan);
  }

  const existingHomeBlocks = await getExistingHomeDatabaseBlocks(homePageId);
  for (const plan of databasePlans) {
    await ensureDashboardView(homePageId, existingHomeBlocks, databaseIds.get(plan.title), plan);
  }

  console.log('Done. Graduation project Notion setup is complete.');
}

try {
  await setupNotion();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
