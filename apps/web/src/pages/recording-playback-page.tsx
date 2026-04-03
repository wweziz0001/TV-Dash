import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, PlayCircle } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/page-header";
import { RecordingStatusBadge } from "@/components/recordings/recording-status-badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { useAuth } from "@/features/auth/auth-context";
import { api, resolveApiUrl } from "@/services/api";

export function RecordingPlaybackPage() {
  const { id = "" } = useParams();
  const { token } = useAuth();

  const recordingQuery = useQuery({
    queryKey: ["recording", id, token],
    queryFn: async () => {
      if (!token) {
        throw new Error("Missing session");
      }

      return (await api.getRecordingJob(id, token)).job;
    },
    enabled: Boolean(token && id),
  });

  const playbackAccessQuery = useQuery({
    queryKey: ["recording-playback-access", id, token],
    queryFn: async () => {
      if (!token) {
        throw new Error("Missing session");
      }

      return (await api.getRecordingPlaybackAccess(id, token)).playbackUrl;
    },
    enabled: Boolean(token && id && recordingQuery.data?.asset),
  });

  const job = recordingQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recordings"
        title={job?.title ?? "Recording playback"}
        description="Review the recorded output, confirm the resulting duration and file footprint, and jump back to the broader recordings workspace when you’re done."
        actions={
          <Link to="/recordings">
            <Button size="sm" variant="secondary">
              <ArrowLeft className="h-4 w-4" />
              Back to library
            </Button>
          </Link>
        }
      />

      {!job ? (
        <Panel>
          <p className="text-sm text-slate-400">Loading recording details...</p>
        </Panel>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
          <Panel className="p-3">
            {job.asset && playbackAccessQuery.data ? (
              <video
                className="aspect-video w-full rounded-2xl border border-slate-800/80 bg-black"
                controls
                preload="metadata"
                src={resolveApiUrl(playbackAccessQuery.data)}
              />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-2xl border border-dashed border-slate-700/80 bg-slate-950/70 p-6 text-center">
                <div>
                  <PlayCircle className="mx-auto h-10 w-10 text-slate-500" />
                  <p className="mt-3 text-sm text-slate-300">
                    {job.asset
                      ? "Preparing playback access..."
                      : "This recording does not have playable media yet."}
                  </p>
                </div>
              </div>
            )}
          </Panel>

          <Panel className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <RecordingStatusBadge status={job.status} />
              <p className="text-sm text-slate-400">{job.channelNameSnapshot}</p>
            </div>
            <DetailRow label="Mode" value={job.mode} />
            <DetailRow label="Started" value={formatDateTime(job.actualStartAt ?? job.startAt)} />
            <DetailRow label="Ended" value={job.actualEndAt ? formatDateTime(job.actualEndAt) : "Still active"} />
            <DetailRow
              label="Duration"
              value={job.asset?.durationSeconds ? formatDuration(job.asset.durationSeconds) : "Pending"}
            />
            <DetailRow
              label="File size"
              value={job.asset?.fileSizeBytes ? formatFileSize(job.asset.fileSizeBytes) : "Pending"}
            />
            {job.failureReason ? <p className="text-sm text-amber-200">Failure: {job.failureReason}</p> : null}
            {job.cancellationReason ? <p className="text-sm text-slate-400">Canceled: {job.cancellationReason}</p> : null}
          </Panel>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-1.5 text-sm text-slate-200">{value}</p>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDuration(durationSeconds: number) {
  if (durationSeconds < 60) {
    return `${durationSeconds}s`;
  }

  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.round((durationSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function formatFileSize(fileSizeBytes: number) {
  if (fileSizeBytes < 1024) {
    return `${fileSizeBytes} B`;
  }

  if (fileSizeBytes < 1024 * 1024) {
    return `${Math.round(fileSizeBytes / 1024)} KB`;
  }

  if (fileSizeBytes < 1024 * 1024 * 1024) {
    return `${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(fileSizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
