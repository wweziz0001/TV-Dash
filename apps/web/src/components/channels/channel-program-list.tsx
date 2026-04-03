import { CalendarPlus, Repeat } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { NowNextProgram } from "@/types/api";
import { formatProgrammeTimeWithDay } from "./channel-guide-state";

interface ChannelProgramListProps {
  programmes: NowNextProgram[];
  isLoading?: boolean;
  buildRuleHref: (programme: NowNextProgram) => string;
  onRecordProgram: (programme: NowNextProgram) => void;
}

export function ChannelProgramList({
  programmes,
  isLoading = false,
  buildRuleHref,
  onRecordProgram,
}: ChannelProgramListProps) {
  if (isLoading && programmes.length === 0) {
    return <div className="py-6 text-sm text-slate-400">Loading guide programmes...</div>;
  }

  if (programmes.length === 0) {
    return <div className="py-6 text-sm text-slate-400">No future guide programmes are currently available for recording.</div>;
  }

  return (
    <div className="space-y-3">
      {programmes.map((programme) => (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-3" key={programme.id}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{programme.title}</p>
              {programme.subtitle ? <p className="mt-1 text-[13px] text-slate-400">{programme.subtitle}</p> : null}
              <p className="mt-1.5 text-[12px] text-slate-500">{formatProgrammeTimeWithDay(programme)}</p>
              {programme.category ? <p className="mt-1 text-[12px] text-slate-500">{programme.category}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => onRecordProgram(programme)} size="sm" variant="secondary">
                <CalendarPlus className="h-4 w-4" />
                Record this program
              </Button>
              <Link to={buildRuleHref(programme)}>
                <Button size="sm" variant="ghost">
                  <Repeat className="h-4 w-4" />
                  Repeat
                </Button>
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
