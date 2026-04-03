import { ActivitySquare, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import type { DiagnosticObservationSummary, EpgSourceDiagnostics } from "@/types/api";

interface EpgSourceDiagnosticsPanelProps {
  diagnostics: EpgSourceDiagnostics | null | undefined;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export function EpgSourceDiagnosticsPanel({
  diagnostics,
  isLoading = false,
  onRefresh,
}: EpgSourceDiagnosticsPanelProps) {
  return (
    <Panel density="compact">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">EPG Diagnostics</p>
          <p className="mt-1 text-sm text-slate-300">
            Real fetch, parse, and cache observations from XMLTV preview and guide lookups.
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
        <p className="mt-4 text-sm text-slate-400">Loading EPG diagnostics...</p>
      ) : !diagnostics ? (
        <p className="mt-4 text-sm text-slate-400">Select a configured source to inspect runtime XMLTV diagnostics.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={getHealthBadgeClassName(diagnostics.healthState)} size="sm">
                {diagnostics.healthState}
              </Badge>
              <Badge size="sm">{diagnostics.sourceSlug}</Badge>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <SummaryRow label="Last observation" value={formatTimestamp(diagnostics.overall.lastCheckAt)} />
              <SummaryRow label="Last success" value={formatTimestamp(diagnostics.overall.lastSuccessAt)} />
              <SummaryRow label="Last failure" value={formatTimestamp(diagnostics.overall.lastFailureAt)} />
              <SummaryRow label="Failure class" value={diagnostics.overall.lastFailureKind ?? "No data yet"} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <ObservationCard observation={diagnostics.fetch} title="XMLTV fetch" />
            <ObservationCard observation={diagnostics.parse} title="XMLTV parse" />
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
            <p className="text-sm font-semibold text-white">Cache state</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <SummaryRow label="Loaded at" value={formatTimestamp(diagnostics.cache.lastLoadedAt)} />
              <SummaryRow label="Expires at" value={formatTimestamp(diagnostics.cache.expiresAt)} />
              <SummaryRow label="Channel ids" value={formatCount(diagnostics.cache.channelCount)} />
              <SummaryRow label="Programmes" value={formatCount(diagnostics.cache.programmeCount)} />
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
}: {
  title: string;
  observation: DiagnosticObservationSummary;
}) {
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
      <div className="flex items-center gap-2">
        <ActivitySquare className="h-4 w-4 text-cyan-200" />
        <p className="text-sm font-semibold text-white">{title}</p>
      </div>
      <div className="mt-3 grid gap-2">
        <SummaryRow label="Last check" value={formatTimestamp(observation.lastCheckAt)} />
        <SummaryRow label="Last success" value={formatTimestamp(observation.lastSuccessAt)} />
        <SummaryRow label="Last failure" value={formatTimestamp(observation.lastFailureAt)} />
        <SummaryRow label="Observed by" value={formatObservationSource(observation.lastObservationSource)} />
      </div>
      {observation.lastFailureReason ? (
        <p className="mt-3 text-[12px] text-slate-300">{observation.lastFailureReason}</p>
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

function formatCount(value: number | null) {
  if (value === null) {
    return "No data yet";
  }

  return value.toLocaleString();
}

function getHealthBadgeClassName(value: EpgSourceDiagnostics["healthState"]) {
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
