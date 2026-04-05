import type {
  EpgChannelMappingInput,
  EpgSourceFileImportInput,
  EpgSourceInput,
  ProgramEntryInput,
} from "@tv-dash/shared";
import {
  sanitizeUrl,
  summarizeUpstreamRequestConfig,
  writeStructuredLog,
} from "../../app/structured-log.js";
import { buildUpstreamHeaders, normalizeUpstreamHeaders } from "../../app/upstream-request.js";
import { getChannelsForEpgLookup } from "../channels/channel.service.js";
import {
  recordChannelGuideStatus,
  recordEpgCacheState,
  recordEpgObservation,
} from "../diagnostics/diagnostic.service.js";
import {
  getRecordingPlaybackAccessForViewer,
  listRecordingCatchupCandidatesForViewer,
} from "../recordings/recording.service.js";
import { getChannelTimeshiftCatchupWindow } from "../streams/timeshift-buffer.js";
import {
  createEpgSource,
  createManualProgram,
  deleteEpgSource,
  deleteManualProgram,
  findEpgSourceById,
  findEpgSourceImportConfigById,
  findManualProgramById,
  findProgramEntryById,
  findOverlappingManualPrograms,
  listEpgSourceChannels,
  listEpgSources,
  listImportedProgramsForSourceChannels,
  listManualPrograms,
  listManualProgramsForChannels,
  markEpgSourceImportFailure,
  replaceImportedGuideData,
  updateEpgSource,
  updateManualProgram,
  upsertEpgChannelMapping,
} from "./epg.repository.js";
import { classifyEpgFailure } from "./epg-diagnostics.js";
import { getNowNextProgrammes, resolveGuideProgrammes, type GuideProgramRecord } from "./guide-resolver.js";
import {
  resolveProgramCatchupSummary,
  type ProgramCatchupSummary,
} from "./program-catchup.js";
import { parseXmltvDocument } from "./xmltv-parser.js";

type EpgSourceImportConfig = Awaited<ReturnType<typeof findEpgSourceImportConfigById>>;
type EpgSourceSummaryLike = {
  id: string;
  name: string;
  slug: string;
  sourceType: "XMLTV_URL" | "XMLTV_FILE";
  url: string | null;
  uploadedFileName: string | null;
  isActive: boolean;
  refreshIntervalMinutes: number | null;
  requestUserAgent: string | null;
  requestReferrer: string | null;
  requestHeaders: unknown;
  lastImportStartedAt: Date | null;
  lastImportedAt: Date | null;
  lastImportStatus: "NEVER_IMPORTED" | "SUCCEEDED" | "FAILED";
  lastImportMessage: string | null;
  lastImportChannelCount: number | null;
  lastImportProgramCount: number | null;
  sourceChannels: Array<{
    isAvailable?: boolean;
    mapping?: { id: string } | null;
  }>;
  _count: {
    importedPrograms: number;
  };
  createdAt: Date;
  updatedAt: Date;
};

interface EpgViewer {
  id: string;
  role: "ADMIN" | "USER";
  username: string;
}

function countMappedSourceChannels(
  sourceChannels:
    | Array<{
        isAvailable?: boolean;
        mapping?: {
          id: string;
        } | null;
      }>
    | undefined,
) {
  return (sourceChannels ?? []).filter((channel) => Boolean(channel.mapping)).length;
}

function countAvailableSourceChannels(
  sourceChannels:
    | Array<{
        isAvailable?: boolean;
      }>
    | undefined,
) {
  return (sourceChannels ?? []).filter((channel) => channel.isAvailable).length;
}

function mapEpgSource(source: EpgSourceSummaryLike | null) {
  if (!source) {
    return null;
  }

  return {
    id: source.id,
    name: source.name,
    slug: source.slug,
    sourceType: source.sourceType,
    url: source.url ?? null,
    uploadedFileName: source.uploadedFileName ?? null,
    isActive: source.isActive,
    refreshIntervalMinutes: source.refreshIntervalMinutes ?? null,
    requestUserAgent: source.requestUserAgent ?? null,
    requestReferrer: source.requestReferrer ?? null,
    requestHeaders: normalizeUpstreamHeaders(source.requestHeaders),
    lastImportStartedAt: source.lastImportStartedAt?.toISOString() ?? null,
    lastImportedAt: source.lastImportedAt?.toISOString() ?? null,
    lastImportStatus: source.lastImportStatus,
    lastImportMessage: source.lastImportMessage ?? null,
    lastImportChannelCount: source.lastImportChannelCount ?? null,
    lastImportProgramCount: source.lastImportProgramCount ?? null,
    sourceChannelCount: source.sourceChannels.length,
    availableChannelCount: countAvailableSourceChannels(source.sourceChannels),
    mappedChannelCount: countMappedSourceChannels(source.sourceChannels),
    importedProgramCount: source._count.importedPrograms,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
  };
}

function mapSourceChannel(channel: Awaited<ReturnType<typeof listEpgSourceChannels>>[number]) {
  const rawDisplayNames = Array.isArray(channel.displayNames)
    ? channel.displayNames
    : typeof channel.displayNames === "string"
      ? [channel.displayNames]
      : [];

  return {
    id: channel.id,
    externalId: channel.externalId,
    displayName: channel.displayName,
    displayNames: rawDisplayNames.filter((value): value is string => typeof value === "string"),
    iconUrl: channel.iconUrl ?? null,
    isAvailable: channel.isAvailable,
    lastSeenAt: channel.lastSeenAt?.toISOString() ?? null,
    source: channel.source,
    mapping: channel.mapping
      ? {
          id: channel.mapping.id,
          channel: channel.mapping.channel,
        }
      : null,
  };
}

function mapProgramEntry(programme:
  Awaited<ReturnType<typeof listManualPrograms>>[number] |
  Awaited<ReturnType<typeof findManualProgramById>>
) {
  if (!programme) {
    return null;
  }

  return {
    id: programme.id,
    sourceKind: programme.sourceKind,
    channelId: programme.channelId,
    title: programme.title,
    subtitle: programme.subtitle ?? null,
    description: programme.description ?? null,
    category: programme.category ?? null,
    imageUrl: programme.imageUrl ?? null,
    startAt: programme.startAt.toISOString(),
    endAt: programme.endAt?.toISOString() ?? null,
    createdAt: programme.createdAt.toISOString(),
    updatedAt: programme.updatedAt.toISOString(),
    channel: programme.channel
      ? {
          id: programme.channel.id,
          name: programme.channel.name,
          slug: programme.channel.slug,
          isActive: programme.channel.isActive,
        }
      : null,
  };
}

async function fetchXmltvFromUrl(source: NonNullable<EpgSourceImportConfig>) {
  if (!source.url) {
    throw new Error("XMLTV URL source is missing its URL");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: buildUpstreamHeaders(
        {
          requestUserAgent: source.requestUserAgent,
          requestReferrer: source.requestReferrer,
          requestHeaders: normalizeUpstreamHeaders(source.requestHeaders),
        },
        { defaultUserAgent: "TV-Dash/0.1 XMLTV" },
      ),
    });

    if (!response.ok) {
      throw new Error(`EPG upstream returned ${response.status}`);
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function importXmltvDocumentForSource(params: {
  source: NonNullable<EpgSourceImportConfig>;
  xmlContent: string;
  uploadedFileName?: string | null;
  observationSource: "XMLTV_LOAD";
}) {
  const importedAt = new Date();

  try {
    const document = parseXmltvDocument(params.xmlContent);
    const importedSource = await replaceImportedGuideData({
      sourceId: params.source.id,
      uploadedFileName: params.uploadedFileName ?? null,
      importedAt,
      channels: document.channels.map((channel) => ({
        externalId: channel.id,
        displayName: channel.displayNames[0] ?? channel.id,
        displayNames: channel.displayNames,
        iconUrl: channel.iconUrl,
      })),
      programmes: document.programmes.map((programme) => ({
        sourceChannelExternalId: programme.channelId,
        externalProgramId: programme.externalId,
        title: programme.title,
        subtitle: programme.subtitle,
        description: programme.description,
        category: programme.category,
        imageUrl: programme.imageUrl,
        startAt: programme.start,
        endAt: programme.stop,
      })),
    });

    recordEpgObservation(params.source.id, "fetch", {
      status: "success",
      source: params.observationSource,
      detail: {
        sourceType: params.source.sourceType,
        sourceUrl: params.source.url ? sanitizeUrl(params.source.url) : null,
      },
    });
    recordEpgObservation(params.source.id, "parse", {
      status: "success",
      source: params.observationSource,
      detail: {
        channelCount: document.channels.length,
        programmeCount: document.programmes.length,
      },
    });
    recordEpgCacheState({
      sourceId: params.source.id,
      expiresAt:
        params.source.sourceType === "XMLTV_URL" && params.source.refreshIntervalMinutes
          ? new Date(importedAt.getTime() + params.source.refreshIntervalMinutes * 60_000)
          : importedAt,
      channelCount: document.channels.length,
      programmeCount: document.programmes.length,
    });

    writeStructuredLog("info", {
      event: "epg.import.succeeded",
      epgSourceId: params.source.id,
      detail: {
        sourceType: params.source.sourceType,
        channelCount: document.channels.length,
        programmeCount: document.programmes.length,
        uploadedFileName: params.uploadedFileName ?? null,
      },
    });

    return mapEpgSource(importedSource);
  } catch (error) {
    const classification = classifyEpgFailure(error);
    const message = error instanceof Error ? error.message : "Unable to import XMLTV";

    await markEpgSourceImportFailure(params.source.id, message, importedAt);
    recordEpgObservation(params.source.id, classification.failureKind === "epg-parse" ? "parse" : "fetch", {
      status: "failure",
      source: params.observationSource,
      reason: classification.message,
      failureKind: classification.failureKind,
      retryable: classification.retryable,
      detail: {
        sourceType: params.source.sourceType,
        sourceUrl: params.source.url ? sanitizeUrl(params.source.url) : null,
        uploadedFileName: params.uploadedFileName ?? null,
      },
    });
    writeStructuredLog(classification.failureKind === "epg-parse" ? "error" : "warn", {
      event: "epg.import.failed",
      epgSourceId: params.source.id,
      failureKind: classification.failureKind,
      retryable: classification.retryable,
      statusCode: classification.statusCode,
      detail: {
        sourceType: params.source.sourceType,
        sourceUrl: params.source.url ? sanitizeUrl(params.source.url) : null,
        uploadedFileName: params.uploadedFileName ?? null,
        ...summarizeUpstreamRequestConfig({
          requestUserAgent: params.source.requestUserAgent,
          requestReferrer: params.source.requestReferrer,
          requestHeaders: normalizeUpstreamHeaders(params.source.requestHeaders),
        }),
      },
    });
    throw error;
  }
}

function buildTimeshiftPlaybackUrl(channelId: string) {
  return `/api/streams/channels/${channelId}/timeshift/master`;
}

function mapGuideProgram(programme: GuideProgramRecord, catchup?: ProgramCatchupSummary | null) {
  return {
    id: programme.id,
    sourceKind: programme.sourceKind,
    title: programme.title,
    subtitle: programme.subtitle,
    description: programme.description,
    category: programme.category,
    imageUrl: programme.imageUrl,
    start: programme.startAt.toISOString(),
    stop: programme.endAt?.toISOString() ?? null,
    catchup: catchup ?? null,
  };
}

function asGuideProgramRecord(programme: {
  id: string;
  sourceKind: "IMPORTED" | "MANUAL";
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string | null;
  imageUrl: string | null;
  startAt: Date;
  endAt: Date | null;
}) {
  return {
    id: programme.id,
    sourceKind: programme.sourceKind,
    title: programme.title,
    subtitle: programme.subtitle,
    description: programme.description,
    category: programme.category,
    imageUrl: programme.imageUrl,
    startAt: programme.startAt,
    endAt: programme.endAt,
  } satisfies GuideProgramRecord;
}

async function assertNoManualProgrammeOverlap(payload: ProgramEntryInput, excludeId?: string) {
  const overlapping = await findOverlappingManualPrograms({
    channelId: payload.channelId,
    startAt: new Date(payload.startAt),
    endAt: new Date(payload.endAt),
    excludeId,
  });

  if (overlapping.length > 0) {
    throw new Error("Manual programme overlaps an existing manual entry on this channel");
  }
}

async function getResolvedGuideDataForChannels(
  channelIds: string[],
  range: {
    rangeStart: Date;
    rangeEnd: Date;
  },
) {
  const channels = await getChannelsForEpgLookup(channelIds);
  const manualPrograms = await listManualProgramsForChannels(channelIds, range.rangeStart, range.rangeEnd);
  const sourceChannelIds = channels
    .map((channel) => channel.epgMapping?.sourceChannel?.id)
    .filter((value): value is string => Boolean(value));
  const importedPrograms =
    sourceChannelIds.length > 0
      ? await listImportedProgramsForSourceChannels(sourceChannelIds, range.rangeStart, range.rangeEnd)
      : [];

  const manualProgramsByChannelId = new Map<string, GuideProgramRecord[]>();
  const importedProgramsBySourceChannelId = new Map<string, GuideProgramRecord[]>();

  for (const programme of manualPrograms) {
    const list = manualProgramsByChannelId.get(programme.channelId ?? "");
    const record = asGuideProgramRecord(programme);

    if (list) {
      list.push(record);
      continue;
    }

    manualProgramsByChannelId.set(programme.channelId ?? "", [record]);
  }

  for (const programme of importedPrograms) {
    const list = importedProgramsBySourceChannelId.get(programme.sourceChannelId ?? "");
    const record = asGuideProgramRecord(programme);

    if (list) {
      list.push(record);
      continue;
    }

    importedProgramsBySourceChannelId.set(programme.sourceChannelId ?? "", [record]);
  }

  return channels.map((channel) => {
    const mapping = channel.epgMapping?.sourceChannel ?? null;
    const manual = manualProgramsByChannelId.get(channel.id) ?? [];
    const imported = mapping ? importedProgramsBySourceChannelId.get(mapping.id) ?? [] : [];
    const resolved = resolveGuideProgrammes({
      imported,
      manual,
    });

    return {
      channel,
      manual,
      imported,
      resolved,
    };
  });
}

async function resolveGuideCatchupSummaries(params: {
  viewer: EpgViewer;
  channelId: string;
  programmes: GuideProgramRecord[];
  now: Date;
}) {
  const completedProgrammes = params.programmes.filter((programme) => programme.endAt && programme.endAt <= params.now);
  const liveProgrammes = params.programmes.filter((programme) => programme.startAt <= params.now && (!programme.endAt || programme.endAt > params.now));
  const catchupRangeStart =
    completedProgrammes.reduce<Date | null>((earliest, programme) => {
      if (!earliest || programme.startAt < earliest) {
        return programme.startAt;
      }

      return earliest;
    }, null) ?? liveProgrammes[0]?.startAt ?? params.now;
  const catchupRangeEnd =
    completedProgrammes.reduce<Date | null>((latest, programme) => {
      if (programme.endAt && (!latest || programme.endAt > latest)) {
        return programme.endAt;
      }

      return latest;
    }, null) ?? params.now;

  const [recordingCandidates, timeshiftWindow] = await Promise.all([
    listRecordingCatchupCandidatesForViewer(params.viewer, {
      channelId: params.channelId,
      rangeStart: catchupRangeStart,
      rangeEnd: catchupRangeEnd,
    }),
    getChannelTimeshiftCatchupWindow(params.channelId),
  ]);

  return new Map(
    params.programmes.map((programme) => [
      programme.id,
      resolveProgramCatchupSummary({
        program: {
          id: programme.id,
          startAt: programme.startAt,
          endAt: programme.endAt,
        },
        now: params.now,
        recordingCandidates,
        timeshiftWindow,
      }),
    ]),
  );
}

async function getProgramEntryCatchupContext(channelId: string, programId: string) {
  const programme = await findProgramEntryById(programId);

  if (!programme) {
    return null;
  }

  const resolvedChannel =
    programme.channelId === channelId
      ? programme.channel
      : programme.sourceChannel?.mapping?.channel?.id === channelId
        ? programme.sourceChannel.mapping.channel
        : null;

  if (!resolvedChannel) {
    return null;
  }

  return {
    id: programme.id,
    sourceKind: programme.sourceKind,
    title: programme.title,
    subtitle: programme.subtitle ?? null,
    description: programme.description ?? null,
    category: programme.category ?? null,
    imageUrl: programme.imageUrl ?? null,
    startAt: programme.startAt,
    endAt: programme.endAt,
    channel: resolvedChannel,
  };
}

export function listConfiguredEpgSources() {
  return listEpgSources().then((sources) => sources.map((source) => mapEpgSource(source)).filter(Boolean));
}

export function getEpgSource(id: string) {
  return findEpgSourceById(id).then((source) => mapEpgSource(source));
}

export function createConfiguredEpgSource(payload: EpgSourceInput) {
  return createEpgSource(payload).then((source) => mapEpgSource(source));
}

export function updateConfiguredEpgSource(id: string, payload: EpgSourceInput) {
  return updateEpgSource(id, payload).then((source) => mapEpgSource(source));
}

export function deleteConfiguredEpgSource(id: string) {
  return deleteEpgSource(id);
}

export async function importConfiguredEpgSourceFromUrl(id: string) {
  const source = await findEpgSourceImportConfigById(id);

  if (!source) {
    return null;
  }

  if (source.sourceType !== "XMLTV_URL") {
    throw new Error("Only XMLTV URL sources support refresh-from-url");
  }

  const xmlContent = await fetchXmltvFromUrl(source);

  return importXmltvDocumentForSource({
    source,
    xmlContent,
    observationSource: "XMLTV_LOAD",
  });
}

export async function importConfiguredEpgSourceFromFile(id: string, payload: EpgSourceFileImportInput) {
  const source = await findEpgSourceImportConfigById(id);

  if (!source) {
    return null;
  }

  if (source.sourceType !== "XMLTV_FILE") {
    throw new Error("Only XMLTV file sources accept uploaded XMLTV files");
  }

  return importXmltvDocumentForSource({
    source,
    xmlContent: payload.xmlContent,
    uploadedFileName: payload.fileName,
    observationSource: "XMLTV_LOAD",
  });
}

export async function listImportedSourceChannels(id: string, search?: string) {
  const source = await findEpgSourceById(id);

  if (!source) {
    return null;
  }

  const channels = await listEpgSourceChannels(id, search);

  return {
    source: mapEpgSource(source),
    channels: channels.map(mapSourceChannel),
  };
}

export async function updateChannelGuideMapping(payload: EpgChannelMappingInput) {
  const result = await upsertEpgChannelMapping(payload);
  return result;
}

export function listManualProgramEntries(channelId?: string) {
  return listManualPrograms(channelId).then((programmes) => programmes.map((programme) => mapProgramEntry(programme)));
}

export async function createManualProgramEntry(payload: ProgramEntryInput) {
  await assertNoManualProgrammeOverlap(payload);
  const programme = await createManualProgram(payload);
  return mapProgramEntry(programme);
}

export async function updateManualProgramEntry(id: string, payload: ProgramEntryInput) {
  await assertNoManualProgrammeOverlap(payload, id);
  const programme = await updateManualProgram(id, payload);
  return mapProgramEntry(programme);
}

export async function deleteManualProgramEntry(id: string) {
  return deleteManualProgram(id);
}

export async function getManualProgramEntry(id: string) {
  const programme = await findManualProgramById(id);
  return mapProgramEntry(programme);
}

export async function getProgramEntryById(id: string) {
  const programme = await findProgramEntryById(id);

  if (!programme) {
    return null;
  }

  return {
    id: programme.id,
    sourceKind: programme.sourceKind,
    channelId: programme.channelId,
    title: programme.title,
    subtitle: programme.subtitle ?? null,
    description: programme.description ?? null,
    category: programme.category ?? null,
    imageUrl: programme.imageUrl ?? null,
    startAt: programme.startAt.toISOString(),
    endAt: programme.endAt?.toISOString() ?? null,
    channel: programme.channel
      ? {
          id: programme.channel.id,
          name: programme.channel.name,
          slug: programme.channel.slug,
          isActive: programme.channel.isActive,
        }
      : null,
    sourceChannel: programme.sourceChannel
      ? {
          id: programme.sourceChannel.id,
          externalId: programme.sourceChannel.externalId,
          source: programme.sourceChannel.source,
        }
      : null,
  };
}

export async function getResolvedGuideForChannel(viewer: EpgViewer, channelId: string, startAt: Date, endAt: Date) {
  const channelData = (
    await getResolvedGuideDataForChannels([channelId], {
      rangeStart: startAt,
      rangeEnd: endAt,
    })
  )[0];

  if (!channelData) {
    return null;
  }

  const programmes = channelData.resolved.filter((programme) => {
    if (programme.startAt >= endAt) {
      return false;
    }

    return !programme.endAt || programme.endAt > startAt;
  });
  const catchupSummaries = await resolveGuideCatchupSummaries({
    viewer,
    channelId,
    programmes,
    now: new Date(),
  });

  return {
    channelId,
    programmes: programmes.map((programme) => mapGuideProgram(programme, catchupSummaries.get(programme.id) ?? null)),
  };
}

export async function getChannelProgramPlaybackForViewer(viewer: EpgViewer, channelId: string, programId: string) {
  const programme = await getProgramEntryCatchupContext(channelId, programId);

  if (!programme) {
    return null;
  }

  if (!programme.endAt) {
    throw new Error("Programme catch-up playback requires a programme end time");
  }

  const catchupSummaries = await resolveGuideCatchupSummaries({
    viewer,
    channelId,
    programmes: [
      {
        id: programme.id,
        sourceKind: programme.sourceKind,
        title: programme.title,
        subtitle: programme.subtitle,
        description: programme.description,
        category: programme.category,
        imageUrl: programme.imageUrl,
        startAt: programme.startAt,
        endAt: programme.endAt,
      },
    ],
    now: new Date(),
  });
  const catchup = catchupSummaries.get(programme.id);

  if (!catchup) {
    throw new Error("Programme catch-up state could not be resolved");
  }

  if (!catchup.isCatchupPlayable && !catchup.watchFromStartAvailable) {
    throw new Error("Programme catch-up playback is not available");
  }

  const selectedSource = catchup.sources.find((source) => source.isPreferred) ?? catchup.sources[0] ?? null;

  if (!selectedSource) {
    throw new Error("Programme catch-up playback is not available");
  }

  if (selectedSource.sourceType === "RECORDING") {
    if (!selectedSource.recordingJobId) {
      throw new Error("Recording-based catch-up is missing its recording job");
    }

    const playback = await getRecordingPlaybackAccessForViewer(viewer, selectedSource.recordingJobId);
    const startOffsetSeconds = Math.max(
      0,
      Math.floor((programme.startAt.getTime() - new Date(selectedSource.availableFromAt).getTime()) / 1000),
    );

    return {
      channelId,
      channelSlug: programme.channel.slug,
      programId: programme.id,
      title: programme.title,
      subtitle: programme.subtitle,
      description: programme.description,
      category: programme.category,
      imageUrl: programme.imageUrl,
      startAt: programme.startAt.toISOString(),
      endAt: programme.endAt.toISOString(),
      playbackKind: "CATCHUP_RECORDING" as const,
      sourceType: "RECORDING" as const,
      playbackUrl: playback.playbackUrl,
      playbackMimeType: "video/mp4",
      startOffsetSeconds,
      availableUntilAt: selectedSource.availableUntilAt,
      recording: {
        recordingJobId: selectedSource.recordingJobId,
        title: selectedSource.recordingTitle ?? programme.title,
        matchType: selectedSource.recordingMatchType ?? "OVERLAP",
      },
      timeshiftWindow: null,
      catchup,
    };
  }

  const startOffsetSeconds = Math.max(
    0,
    Math.floor((programme.startAt.getTime() - new Date(selectedSource.availableFromAt).getTime()) / 1000),
  );

  return {
    channelId,
    channelSlug: programme.channel.slug,
    programId: programme.id,
    title: programme.title,
    subtitle: programme.subtitle,
    description: programme.description,
    category: programme.category,
    imageUrl: programme.imageUrl,
    startAt: programme.startAt.toISOString(),
    endAt: programme.endAt.toISOString(),
    playbackKind: catchup.timingState === "LIVE_NOW" ? ("WATCH_FROM_START" as const) : ("CATCHUP_TIMESHIFT" as const),
    sourceType: "TIMESHIFT" as const,
    playbackUrl: buildTimeshiftPlaybackUrl(channelId),
    playbackMimeType: "application/vnd.apple.mpegurl",
    startOffsetSeconds,
    availableUntilAt: selectedSource.availableUntilAt,
    recording: null,
    timeshiftWindow: {
      availableFromAt: selectedSource.availableFromAt,
      availableUntilAt: selectedSource.availableUntilAt,
    },
    catchup,
  };
}

export async function getNowNextForChannels(channelIds: string[]) {
  const now = new Date();
  const resolvedGuideData = await getResolvedGuideDataForChannels(channelIds, {
    rangeStart: new Date(now.getTime() - 24 * 60 * 60_000),
    rangeEnd: new Date(now.getTime() + 48 * 60 * 60_000),
  });

  return resolvedGuideData.map(({ channel, manual, imported, resolved }) => {
    const mapping = channel.epgMapping?.sourceChannel ?? null;
    const hasGuideConfiguration = Boolean(mapping?.source) || manual.length > 0;
    const activeSourceIsUnavailable = Boolean(mapping?.source && !mapping.source.isActive && manual.length === 0);

    if (!hasGuideConfiguration) {
      recordChannelGuideStatus({
        channelId: channel.id,
        status: "unconfigured",
        sourceId: mapping?.source.id ?? null,
        epgChannelId: mapping?.externalId ?? null,
      });
      return {
        channelId: channel.id,
        status: "UNCONFIGURED" as const,
        now: null,
        next: null,
      };
    }

    if (activeSourceIsUnavailable) {
      recordChannelGuideStatus({
        channelId: channel.id,
        status: "source-inactive",
        sourceId: mapping?.source.id ?? null,
        epgChannelId: mapping?.externalId ?? null,
      });
      return {
        channelId: channel.id,
        status: "SOURCE_INACTIVE" as const,
        now: null,
        next: null,
      };
    }

    if (mapping?.source && imported.length === 0 && manual.length === 0) {
      recordChannelGuideStatus({
        channelId: channel.id,
        status: "no-data",
        sourceId: mapping.source.id,
        epgChannelId: mapping.externalId,
      });
      return {
        channelId: channel.id,
        status: "NO_DATA" as const,
        now: null,
        next: null,
      };
    }

    const { now: current, next } = getNowNextProgrammes(resolved, now);
    const status = current || next ? ("READY" as const) : ("NO_DATA" as const);

    recordChannelGuideStatus({
      channelId: channel.id,
      status: status === "READY" ? "ready" : "no-data",
      sourceId: mapping?.source.id ?? null,
      epgChannelId: mapping?.externalId ?? null,
    });

    return {
      channelId: channel.id,
      status,
      now: current ? mapGuideProgram(current) : null,
      next: next ? mapGuideProgram(next) : null,
    };
  });
}
