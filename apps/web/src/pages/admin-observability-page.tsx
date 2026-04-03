import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, RadioTower, RefreshCw, ScrollText, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth-context";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import type {
  AdminLogEntry,
  AdminMonitoringSession,
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

  const monitoring = monitoringQuery.data;
  const activeSessions = monitoring?.sessions ?? [];

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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
            subtitle={`${activeSessions.length} live playback session(s) across single-view and multiview surfaces.`}
            timestamp={monitoring?.generatedAt}
          />
          {monitoringQuery.isLoading && !monitoring ? (
            <EmptyState label="Loading live session telemetry..." />
          ) : !activeSessions.length ? (
            <EmptyState label="No active viewer sessions are reporting right now." />
          ) : (
            <div className="divide-y divide-slate-800/80">
              {activeSessions.map((session) => (
                <div key={session.sessionId} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-white">{session.user.username}</p>
                      <Badge size="sm">{session.sessionType === "SINGLE_VIEW" ? "Single view" : `Multiview${typeof session.tileIndex === "number" ? ` tile ${session.tileIndex + 1}` : ""}`}</Badge>
                      <Badge className={getPlaybackStateBadgeClassName(session.playbackState)} size="sm">
                        {session.playbackState}
                      </Badge>
                      {session.failureKind ? (
                        <Badge className="border-rose-400/30 bg-rose-500/10 text-rose-200" size="sm">
                          {session.failureKind}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-[13px] text-slate-300">
                      {session.channel ? session.channel.name : "Channel unavailable"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {session.channel ? `${session.channel.slug} · ${session.selectedQuality ?? "AUTO"}` : "Channel metadata missing"}
                    </p>
                  </div>

                  <div className="grid gap-1.5 text-[12px] text-slate-400">
                    <p>Started {formatTimestamp(session.startedAt)}</p>
                    <p>Last active {formatTimestamp(session.lastSeenAt)}</p>
                    <p>{session.isMuted ? "Muted output" : "Audio live"}</p>
                  </div>

                  <div className="flex items-start justify-end">
                    <Badge size="sm">{session.user.role === "ADMIN" ? "Admin" : "User"}</Badge>
                  </div>
                </div>
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
          subtitle="Fresh playback, proxy, guide, and admin-impacting issues captured by structured logs."
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
                    <p className="line-clamp-2">{buildLogDetailSummary(entry)}</p>
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
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-white">{entry.channel.name}</p>
            <Badge size="sm">{entry.viewerCount} viewer(s)</Badge>
            <Badge size="sm">{entry.singleViewCount} single</Badge>
            <Badge size="sm">{entry.multiviewCount} multiview</Badge>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {entry.channel.slug} · {entry.channel.playbackMode === "PROXY" ? "Proxy playback" : "Direct playback"} ·{" "}
            {entry.channel.sourceMode === "MANUAL_VARIANTS" ? "Manual variants" : "Master playlist"}
          </p>
        </div>
        <Badge className={entry.viewerCount > 0 ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : undefined} size="sm">
          {entry.viewerCount > 0 ? "Live audience" : "No current viewers"}
        </Badge>
      </div>

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
      <p className="mt-1 text-[12px] text-slate-300">{buildLogDetailSummary(entry)}</p>
      <p className="mt-2 text-[11px] text-slate-500">
        {entry.channelSlug ?? entry.channelId ?? entry.actorUserId ?? entry.sessionId ?? "System scope"} · {formatTimestamp(entry.timestamp)}
      </p>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="px-4 py-6 text-sm text-slate-400">{label}</div>;
}

function buildLogDetailSummary(entry: AdminLogEntry) {
  const detailEntries = Object.entries(entry.detail ?? {})
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`);

  if (detailEntries.length) {
    return detailEntries.join(" · ");
  }

  if (entry.failureKind) {
    return `Failure class ${entry.failureKind}`;
  }

  return "Structured event with no additional detail payload.";
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

function getPlaybackStateBadgeClassName(state: AdminMonitoringSession["playbackState"]) {
  if (state === "playing") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  }

  if (state === "error") {
    return "border-rose-400/30 bg-rose-500/10 text-rose-200";
  }

  if (state === "retrying" || state === "buffering" || state === "loading") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }

  return "";
}

function getLogLevelBadgeClassName(level: MonitoringLogLevel) {
  return cn(
    level === "error" && "border-rose-400/30 bg-rose-500/10 text-rose-200",
    level === "warn" && "border-amber-400/30 bg-amber-500/10 text-amber-100",
    level === "info" && "border-cyan-400/30 bg-cyan-500/10 text-cyan-100",
  );
}
