import type { NowNextProgram, ProgramCatchupSummary } from "@/types/api";

export type ChannelArchiveAvailabilityFilter = "ALL" | "PLAYABLE" | "RECORDED" | "CATCHUP" | "UNAVAILABLE";

export interface ChannelArchiveDateOption {
  value: string;
  label: string;
  count: number;
}

export interface ChannelArchiveSection {
  id: string;
  label: string;
  date: string;
  programmes: NowNextProgram[];
}

export interface ChannelArchiveSummary {
  total: number;
  playable: number;
  recorded: number;
  catchup: number;
  unavailable: number;
}

export interface ChannelArchiveView {
  programmes: NowNextProgram[];
  sections: ChannelArchiveSection[];
  availableDates: ChannelArchiveDateOption[];
  summary: ChannelArchiveSummary;
}

function normalizeSearch(search: string) {
  return search.trim().toLowerCase();
}

function getProgrammeDateKey(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getRelativeDateLabel(dateKey: string, now: Date) {
  const todayKey = getProgrammeDateKey(now.toISOString());
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = getProgrammeDateKey(yesterday.toISOString());

  if (dateKey === todayKey) {
    return "Earlier today";
  }

  if (dateKey === yesterdayKey) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${dateKey}T12:00:00`));
}

function matchesArchiveFilter(catchup: ProgramCatchupSummary | null, filter: ChannelArchiveAvailabilityFilter) {
  switch (filter) {
    case "PLAYABLE":
      return catchup?.isCatchupPlayable === true;
    case "RECORDED":
      return catchup?.hasRecordingSource === true;
    case "CATCHUP":
      return catchup?.hasTimeshiftSource === true;
    case "UNAVAILABLE":
      return catchup?.archiveStatus === "AIRED_UNAVAILABLE";
    case "ALL":
    default:
      return true;
  }
}

function matchesArchiveSearch(programme: NowNextProgram, search: string) {
  if (!search) {
    return true;
  }

  const haystacks = [programme.title, programme.subtitle, programme.description, programme.category];

  return haystacks.some((value) => value?.toLowerCase().includes(search));
}

export function buildChannelArchiveView(params: {
  programmes: NowNextProgram[];
  search: string;
  availabilityFilter: ChannelArchiveAvailabilityFilter;
  selectedDate: string | null;
  now?: Date;
}): ChannelArchiveView {
  const now = params.now ?? new Date();
  const previousProgrammes = params.programmes
    .filter((programme) => programme.catchup?.timingState === "PREVIOUS")
    .sort((left, right) => Date.parse(right.start) - Date.parse(left.start));
  const dates = new Map<string, number>();

  for (const programme of previousProgrammes) {
    const dateKey = getProgrammeDateKey(programme.start);
    dates.set(dateKey, (dates.get(dateKey) ?? 0) + 1);
  }

  const availableDates = Array.from(dates.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([value, count]) => ({
      value,
      label: getRelativeDateLabel(value, now),
      count,
    }));
  const normalizedSearch = normalizeSearch(params.search);
  const filteredProgrammes = previousProgrammes.filter((programme) => {
    const dateKey = getProgrammeDateKey(programme.start);

    if (params.selectedDate && params.selectedDate !== dateKey) {
      return false;
    }

    return matchesArchiveSearch(programme, normalizedSearch) && matchesArchiveFilter(programme.catchup, params.availabilityFilter);
  });
  const sectionsByDate = new Map<string, NowNextProgram[]>();

  for (const programme of filteredProgrammes) {
    const dateKey = getProgrammeDateKey(programme.start);
    const section = sectionsByDate.get(dateKey);

    if (section) {
      section.push(programme);
      continue;
    }

    sectionsByDate.set(dateKey, [programme]);
  }

  const sections = Array.from(sectionsByDate.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, programmes]) => ({
      id: date,
      date,
      label: getRelativeDateLabel(date, now),
      programmes,
    }));

  return {
    programmes: filteredProgrammes,
    sections,
    availableDates,
    summary: filteredProgrammes.reduce<ChannelArchiveSummary>(
      (summary, programme) => ({
        total: summary.total + 1,
        playable: summary.playable + (programme.catchup?.isCatchupPlayable ? 1 : 0),
        recorded: summary.recorded + (programme.catchup?.hasRecordingSource ? 1 : 0),
        catchup: summary.catchup + (programme.catchup?.hasTimeshiftSource ? 1 : 0),
        unavailable: summary.unavailable + (programme.catchup?.archiveStatus === "AIRED_UNAVAILABLE" ? 1 : 0),
      }),
      {
        total: 0,
        playable: 0,
        recorded: 0,
        catchup: 0,
        unavailable: 0,
      },
    ),
  };
}
