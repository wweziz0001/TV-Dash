import { AlertTriangle, CalendarClock, Clock3, RadioTower } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChannelNowNext } from "@/types/api";
import { formatProgrammeTime, getChannelGuideState } from "./channel-guide-state";

interface ChannelGuideCardProps {
  guide: ChannelNowNext | null | undefined;
  hasEpgSource: boolean;
  isLoading?: boolean;
  variant?: "compact" | "detailed";
  className?: string;
}

export function ChannelGuideCard({
  guide,
  hasEpgSource,
  isLoading = false,
  variant = "compact",
  className,
}: ChannelGuideCardProps) {
  const state = getChannelGuideState({
    hasEpgSource,
    guide,
    isLoading,
  });

  if (variant === "compact") {
    return (
      <div className={cn("rounded-2xl border border-slate-800/80 bg-slate-950/70 p-3", className)}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Now / Next</p>
            <p className="mt-2 text-sm font-semibold text-white">
              {state.kind === "ready" ? state.now?.title ?? state.next?.title ?? "Schedule ready" : state.message}
            </p>
            {state.kind === "ready" && state.next ? (
              <p className="mt-1 text-xs text-slate-400">Next: {state.next.title}</p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">{state.message}</p>
            )}
          </div>
          <GuideStateIcon kind={state.kind} />
        </div>
        {state.kind === "ready" && state.progressPercent !== null ? (
          <div className="mt-3">
            <div className="h-1.5 rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-cyan-300 transition-[width]"
                style={{ width: `${state.progressPercent}%` }}
              />
            </div>
            {state.now ? <p className="mt-2 text-[11px] text-slate-500">{formatProgrammeTime(state.now)}</p> : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Now</p>
            <p className="mt-2 font-semibold text-white">
              {state.kind === "ready" ? state.now?.title ?? "No programme in progress" : state.message}
            </p>
            {state.kind === "ready" && state.now?.subtitle ? (
              <p className="mt-1 text-sm text-slate-400">{state.now.subtitle}</p>
            ) : null}
            {state.kind === "ready" && state.now ? (
              <p className="mt-3 text-xs text-slate-500">{formatProgrammeTime(state.now)}</p>
            ) : (
              <p className="mt-3 text-xs text-slate-500">{state.message}</p>
            )}
          </div>
          <GuideStateIcon kind={state.kind} />
        </div>
        {state.kind === "ready" && state.progressPercent !== null ? (
          <div className="mt-4">
            <div className="h-2 rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-cyan-300" style={{ width: `${state.progressPercent}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-500">{state.progressPercent}% through the current programme</p>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 p-4">
        <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Next</p>
        <p className="mt-2 font-semibold text-white">
          {state.kind === "ready" ? state.next?.title ?? "No upcoming programme published" : state.message}
        </p>
        {state.kind === "ready" && state.next?.subtitle ? (
          <p className="mt-1 text-sm text-slate-400">{state.next.subtitle}</p>
        ) : null}
        {state.kind === "ready" && state.next ? (
          <p className="mt-3 text-xs text-slate-500">{formatProgrammeTime(state.next)}</p>
        ) : (
          <p className="mt-3 text-xs text-slate-500">
            {state.kind === "unconfigured"
              ? "Link an XMLTV source to surface programme data here."
              : "TV-Dash keeps the view useful even when schedule data is partial or unavailable."}
          </p>
        )}
      </div>
    </div>
  );
}

function GuideStateIcon({ kind }: { kind: ReturnType<typeof getChannelGuideState>["kind"] }) {
  if (kind === "source-error") {
    return <AlertTriangle className="h-4 w-4 text-amber-300" />;
  }

  if (kind === "ready") {
    return <Clock3 className="h-4 w-4 text-cyan-200" />;
  }

  if (kind === "loading") {
    return <CalendarClock className="h-4 w-4 text-slate-400" />;
  }

  return <RadioTower className="h-4 w-4 text-slate-500" />;
}
