import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Link2, RefreshCw, Upload } from "lucide-react";
import { toast } from "react-hot-toast";
import type { EpgSourceInput, ProgramEntryInput } from "@tv-dash/shared";
import { formatHeadersJson, parseHeadersJson } from "@/components/channels/channel-admin-form";
import { ChannelManualProgramManager } from "@/components/epg/channel-manual-program-manager";
import { EpgSourceDiagnosticsPanel } from "@/components/epg/epg-source-diagnostics-panel";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { TextArea } from "@/components/ui/text-area";
import { useAuth } from "@/features/auth/auth-context";
import { api } from "@/services/api";
import type { Channel, EpgSource, EpgSourceChannel } from "@/types/api";

interface EpgSourceFormValue {
  name: string;
  slug: string;
  sourceType: "XMLTV_URL" | "XMLTV_FILE";
  url: string;
  isActive: boolean;
  refreshIntervalMinutes: number;
  requestUserAgent: string;
  requestReferrer: string;
  requestHeadersText: string;
}

const emptySourceForm: EpgSourceFormValue = {
  name: "",
  slug: "",
  sourceType: "XMLTV_URL",
  url: "",
  isActive: true,
  refreshIntervalMinutes: 360,
  requestUserAgent: "",
  requestReferrer: "",
  requestHeadersText: "",
};

export function AdminEpgSourcesPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [sourceChannelSearch, setSourceChannelSearch] = useState("");
  const [sourceForm, setSourceForm] = useState<EpgSourceFormValue>(emptySourceForm);
  const [selectedProgramChannelId, setSelectedProgramChannelId] = useState("");

  const sourcesQuery = useQuery({
    queryKey: ["epg-sources", token],
    queryFn: async () => (await api.listEpgSources(token!)).sources,
    enabled: Boolean(token),
  });

  const channelsQuery = useQuery({
    queryKey: ["channels", token],
    queryFn: async () => (await api.listChannels(token)).channels,
    enabled: Boolean(token),
  });

  const sourceChannelsQuery = useQuery({
    queryKey: ["epg-source-channels", selectedSourceId, sourceChannelSearch, token],
    queryFn: async () => {
      if (!selectedSourceId || !token) {
        throw new Error("Missing source context");
      }

      const params = new URLSearchParams();
      if (sourceChannelSearch.trim()) {
        params.set("search", sourceChannelSearch.trim());
      }

      return api.previewEpgSourceChannels(selectedSourceId, token, params);
    },
    enabled: Boolean(selectedSourceId && token),
  });

  const manualProgramsQuery = useQuery({
    queryKey: ["manual-programs", selectedProgramChannelId, token],
    queryFn: async () => {
      if (!token || !selectedProgramChannelId) {
        throw new Error("Missing session");
      }

      const params = new URLSearchParams();
      params.set("channelId", selectedProgramChannelId);

      return (await api.listManualPrograms(token, params)).programs;
    },
    enabled: Boolean(token && selectedProgramChannelId),
  });

  const diagnosticsQuery = useQuery({
    queryKey: ["epg-diagnostics", selectedSourceId, token],
    queryFn: async () => {
      if (!selectedSourceId || !token) {
        throw new Error("Missing source context");
      }

      return (await api.getEpgSourceDiagnostics(selectedSourceId, token)).diagnostics;
    },
    enabled: Boolean(selectedSourceId && token),
  });

  useEffect(() => {
    if (!selectedSourceId && sourcesQuery.data?.[0]) {
      setSelectedSourceId(sourcesQuery.data[0].id);
    }
  }, [selectedSourceId, sourcesQuery.data]);

  useEffect(() => {
    if (!selectedProgramChannelId && channelsQuery.data?.[0]) {
      setSelectedProgramChannelId(channelsQuery.data[0].id);
    }
  }, [channelsQuery.data, selectedProgramChannelId]);

  const saveSourceMutation = useMutation({
    mutationFn: async () => {
      if (!token) {
        throw new Error("Missing session");
      }

      const payload = buildEpgSourceInput(sourceForm);

      if (editingSourceId) {
        return api.updateEpgSource(editingSourceId, payload, token);
      }

      return api.createEpgSource(payload, token);
    },
    onSuccess: async (response) => {
      toast.success(editingSourceId ? "EPG source updated" : "EPG source created");
      setEditingSourceId(response.source.id);
      setSelectedSourceId(response.source.id);
      setSourceForm(buildSourceForm(response.source));
      await queryClient.invalidateQueries({ queryKey: ["epg-sources", token] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to save EPG source");
    },
  });

  const deleteSourceMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!token) {
        throw new Error("Missing session");
      }

      await api.deleteEpgSource(id, token);
    },
    onSuccess: async (_, deletedId) => {
      toast.success("EPG source deleted");
      if (editingSourceId === deletedId) {
        resetSourceEditor();
      }
      if (selectedSourceId === deletedId) {
        const fallbackSource = sourcesQuery.data?.find((source) => source.id !== deletedId) ?? null;
        setSelectedSourceId(fallbackSource?.id ?? null);
      }
      await queryClient.invalidateQueries({ queryKey: ["epg-sources", token] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to delete EPG source");
    },
  });

  const importUrlMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!token) {
        throw new Error("Missing session");
      }

      return api.importEpgSourceFromUrl(id, token);
    },
    onSuccess: async (response) => {
      toast.success("XMLTV import finished");
      setSelectedSourceId(response.source.id);
      await invalidateEpgQueries(queryClient, response.source.id, token);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to import XMLTV URL");
    },
  });

  const importFileMutation = useMutation({
    mutationFn: async ({ sourceId, file }: { sourceId: string; file: File }) => {
      if (!token) {
        throw new Error("Missing session");
      }

      return api.importEpgSourceFromFile(
        sourceId,
        {
          fileName: file.name,
          xmlContent: await file.text(),
        },
        token,
      );
    },
    onSuccess: async (response) => {
      toast.success("Uploaded XMLTV file imported");
      setSelectedSourceId(response.source.id);
      await invalidateEpgQueries(queryClient, response.source.id, token);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to import uploaded XMLTV file");
    },
  });

  const mappingMutation = useMutation({
    mutationFn: async (input: { sourceChannel: EpgSourceChannel; nextChannelId: string }) => {
      if (!token) {
        throw new Error("Missing session");
      }

      if (!input.nextChannelId) {
        if (!input.sourceChannel.mapping) {
          return;
        }

        await api.updateEpgChannelMapping(
          {
            channelId: input.sourceChannel.mapping.channel.id,
            sourceChannelId: null,
          },
          token,
        );
        return;
      }

      await api.updateEpgChannelMapping(
        {
          channelId: input.nextChannelId,
          sourceChannelId: input.sourceChannel.id,
        },
        token,
      );
    },
    onSuccess: async () => {
      toast.success("Channel mapping updated");
      if (selectedSourceId) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["channels", token] }),
          queryClient.invalidateQueries({ queryKey: ["epg-source-channels", selectedSourceId, sourceChannelSearch, token] }),
          queryClient.invalidateQueries({ queryKey: ["epg-sources", token] }),
        ]);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to update channel mapping");
    },
  });

  const saveProgramMutation = useMutation({
    mutationFn: async (input: { id?: string; payload: ProgramEntryInput }) => {
      if (!token) {
        throw new Error("Missing session");
      }

      if (input.id) {
        return api.updateManualProgram(input.id, input.payload, token);
      }

      return api.createManualProgram(input.payload, token);
    },
    onSuccess: async (response, variables) => {
      toast.success(variables.id ? "Manual programme updated" : "Manual programme created");
      await invalidateManualProgramQueries(queryClient, response.program.channelId ?? selectedProgramChannelId, token);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to save manual programme");
    },
  });

  const deleteProgramMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!token) {
        throw new Error("Missing session");
      }

      await api.deleteManualProgram(id, token);
    },
    onSuccess: async () => {
      toast.success("Manual programme deleted");
      await invalidateManualProgramQueries(queryClient, selectedProgramChannelId, token);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to delete manual programme");
    },
  });

  const sources = sourcesQuery.data ?? [];
  const channels = channelsQuery.data ?? [];
  const selectedSource = sources.find((source) => source.id === selectedSourceId) ?? null;
  const activeSourceCount = useMemo(() => sources.filter((source) => source.isActive).length, [sources]);

  function resetSourceEditor() {
    setEditingSourceId(null);
    setSourceForm(emptySourceForm);
  }

  function editSource(source: EpgSource) {
    setEditingSourceId(source.id);
    setSelectedSourceId(source.id);
    setSourceForm(buildSourceForm(source));
  }

  async function handleImportFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file || !selectedSourceId) {
      return;
    }

    importFileMutation.mutate({
      sourceId: selectedSourceId,
      file,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="EPG guide management"
        description="Manage XMLTV URL and file sources, import guide data, map channels, and add manual programme overrides for now/next and future full-guide workflows."
      />

      <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <Panel className="space-y-4" density="compact">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
              {editingSourceId ? "Edit Source" : "Create Source"}
            </p>
            <p className="mt-1.5 text-sm text-slate-400">
              URL sources refresh from the upstream feed. File sources import when operators upload a new XMLTV file.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Name">
              <Input onChange={(event) => setSourceForm((current) => ({ ...current, name: event.target.value }))} uiSize="sm" value={sourceForm.name} />
            </Field>
            <Field label="Slug">
              <Input onChange={(event) => setSourceForm((current) => ({ ...current, slug: event.target.value }))} uiSize="sm" value={sourceForm.slug} />
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Source type">
              <Select
                onChange={(event) =>
                  setSourceForm((current) => ({
                    ...current,
                    sourceType: event.target.value as EpgSourceFormValue["sourceType"],
                  }))
                }
                uiSize="sm"
                value={sourceForm.sourceType}
              >
                <option value="XMLTV_URL">XMLTV URL</option>
                <option value="XMLTV_FILE">XMLTV file upload</option>
              </Select>
            </Field>
            <Field label="Status">
              <Select
                onChange={(event) => setSourceForm((current) => ({ ...current, isActive: event.target.value === "true" }))}
                uiSize="sm"
                value={String(sourceForm.isActive)}
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </Select>
            </Field>
          </div>

          {sourceForm.sourceType === "XMLTV_URL" ? (
            <>
              <Field label="XMLTV URL">
                <Input onChange={(event) => setSourceForm((current) => ({ ...current, url: event.target.value }))} uiSize="sm" value={sourceForm.url} />
              </Field>

              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Refresh interval (minutes)">
                  <Input
                    onChange={(event) =>
                      setSourceForm((current) => ({
                        ...current,
                        refreshIntervalMinutes: Number(event.target.value),
                      }))
                    }
                    type="number"
                    uiSize="sm"
                    value={sourceForm.refreshIntervalMinutes}
                  />
                </Field>
                <Field label="Upstream User-Agent">
                  <Input
                    onChange={(event) =>
                      setSourceForm((current) => ({
                        ...current,
                        requestUserAgent: event.target.value,
                      }))
                    }
                    uiSize="sm"
                    value={sourceForm.requestUserAgent}
                  />
                </Field>
              </div>

              <Field label="Upstream Referrer">
                <Input
                  onChange={(event) =>
                    setSourceForm((current) => ({
                      ...current,
                      requestReferrer: event.target.value,
                    }))
                  }
                  uiSize="sm"
                  value={sourceForm.requestReferrer}
                />
              </Field>

              <Field label="Upstream Headers JSON">
                <TextArea
                  onChange={(event) =>
                    setSourceForm((current) => ({
                      ...current,
                      requestHeadersText: event.target.value,
                    }))
                  }
                  placeholder='{"x-guide-token":"value"}'
                  rows={4}
                  value={sourceForm.requestHeadersText}
                />
              </Field>
            </>
          ) : (
            <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 p-3 text-sm text-slate-400">
              File-backed sources do not need upstream request settings. Save the source first, then upload XMLTV files
              into the import panel.
            </div>
          )}

          <div className="flex gap-3">
            <Button className="flex-1" onClick={() => saveSourceMutation.mutate()}>
              {editingSourceId ? "Update source" : "Create source"}
            </Button>
            {editingSourceId ? (
              <Button className="flex-1" onClick={resetSourceEditor} variant="secondary">
                Cancel
              </Button>
            ) : null}
          </div>

          <Panel className="border border-slate-800/80 bg-slate-950/70" density="compact">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Import actions</p>
                <p className="mt-1.5 text-sm text-slate-400">
                  Run refreshes from URL sources, or upload XMLTV files directly for file-based sources.
                </p>
              </div>
              {selectedSource ? (
                <span className="rounded-full border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                  {selectedSource.sourceType === "XMLTV_URL" ? "URL import" : "File import"}
                </span>
              ) : null}
            </div>

            {!selectedSource ? (
              <p className="mt-3 text-sm text-slate-400">Select or create a source to import guide data.</p>
            ) : selectedSource.sourceType === "XMLTV_URL" ? (
              <div className="mt-3 flex gap-3">
                <Button onClick={() => importUrlMutation.mutate(selectedSource.id)} variant="secondary">
                  <RefreshCw className="h-4 w-4" />
                  Import now
                </Button>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input
                  accept=".xml,.xmltv,text/xml,application/xml"
                  className="block text-sm text-slate-300 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                  onChange={(event) => void handleImportFileSelection(event)}
                  ref={fileInputRef}
                  type="file"
                />
                <span className="text-xs text-slate-500">Uploading immediately imports and replaces prior imported rows for that source.</span>
              </div>
            )}
          </Panel>
        </Panel>

        <div className="space-y-6">
          <Panel density="compact">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Configured sources</p>
                <h2 className="mt-1 text-lg font-semibold text-white">{sources.length} source(s)</h2>
              </div>
              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 px-4 py-3 text-sm text-slate-300">
                {activeSourceCount} active
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {sources.map((source) => (
                <div
                  key={source.id}
                  className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-white">{source.name}</p>
                        <StatusBadge source={source} />
                      </div>
                      <p className="mt-1 text-sm text-slate-400">
                        {source.slug} · {source.sourceType === "XMLTV_URL" ? "URL source" : "File source"} ·{" "}
                        {source.mappedChannelCount}/{source.sourceChannelCount} mapped
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        {source.sourceType === "XMLTV_URL"
                          ? source.url
                          : source.uploadedFileName
                            ? `Last file: ${source.uploadedFileName}`
                            : "No file uploaded yet"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Last import: {source.lastImportedAt ? formatTimestamp(source.lastImportedAt) : "Never"} ·{" "}
                        {source.lastImportProgramCount ?? 0} programme(s)
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => {
                          setSelectedSourceId(source.id);
                        }}
                        size="sm"
                        variant="secondary"
                      >
                        Select
                      </Button>
                      <Button onClick={() => editSource(source)} size="sm" variant="secondary">
                        Edit
                      </Button>
                      <Button
                        onClick={() => {
                          if (source.sourceType === "XMLTV_URL") {
                            importUrlMutation.mutate(source.id);
                            return;
                          }

                          setSelectedSourceId(source.id);
                          fileInputRef.current?.click();
                        }}
                        size="sm"
                        variant="secondary"
                      >
                        {source.sourceType === "XMLTV_URL" ? <RefreshCw className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                        {source.sourceType === "XMLTV_URL" ? "Refresh" : "Upload file"}
                      </Button>
                      <Button onClick={() => deleteSourceMutation.mutate(source.id)} size="sm" variant="danger">
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <div className="grid gap-6 2xl:grid-cols-[1.1fr_0.9fr]">
            <Panel density="compact">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Imported source channels</p>
                  <p className="mt-1.5 text-sm text-slate-400">
                    Link XMLTV channel ids to TV-Dash channels. Manual programmes still override imported rows when they overlap.
                  </p>
                </div>
                <span className="rounded-full border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                  {sourceChannelsQuery.data?.channels.length ?? 0} visible
                </span>
              </div>

              <div className="mt-3">
                <Input
                  onChange={(event) => setSourceChannelSearch(event.target.value)}
                  placeholder="Filter imported ids or display names"
                  uiSize="sm"
                  value={sourceChannelSearch}
                />
              </div>

              {!selectedSource ? (
                <p className="mt-4 text-sm text-slate-400">Select a source to review imported channel ids and mappings.</p>
              ) : sourceChannelsQuery.isLoading ? (
                <p className="mt-4 text-sm text-slate-400">Loading imported source channels...</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {(sourceChannelsQuery.data?.channels ?? []).map((sourceChannel) => (
                    <div key={sourceChannel.id} className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Link2 className="h-4 w-4 text-cyan-200" />
                            <p className="truncate font-mono text-sm text-white">{sourceChannel.externalId}</p>
                          </div>
                          <p className="mt-1 text-sm text-slate-400">{sourceChannel.displayName}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {sourceChannel.mapping
                              ? `Mapped to ${sourceChannel.mapping.channel.name}`
                              : "Not mapped yet"}
                          </p>
                        </div>
                        {sourceChannel.mapping ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                        ) : null}
                      </div>

                      <div className="mt-3 grid gap-2">
                        <Select
                          onChange={(event) =>
                            mappingMutation.mutate({
                              sourceChannel,
                              nextChannelId: event.target.value,
                            })
                          }
                          uiSize="sm"
                          value={sourceChannel.mapping?.channel.id ?? ""}
                        >
                          <option value="">Unmapped</option>
                          {channels.map((channel) => (
                            <option key={channel.id} value={channel.id}>
                              {channel.name}
                              {channel.epgSourceChannelId === sourceChannel.id ? " (current)" : ""}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <EpgSourceDiagnosticsPanel
              diagnostics={diagnosticsQuery.data}
              isLoading={diagnosticsQuery.isLoading}
              onRefresh={
                selectedSourceId
                  ? () => {
                      void invalidateEpgQueries(queryClient, selectedSourceId, token);
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </div>

      <ChannelManualProgramManager
        channels={channels}
        isLoading={manualProgramsQuery.isLoading}
        isSaving={saveProgramMutation.isPending || deleteProgramMutation.isPending}
        onCreate={async (payload) => {
          await saveProgramMutation.mutateAsync({ payload });
        }}
        onDelete={async (id) => {
          await deleteProgramMutation.mutateAsync(id);
        }}
        onSelectedChannelIdChange={setSelectedProgramChannelId}
        onUpdate={async (id, payload) => {
          await saveProgramMutation.mutateAsync({ id, payload });
        }}
        programs={manualProgramsQuery.data ?? []}
        selectedChannelId={selectedProgramChannelId}
      />
    </div>
  );
}

function buildEpgSourceInput(form: EpgSourceFormValue): EpgSourceInput {
  return {
    name: form.name,
    slug: form.slug,
    sourceType: form.sourceType,
    url: form.sourceType === "XMLTV_URL" ? form.url : null,
    isActive: form.isActive,
    refreshIntervalMinutes: form.sourceType === "XMLTV_URL" ? Number(form.refreshIntervalMinutes) : null,
    requestUserAgent: form.sourceType === "XMLTV_URL" ? form.requestUserAgent || null : null,
    requestReferrer: form.sourceType === "XMLTV_URL" ? form.requestReferrer || null : null,
    requestHeaders: form.sourceType === "XMLTV_URL" ? parseHeadersJson(form.requestHeadersText) : {},
  };
}

function buildSourceForm(source: EpgSource): EpgSourceFormValue {
  return {
    name: source.name,
    slug: source.slug,
    sourceType: source.sourceType,
    url: source.url ?? "",
    isActive: source.isActive,
    refreshIntervalMinutes: source.refreshIntervalMinutes ?? 360,
    requestUserAgent: source.requestUserAgent ?? "",
    requestReferrer: source.requestReferrer ?? "",
    requestHeadersText: formatHeadersJson(source.requestHeaders),
  };
}

async function invalidateEpgQueries(queryClient: ReturnType<typeof useQueryClient>, sourceId: string, token: string | null) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["epg-sources", token] }),
    queryClient.invalidateQueries({ queryKey: ["epg-source-channels", sourceId] }),
    queryClient.invalidateQueries({ queryKey: ["epg-diagnostics", sourceId, token] }),
  ]);
}

async function invalidateManualProgramQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  channelId: string,
  token: string | null,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["manual-programs", channelId, token] }),
    queryClient.invalidateQueries({ queryKey: ["channels", token] }),
    queryClient.invalidateQueries({
      predicate: (query) => {
        const rootKey = query.queryKey[0];

        return (
          rootKey === "dashboard-now-next" ||
          rootKey === "multiview-now-next" ||
          rootKey === "now-next" ||
          rootKey === "channel-guide-window"
        );
      },
    }),
  ]);
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "No data yet";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function StatusBadge({ source }: { source: EpgSource }) {
  const className =
    source.lastImportStatus === "SUCCEEDED"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
      : source.lastImportStatus === "FAILED"
        ? "border-rose-400/30 bg-rose-500/10 text-rose-100"
        : "border-slate-700/80 bg-slate-900/80 text-slate-200";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${className}`}>
      {source.lastImportStatus.toLowerCase().replaceAll("_", " ")}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</label>
      {children}
    </div>
  );
}
