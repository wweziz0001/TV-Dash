import { Badge } from "@/components/ui/badge";
import type { RecordingJobStatus } from "@/types/api";

const STATUS_LABELS: Record<RecordingJobStatus, string> = {
  PENDING: "Pending",
  SCHEDULED: "Scheduled",
  RECORDING: "Recording",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELED: "Canceled",
};

const STATUS_CLASS_NAMES: Record<RecordingJobStatus, string> = {
  PENDING: "border-slate-700/80 bg-slate-900/80 text-slate-200",
  SCHEDULED: "border-cyan-400/30 bg-cyan-500/10 text-cyan-100",
  RECORDING: "border-rose-400/40 bg-rose-500/10 text-rose-100",
  COMPLETED: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
  FAILED: "border-amber-400/30 bg-amber-500/10 text-amber-100",
  CANCELED: "border-slate-700/80 bg-slate-900/80 text-slate-300",
};

export function RecordingStatusBadge({ status }: { status: RecordingJobStatus }) {
  return (
    <Badge className={STATUS_CLASS_NAMES[status]} size="sm">
      {STATUS_LABELS[status]}
    </Badge>
  );
}
