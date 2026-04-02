import { z } from "zod";

export const userRoleSchema = z.enum(["ADMIN", "USER"]);

export const layoutTypeSchema = z.enum([
  "LAYOUT_1X1",
  "LAYOUT_2X2",
  "LAYOUT_3X3",
  "LAYOUT_FOCUS_1_2",
  "LAYOUT_FOCUS_1_4",
]);

export const qualityModeSchema = z.enum(["AUTO", "LOWEST", "HIGHEST", "MANUAL"]);

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const channelGroupInputSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(80),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});

export const channelInputSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(120),
  logoUrl: z.string().url().or(z.literal("")).optional().transform((value) => value || null),
  masterHlsUrl: z.string().url(),
  groupId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});

export const favoriteInputSchema = z.object({
  channelId: z.string().uuid(),
});

export const savedLayoutItemInputSchema = z.object({
  tileIndex: z.number().int().min(0).max(32),
  channelId: z.string().uuid().nullable(),
  preferredQuality: z.string().nullable().optional(),
  isMuted: z.boolean().default(true),
});

export const savedLayoutInputSchema = z.object({
  name: z.string().min(2).max(100),
  layoutType: layoutTypeSchema,
  configJson: z.record(z.any()).default({}),
  items: z.array(savedLayoutItemInputSchema).min(1).max(9),
});

export const streamTestInputSchema = z.object({
  url: z.string().url(),
});

export const streamVariantSchema = z.object({
  label: z.string(),
  height: z.number().nullable(),
  bandwidth: z.number().nullable(),
});

export type UserRole = z.infer<typeof userRoleSchema>;
export type LayoutType = z.infer<typeof layoutTypeSchema>;
export type QualityMode = z.infer<typeof qualityModeSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type ChannelGroupInput = z.infer<typeof channelGroupInputSchema>;
export type ChannelInput = z.infer<typeof channelInputSchema>;
export type FavoriteInput = z.infer<typeof favoriteInputSchema>;
export type SavedLayoutInput = z.infer<typeof savedLayoutInputSchema>;
export type SavedLayoutItemInput = z.infer<typeof savedLayoutItemInputSchema>;
export type StreamTestInput = z.infer<typeof streamTestInputSchema>;
export type StreamVariant = z.infer<typeof streamVariantSchema>;
