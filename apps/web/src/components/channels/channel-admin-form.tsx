import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { ChannelInput } from "@tv-dash/shared";
import type { ChannelConfig, ChannelGroup, EpgSource } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TextArea } from "@/components/ui/text-area";

export interface ChannelManualVariantFormValue {
  label: string;
  sortOrder: number;
  playlistUrl: string;
  width: string;
  height: string;
  bandwidth: string;
  codecs: string;
  isActive: boolean;
}

export interface ChannelAdminFormValue {
  name: string;
  slug: string;
  logoUrl: string;
  groupId: string;
  sourceMode: ChannelInput["sourceMode"];
  masterHlsUrl: string;
  manualVariants: ChannelManualVariantFormValue[];
  isActive: boolean;
  sortOrder: number;
  playbackMode: ChannelInput["playbackMode"];
  upstreamUserAgent: string;
  upstreamReferrer: string;
  upstreamHeadersText: string;
  epgSourceId: string;
  epgChannelId: string;
}

export function createEmptyManualVariantFormValue(sortOrder = 0): ChannelManualVariantFormValue {
  return {
    label: "",
    sortOrder,
    playlistUrl: "",
    width: "",
    height: "",
    bandwidth: "",
    codecs: "",
    isActive: true,
  };
}

export const emptyChannelForm: ChannelAdminFormValue = {
  name: "",
  slug: "",
  logoUrl: "",
  groupId: "",
  sourceMode: "MASTER_PLAYLIST",
  masterHlsUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  manualVariants: [createEmptyManualVariantFormValue()],
  isActive: true,
  sortOrder: 0,
  playbackMode: "DIRECT",
  upstreamUserAgent: "",
  upstreamReferrer: "",
  upstreamHeadersText: "",
  epgSourceId: "",
  epgChannelId: "",
};

export function formatHeadersJson(headers: Record<string, string>) {
  return Object.keys(headers).length ? JSON.stringify(headers, null, 2) : "";
}

export function parseHeadersJson(value: string) {
  if (!value.trim()) {
    return {};
  }

  const parsed = JSON.parse(value) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Upstream headers must be a JSON object");
  }

  return Object.fromEntries(
    Object.entries(parsed).flatMap(([key, headerValue]) =>
      typeof headerValue === "string" && key.trim()
        ? [[key.trim(), headerValue]]
        : [],
    ),
  );
}

function parseOptionalNumber(value: string) {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  const parsed = Number.parseInt(normalizedValue, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatOptionalNumber(value: number | null) {
  return typeof value === "number" ? String(value) : "";
}

export function buildChannelInput(form: ChannelAdminFormValue): ChannelInput {
  const baseInput = {
    name: form.name,
    slug: form.slug,
    logoUrl: form.logoUrl,
    groupId: form.groupId || null,
    isActive: form.isActive,
    sortOrder: Number(form.sortOrder),
    playbackMode: form.playbackMode,
    upstreamUserAgent: form.upstreamUserAgent,
    upstreamReferrer: form.upstreamReferrer,
    upstreamHeaders: parseHeadersJson(form.upstreamHeadersText),
    epgSourceId: form.epgSourceId || null,
    epgChannelId: form.epgChannelId || null,
  };

  if (form.sourceMode === "MASTER_PLAYLIST") {
    return {
      ...baseInput,
      sourceMode: "MASTER_PLAYLIST",
      masterHlsUrl: form.masterHlsUrl,
    };
  }

  return {
    ...baseInput,
    sourceMode: "MANUAL_VARIANTS",
    masterHlsUrl: null,
    manualVariants: form.manualVariants.map((variant) => ({
      label: variant.label,
      sortOrder: Number(variant.sortOrder),
      playlistUrl: variant.playlistUrl,
      width: parseOptionalNumber(variant.width),
      height: parseOptionalNumber(variant.height),
      bandwidth: parseOptionalNumber(variant.bandwidth),
      codecs: variant.codecs || null,
      isActive: variant.isActive,
    })),
  };
}

export function buildChannelFormFromConfig(channel: ChannelConfig): ChannelAdminFormValue {
  return {
    name: channel.name,
    slug: channel.slug,
    logoUrl: channel.logoUrl ?? "",
    groupId: channel.groupId ?? "",
    sourceMode: channel.sourceMode,
    masterHlsUrl: channel.masterHlsUrl ?? "",
    manualVariants:
      channel.qualityVariants.length > 0
        ? channel.qualityVariants.map((variant) => ({
            label: variant.label,
            sortOrder: variant.sortOrder,
            playlistUrl: variant.playlistUrl,
            width: formatOptionalNumber(variant.width),
            height: formatOptionalNumber(variant.height),
            bandwidth: formatOptionalNumber(variant.bandwidth),
            codecs: variant.codecs ?? "",
            isActive: variant.isActive,
          }))
        : [createEmptyManualVariantFormValue()],
    isActive: channel.isActive,
    sortOrder: channel.sortOrder,
    playbackMode: channel.playbackMode,
    upstreamUserAgent: channel.upstreamUserAgent ?? "",
    upstreamReferrer: channel.upstreamReferrer ?? "",
    upstreamHeadersText: formatHeadersJson(channel.upstreamHeaders),
    epgSourceId: channel.epgSourceId ?? "",
    epgChannelId: channel.epgChannelId ?? "",
  };
}

export function ChannelAdminFormFields({
  form,
  groups,
  epgSources,
  onChange,
}: {
  form: ChannelAdminFormValue;
  groups: ChannelGroup[];
  epgSources: EpgSource[];
  onChange: (patch: Partial<ChannelAdminFormValue>) => void;
}) {
  function updateVariant(index: number, patch: Partial<ChannelManualVariantFormValue>) {
    onChange({
      manualVariants: form.manualVariants.map((variant, variantIndex) =>
        variantIndex === index ? { ...variant, ...patch } : variant,
      ),
    });
  }

  function addVariant() {
    const nextSortOrder =
      form.manualVariants.reduce((highestValue, variant) => Math.max(highestValue, variant.sortOrder), -1) + 1;

    onChange({
      manualVariants: [...form.manualVariants, createEmptyManualVariantFormValue(nextSortOrder)],
    });
  }

  function removeVariant(index: number) {
    const remainingVariants = form.manualVariants.filter((_, variantIndex) => variantIndex !== index);

    onChange({
      manualVariants: remainingVariants.length ? remainingVariants : [createEmptyManualVariantFormValue()],
    });
  }

  function moveVariant(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const targetVariant = form.manualVariants[targetIndex];
    const currentVariant = form.manualVariants[index];

    if (!targetVariant || !currentVariant) {
      return;
    }

    const nextVariants = [...form.manualVariants];
    nextVariants[index] = { ...targetVariant, sortOrder: currentVariant.sortOrder };
    nextVariants[targetIndex] = { ...currentVariant, sortOrder: targetVariant.sortOrder };

    onChange({ manualVariants: nextVariants });
  }

  function setSourceMode(sourceMode: ChannelInput["sourceMode"]) {
    onChange({
      sourceMode,
      ...(sourceMode === "MANUAL_VARIANTS" && form.manualVariants.length === 0
        ? { manualVariants: [createEmptyManualVariantFormValue()] }
        : {}),
    });
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name">
          <Input onChange={(event) => onChange({ name: event.target.value })} value={form.name} />
        </Field>
        <Field label="Slug">
          <Input onChange={(event) => onChange({ slug: event.target.value })} value={form.slug} />
        </Field>
        <Field label="Logo URL">
          <Input onChange={(event) => onChange({ logoUrl: event.target.value })} value={form.logoUrl} />
        </Field>
        <Field label="Group">
          <Select onChange={(event) => onChange({ groupId: event.target.value })} value={form.groupId}>
            <option value="">Ungrouped</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Channel source">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setSourceMode("MASTER_PLAYLIST")}
            type="button"
            variant={form.sourceMode === "MASTER_PLAYLIST" ? "primary" : "secondary"}
          >
            Master playlist URL
          </Button>
          <Button
            onClick={() => setSourceMode("MANUAL_VARIANTS")}
            type="button"
            variant={form.sourceMode === "MANUAL_VARIANTS" ? "primary" : "secondary"}
          >
            Manual quality variants
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Choose a real HLS master playlist, or let TV-Dash synthesize one from manually entered quality playlists.
        </p>
      </Field>

      {form.sourceMode === "MASTER_PLAYLIST" ? (
        <Field label="Master HLS URL">
          <Input onChange={(event) => onChange({ masterHlsUrl: event.target.value })} value={form.masterHlsUrl} />
        </Field>
      ) : (
        <div className="space-y-3 rounded-3xl border border-slate-800/80 bg-slate-950/50 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-white">Manual quality variants</p>
              <p className="mt-1 text-xs text-slate-500">
                Add the individual variant playlists TV-Dash should expose as one synthesized master source.
              </p>
            </div>
            <Button onClick={addVariant} size="sm" type="button" variant="secondary">
              <Plus className="h-4 w-4" />
              Add variant
            </Button>
          </div>

          <div className="space-y-3">
            {form.manualVariants.map((variant, index) => (
              <div key={`${variant.sortOrder}-${index}`} className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">Variant {index + 1}</p>
                  <div className="flex gap-2">
                    <Button
                      aria-label={`Move variant ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => moveVariant(index, "up")}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      aria-label={`Move variant ${index + 1} down`}
                      disabled={index === form.manualVariants.length - 1}
                      onClick={() => moveVariant(index, "down")}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      aria-label={`Remove variant ${index + 1}`}
                      onClick={() => removeVariant(index)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Field label="Label">
                    <Input onChange={(event) => updateVariant(index, { label: event.target.value })} value={variant.label} />
                  </Field>
                  <Field label="Playlist URL">
                    <Input
                      onChange={(event) => updateVariant(index, { playlistUrl: event.target.value })}
                      value={variant.playlistUrl}
                    />
                  </Field>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-4">
                  <Field label="Sort order">
                    <Input
                      onChange={(event) => updateVariant(index, { sortOrder: Number(event.target.value) })}
                      type="number"
                      value={variant.sortOrder}
                    />
                  </Field>
                  <Field label="Status">
                    <Select
                      onChange={(event) => updateVariant(index, { isActive: event.target.value === "true" })}
                      value={String(variant.isActive)}
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </Select>
                  </Field>
                  <Field label="Width">
                    <Input onChange={(event) => updateVariant(index, { width: event.target.value })} type="number" value={variant.width} />
                  </Field>
                  <Field label="Height">
                    <Input onChange={(event) => updateVariant(index, { height: event.target.value })} type="number" value={variant.height} />
                  </Field>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Field label="Bandwidth">
                    <Input
                      onChange={(event) => updateVariant(index, { bandwidth: event.target.value })}
                      placeholder="2800000"
                      type="number"
                      value={variant.bandwidth}
                    />
                  </Field>
                  <Field label="Codecs">
                    <Input onChange={(event) => updateVariant(index, { codecs: event.target.value })} value={variant.codecs} />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Playback mode">
          <Select
            onChange={(event) => onChange({ playbackMode: event.target.value as ChannelInput["playbackMode"] })}
            value={form.playbackMode}
          >
            <option value="DIRECT">Direct client playback</option>
            <option value="PROXY">Proxy through TV-Dash</option>
          </Select>
        </Field>
        <Field label="Status">
          <Select onChange={(event) => onChange({ isActive: event.target.value === "true" })} value={String(form.isActive)}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Upstream User-Agent">
          <Input onChange={(event) => onChange({ upstreamUserAgent: event.target.value })} value={form.upstreamUserAgent} />
        </Field>
        <Field label="Upstream Referrer">
          <Input onChange={(event) => onChange({ upstreamReferrer: event.target.value })} value={form.upstreamReferrer} />
        </Field>
      </div>

      <Field label="Upstream Headers JSON">
        <TextArea
          onChange={(event) => onChange({ upstreamHeadersText: event.target.value })}
          placeholder='{"x-token":"value"}'
          rows={5}
          value={form.upstreamHeadersText}
        />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="EPG Source">
          <Select onChange={(event) => onChange({ epgSourceId: event.target.value })} value={form.epgSourceId}>
            <option value="">No guide source</option>
            {epgSources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name} {source.isActive ? "" : "(inactive)"}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="EPG Channel ID / tvg-id">
          <Input onChange={(event) => onChange({ epgChannelId: event.target.value })} value={form.epgChannelId} />
        </Field>
      </div>

      <Field label="Sort order">
        <Input
          onChange={(event) => onChange({ sortOrder: Number(event.target.value) })}
          type="number"
          value={form.sortOrder}
        />
      </Field>
    </>
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
