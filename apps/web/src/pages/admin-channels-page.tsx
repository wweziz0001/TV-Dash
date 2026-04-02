import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, PlayCircle, TestTube2 } from "lucide-react";
import { toast } from "react-hot-toast";
import type { StreamTestInput } from "@tv-dash/shared";
import { ChannelAdminFormFields, buildChannelFormFromConfig, buildChannelInput, emptyChannelForm, parseHeadersJson } from "@/components/channels/channel-admin-form";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth-context";
import { HlsPlayer } from "@/player/hls-player";
import { api } from "@/services/api";
import type { Channel, QualityOption, StreamTestResult } from "@/types/api";

export function AdminChannelsPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyChannelForm);
  const [previewQualities, setPreviewQualities] = useState<QualityOption[]>([
    { value: "AUTO", label: "Auto", height: null },
  ]);
  const [previewSelectedQuality, setPreviewSelectedQuality] = useState("AUTO");
  const [streamResult, setStreamResult] = useState<StreamTestResult | null>(null);

  const channelsQuery = useQuery({
    queryKey: ["channels", token],
    queryFn: async () => (await api.listChannels(token)).channels,
    enabled: Boolean(token),
  });

  const groupsQuery = useQuery({
    queryKey: ["groups", token],
    queryFn: async () => (await api.listGroups(token)).groups,
    enabled: Boolean(token),
  });

  const epgSourcesQuery = useQuery({
    queryKey: ["epg-sources", token],
    queryFn: async () => (await api.listEpgSources(token!)).sources,
    enabled: Boolean(token),
  });

  const channelConfigQuery = useQuery({
    queryKey: ["channel-config", editingChannelId, token],
    queryFn: async () => {
      if (!editingChannelId || !token) {
        throw new Error("Missing channel context");
      }

      return (await api.getChannelConfig(editingChannelId, token)).channel;
    },
    enabled: Boolean(token && editingChannelId),
  });

  useEffect(() => {
    if (!channelConfigQuery.data) {
      return;
    }

    setForm(buildChannelFormFromConfig(channelConfigQuery.data));
  }, [channelConfigQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!token) {
        throw new Error("Missing session");
      }

      const payload = buildChannelInput(form);

      if (editingChannelId) {
        return api.updateChannel(editingChannelId, payload, token);
      }

      return api.createChannel(payload, token);
    },
    onSuccess: async () => {
      toast.success(editingChannelId ? "Channel updated" : "Channel created");
      resetEditor();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["channels", token] }),
        queryClient.invalidateQueries({ queryKey: ["channel-config", editingChannelId, token] }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to save channel");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!token) {
        throw new Error("Missing session");
      }

      await api.deleteChannel(id, token);
    },
    onSuccess: async () => {
      toast.success("Channel deleted");

      if (editingChannelId) {
        resetEditor();
      }

      await queryClient.invalidateQueries({ queryKey: ["channels", token] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to delete channel");
    },
  });

  const streamTestMutation = useMutation({
    mutationFn: async () => {
      if (!token) {
        throw new Error("Missing session");
      }

      return api.testStream(buildStreamTestPayload(form), token);
    },
    onSuccess: (response) => {
      setStreamResult(response.result);
      toast.success("Stream test completed");
    },
    onError: (error) => {
      setStreamResult(null);
      toast.error(error instanceof Error ? error.message : "Stream test failed");
    },
  });

  const sortedChannels = useMemo(
    () => [...(channelsQuery.data ?? [])].sort((left, right) => left.sortOrder - right.sortOrder),
    [channelsQuery.data],
  );

  function resetEditor() {
    setEditingChannelId(null);
    setForm(emptyChannelForm);
    setStreamResult(null);
    setPreviewSelectedQuality("AUTO");
  }

  function editChannel(channel: Channel) {
    setEditingChannelId(channel.id);
    setStreamResult(null);
    setPreviewSelectedQuality("AUTO");

    const masterHlsUrl = channel.masterHlsUrl;

    if (masterHlsUrl) {
      setForm((current) => ({
        ...current,
        name: channel.name,
        slug: channel.slug,
        logoUrl: channel.logoUrl ?? "",
        groupId: channel.groupId ?? "",
        masterHlsUrl,
        isActive: channel.isActive,
        sortOrder: channel.sortOrder,
        playbackMode: channel.playbackMode,
        epgSourceId: channel.epgSourceId ?? "",
        epgChannelId: channel.epgChannelId ?? "",
      }));
    }
  }

  async function moveChannel(channel: Channel, direction: "up" | "down") {
    if (!token) {
      return;
    }

    const currentIndex = sortedChannels.findIndex((entry) => entry.id === channel.id);
    const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    const target = sortedChannels[swapIndex];

    if (currentIndex < 0 || !target) {
      return;
    }

    try {
      await Promise.all([
        api.updateChannelSortOrder(channel.id, target.sortOrder, token),
        api.updateChannelSortOrder(target.id, channel.sortOrder, token),
      ]);
      toast.success("Channel order updated");
      await queryClient.invalidateQueries({ queryKey: ["channels", token] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to reorder channels");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Channel management"
        description="Control direct vs proxied playback, upstream request behavior, and channel-to-guide mapping without duplicating channel rows."
      />

      <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
        <Panel className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                {editingChannelId ? "Edit Channel" : "Create Channel"}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                Proxy mode hides the upstream URL from the player. Direct mode keeps the current client-side playback path.
              </p>
            </div>
            <Button onClick={() => streamTestMutation.mutate()} variant="secondary">
              <TestTube2 className="h-4 w-4" />
              Test stream
            </Button>
          </div>

          {editingChannelId && channelConfigQuery.isLoading ? (
            <div className="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-4 text-sm text-slate-400">
              Loading admin channel configuration...
            </div>
          ) : null}

          <ChannelAdminFormFields
            epgSources={epgSourcesQuery.data ?? []}
            form={form}
            groups={groupsQuery.data ?? []}
            onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
          />

          <div className="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-4 text-sm text-slate-400">
            <p className="font-semibold text-white">Operational notes</p>
            <p className="mt-2">
              Use upstream request fields only when the provider expects a custom User-Agent, Referrer, or headers. Keep
              proxy mode for channels where TV-Dash should own upstream access.
            </p>
          </div>

          <div className="flex gap-3">
            <Button className="flex-1" onClick={() => saveMutation.mutate()}>
              {editingChannelId ? "Update channel" : "Create channel"}
            </Button>
            {editingChannelId ? (
              <Button className="flex-1" onClick={resetEditor} variant="secondary">
                Cancel
              </Button>
            ) : null}
          </div>

          {streamResult ? (
            <div className="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-4">
              <p className="text-sm font-semibold text-white">Stream test result</p>
              <p className="mt-2 text-sm text-slate-400">
                {streamResult.isMasterPlaylist ? "Master playlist detected" : "No variants detected"} ·{" "}
                {streamResult.variantCount} variant(s)
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {streamResult.variants.map((variant) => (
                  <span
                    key={`${variant.label}-${variant.bandwidth}`}
                    className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100"
                  >
                    {variant.label}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Preview player</p>
                <p className="mt-1 text-xs text-slate-500">Admin preview uses the raw master URL and request test metadata.</p>
              </div>
              <Select
                className="max-w-[180px]"
                onChange={(event) => setPreviewSelectedQuality(event.target.value)}
                value={previewSelectedQuality}
              >
                {previewQualities.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="h-[280px]">
              <HlsPlayer
                autoPlay
                muted
                onQualityOptionsChange={setPreviewQualities}
                onSelectedQualityChange={setPreviewSelectedQuality}
                preferredQuality={previewSelectedQuality}
                src={form.masterHlsUrl}
                title={form.name || "Preview"}
              />
            </div>
          </div>
        </Panel>

        <Panel>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Current Channels</p>
              <h2 className="mt-2 text-xl font-semibold text-white">{sortedChannels.length} logical channel(s)</h2>
            </div>
            <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 px-4 py-3 text-sm text-slate-300">
              Sorted for operator browse order
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {sortedChannels.map((channel) => (
              <div key={channel.id} className="rounded-3xl border border-slate-800/70 bg-slate-950/60 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-semibold text-white">{channel.name}</p>
                    <p className="mt-1 text-sm text-slate-400">
                      {channel.group?.name ?? "Ungrouped"} · order {channel.sortOrder} ·{" "}
                      {channel.isActive ? "active" : "inactive"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-1 text-slate-300">
                        {channel.playbackMode === "PROXY" ? "Proxy playback" : "Direct playback"}
                      </span>
                      <span className="rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-1 text-slate-300">
                        {channel.epgSource ? `EPG: ${channel.epgSource.name}` : "No EPG mapping"}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                      {channel.playbackMode === "PROXY"
                        ? "Upstream master URL hidden from the public channel payload."
                        : channel.masterHlsUrl}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button onClick={() => moveChannel(channel, "up")} variant="secondary">
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button onClick={() => moveChannel(channel, "down")} variant="secondary">
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button onClick={() => editChannel(channel)} variant="secondary">
                      Edit
                    </Button>
                    <Button onClick={() => deleteMutation.mutate(channel.id)} variant="danger">
                      Delete
                    </Button>
                    <Button onClick={() => editChannel(channel)} variant="ghost">
                      <PlayCircle className="h-4 w-4" />
                      Preview
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function buildStreamTestPayload(form: typeof emptyChannelForm): StreamTestInput {
  return {
    url: form.masterHlsUrl,
    requestUserAgent: form.upstreamUserAgent || null,
    requestReferrer: form.upstreamReferrer || null,
    requestHeaders: parseHeadersJson(form.upstreamHeadersText),
  };
}
