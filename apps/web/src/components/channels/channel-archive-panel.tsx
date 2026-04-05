import { useMemo, useState } from "react";
import { PlayCircle, RadioTower } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import type { NowNextProgram } from "@/types/api";
import { buildChannelArchiveView, type ChannelArchiveAvailabilityFilter } from "./channel-archive-state";
import { formatProgrammeTimeWithDay } from "./channel-guide-state";
import { getProgramCatchupBadges, getProgramCatchupCopy } from "./channel-program-catchup-state";

interface ChannelArchivePanelProps {
  programmes: NowNextProgram[];
  activeProgramId?: string | null;
  isLoading?: boolean;
  selectedDate?: string | null;
  onPlayProgram: (programme: NowNextProgram) => void;
  onSelectDate: (date: string | null) => void;
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

function summaryCard(label: string, value: number) {
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-white">{value}</p>
    </div>
  );
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

export function ChannelArchivePanel({
  programmes,
  activeProgramId = null,
  isLoading = false,
  selectedDate = null,
  onPlayProgram,
  onSelectDate,
}: ChannelArchivePanelProps) {
  const [search, setSearch] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState<ChannelArchiveAvailabilityFilter>("ALL");
  const archiveView = useMemo(
    () =>
      buildChannelArchiveView({
        programmes,
        search,
        availabilityFilter,
        selectedDate,
      }),
    [availabilityFilter, programmes, search, selectedDate],
  );

  return (
    <div id="channel-archive">
      <Panel density="compact">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Channel archive</p>
          <p className="mt-1 text-[13px] text-slate-400">
            Browse earlier programmes as channel history, with recording-backed archive and retained-window availability kept explicit.
          </p>
        </div>
        <Badge className="border-slate-700/80 bg-slate-900/80 text-slate-200">
          {archiveView.summary.playable} playable {archiveView.summary.playable === 1 ? "programme" : "programmes"}
        </Badge>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {summaryCard("Visible", archiveView.summary.total)}
        {summaryCard("Playable", archiveView.summary.playable)}
        {summaryCard("Recorded", archiveView.summary.recorded)}
        {summaryCard("DVR window", archiveView.summary.catchup)}
        {summaryCard("Unavailable", archiveView.summary.unavailable)}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <Input onChange={(event) => setSearch(event.target.value)} placeholder="Search archive titles, categories, or descriptions" value={search} />
        <Select
          onChange={(event) => setAvailabilityFilter(event.target.value as ChannelArchiveAvailabilityFilter)}
          value={availabilityFilter}
        >
          <option value="ALL">All archive states</option>
          <option value="PLAYABLE">Playable now</option>
          <option value="RECORDED">Recording available</option>
          <option value="CATCHUP">DVR window available</option>
          <option value="UNAVAILABLE">Unavailable history</option>
        </Select>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => onSelectDate(null)} size="sm" variant={selectedDate ? "secondary" : "primary"}>
          All days
        </Button>
        {archiveView.availableDates.map((date) => (
          <Button
            key={date.value}
            onClick={() => onSelectDate(date.value)}
            size="sm"
            variant={selectedDate === date.value ? "primary" : "secondary"}
          >
            {date.label}
            <span className="text-[11px] text-slate-300">{date.count}</span>
          </Button>
        ))}
      </div>

      {isLoading && archiveView.programmes.length === 0 ? (
        <div className="mt-4 py-6 text-sm text-slate-400">Loading channel archive...</div>
      ) : archiveView.sections.length === 0 ? (
        <div className="mt-4 py-6 text-sm text-slate-400">No earlier programmes match the current archive filter.</div>
      ) : (
        <div className="mt-4 space-y-4">
          {archiveView.sections.map((section) => (
            <div className="space-y-3" key={section.id}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-white">{section.label}</p>
                  <p className="text-[12px] text-slate-500">{section.programmes.length} programmes in this archive slice</p>
                </div>
              </div>
              {section.programmes.map((programme) => {
                const badges = getProgramCatchupBadges(programme);
                const copy = getProgramCatchupCopy(programme);
                const isPlayable = programme.catchup?.isCatchupPlayable === true || programme.catchup?.watchFromStartAvailable === true;
                const expiryLabel = formatExpiry(
                  programme.catchup?.preferredSourceType === "TIMESHIFT" ? programme.catchup.availableUntilAt : null,
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
                        {programme.category ? <p className="mt-1 text-[12px] text-slate-500">{programme.category}</p> : null}
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
                          {activeProgramId === programme.id ? "Playing now" : "Play archive"}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      </Panel>
    </div>
  );
}
