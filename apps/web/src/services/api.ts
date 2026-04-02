import type { AuthResponse, Channel, ChannelGroup, Favorite, SavedLayout, StreamTestResult, User } from "@/types/api";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

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
  login: (payload: { email: string; password: string }) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  me: (token: string) => request<{ user: User | null }>("/auth/me", { method: "GET" }, token),
  listChannels: (token: string | null, params?: URLSearchParams) =>
    request<{ channels: Channel[] }>(`/channels${params ? `?${params.toString()}` : ""}`, {}, token),
  getChannelBySlug: (slug: string, token: string | null) =>
    request<{ channel: Channel }>(`/channels/slug/${slug}`, {}, token),
  createChannel: (payload: unknown, token: string) =>
    request<{ channel: Channel }>("/channels", { method: "POST", body: JSON.stringify(payload) }, token),
  updateChannel: (id: string, payload: unknown, token: string) =>
    request<{ channel: Channel }>(`/channels/${id}`, { method: "PUT", body: JSON.stringify(payload) }, token),
  deleteChannel: (id: string, token: string) =>
    request<void>(`/channels/${id}`, { method: "DELETE" }, token),
  listGroups: (token: string | null) => request<{ groups: ChannelGroup[] }>("/groups", {}, token),
  createGroup: (payload: unknown, token: string) =>
    request<{ group: ChannelGroup }>("/groups", { method: "POST", body: JSON.stringify(payload) }, token),
  updateGroup: (id: string, payload: unknown, token: string) =>
    request<{ group: ChannelGroup }>(`/groups/${id}`, { method: "PUT", body: JSON.stringify(payload) }, token),
  deleteGroup: (id: string, token: string) =>
    request<void>(`/groups/${id}`, { method: "DELETE" }, token),
  listFavorites: (token: string) => request<{ favorites: Favorite[] }>("/favorites", {}, token),
  addFavorite: (channelId: string, token: string) =>
    request<{ favorite: Favorite }>("/favorites", { method: "POST", body: JSON.stringify({ channelId }) }, token),
  removeFavorite: (channelId: string, token: string) =>
    request<void>(`/favorites/${channelId}`, { method: "DELETE" }, token),
  listLayouts: (token: string) => request<{ layouts: SavedLayout[] }>("/layouts", {}, token),
  createLayout: (payload: unknown, token: string) =>
    request<{ layout: SavedLayout }>("/layouts", { method: "POST", body: JSON.stringify(payload) }, token),
  updateLayout: (id: string, payload: unknown, token: string) =>
    request<{ layout: SavedLayout }>(`/layouts/${id}`, { method: "PUT", body: JSON.stringify(payload) }, token),
  deleteLayout: (id: string, token: string) => request<void>(`/layouts/${id}`, { method: "DELETE" }, token),
  testStream: (url: string, token: string) =>
    request<{ result: StreamTestResult }>("/streams/test", { method: "POST", body: JSON.stringify({ url }) }, token),
  getStreamMetadata: (url: string, token: string) =>
    request<{ result: StreamTestResult }>(
      `/streams/metadata?${new URLSearchParams({ url }).toString()}`,
      {},
      token,
    ),
};
