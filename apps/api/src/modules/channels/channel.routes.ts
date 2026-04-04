import { channelInputSchema, channelSortOrderInputSchema } from "@tv-dash/shared";
import type { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../app/auth-guards.js";
import { getPrismaErrorCode } from "../../app/prisma-errors.js";
import { channelListQuerySchema, idParamSchema, slugParamSchema } from "../../app/request-schemas.js";
import { writeStructuredLog } from "../../app/structured-log.js";
import { parseWithSchema } from "../../app/validation.js";
import { recordAuditEvent, summarizeChannelAuditDetail } from "../audit/audit.service.js";
import {
  createChannelRecord,
  deleteChannelRecord,
  getChannelById,
  getChannelConfigForAdmin,
  getChannelBySlug,
  listChannelCatalog,
  updateChannelSortOrderRecord,
  updateChannelRecord,
} from "./channel.service.js";

export const channelRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/channels", async (request, reply) => {
    const query = parseWithSchema(channelListQuerySchema, request.query, reply);
    if (!query) {
      return;
    }

    const channels = await listChannelCatalog(query);
    return { channels };
  });

  fastify.get("/channels/:id", async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const channel = await getChannelById(params.id);

    if (!channel) {
      return reply.status(404).send({ message: "Channel not found" });
    }

    return { channel };
  });

  fastify.get("/channels/:id/config", { preHandler: [requirePermission("channels:manage")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const channel = await getChannelConfigForAdmin(params.id);

    if (!channel) {
      return reply.status(404).send({ message: "Channel not found" });
    }

    return { channel };
  });

  fastify.get("/channels/slug/:slug", async (request, reply) => {
    const params = parseWithSchema(slugParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const channel = await getChannelBySlug(params.slug);

    if (!channel) {
      return reply.status(404).send({ message: "Channel not found" });
    }

    return { channel };
  });

  fastify.post("/channels", { preHandler: [requirePermission("channels:manage")] }, async (request, reply) => {
    const payload = parseWithSchema(channelInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    try {
      const channel = await createChannelRecord(payload);
      await recordAuditEvent({
        actorUserId: request.authUser?.id,
        actorRole: request.authUser?.role,
        action: "channel.create",
        targetType: "channel",
        targetId: channel.id,
        targetName: channel.slug,
        detail: summarizeChannelAuditDetail(payload),
      });
      writeStructuredLog("info", {
        event: "channel.admin.create.succeeded",
        actorUserId: request.authUser?.id,
        channelId: channel.id,
        channelSlug: channel.slug,
        detail: {
          sourceMode: channel.sourceMode,
          playbackMode: channel.playbackMode,
          timeshiftEnabled: channel.timeshiftEnabled,
          timeshiftWindowMinutes: channel.timeshiftWindowMinutes,
          manualVariantCount: channel.qualityVariants.length,
          hasEpgSource: Boolean(channel.epgSourceId),
        },
      });
      return reply.status(201).send({ channel });
    } catch (error) {
      const prismaCode = getPrismaErrorCode(error);

      if (prismaCode === "P2002") {
        return reply.status(409).send({ message: "Channel slug already exists" });
      }

      if (prismaCode === "P2003") {
        return reply.status(400).send({ message: "Group or EPG source is invalid" });
      }

      throw error;
    }
  });

  fastify.put("/channels/:id", { preHandler: [requirePermission("channels:manage")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const payload = parseWithSchema(channelInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    try {
      const channel = await updateChannelRecord(params.id, payload);
      await recordAuditEvent({
        actorUserId: request.authUser?.id,
        actorRole: request.authUser?.role,
        action: "channel.update",
        targetType: "channel",
        targetId: channel.id,
        targetName: channel.slug,
        detail: summarizeChannelAuditDetail(payload),
      });
      writeStructuredLog("info", {
        event: "channel.admin.update.succeeded",
        actorUserId: request.authUser?.id,
        channelId: channel.id,
        channelSlug: channel.slug,
        detail: {
          sourceMode: channel.sourceMode,
          playbackMode: channel.playbackMode,
          timeshiftEnabled: channel.timeshiftEnabled,
          timeshiftWindowMinutes: channel.timeshiftWindowMinutes,
          manualVariantCount: channel.qualityVariants.length,
          hasEpgSource: Boolean(channel.epgSourceId),
        },
      });
      return { channel };
    } catch (error) {
      const prismaCode = getPrismaErrorCode(error);

      if (prismaCode === "P2025") {
        return reply.status(404).send({ message: "Channel not found" });
      }

      if (prismaCode === "P2002") {
        return reply.status(409).send({ message: "Channel slug already exists" });
      }

      if (prismaCode === "P2003") {
        return reply.status(400).send({ message: "Group or EPG source is invalid" });
      }

      throw error;
    }
  });

  fastify.put("/channels/:id/sort-order", { preHandler: [requirePermission("channels:manage")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const payload = parseWithSchema(channelSortOrderInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    try {
      const channel = await updateChannelSortOrderRecord(params.id, payload.sortOrder);
      await recordAuditEvent({
        actorUserId: request.authUser?.id,
        actorRole: request.authUser?.role,
        action: "channel.sort-order.update",
        targetType: "channel",
        targetId: channel.id,
        targetName: channel.slug,
        detail: {
          sortOrder: channel.sortOrder,
        },
      });
      writeStructuredLog("info", {
        event: "channel.admin.sort-order.updated",
        actorUserId: request.authUser?.id,
        channelId: channel.id,
        channelSlug: channel.slug,
        detail: {
          sortOrder: channel.sortOrder,
        },
      });
      return { channel };
    } catch (error) {
      if (getPrismaErrorCode(error) === "P2025") {
        return reply.status(404).send({ message: "Channel not found" });
      }

      throw error;
    }
  });

  fastify.delete("/channels/:id", { preHandler: [requirePermission("channels:manage")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    try {
      await deleteChannelRecord(params.id);
      await recordAuditEvent({
        actorUserId: request.authUser?.id,
        actorRole: request.authUser?.role,
        action: "channel.delete",
        targetType: "channel",
        targetId: params.id,
      });
      writeStructuredLog("info", {
        event: "channel.admin.delete.succeeded",
        actorUserId: request.authUser?.id,
        channelId: params.id,
      });
      return reply.status(204).send();
    } catch (error) {
      if (getPrismaErrorCode(error) === "P2025") {
        return reply.status(404).send({ message: "Channel not found" });
      }

      throw error;
    }
  });
};
