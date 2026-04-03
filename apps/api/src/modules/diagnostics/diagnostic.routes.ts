import { playbackSessionEndInputSchema, playbackSessionHeartbeatInputSchema } from "@tv-dash/shared";
import type { FastifyPluginAsync } from "fastify";
import { requireAdmin, requireAuth } from "../../app/auth-guards.js";
import { channelIdParamSchema, idParamSchema, monitoringLogsQuerySchema } from "../../app/request-schemas.js";
import { parseWithSchema } from "../../app/validation.js";
import { getChannelConfigForAdmin } from "../channels/channel.service.js";
import { getEpgSource } from "../epg/epg.service.js";
import { buildChannelDiagnosticsSnapshot, buildEpgSourceDiagnosticsSnapshot } from "./diagnostic.service.js";
import { buildAdminMonitoringSnapshot, listAdminMonitoringLogs } from "./monitoring.service.js";
import { endPlaybackSessionsForUser, recordPlaybackSessionHeartbeat } from "./playback-session.service.js";

export const diagnosticRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/diagnostics/channels/:channelId", { preHandler: [requireAdmin] }, async (request, reply) => {
    const params = parseWithSchema(channelIdParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const channel = await getChannelConfigForAdmin(params.channelId);

    if (!channel) {
      return reply.status(404).send({ message: "Channel not found" });
    }

    return {
      diagnostics: buildChannelDiagnosticsSnapshot(channel),
    };
  });

  fastify.get("/diagnostics/epg-sources/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const source = await getEpgSource(params.id);

    if (!source) {
      return reply.status(404).send({ message: "EPG source not found" });
    }

    return {
      diagnostics: buildEpgSourceDiagnosticsSnapshot(source),
    };
  });

  fastify.get("/diagnostics/monitoring", { preHandler: [requireAdmin] }, async () => {
    return {
      monitoring: await buildAdminMonitoringSnapshot(),
    };
  });

  fastify.get("/diagnostics/logs", { preHandler: [requireAdmin] }, async (request, reply) => {
    const query = parseWithSchema(monitoringLogsQuerySchema, request.query, reply);
    if (!query) {
      return;
    }

    return {
      logs: listAdminMonitoringLogs(query),
    };
  });

  fastify.post("/diagnostics/playback-sessions/heartbeat", { preHandler: [requireAuth] }, async (request, reply) => {
    const payload = parseWithSchema(playbackSessionHeartbeatInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    try {
      await recordPlaybackSessionHeartbeat(request.user.sub, payload);
      return reply.status(204).send();
    } catch (error) {
      if (error instanceof Error && error.message === "Playback session ownership mismatch") {
        return reply.status(403).send({ message: "Playback session ownership mismatch" });
      }

      throw error;
    }
  });

  fastify.post("/diagnostics/playback-sessions/end", { preHandler: [requireAuth] }, async (request, reply) => {
    const payload = parseWithSchema(playbackSessionEndInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    await endPlaybackSessionsForUser(request.user.sub, payload);
    return reply.status(204).send();
  });
};
