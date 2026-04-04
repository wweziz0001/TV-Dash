import type {
  ChannelSourceMode,
  DiagnosticFailureKind,
  DiagnosticHealthState,
  StreamPlaybackMode,
} from "@tv-dash/shared";

export type ChannelDiagnosticObservationSource =
  | "STREAM_TEST"
  | "STREAM_METADATA"
  | "PROXY_MASTER"
  | "PROXY_ASSET"
  | "SHARED_MASTER"
  | "SHARED_ASSET"
  | "SYNTHETIC_MASTER";

export type EpgDiagnosticObservationSource = "EPG_PREVIEW" | "GUIDE_LOOKUP" | "XMLTV_LOAD";

export type GuideIntegrationStatus =
  | "ready"
  | "no-data"
  | "source-error"
  | "unconfigured"
  | "source-inactive"
  | "unknown";

export interface DiagnosticObservationDetail {
  [key: string]: string | number | boolean | null | undefined;
}

export interface DiagnosticObservationSummary {
  lastCheckAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  lastFailureKind: DiagnosticFailureKind | null;
  retryable: boolean | null;
  consecutiveFailures: number;
  lastObservationSource: string | null;
  detail: DiagnosticObservationDetail | null;
}

export interface ChannelDiagnosticsSnapshot {
  channelId: string;
  channelSlug: string;
  healthState: DiagnosticHealthState;
  reachable: boolean | null;
  current: {
    playbackMode: StreamPlaybackMode;
    sourceMode: ChannelSourceMode;
    hasMasterUrl: boolean;
    hasManualVariants: boolean;
    syntheticMasterExpected: boolean;
    proxyEnabled: boolean;
    epgLinked: boolean;
  };
  overall: DiagnosticObservationSummary;
  streamInspection: DiagnosticObservationSummary;
  proxyMaster: DiagnosticObservationSummary;
  proxyAsset: DiagnosticObservationSummary;
  syntheticMaster: DiagnosticObservationSummary;
  guide: {
    status: GuideIntegrationStatus;
    lastObservedAt: string | null;
    lastReadyAt: string | null;
    sourceId: string | null;
    epgChannelId: string | null;
  };
}

export interface EpgSourceDiagnosticsSnapshot {
  sourceId: string;
  sourceSlug: string;
  healthState: DiagnosticHealthState;
  overall: DiagnosticObservationSummary;
  fetch: DiagnosticObservationSummary;
  parse: DiagnosticObservationSummary;
  cache: {
    lastLoadedAt: string | null;
    expiresAt: string | null;
    channelCount: number | null;
    programmeCount: number | null;
  };
}

interface MutableObservationSummary {
  lastCheckAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastFailureReason: string | null;
  lastFailureKind: DiagnosticFailureKind | null;
  retryable: boolean | null;
  consecutiveFailures: number;
  lastObservationSource: string | null;
  detail: DiagnosticObservationDetail | null;
}

interface DiagnosticObservationInput {
  observedAt?: Date;
  status: "success" | "failure";
  source: string;
  reason?: string | null;
  failureKind?: DiagnosticFailureKind | null;
  retryable?: boolean | null;
  detail?: DiagnosticObservationDetail | null;
}

interface ChannelGuideRuntimeState {
  status: GuideIntegrationStatus;
  lastObservedAt: Date | null;
  lastReadyAt: Date | null;
  sourceId: string | null;
  epgChannelId: string | null;
}

interface EpgCacheRuntimeState {
  lastLoadedAt: Date | null;
  expiresAt: Date | null;
  channelCount: number | null;
  programmeCount: number | null;
}

interface ChannelRuntimeDiagnostics {
  streamInspection: MutableObservationSummary;
  proxyMaster: MutableObservationSummary;
  proxyAsset: MutableObservationSummary;
  syntheticMaster: MutableObservationSummary;
  guide: ChannelGuideRuntimeState;
}

interface EpgSourceRuntimeDiagnostics {
  fetch: MutableObservationSummary;
  parse: MutableObservationSummary;
  cache: EpgCacheRuntimeState;
}

type ChannelSnapshotInput = {
  id: string;
  slug: string;
  playbackMode: StreamPlaybackMode;
  sourceMode: ChannelSourceMode;
  masterHlsUrl: string | null;
  qualityVariants?: Array<unknown>;
  hasManualPrograms?: boolean;
  epgSourceId?: string | null;
  epgChannelId?: string | null;
};

type EpgSnapshotInput = {
  id: string;
  slug: string;
};

const channelRuntimeDiagnostics = new Map<string, ChannelRuntimeDiagnostics>();
const epgSourceRuntimeDiagnostics = new Map<string, EpgSourceRuntimeDiagnostics>();

function createEmptyObservationSummary(): MutableObservationSummary {
  return {
    lastCheckAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureReason: null,
    lastFailureKind: null,
    retryable: null,
    consecutiveFailures: 0,
    lastObservationSource: null,
    detail: null,
  };
}

function createEmptyChannelDiagnostics(): ChannelRuntimeDiagnostics {
  return {
    streamInspection: createEmptyObservationSummary(),
    proxyMaster: createEmptyObservationSummary(),
    proxyAsset: createEmptyObservationSummary(),
    syntheticMaster: createEmptyObservationSummary(),
    guide: {
      status: "unknown",
      lastObservedAt: null,
      lastReadyAt: null,
      sourceId: null,
      epgChannelId: null,
    },
  };
}

function createEmptyEpgDiagnostics(): EpgSourceRuntimeDiagnostics {
  return {
    fetch: createEmptyObservationSummary(),
    parse: createEmptyObservationSummary(),
    cache: {
      lastLoadedAt: null,
      expiresAt: null,
      channelCount: null,
      programmeCount: null,
    },
  };
}

function getChannelRuntimeState(channelId: string) {
  let record = channelRuntimeDiagnostics.get(channelId);

  if (!record) {
    record = createEmptyChannelDiagnostics();
    channelRuntimeDiagnostics.set(channelId, record);
  }

  return record;
}

function getEpgSourceRuntimeState(sourceId: string) {
  let record = epgSourceRuntimeDiagnostics.get(sourceId);

  if (!record) {
    record = createEmptyEpgDiagnostics();
    epgSourceRuntimeDiagnostics.set(sourceId, record);
  }

  return record;
}

function applyObservation(target: MutableObservationSummary, input: DiagnosticObservationInput) {
  const observedAt = input.observedAt ?? new Date();
  target.lastCheckAt = observedAt;
  target.lastObservationSource = input.source;
  target.detail = input.detail ?? null;
  target.retryable = input.retryable ?? null;

  if (input.status === "success") {
    target.lastSuccessAt = observedAt;
    target.consecutiveFailures = 0;
    return;
  }

  target.lastFailureAt = observedAt;
  target.lastFailureReason = input.reason ?? "Unknown failure";
  target.lastFailureKind = input.failureKind ?? "unknown";
  target.consecutiveFailures += 1;
}

function toIsoString(value: Date | null) {
  return value ? value.toISOString() : null;
}

function buildObservationSummary(value: MutableObservationSummary): DiagnosticObservationSummary {
  return {
    lastCheckAt: toIsoString(value.lastCheckAt),
    lastSuccessAt: toIsoString(value.lastSuccessAt),
    lastFailureAt: toIsoString(value.lastFailureAt),
    lastFailureReason: value.lastFailureReason,
    lastFailureKind: value.lastFailureKind,
    retryable: value.retryable,
    consecutiveFailures: value.consecutiveFailures,
    lastObservationSource: value.lastObservationSource,
    detail: value.detail,
  };
}

function getLatestObservationDate(values: MutableObservationSummary[]) {
  return values.reduce<Date | null>((latest, current) => {
    const candidate = current.lastCheckAt;

    if (!candidate) {
      return latest;
    }

    if (!latest || candidate.getTime() > latest.getTime()) {
      return candidate;
    }

    return latest;
  }, null);
}

function deriveReachability(observations: MutableObservationSummary[]) {
  const latest = observations
    .filter((item) => item.lastCheckAt)
    .sort((left, right) => (right.lastCheckAt?.getTime() ?? 0) - (left.lastCheckAt?.getTime() ?? 0))[0];

  if (!latest) {
    return null;
  }

  return !latest.lastFailureAt || Boolean(latest.lastSuccessAt && latest.lastSuccessAt >= latest.lastFailureAt);
}

function deriveHealthState(observations: MutableObservationSummary[]): DiagnosticHealthState {
  const relevant = observations.filter((item) => item.lastCheckAt);

  if (!relevant.length) {
    return "unknown";
  }

  const latest = relevant.sort((left, right) => (right.lastCheckAt?.getTime() ?? 0) - (left.lastCheckAt?.getTime() ?? 0))[0];
  const latestIsFailure =
    Boolean(
      latest.lastFailureAt &&
        (!latest.lastSuccessAt || latest.lastFailureAt.getTime() >= latest.lastSuccessAt.getTime()),
    );

  if (latest.consecutiveFailures >= 2 || (latestIsFailure && !latest.lastSuccessAt)) {
    return "failing";
  }

  if (latestIsFailure || relevant.some((item) => item.consecutiveFailures > 0)) {
    return "degraded";
  }

  return "healthy";
}

function buildOverallSummary(observations: MutableObservationSummary[]) {
  const latestCheckAt = getLatestObservationDate(observations);
  const latestSuccessAt = observations.reduce<Date | null>((latest, current) => {
    if (!current.lastSuccessAt) {
      return latest;
    }

    if (!latest || current.lastSuccessAt.getTime() > latest.getTime()) {
      return current.lastSuccessAt;
    }

    return latest;
  }, null);
  const latestFailure = observations.reduce<{
    observedAt: Date;
    reason: string | null;
    failureKind: DiagnosticFailureKind | null;
    retryable: boolean | null;
    source: string | null;
    detail: DiagnosticObservationDetail | null;
  } | null>((latest, current) => {
    if (!current.lastFailureAt) {
      return latest;
    }

    if (!latest || current.lastFailureAt.getTime() > latest.observedAt.getTime()) {
      return {
        observedAt: current.lastFailureAt,
        reason: current.lastFailureReason,
        failureKind: current.lastFailureKind,
        retryable: current.retryable,
        source: current.lastObservationSource,
        detail: current.detail,
      };
    }

    return latest;
  }, null);
  const latestSource = observations.reduce<{ observedAt: Date; source: string | null } | null>((latest, current) => {
    if (!current.lastCheckAt) {
      return latest;
    }

    if (!latest || current.lastCheckAt.getTime() > latest.observedAt.getTime()) {
      return {
        observedAt: current.lastCheckAt,
        source: current.lastObservationSource,
      };
    }

    return latest;
  }, null);
  const maxConsecutiveFailures = observations.reduce(
    (value, current) => Math.max(value, current.consecutiveFailures),
    0,
  );

  return {
    lastCheckAt: toIsoString(latestCheckAt),
    lastSuccessAt: toIsoString(latestSuccessAt),
    lastFailureAt: latestFailure ? latestFailure.observedAt.toISOString() : null,
    lastFailureReason: latestFailure?.reason ?? null,
    lastFailureKind: latestFailure?.failureKind ?? null,
    retryable: latestFailure?.retryable ?? null,
    consecutiveFailures: maxConsecutiveFailures,
    lastObservationSource: latestSource?.source ?? null,
    detail: latestFailure?.detail ?? null,
  } satisfies DiagnosticObservationSummary;
}

export function recordChannelObservation(
  channelId: string,
  subsystem: keyof Omit<ChannelRuntimeDiagnostics, "guide">,
  input: DiagnosticObservationInput,
) {
  const runtimeState = getChannelRuntimeState(channelId);
  applyObservation(runtimeState[subsystem], input);
}

export function recordChannelGuideStatus(input: {
  channelId: string;
  status: GuideIntegrationStatus;
  sourceId?: string | null;
  epgChannelId?: string | null;
  observedAt?: Date;
}) {
  const runtimeState = getChannelRuntimeState(input.channelId);
  const observedAt = input.observedAt ?? new Date();

  runtimeState.guide.status = input.status;
  runtimeState.guide.sourceId = input.sourceId ?? null;
  runtimeState.guide.epgChannelId = input.epgChannelId ?? null;
  runtimeState.guide.lastObservedAt = observedAt;

  if (input.status === "ready") {
    runtimeState.guide.lastReadyAt = observedAt;
  }
}

export function recordEpgObservation(
  sourceId: string,
  subsystem: keyof Pick<EpgSourceRuntimeDiagnostics, "fetch" | "parse">,
  input: DiagnosticObservationInput,
) {
  const runtimeState = getEpgSourceRuntimeState(sourceId);
  applyObservation(runtimeState[subsystem], input);
}

export function recordEpgCacheState(input: {
  sourceId: string;
  loadedAt?: Date;
  expiresAt: Date;
  channelCount: number;
  programmeCount: number;
}) {
  const runtimeState = getEpgSourceRuntimeState(input.sourceId);
  runtimeState.cache = {
    lastLoadedAt: input.loadedAt ?? new Date(),
    expiresAt: input.expiresAt,
    channelCount: input.channelCount,
    programmeCount: input.programmeCount,
  };
}

export function buildChannelDiagnosticsSnapshot(channel: ChannelSnapshotInput): ChannelDiagnosticsSnapshot {
  const runtimeState = getChannelRuntimeState(channel.id);
  const observations = [
    runtimeState.streamInspection,
    runtimeState.proxyMaster,
    runtimeState.proxyAsset,
    runtimeState.syntheticMaster,
  ];

  return {
    channelId: channel.id,
    channelSlug: channel.slug,
    healthState: deriveHealthState(observations),
    reachable: deriveReachability([
      runtimeState.streamInspection,
      runtimeState.proxyMaster,
      runtimeState.proxyAsset,
      runtimeState.syntheticMaster,
    ]),
    current: {
      playbackMode: channel.playbackMode,
      sourceMode: channel.sourceMode,
      hasMasterUrl: Boolean(channel.masterHlsUrl),
      hasManualVariants: Boolean(channel.qualityVariants?.length),
      syntheticMasterExpected: channel.sourceMode === "MANUAL_VARIANTS",
      proxyEnabled: channel.playbackMode === "PROXY",
      epgLinked: Boolean((channel.epgSourceId && channel.epgChannelId) || channel.hasManualPrograms),
    },
    overall: buildOverallSummary(observations),
    streamInspection: buildObservationSummary(runtimeState.streamInspection),
    proxyMaster: buildObservationSummary(runtimeState.proxyMaster),
    proxyAsset: buildObservationSummary(runtimeState.proxyAsset),
    syntheticMaster: buildObservationSummary(runtimeState.syntheticMaster),
    guide: {
      status:
        channel.epgSourceId && channel.epgChannelId
          ? runtimeState.guide.status
          : channel.hasManualPrograms
          ? runtimeState.guide.status
          : "unconfigured",
      lastObservedAt: toIsoString(runtimeState.guide.lastObservedAt),
      lastReadyAt: toIsoString(runtimeState.guide.lastReadyAt),
      sourceId: channel.epgSourceId ?? runtimeState.guide.sourceId,
      epgChannelId: channel.epgChannelId ?? runtimeState.guide.epgChannelId,
    },
  };
}

export function buildEpgSourceDiagnosticsSnapshot(source: EpgSnapshotInput): EpgSourceDiagnosticsSnapshot {
  const runtimeState = getEpgSourceRuntimeState(source.id);
  const observations = [runtimeState.fetch, runtimeState.parse];

  return {
    sourceId: source.id,
    sourceSlug: source.slug,
    healthState: deriveHealthState(observations),
    overall: buildOverallSummary(observations),
    fetch: buildObservationSummary(runtimeState.fetch),
    parse: buildObservationSummary(runtimeState.parse),
    cache: {
      lastLoadedAt: toIsoString(runtimeState.cache.lastLoadedAt),
      expiresAt: toIsoString(runtimeState.cache.expiresAt),
      channelCount: runtimeState.cache.channelCount,
      programmeCount: runtimeState.cache.programmeCount,
    },
  };
}

export function resetRuntimeDiagnostics() {
  channelRuntimeDiagnostics.clear();
  epgSourceRuntimeDiagnostics.clear();
}
