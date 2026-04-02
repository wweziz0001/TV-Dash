import type {
  ChannelSourceMode,
  EpgSourceType,
  LayoutType,
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
