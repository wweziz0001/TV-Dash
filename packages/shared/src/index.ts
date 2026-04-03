import { z } from "zod";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const userRoleSchema = z.enum(["ADMIN", "USER"]);
export const accessPermissionSchema = z.enum([
  "admin:access",
  "channels:read",
  "channels:manage",
  "groups:manage",
  "epg:read",
  "epg:manage",
  "favorites:manage-own",
  "layouts:manage-own",
  "diagnostics:read",
  "audit:read",
  "streams:inspect",
]);

export const layoutTypeSchema = z.enum([
  "LAYOUT_1X1",
  "LAYOUT_2X2",
  "LAYOUT_3X3",
  "LAYOUT_FOCUS_1_2",
  "LAYOUT_FOCUS_1_4",
]);

export const streamPlaybackModeSchema = z.enum(["DIRECT", "PROXY"]);
export const channelSourceModeSchema = z.enum(["MASTER_PLAYLIST", "MANUAL_VARIANTS"]);
export const epgSourceTypeSchema = z.enum(["XMLTV"]);
export const qualityModeSchema = z.enum(["AUTO", "LOWEST", "HIGHEST", "MANUAL"]);
export const playbackSessionTypeSchema = z.enum(["SINGLE_VIEW", "MULTIVIEW"]);
export const playbackSessionStateSchema = z.enum(["idle", "loading", "playing", "buffering", "retrying", "error"]);
export const diagnosticHealthStateSchema = z.enum(["healthy", "degraded", "failing", "unknown"]);
export const diagnosticFailureKindSchema = z.enum([
  "network",
  "playlist-fetch",
  "invalid-playlist",
  "media-playback",
  "proxy-forwarding",
  "epg-fetch",
  "epg-parse",
  "misconfiguration",
  "unsupported-stream",
  "synthetic-master",
  "validation",
  "unknown",
]);

const FORBIDDEN_UPSTREAM_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "host",
  "origin",
  "content-length",
  "transfer-encoding",
  "connection",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "upgrade",
  "via",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
]);
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const HTTP_HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function isSafeConfiguredUrl(value: string) {
  try {
    const url = new URL(value);

    if (!["http:", "https:"].includes(url.protocol)) {
      return false;
    }

    if (url.username || url.password || url.hash) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

const boundedOperationalStringSchema = z
  .string()
  .trim()
  .max(255)
  .refine((value) => !CONTROL_CHARACTER_PATTERN.test(value), {
    message: "Value cannot contain control characters",
  });

const optionalNullableTrimmedStringSchema = boundedOperationalStringSchema
  .or(z.null())
  .optional()
  .transform((value) => (typeof value === "string" ? value || null : null));

const configuredUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => isSafeConfiguredUrl(value), {
    message: "URL must use http/https without embedded credentials or fragments",
  });

const optionalNullableUrlSchema = configuredUrlSchema
  .or(z.literal(""))
  .or(z.null())
  .optional()
  .transform((value) => (typeof value === "string" ? value || null : null));

const optionalNullablePositiveIntegerSchema = z
  .number()
  .int()
  .positive()
  .nullable()
  .optional()
  .transform((value) => value ?? null);

export const upstreamHeadersInputSchema = z
  .record(
    z
      .string()
      .trim()
      .min(1)
      .max(120)
      .refine((value) => HTTP_HEADER_NAME_PATTERN.test(value), {
        message: "Header names must use valid HTTP token characters",
      }),
    z
      .string()
      .trim()
      .min(1)
      .max(1024)
      .refine((value) => !CONTROL_CHARACTER_PATTERN.test(value), {
        message: "Header values cannot contain control characters",
      }),
  )
  .default({})
  .superRefine((headers, context) => {
    const normalizedNames = new Set<string>();

    if (Object.keys(headers).length > 20) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "No more than 20 upstream headers are allowed",
      });
    }

    Object.keys(headers).forEach((headerName) => {
      const normalizedName = headerName.trim().toLowerCase();

      if (FORBIDDEN_UPSTREAM_HEADER_NAMES.has(normalizedName)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Header ${headerName} is reserved and cannot be configured manually`,
          path: [headerName],
        });
      }

      if (normalizedNames.has(normalizedName)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate header ${headerName} is not allowed`,
          path: [headerName],
        });
        return;
      }

      normalizedNames.add(normalizedName);
    });
  });

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const channelGroupInputSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(80),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});

export const channelQualityVariantInputSchema = z.object({
  label: z.string().trim().min(1).max(40),
  sortOrder: z.number().int().min(0).max(9999),
  playlistUrl: configuredUrlSchema,
  width: optionalNullablePositiveIntegerSchema,
  height: optionalNullablePositiveIntegerSchema,
  bandwidth: optionalNullablePositiveIntegerSchema,
  codecs: z
    .string()
    .trim()
    .max(255)
    .nullable()
    .optional()
    .transform((value) => value || null),
  isActive: z.boolean().default(true),
});

const channelBaseInputSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(120),
  logoUrl: optionalNullableUrlSchema,
  groupId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  playbackMode: streamPlaybackModeSchema.default("DIRECT"),
  upstreamUserAgent: optionalNullableTrimmedStringSchema,
  upstreamReferrer: optionalNullableUrlSchema,
  upstreamHeaders: upstreamHeadersInputSchema,
  epgSourceId: z.string().uuid().nullable().optional(),
  epgChannelId: z
    .string()
    .trim()
    .max(160)
    .nullable()
    .optional()
    .transform((value) => value || null),
});

const masterPlaylistChannelInputSchema = channelBaseInputSchema.extend({
  sourceMode: z.literal("MASTER_PLAYLIST"),
  masterHlsUrl: configuredUrlSchema,
  manualVariants: z.undefined().optional(),
});

const manualVariantsChannelInputSchema = channelBaseInputSchema.extend({
  sourceMode: z.literal("MANUAL_VARIANTS"),
  masterHlsUrl: z.null().optional(),
  manualVariants: z.array(channelQualityVariantInputSchema).min(1),
});

function addDuplicateIssue(
  context: z.RefinementCtx,
  path: ["manualVariants", number, "label" | "sortOrder" | "playlistUrl"],
  message: string,
) {
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message,
  });
}

export const channelInputSchema = z
  .discriminatedUnion("sourceMode", [masterPlaylistChannelInputSchema, manualVariantsChannelInputSchema])
  .superRefine((value, context) => {
    const hasEpgSource = Boolean(value.epgSourceId);
    const hasEpgChannelId = Boolean(value.epgChannelId);

    if (hasEpgSource !== hasEpgChannelId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "EPG source and EPG channel id must be provided together",
        path: hasEpgSource ? ["epgChannelId"] : ["epgSourceId"],
      });
    }

    if (value.sourceMode !== "MANUAL_VARIANTS") {
      return;
    }

    const labelMap = new Map<string, number>();
    const sortOrderMap = new Map<number, number>();
    const playlistUrlMap = new Map<string, number>();
    const activeVariantCount = value.manualVariants.filter((variant) => variant.isActive).length;

    value.manualVariants.forEach((variant, index) => {
      const normalizedLabel = variant.label.trim().toLowerCase();
      const normalizedUrl = variant.playlistUrl.trim().toLowerCase();

      const duplicateLabelIndex = labelMap.get(normalizedLabel);
      if (duplicateLabelIndex !== undefined) {
        addDuplicateIssue(context, ["manualVariants", index, "label"], "Manual variant labels must be unique");
      } else {
        labelMap.set(normalizedLabel, index);
      }

      const duplicateSortOrderIndex = sortOrderMap.get(variant.sortOrder);
      if (duplicateSortOrderIndex !== undefined) {
        addDuplicateIssue(
          context,
          ["manualVariants", index, "sortOrder"],
          "Manual variant sort orders must be unique",
        );
      } else {
        sortOrderMap.set(variant.sortOrder, index);
      }

      const duplicateUrlIndex = playlistUrlMap.get(normalizedUrl);
      if (duplicateUrlIndex !== undefined) {
        addDuplicateIssue(
          context,
          ["manualVariants", index, "playlistUrl"],
          "Manual variant playlist URLs must be unique",
        );
      } else {
        playlistUrlMap.set(normalizedUrl, index);
      }
    });

    if (activeVariantCount === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one manual variant must be active",
        path: ["manualVariants"],
      });
    }
  });

export const epgSourceInputSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(120),
  sourceType: epgSourceTypeSchema.default("XMLTV"),
  url: configuredUrlSchema,
  isActive: z.boolean().default(true),
  refreshIntervalMinutes: z.number().int().min(5).max(1440).default(360),
  requestUserAgent: optionalNullableTrimmedStringSchema,
  requestReferrer: optionalNullableUrlSchema,
  requestHeaders: upstreamHeadersInputSchema,
});

export const favoriteInputSchema = z.object({
  channelId: z.string().uuid(),
});

export const channelSortOrderInputSchema = z.object({
  sortOrder: z.number().int().min(0).max(9999),
});

export const savedLayoutItemInputSchema = z.object({
  tileIndex: z.number().int().min(0).max(32),
  channelId: z.string().uuid().nullable(),
  preferredQuality: z.string().nullable().optional(),
  isMuted: z.boolean().default(true),
});

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(jsonValueSchema)]),
);

export const jsonObjectSchema = z.record(jsonValueSchema);

export const savedLayoutConfigSchema = jsonObjectSchema;

export const savedLayoutInputSchema = z.object({
  name: z.string().min(2).max(100),
  layoutType: layoutTypeSchema,
  configJson: savedLayoutConfigSchema.default({}),
  items: z.array(savedLayoutItemInputSchema).min(1).max(9),
});

export const streamTestInputSchema = z.object({
  url: configuredUrlSchema,
  requestUserAgent: optionalNullableTrimmedStringSchema,
  requestReferrer: optionalNullableUrlSchema,
  requestHeaders: upstreamHeadersInputSchema,
});

export const streamVariantSchema = z.object({
  label: z.string(),
  height: z.number().nullable(),
  bandwidth: z.number().nullable(),
});

export const playbackSessionHeartbeatItemInputSchema = z.object({
  sessionId: z.string().uuid(),
  channelId: z.string().uuid(),
  sessionType: playbackSessionTypeSchema,
  playbackState: playbackSessionStateSchema,
  selectedQuality: z
    .string()
    .trim()
    .max(40)
    .nullable()
    .optional()
    .transform((value) => value || null),
  isMuted: z.boolean(),
  tileIndex: z
    .number()
    .int()
    .min(0)
    .max(32)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  failureKind: diagnosticFailureKindSchema.nullable().optional().transform((value) => value ?? null),
});

export const playbackSessionHeartbeatInputSchema = z.object({
  sessions: z.array(playbackSessionHeartbeatItemInputSchema).min(1).max(9),
});

export const playbackSessionEndInputSchema = z.object({
  sessionIds: z.array(z.string().uuid()).min(1).max(9),
});

export type UserRole = z.infer<typeof userRoleSchema>;
export type AccessPermission = z.infer<typeof accessPermissionSchema>;
export type LayoutType = z.infer<typeof layoutTypeSchema>;
export type StreamPlaybackMode = z.infer<typeof streamPlaybackModeSchema>;
export type ChannelSourceMode = z.infer<typeof channelSourceModeSchema>;
export type EpgSourceType = z.infer<typeof epgSourceTypeSchema>;
export type QualityMode = z.infer<typeof qualityModeSchema>;
export type PlaybackSessionType = z.infer<typeof playbackSessionTypeSchema>;
export type PlaybackSessionState = z.infer<typeof playbackSessionStateSchema>;
export type DiagnosticHealthState = z.infer<typeof diagnosticHealthStateSchema>;
export type DiagnosticFailureKind = z.infer<typeof diagnosticFailureKindSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type ChannelGroupInput = z.infer<typeof channelGroupInputSchema>;
export type ChannelQualityVariantInput = z.infer<typeof channelQualityVariantInputSchema>;
export type ChannelInput = z.infer<typeof channelInputSchema>;
export type ChannelSortOrderInput = z.infer<typeof channelSortOrderInputSchema>;
export type EpgSourceInput = z.infer<typeof epgSourceInputSchema>;
export type FavoriteInput = z.infer<typeof favoriteInputSchema>;
export type SavedLayoutConfig = z.infer<typeof savedLayoutConfigSchema>;
export type SavedLayoutInput = z.infer<typeof savedLayoutInputSchema>;
export type SavedLayoutItemInput = z.infer<typeof savedLayoutItemInputSchema>;
export type StreamTestInput = z.infer<typeof streamTestInputSchema>;
export type StreamVariant = z.infer<typeof streamVariantSchema>;
export type PlaybackSessionHeartbeatItemInput = z.infer<typeof playbackSessionHeartbeatItemInputSchema>;
export type PlaybackSessionHeartbeatInput = z.infer<typeof playbackSessionHeartbeatInputSchema>;
export type PlaybackSessionEndInput = z.infer<typeof playbackSessionEndInputSchema>;

export const ROLE_PERMISSION_MAP: Record<UserRole, AccessPermission[]> = {
  ADMIN: [
    "admin:access",
    "channels:read",
    "channels:manage",
    "groups:manage",
    "epg:read",
    "epg:manage",
    "favorites:manage-own",
    "layouts:manage-own",
    "diagnostics:read",
    "audit:read",
    "streams:inspect",
  ],
  USER: ["channels:read", "epg:read", "favorites:manage-own", "layouts:manage-own"],
};

export function roleHasPermission(role: UserRole, permission: AccessPermission) {
  return ROLE_PERMISSION_MAP[role].includes(permission);
}
