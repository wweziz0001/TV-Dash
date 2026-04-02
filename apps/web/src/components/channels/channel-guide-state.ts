import type { ChannelNowNext, NowNextProgram } from "@/types/api";

export interface ChannelGuideState {
  kind: "loading" | "ready" | "unconfigured" | "source-error" | "no-data";
  message: string;
  now: NowNextProgram | null;
  next: NowNextProgram | null;
  progressPercent: number | null;
}

interface GuideStateOptions {
  hasEpgSource: boolean;
  guide: ChannelNowNext | null | undefined;
  isLoading?: boolean;
  now?: Date;
}

export function getProgrammeProgressPercent(programme: NowNextProgram | null, now = new Date()) {
  if (!programme?.start || !programme.stop) {
    return null;
  }

  const start = new Date(programme.start).getTime();
  const stop = new Date(programme.stop).getTime();
  const current = now.getTime();

  if (!Number.isFinite(start) || !Number.isFinite(stop) || stop <= start) {
    return null;
  }

  const progress = ((current - start) / (stop - start)) * 100;
  return Math.max(0, Math.min(100, Math.round(progress)));
}

export function formatProgrammeTime(programme: NowNextProgram | null) {
  if (!programme) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  const start = formatter.format(new Date(programme.start));
  const stop = programme.stop ? formatter.format(new Date(programme.stop)) : null;

  return stop ? `${start} - ${stop}` : `${start} onward`;
}

export function getChannelGuideState({
  hasEpgSource,
  guide,
  isLoading = false,
  now = new Date(),
}: GuideStateOptions): ChannelGuideState {
  if (!hasEpgSource) {
    return {
      kind: "unconfigured",
      message: "Guide not linked",
      now: null,
      next: null,
      progressPercent: null,
    };
  }

  if (isLoading && !guide) {
    return {
      kind: "loading",
      message: "Loading guide",
      now: null,
      next: null,
      progressPercent: null,
    };
  }

  if (!guide || guide.status === "NO_DATA") {
    return {
      kind: "no-data",
      message: "No current schedule",
      now: null,
      next: null,
      progressPercent: null,
    };
  }

  if (guide.status === "SOURCE_ERROR") {
    return {
      kind: "source-error",
      message: "Guide source unavailable",
      now: null,
      next: null,
      progressPercent: null,
    };
  }

  if (guide.status === "UNCONFIGURED") {
    return {
      kind: "unconfigured",
      message: "Guide not linked",
      now: null,
      next: null,
      progressPercent: null,
    };
  }

  return {
    kind: "ready",
    message: guide.now?.title ?? guide.next?.title ?? "Schedule ready",
    now: guide.now,
    next: guide.next,
    progressPercent: getProgrammeProgressPercent(guide.now, now),
  };
}
