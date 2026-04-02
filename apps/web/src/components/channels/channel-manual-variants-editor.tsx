import { ArrowDown, ArrowUp, Copy, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ChannelFormValidation } from "./channel-admin-form-state";
import { getValidationMessages } from "./channel-admin-form-state";
import {
  MANUAL_VARIANT_LABEL_SUGGESTIONS,
  addPresetManualVariants,
  applyManualVariantAssists,
  autoSortManualVariants,
  createPresetManualVariant,
  duplicateManualVariant,
  getNextManualVariantSortOrder,
  normalizeManualVariantLabel,
  resolveManualVariantProfile,
  type ManualVariantDraft,
} from "./channel-manual-variants";

interface ChannelManualVariantsEditorProps {
  validation: ChannelFormValidation;
  variants: ManualVariantDraft[];
  onChange: (variants: ManualVariantDraft[]) => void;
}

const LABEL_SUGGESTIONS_ID = "manual-variant-label-suggestions";

export function ChannelManualVariantsEditor({
  validation,
  variants,
  onChange,
}: ChannelManualVariantsEditorProps) {
  const activeVariantCount = variants.filter((variant) => variant.isActive).length;
  const manualIssues = validation.issues.filter((issue) => issue.path === "manualVariants" || issue.path.startsWith("manualVariants."));
  const orderedLabels = [...variants]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((variant, index) => normalizeManualVariantLabel(variant.label) || `row ${index + 1}`);

  function updateVariant(index: number, patch: Partial<ManualVariantDraft>) {
    onChange(variants.map((variant, variantIndex) => (variantIndex === index ? { ...variant, ...patch } : variant)));
  }

  function replaceVariant(index: number, variant: ManualVariantDraft) {
    onChange(variants.map((entry, entryIndex) => (entryIndex === index ? variant : entry)));
  }

  function addVariant() {
    onChange([...variants, createPresetManualVariant("", getNextManualVariantSortOrder(variants))]);
  }

  function addPreset(label: string) {
    onChange([...variants, createPresetManualVariant(label, getNextManualVariantSortOrder(variants))]);
  }

  function addLowMediumHighSet() {
    onChange(addPresetManualVariants(variants, ["low", "medium", "high"]));
  }

  function removeVariant(index: number) {
    const remainingVariants = variants.filter((_, variantIndex) => variantIndex !== index);
    onChange(remainingVariants.length ? remainingVariants : [createPresetManualVariant("", 0)]);
  }

  function moveVariant(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const targetVariant = variants[targetIndex];
    const currentVariant = variants[index];

    if (!targetVariant || !currentVariant) {
      return;
    }

    const nextVariants = [...variants];
    nextVariants[index] = { ...targetVariant, sortOrder: currentVariant.sortOrder };
    nextVariants[targetIndex] = { ...currentVariant, sortOrder: targetVariant.sortOrder };

    onChange(nextVariants);
  }

  function duplicateVariantRow(index: number) {
    onChange([...variants, duplicateManualVariant(variants[index], variants)]);
  }

  function applyVariantAssists(index: number) {
    replaceVariant(index, applyManualVariantAssists(variants[index]));
  }

  function autoSortVariants() {
    onChange(autoSortManualVariants(variants));
  }

  const existingLabels = new Set(
    variants
      .map((variant) => normalizeManualVariantLabel(variant.label).toLowerCase())
      .filter(Boolean),
  );

  return (
    <div className="space-y-3 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <SummaryPill tone="cyan">Manual variants</SummaryPill>
            <SummaryPill>{variants.length} configured</SummaryPill>
            <SummaryPill>{activeVariantCount} active</SummaryPill>
            <SummaryPill tone={manualIssues.length === 0 ? "emerald" : "amber"}>
              {manualIssues.length === 0 ? "Ready" : `${manualIssues.length} issue${manualIssues.length === 1 ? "" : "s"}`}
            </SummaryPill>
          </div>
          <p className="text-xs text-slate-400">
            Synthetic master order: <span className="text-slate-200">{orderedLabels.join(" -> ")}</span>
          </p>
          <p className="text-xs text-slate-500">
            Known labels normalize on blur, blank labels can be inferred from URL or resolution fields, and preset rows start
            with safe default metadata.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={addVariant} size="sm" type="button" variant="secondary">
            <Plus className="h-3.5 w-3.5" />
            Add row
          </Button>
          <Button
            disabled={existingLabels.has("1080p")}
            onClick={() => addPreset("1080p")}
            size="sm"
            type="button"
            variant="secondary"
          >
            Add 1080p
          </Button>
          <Button
            disabled={existingLabels.has("720p")}
            onClick={() => addPreset("720p")}
            size="sm"
            type="button"
            variant="secondary"
          >
            Add 720p
          </Button>
          <Button
            disabled={existingLabels.has("480p")}
            onClick={() => addPreset("480p")}
            size="sm"
            type="button"
            variant="secondary"
          >
            Add 480p
          </Button>
          <Button
            disabled={["low", "medium", "high"].every((label) => existingLabels.has(label))}
            onClick={addLowMediumHighSet}
            size="sm"
            type="button"
            variant="secondary"
          >
            Add Low/Medium/High
          </Button>
          <Button onClick={autoSortVariants} size="sm" type="button" variant="ghost">
            <Sparkles className="h-3.5 w-3.5" />
            Auto-sort
          </Button>
        </div>
      </div>

      {getValidationMessages(validation, "manualVariants").length > 0 ? (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {getValidationMessages(validation, "manualVariants").join(" ")}
        </div>
      ) : null}

      <datalist id={LABEL_SUGGESTIONS_ID}>
        {MANUAL_VARIANT_LABEL_SUGGESTIONS.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>

      <div className="hidden grid-cols-[minmax(0,140px)_minmax(0,1fr)_88px_108px_auto] gap-2 px-1 text-[11px] uppercase tracking-[0.18em] text-slate-500 lg:grid">
        <span>Label</span>
        <span>Playlist URL</span>
        <span>Order</span>
        <span>Status</span>
        <span>Actions</span>
      </div>

      <div className="space-y-2">
        {variants.map((variant, index) => {
          const resolution = resolveManualVariantProfile(variant);
          const labelErrors = getValidationMessages(validation, `manualVariants.${index}.label`);
          const urlErrors = getValidationMessages(validation, `manualVariants.${index}.playlistUrl`);
          const sortOrderErrors = getValidationMessages(validation, `manualVariants.${index}.sortOrder`);
          const rowIssues = [...new Set([...labelErrors, ...urlErrors, ...sortOrderErrors])];
          const isReady = rowIssues.length === 0 && Boolean(variant.label.trim()) && Boolean(variant.playlistUrl.trim());
          const statusLabel = !variant.isActive
            ? "Inactive"
            : rowIssues[0]
              ? rowIssues[0]
              : isReady
                ? "Ready"
                : "Incomplete";
          const statusTone = rowIssues[0] ? "rose" : isReady ? "emerald" : "slate";
          const helperLabel = resolution.detectedLabel || "custom";
          const helperProfile = resolution.profile
            ? `${resolution.profile.width}x${resolution.profile.height} · ${resolution.profile.bandwidth} bps`
            : "Custom label";

          return (
            <div
              key={`${variant.sortOrder}-${index}`}
              className="rounded-xl border border-slate-800/80 bg-slate-950/80 px-3 py-3"
            >
              <div className="mb-2 flex items-center justify-between gap-3 lg:hidden">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Row {index + 1}</span>
                  <SummaryPill tone={statusTone}>{statusLabel}</SummaryPill>
                </div>
                <span className="text-xs text-slate-500">sort {variant.sortOrder}</span>
              </div>

              <div className="grid gap-2 lg:grid-cols-[minmax(0,140px)_minmax(0,1fr)_88px_108px_auto]">
                <CompactField label="Label">
                  <Input
                    list={LABEL_SUGGESTIONS_ID}
                    onBlur={() => applyVariantAssists(index)}
                    onChange={(event) => updateVariant(index, { label: event.target.value })}
                    placeholder="1080p"
                    uiSize="sm"
                    value={variant.label}
                  />
                </CompactField>
                <CompactField label="Playlist URL">
                  <Input
                    onBlur={() => applyVariantAssists(index)}
                    onChange={(event) => updateVariant(index, { playlistUrl: event.target.value })}
                    placeholder="https://provider.example.com/live/720/index.m3u8"
                    uiSize="sm"
                    value={variant.playlistUrl}
                  />
                </CompactField>
                <CompactField label="Order">
                  <Input
                    onChange={(event) => updateVariant(index, { sortOrder: Number(event.target.value) })}
                    type="number"
                    uiSize="sm"
                    value={variant.sortOrder}
                  />
                </CompactField>
                <CompactField label="Status">
                  <Select
                    onChange={(event) => updateVariant(index, { isActive: event.target.value === "true" })}
                    uiSize="sm"
                    value={String(variant.isActive)}
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </Select>
                </CompactField>
                <div className="flex items-end gap-1.5 lg:justify-end">
                  <Button
                    aria-label={`Move variant ${index + 1} up`}
                    disabled={index === 0}
                    onClick={() => moveVariant(index, "up")}
                    size="icon-sm"
                    type="button"
                    variant="secondary"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    aria-label={`Move variant ${index + 1} down`}
                    disabled={index === variants.length - 1}
                    onClick={() => moveVariant(index, "down")}
                    size="icon-sm"
                    type="button"
                    variant="secondary"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    aria-label={`Duplicate variant ${index + 1}`}
                    onClick={() => duplicateVariantRow(index)}
                    size="icon-sm"
                    type="button"
                    variant="secondary"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    aria-label={`Remove variant ${index + 1}`}
                    onClick={() => removeVariant(index)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="mt-2 grid gap-2 md:grid-cols-4">
                <CompactField label="Width">
                  <Input
                    onBlur={() => applyVariantAssists(index)}
                    onChange={(event) => updateVariant(index, { width: event.target.value })}
                    placeholder={resolution.profile?.width ?? "1920"}
                    type="number"
                    uiSize="sm"
                    value={variant.width}
                  />
                </CompactField>
                <CompactField label="Height">
                  <Input
                    onBlur={() => applyVariantAssists(index)}
                    onChange={(event) => updateVariant(index, { height: event.target.value })}
                    placeholder={resolution.profile?.height ?? "1080"}
                    type="number"
                    uiSize="sm"
                    value={variant.height}
                  />
                </CompactField>
                <CompactField label="Bandwidth">
                  <Input
                    onChange={(event) => updateVariant(index, { bandwidth: event.target.value })}
                    placeholder={resolution.profile?.bandwidth ?? "2800000"}
                    type="number"
                    uiSize="sm"
                    value={variant.bandwidth}
                  />
                </CompactField>
                <CompactField label="Codecs">
                  <Input
                    onChange={(event) => updateVariant(index, { codecs: event.target.value })}
                    placeholder="avc1.640028,mp4a.40.2"
                    uiSize="sm"
                    value={variant.codecs}
                  />
                </CompactField>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <SummaryPill tone={statusTone}>{statusLabel}</SummaryPill>
                <span className="rounded-full border border-slate-800 bg-slate-900/70 px-2 py-1 text-slate-300">
                  {helperLabel}
                </span>
                <span className="text-slate-500">
                  {resolution.inferredFrom === "url"
                    ? "Detected from URL"
                    : resolution.inferredFrom === "metadata"
                      ? "Detected from resolution"
                      : "Profile"}
                  : {helperProfile}
                </span>
              </div>

              {rowIssues.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {rowIssues.map((issue, issueIndex) => (
                    <span
                      key={`${variant.sortOrder}-${issue}-${issueIndex}`}
                      className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-rose-100"
                    >
                      {issue}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompactField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 lg:hidden">{label}</span>
      {children}
    </label>
  );
}

function SummaryPill({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "amber" | "cyan" | "emerald" | "rose" | "slate";
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]",
        tone === "cyan" && "border-cyan-400/20 bg-cyan-500/10 text-cyan-100",
        tone === "emerald" && "border-emerald-400/20 bg-emerald-500/10 text-emerald-100",
        tone === "amber" && "border-amber-400/20 bg-amber-500/10 text-amber-100",
        tone === "rose" && "border-rose-400/20 bg-rose-500/10 text-rose-100",
        tone === "slate" && "border-slate-800 bg-slate-900/80 text-slate-300",
      )}
    >
      {children}
    </span>
  );
}
