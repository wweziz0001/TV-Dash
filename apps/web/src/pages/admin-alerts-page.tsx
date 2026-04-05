import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CheckCheck, RefreshCw, ShieldAlert, Siren, XCircle } from "lucide-react";
import { toast } from "react-hot-toast";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth-context";
import { api, appendAlertFilterParams } from "@/services/api";
import type { OperationalAlert } from "@/types/api";

const AUTO_REFRESH_MS = 15_000;

export function AdminAlertsPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [view, setView] = useState<"ACTIVE" | "HISTORY" | "ALL">("ACTIVE");
  const [severity, setSeverity] = useState<"ALL" | OperationalAlert["severity"]>("ALL");
  const [category, setCategory] = useState<"ALL" | OperationalAlert["category"]>("ALL");
  const [status, setStatus] = useState<"ALL" | OperationalAlert["status"]>("ALL");
  const [search, setSearch] = useState("");

  const params = useMemo(() => {
    const nextParams = new URLSearchParams();
    nextParams.set("view", view);

    appendAlertFilterParams(nextParams, {
      statuses: status === "ALL" ? [] : [status],
      categories: category === "ALL" ? [] : [category],
      severities: severity === "ALL" ? [] : [severity],
    });

    if (search.trim()) {
      nextParams.set("search", search.trim());
    }

    nextParams.set("limit", "150");
    return nextParams;
  }, [category, search, severity, status, view]);

  const alertsQuery = useQuery({
    queryKey: ["admin-alerts", token, params.toString()],
    queryFn: async () => {
      if (!token) {
        throw new Error("Missing admin session");
      }

      return api.listAlerts(token, params);
    },
    enabled: Boolean(token),
    refetchInterval: AUTO_REFRESH_MS,
  });

  const actionMutation = useMutation({
    mutationFn: async (input: { alertId: string; action: "acknowledge" | "resolve" | "dismiss" }) => {
      if (!token) {
        throw new Error("Missing admin session");
      }

      if (input.action === "acknowledge") {
        return api.acknowledgeAlert(input.alertId, token);
      }

      if (input.action === "resolve") {
        return api.resolveAlert(input.alertId, token);
      }

      return api.dismissAlert(input.alertId, token);
    },
    onSuccess: (_, variables) => {
      const message =
        variables.action === "acknowledge"
          ? "Alert acknowledged"
          : variables.action === "resolve"
            ? "Alert resolved"
            : "Alert dismissed";
      toast.success(message);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-alerts", token] }),
        queryClient.invalidateQueries({ queryKey: ["admin-alert-summary", token] }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to update alert");
    },
  });

  const alerts = alertsQuery.data?.alerts ?? [];
  const summary = alertsQuery.data?.summary;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Alerts center"
        description="Track active operational issues, recent recoveries, and high-value system notifications in one operator-focused queue."
        actions={
          <Button
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ["admin-alerts", token] });
            }}
            size="sm"
            variant="secondary"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh now
          </Button>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <SummaryCard icon={BellRing} label="New" meta="Unread notifications and active issues" value={String(summary?.newCount ?? 0)} />
          <SummaryCard icon={ShieldAlert} label="Active" meta="Currently unresolved operational issues" value={String(summary?.activeCount ?? 0)} />
          <SummaryCard icon={Siren} label="Critical" meta="Active issues at critical severity" value={String(summary?.criticalCount ?? 0)} />
          <SummaryCard icon={CheckCheck} label="Resolved" meta="Closed alerts retained for history" value={String(summary?.resolvedCount ?? 0)} />
          <SummaryCard icon={XCircle} label="Dismissed" meta="Archived by operator action" value={String(summary?.dismissedCount ?? 0)} />
        </div>
      </PageHeader>

      <Panel className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[170px_170px_170px_170px_minmax(0,1fr)]">
          <Select onChange={(event) => setView(event.target.value as typeof view)} uiSize="sm" value={view}>
            <option value="ACTIVE">Active issues</option>
            <option value="HISTORY">History only</option>
            <option value="ALL">Everything</option>
          </Select>
          <Select onChange={(event) => setSeverity(event.target.value as typeof severity)} uiSize="sm" value={severity}>
            <option value="ALL">All severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="ERROR">Error</option>
            <option value="WARNING">Warning</option>
            <option value="SUCCESS">Success</option>
            <option value="INFO">Info</option>
          </Select>
          <Select onChange={(event) => setCategory(event.target.value as typeof category)} uiSize="sm" value={category}>
            <option value="ALL">All categories</option>
            <option value="CHANNEL_HEALTH">Channel health</option>
            <option value="PROXY">Proxy / restream</option>
            <option value="RECORDING">Recording</option>
            <option value="EPG">EPG</option>
            <option value="PLAYBACK">Playback</option>
            <option value="SYSTEM_ADMIN">System / admin</option>
          </Select>
          <Select onChange={(event) => setStatus(event.target.value as typeof status)} uiSize="sm" value={status}>
            <option value="ALL">All states</option>
            <option value="NEW">New</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="RESOLVED">Resolved</option>
            <option value="DISMISSED">Dismissed</option>
          </Select>
          <Input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, message, subsystem, or related id"
            uiSize="sm"
            value={search}
          />
        </div>

        {alertsQuery.isLoading && !alertsQuery.data ? (
          <EmptyState label="Loading alerts..." />
        ) : !alerts.length ? (
          <EmptyState label="No alerts match the current filters." />
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <article
                className="rounded-[1.25rem] border border-slate-800/80 bg-slate-950/75 p-4"
                key={alert.id}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={getSeverityBadgeClassName(alert.severity)} size="sm">
                        {alert.severityLabel}
                      </Badge>
                      <Badge className={getStatusBadgeClassName(alert.status)} size="sm">
                        {alert.status.toLowerCase()}
                      </Badge>
                      <Badge size="sm">{formatCategory(alert.category)}</Badge>
                      <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{alert.sourceSubsystem}</span>
                    </div>

                    <h2 className="mt-3 text-lg font-semibold text-white">{alert.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{alert.message}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-slate-400">
                      <span>Last event {formatTimestamp(alert.lastOccurredAt)}</span>
                      <span>First seen {formatTimestamp(alert.firstOccurredAt)}</span>
                      {alert.occurrenceCount > 1 ? <span>{alert.occurrenceCount} occurrences</span> : null}
                      {alert.relatedEntityPath && alert.relatedEntityLabel ? (
                        <Link className="text-cyan-300 transition hover:text-cyan-200" to={alert.relatedEntityPath}>
                          Open {alert.relatedEntityLabel}
                        </Link>
                      ) : null}
                    </div>

                    {alert.metadata ? (
                      <details className="mt-3 rounded-2xl border border-slate-800/70 bg-slate-900/50 px-3 py-2">
                        <summary className="cursor-pointer text-[12px] font-medium text-slate-300">Inspect alert context</summary>
                        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {Object.entries(alert.metadata).map(([key, value]) => (
                            <div key={`${alert.id}-${key}`} className="rounded-xl border border-slate-800/60 bg-slate-950/70 px-3 py-2">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{formatMetadataKey(key)}</p>
                              <p className="mt-1 break-words text-[13px] text-slate-200">{String(value ?? "n/a")}</p>
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {alert.isActive && alert.status === "NEW" ? (
                      <Button
                        disabled={actionMutation.isPending}
                        onClick={() => actionMutation.mutate({ alertId: alert.id, action: "acknowledge" })}
                        size="sm"
                        variant="secondary"
                      >
                        Acknowledge
                      </Button>
                    ) : null}
                    {alert.isActive ? (
                      <Button
                        disabled={actionMutation.isPending}
                        onClick={() => actionMutation.mutate({ alertId: alert.id, action: "resolve" })}
                        size="sm"
                        variant="secondary"
                      >
                        Resolve
                      </Button>
                    ) : null}
                    {alert.status !== "DISMISSED" ? (
                      <Button
                        disabled={actionMutation.isPending}
                        onClick={() => actionMutation.mutate({ alertId: alert.id, action: "dismiss" })}
                        size="sm"
                        variant="danger"
                      >
                        Dismiss
                      </Button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <p className="text-[11px] text-slate-500">
        Alerts auto-refresh every {AUTO_REFRESH_MS / 1000} seconds. Active issues stay visible until they recover, are resolved, or are dismissed.
      </p>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  meta,
  value,
}: {
  icon: typeof BellRing;
  label: string;
  meta: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.25rem] border border-slate-800/80 bg-slate-950/70 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-200">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
        </div>
      </div>
      <p className="mt-3 text-[12px] leading-5 text-slate-400">{meta}</p>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-[1.25rem] border border-dashed border-slate-800/80 bg-slate-950/50 px-4 py-10 text-center text-sm text-slate-400">
      {label}
    </div>
  );
}

function formatCategory(category: OperationalAlert["category"]) {
  return category.toLowerCase().replace(/_/g, " ");
}

function formatMetadataKey(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getSeverityBadgeClassName(severity: OperationalAlert["severity"]) {
  if (severity === "CRITICAL") {
    return "border-rose-400/30 bg-rose-500/15 text-rose-100";
  }

  if (severity === "ERROR") {
    return "border-orange-400/30 bg-orange-500/15 text-orange-100";
  }

  if (severity === "WARNING") {
    return "border-amber-400/30 bg-amber-500/15 text-amber-100";
  }

  if (severity === "SUCCESS") {
    return "border-emerald-400/30 bg-emerald-500/15 text-emerald-100";
  }

  return "border-cyan-400/30 bg-cyan-500/15 text-cyan-100";
}

function getStatusBadgeClassName(status: OperationalAlert["status"]) {
  if (status === "NEW") {
    return "border-cyan-400/30 bg-cyan-500/15 text-cyan-100";
  }

  if (status === "ACKNOWLEDGED") {
    return "border-amber-400/30 bg-amber-500/15 text-amber-100";
  }

  if (status === "RESOLVED") {
    return "border-emerald-400/30 bg-emerald-500/15 text-emerald-100";
  }

  return "border-slate-500/30 bg-slate-700/40 text-slate-100";
}
