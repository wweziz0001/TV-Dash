import { streamTestInputSchema } from "@tv-dash/shared";
import type { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../app/auth-guards.js";
import {
  channelIdParamSchema,
  channelTimeshiftAssetParamSchema,
  channelTimeshiftVariantParamSchema,
  streamMasterQuerySchema,
  streamProxyQuerySchema,
} from "../../app/request-schemas.js";
import { parseWithSchema } from "../../app/validation.js";
import { classifyStreamFailure } from "./stream-diagnostics.js";
import { getChannelProxyAssetResponse, getChannelProxyMasterResponse, inspectStream } from "./stream.service.js";
import {
  getChannelTimeshiftAssetResponse,
  getChannelTimeshiftMasterResponse,
  getChannelTimeshiftStatus,
  getChannelTimeshiftVariantResponse,
} from "./timeshift-buffer.js";

export const streamRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/streams/channels/:channelId/master", async (request, reply) => {
    const params = parseWithSchema(channelIdParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const query = parseWithSchema(streamMasterQuerySchema, request.query, reply);
    if (!query) {
      return;
    }

    try {
      const proxied = await getChannelProxyMasterResponse(params.channelId, {
        intent: query.intent,
      });

      if (!proxied) {
        return reply.status(404).send({ message: "Channel not found" });
      }

      reply.header("content-type", proxied.contentType);
      reply.header("cache-control", "no-store");
      return reply.send(proxied.body);
    } catch (error) {
      const classification = classifyStreamFailure(error, { operation: "proxy-master" });
      const statusCode =
        classification.statusCode === 404
          ? 404
          : classification.statusCode === 400
            ? 400
            : 502;
      return reply.status(statusCode).send({
        message: classification.message,
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
      const classification = classifyStreamFailure(error, { operation: "proxy-asset" });
      const statusCode =
        classification.statusCode === 404
          ? 404
          : classification.statusCode === 400
            ? 400
            : 502;

      return reply.status(statusCode).send({
        message: classification.message,
      });
    }
  });

  fastify.get("/streams/channels/:channelId/timeshift/status", async (request, reply) => {
    const params = parseWithSchema(channelIdParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    try {
      const status = await getChannelTimeshiftStatus(params.channelId);
      return { status };
    } catch (error) {
      const classification = classifyStreamFailure(error, { operation: "timeshift" });
      return reply.status(classification.statusCode === 404 ? 404 : 502).send({
        message: classification.message,
      });
    }
  });

  fastify.get("/streams/channels/:channelId/timeshift/master", async (request, reply) => {
    const params = parseWithSchema(channelIdParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    try {
      const proxied = await getChannelTimeshiftMasterResponse(params.channelId);
      reply.header("content-type", proxied.contentType);
      reply.header("cache-control", "no-store");
      return reply.send(proxied.body);
    } catch (error) {
      const classification = classifyStreamFailure(error, { operation: "timeshift" });
      const statusCode =
        classification.statusCode === 404
          ? 404
          : classification.statusCode === 400
            ? 400
            : 502;
      return reply.status(statusCode).send({
        message: classification.message,
      });
    }
  });

  fastify.get("/streams/channels/:channelId/timeshift/variants/:variantId/index.m3u8", async (request, reply) => {
    const params = parseWithSchema(channelTimeshiftVariantParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    try {
      const proxied = await getChannelTimeshiftVariantResponse(params.channelId, params.variantId);
      reply.header("content-type", proxied.contentType);
      reply.header("cache-control", "no-store");
      return reply.send(proxied.body);
    } catch (error) {
      const classification = classifyStreamFailure(error, { operation: "timeshift" });
      const statusCode =
        classification.statusCode === 404
          ? 404
          : classification.statusCode === 400
            ? 400
            : 502;
      return reply.status(statusCode).send({
        message: classification.message,
      });
    }
  });

  fastify.get("/streams/channels/:channelId/timeshift/assets/:assetId", async (request, reply) => {
    const params = parseWithSchema(channelTimeshiftAssetParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    try {
      const proxied = await getChannelTimeshiftAssetResponse(params.channelId, params.assetId);
      reply.header("content-type", proxied.contentType);
      reply.header("cache-control", "no-store");
      return reply.send(proxied.body);
    } catch (error) {
      const classification = classifyStreamFailure(error, { operation: "timeshift" });
      const statusCode =
        classification.statusCode === 404
          ? 404
          : classification.statusCode === 400
            ? 400
            : 502;
      return reply.status(statusCode).send({
        message: classification.message,
      });
    }
  });

  fastify.post("/streams/test", { preHandler: [requirePermission("streams:inspect")] }, async (request, reply) => {
    const payload = parseWithSchema(streamTestInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    try {
      const result = await inspectStream(payload.url, payload);
      return { result };
    } catch (error) {
      const classification = classifyStreamFailure(error, { operation: "stream-inspection" });
      return reply.status(502).send({
        message: classification.message,
      });
    }
  });

  fastify.get("/streams/metadata", { preHandler: [requirePermission("streams:inspect")] }, async (request, reply) => {
    const url = (request.query as { url?: string }).url;
    const payload = parseWithSchema(streamTestInputSchema, { url }, reply);
    if (!payload) {
      return;
    }

    try {
      const result = await inspectStream(payload.url);
      return { result };
    } catch (error) {
      const classification = classifyStreamFailure(error, { operation: "stream-inspection" });
      return reply.status(502).send({
        message: classification.message,
      });
    }
  });
};
