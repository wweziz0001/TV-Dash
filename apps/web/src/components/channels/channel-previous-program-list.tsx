import { PlayCircle, RadioTower } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { NowNextProgram } from "@/types/api";
import { formatProgrammeTimeWithDay } from "./channel-guide-state";
import { getProgramCatchupBadges, getProgramCatchupCopy } from "./channel-program-catchup-state";

interface ChannelPreviousProgramListProps {
  programmes: NowNextProgram[];
  activeProgramId?: string | null;
  isLoading?: boolean;
  onPlayProgram: (programme: NowNextProgram) => void;
}

function badgeClassName(tone: "live" | "positive" | "warning" | "neutral") {
  switch (tone) {
    case "live":
      return "border-rose-400/30 bg-rose-500/10 text-rose-100";
    case "positive":
      return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
    case "warning":
      return "border-amber-400/30 bg-amber-500/10 text-amber-100";
    default:
      return "border-slate-700/80 bg-slate-900/80 text-slate-300";
  }
}

function formatExpiry(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ChannelPreviousProgramList({
  programmes,
  activeProgramId = null,
  isLoading = false,
  onPlayProgram,
}: ChannelPreviousProgramListProps) {
  if (isLoading && programmes.length === 0) {
    return <div className="py-6 text-sm text-slate-400">Loading earlier programmes...</div>;
  }

  if (programmes.length === 0) {
    return <div className="py-6 text-sm text-slate-400">No earlier programmes are available in this guide window yet.</div>;
  }

  return (
    <div className="space-y-3">
      {programmes.map((programme) => {
        const catchup = programme.catchup;
        const badges = getProgramCatchupBadges(programme);
        const copy = getProgramCatchupCopy(programme);
        const isPlayable = catchup?.isCatchupPlayable === true || catchup?.watchFromStartAvailable === true;
        const expiryLabel = formatExpiry(
          catchup?.preferredSourceType === "TIMESHIFT" ? catchup.availableUntilAt : null,
        );

        return (
          <div
            className={`rounded-2xl border p-3 ${
              activeProgramId === programme.id
                ? "border-cyan-400/30 bg-cyan-500/10"
                : "border-slate-800/80 bg-slate-950/70"
            }`}
            key={programme.id}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  {badges.map((badge) => (
                    <Badge className={badgeClassName(badge.tone)} key={`${programme.id}-${badge.label}`} size="sm">
                      {badge.label}
                    </Badge>
                  ))}
                </div>
                <p className="mt-2 truncate text-sm font-semibold text-white">{programme.title}</p>
                {programme.subtitle ? <p className="mt-1 text-[13px] text-slate-400">{programme.subtitle}</p> : null}
                <p className="mt-1.5 text-[12px] text-slate-500">{formatProgrammeTimeWithDay(programme)}</p>
                {copy ? <p className="mt-2 text-[12px] text-slate-300">{copy}</p> : null}
                {expiryLabel ? <p className="mt-1 text-[11px] text-amber-200">DVR window available until {expiryLabel}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!isPlayable || activeProgramId === programme.id}
                  onClick={() => onPlayProgram(programme)}
                  size="sm"
                  variant={activeProgramId === programme.id ? "primary" : "secondary"}
                >
                  {activeProgramId === programme.id ? <RadioTower className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                  {activeProgramId === programme.id ? "Playing now" : "Play catch-up"}
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

