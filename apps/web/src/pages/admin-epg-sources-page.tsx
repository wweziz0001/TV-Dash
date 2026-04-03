import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, RefreshCw } from "lucide-react";
import { toast } from "react-hot-toast";
import type { EpgSourceInput } from "@tv-dash/shared";
import { formatHeadersJson, parseHeadersJson } from "@/components/channels/channel-admin-form";
import { EpgSourceDiagnosticsPanel } from "@/components/epg/epg-source-diagnostics-panel";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { TextArea } from "@/components/ui/text-area";
import { useAuth } from "@/features/auth/auth-context";
import { api } from "@/services/api";
import type { EpgSource } from "@/types/api";

interface EpgSourceFormValue {
  name: string;
  slug: string;
  sourceType: "XMLTV";
  url: string;
  isActive: boolean;
  refreshIntervalMinutes: number;
  requestUserAgent: string;
  requestReferrer: string;
  requestHeadersText: string;
}

const emptyForm: EpgSourceFormValue = {
  name: "",
  slug: "",
  sourceType: "XMLTV",
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
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [previewSourceId, setPreviewSourceId] = useState<string | null>(null);
  const [form, setForm] = useState<EpgSourceFormValue>(emptyForm);

  const sourcesQuery = useQuery({
    queryKey: ["epg-sources", token],
    queryFn: async () => (await api.listEpgSources(token!)).sources,
    enabled: Boolean(token),
  });

  const previewQuery = useQuery({
    queryKey: ["epg-source-preview", previewSourceId, token],
    queryFn: async () => {
      if (!previewSourceId || !token) {
        throw new Error("Missing source context");
      }

      return api.previewEpgSourceChannels(previewSourceId, token);
    },
    enabled: Boolean(previewSourceId && token),
  });

  const diagnosticsQuery = useQuery({
    queryKey: ["epg-diagnostics", previewSourceId, token],
    queryFn: async () => {
      if (!previewSourceId || !token) {
        throw new Error("Missing source context");
      }

      return (await api.getEpgSourceDiagnostics(previewSourceId, token)).diagnostics;
    },
    enabled: Boolean(previewSourceId && token),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!token) {
        throw new Error("Missing session");
      }

      const payload = buildEpgSourceInput(form);

      if (editingSourceId) {
        return api.updateEpgSource(editingSourceId, payload, token);
      }

      return api.createEpgSource(payload, token);
    },
    onSuccess: async (response) => {
      const sourceId = response.source.id;
      toast.success(editingSourceId ? "EPG source updated" : "EPG source created");
      setEditingSourceId(sourceId);
      setPreviewSourceId(sourceId);
      setForm(buildFormFromSource(response.source));
      await queryClient.invalidateQueries({ queryKey: ["epg-sources", token] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to save EPG source");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!token) {
        throw new Error("Missing session");
      }

      await api.deleteEpgSource(id, token);
    },
    onSuccess: async (_, deletedId) => {
      toast.success("EPG source deleted");

      if (editingSourceId === deletedId) {
        resetForm();
      }

      if (previewSourceId === deletedId) {
        setPreviewSourceId(null);
      }

      await queryClient.invalidateQueries({ queryKey: ["epg-sources", token] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to delete EPG source");
    },
  });

  const activeSources = useMemo(
    () => (sourcesQuery.data ?? []).filter((source) => source.isActive).length,
    [sourcesQuery.data],
  );

  function resetForm() {
    setEditingSourceId(null);
    setForm(emptyForm);
  }

  function editSource(source: EpgSource) {
    setEditingSourceId(source.id);
    setPreviewSourceId(source.id);
    setForm(buildFormFromSource(source));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="EPG source management"
        description="Store XMLTV providers, upstream request requirements, and preview channel identifiers before wiring full guide ingestion."
      />

      <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <Panel className="space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
              {editingSourceId ? "Edit EPG Source" : "Create EPG Source"}
            </p>
            <p className="mt-2 text-sm text-slate-400">
              This phase stores provider configuration and validates XMLTV access. Full background ingestion stays as the
              next milestone.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name">
              <Input onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} value={form.name} />
            </Field>
            <Field label="Slug">
              <Input onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))} value={form.slug} />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Source type">
              <Select
                onChange={(event) => setForm((current) => ({ ...current, sourceType: event.target.value as "XMLTV" }))}
                value={form.sourceType}
              >
                <option value="XMLTV">XMLTV</option>
              </Select>
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

          <Field label="XMLTV URL">
            <Input onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} value={form.url} />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Refresh Interval (minutes)">
              <Input
                onChange={(event) =>
                  setForm((current) => ({ ...current, refreshIntervalMinutes: Number(event.target.value) }))
                }
                type="number"
                value={form.refreshIntervalMinutes}
              />
            </Field>
            <Field label="Upstream User-Agent">
              <Input
                onChange={(event) => setForm((current) => ({ ...current, requestUserAgent: event.target.value }))}
                value={form.requestUserAgent}
              />
            </Field>
          </div>

          <Field label="Upstream Referrer">
            <Input
              onChange={(event) => setForm((current) => ({ ...current, requestReferrer: event.target.value }))}
              value={form.requestReferrer}
            />
          </Field>

          <Field label="Upstream Headers JSON">
            <TextArea
              onChange={(event) => setForm((current) => ({ ...current, requestHeadersText: event.target.value }))}
              placeholder='{"x-guide-token":"value"}'
              rows={5}
              value={form.requestHeadersText}
            />
          </Field>

          <div className="flex gap-3">
            <Button className="flex-1" onClick={() => saveMutation.mutate()}>
              {editingSourceId ? "Update source" : "Create source"}
            </Button>
            {editingSourceId ? (
              <Button className="flex-1" onClick={resetForm} variant="secondary">
                Cancel
              </Button>
            ) : null}
          </div>
        </Panel>

        <div className="space-y-6">
          <EpgSourceDiagnosticsPanel
            diagnostics={diagnosticsQuery.data}
            isLoading={diagnosticsQuery.isLoading}
            onRefresh={
              previewSourceId
                ? () => {
                    void Promise.all([
                      queryClient.invalidateQueries({ queryKey: ["epg-diagnostics", previewSourceId, token] }),
                      queryClient.invalidateQueries({ queryKey: ["epg-source-preview", previewSourceId, token] }),
                    ]);
                  }
                : undefined
            }
          />

          <Panel>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Configured Sources</p>
                <h2 className="mt-2 text-xl font-semibold text-white">{sourcesQuery.data?.length ?? 0} source(s)</h2>
              </div>
              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 px-4 py-3 text-sm text-slate-300">
                {activeSources} active
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {(sourcesQuery.data ?? []).map((source) => (
                <div
                  key={source.id}
                  className="flex flex-col gap-4 rounded-3xl border border-slate-800/70 bg-slate-950/60 p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div>
                    <p className="font-semibold text-white">{source.name}</p>
                    <p className="mt-1 text-sm text-slate-400">
                      {source.slug} · refresh every {source.refreshIntervalMinutes} min · {source._count?.channels ?? 0} linked
                      channel(s)
                    </p>
                    <p className="mt-2 text-xs text-slate-500">{source.url}</p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button onClick={() => setPreviewSourceId(source.id)} variant="secondary">
                      <Eye className="h-4 w-4" />
                      Preview
                    </Button>
                    <Button onClick={() => editSource(source)} variant="secondary">
                      Edit
                    </Button>
                    <Button onClick={() => deleteMutation.mutate(source.id)} variant="danger">
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-500">XMLTV Preview</p>
                <p className="mt-2 text-sm text-slate-400">
                  Preview lets operators verify upstream access and candidate `tvg-id` values before mapping channels.
                </p>
              </div>
              {previewSourceId ? (
                <Button
                  onClick={() => {
                    void Promise.all([
                      queryClient.invalidateQueries({ queryKey: ["epg-source-preview", previewSourceId, token] }),
                      queryClient.invalidateQueries({ queryKey: ["epg-diagnostics", previewSourceId, token] }),
                    ]);
                  }}
                  variant="secondary"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              ) : null}
            </div>

            {!previewSourceId ? (
              <p className="mt-4 text-sm text-slate-400">Select an EPG source to preview XMLTV channel identifiers.</p>
            ) : previewQuery.isLoading ? (
              <p className="mt-4 text-sm text-slate-400">Loading XMLTV preview...</p>
            ) : previewQuery.error ? (
              <p className="mt-4 text-sm text-rose-300">
                {previewQuery.error instanceof Error ? previewQuery.error.message : "Unable to preview XMLTV source"}
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                <div className="rounded-2xl border border-slate-800/80 bg-slate-950/80 px-4 py-3 text-sm text-slate-300">
                  {(previewQuery.data?.channels.length ?? 0).toLocaleString()} channel ids discovered from{" "}
                  {previewQuery.data?.source.name}
                </div>
                {(previewQuery.data?.channels ?? []).slice(0, 20).map((channel) => (
                  <div key={channel.id} className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4">
                    <p className="font-mono text-sm text-white">{channel.id}</p>
                    <p className="mt-2 text-sm text-slate-400">{channel.displayNames.join(" / ") || "No display name"}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function buildEpgSourceInput(form: EpgSourceFormValue): EpgSourceInput {
  return {
    name: form.name,
    slug: form.slug,
    sourceType: form.sourceType,
    url: form.url,
    isActive: form.isActive,
    refreshIntervalMinutes: Number(form.refreshIntervalMinutes),
    requestUserAgent: form.requestUserAgent || null,
    requestReferrer: form.requestReferrer || null,
    requestHeaders: parseHeadersJson(form.requestHeadersText),
  };
}

function buildFormFromSource(source: EpgSource): EpgSourceFormValue {
  return {
    name: source.name,
    slug: source.slug,
    sourceType: source.sourceType,
    url: source.url,
    isActive: source.isActive,
    refreshIntervalMinutes: source.refreshIntervalMinutes,
    requestUserAgent: source.requestUserAgent ?? "",
    requestReferrer: source.requestReferrer ?? "",
    requestHeadersText: formatHeadersJson(source.requestHeaders),
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-sm text-slate-400">{label}</label>
      {children}
    </div>
  );
}
