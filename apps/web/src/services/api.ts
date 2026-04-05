import type {
  EpgChannelMappingInput,
  EpgSourceFileImportInput,
  ChannelGroupInput,
  ChannelInput,
  EpgSourceInput,
  LoginInput,
  PlaybackSessionEndInput,
  PlaybackSessionHeartbeatInput,
  RecordingJobInput,
  RecordingJobUpdateInput,
  RecordingRuleInput,
  ProgramEntryInput,
  SavedLayoutInput,
  StreamTestInput,
} from "@tv-dash/shared";
import { isSharedPlaybackMode } from "@tv-dash/shared";
import type {
  AdminLogEntry,
  AuditEvent,
  AdminMonitoringSnapshot,
  AuthResponse,
  Channel,
  ChannelConfig,
  ChannelDiagnostics,
  ChannelGroup,
  ChannelNowNext,
  ChannelProgramPlayback,
  ChannelGuideWindow,
  ChannelStreamSessionStatus,
  EpgSourceChannel,
  EpgSource,
  EpgSourceDiagnostics,
  Favorite,
  LiveTimeshiftStatus,
  ProgramEntry,
  RecordingJob,
  RecordingQualityOption,
  RecordingRule,
  SavedLayout,
  StreamTestResult,
  User,
} from "@/types/api";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";
export const AUTH_EXPIRED_EVENT = "tv-dash:auth-expired";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function notifyAuthExpired(message: string) {
  window.dispatchEvent(
    new CustomEvent(AUTH_EXPIRED_EVENT, {
      detail: {
        message,
      },
    }),
  );
}

async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toUpperCase();

  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  if (method === "GET" || method === "HEAD") {
    if (!headers.has("cache-control")) {
      headers.set("cache-control", "no-cache, no-store, max-age=0");
    }

    if (!headers.has("pragma")) {
      headers.set("pragma", "no-cache");
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: init.cache ?? (method === "GET" || method === "HEAD" ? "no-store" : undefined),
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.message ?? "Request failed";

    if (response.status === 401 && token) {
      notifyAuthExpired(message);
    }

    throw new ApiError(message, response.status);
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
  logout: (token: string) => request<void>("/auth/logout", { method: "POST" }, token),
  listChannels: (token: string | null, params?: URLSearchParams) =>
    request<{ channels: Channel[] }>(`/channels${params ? `?${params.toString()}` : ""}`, {}, token),
  getChannelConfig: (id: string, token: string) =>
    request<{ channel: ChannelConfig }>(`/channels/${id}/config`, {}, token),
  getChannelTimeshiftStatus: (id: string, token: string | null) =>
    request<{ status: LiveTimeshiftStatus }>(`/streams/channels/${id}/timeshift/status`, {}, token),
  getChannelStreamSessionStatus: (id: string, token: string | null) =>
    request<{ status: ChannelStreamSessionStatus }>(`/streams/channels/${id}/session/status`, {}, token),
  getChannelDiagnostics: (id: string, token: string) =>
    request<{ diagnostics: ChannelDiagnostics }>(`/diagnostics/channels/${id}`, {}, token),
  getAdminMonitoring: (token: string) =>
    request<{ monitoring: AdminMonitoringSnapshot }>("/diagnostics/monitoring", {}, token),
  listAdminLogs: (token: string, params?: URLSearchParams) =>
    request<{ logs: AdminLogEntry[] }>(`/diagnostics/logs${params ? `?${params.toString()}` : ""}`, {}, token),
  listAuditEvents: (token: string, params?: URLSearchParams) =>
    request<{ events: AuditEvent[] }>(`/audit/events${params ? `?${params.toString()}` : ""}`, {}, token),
  heartbeatPlaybackSessions: (payload: PlaybackSessionHeartbeatInput, token: string, keepalive = false) =>
    request<void>(
      "/diagnostics/playback-sessions/heartbeat",
      { method: "POST", body: JSON.stringify(payload), keepalive },
      token,
    ),
  endPlaybackSessions: (payload: PlaybackSessionEndInput, token: string, keepalive = false) =>
    request<void>(
      "/diagnostics/playback-sessions/end",
      { method: "POST", body: JSON.stringify(payload), keepalive },
      token,
    ),
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
  listRecordingJobs: (token: string, params?: URLSearchParams) =>
    request<{ jobs: RecordingJob[] }>(`/recordings${params ? `?${params.toString()}` : ""}`, {}, token),
  listRecordingRules: (token: string, params?: URLSearchParams) =>
    request<{ rules: RecordingRule[] }>(`/recording-rules${params ? `?${params.toString()}` : ""}`, {}, token),
  listRecordingQualities: (channelId: string, token: string) =>
    request<{ qualities: RecordingQualityOption[] }>(`/recordings/channels/${channelId}/qualities`, {}, token),
  getRecordingJob: (id: string, token: string) => request<{ job: RecordingJob }>(`/recordings/${id}`, {}, token),
  getRecordingRule: (id: string, token: string) => request<{ rule: RecordingRule }>(`/recording-rules/${id}`, {}, token),
  createRecordingJob: (payload: RecordingJobInput, token: string) =>
    request<{ job: RecordingJob }>("/recordings", { method: "POST", body: JSON.stringify(payload) }, token),
  createRecordingRule: (payload: RecordingRuleInput, token: string) =>
    request<{ rule: RecordingRule }>("/recording-rules", { method: "POST", body: JSON.stringify(payload) }, token),
  updateRecordingJob: (id: string, payload: RecordingJobUpdateInput, token: string) =>
    request<{ job: RecordingJob }>(`/recordings/${id}`, { method: "PUT", body: JSON.stringify(payload) }, token),
  updateRecordingRule: (id: string, payload: RecordingRuleInput, token: string) =>
    request<{ rule: RecordingRule }>(`/recording-rules/${id}`, { method: "PUT", body: JSON.stringify(payload) }, token),
  updateRecordingRetention: (id: string, isProtected: boolean, token: string) =>
    request<{ job: RecordingJob }>(
      `/recordings/${id}/retention`,
      { method: "PUT", body: JSON.stringify({ isProtected }) },
      token,
    ),
  cancelRecordingJob: (id: string, token: string) =>
    request<{ job: RecordingJob }>(`/recordings/${id}/cancel`, { method: "POST" }, token),
  stopRecordingJob: (id: string, token: string) =>
    request<{ job: RecordingJob }>(`/recordings/${id}/stop`, { method: "POST" }, token),
  deleteRecordingJob: (id: string, token: string) => request<void>(`/recordings/${id}`, { method: "DELETE" }, token),
  deleteRecordingRule: (id: string, token: string) => request<void>(`/recording-rules/${id}`, { method: "DELETE" }, token),
  getRecordingPlaybackAccess: (id: string, token: string) =>
    request<{ playbackUrl: string }>(`/recordings/${id}/playback-access`, {}, token),
  listEpgSources: (token: string) => request<{ sources: EpgSource[] }>("/epg/sources", {}, token),
  getEpgSourceDiagnostics: (id: string, token: string) =>
    request<{ diagnostics: EpgSourceDiagnostics }>(`/diagnostics/epg-sources/${id}`, {}, token),
  createEpgSource: (payload: EpgSourceInput, token: string) =>
    request<{ source: EpgSource }>("/epg/sources", { method: "POST", body: JSON.stringify(payload) }, token),
  updateEpgSource: (id: string, payload: EpgSourceInput, token: string) =>
    request<{ source: EpgSource }>(`/epg/sources/${id}`, { method: "PUT", body: JSON.stringify(payload) }, token),
  deleteEpgSource: (id: string, token: string) => request<void>(`/epg/sources/${id}`, { method: "DELETE" }, token),
  importEpgSourceFromUrl: (id: string, token: string) =>
    request<{ source: EpgSource }>(`/epg/sources/${id}/import-url`, { method: "POST" }, token),
  importEpgSourceFromFile: (id: string, payload: EpgSourceFileImportInput, token: string) =>
    request<{ source: EpgSource }>(`/epg/sources/${id}/import-file`, { method: "POST", body: JSON.stringify(payload) }, token),
  previewEpgSourceChannels: (id: string, token: string, params?: URLSearchParams) =>
    request<{ source: EpgSource; channels: EpgSourceChannel[] }>(
      `/epg/sources/${id}/channels${params ? `?${params.toString()}` : ""}`,
      {},
      token,
    ),
  updateEpgChannelMapping: (payload: EpgChannelMappingInput, token: string) =>
    request<{ mapping: unknown }>("/epg/mappings", { method: "POST", body: JSON.stringify(payload) }, token),
  listManualPrograms: (token: string, params?: URLSearchParams) =>
    request<{ programs: ProgramEntry[] }>(`/epg/programs/manual${params ? `?${params.toString()}` : ""}`, {}, token),
  createManualProgram: (payload: ProgramEntryInput, token: string) =>
    request<{ program: ProgramEntry }>("/epg/programs/manual", { method: "POST", body: JSON.stringify(payload) }, token),
  updateManualProgram: (id: string, payload: ProgramEntryInput, token: string) =>
    request<{ program: ProgramEntry }>(`/epg/programs/manual/${id}`, { method: "PUT", body: JSON.stringify(payload) }, token),
  deleteManualProgram: (id: string, token: string) =>
    request<void>(`/epg/programs/manual/${id}`, { method: "DELETE" }, token),
  getChannelGuideWindow: (channelId: string, startAt: string, endAt: string, token: string) =>
    request<{ guide: ChannelGuideWindow }>(
      `/epg/channels/${channelId}/guide?${new URLSearchParams({ startAt, endAt }).toString()}`,
      {},
      token,
    ),
  getChannelProgramPlayback: (channelId: string, programId: string, token: string) =>
    request<{ playback: ChannelProgramPlayback }>(`/epg/channels/${channelId}/programs/${programId}/playback`, {}, token),
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
  preferTimeshift?: boolean;
  sessionStatus?: Pick<
    ChannelStreamSessionStatus,
    "defaultPlaybackUrl" | "livePlaybackUrl" | "bufferedPlaybackUrl" | "timeshift"
  > | null;
  timeshiftStatus?: Pick<LiveTimeshiftStatus, "available"> | null;
}

export interface ChannelPlaybackTargets {
  livePlaybackUrl: string | null;
  bufferedPlaybackUrl: string | null;
  defaultPlaybackUrl: string | null;
}

export function getChannelPlaybackTargets(
  channel: Pick<Channel, "id" | "masterHlsUrl" | "playbackMode" | "sourceMode" | "timeshiftEnabled">,
  options: ChannelPlaybackUrlOptions = {},
) : ChannelPlaybackTargets {
  if (options.sessionStatus) {
    return {
      livePlaybackUrl: options.sessionStatus.livePlaybackUrl,
      bufferedPlaybackUrl: options.sessionStatus.bufferedPlaybackUrl,
      defaultPlaybackUrl: options.sessionStatus.defaultPlaybackUrl,
    };
  }

  if (options.preferTimeshift) {
    const bufferedPlaybackUrl = `${API_BASE_URL}/streams/channels/${channel.id}/timeshift/master`;
    return {
      livePlaybackUrl: null,
      bufferedPlaybackUrl,
      defaultPlaybackUrl: bufferedPlaybackUrl,
    };
  }

  if (channel.timeshiftEnabled === true && options.timeshiftStatus?.available === true) {
    const livePlaybackUrl = isSharedPlaybackMode(channel.playbackMode)
      ? `${API_BASE_URL}/streams/channels/${channel.id}/shared/master`
      : `${API_BASE_URL}/streams/channels/${channel.id}/master`;
    const bufferedPlaybackUrl = `${API_BASE_URL}/streams/channels/${channel.id}/timeshift/master`;

    return {
      livePlaybackUrl,
      bufferedPlaybackUrl,
      defaultPlaybackUrl: bufferedPlaybackUrl,
    };
  }

  if (isSharedPlaybackMode(channel.playbackMode)) {
    const livePlaybackUrl = `${API_BASE_URL}/streams/channels/${channel.id}/shared/master`;
    return {
      livePlaybackUrl,
      bufferedPlaybackUrl: channel.timeshiftEnabled ? `${API_BASE_URL}/streams/channels/${channel.id}/timeshift/master` : null,
      defaultPlaybackUrl: livePlaybackUrl,
    };
  }

  if (options.preferProxy || channel.playbackMode === "PROXY" || channel.sourceMode === "MANUAL_VARIANTS") {
    const livePlaybackUrl = `${API_BASE_URL}/streams/channels/${channel.id}/master`;
    return {
      livePlaybackUrl,
      bufferedPlaybackUrl: channel.timeshiftEnabled ? `${API_BASE_URL}/streams/channels/${channel.id}/timeshift/master` : null,
      defaultPlaybackUrl: livePlaybackUrl,
    };
  }

  return {
    livePlaybackUrl: channel.masterHlsUrl,
    bufferedPlaybackUrl: null,
    defaultPlaybackUrl: channel.masterHlsUrl,
  };
}

export function getChannelPlaybackUrl(
  channel: Pick<Channel, "id" | "masterHlsUrl" | "playbackMode" | "sourceMode" | "timeshiftEnabled">,
  options: ChannelPlaybackUrlOptions = {},
) {
  return getChannelPlaybackTargets(channel, options).defaultPlaybackUrl;
}

export function resolveApiUrl(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const apiOrigin = API_BASE_URL.replace(/\/api$/, "");
  return `${apiOrigin}${path}`;
}
