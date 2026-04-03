import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, LayoutTemplate, Search, Tv } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { ChannelGuideCard } from "@/components/channels/channel-guide-card";
import { ChannelPickerDialog } from "@/components/channels/channel-picker-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth-context";
import { isEditableKeyboardTarget } from "@/lib/keyboard";
import { HlsPlayer, type PlayerDiagnostics } from "@/player/hls-player";
import { buildPlayerDiagnostics } from "@/player/playback-diagnostics";
import { defaultQualityOptions } from "@/player/quality-options";
import { api, getChannelPlaybackUrl } from "@/services/api";
import type { QualityOption } from "@/types/api";

export function ChannelWatchPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [qualities, setQualities] = useState<QualityOption[]>([...defaultQualityOptions]);
  const [selectedQuality, setSelectedQuality] = useState("AUTO");
  const [playerDiagnostics, setPlayerDiagnostics] = useState<PlayerDiagnostics>(() =>
    buildPlayerDiagnostics({
      status: "idle",
      muted: false,
    }),
  );
  const [pickerOpen, setPickerOpen] = useState(false);

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

  const channelsQuery = useQuery({
    queryKey: ["channels", token],
    queryFn: async () => (await api.listChannels(token)).channels,
    enabled: Boolean(token),
  });

  const nowNextQuery = useQuery({
    queryKey: ["now-next", channelQuery.data?.id, token],
    queryFn: async () => {
      if (!token || !channelQuery.data) {
        throw new Error("Missing channel context");
      }

      return (await api.getNowNext([channelQuery.data.id], token)).items[0] ?? null;
    },
    enabled: Boolean(token && channelQuery.data?.id),
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
    setPlayerDiagnostics(
      buildPlayerDiagnostics({
        status: "idle",
        muted: false,
      }),
    );
  }, [slug]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPickerOpen(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (!channelQuery.data) {
    return (
      <Panel>
        <p className="text-sm text-slate-400">Loading channel...</p>
      </Panel>
    );
  }

  const channel = channelQuery.data;
  const playbackUrl = getChannelPlaybackUrl(channel);
  const nowNext = nowNextQuery.data;

  return (
    <div className="space-y-4">
      <PageHeader
        density="compact"
        eyebrow="Single View"
        title={channel.name}
        description="Real HLS playback with manual quality switching, optional proxy delivery, and live now/next guide context."
        actions={
          <>
            <Button onClick={() => setPickerOpen(true)} size="sm" variant="secondary">
              <Search className="h-4 w-4" />
              Quick switch
            </Button>
            <Button
              onClick={() => favoriteMutation.mutate(isFavorite)}
              size="sm"
              variant={isFavorite ? "primary" : "secondary"}
            >
              <Heart className={isFavorite ? "h-4 w-4 fill-current" : "h-4 w-4"} />
              {isFavorite ? "Favorited" : "Add favorite"}
            </Button>
            <Link to={`/multiview?channels=${channel.id}`}>
              <Button size="sm" variant="secondary">
                <LayoutTemplate className="h-4 w-4" />
                Open in Multi-View
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel className="p-2" density="compact">
          <div className="h-[calc(100vh-10.5rem)] min-h-[420px]">
            <HlsPlayer
              autoPlay
              muted={false}
              onQualityOptionsChange={setQualities}
              onSelectedQualityChange={setSelectedQuality}
              onDiagnosticsChange={setPlayerDiagnostics}
              preferredQuality={selectedQuality}
              src={playbackUrl}
              title={channel.name}
            />
          </div>
        </Panel>

        <div className="space-y-3 xl:sticky xl:top-3 xl:self-start">
          <Panel density="compact">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Playback Controls</p>
            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1.5 block text-[13px] text-slate-400" htmlFor="quality">
                  Quality
                </label>
                <Select id="quality" onChange={(event) => setSelectedQuality(event.target.value)} uiSize="sm" value={selectedQuality}>
                  {qualities.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/80 p-3">
                <p className="text-[13px] font-semibold text-white">Current state</p>
                <p className="mt-1.5 text-[13px] text-slate-400">
                  {playerDiagnostics.label} · {selectedQuality === "AUTO" ? "Auto quality" : `Manual quality ${selectedQuality}`}
                </p>
                <p className="mt-1.5 text-[12px] text-slate-300">{playerDiagnostics.summary}</p>
                {playerDiagnostics.failureKind ? (
                  <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                    Likely issue: {playerDiagnostics.failureKind}
                  </p>
                ) : null}
                <p className="mt-1.5 text-[11px] text-slate-500">
                  {channel.playbackMode === "PROXY"
                    ? "Playback is routed through the TV-Dash stream gateway."
                    : "Playback uses the channel's direct upstream HLS URL."}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Audio: {playerDiagnostics.isMuted ? "Muted by player" : "Live audio enabled"}
                </p>
              </div>
            </div>
          </Panel>

          <Panel density="compact">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Now / Next</p>
            <ChannelGuideCard
              className="mt-3"
              guide={nowNext}
              hasEpgSource={Boolean(channel.epgSource)}
              isLoading={nowNextQuery.isLoading}
              variant="detailed"
            />
          </Panel>

          <Panel density="compact">
            <div className="flex items-center gap-3">
              <Tv className="h-4 w-4 text-accent" />
              <div>
                <p className="text-sm font-semibold text-white">{channel.group?.name ?? "Ungrouped"}</p>
                <p className="text-[13px] text-slate-400">Slug: {channel.slug}</p>
              </div>
            </div>
            <div className="mt-3 space-y-2.5 text-[13px] text-slate-400">
              <p>Stream access</p>
              <p className="rounded-xl bg-slate-950/80 p-2.5 font-mono text-[11px] text-slate-300">
                {channel.playbackMode === "PROXY" ? playbackUrl : channel.masterHlsUrl}
              </p>
              <p>
                Guide link: {channel.epgSource ? `${channel.epgSource.name} / ${channel.epgChannelId}` : "not configured"}
              </p>
            </div>
          </Panel>
        </div>
      </div>

      <ChannelPickerDialog
        allowClear={false}
        channels={channelsQuery.data ?? []}
        description="Search the full channel list and jump straight into another live feed without leaving the player."
        nowNextByChannelId={undefined}
        onClose={() => setPickerOpen(false)}
        onSelect={(channelId) => {
          const nextChannel = (channelsQuery.data ?? []).find((entry) => entry.id === channelId);

          if (!nextChannel) {
            return;
          }

          setPickerOpen(false);
          navigate(`/watch/${nextChannel.slug}`);
        }}
        open={pickerOpen}
        selectedChannelId={channel.id}
        title="Quick channel switch"
      />
    </div>
  );
}
