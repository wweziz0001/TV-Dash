import type { ChannelInput } from "@tv-dash/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TextArea } from "@/components/ui/text-area";
import { ChannelManualVariantsEditor } from "./channel-manual-variants-editor";
import {
  createEmptyManualVariantFormValue,
  getValidationMessages,
  type ChannelAdminFormFieldsProps,
  validateChannelForm,
} from "./channel-admin-form-state";

export {
  buildChannelFormFromConfig,
  buildChannelInput,
  createEmptyManualVariantFormValue,
  emptyChannelForm,
  formatHeadersJson,
  parseHeadersJson,
  validateChannelForm,
} from "./channel-admin-form-state";

export function ChannelAdminFormFields({ form, groups, onChange }: ChannelAdminFormFieldsProps) {
  const validation = validateChannelForm(form);
  const sourceIssues =
    form.sourceMode === "MASTER_PLAYLIST"
      ? getValidationMessages(validation, "masterHlsUrl")
      : validation.issues.filter((issue) => issue.path === "manualVariants" || issue.path.startsWith("manualVariants."));
  const usesDirectManualHeaders =
    form.sourceMode === "MANUAL_VARIANTS" &&
    form.playbackMode === "DIRECT" &&
    Boolean(form.upstreamUserAgent.trim() || form.upstreamReferrer.trim() || form.upstreamHeadersText.trim());

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
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name">
          <Input onChange={(event) => onChange({ name: event.target.value })} uiSize="sm" value={form.name} />
        </Field>
        <Field label="Slug">
          <Input onChange={(event) => onChange({ slug: event.target.value })} uiSize="sm" value={form.slug} />
        </Field>
        <Field label="Logo URL">
          <Input onChange={(event) => onChange({ logoUrl: event.target.value })} uiSize="sm" value={form.logoUrl} />
        </Field>
        <Field label="Group">
          <Select onChange={(event) => onChange({ groupId: event.target.value })} uiSize="sm" value={form.groupId}>
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
        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => setSourceMode("MASTER_PLAYLIST")}
              size="sm"
              type="button"
              variant={form.sourceMode === "MASTER_PLAYLIST" ? "primary" : "secondary"}
            >
              Master playlist URL
            </Button>
            <Button
              onClick={() => setSourceMode("MANUAL_VARIANTS")}
              size="sm"
              type="button"
              variant={form.sourceMode === "MANUAL_VARIANTS" ? "primary" : "secondary"}
            >
              Manual quality variants
            </Button>
            <span className="rounded-full border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
              {form.sourceMode === "MASTER_PLAYLIST" ? "1 master source" : `${form.manualVariants.length} manual row(s)`}
            </span>
            <span className="rounded-full border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
              {sourceIssues.length === 0 ? "Looks complete" : `${sourceIssues.length} source issue(s)`}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Choose a real HLS master playlist, or let TV-Dash synthesize one from manually entered quality playlists.
          </p>
        </div>
      </Field>

      {form.sourceMode === "MASTER_PLAYLIST" ? (
        <Field label="Master HLS URL">
          <Input onChange={(event) => onChange({ masterHlsUrl: event.target.value })} uiSize="sm" value={form.masterHlsUrl} />
          {getValidationMessages(validation, "masterHlsUrl").length > 0 ? (
            <FieldMessage tone="rose">{getValidationMessages(validation, "masterHlsUrl")[0]}</FieldMessage>
          ) : null}
        </Field>
      ) : (
        <ChannelManualVariantsEditor
          onChange={(manualVariants) => onChange({ manualVariants })}
          validation={validation}
          variants={form.manualVariants}
        />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Playback mode">
          <Select
            onChange={(event) =>
              onChange({
                playbackMode: event.target.value as ChannelInput["playbackMode"],
                ...(event.target.value === "DIRECT" ? { timeshiftEnabled: false } : {}),
              })
            }
            uiSize="sm"
            value={form.playbackMode}
          >
            <option value="DIRECT">Direct client playback</option>
            <option value="PROXY">Proxy through TV-Dash</option>
          </Select>
          {usesDirectManualHeaders ? (
            <FieldMessage tone="amber">
              Direct playback only applies these request settings to the synthesized master request. Use proxy mode if the
              provider requires headers or referrer handling on variant and segment fetches too.
            </FieldMessage>
          ) : null}
        </Field>
        <Field label="Status">
          <Select
            onChange={(event) => onChange({ isActive: event.target.value === "true" })}
            uiSize="sm"
            value={String(form.isActive)}
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Live timeshift">
          <Select
            onChange={(event) => onChange({ timeshiftEnabled: event.target.value === "true" })}
            uiSize="sm"
            value={String(form.timeshiftEnabled)}
          >
            <option value="false">Live only</option>
            <option value="true" disabled={form.playbackMode !== "PROXY"}>
              Retained DVR buffer
            </option>
          </Select>
          {form.playbackMode !== "PROXY" ? (
            <FieldMessage tone="amber">
              Timeshift needs proxy playback so TV-Dash can retain live HLS segments and serve a real DVR window.
            </FieldMessage>
          ) : null}
        </Field>
        <Field label="DVR window minutes">
          <Input
            disabled={!form.timeshiftEnabled}
            min={5}
            onChange={(event) => onChange({ timeshiftWindowMinutes: Number(event.target.value) })}
            type="number"
            uiSize="sm"
            value={form.timeshiftWindowMinutes}
          />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Upstream User-Agent">
          <Input onChange={(event) => onChange({ upstreamUserAgent: event.target.value })} uiSize="sm" value={form.upstreamUserAgent} />
        </Field>
        <Field label="Upstream Referrer">
          <Input onChange={(event) => onChange({ upstreamReferrer: event.target.value })} uiSize="sm" value={form.upstreamReferrer} />
        </Field>
      </div>

      <Field label="Upstream Headers JSON">
        <TextArea
          onChange={(event) => onChange({ upstreamHeadersText: event.target.value })}
          placeholder='{"x-token":"value"}'
          rows={4}
          value={form.upstreamHeadersText}
        />
        {getValidationMessages(validation, "upstreamHeadersText").length > 0 ? (
          <FieldMessage tone="rose">{getValidationMessages(validation, "upstreamHeadersText")[0]}</FieldMessage>
        ) : null}
      </Field>

      <Field label="Sort order">
        <Input
          onChange={(event) => onChange({ sortOrder: Number(event.target.value) })}
          type="number"
          uiSize="sm"
          value={form.sortOrder}
        />
      </Field>
    </>
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

function FieldMessage({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "amber" | "rose";
}) {
  return (
    <p
      className={
        tone === "amber"
          ? "text-xs text-amber-100/90"
          : "text-xs text-rose-100/90"
      }
    >
      {children}
    </p>
  );
}
