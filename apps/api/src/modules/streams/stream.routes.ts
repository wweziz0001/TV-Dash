import { streamTestInputSchema } from "@tv-dash/shared";
import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../../app/auth-guards.js";
import { channelIdParamSchema, streamProxyQuerySchema } from "../../app/request-schemas.js";
import { parseWithSchema } from "../../app/validation.js";
import { getChannelProxyAssetResponse, getChannelProxyMasterResponse, inspectStream } from "./stream.service.js";

export const streamRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/streams/channels/:channelId/master", async (request, reply) => {
    const params = parseWithSchema(channelIdParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    try {
      const proxied = await getChannelProxyMasterResponse(params.channelId);

      if (!proxied) {
        return reply.status(404).send({ message: "Channel not found" });
      }

      reply.header("content-type", proxied.contentType);
      reply.header("cache-control", "no-store");
      return reply.send(proxied.body);
    } catch (error) {
      return reply.status(502).send({
        message: error instanceof Error ? error.message : "Unable to proxy stream master playlist",
      });
    }
  });

  fastify.get("/streams/channels/:channelId/asset", async (request, reply) => {
    const params = parseWithSchema(channelIdParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const query = parseWithSchema(streamProxyQuerySchema, request.query, reply);
    if (!query) {
      return;
    }

    try {
      const proxied = await getChannelProxyAssetResponse(params.channelId, query.token);
      reply.header("content-type", proxied.contentType);
      reply.header("cache-control", "no-store");
      return reply.send(proxied.body);
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid or expired proxy token") {
        return reply.status(400).send({ message: error.message });
      }

      if (error instanceof Error && error.message === "Channel not found") {
        return reply.status(404).send({ message: error.message });
      }

      return reply.status(502).send({
        message: error instanceof Error ? error.message : "Unable to proxy stream asset",
      });
    }
  });

  fastify.post("/streams/test", { preHandler: [requireAuth] }, async (request, reply) => {
    const payload = parseWithSchema(streamTestInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    try {
      const result = await inspectStream(payload.url, payload);
      return { result };
    } catch (error) {
      return reply.status(502).send({
        message: error instanceof Error ? error.message : "Stream test failed",
      });
    }
  });

  fastify.get("/streams/metadata", { preHandler: [requireAuth] }, async (request, reply) => {
    const url = (request.query as { url?: string }).url;
    const payload = parseWithSchema(streamTestInputSchema, { url }, reply);
    if (!payload) {
      return;
    }

    try {
      const result = await inspectStream(payload.url);
      return { result };
    } catch (error) {
      return reply.status(502).send({
        message: error instanceof Error ? error.message : "Stream metadata failed",
      });
    }
  });
};
