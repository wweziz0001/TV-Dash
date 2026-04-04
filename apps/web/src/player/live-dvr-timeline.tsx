import { cn } from "@/lib/utils";

type PlayerControlDensity = "micro" | "compact" | "full";

interface LiveDvrTimelineProps {
  density?: PlayerControlDensity;
  variant?: "persistent" | "overlay";
  interactive: boolean;
  disabled: boolean;
  bufferedRatio: number;
  playheadRatio: number | null;
  leadingLabel: string;
  currentLabel: string;
  trailingLabel: string;
  windowLabel: string;
  capabilityLabel: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}

function getPlayheadOffsetStyle(playheadRatio: number | null) {
  if (playheadRatio === null) {
    return { left: "0%" };
  }

  return {
    left: `calc(${(playheadRatio * 100).toFixed(3)}% - 0.375rem)`,
  };
}

export function LiveDvrTimeline({
  density = "full",
  variant = "overlay",
  interactive,
  disabled,
  bufferedRatio,
  playheadRatio,
  leadingLabel,
  currentLabel,
  trailingLabel,
  windowLabel,
  capabilityLabel,
  min,
  max,
  value,
  onChange,
}: LiveDvrTimelineProps) {
  const isCompact = density === "compact";
  const isMicro = density === "micro";
  const wrapperClassName =
    variant === "persistent"
      ? isMicro
        ? "rounded-lg border border-slate-800/80 bg-slate-950/86 px-2 py-1.5"
        : "rounded-xl border border-slate-800/80 bg-slate-950/84 px-2.5 py-2"
      : isMicro
        ? "rounded-lg border border-slate-800/70 bg-slate-950/78 px-2 py-1.5"
        : "rounded-xl border border-slate-800/70 bg-slate-950/74 px-2.5 py-2";

  return (
    <div className={wrapperClassName}>
      <div
        className={cn(
          "mb-1 flex items-center justify-between gap-2 text-slate-300",
          isMicro ? "text-[8px]" : "text-[10px]",
        )}
      >
        <span className="truncate font-semibold uppercase tracking-[0.18em] text-slate-400">{capabilityLabel}</span>
        <span className="truncate text-right text-slate-400">{windowLabel}</span>
      </div>

      <div className="relative">
        <div
          className={cn(
            "relative overflow-hidden rounded-full bg-slate-900/95",
            isMicro ? "h-1.5" : isCompact ? "h-1.5" : "h-2",
          )}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-cyan-400/30"
            style={{ width: `${Math.max(0, Math.min(bufferedRatio, 1)) * 100}%` }}
          />
          {playheadRatio !== null ? (
            <>
              <div className="absolute inset-y-0 left-0 rounded-full bg-cyan-300/55" style={{ width: `${Math.max(0, Math.min(playheadRatio ?? 0, 1)) * 100}%` }} />
              <div
                className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-white/70 bg-cyan-100 shadow-[0_0_0_2px_rgba(8,145,178,0.35)]"
                style={getPlayheadOffsetStyle(playheadRatio)}
              />
            </>
          ) : null}
          <div className="absolute right-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-rose-400 shadow-[0_0_0_2px_rgba(248,113,113,0.22)]" />
        </div>

        {interactive ? (
          <input
            aria-label="Player timeline"
            className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
            disabled={disabled}
            max={max}
            min={min}
            onChange={(event) => onChange(Number(event.target.value))}
            step={1}
            type="range"
            value={value}
          />
        ) : null}
      </div>

      <div
        className={cn(
          "mt-1 flex items-center justify-between gap-2 text-slate-400",
          isMicro ? "text-[8px]" : "text-[10px]",
        )}
      >
        <span>{leadingLabel}</span>
        <span className="truncate text-center text-slate-200">{currentLabel}</span>
        <span className="text-right">{trailingLabel}</span>
      </div>
    </div>
  );
}
