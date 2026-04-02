import type { ChannelInput } from "@tv-dash/shared";
import type { ChannelConfig, ChannelGroup, EpgSource } from "@/types/api";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TextArea } from "@/components/ui/text-area";

export interface ChannelAdminFormValue {
  name: string;
  slug: string;
  logoUrl: string;
  groupId: string;
  masterHlsUrl: string;
  isActive: boolean;
  sortOrder: number;
  playbackMode: ChannelInput["playbackMode"];
  upstreamUserAgent: string;
  upstreamReferrer: string;
  upstreamHeadersText: string;
  epgSourceId: string;
  epgChannelId: string;
}

export const emptyChannelForm: ChannelAdminFormValue = {
  name: "",
  slug: "",
  logoUrl: "",
  groupId: "",
  masterHlsUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
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

export function buildChannelInput(form: ChannelAdminFormValue): ChannelInput {
  return {
    name: form.name,
    slug: form.slug,
    logoUrl: form.logoUrl,
    masterHlsUrl: form.masterHlsUrl,
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
}

export function buildChannelFormFromConfig(channel: ChannelConfig): ChannelAdminFormValue {
  return {
    name: channel.name,
    slug: channel.slug,
    logoUrl: channel.logoUrl ?? "",
    groupId: channel.groupId ?? "",
    masterHlsUrl: channel.masterHlsUrl,
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

      <Field label="Master HLS URL">
        <Input onChange={(event) => onChange({ masterHlsUrl: event.target.value })} value={form.masterHlsUrl} />
      </Field>

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
