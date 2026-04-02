import type { LayoutType, SavedLayoutConfig, UserRole } from "@tv-dash/shared";

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
  masterHlsUrl: string;
  groupId: string | null;
  group: ChannelGroup | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
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

export interface AuthResponse {
  token: string;
  user: User;
}

export interface QualityOption {
  label: string;
  value: string;
  height: number | null;
}
