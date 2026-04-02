import bcrypt from "bcryptjs";
import { PrismaClient, LayoutType, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

const groups = [
  { name: "Newsroom", slug: "newsroom", sortOrder: 1 },
  { name: "Sports Desk", slug: "sports-desk", sortOrder: 2 },
  { name: "Feature Films", slug: "feature-films", sortOrder: 3 },
];

const channels = [
  {
    name: "TV Dash Live",
    slug: "tv-dash-live",
    logoUrl: "https://placehold.co/160x90/0f172a/67e8f9?text=TV+Dash",
    masterHlsUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    groupSlug: "newsroom",
    sortOrder: 1,
  },
  {
    name: "Match Center",
    slug: "match-center",
    logoUrl: "https://placehold.co/160x90/111827/f59e0b?text=Match",
    masterHlsUrl: "https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8",
    groupSlug: "sports-desk",
    sortOrder: 2,
  },
  {
    name: "Cinema One",
    slug: "cinema-one",
    logoUrl: "https://placehold.co/160x90/1e1b4b/a5b4fc?text=Cinema",
    masterHlsUrl: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
    groupSlug: "feature-films",
    sortOrder: 3,
  },
  {
    name: "Pulse 24",
    slug: "pulse-24",
    logoUrl: "https://placehold.co/160x90/082f49/7dd3fc?text=Pulse",
    masterHlsUrl: "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8",
    groupSlug: "newsroom",
    sortOrder: 4,
  },
];

async function main() {
  const passwordHash = await bcrypt.hash("Admin123!", 10);
  const viewerPasswordHash = await bcrypt.hash("Viewer123!", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@tvdash.local" },
    update: {
      username: "admin",
      passwordHash,
      role: UserRole.ADMIN,
    },
    create: {
      email: "admin@tvdash.local",
      username: "admin",
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

  const viewer = await prisma.user.upsert({
    where: { email: "viewer@tvdash.local" },
    update: {
      username: "viewer",
      passwordHash: viewerPasswordHash,
      role: UserRole.USER,
    },
    create: {
      email: "viewer@tvdash.local",
      username: "viewer",
      passwordHash: viewerPasswordHash,
      role: UserRole.USER,
    },
  });

  const groupMap = new Map<string, string>();

  for (const group of groups) {
    const record = await prisma.channelGroup.upsert({
      where: { slug: group.slug },
      update: group,
      create: group,
    });
    groupMap.set(group.slug, record.id);
  }

  const createdChannels = [];

  for (const channel of channels) {
    const record = await prisma.channel.upsert({
      where: { slug: channel.slug },
      update: {
        name: channel.name,
        logoUrl: channel.logoUrl,
        masterHlsUrl: channel.masterHlsUrl,
        groupId: groupMap.get(channel.groupSlug) ?? null,
        isActive: true,
        sortOrder: channel.sortOrder,
      },
      create: {
        name: channel.name,
        slug: channel.slug,
        logoUrl: channel.logoUrl,
        masterHlsUrl: channel.masterHlsUrl,
        groupId: groupMap.get(channel.groupSlug) ?? null,
        isActive: true,
        sortOrder: channel.sortOrder,
      },
    });
    createdChannels.push(record);
  }

  const favoriteChannel = createdChannels[0];

  if (favoriteChannel) {
    await prisma.favorite.upsert({
      where: {
        userId_channelId: {
          userId: viewer.id,
          channelId: favoriteChannel.id,
        },
      },
      update: {},
      create: {
        userId: viewer.id,
        channelId: favoriteChannel.id,
      },
    });
  }

  await prisma.savedLayout.upsert({
    where: { id: "2a4d1335-c13b-4c44-b15d-6538d780ecf0" },
    update: {
      name: "Ops Quad",
      layoutType: LayoutType.LAYOUT_2X2,
      configJson: { focusIndex: 0 },
      items: {
        deleteMany: {},
        create: createdChannels.slice(0, 4).map((channel, index) => ({
          tileIndex: index,
          channelId: channel.id,
          preferredQuality: index === 0 ? "AUTO" : "LOWEST",
          isMuted: index !== 0,
        })),
      },
    },
    create: {
      id: "2a4d1335-c13b-4c44-b15d-6538d780ecf0",
      userId: admin.id,
      name: "Ops Quad",
      layoutType: LayoutType.LAYOUT_2X2,
      configJson: { focusIndex: 0 },
      items: {
        create: createdChannels.slice(0, 4).map((channel, index) => ({
          tileIndex: index,
          channelId: channel.id,
          preferredQuality: index === 0 ? "AUTO" : "LOWEST",
          isMuted: index !== 0,
        })),
      },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

