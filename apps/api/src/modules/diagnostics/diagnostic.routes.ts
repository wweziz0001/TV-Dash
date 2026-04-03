import type { FastifyPluginAsync } from "fastify";
import { requireAdmin } from "../../app/auth-guards.js";
import { channelIdParamSchema, idParamSchema } from "../../app/request-schemas.js";
import { parseWithSchema } from "../../app/validation.js";
import { getChannelConfigForAdmin } from "../channels/channel.service.js";
import { getEpgSource } from "../epg/epg.service.js";
import { buildChannelDiagnosticsSnapshot, buildEpgSourceDiagnosticsSnapshot } from "./diagnostic.service.js";

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
};
