import {
  epgChannelMappingInputSchema,
  epgSourceFileImportInputSchema,
  epgSourceInputSchema,
  programEntryInputSchema,
} from "@tv-dash/shared";
import type { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../app/auth-guards.js";
import { getPrismaErrorCode } from "../../app/prisma-errors.js";
import {
  channelIdParamSchema,
  epgGuideWindowQuerySchema,
  epgManualProgramsQuerySchema,
  epgNowNextQuerySchema,
  epgSourceChannelsQuerySchema,
  idParamSchema,
} from "../../app/request-schemas.js";
import { writeStructuredLog } from "../../app/structured-log.js";
import { parseWithSchema } from "../../app/validation.js";
import { recordAuditEvent, summarizeEpgSourceAuditDetail } from "../audit/audit.service.js";
import {
  createConfiguredEpgSource,
  createManualProgramEntry,
  deleteConfiguredEpgSource,
  deleteManualProgramEntry,
  getEpgSource,
  getManualProgramEntry,
  getNowNextForChannels,
  getResolvedGuideForChannel,
  importConfiguredEpgSourceFromFile,
  importConfiguredEpgSourceFromUrl,
  listConfiguredEpgSources,
  listImportedSourceChannels,
  listManualProgramEntries,
  updateChannelGuideMapping,
  updateConfiguredEpgSource,
  updateManualProgramEntry,
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
          sourceType: source.sourceType,
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
          sourceType: source.sourceType,
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

  fastify.post("/epg/sources/:id/import-url", { preHandler: [requirePermission("epg:manage")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const source = await importConfiguredEpgSourceFromUrl(params.id).catch((error) => error);

    if (source instanceof Error) {
      return reply.status(502).send({
        message: source.message || "Unable to import XMLTV source",
      });
    }

    if (!source) {
      return reply.status(404).send({ message: "EPG source not found" });
    }

    await recordAuditEvent({
      actorUserId: request.authUser?.id,
      actorRole: request.authUser?.role,
      action: "epg-source.import-url",
      targetType: "epg-source",
      targetId: source.id,
      targetName: source.slug,
      detail: {
        importedChannelCount: source.lastImportChannelCount,
        importedProgramCount: source.lastImportProgramCount,
      },
    });

    return { source };
  });

  fastify.post("/epg/sources/:id/import-file", { preHandler: [requirePermission("epg:manage")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const payload = parseWithSchema(epgSourceFileImportInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    const source = await importConfiguredEpgSourceFromFile(params.id, payload).catch((error) => error);

    if (source instanceof Error) {
      const statusCode = source.message.toLowerCase().includes("xmltv") ? 400 : 502;
      return reply.status(statusCode).send({
        message: source.message || "Unable to import uploaded XMLTV file",
      });
    }

    if (!source) {
      return reply.status(404).send({ message: "EPG source not found" });
    }

    await recordAuditEvent({
      actorUserId: request.authUser?.id,
      actorRole: request.authUser?.role,
      action: "epg-source.import-file",
      targetType: "epg-source",
      targetId: source.id,
      targetName: source.slug,
      detail: {
        uploadedFileName: payload.fileName,
        importedChannelCount: source.lastImportChannelCount,
        importedProgramCount: source.lastImportProgramCount,
      },
    });

    return { source };
  });

  fastify.get("/epg/sources/:id/channels", { preHandler: [requirePermission("epg:manage")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const query = parseWithSchema(epgSourceChannelsQuerySchema, request.query, reply);
    if (!query) {
      return;
    }

    const result = await listImportedSourceChannels(params.id, query.search);

    if (!result) {
      return reply.status(404).send({ message: "EPG source not found" });
    }

    return result;
  });

  fastify.post("/epg/mappings", { preHandler: [requirePermission("epg:manage")] }, async (request, reply) => {
    const payload = parseWithSchema(epgChannelMappingInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    try {
      const mapping = await updateChannelGuideMapping(payload);
      await recordAuditEvent({
        actorUserId: request.authUser?.id,
        actorRole: request.authUser?.role,
        action: payload.sourceChannelId ? "epg-mapping.upsert" : "epg-mapping.clear",
        targetType: "channel",
        targetId: payload.channelId,
        detail: {
          sourceChannelId: payload.sourceChannelId,
        },
      });
      return { mapping };
    } catch (error) {
      if (getPrismaErrorCode(error) === "P2003") {
        return reply.status(400).send({ message: "Channel or EPG source channel is invalid" });
      }

      throw error;
    }
  });

  fastify.get("/epg/programs/manual", { preHandler: [requirePermission("epg:manage")] }, async (request, reply) => {
    const query = parseWithSchema(epgManualProgramsQuerySchema, request.query, reply);
    if (!query) {
      return;
    }

    const programs = await listManualProgramEntries(query.channelId);
    return { programs };
  });

  fastify.post("/epg/programs/manual", { preHandler: [requirePermission("epg:manage")] }, async (request, reply) => {
    const payload = parseWithSchema(programEntryInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    try {
      const program = await createManualProgramEntry(payload);
      await recordAuditEvent({
        actorUserId: request.authUser?.id,
        actorRole: request.authUser?.role,
        action: "program-entry.manual.create",
        targetType: "program-entry",
        targetId: program?.id ?? null,
        targetName: payload.title,
        detail: {
          channelId: payload.channelId,
          startAt: payload.startAt,
          endAt: payload.endAt,
        },
      });
      return reply.status(201).send({ program });
    } catch (error) {
      if (error instanceof Error && error.message.includes("overlaps")) {
        return reply.status(409).send({ message: error.message });
      }

      if (getPrismaErrorCode(error) === "P2003") {
        return reply.status(400).send({ message: "Channel is invalid" });
      }

      throw error;
    }
  });

  fastify.put("/epg/programs/manual/:id", { preHandler: [requirePermission("epg:manage")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const payload = parseWithSchema(programEntryInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    try {
      const program = await updateManualProgramEntry(params.id, payload);
      await recordAuditEvent({
        actorUserId: request.authUser?.id,
        actorRole: request.authUser?.role,
        action: "program-entry.manual.update",
        targetType: "program-entry",
        targetId: params.id,
        targetName: payload.title,
        detail: {
          channelId: payload.channelId,
          startAt: payload.startAt,
          endAt: payload.endAt,
        },
      });
      return { program };
    } catch (error) {
      if (error instanceof Error && error.message.includes("overlaps")) {
        return reply.status(409).send({ message: error.message });
      }

      const code = getPrismaErrorCode(error);

      if (code === "P2025") {
        return reply.status(404).send({ message: "Manual programme not found" });
      }

      if (code === "P2003") {
        return reply.status(400).send({ message: "Channel is invalid" });
      }

      throw error;
    }
  });

  fastify.delete("/epg/programs/manual/:id", { preHandler: [requirePermission("epg:manage")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const existing = await getManualProgramEntry(params.id);
    if (!existing) {
      return reply.status(404).send({ message: "Manual programme not found" });
    }

    await deleteManualProgramEntry(params.id);
    await recordAuditEvent({
      actorUserId: request.authUser?.id,
      actorRole: request.authUser?.role,
      action: "program-entry.manual.delete",
      targetType: "program-entry",
      targetId: params.id,
      targetName: existing.title,
      detail: {
        channelId: existing.channelId,
      },
    });
    return reply.status(204).send();
  });

  fastify.get("/epg/channels/:channelId/guide", { preHandler: [requirePermission("epg:read")] }, async (request, reply) => {
    const params = parseWithSchema(channelIdParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const query = parseWithSchema(epgGuideWindowQuerySchema, request.query, reply);
    if (!query) {
      return;
    }

    if (query.endAt <= query.startAt) {
      return reply.status(400).send({ message: "Guide window end must be after start" });
    }

    const guide = await getResolvedGuideForChannel(params.channelId, query.startAt, query.endAt);
    if (!guide) {
      return reply.status(404).send({ message: "Channel not found" });
    }

    return { guide };
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
