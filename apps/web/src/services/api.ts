import type {
  ChannelGroupInput,
  ChannelInput,
  EpgSourceInput,
  LoginInput,
  SavedLayoutInput,
  StreamTestInput,
} from "@tv-dash/shared";
import type {
  AuthResponse,
  Channel,
  ChannelConfig,
  ChannelGroup,
  ChannelNowNext,
  EpgPreviewChannel,
  EpgSource,
  Favorite,
  SavedLayout,
  StreamTestResult,
  User,
} from "@/types/api";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(init.headers);

  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message ?? "Request failed");
  }

  return payload as T;
}

export const api = {
  login: (payload: LoginInput) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  me: (token: string) => request<{ user: User | null }>("/auth/me", { method: "GET" }, token),
  listChannels: (token: string | null, params?: URLSearchParams) =>
    request<{ channels: Channel[] }>(`/channels${params ? `?${params.toString()}` : ""}`, {}, token),
  getChannelConfig: (id: string, token: string) =>
    request<{ channel: ChannelConfig }>(`/channels/${id}/config`, {}, token),
  getChannelBySlug: (slug: string, token: string | null) =>
    request<{ channel: Channel }>(`/channels/slug/${slug}`, {}, token),
  createChannel: (payload: ChannelInput, token: string) =>
    request<{ channel: ChannelConfig }>("/channels", { method: "POST", body: JSON.stringify(payload) }, token),
  updateChannel: (id: string, payload: ChannelInput, token: string) =>
    request<{ channel: ChannelConfig }>(`/channels/${id}`, { method: "PUT", body: JSON.stringify(payload) }, token),
  updateChannelSortOrder: (id: string, sortOrder: number, token: string) =>
    request<{ channel: Channel }>(
      `/channels/${id}/sort-order`,
      { method: "PUT", body: JSON.stringify({ sortOrder }) },
      token,
    ),
  deleteChannel: (id: string, token: string) =>
    request<void>(`/channels/${id}`, { method: "DELETE" }, token),
  listGroups: (token: string | null) => request<{ groups: ChannelGroup[] }>("/groups", {}, token),
  createGroup: (payload: ChannelGroupInput, token: string) =>
    request<{ group: ChannelGroup }>("/groups", { method: "POST", body: JSON.stringify(payload) }, token),
  updateGroup: (id: string, payload: ChannelGroupInput, token: string) =>
    request<{ group: ChannelGroup }>(`/groups/${id}`, { method: "PUT", body: JSON.stringify(payload) }, token),
  deleteGroup: (id: string, token: string) =>
    request<void>(`/groups/${id}`, { method: "DELETE" }, token),
  listFavorites: (token: string) => request<{ favorites: Favorite[] }>("/favorites", {}, token),
  addFavorite: (channelId: string, token: string) =>
    request<{ favorite: Favorite }>("/favorites", { method: "POST", body: JSON.stringify({ channelId }) }, token),
  removeFavorite: (channelId: string, token: string) =>
    request<void>(`/favorites/${channelId}`, { method: "DELETE" }, token),
  listLayouts: (token: string) => request<{ layouts: SavedLayout[] }>("/layouts", {}, token),
  createLayout: (payload: SavedLayoutInput, token: string) =>
    request<{ layout: SavedLayout }>("/layouts", { method: "POST", body: JSON.stringify(payload) }, token),
  updateLayout: (id: string, payload: SavedLayoutInput, token: string) =>
    request<{ layout: SavedLayout }>(`/layouts/${id}`, { method: "PUT", body: JSON.stringify(payload) }, token),
  deleteLayout: (id: string, token: string) => request<void>(`/layouts/${id}`, { method: "DELETE" }, token),
  listEpgSources: (token: string) => request<{ sources: EpgSource[] }>("/epg/sources", {}, token),
  createEpgSource: (payload: EpgSourceInput, token: string) =>
    request<{ source: EpgSource }>("/epg/sources", { method: "POST", body: JSON.stringify(payload) }, token),
  updateEpgSource: (id: string, payload: EpgSourceInput, token: string) =>
    request<{ source: EpgSource }>(`/epg/sources/${id}`, { method: "PUT", body: JSON.stringify(payload) }, token),
  deleteEpgSource: (id: string, token: string) => request<void>(`/epg/sources/${id}`, { method: "DELETE" }, token),
  previewEpgSourceChannels: (id: string, token: string) =>
    request<{ source: EpgSource; channels: EpgPreviewChannel[] }>(`/epg/sources/${id}/channels`, {}, token),
  getNowNext: (channelIds: string[], token: string) =>
    request<{ items: ChannelNowNext[] }>(
      `/epg/now-next?${new URLSearchParams({ channelIds: channelIds.join(",") }).toString()}`,
      {},
      token,
    ),
  testStream: (payload: StreamTestInput, token: string) =>
    request<{ result: StreamTestResult }>("/streams/test", { method: "POST", body: JSON.stringify(payload) }, token),
  getStreamMetadata: (url: StreamTestInput["url"], token: string) =>
    request<{ result: StreamTestResult }>(
      `/streams/metadata?${new URLSearchParams({ url }).toString()}`,
      {},
      token,
    ),
};

interface ChannelPlaybackUrlOptions {
  preferProxy?: boolean;
}

export function getChannelPlaybackUrl(
  channel: Pick<Channel, "id" | "masterHlsUrl" | "playbackMode">,
  options: ChannelPlaybackUrlOptions = {},
) {
  if (options.preferProxy || channel.playbackMode === "PROXY") {
    return `${API_BASE_URL}/streams/channels/${channel.id}/master`;
  }

  return channel.masterHlsUrl;
}
