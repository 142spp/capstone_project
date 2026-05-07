import 'dotenv/config';
import {
  ChannelType,
  Client,
  GatewayIntentBits,
  PermissionsBitField,
} from 'discord.js';

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;

if (!token) {
  console.error('Missing DISCORD_TOKEN. Add it to .env first.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const roleSpecs = [
  { name: '팀장', color: 0x2f80ed, hoist: true },
  { name: '팀원', color: 0x27ae60 },
];

const serverPlan = [
  {
    category: '📌 운영',
    channels: [
      {
        name: '공지사항',
        topic: '중요 일정과 결정 사항만 올리는 채널입니다.',
        lockedToLeader: true,
        template: [
          '# 공지사항',
          '중요 일정, 결정 사항, 제출 안내를 짧게 정리합니다.',
          '',
          '- 변경 사항은 날짜와 함께 남겨주세요',
          '- 확인이 필요한 내용은 팀원을 멘션해주세요',
        ].join('\n'),
      },
      {
        name: '일정',
        topic: '회의, 발표, 제출 마감 일정을 정리합니다.',
        template: [
          '# 일정',
          '- YYYY-MM-DD HH:mm / 내용 / 담당자',
          '- 예: 2026-05-10 20:00 / 주간 회의 / 전체',
        ].join('\n'),
      },
      {
        name: '회의록',
        topic: '회의 내용을 날짜별로 정리합니다.',
        template: [
          '# 회의록 양식',
          '- 날짜:',
          '- 참석자:',
          '- 결정한 것:',
          '- 다음 할 일:',
        ].join('\n'),
      },
      { name: '전체-채팅', topic: '팀 전체 소통 채널입니다.' },
    ],
  },
  {
    category: '🛠 작업',
    channels: [
      { name: '작업-공유', topic: '진행 상황, 막힌 부분, 할 일을 공유합니다.' },
      {
        name: '자료-링크',
        topic: '과제 관련 링크, 문서, 참고 자료를 모읍니다.',
        template: [
          '# 자료 링크',
          '- 과제 명세:',
          '- GitHub:',
          '- 디자인/화면 설계:',
          '- 발표 자료:',
          '- 참고 링크:',
        ].join('\n'),
      },
      { name: '개발', topic: '개발 진행 상황, PR, 기술 이슈를 공유합니다.' },
      { name: '발표준비', topic: '발표 자료, 대본, 시연 순서를 준비합니다.' },
    ],
  },
  {
    category: '📦 제출',
    channels: [
      {
        name: '최종제출',
        topic: '최종 제출 파일과 제출 확인 내용을 모읍니다.',
        lockedToLeader: true,
        template: [
          '# 최종제출',
          '- 제출 파일:',
          '- 제출 링크:',
          '- 제출 여부:',
          '- 확인한 사람:',
        ].join('\n'),
      },
      { name: '산출물', topic: '보고서, 발표자료, 시연영상 등 제출물을 버전별로 모읍니다.' },
    ],
  },
];

function writableByLeaderOnly(guild, roles) {
  return [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.SendMessages],
    },
    {
      id: roles.get('팀장').id,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
    },
  ];
}

async function pickGuild() {
  await client.guilds.fetch();

  if (guildId) {
    return client.guilds.fetch(guildId);
  }

  const guilds = [...client.guilds.cache.values()];
  if (guilds.length === 1) {
    return guilds[0].fetch();
  }

  throw new Error(
    `GUILD_ID is required because the bot is in ${guilds.length} servers.`,
  );
}

async function ensureRoles(guild) {
  await guild.roles.fetch();
  const roles = new Map();

  for (const spec of roleSpecs) {
    const existing = guild.roles.cache.find((role) => role.name === spec.name);
    if (existing) {
      roles.set(spec.name, existing);
      console.log(`Role exists: ${spec.name}`);
      continue;
    }

    const created = await guild.roles.create({
      name: spec.name,
      color: spec.color,
      hoist: Boolean(spec.hoist),
      mentionable: true,
      reason: 'Graduation project server setup',
    });
    roles.set(spec.name, created);
    console.log(`Role created: ${spec.name}`);
  }

  return roles;
}

async function ensureCategory(guild, name, permissionOverwrites) {
  const existing = guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildCategory && channel.name === name,
  );

  if (existing) {
    console.log(`Category exists: ${name}`);
    return existing;
  }

  const created = await guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
    permissionOverwrites,
    reason: 'Graduation project server setup',
  });
  console.log(`Category created: ${name}`);
  return created;
}

async function ensureTextChannel(guild, category, spec, permissionOverwrites) {
  const existing = guild.channels.cache.find(
    (channel) =>
      channel.type === ChannelType.GuildText &&
      channel.name === spec.name &&
      channel.parentId === category.id,
  );

  if (existing) {
    if (spec.topic && existing.topic !== spec.topic) {
      await existing.setTopic(spec.topic);
    }
    console.log(`Channel exists: #${spec.name}`);
    return existing;
  }

  const created = await guild.channels.create({
    name: spec.name,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: spec.topic,
    permissionOverwrites,
    reason: 'Graduation project server setup',
  });
  console.log(`Channel created: #${spec.name}`);
  return created;
}

async function sendTemplateOnce(channel, template) {
  if (!template) {
    return;
  }

  const messages = await channel.messages.fetch({ limit: 20 });
  const alreadyPosted = messages.some((message) => message.author.id === client.user.id);
  if (alreadyPosted) {
    return;
  }

  await channel.send(template);
  console.log(`Template posted: #${channel.name}`);
}

async function setupServer() {
  const guild = await pickGuild();
  console.log(`Setting up server: ${guild.name}`);

  await guild.channels.fetch();
  const roles = await ensureRoles(guild);

  for (const categorySpec of serverPlan) {
    const category = await ensureCategory(guild, categorySpec.category);

    for (const channelSpec of categorySpec.channels) {
      const channelPermissions = channelSpec.lockedToLeader
        ? writableByLeaderOnly(guild, roles)
        : undefined;

      const channel = await ensureTextChannel(guild, category, channelSpec, channelPermissions);
      await sendTemplateOnce(channel, channelSpec.template);
    }
  }

  console.log('Done. Graduation project server setup is complete.');
}

client.once('ready', async () => {
  try {
    await setupServer();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.destroy();
  }
});

client.login(token);
