import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, RadioTower, RefreshCw, ScrollText, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth-context";
import { cn } from "@/lib/utils";
import { getPlaybackModeLabel } from "@/lib/playback-mode";
import { api } from "@/services/api";
import type {
  AdminLogEntry,
  AdminMonitoringSession,
  AuditEvent,
  ChannelViewerCount,
  MonitoringLogCategory,
  MonitoringLogLevel,
} from "@/types/api";

const AUTO_REFRESH_MS = 10_000;

export function AdminObservabilityPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [levelFilter, setLevelFilter] = useState<MonitoringLogLevel | "ALL">("ALL");
  const [categoryFilter, setCategoryFilter] = useState<MonitoringLogCategory | "ALL">("ALL");
  const [searchFilter, setSearchFilter] = useState("");

  const logQueryParams = useMemo(() => {
    const params = new URLSearchParams();

    if (levelFilter !== "ALL") {
      params.set("level", levelFilter);
    }

    if (categoryFilter !== "ALL") {
      params.set("category", categoryFilter);
    }

    if (searchFilter.trim()) {
      params.set("search", searchFilter.trim());
    }

    params.set("limit", "200");
    return params;
  }, [categoryFilter, levelFilter, searchFilter]);

  const monitoringQuery = useQuery({
    queryKey: ["admin-monitoring", token],
    queryFn: async () => {
      if (!token) {
        throw new Error("Missing admin session");
      }

      return (await api.getAdminMonitoring(token)).monitoring;
    },
    enabled: Boolean(token),
    refetchInterval: AUTO_REFRESH_MS,
  });

  const logsQuery = useQuery({
    queryKey: ["admin-monitoring-logs", token, logQueryParams.toString()],
    queryFn: async () => {
      if (!token) {
        throw new Error("Missing admin session");
      }

      return (await api.listAdminLogs(token, logQueryParams)).logs;
    },
    enabled: Boolean(token),
    refetchInterval: AUTO_REFRESH_MS,
  });

  const auditQuery = useQuery({
    queryKey: ["admin-audit-events", token],
    queryFn: async () => {
      if (!token) {
        throw new Error("Missing admin session");
      }

      return (await api.listAuditEvents(token, new URLSearchParams({ limit: "30" }))).events;
    },
    enabled: Boolean(token),
    refetchInterval: AUTO_REFRESH_MS,
  });

  const monitoring = monitoringQuery.data;
  const activeSessions = monitoring?.sessions ?? [];
  const watchingNowSurfaces = useMemo(() => buildWatchingNowSurfaces(activeSessions), [activeSessions]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Observability"
        description="Watch live playback activity, see who is watching what now, inspect per-channel viewer counts, and review structured operational logs without leaving TV-Dash."
        actions={
          <Button
            onClick={() => {
              void Promise.all([
                queryClient.invalidateQueries({ queryKey: ["admin-monitoring", token] }),
                queryClient.invalidateQueries({ queryKey: ["admin-monitoring-logs", token] }),
                queryClient.invalidateQueries({ queryKey: ["admin-audit-events", token] }),
              ]);
            }}
            size="sm"
            variant="secondary"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh now
          </Button>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <SummaryCard
            icon={Users}
            label="Active sessions"
            value={String(monitoring?.summary.activeSessionCount ?? 0)}
            meta="Live playback sessions with a recent heartbeat"
          />
          <SummaryCard
            icon={RadioTower}
            label="Active channels"
            value={String(monitoring?.summary.activeChannelCount ?? 0)}
            meta="Channels with at least one current viewer"
          />
          <SummaryCard
            icon={AlertTriangle}
            label="Warnings"
            value={String(monitoring?.summary.warningLogCount ?? 0)}
            meta="Retained warning events since the current process started"
          />
          <SummaryCard
            icon={RadioTower}
            label="Shared sessions"
            value={String(monitoring?.summary.activeSharedSessionCount ?? 0)}
            meta={`${monitoring?.summary.activeSharedViewerCount ?? 0} viewer(s) currently attached to shared local delivery`}
          />
          <SummaryCard
            icon={Activity}
            label="Shared cache"
            value={
              monitoring?.summary.sharedCacheHitRate === null
                ? "n/a"
                : `${monitoring?.summary.sharedCacheHitRate ?? 0}%`
            }
            meta="Manifest and segment hit rate across active shared sessions"
          />
          <SummaryCard
            icon={ScrollText}
            label="Errors"
            value={String(monitoring?.summary.errorLogCount ?? 0)}
            meta={`Stale sessions expire after ${monitoring?.summary.staleAfterSeconds ?? 45}s`}
          />
        </div>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <Panel className="overflow-hidden" density="flush">
          <SectionHeader
            icon={Activity}
            title="Who Is Watching What Now"
            subtitle={`${activeSessions.length} live playback session(s) grouped into ${watchingNowSurfaces.length} active viewing surface(s).`}
            timestamp={monitoring?.generatedAt}
          />
          {monitoringQuery.isLoading && !monitoring ? (
            <EmptyState label="Loading live session telemetry..." />
          ) : !watchingNowSurfaces.length ? (
            <EmptyState label="No active viewer sessions are reporting right now." />
          ) : (
            <div className="space-y-3 px-3 py-3">
              {watchingNowSurfaces.map((surface) => (
                <WatchingNowSurfaceCard key={surface.id} surface={surface} />
              ))}
            </div>
          )}
        </Panel>

        <Panel className="overflow-hidden" density="flush">
          <SectionHeader
            icon={RadioTower}
            title="Per-Channel Viewer Counts"
            subtitle="Every channel with its current viewer load and the watcher list when present."
            timestamp={monitoring?.generatedAt}
          />
          {monitoringQuery.isLoading && !monitoring ? (
            <EmptyState label="Loading channel viewer counts..." />
          ) : !(monitoring?.channelViewerCounts.length ?? 0) ? (
            <EmptyState label="No channel telemetry is available yet." />
          ) : (
            <div className="max-h-[34rem] space-y-2 overflow-y-auto px-3 py-3">
              {(monitoring?.channelViewerCounts ?? []).map((entry) => (
                <ChannelViewerRow key={entry.channel.id} entry={entry} />
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel className="overflow-hidden" density="flush">
          <SectionHeader
            icon={AlertTriangle}
            title="Recent Failures And Warnings"
            subtitle="Fresh playback, proxy, shared-delivery, guide, and admin-impacting issues captured by structured logs."
            timestamp={monitoring?.generatedAt}
          />
        {monitoringQuery.isLoading && !monitoring ? (
          <EmptyState label="Loading recent failures..." />
        ) : !(monitoring?.recentFailures.length ?? 0) ? (
          <EmptyState label="No warning or error events are retained right now." />
        ) : (
          <div className="grid gap-3 px-3 py-3 lg:grid-cols-2">
            {(monitoring?.recentFailures ?? []).map((entry) => (
              <LogEventCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </Panel>

      <Panel className="overflow-hidden" density="flush">
        <SectionHeader
          icon={ShieldCheck}
          title="Recent Admin Audit Events"
          subtitle="Durable governance records for important administrative changes without storing raw secret values."
          timestamp={auditQuery.data?.[0]?.createdAt ?? monitoring?.generatedAt}
        />
        {auditQuery.isLoading && !auditQuery.data ? (
          <EmptyState label="Loading admin audit events..." />
        ) : !(auditQuery.data?.length ?? 0) ? (
          <EmptyState label="No admin audit events have been recorded yet." />
        ) : (
          <div className="grid gap-3 px-3 py-3 lg:grid-cols-2">
            {auditQuery.data?.map((event) => (
              <AuditEventCard event={event} key={event.id} />
            ))}
          </div>
        )}
      </Panel>

      <Panel className="overflow-hidden" density="flush">
        <SectionHeader
          icon={ScrollText}
          title="Logs Viewer"
          subtitle="Filter structured events by severity, category, or free-text search."
          timestamp={logsQuery.data?.[0]?.timestamp ?? monitoring?.generatedAt}
        />

        <div className="grid gap-3 border-b border-slate-800/80 px-3 py-3 md:grid-cols-[180px_180px_minmax(0,1fr)_auto]">
          <Select onChange={(event) => setLevelFilter(event.target.value as MonitoringLogLevel | "ALL")} uiSize="sm" value={levelFilter}>
            <option value="ALL">All severities</option>
            <option value="error">Errors only</option>
            <option value="warn">Warnings only</option>
            <option value="info">Info only</option>
          </Select>
          <Select
            onChange={(event) => setCategoryFilter(event.target.value as MonitoringLogCategory | "ALL")}
            uiSize="sm"
            value={categoryFilter}
          >
            <option value="ALL">All categories</option>
            <option value="playback">Playback</option>
            <option value="stream">Stream / proxy</option>
            <option value="epg">EPG</option>
            <option value="auth">Auth</option>
            <option value="admin">Admin</option>
            <option value="system">System</option>
          </Select>
          <Input
            onChange={(event) => setSearchFilter(event.target.value)}
            placeholder="Search event names, ids, channel slugs, or detail values"
            uiSize="sm"
            value={searchFilter}
          />
          <Button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["admin-monitoring-logs", token] })}
            size="sm"
            variant="secondary"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {logsQuery.isLoading && !logsQuery.data ? (
          <EmptyState label="Loading structured logs..." />
        ) : !(logsQuery.data?.length ?? 0) ? (
          <EmptyState label="No log entries match the current filters." />
        ) : (
          <div className="max-h-[38rem] overflow-auto">
            <div className="min-w-[960px] divide-y divide-slate-800/80">
              {logsQuery.data?.map((entry) => (
                <div key={entry.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[190px_100px_120px_220px_minmax(0,1fr)]">
                  <div className="text-[12px] text-slate-400">{formatTimestamp(entry.timestamp)}</div>
                  <div>
                    <Badge className={getLogLevelBadgeClassName(entry.level)} size="sm">
                      {entry.level}
                    </Badge>
                  </div>
                  <div>
                    <Badge size="sm">{entry.category}</Badge>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-white">{entry.event}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {entry.channelSlug ?? entry.channelId ?? entry.actorUserId ?? entry.sessionId ?? "No linked entity"}
                    </p>
                  </div>
                  <div className="min-w-0 text-[12px] text-slate-300">
                    <LogDetailBlock entry={entry} variant="table" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      <p className="text-[11px] text-slate-500">
        Auto-refresh runs every {AUTO_REFRESH_MS / 1000} seconds. Active sessions fall out of the live views after{" "}
        {monitoring?.summary.staleAfterSeconds ?? 45} seconds without a heartbeat.
      </p>
    </div>
  );
}

function AuditEventCard({ event }: { event: AuditEvent }) {
  return (
    <div className="rounded-[1.25rem] border border-slate-800/80 bg-slate-950/75 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="border-cyan-400/20 bg-cyan-500/10 text-cyan-100" size="sm">
          {event.targetType}
        </Badge>
        <Badge size="sm">{event.action}</Badge>
      </div>
      <p className="mt-3 text-sm font-semibold text-white">
        {event.targetName ?? event.targetId ?? "Administrative change"}
      </p>
      <p className="mt-1 text-[12px] text-slate-400">
        {event.actorUser?.username ?? event.actorUserId ?? "Unknown actor"} · {event.actorRole ?? "Unknown role"} ·{" "}
        {formatTimestamp(event.createdAt)}
      </p>
      {event.detail ? (
        <dl className="mt-3 grid gap-2 text-[12px] text-slate-300">
          {Object.entries(event.detail).map(([key, value]) => (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-900/70 px-3 py-2" key={`${event.id}-${key}`}>
              <dt className="text-slate-500">{key}</dt>
              <dd className="text-right text-white">{String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

interface WatchingNowSurface {
  id: string;
  sessionType: AdminMonitoringSession["sessionType"];
  pageLabel: string;
  playbackState: AdminMonitoringSession["playbackState"] | "mixed";
  startedAt: string;
  lastSeenAt: string;
  user: AdminMonitoringSession["user"];
  failureKinds: string[];
  channels: Array<{
    sessionId: string;
    name: string;
    slug: string;
    selectedQuality: string | null;
    isMuted: boolean;
    tileIndex: number | null;
    playbackState: AdminMonitoringSession["playbackState"];
  }>;
}

function WatchingNowSurfaceCard({ surface }: { surface: WatchingNowSurface }) {
  const audioLiveCount = surface.channels.filter((channel) => !channel.isMuted).length;
  const mutedCount = surface.channels.length - audioLiveCount;

  return (
    <div className="rounded-[1.35rem] border border-slate-800/80 bg-slate-950/70 p-4 shadow-[0_18px_50px_-35px_rgba(34,211,238,0.35)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-white">{surface.user.username}</p>
            <Badge className="border-cyan-400/20 bg-cyan-500/10 text-cyan-100" size="sm">
              {surface.pageLabel}
            </Badge>
            <Badge className={getPlaybackStateBadgeClassName(surface.playbackState)} size="sm">
              {surface.playbackState}
            </Badge>
            <Badge size="sm">{surface.channels.length} channel(s)</Badge>
            {surface.failureKinds.map((failureKind) => (
              <Badge className="border-rose-400/30 bg-rose-500/10 text-rose-200" key={`${surface.id}-${failureKind}`} size="sm">
                {failureKind}
              </Badge>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-slate-400">
            {surface.sessionType === "MULTIVIEW"
              ? "Watching through the multiview wall with all active channels grouped together."
              : "Watching through the single channel watch page."}
          </p>
        </div>

        <div className="flex items-start gap-2">
          <Badge size="sm">{surface.user.role === "ADMIN" ? "Admin" : "User"}</Badge>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-slate-800/80 bg-slate-900/65 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Channels</p>
          <Badge className="border-slate-700/70 bg-slate-950/70 text-slate-300" size="sm">
            {audioLiveCount > 0 ? `${audioLiveCount} audio live` : "Muted output"}
            {mutedCount > 0 ? ` · ${mutedCount} muted` : ""}
          </Badge>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {surface.channels.map((channel) => (
            <div
              className="min-w-[10rem] rounded-2xl border border-slate-700/80 bg-slate-950/80 px-3 py-2.5"
              key={channel.sessionId}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[13px] font-semibold text-white">{channel.name}</p>
                {typeof channel.tileIndex === "number" ? (
                  <Badge className="border-slate-700/70 bg-slate-900/90 text-slate-300" size="sm">
                    Tile {channel.tileIndex + 1}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                {channel.slug} · {channel.selectedQuality ?? "AUTO"} · {channel.isMuted ? "Muted" : "Audio live"}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-1.5 text-[12px] text-slate-400 md:grid-cols-2">
        <p>Started {formatTimestamp(surface.startedAt)}</p>
        <p>Last active {formatTimestamp(surface.lastSeenAt)}</p>
      </div>
    </div>
  );
}

function buildWatchingNowSurfaces(sessions: AdminMonitoringSession[]): WatchingNowSurface[] {
  const surfaces = new Map<string, WatchingNowSurface>();

  sessions.forEach((session) => {
    const groupingKey =
      session.sessionType === "MULTIVIEW" ? `${session.user.id}:MULTIVIEW` : `${session.sessionId}:SINGLE_VIEW`;
    const existingSurface = surfaces.get(groupingKey);

    if (!existingSurface) {
      surfaces.set(groupingKey, {
        id: groupingKey,
        sessionType: session.sessionType,
        pageLabel: session.sessionType === "MULTIVIEW" ? "Multiview page" : "Watch page",
        playbackState: session.playbackState,
        startedAt: session.startedAt,
        lastSeenAt: session.lastSeenAt,
        user: session.user,
        failureKinds: session.failureKind ? [session.failureKind] : [],
        channels: session.channel
          ? [
              {
                sessionId: session.sessionId,
                name: session.channel.name,
                slug: session.channel.slug,
                selectedQuality: session.selectedQuality,
                isMuted: session.isMuted,
                tileIndex: session.tileIndex,
                playbackState: session.playbackState,
              },
            ]
          : [],
      });
      return;
    }

    existingSurface.startedAt =
      new Date(session.startedAt).getTime() < new Date(existingSurface.startedAt).getTime() ? session.startedAt : existingSurface.startedAt;
    existingSurface.lastSeenAt =
      new Date(session.lastSeenAt).getTime() > new Date(existingSurface.lastSeenAt).getTime() ? session.lastSeenAt : existingSurface.lastSeenAt;
    existingSurface.playbackState = mergeSurfacePlaybackState(existingSurface.playbackState, session.playbackState);

    if (session.failureKind && !existingSurface.failureKinds.includes(session.failureKind)) {
      existingSurface.failureKinds.push(session.failureKind);
    }

    if (session.channel) {
      existingSurface.channels.push({
        sessionId: session.sessionId,
        name: session.channel.name,
        slug: session.channel.slug,
        selectedQuality: session.selectedQuality,
        isMuted: session.isMuted,
        tileIndex: session.tileIndex,
        playbackState: session.playbackState,
      });
    }
  });

  return [...surfaces.values()]
    .map((surface) => ({
      ...surface,
      channels: [...surface.channels].sort((left, right) => {
        const leftTileIndex = left.tileIndex ?? Number.MAX_SAFE_INTEGER;
        const rightTileIndex = right.tileIndex ?? Number.MAX_SAFE_INTEGER;

        if (leftTileIndex !== rightTileIndex) {
          return leftTileIndex - rightTileIndex;
        }

        return left.name.localeCompare(right.name);
      }),
    }))
    .sort((left, right) => new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime());
}

function mergeSurfacePlaybackState(
  currentState: WatchingNowSurface["playbackState"],
  nextState: AdminMonitoringSession["playbackState"],
): WatchingNowSurface["playbackState"] {
  if (currentState === nextState) {
    return currentState;
  }

  if (currentState === "error" || nextState === "error") {
    return "error";
  }

  if (isAttentionPlaybackState(currentState) || isAttentionPlaybackState(nextState)) {
    return "mixed";
  }

  if (currentState === "playing" && nextState !== "playing") {
    return "mixed";
  }

  if (currentState !== "playing" && nextState === "playing") {
    return "mixed";
  }

  return "mixed";
}

function isAttentionPlaybackState(state: WatchingNowSurface["playbackState"]) {
  return state === "retrying" || state === "buffering" || state === "loading";
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  meta,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  meta: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/65 p-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-200">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
        </div>
      </div>
      <p className="mt-2 text-[12px] text-slate-400">{meta}</p>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  timestamp,
}: {
  icon: typeof Users;
  title: string;
  subtitle: string;
  timestamp?: string;
}) {
  return (
    <div className="border-b border-slate-800/80 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950/80 text-cyan-200">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{title}</p>
            <p className="text-[12px] text-slate-400">{subtitle}</p>
          </div>
        </div>
        <p className="text-[11px] text-slate-500">{timestamp ? `Updated ${formatTimestamp(timestamp)}` : "Waiting for data"}</p>
      </div>
    </div>
  );
}

function ChannelViewerRow({ entry }: { entry: ChannelViewerCount }) {
  const sharedCacheAccessCount = entry.sharedSession
    ? entry.sharedSession.cache.manifestHitCount +
      entry.sharedSession.cache.manifestMissCount +
      entry.sharedSession.cache.segmentHitCount +
      entry.sharedSession.cache.segmentMissCount
    : 0;
  const sharedCacheHitRate =
    entry.sharedSession && sharedCacheAccessCount > 0
      ? Math.round(
          ((entry.sharedSession.cache.manifestHitCount + entry.sharedSession.cache.segmentHitCount) /
            sharedCacheAccessCount) *
            100,
        )
      : null;

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-white">{entry.channel.name}</p>
            <Badge size="sm">{entry.viewerCount} viewer(s)</Badge>
            <Badge size="sm">{entry.singleViewCount} single</Badge>
            <Badge size="sm">{entry.multiviewCount} multiview</Badge>
            {entry.sharedSession ? (
              <Badge className="border-cyan-400/30 bg-cyan-500/10 text-cyan-100" size="sm">
                Shared session
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {entry.channel.slug} · {getPlaybackModeLabel(entry.channel.playbackMode)} ·{" "}
            {entry.channel.sourceMode === "MANUAL_VARIANTS" ? "Manual variants" : "Master playlist"}
          </p>
        </div>
        <Badge className={entry.viewerCount > 0 ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : undefined} size="sm">
          {entry.viewerCount > 0 ? "Live audience" : "No current viewers"}
        </Badge>
      </div>

      {entry.sharedSession ? (
        <div className="mt-3 rounded-2xl border border-cyan-400/15 bg-cyan-500/5 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge size="sm">{entry.sharedSession.upstreamState}</Badge>
            <Badge size="sm">{entry.sharedSession.viewerCount} attached viewer(s)</Badge>
            <Badge size="sm">{entry.sharedSession.cache.entryCount} cache entr{entry.sharedSession.cache.entryCount === 1 ? "y" : "ies"}</Badge>
            {sharedCacheHitRate !== null ? <Badge size="sm">{sharedCacheHitRate}% hit rate</Badge> : null}
          </div>
          <p className="mt-2 text-[11px] text-slate-300">
            Last shared access {formatTimestamp(entry.sharedSession.lastAccessAt)} · expires {formatTimestamp(entry.sharedSession.expiresAt)}
            {entry.sharedSession.lastUpstreamRequestAt ? ` · upstream ${formatTimestamp(entry.sharedSession.lastUpstreamRequestAt)}` : ""}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {entry.sharedSession.cache.manifestEntryCount} manifest, {entry.sharedSession.cache.segmentEntryCount} segment cache entries ·{" "}
            {formatBytes(entry.sharedSession.cache.bytesUsed)} retained locally · {entry.sharedSession.mappedAssetCount} upstream asset id(s)
          </p>
          {entry.sharedSession.lastError ? (
            <p className="mt-2 text-[11px] text-rose-200">
              Last shared-session failure: {entry.sharedSession.lastError}
            </p>
          ) : null}
        </div>
      ) : null}

      {entry.watchers.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {entry.watchers.map((watcher) => (
            <div
              key={watcher.sessionId}
              className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-2.5 py-2 text-[11px] text-slate-300"
            >
              <p className="font-semibold text-white">{watcher.username}</p>
              <p className="mt-0.5">
                {watcher.playbackState}
                {typeof watcher.tileIndex === "number" ? ` · tile ${watcher.tileIndex + 1}` : ""}
              </p>
              <p className="mt-0.5 text-slate-500">
                {watcher.selectedQuality ?? "AUTO"} · {watcher.isMuted ? "Muted" : "Audio live"} · {formatTimestamp(watcher.lastSeenAt)}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LogEventCard({ entry }: { entry: AdminLogEntry }) {
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={getLogLevelBadgeClassName(entry.level)} size="sm">
          {entry.level}
        </Badge>
        <Badge size="sm">{entry.category}</Badge>
        {entry.failureKind ? (
          <Badge className="border-rose-400/30 bg-rose-500/10 text-rose-200" size="sm">
            {entry.failureKind}
          </Badge>
        ) : null}
      </div>
      <p className="mt-2 text-sm font-semibold text-white">{entry.event}</p>
      <LogDetailBlock entry={entry} variant="card" />
      <p className="mt-2 text-[11px] text-slate-500">
        {entry.channelSlug ?? entry.channelId ?? entry.actorUserId ?? entry.sessionId ?? "System scope"} · {formatTimestamp(entry.timestamp)}
      </p>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="px-4 py-6 text-sm text-slate-400">{label}</div>;
}

function LogDetailBlock({
  entry,
  variant,
}: {
  entry: AdminLogEntry;
  variant: "card" | "table";
}) {
  const detailLines = getLogDetailLines(entry);

  if (!detailLines.length) {
    return (
      <p className={variant === "card" ? "mt-1 text-[12px] text-slate-300" : "text-[12px] text-slate-400"}>
        Structured event with no additional detail payload.
      </p>
    );
  }

  return (
    <div className={variant === "card" ? "mt-2 space-y-1.5 text-[12px] text-slate-300" : "space-y-1 text-[12px] text-slate-300"}>
      {detailLines.map((line, index) => (
        <p
          key={`${entry.id}-detail-${index}`}
          className={cn("leading-5", variant === "table" && index > 2 && "text-slate-400")}
        >
          {line}
        </p>
      ))}
    </div>
  );
}

function getLogDetailLines(entry: AdminLogEntry) {
  const issueSummary = entry.detail?.issueSummary;
  if (typeof issueSummary === "string" && issueSummary.trim()) {
    return issueSummary
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);
  }

  const detailEntries = Object.entries(entry.detail ?? {})
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 5)
    .map(([key, value]) => `${key}: ${String(value)}`);

  if (detailEntries.length) {
    return detailEntries;
  }

  if (entry.failureKind) {
    return [`Failure class: ${entry.failureKind}`];
  }

  return [];
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function getPlaybackStateBadgeClassName(state: AdminMonitoringSession["playbackState"] | "mixed") {
  switch (state) {
    case "playing":
      return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
    case "mixed":
      return "border-cyan-400/30 bg-cyan-500/10 text-cyan-100";
    case "error":
      return "border-rose-400/30 bg-rose-500/10 text-rose-200";
    case "retrying":
    case "buffering":
    case "loading":
      return "border-amber-400/30 bg-amber-500/10 text-amber-100";
    default:
      return "";
  }
}

function getLogLevelBadgeClassName(level: MonitoringLogLevel) {
  return cn(
    level === "error" && "border-rose-400/30 bg-rose-500/10 text-rose-200",
    level === "warn" && "border-amber-400/30 bg-amber-500/10 text-amber-100",
    level === "info" && "border-cyan-400/30 bg-cyan-500/10 text-cyan-100",
  );
}
