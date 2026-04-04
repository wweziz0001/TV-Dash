import type {
  ChannelSourceMode,
  DiagnosticFailureKind,
  DiagnosticHealthState,
  EpgImportStatus,
  EpgSourceType,
  LiveTimeshiftBufferState,
  LayoutType,
  RecordingJobStatus,
  RecordingMode,
  RecordingRecurrenceType,
  RecordingRunStatus,
  RecordingWeekday,
  PlaybackSessionState,
  PlaybackSessionType,
  ProgramEntrySource,
  PlaybackSessionEndInput,
  PlaybackSessionHeartbeatInput,
  SavedLayoutConfig,
  StreamPlaybackMode,
  UserRole,
} from "@tv-dash/shared";

export interface User {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChannelGroup {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  _count?: {
    channels: number;
  };
}

export interface Channel {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  sourceMode: ChannelSourceMode;
  masterHlsUrl: string | null;
  playbackMode: StreamPlaybackMode;
  timeshiftEnabled?: boolean;
  timeshiftWindowMinutes?: number | null;
  manualVariantCount: number;
  hasManualPrograms?: boolean;
  groupId: string | null;
  group: ChannelGroup | null;
  epgSourceId: string | null;
  epgSourceChannelId?: string | null;
  epgChannelId: string | null;
  epgSource: EpgSourceSummary | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelQualityVariant {
  id?: string;
  label: string;
  sortOrder: number;
  playlistUrl: string;
  width: number | null;
  height: number | null;
  bandwidth: number | null;
  codecs: string | null;
  isActive: boolean;
}

export interface ChannelConfig extends Channel {
  upstreamUserAgent: string | null;
  upstreamReferrer: string | null;
  upstreamHeaders: Record<string, string>;
  qualityVariants: ChannelQualityVariant[];
}

export interface Favorite {
  id: string;
  userId: string;
  channelId: string;
  createdAt: string;
  channel: Channel;
}

export interface SavedLayoutItem {
  id?: string;
  tileIndex: number;
  channelId: string | null;
  preferredQuality?: string | null;
  isMuted: boolean;
  channel?: Channel | null;
}

export interface SavedLayout {
  id: string;
  userId: string;
  name: string;
  layoutType: LayoutType;
  configJson: SavedLayoutConfig;
  items: SavedLayoutItem[];
  createdAt: string;
  updatedAt: string;
}

export interface StreamVariant {
  label: string;
  height: number | null;
  bandwidth: number | null;
}

export interface StreamTestResult {
  ok: boolean;
  contentType: string | null;
  variantCount: number;
  variants: StreamVariant[];
  isMasterPlaylist: boolean;
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
  detail: Record<string, string | number | boolean | null> | null;
}

export interface ChannelDiagnostics {
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
    status: "ready" | "no-data" | "source-error" | "unconfigured" | "source-inactive" | "unknown";
    lastObservedAt: string | null;
    lastReadyAt: string | null;
    sourceId: string | null;
    epgChannelId: string | null;
  };
}

export interface EpgSourceDiagnostics {
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

export interface EpgSourceSummary {
  id: string;
  name: string;
  slug: string;
  sourceType: EpgSourceType;
  isActive: boolean;
}

export interface EpgSource extends EpgSourceSummary {
  url: string | null;
  uploadedFileName: string | null;
  refreshIntervalMinutes: number | null;
  requestUserAgent: string | null;
  requestReferrer: string | null;
  requestHeaders: Record<string, string>;
  lastImportStartedAt: string | null;
  lastImportedAt: string | null;
  lastImportStatus: EpgImportStatus;
  lastImportMessage: string | null;
  lastImportChannelCount: number | null;
  lastImportProgramCount: number | null;
  sourceChannelCount: number;
  availableChannelCount: number;
  mappedChannelCount: number;
  importedProgramCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface EpgSourceChannel {
  id: string;
  externalId: string;
  displayName: string;
  displayNames: string[];
  iconUrl: string | null;
  isAvailable: boolean;
  lastSeenAt: string | null;
  source: EpgSourceSummary;
  mapping: {
    id: string;
    channel: {
      id: string;
      name: string;
      slug: string;
      isActive: boolean;
    };
  } | null;
}

export interface NowNextProgram {
  id: string;
  sourceKind: ProgramEntrySource;
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string | null;
  imageUrl: string | null;
  start: string;
  stop: string | null;
}

export interface ChannelNowNext {
  channelId: string;
  status: "READY" | "UNCONFIGURED" | "NO_DATA" | "SOURCE_ERROR" | "SOURCE_INACTIVE";
  now: NowNextProgram | null;
  next: NowNextProgram | null;
}

export interface ProgramEntry {
  id: string;
  sourceKind: ProgramEntrySource;
  channelId: string | null;
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string | null;
  imageUrl: string | null;
  startAt: string;
  endAt: string | null;
  createdAt: string;
  updatedAt: string;
  channel: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
  } | null;
}

export interface ChannelGuideWindow {
  channelId: string;
  programmes: NowNextProgram[];
}

export interface RecordingRun {
  id: string;
  status: RecordingRunStatus;
  outputFileName: string;
  containerFormat: string;
  ffmpegPid: number | null;
  startedAt: string | null;
  endedAt: string | null;
  exitCode: number | null;
  exitSignal: string | null;
  failureReason: string | null;
  stderrTail: string | null;
  fileSizeBytes: number | null;
  durationSeconds: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecordingAsset {
  id: string;
  channelId: string | null;
  channelNameSnapshot: string;
  channelSlugSnapshot: string;
  title: string;
  fileName: string;
  mimeType: string;
  containerFormat: string;
  storagePath: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number | null;
  fileSizeBytes: number | null;
  thumbnailUrl: string | null;
  thumbnailMimeType: string | null;
  thumbnailGeneratedAt: string | null;
  playbackUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecordingRetentionSummary {
  isProtected: boolean;
  protectedAt: string | null;
  deleteAfter: string | null;
  mode: "ACTIVE" | "STANDARD" | "FAILED_CLEANUP" | "PROTECTED";
  maxAgeDays: number;
  maxRecordingsPerChannel: number;
  failedCleanupHours: number;
}

export interface RecordingJob {
  id: string;
  channelId: string | null;
  channelNameSnapshot: string;
  channelSlugSnapshot: string;
  title: string;
  requestedQualitySelector: string | null;
  requestedQualityLabel: string | null;
  mode: RecordingMode;
  status: RecordingJobStatus;
  paddingBeforeMinutes: number;
  paddingAfterMinutes: number;
  isProtected: boolean;
  protectedAt: string | null;
  startAt: string;
  endAt: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  failureReason: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  retention: RecordingRetentionSummary;
  program: {
    id: string | null;
    sourceKind: ProgramEntrySource | null;
    title: string | null;
    description: string | null;
    category: string | null;
    imageUrl: string | null;
    startAt: string | null;
    endAt: string | null;
  } | null;
  recordingRule: {
    id: string | null;
    titleTemplate: string | null;
    recurrenceType: RecordingRecurrenceType | null;
    weekdays: RecordingWeekday[];
    timeZone: string | null;
    isActive: boolean | null;
  } | null;
  channel: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
  } | null;
  createdByUser: {
    id: string;
    username: string;
    role: UserRole;
  } | null;
  latestRun: RecordingRun | null;
  asset: RecordingAsset | null;
}

export interface RecordingQualityOption {
  value: string;
  label: string;
  height: number | null;
}

export interface RecordingRule {
  id: string;
  channelId: string;
  titleTemplate: string;
  recurrenceType: RecordingRecurrenceType;
  weekdays: RecordingWeekday[];
  startsAt: string;
  durationMinutes: number;
  timeZone: string;
  paddingBeforeMinutes: number;
  paddingAfterMinutes: number;
  requestedQualitySelector: string | null;
  requestedQualityLabel: string | null;
  matchProgramTitle: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  originProgram: {
    id: string | null;
    sourceKind: ProgramEntrySource | null;
    title: string | null;
    startAt: string | null;
    endAt: string | null;
  } | null;
  channel: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
  };
  createdByUser: {
    id: string;
    username: string;
    role: UserRole;
  };
  nextUpcomingJob: {
    id: string;
    title: string;
    mode: RecordingMode;
    status: RecordingJobStatus;
    startAt: string;
    endAt: string | null;
    programTitleSnapshot: string | null;
  } | null;
  generatedJobCount: number;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface LiveTimeshiftStatus {
  channelId: string;
  configured: boolean;
  supported: boolean;
  available: boolean;
  bufferState: LiveTimeshiftBufferState;
  message: string;
  windowSeconds: number;
  minimumReadyWindowSeconds: number;
  availableWindowSeconds: number;
  bufferedSegmentCount: number;
  lastUpdatedAt: string | null;
  lastError: string | null;
}

export interface QualityOption {
  label: string;
  value: string;
  height: number | null;
}

export type PlaybackSessionHeartbeatPayload = PlaybackSessionHeartbeatInput;
export type PlaybackSessionEndPayload = PlaybackSessionEndInput;

export type MonitoringLogLevel = "info" | "warn" | "error";
export type MonitoringLogCategory = "playback" | "stream" | "epg" | "auth" | "admin" | "system";

export interface AdminLogEntry {
  id: string;
  timestamp: string;
  level: MonitoringLogLevel;
  category: MonitoringLogCategory;
  event: string;
  actorUserId?: string | null;
  channelId?: string;
  channelSlug?: string;
  epgSourceId?: string;
  sessionId?: string;
  failureKind?: DiagnosticFailureKind;
  retryable?: boolean | null;
  statusCode?: number | null;
  detail?: Record<string, string | number | boolean | null | undefined> | null;
}

export interface AuditEvent {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetName: string | null;
  actorUserId: string | null;
  actorRole: UserRole | null;
  actorUser: {
    id: string;
    username: string;
    role: UserRole;
  } | null;
  detail: Record<string, string | number | boolean | null | undefined> | null;
  createdAt: string;
}

export type { RecordingJobStatus, RecordingMode, RecordingRecurrenceType, RecordingRunStatus, RecordingWeekday };

export interface AdminMonitoringSession {
  sessionId: string;
  sessionType: PlaybackSessionType;
  playbackState: PlaybackSessionState;
  selectedQuality: string | null;
  isMuted: boolean;
  tileIndex: number | null;
  failureKind: DiagnosticFailureKind | null;
  startedAt: string;
  lastSeenAt: string;
  user: {
    id: string;
    username: string;
    role: UserRole;
  };
  channel: {
    id: string;
    name: string;
    slug: string;
    playbackMode: StreamPlaybackMode;
    sourceMode: ChannelSourceMode;
    isActive: boolean;
  } | null;
}

export interface ChannelViewerCount {
  channel: {
    id: string;
    name: string;
    slug: string;
    playbackMode: StreamPlaybackMode;
    sourceMode: ChannelSourceMode;
    isActive: boolean;
  };
  viewerCount: number;
  singleViewCount: number;
  multiviewCount: number;
  watchers: Array<{
    sessionId: string;
    userId: string;
    username: string;
    playbackState: PlaybackSessionState;
    selectedQuality: string | null;
    isMuted: boolean;
    tileIndex: number | null;
    lastSeenAt: string;
  }>;
  sharedSession: {
    upstreamState: "STARTING" | "ACTIVE" | "ERROR";
    viewerCount: number;
    createdAt: string;
    lastAccessAt: string;
    expiresAt: string;
    lastUpstreamRequestAt: string | null;
    lastError: string | null;
    lastErrorAt: string | null;
    mappedAssetCount: number;
    cache: {
      entryCount: number;
      manifestEntryCount: number;
      segmentEntryCount: number;
      bytesUsed: number;
      manifestHitCount: number;
      manifestMissCount: number;
      segmentHitCount: number;
      segmentMissCount: number;
      inflightReuseCount: number;
      upstreamRequestCount: number;
    };
  } | null;
}

export interface AdminMonitoringSnapshot {
  generatedAt: string;
  summary: {
    activeSessionCount: number;
    activeChannelCount: number;
    activeSharedSessionCount: number;
    activeSharedViewerCount: number;
    sharedCacheHitRate: number | null;
    warningLogCount: number;
    errorLogCount: number;
    staleAfterSeconds: number;
  };
  sessions: AdminMonitoringSession[];
  channelViewerCounts: ChannelViewerCount[];
  recentFailures: AdminLogEntry[];
}
