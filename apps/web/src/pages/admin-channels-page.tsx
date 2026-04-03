import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, PlayCircle, TestTube2 } from "lucide-react";
import { toast } from "react-hot-toast";
import type { StreamTestInput } from "@tv-dash/shared";
import { ChannelAdminFormFields } from "@/components/channels/channel-admin-form";
import { ChannelDiagnosticsPanel } from "@/components/channels/channel-diagnostics-panel";
import {
  buildChannelFormFromConfig,
  emptyChannelForm,
  parseHeadersJson,
  validateChannelForm,
} from "@/components/channels/channel-admin-form-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth-context";
import { HlsPlayer } from "@/player/hls-player";
import { api, getChannelPlaybackUrl } from "@/services/api";
import type { Channel, QualityOption, StreamTestResult } from "@/types/api";

interface StreamTestItem {
  label: string;
  playlistUrl: string;
  result: StreamTestResult;
}

interface StreamTestSummary {
  sourceMode: "MASTER_PLAYLIST" | "MANUAL_VARIANTS";
  items: StreamTestItem[];
}

const defaultPreviewQualities: QualityOption[] = [{ value: "AUTO", label: "Auto", height: null }];

export function AdminChannelsPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyChannelForm);
  const [previewQualities, setPreviewQualities] = useState<QualityOption[]>([...defaultPreviewQualities]);
  const [previewSelectedQuality, setPreviewSelectedQuality] = useState("AUTO");
  const [streamTestSummary, setStreamTestSummary] = useState<StreamTestSummary | null>(null);

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

  const channelDiagnosticsQuery = useQuery({
    queryKey: ["channel-diagnostics", editingChannelId, token],
    queryFn: async () => {
      if (!editingChannelId || !token) {
        throw new Error("Missing channel context");
      }

      return (await api.getChannelDiagnostics(editingChannelId, token)).diagnostics;
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

      const validation = validateChannelForm(form);

      if (!validation.isValid || !validation.payload) {
        const [firstIssue] = validation.issues;
        throw new Error(
          firstIssue
            ? `${firstIssue.message}${validation.issues.length > 1 ? ` (${validation.issues.length} issues total)` : ""}`
            : "Fix the highlighted form issues before saving",
        );
      }

      const payload = validation.payload;

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

      const requests = buildStreamTestRequests(form);
      const items = await Promise.all(
        requests.map(async ({ label, payload }) => ({
          label,
          playlistUrl: payload.url,
          result: (await api.testStream(payload, token)).result,
        })),
      );

      return {
        sourceMode: form.sourceMode,
        items,
      } satisfies StreamTestSummary;
    },
    onSuccess: (summary) => {
      setStreamTestSummary(summary);
      toast.success(summary.sourceMode === "MASTER_PLAYLIST" ? "Master playlist tested" : "Manual variants tested");
    },
    onError: (error) => {
      setStreamTestSummary(null);
      toast.error(error instanceof Error ? error.message : "Stream test failed");
    },
  });

  const sortedChannels = useMemo(
    () => [...(channelsQuery.data ?? [])].sort((left, right) => left.sortOrder - right.sortOrder),
    [channelsQuery.data],
  );

  const previewSrc = buildPreviewSrc(form, editingChannelId);
  const previewUnavailableReason =
    form.sourceMode === "MANUAL_VARIANTS" && !editingChannelId
      ? "Save the channel first to preview the synthesized master playlist."
      : null;

  function resetEditor() {
    setEditingChannelId(null);
    setForm(emptyChannelForm);
    setStreamTestSummary(null);
    setPreviewQualities([...defaultPreviewQualities]);
    setPreviewSelectedQuality("AUTO");
  }

  function editChannel(channel: Channel) {
    setEditingChannelId(channel.id);
    setStreamTestSummary(null);
    setPreviewQualities([...defaultPreviewQualities]);
    setPreviewSelectedQuality("AUTO");
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
        description="Configure each logical channel from either a real master playlist or manually entered quality variants while keeping one playback source for operators."
      />

      <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
        <Panel className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                {editingChannelId ? "Edit Channel" : "Create Channel"}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                Manual variant mode generates a synthetic master playlist so the player still sees one logical channel with switchable qualities.
              </p>
            </div>
            <Button onClick={() => streamTestMutation.mutate()} variant="secondary">
              <TestTube2 className="h-4 w-4" />
              Test source
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
              Use proxy mode when the provider expects TV-Dash to own upstream access, custom headers, or referrer handling. Direct mode keeps the browser on the upstream path, while manual variants still get a synthesized master playlist from the backend.
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

          {streamTestSummary ? (
            <div className="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-4">
              <p className="text-sm font-semibold text-white">Source test result</p>
              <p className="mt-2 text-sm text-slate-400">
                {streamTestSummary.sourceMode === "MASTER_PLAYLIST"
                  ? "Master playlist inspection"
                  : `${streamTestSummary.items.length} manual variant playlist test(s)`}
              </p>
              <div className="mt-4 space-y-3">
                {streamTestSummary.items.map((item) => (
                  <div key={`${item.label}-${item.playlistUrl}`} className="rounded-2xl border border-slate-800/80 bg-slate-950/80 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{item.label}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.result.isMasterPlaylist ? "Master playlist detected" : "Media playlist reachable"} ·{" "}
                          {item.result.variantCount} nested variant(s)
                        </p>
                      </div>
                    </div>
                    {item.result.variants.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.result.variants.map((variant) => (
                          <span
                            key={`${item.label}-${variant.label}-${variant.bandwidth}`}
                            className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100"
                          >
                            {variant.label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-white">Preview player</p>
                <p className="mt-1 text-xs text-slate-500">
                  Master-playlist channels preview the upstream source directly. Saved manual-variant channels preview through the generated synthetic master.
                </p>
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

            {previewUnavailableReason ? (
              <div className="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-4 text-sm text-slate-400">
                {previewUnavailableReason}
              </div>
            ) : (
              <div className="h-[280px]">
                <HlsPlayer
                  autoPlay
                  muted
                  onQualityOptionsChange={setPreviewQualities}
                  onSelectedQualityChange={setPreviewSelectedQuality}
                  preferredQuality={previewSelectedQuality}
                  src={previewSrc}
                  title={form.name || "Preview"}
                />
              </div>
            )}

            <div className="mt-4">
              <ChannelDiagnosticsPanel
                diagnostics={channelDiagnosticsQuery.data}
                isLoading={channelDiagnosticsQuery.isLoading}
                onRefresh={
                  editingChannelId
                    ? () => {
                        void queryClient.invalidateQueries({
                          queryKey: ["channel-diagnostics", editingChannelId, token],
                        });
                      }
                    : undefined
                }
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
                        {channel.sourceMode === "MASTER_PLAYLIST" ? "Master playlist" : `${channel.manualVariantCount} manual variant(s)`}
                      </span>
                      <span className="rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-1 text-slate-300">
                        {channel.playbackMode === "PROXY" ? "Proxy playback" : "Direct playback"}
                      </span>
                      <span className="rounded-full border border-slate-700/80 bg-slate-950/80 px-3 py-1 text-slate-300">
                        {channel.epgSource ? `EPG: ${channel.epgSource.name}` : "No EPG mapping"}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                      {channel.sourceMode === "MASTER_PLAYLIST"
                        ? channel.playbackMode === "PROXY"
                          ? "Upstream master URL hidden from the public channel payload."
                          : channel.masterHlsUrl
                        : "Playback uses a backend-generated synthetic master playlist."}
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

function buildStreamTestRequests(form: typeof emptyChannelForm) {
  const requestConfig = {
    requestUserAgent: form.upstreamUserAgent || null,
    requestReferrer: form.upstreamReferrer || null,
    requestHeaders: parseHeadersJson(form.upstreamHeadersText),
  };

  if (form.sourceMode === "MASTER_PLAYLIST") {
    return [
      {
        label: "Master playlist",
        payload: {
          url: form.masterHlsUrl,
          ...requestConfig,
        } satisfies StreamTestInput,
      },
    ];
  }

  const requests = form.manualVariants
    .filter((variant) => variant.isActive && variant.playlistUrl.trim())
    .map((variant, index) => ({
      label: variant.label.trim() || `Variant ${index + 1}`,
      payload: {
        url: variant.playlistUrl,
        ...requestConfig,
      } satisfies StreamTestInput,
    }));

  if (requests.length === 0) {
    throw new Error("Add at least one active manual variant URL before testing");
  }

  return requests;
}

function buildPreviewSrc(form: typeof emptyChannelForm, editingChannelId: string | null) {
  if (form.sourceMode === "MASTER_PLAYLIST") {
    return form.masterHlsUrl || null;
  }

  if (!editingChannelId) {
    return null;
  }

  return getChannelPlaybackUrl({
    id: editingChannelId,
    sourceMode: form.sourceMode,
    masterHlsUrl: form.masterHlsUrl || null,
    playbackMode: form.playbackMode,
  });
}
