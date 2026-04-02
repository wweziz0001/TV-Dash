import { z } from "zod";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const userRoleSchema = z.enum(["ADMIN", "USER"]);

export const layoutTypeSchema = z.enum([
  "LAYOUT_1X1",
  "LAYOUT_2X2",
  "LAYOUT_3X3",
  "LAYOUT_FOCUS_1_2",
  "LAYOUT_FOCUS_1_4",
]);

export const streamPlaybackModeSchema = z.enum(["DIRECT", "PROXY"]);
export const epgSourceTypeSchema = z.enum(["XMLTV"]);
export const qualityModeSchema = z.enum(["AUTO", "LOWEST", "HIGHEST", "MANUAL"]);

const optionalNullableTrimmedStringSchema = z
  .string()
  .trim()
  .max(255)
  .optional()
  .transform((value) => value || null);

const optionalNullableUrlSchema = z
  .string()
  .url()
  .or(z.literal(""))
  .optional()
  .transform((value) => value || null);

export const upstreamHeadersInputSchema = z.record(z.string().min(1).max(120), z.string().min(1).max(2000)).default({});

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const channelGroupInputSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(80),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});

export const channelInputSchema = z
  .object({
    name: z.string().min(2).max(120),
    slug: z.string().min(2).max(120),
    logoUrl: optionalNullableUrlSchema,
    masterHlsUrl: z.string().url(),
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
  })
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
  });

export const epgSourceInputSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(120),
  sourceType: epgSourceTypeSchema.default("XMLTV"),
  url: z.string().url(),
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
  url: z.string().url(),
  requestUserAgent: optionalNullableTrimmedStringSchema,
  requestReferrer: optionalNullableUrlSchema,
  requestHeaders: upstreamHeadersInputSchema,
});

export const streamVariantSchema = z.object({
  label: z.string(),
  height: z.number().nullable(),
  bandwidth: z.number().nullable(),
});

export type UserRole = z.infer<typeof userRoleSchema>;
export type LayoutType = z.infer<typeof layoutTypeSchema>;
export type StreamPlaybackMode = z.infer<typeof streamPlaybackModeSchema>;
export type EpgSourceType = z.infer<typeof epgSourceTypeSchema>;
export type QualityMode = z.infer<typeof qualityModeSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type ChannelGroupInput = z.infer<typeof channelGroupInputSchema>;
export type ChannelInput = z.infer<typeof channelInputSchema>;
export type ChannelSortOrderInput = z.infer<typeof channelSortOrderInputSchema>;
export type EpgSourceInput = z.infer<typeof epgSourceInputSchema>;
export type FavoriteInput = z.infer<typeof favoriteInputSchema>;
export type SavedLayoutConfig = z.infer<typeof savedLayoutConfigSchema>;
export type SavedLayoutInput = z.infer<typeof savedLayoutInputSchema>;
export type SavedLayoutItemInput = z.infer<typeof savedLayoutItemInputSchema>;
export type StreamTestInput = z.infer<typeof streamTestInputSchema>;
export type StreamVariant = z.infer<typeof streamVariantSchema>;
