import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, PlayCircle, TestTube2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth-context";
import { HlsPlayer } from "@/player/hls-player";
import { api } from "@/services/api";
import type { Channel, QualityOption, StreamTestResult } from "@/types/api";

const emptyForm = {
  name: "",
  slug: "",
  logoUrl: "",
  groupId: "",
  masterHlsUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  isActive: true,
  sortOrder: 0,
};

export function AdminChannelsPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
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

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!token) {
        throw new Error("Missing session");
      }

      const payload = {
        ...form,
        groupId: form.groupId || null,
        sortOrder: Number(form.sortOrder),
      };

      if (editingChannelId) {
        return api.updateChannel(editingChannelId, payload, token);
      }

      return api.createChannel(payload, token);
    },
    onSuccess: () => {
      toast.success(editingChannelId ? "Channel updated" : "Channel created");
      setEditingChannelId(null);
      setForm(emptyForm);
      setStreamResult(null);
      void queryClient.invalidateQueries({ queryKey: ["channels", token] });
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
    onSuccess: () => {
      toast.success("Channel deleted");
      void queryClient.invalidateQueries({ queryKey: ["channels", token] });
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
      return api.testStream(form.masterHlsUrl, token);
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

  function editChannel(channel: Channel) {
    setEditingChannelId(channel.id);
    setForm({
      name: channel.name,
      slug: channel.slug,
      logoUrl: channel.logoUrl ?? "",
      groupId: channel.groupId ?? "",
      masterHlsUrl: channel.masterHlsUrl,
      isActive: channel.isActive,
      sortOrder: channel.sortOrder,
    });
    setStreamResult(null);
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
      await api.updateChannel(
        channel.id,
        {
          ...channel,
          sortOrder: target.sortOrder,
        },
        token,
      );
      await api.updateChannel(
        target.id,
        {
          ...target,
          groupId: target.groupId,
          sortOrder: channel.sortOrder,
        },
        token,
      );
      toast.success("Channel order updated");
      void queryClient.invalidateQueries({ queryKey: ["channels", token] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to reorder channels");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Channel management"
        description="Store each channel as one logical feed backed by a master HLS URL. Operators pick quality inside the player, not via duplicate channel rows."
      />

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <Panel className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                {editingChannelId ? "Edit Channel" : "Create Channel"}
              </p>
              <p className="mt-2 text-sm text-slate-400">Master playlist URL only. Quality variants are discovered by HLS.js.</p>
            </div>
            <Button onClick={() => streamTestMutation.mutate()} variant="secondary">
              <TestTube2 className="h-4 w-4" />
              Test stream
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name">
              <Input onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} value={form.name} />
            </Field>
            <Field label="Slug">
              <Input onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))} value={form.slug} />
            </Field>
            <Field label="Logo URL">
              <Input
                onChange={(event) => setForm((current) => ({ ...current, logoUrl: event.target.value }))}
                value={form.logoUrl}
              />
            </Field>
            <Field label="Group">
              <Select
                onChange={(event) => setForm((current) => ({ ...current, groupId: event.target.value }))}
                value={form.groupId}
              >
                <option value="">Ungrouped</option>
                {(groupsQuery.data ?? []).map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Master HLS URL">
            <Input
              onChange={(event) => setForm((current) => ({ ...current, masterHlsUrl: event.target.value }))}
              value={form.masterHlsUrl}
            />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Sort order">
              <Input
                onChange={(event) => setForm((current) => ({ ...current, sortOrder: Number(event.target.value) }))}
                type="number"
                value={form.sortOrder}
              />
            </Field>
            <Field label="Status">
              <Select
                onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.value === "true" }))}
                value={String(form.isActive)}
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </Select>
            </Field>
          </div>

          <div className="flex gap-3">
            <Button className="flex-1" onClick={() => saveMutation.mutate()}>
              {editingChannelId ? "Update channel" : "Create channel"}
            </Button>
            {editingChannelId ? (
              <Button
                className="flex-1"
                onClick={() => {
                  setEditingChannelId(null);
                  setForm(emptyForm);
                  setStreamResult(null);
                }}
                variant="secondary"
              >
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
              <p className="text-sm font-semibold text-white">Preview player</p>
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
              <div
                key={channel.id}
                className="rounded-3xl border border-slate-800/70 bg-slate-950/60 p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-semibold text-white">{channel.name}</p>
                    <p className="mt-1 text-sm text-slate-400">
                      {channel.group?.name ?? "Ungrouped"} · order {channel.sortOrder} · {channel.isActive ? "active" : "inactive"}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">{channel.masterHlsUrl}</p>
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
                    <Button
                      onClick={() => {
                        setForm({
                          name: channel.name,
                          slug: channel.slug,
                          logoUrl: channel.logoUrl ?? "",
                          groupId: channel.groupId ?? "",
                          masterHlsUrl: channel.masterHlsUrl,
                          isActive: channel.isActive,
                          sortOrder: channel.sortOrder,
                        });
                      }}
                      variant="ghost"
                    >
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-sm text-slate-400">{label}</label>
      {children}
    </div>
  );
}
