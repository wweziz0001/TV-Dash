import { channelInputSchema, type ChannelInput } from "@tv-dash/shared";
import type { ChannelConfig, ChannelGroup, EpgSource } from "@/types/api";
import { normalizeManualVariantLabel, type ManualVariantDraft } from "./channel-manual-variants";

export type ChannelManualVariantFormValue = ManualVariantDraft;

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

export interface ChannelFormValidationIssue {
  path: string;
  message: string;
}

export interface ChannelFormValidation {
  isValid: boolean;
  payload: ChannelInput | null;
  issues: ChannelFormValidationIssue[];
  issuesByPath: Record<string, string[]>;
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

function toFormPath(path: Array<string | number>) {
  if (path[0] === "upstreamHeaders") {
    return "upstreamHeadersText";
  }

  return path.join(".");
}

function getRawFormValue(form: ChannelAdminFormValue, path: Array<string | number>) {
  if (path[0] === "manualVariants" && typeof path[1] === "number" && typeof path[2] === "string") {
    return form.manualVariants[path[1]]?.[path[2] as keyof ChannelManualVariantFormValue];
  }

  if (typeof path[0] === "string" && path[0] in form) {
    return form[path[0] as keyof ChannelAdminFormValue];
  }

  return undefined;
}

function buildFriendlyValidationMessage(form: ChannelAdminFormValue, issue: { message: string; path: Array<string | number> }) {
  const formPath = toFormPath(issue.path);
  const rawValue = getRawFormValue(form, issue.path);

  if (formPath === "masterHlsUrl" && typeof rawValue === "string") {
    return rawValue.trim() ? "Master playlist URL must be a valid URL" : "Master playlist URL is required";
  }

  if (formPath.endsWith(".playlistUrl") && typeof rawValue === "string") {
    return rawValue.trim() ? "Playlist URL must be a valid URL" : "Playlist URL is required";
  }

  if (formPath.endsWith(".label") && typeof rawValue === "string" && !rawValue.trim()) {
    return "Quality label is required";
  }

  if (formPath === "name" && typeof rawValue === "string" && rawValue.trim().length < 2) {
    return "Name is required";
  }

  if (formPath === "slug" && typeof rawValue === "string" && rawValue.trim().length < 2) {
    return "Slug is required";
  }

  return issue.message;
}

export function getValidationMessages(validation: ChannelFormValidation, path: string) {
  return validation.issuesByPath[path] ?? [];
}

export function validateChannelForm(form: ChannelAdminFormValue): ChannelFormValidation {
  let payload: ChannelInput;

  try {
    payload = buildChannelInput(form);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to parse form data";

    return {
      isValid: false,
      payload: null,
      issues: [{ path: "upstreamHeadersText", message }],
      issuesByPath: {
        upstreamHeadersText: [message],
      },
    };
  }

  const parsed = channelInputSchema.safeParse(payload);

  if (parsed.success) {
    return {
      isValid: true,
      payload: parsed.data,
      issues: [],
      issuesByPath: {},
    };
  }

  const issues = parsed.error.issues.map((issue) => ({
    path: toFormPath(issue.path),
    message: buildFriendlyValidationMessage(form, issue),
  }));
  const issuesByPath = issues.reduce<Record<string, string[]>>((result, issue) => {
    const existingMessages = result[issue.path] ?? [];
    result[issue.path] = existingMessages.includes(issue.message)
      ? existingMessages
      : [...existingMessages, issue.message];
    return result;
  }, {});

  return {
    isValid: false,
    payload: null,
    issues,
    issuesByPath,
  };
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
      label: normalizeManualVariantLabel(variant.label),
      sortOrder: Number(variant.sortOrder),
      playlistUrl: variant.playlistUrl.trim(),
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

export interface ChannelAdminFormFieldsProps {
  form: ChannelAdminFormValue;
  groups: ChannelGroup[];
  epgSources: EpgSource[];
  onChange: (patch: Partial<ChannelAdminFormValue>) => void;
}
