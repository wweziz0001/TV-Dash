import { Badge } from "@/components/ui/badge";
import type { RecordingJob, RecordingRule } from "@/types/api";

const ORIGIN_LABELS: Record<RecordingJob["mode"], string> = {
  IMMEDIATE: "Immediate",
  TIMED: "Timed",
  SCHEDULED: "Scheduled",
  EPG_PROGRAM: "Guide program",
  RECURRING_RULE: "Recurring",
};

const ORIGIN_CLASS_NAMES: Record<RecordingJob["mode"], string> = {
  IMMEDIATE: "border-slate-700/80 bg-slate-900/80 text-slate-200",
  TIMED: "border-sky-400/30 bg-sky-500/10 text-sky-100",
  SCHEDULED: "border-cyan-400/30 bg-cyan-500/10 text-cyan-100",
  EPG_PROGRAM: "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-100",
  RECURRING_RULE: "border-amber-400/30 bg-amber-500/10 text-amber-100",
};

export function RecordingOriginBadge({ mode }: { mode: RecordingJob["mode"] }) {
  return (
    <Badge className={ORIGIN_CLASS_NAMES[mode]} size="sm">
      {ORIGIN_LABELS[mode]}
    </Badge>
  );
}

export function formatRecordingRuleRecurrence(rule: Pick<RecordingRule, "recurrenceType" | "weekdays">) {
  if (rule.recurrenceType === "DAILY") {
    return "Daily";
  }

  if (rule.recurrenceType === "WEEKLY") {
    return rule.weekdays[0] ? `Weekly · ${formatWeekday(rule.weekdays[0])}` : "Weekly";
  }

  return `Weekdays · ${rule.weekdays.map(formatWeekday).join(", ")}`;
}

function formatWeekday(weekday: RecordingRule["weekdays"][number]) {
  return weekday.slice(0, 1) + weekday.slice(1).toLowerCase();
}
