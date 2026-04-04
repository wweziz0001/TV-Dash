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
  "recordings:manage-own",
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

export const streamPlaybackModeSchema = z.enum(["DIRECT", "PROXY", "SHARED"]);
export const channelSourceModeSchema = z.enum(["MASTER_PLAYLIST", "MANUAL_VARIANTS"]);
export const epgSourceTypeSchema = z.enum(["XMLTV_URL", "XMLTV_FILE"]);
export const epgImportStatusSchema = z.enum(["NEVER_IMPORTED", "SUCCEEDED", "FAILED"]);
export const programEntrySourceSchema = z.enum(["IMPORTED", "MANUAL"]);
export const qualityModeSchema = z.enum(["AUTO", "LOWEST", "HIGHEST", "MANUAL"]);
export const playbackSessionTypeSchema = z.enum(["SINGLE_VIEW", "MULTIVIEW"]);
export const playbackSessionStateSchema = z.enum(["idle", "loading", "playing", "buffering", "retrying", "error"]);
export const diagnosticHealthStateSchema = z.enum(["healthy", "degraded", "failing", "unknown"]);
export const liveTimeshiftBufferStateSchema = z.enum(["DISABLED", "UNSUPPORTED", "STARTING", "WARMING", "READY", "ERROR"]);
export const recordingModeSchema = z.enum(["IMMEDIATE", "TIMED", "SCHEDULED", "EPG_PROGRAM", "RECURRING_RULE"]);
export const recordingJobStatusSchema = z.enum(["PENDING", "SCHEDULED", "RECORDING", "COMPLETED", "FAILED", "CANCELED"]);
export const recordingRunStatusSchema = z.enum(["STARTING", "RECORDING", "COMPLETED", "FAILED", "CANCELED"]);
export const recordingRecurrenceTypeSchema = z.enum(["DAILY", "WEEKLY", "WEEKDAYS"]);
export const recordingWeekdaySchema = z.enum([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]);
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

const optionalNullableTimeshiftWindowMinutesSchema = z
  .number()
  .int()
  .min(5)
  .max(360)
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
  timeshiftEnabled: z.boolean().default(false),
  timeshiftWindowMinutes: optionalNullableTimeshiftWindowMinutesSchema,
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
    if (value.timeshiftEnabled && !isTvDashManagedPlaybackMode(value.playbackMode)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["playbackMode"],
        message: "Timeshift requires TV-Dash-managed delivery so TV-Dash can retain the live buffer",
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

const optionalNullableLongTextSchema = z
  .string()
  .trim()
  .max(4000)
  .nullable()
  .optional()
  .transform((value) => value || null);

const optionalNullableMediumTextSchema = z
  .string()
  .trim()
  .max(255)
  .nullable()
  .optional()
  .transform((value) => value || null);

const optionalNullableShortTextSchema = z
  .string()
  .trim()
  .max(120)
  .nullable()
  .optional()
  .transform((value) => value || null);

const optionalNullablePositiveDurationSchema = z
  .number()
  .int()
  .min(5)
  .max(1440)
  .nullable()
  .optional()
  .transform((value) => value ?? null);

const isoDateTimeSchema = z.string().datetime({ offset: true });

export const epgSourceInputSchema = z
  .object({
    name: z.string().min(2).max(120),
    slug: z.string().min(2).max(120),
    sourceType: epgSourceTypeSchema.default("XMLTV_URL"),
    url: optionalNullableUrlSchema,
    isActive: z.boolean().default(true),
    refreshIntervalMinutes: optionalNullablePositiveDurationSchema,
    requestUserAgent: optionalNullableTrimmedStringSchema,
    requestReferrer: optionalNullableUrlSchema,
    requestHeaders: upstreamHeadersInputSchema,
  })
  .superRefine((value, context) => {
    if (value.sourceType === "XMLTV_URL") {
      if (!value.url) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["url"],
          message: "URL is required for XMLTV URL sources",
        });
      }

      if (!value.refreshIntervalMinutes) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["refreshIntervalMinutes"],
          message: "Refresh interval is required for XMLTV URL sources",
        });
      }
    }
  });

export const epgSourceFileImportInputSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  xmlContent: z.string().min(1).max(10_000_000),
});

export const epgChannelMappingInputSchema = z.object({
  channelId: z.string().uuid(),
  sourceChannelId: z.string().uuid().nullable(),
});

export const programEntryInputSchema = z
  .object({
    channelId: z.string().uuid(),
    title: z.string().trim().min(1).max(180),
    subtitle: optionalNullableMediumTextSchema,
    startAt: isoDateTimeSchema,
    endAt: isoDateTimeSchema,
    description: optionalNullableLongTextSchema,
    category: optionalNullableShortTextSchema,
    imageUrl: optionalNullableUrlSchema,
  })
  .superRefine((value, context) => {
    const startAt = Date.parse(value.startAt);
    const endAt = Date.parse(value.endAt);

    if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) {
      return;
    }

    if (endAt <= startAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endAt"],
        message: "End time must be after start time",
      });
    }
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

const optionalNullableRecordingTitleSchema = z
  .string()
  .trim()
  .max(180)
  .nullable()
  .optional()
  .transform((value) => value || null);

const optionalNullableUuidSchema = z
  .string()
  .uuid()
  .nullable()
  .optional()
  .transform((value) => value ?? null);

const optionalNullableIsoDateTimeSchema = isoDateTimeSchema
  .nullable()
  .optional()
  .transform((value) => value ?? null);

const optionalNullableRecordingQualitySelectorSchema = z
  .string()
  .trim()
  .max(32)
  .nullable()
  .optional()
  .transform((value) => (typeof value === "string" ? value || null : null));

const optionalNullableRecordingQualityLabelSchema = z
  .string()
  .trim()
  .max(80)
  .nullable()
  .optional()
  .transform((value) => (typeof value === "string" ? value || null : null));

const recordingPaddingMinutesSchema = z
  .number()
  .int()
  .min(0)
  .max(180)
  .nullable()
  .optional()
  .transform((value) => value ?? 0);

const timeZoneSchema = z.string().trim().min(1).max(120);

export const recordingJobInputSchema = z
  .object({
    channelId: z.string().uuid(),
    title: optionalNullableRecordingTitleSchema,
    mode: recordingModeSchema.default("IMMEDIATE"),
    startAt: optionalNullableIsoDateTimeSchema,
    endAt: optionalNullableIsoDateTimeSchema,
    programEntryId: optionalNullableUuidSchema,
    paddingBeforeMinutes: recordingPaddingMinutesSchema,
    paddingAfterMinutes: recordingPaddingMinutesSchema,
    requestedQualitySelector: optionalNullableRecordingQualitySelectorSchema,
    requestedQualityLabel: optionalNullableRecordingQualityLabelSchema,
  })
  .superRefine((value, context) => {
    if (value.mode === "RECURRING_RULE") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mode"],
        message: "Recurring-rule jobs are generated by recording rules, not created directly",
      });
    }

    if (value.mode === "EPG_PROGRAM") {
      if (!value.programEntryId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["programEntryId"],
          message: "Program recording requires a linked guide programme",
        });
      }

      return;
    }

    if (value.mode === "IMMEDIATE") {
      if (value.endAt && !value.startAt) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["startAt"],
          message: "Start time is required when an end time is provided",
        });
      }
    } else {
      if (!value.startAt) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["startAt"],
          message: "Start time is required for timed or scheduled recordings",
        });
      }

      if (!value.endAt) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endAt"],
          message: "End time is required for timed or scheduled recordings",
        });
      }
    }

    if (value.startAt && value.endAt) {
      const startAt = Date.parse(value.startAt);
      const endAt = Date.parse(value.endAt);

      if (Number.isFinite(startAt) && Number.isFinite(endAt) && endAt <= startAt) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endAt"],
          message: "End time must be after start time",
        });
      }
    }
  });

export const recordingJobUpdateInputSchema = z
  .object({
    channelId: z.string().uuid(),
    title: optionalNullableRecordingTitleSchema,
    startAt: isoDateTimeSchema,
    endAt: isoDateTimeSchema,
    paddingBeforeMinutes: recordingPaddingMinutesSchema,
    paddingAfterMinutes: recordingPaddingMinutesSchema,
    requestedQualitySelector: optionalNullableRecordingQualitySelectorSchema,
    requestedQualityLabel: optionalNullableRecordingQualityLabelSchema,
  })
  .superRefine((value, context) => {
    const startAt = Date.parse(value.startAt);
    const endAt = Date.parse(value.endAt);

    if (Number.isFinite(startAt) && Number.isFinite(endAt) && endAt <= startAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endAt"],
        message: "End time must be after start time",
      });
    }
  });

export const recordingRuleInputSchema = z
  .object({
    channelId: z.string().uuid(),
    titleTemplate: optionalNullableRecordingTitleSchema,
    recurrenceType: recordingRecurrenceTypeSchema.default("DAILY"),
    weekdays: z.array(recordingWeekdaySchema).max(7).default([]),
    startsAt: isoDateTimeSchema,
    durationMinutes: z.number().int().min(5).max(1440),
    timeZone: timeZoneSchema,
    originProgramEntryId: optionalNullableUuidSchema,
    matchProgramTitle: optionalNullableMediumTextSchema,
    paddingBeforeMinutes: recordingPaddingMinutesSchema,
    paddingAfterMinutes: recordingPaddingMinutesSchema,
    requestedQualitySelector: optionalNullableRecordingQualitySelectorSchema,
    requestedQualityLabel: optionalNullableRecordingQualityLabelSchema,
    isActive: z.boolean().default(true),
  })
  .superRefine((value, context) => {
    const uniqueWeekdays = new Set(value.weekdays);

    if (uniqueWeekdays.size !== value.weekdays.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weekdays"],
        message: "Repeat weekdays must be unique",
      });
    }

    if (value.recurrenceType === "WEEKLY" && uniqueWeekdays.size !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weekdays"],
        message: "Weekly recurring rules must target exactly one weekday",
      });
    }

    if (value.recurrenceType === "WEEKDAYS" && uniqueWeekdays.size === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weekdays"],
        message: "Choose at least one weekday for weekday-based recurrence",
      });
    }

    if (value.recurrenceType === "DAILY" && uniqueWeekdays.size > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weekdays"],
        message: "Daily recurring rules should not include explicit weekdays",
      });
    }
  });

export const recordingRetentionInputSchema = z.object({
  isProtected: z.boolean(),
});

export const recordingRulesQuerySchema = z.object({
  channelId: z.string().uuid().optional(),
  isActive: z.enum(["true", "false"]).optional(),
});

export function isTvDashManagedPlaybackMode(playbackMode: StreamPlaybackMode) {
  return playbackMode === "PROXY" || playbackMode === "SHARED";
}

export function isSharedPlaybackMode(playbackMode: StreamPlaybackMode) {
  return playbackMode === "SHARED";
}

export type UserRole = z.infer<typeof userRoleSchema>;
export type AccessPermission = z.infer<typeof accessPermissionSchema>;
export type LayoutType = z.infer<typeof layoutTypeSchema>;
export type StreamPlaybackMode = z.infer<typeof streamPlaybackModeSchema>;
export type ChannelSourceMode = z.infer<typeof channelSourceModeSchema>;
export type EpgSourceType = z.infer<typeof epgSourceTypeSchema>;
export type EpgImportStatus = z.infer<typeof epgImportStatusSchema>;
export type ProgramEntrySource = z.infer<typeof programEntrySourceSchema>;
export type QualityMode = z.infer<typeof qualityModeSchema>;
export type PlaybackSessionType = z.infer<typeof playbackSessionTypeSchema>;
export type PlaybackSessionState = z.infer<typeof playbackSessionStateSchema>;
export type DiagnosticHealthState = z.infer<typeof diagnosticHealthStateSchema>;
export type LiveTimeshiftBufferState = z.infer<typeof liveTimeshiftBufferStateSchema>;
export type RecordingMode = z.infer<typeof recordingModeSchema>;
export type RecordingJobStatus = z.infer<typeof recordingJobStatusSchema>;
export type RecordingRunStatus = z.infer<typeof recordingRunStatusSchema>;
export type RecordingRecurrenceType = z.infer<typeof recordingRecurrenceTypeSchema>;
export type RecordingWeekday = z.infer<typeof recordingWeekdaySchema>;
export type DiagnosticFailureKind = z.infer<typeof diagnosticFailureKindSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type ChannelGroupInput = z.infer<typeof channelGroupInputSchema>;
export type ChannelQualityVariantInput = z.infer<typeof channelQualityVariantInputSchema>;
export type ChannelInput = z.infer<typeof channelInputSchema>;
export type ChannelSortOrderInput = z.infer<typeof channelSortOrderInputSchema>;
export type EpgSourceInput = z.infer<typeof epgSourceInputSchema>;
export type EpgSourceFileImportInput = z.infer<typeof epgSourceFileImportInputSchema>;
export type EpgChannelMappingInput = z.infer<typeof epgChannelMappingInputSchema>;
export type FavoriteInput = z.infer<typeof favoriteInputSchema>;
export type ProgramEntryInput = z.infer<typeof programEntryInputSchema>;
export type SavedLayoutConfig = z.infer<typeof savedLayoutConfigSchema>;
export type SavedLayoutInput = z.infer<typeof savedLayoutInputSchema>;
export type SavedLayoutItemInput = z.infer<typeof savedLayoutItemInputSchema>;
export type StreamTestInput = z.infer<typeof streamTestInputSchema>;
export type StreamVariant = z.infer<typeof streamVariantSchema>;
export type PlaybackSessionHeartbeatItemInput = z.infer<typeof playbackSessionHeartbeatItemInputSchema>;
export type PlaybackSessionHeartbeatInput = z.infer<typeof playbackSessionHeartbeatInputSchema>;
export type PlaybackSessionEndInput = z.infer<typeof playbackSessionEndInputSchema>;
export type RecordingJobInput = z.infer<typeof recordingJobInputSchema>;
export type RecordingJobUpdateInput = z.infer<typeof recordingJobUpdateInputSchema>;
export type RecordingRuleInput = z.infer<typeof recordingRuleInputSchema>;
export type RecordingRetentionInput = z.infer<typeof recordingRetentionInputSchema>;

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
    "recordings:manage-own",
    "diagnostics:read",
    "audit:read",
    "streams:inspect",
  ],
  USER: ["channels:read", "epg:read", "favorites:manage-own", "layouts:manage-own", "recordings:manage-own"],
};

export function roleHasPermission(role: UserRole, permission: AccessPermission) {
  return ROLE_PERMISSION_MAP[role].includes(permission);
}
