import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, LayoutTemplate, Tv } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth-context";
import { HlsPlayer, type PlayerStatus } from "@/player/hls-player";
import { defaultQualityOptions } from "@/player/quality-options";
import { api } from "@/services/api";
import type { QualityOption } from "@/types/api";

export function ChannelWatchPage() {
  const { slug = "" } = useParams();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [qualities, setQualities] = useState<QualityOption[]>([...defaultQualityOptions]);
  const [selectedQuality, setSelectedQuality] = useState("AUTO");
  const [playerStatus, setPlayerStatus] = useState<PlayerStatus>("idle");

  const channelQuery = useQuery({
    queryKey: ["channel", slug, token],
    queryFn: async () => (await api.getChannelBySlug(slug, token)).channel,
    enabled: Boolean(token && slug),
  });

  const favoritesQuery = useQuery({
    queryKey: ["favorites", token],
    queryFn: async () => (await api.listFavorites(token!)).favorites,
    enabled: Boolean(token),
  });

  const favoriteMutation = useMutation({
    mutationFn: async (isFavorite: boolean) => {
      if (!token || !channelQuery.data) {
        throw new Error("Missing channel context");
      }

      if (isFavorite) {
        await api.removeFavorite(channelQuery.data.id, token);
      } else {
        await api.addFavorite(channelQuery.data.id, token);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["favorites", token] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to update favorites");
    },
  });

  const isFavorite = useMemo(() => {
    return (favoritesQuery.data ?? []).some((favorite) => favorite.channelId === channelQuery.data?.id);
  }, [channelQuery.data?.id, favoritesQuery.data]);

  useEffect(() => {
    setQualities([...defaultQualityOptions]);
    setSelectedQuality("AUTO");
    setPlayerStatus("idle");
  }, [slug]);

  if (!channelQuery.data) {
    return (
      <Panel>
        <p className="text-sm text-slate-400">Loading channel...</p>
      </Panel>
    );
  }

  const channel = channelQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Single View"
        title={channel.name}
        description="Real HLS playback with manual quality switching while keeping Auto mode available."
        actions={
          <>
            <Button
              onClick={() => favoriteMutation.mutate(isFavorite)}
              variant={isFavorite ? "primary" : "secondary"}
            >
              <Heart className={isFavorite ? "h-4 w-4 fill-current" : "h-4 w-4"} />
              {isFavorite ? "Favorited" : "Add favorite"}
            </Button>
            <Link to={`/multiview?channels=${channel.id}`}>
              <Button variant="secondary">
                <LayoutTemplate className="h-4 w-4" />
                Open in Multi-View
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.5fr]">
        <Panel className="p-3">
          <div className="h-[68vh]">
            <HlsPlayer
              autoPlay
              muted={false}
              onQualityOptionsChange={setQualities}
              onSelectedQualityChange={setSelectedQuality}
              onStatusChange={setPlayerStatus}
              preferredQuality={selectedQuality}
              src={channel.masterHlsUrl}
              title={channel.name}
            />
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Playback Controls</p>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-2 block text-sm text-slate-400" htmlFor="quality">
                  Quality
                </label>
                <Select id="quality" onChange={(event) => setSelectedQuality(event.target.value)} value={selectedQuality}>
                  {qualities.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 p-4">
                <p className="text-sm font-semibold text-white">Current state</p>
                <p className="mt-2 text-sm text-slate-400">
                  {playerStatus} · {selectedQuality === "AUTO" ? "Auto quality" : `Manual quality ${selectedQuality}`}
                </p>
              </div>
            </div>
          </Panel>

          <Panel>
            <div className="flex items-center gap-3">
              <Tv className="h-5 w-5 text-accent" />
              <div>
                <p className="font-semibold text-white">{channel.group?.name ?? "Ungrouped"}</p>
                <p className="text-sm text-slate-400">Slug: {channel.slug}</p>
              </div>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-400">
              <p>Master HLS URL</p>
              <p className="rounded-2xl bg-slate-950/80 p-3 font-mono text-xs text-slate-300">{channel.masterHlsUrl}</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
