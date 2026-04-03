import { Badge } from "@/components/ui/badge";
import type { RecordingJob } from "@/types/api";

export function RecordingRetentionBadge({ job }: { job: RecordingJob }) {
  if (job.isProtected) {
    return (
      <Badge className="border-amber-400/30 bg-amber-500/10 text-amber-100" size="sm">
        Keep forever
      </Badge>
    );
  }

  if (job.retention.mode === "FAILED_CLEANUP") {
    return (
      <Badge className="border-slate-700/80 bg-slate-900/80 text-slate-300" size="sm">
        Cleanup {job.retention.failedCleanupHours}h
      </Badge>
    );
  }

  if (job.retention.mode === "STANDARD") {
    return (
      <Badge className="border-slate-700/80 bg-slate-900/80 text-slate-300" size="sm">
        {job.retention.maxAgeDays}d retention
      </Badge>
    );
  }

  return (
    <Badge className="border-slate-700/80 bg-slate-900/80 text-slate-300" size="sm">
      Active
    </Badge>
  );
}
