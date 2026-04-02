import { z } from "zod";

const optionalTrimmedString = z.string().trim().optional().transform((value) => value || undefined);

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const channelIdParamSchema = z.object({
  channelId: z.string().uuid(),
});

export const slugParamSchema = z.object({
  slug: z.string().min(2).max(120),
});

export const channelListQuerySchema = z.object({
  search: optionalTrimmedString,
  groupId: z.string().uuid().optional(),
  active: z.enum(["true", "false"]).optional(),
});

export const streamProxyQuerySchema = z.object({
  token: z.string().min(20),
});

export const epgNowNextQuerySchema = z.object({
  channelIds: z
    .string()
    .transform((value) => value.split(",").map((part) => part.trim()).filter(Boolean))
    .pipe(z.array(z.string().uuid()).min(1).max(20)),
});
