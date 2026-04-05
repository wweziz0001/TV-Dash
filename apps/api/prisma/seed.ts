import bcrypt from "bcryptjs";
import {
  ChannelSourceMode,
  EpgSourceType,
  LayoutType,
  PrismaClient,
  StreamPlaybackMode,
  UserRole,
} from "@prisma/client";

const prisma = new PrismaClient();

const groups = [
  { name: "الاخبار", slug: "newsroom", sortOrder: 1 },
];

const channels = [
  {
    name: "المسيرة",
    slug: "almasirah-tv",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/%D8%B4%D8%B9%D8%A7%D8%B1_%D9%82%D9%86%D8%A7%D8%A9_%D8%A7%D9%84%D9%85%D8%B3%D9%8A%D8%B1%D8%A9.svg/250px-%D8%B4%D8%B9%D8%A7%D8%B1_%D9%82%D9%86%D8%A7%D8%A9_%D8%A7%D9%84%D9%85%D8%B3%D9%8A%D8%B1%D8%A9.svg.png",
    masterHlsUrl: "https://live.cdnbridge.tv/Almasirah/Almasirah_all/playlist.m3u8",
    groupSlug: "newsroom",
    sortOrder: 1,
  },
  {
    name: "المسيرة مباشر",
    slug: "almasirah-mubasher",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/%D8%B4%D8%B9%D8%A7%D8%B1_%D9%82%D9%86%D8%A7%D8%A9_%D8%A7%D9%84%D9%85%D8%B3%D9%8A%D8%B1%D8%A9.svg/250px-%D8%B4%D8%B9%D8%A7%D8%B1_%D9%82%D9%86%D8%A7%D8%A9_%D8%A7%D9%84%D9%85%D8%B3%D9%8A%D8%B1%D8%A9.svg.png",
    masterHlsUrl: "https://live2.cdnbridge.tv/AlmasirahMubasher/Mubasher_All/playlist.m3u8",
    groupSlug: "newsroom",
    sortOrder: 2,
  },
  {
    name: "الميادين",
    slug: "almayadeen-tv",
    logoUrl: "https://placehold.co/160x90/1e1b4b/a5b4fc?text=Cinema",
    masterHlsUrl: "https://mdnlv.cdn.octivid.com/almdn/smil:mpegts.stream.smil/playlist.m3u8",
    groupSlug: "newsroom",
    sortOrder: 3,
  },
  {
    name: "الجزيرة",
    slug: "aljazeera-tv",
    logoUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACIAAAA4CAMAAACv1NoNAAAAY1BMVEX////RmgDSnQDQlwDPlAD79/D06dTp0aPu27j9+/jr1av69Or8+fTeuGf169np0KDiwX7nzJfw38DasE7y5czdtV7lx4zcs1ffu27jxIX48OLVpCLXqDHYqjvUoRXYrELLigBXun8pAAACxElEQVQ4jZ1V2ZLbMAwjKdmWfB/xHSv7/19ZUEm3212nnqkeMo4MkSAB0UT/sXp/hXD9ZZDHJaIYriHhGmKTS4xZLyGL2a4gG+9XkNpIdQEZKHDzT4QfkMrc3r5vxjoBE8fyrvLUiJBNiVa+v4EkLKZuBUoPvJyyOCRzTZ5qBC/sTiA5y0BjR4YfWjoXPyEFG+fsRKEzUDs7p1M2dpmIqTVgMvL0E7Ed1q3ZJkSVyYhA/TuitVKTrTu13QNapuZbKie2VcoUWq0OzGk1X4UoZyNoGclU22jvm4Uldi4/EbWY2Cpn/WKeW/dOu91+IljpYSFJ3L3lNI3kYa9Xc0oxaCXo9zZpLDY3aNDNdKSleekwagw9fFSkdioYOs/tzB0YR8lrMxJ1+mC3FCw9b1FRkZFK08V+aMIOedqDWtTaqp8GCRJgnUUiRwQhTQpGAaT01mcc5PDsUby22Krsm/7D86sRi3BLm9469XFiX/dmqqhkNFifcz1XGRwYkaMEttdod0dlIPehkCKLDsbTqj/Wj6yNAbSsnFrp0cd+irphstqNDAUav7FusDC4IsOGTR/rBaGO5cj3Jp3jFeCUJjNRCqerrjQrpDCov773mAidiHJPvCKe/pYo695qPIfqKslj1QXyZbG2PnKmhzabHU7t+RKdFgT65AZvD5l1YwBJ2Xstqi/V/ZOotYVXakSiTao6HY4aUWpc1sY8Spbogc47Dk+pu0js1lA0y2wyeY3ECUo9fXcbI8WVDo7UMp6mzGULq9ovY3IMNtS4qSnXtHCuBUgA4vcQyWIZfZAOTtrpLihGF38Znkdo3AoVNhTjidlv+dR2f30v/I7IQesoau0bna1WDExEPkiqA+ZsuMA31MHxzEXDFSXZ+dD08Ol0Q/fR2vyjPMU4vc+LiOr37tOG+YF+mZMR9mc1asCLT0mSN+8n9/v1Cx9RIGRkXcCjAAAAAElFTkSuQmCC",
    masterHlsUrl: "https://live-hls-web-aja-gcp.thehlive.com/AJA/index.m3u8",
    groupSlug: "newsroom",
    sortOrder: 4,
  },
  {
    name: "العالم",
    slug: "alalam-tv",
    logoUrl: "https://placehold.co/160x90/1f2937/93c5fd?text=Variants",
    masterHlsUrl: null,
    groupSlug: "newsroom",
    sortOrder: 5,
    sourceMode: ChannelSourceMode.MANUAL_VARIANTS,
    manualVariants: [
      {
        label: "288p",
        sortOrder: 3,
        playlistUrl: "https://live2.alalam.ir/live/Alalam_low/index.m3u8",
        height: 288,
      },
      {
        label: "360p",
        sortOrder: 2,
        playlistUrl: "https://live2.alalam.ir/live/Alalam_medium/index.m3u8",
        height: 360,
      },
      {
        label: "480p",
        sortOrder: 1,
        playlistUrl: "https://live2.alalam.ir/live/Alalam_high/index.m3u8",
        height: 480,
      },
      {
        label: "576p",
        sortOrder: 0,
        playlistUrl: "https://live2.alalam.ir/live/Alalam/index.m3u8",
        height: 576,
      },      
    ],
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

  const demoEpgSource = await prisma.epgSource.upsert({
    where: { slug: "demo-xmltv" },
    update: {
      name: "Demo XMLTV",
      sourceType: EpgSourceType.XMLTV_URL,
      url: "https://example.com/demo.xml",
      isActive: false,
      refreshIntervalMinutes: 360,
    },
    create: {
      name: "Demo XMLTV",
      slug: "demo-xmltv",
      sourceType: EpgSourceType.XMLTV_URL,
      url: "https://example.com/demo.xml",
      isActive: false,
      refreshIntervalMinutes: 360,
    },
  });

  const createdChannels = [];

  for (const channel of channels) {
    const record = await prisma.channel.upsert({
      where: { slug: channel.slug },
      update: {
        name: channel.name,
        logoUrl: channel.logoUrl,
        sourceMode: channel.sourceMode ?? ChannelSourceMode.MASTER_PLAYLIST,
        masterHlsUrl: channel.masterHlsUrl,
        playbackMode: channel.slug === "pulse-24" ? StreamPlaybackMode.PROXY : StreamPlaybackMode.DIRECT,
        groupId: groupMap.get(channel.groupSlug) ?? null,
        isActive: true,
        sortOrder: channel.sortOrder,
        qualityVariants: {
          deleteMany: {},
          create: channel.manualVariants ?? [],
        },
      },
      create: {
        name: channel.name,
        slug: channel.slug,
        logoUrl: channel.logoUrl,
        sourceMode: channel.sourceMode ?? ChannelSourceMode.MASTER_PLAYLIST,
        masterHlsUrl: channel.masterHlsUrl,
        playbackMode: channel.slug === "pulse-24" ? StreamPlaybackMode.PROXY : StreamPlaybackMode.DIRECT,
        groupId: groupMap.get(channel.groupSlug) ?? null,
        isActive: true,
        sortOrder: channel.sortOrder,
        qualityVariants: channel.manualVariants
          ? {
              create: channel.manualVariants,
            }
          : undefined,
      },
    });
    createdChannels.push(record);
  }

  const favoriteChannel = createdChannels[0];

  const tvDashLiveChannel = createdChannels.find((channel) => channel.slug === "tv-dash-live");

  if (tvDashLiveChannel) {
    const demoSourceChannel = await prisma.epgSourceChannel.upsert({
      where: {
        sourceId_externalId: {
          sourceId: demoEpgSource.id,
          externalId: "tv-dash-live",
        },
      },
      update: {
        displayName: "TV Dash Live",
        displayNames: ["TV Dash Live"],
        isAvailable: true,
      },
      create: {
        sourceId: demoEpgSource.id,
        externalId: "tv-dash-live",
        displayName: "TV Dash Live",
        displayNames: ["TV Dash Live"],
        isAvailable: true,
      },
    });

    await prisma.epgChannelMapping.upsert({
      where: {
        channelId: tvDashLiveChannel.id,
      },
      update: {
        sourceChannelId: demoSourceChannel.id,
      },
      create: {
        channelId: tvDashLiveChannel.id,
        sourceChannelId: demoSourceChannel.id,
      },
    });
  }

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
