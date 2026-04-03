import { epgSourceInputSchema } from "@tv-dash/shared";
import type { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../app/auth-guards.js";
import { getPrismaErrorCode } from "../../app/prisma-errors.js";
import { epgNowNextQuerySchema, idParamSchema } from "../../app/request-schemas.js";
import { writeStructuredLog } from "../../app/structured-log.js";
import { parseWithSchema } from "../../app/validation.js";
import { recordAuditEvent, summarizeEpgSourceAuditDetail } from "../audit/audit.service.js";
import {
  createConfiguredEpgSource,
  deleteConfiguredEpgSource,
  getEpgSource,
  getNowNextForChannels,
  listConfiguredEpgSources,
  previewEpgSourceChannels,
  updateConfiguredEpgSource,
} from "./epg.service.js";

export const epgRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/epg/sources", { preHandler: [requirePermission("epg:manage")] }, async () => {
    const sources = await listConfiguredEpgSources();
    return { sources };
  });

  fastify.post("/epg/sources", { preHandler: [requirePermission("epg:manage")] }, async (request, reply) => {
    const payload = parseWithSchema(epgSourceInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    try {
      const source = await createConfiguredEpgSource(payload);
      if (!source) {
        throw new Error("EPG source was not created");
      }
      await recordAuditEvent({
        actorUserId: request.authUser?.id,
        actorRole: request.authUser?.role,
        action: "epg-source.create",
        targetType: "epg-source",
        targetId: source.id,
        targetName: source.slug,
        detail: summarizeEpgSourceAuditDetail(payload),
      });
      writeStructuredLog("info", {
        event: "epg.source.create.succeeded",
        actorUserId: request.authUser?.id,
        epgSourceId: source.id,
        detail: {
          slug: source.slug,
          isActive: source.isActive,
          refreshIntervalMinutes: source.refreshIntervalMinutes,
        },
      });
      return reply.status(201).send({ source });
    } catch (error) {
      if (getPrismaErrorCode(error) === "P2002") {
        return reply.status(409).send({ message: "EPG source slug already exists" });
      }

      throw error;
    }
  });

  fastify.put("/epg/sources/:id", { preHandler: [requirePermission("epg:manage")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const payload = parseWithSchema(epgSourceInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    try {
      const source = await updateConfiguredEpgSource(params.id, payload);
      if (!source) {
        return reply.status(404).send({ message: "EPG source not found" });
      }
      await recordAuditEvent({
        actorUserId: request.authUser?.id,
        actorRole: request.authUser?.role,
        action: "epg-source.update",
        targetType: "epg-source",
        targetId: source.id,
        targetName: source.slug,
        detail: summarizeEpgSourceAuditDetail(payload),
      });
      writeStructuredLog("info", {
        event: "epg.source.update.succeeded",
        actorUserId: request.authUser?.id,
        epgSourceId: source.id,
        detail: {
          slug: source.slug,
          isActive: source.isActive,
          refreshIntervalMinutes: source.refreshIntervalMinutes,
        },
      });
      return { source };
    } catch (error) {
      const code = getPrismaErrorCode(error);

      if (code === "P2025") {
        return reply.status(404).send({ message: "EPG source not found" });
      }

      if (code === "P2002") {
        return reply.status(409).send({ message: "EPG source slug already exists" });
      }

      throw error;
    }
  });

  fastify.delete("/epg/sources/:id", { preHandler: [requirePermission("epg:manage")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    try {
      await deleteConfiguredEpgSource(params.id);
      await recordAuditEvent({
        actorUserId: request.authUser?.id,
        actorRole: request.authUser?.role,
        action: "epg-source.delete",
        targetType: "epg-source",
        targetId: params.id,
      });
      writeStructuredLog("info", {
        event: "epg.source.delete.succeeded",
        actorUserId: request.authUser?.id,
        epgSourceId: params.id,
      });
      return reply.status(204).send();
    } catch (error) {
      if (getPrismaErrorCode(error) === "P2025") {
        return reply.status(404).send({ message: "EPG source not found" });
      }

      throw error;
    }
  });

  fastify.get("/epg/sources/:id/channels", { preHandler: [requirePermission("epg:manage")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    try {
      const preview = await previewEpgSourceChannels(params.id);

      if (!preview) {
        return reply.status(404).send({ message: "EPG source not found" });
      }

      return preview;
    } catch (error) {
      return reply.status(502).send({
        message: error instanceof Error ? error.message : "Unable to preview EPG source",
      });
    }
  });

  fastify.get("/epg/now-next", { preHandler: [requirePermission("epg:read")] }, async (request, reply) => {
    const query = parseWithSchema(epgNowNextQuerySchema, request.query, reply);
    if (!query) {
      return;
    }

    const items = await getNowNextForChannels(query.channelIds);
    return { items };
  });
};
