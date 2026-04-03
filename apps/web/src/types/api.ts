import type {
  ChannelSourceMode,
  DiagnosticFailureKind,
  DiagnosticHealthState,
  EpgSourceType,
  LayoutType,
  PlaybackSessionState,
  PlaybackSessionType,
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
  manualVariantCount: number;
  groupId: string | null;
  group: ChannelGroup | null;
  epgSourceId: string | null;
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
  url: string;
  refreshIntervalMinutes: number;
  requestUserAgent: string | null;
  requestReferrer: string | null;
  requestHeaders: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  _count?: {
    channels: number;
  };
}

export interface EpgPreviewChannel {
  id: string;
  displayNames: string[];
}

export interface NowNextProgram {
  title: string;
  subtitle: string | null;
  description: string | null;
  start: string;
  stop: string | null;
}

export interface ChannelNowNext {
  channelId: string;
  status: "READY" | "UNCONFIGURED" | "NO_DATA" | "SOURCE_ERROR";
  now: NowNextProgram | null;
  next: NowNextProgram | null;
}

export interface AuthResponse {
  token: string;
  user: User;
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
}

export interface AdminMonitoringSnapshot {
  generatedAt: string;
  summary: {
    activeSessionCount: number;
    activeChannelCount: number;
    warningLogCount: number;
    errorLogCount: number;
    staleAfterSeconds: number;
  };
  sessions: AdminMonitoringSession[];
  channelViewerCounts: ChannelViewerCount[];
  recentFailures: AdminLogEntry[];
}
