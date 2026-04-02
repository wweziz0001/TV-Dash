import { streamTestInputSchema } from "@tv-dash/shared";
import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../lib/auth.js";
import { parseWithSchema } from "../lib/http.js";
import { inspectStream } from "../lib/stream.js";

export const streamRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/streams/test", { preHandler: [requireAuth] }, async (request, reply) => {
    const payload = parseWithSchema(streamTestInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    try {
      const result = await inspectStream(payload.url);
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

