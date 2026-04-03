import type { ReactNode } from "react";
import { Activity, RadioTower, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import type { ChannelDiagnostics, DiagnosticObservationSummary } from "@/types/api";

interface ChannelDiagnosticsPanelProps {
  diagnostics: ChannelDiagnostics | null | undefined;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export function ChannelDiagnosticsPanel({
  diagnostics,
  isLoading = false,
  onRefresh,
}: ChannelDiagnosticsPanelProps) {
  return (
    <Panel density="compact">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Runtime Diagnostics</p>
          <p className="mt-1 text-sm text-slate-300">
            Real observations from proxy serving, synthetic master generation, and guide lookups.
          </p>
        </div>
        {onRefresh ? (
          <Button onClick={onRefresh} size="sm" variant="secondary">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        ) : null}
      </div>

      {isLoading && !diagnostics ? (
        <p className="mt-4 text-sm text-slate-400">Loading channel diagnostics...</p>
      ) : !diagnostics ? (
        <p className="mt-4 text-sm text-slate-400">Save or select a channel to inspect live diagnostics.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={getHealthBadgeClassName(diagnostics.healthState)} size="sm">
                {diagnostics.healthState}
              </Badge>
              <Badge size="sm">{diagnostics.current.sourceMode === "MANUAL_VARIANTS" ? "Manual variants" : "Master playlist"}</Badge>
              <Badge size="sm">{diagnostics.current.proxyEnabled ? "Proxy mode" : "Direct mode"}</Badge>
              {diagnostics.current.syntheticMasterExpected ? <Badge size="sm">Synthetic master</Badge> : null}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <SummaryRow label="Reachability" value={formatReachability(diagnostics.reachable)} />
              <SummaryRow label="Last observation" value={formatTimestamp(diagnostics.overall.lastCheckAt)} />
              <SummaryRow label="Last success" value={formatTimestamp(diagnostics.overall.lastSuccessAt)} />
              <SummaryRow label="Last failure" value={formatTimestamp(diagnostics.overall.lastFailureAt)} />
            </div>
            {diagnostics.overall.lastFailureReason ? (
              <p className="mt-3 text-[12px] text-slate-300">
                Last failure: {diagnostics.overall.lastFailureReason}
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <ObservationCard
              icon={<Activity className="h-4 w-4 text-cyan-200" />}
              observation={diagnostics.streamInspection}
              title="Stream inspection"
            />
            <ObservationCard
              icon={<RadioTower className="h-4 w-4 text-cyan-200" />}
              observation={diagnostics.proxyMaster}
              title="Proxy master"
            />
            <ObservationCard
              icon={<RadioTower className="h-4 w-4 text-cyan-200" />}
              observation={diagnostics.proxyAsset}
              title="Proxy asset"
            />
            <ObservationCard
              icon={<Activity className="h-4 w-4 text-cyan-200" />}
              observation={diagnostics.syntheticMaster}
              title="Synthetic master"
            />
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
            <p className="text-sm font-semibold text-white">Guide integration</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <SummaryRow label="Status" value={diagnostics.guide.status} />
              <SummaryRow label="EPG channel id" value={diagnostics.guide.epgChannelId ?? "Not linked"} />
              <SummaryRow label="Last observed" value={formatTimestamp(diagnostics.guide.lastObservedAt)} />
              <SummaryRow label="Last ready" value={formatTimestamp(diagnostics.guide.lastReadyAt)} />
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

function ObservationCard({
  title,
  observation,
  icon,
}: {
  title: string;
  observation: DiagnosticObservationSummary;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-sm font-semibold text-white">{title}</p>
      </div>
      <div className="mt-3 grid gap-2">
        <SummaryRow label="Last check" value={formatTimestamp(observation.lastCheckAt)} />
        <SummaryRow label="Last success" value={formatTimestamp(observation.lastSuccessAt)} />
        <SummaryRow label="Last failure" value={formatTimestamp(observation.lastFailureAt)} />
        <SummaryRow label="Observed by" value={formatObservationSource(observation.lastObservationSource)} />
      </div>
      {observation.lastFailureReason ? (
        <p className="mt-3 text-[12px] text-slate-300">
          {observation.lastFailureReason}
        </p>
      ) : (
        <p className="mt-3 text-[12px] text-slate-500">No failures recorded yet.</p>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-950/80 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-[13px] text-slate-200">{value}</p>
    </div>
  );
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "No data yet";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatObservationSource(value: string | null) {
  if (!value) {
    return "No data yet";
  }

  return value
    .toLowerCase()
    .replaceAll("_", " ");
}

function formatReachability(value: boolean | null) {
  if (value === null) {
    return "Unknown";
  }

  return value ? "Reachable" : "Unreachable";
}

function getHealthBadgeClassName(value: ChannelDiagnostics["healthState"]) {
  if (value === "healthy") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  }

  if (value === "degraded") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }

  if (value === "failing") {
    return "border-rose-400/30 bg-rose-500/10 text-rose-100";
  }

  return "border-slate-700/80 bg-slate-900/80 text-slate-200";
}
