import { channelInputSchema } from "@tv-dash/shared";
import type { FastifyPluginAsync } from "fastify";
import { requireAdmin } from "../../app/auth-guards.js";
import { parseWithSchema } from "../../app/validation.js";
import {
  createChannelRecord,
  deleteChannelRecord,
  getChannelById,
  getChannelBySlug,
  listChannelCatalog,
  updateChannelRecord,
} from "./channel.service.js";

export const channelRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/channels", async (request) => {
    const channels = await listChannelCatalog(request.query as { search?: string; groupId?: string; active?: string });
    return { channels };
  });

  fastify.get("/channels/:id", async (request, reply) => {
    const channel = await getChannelById((request.params as { id: string }).id);

    if (!channel) {
      return reply.status(404).send({ message: "Channel not found" });
    }

    return { channel };
  });

  fastify.get("/channels/slug/:slug", async (request, reply) => {
    const channel = await getChannelBySlug((request.params as { slug: string }).slug);

    if (!channel) {
      return reply.status(404).send({ message: "Channel not found" });
    }

    return { channel };
  });

  fastify.post("/channels", { preHandler: [requireAdmin] }, async (request, reply) => {
    const payload = parseWithSchema(channelInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    const channel = await createChannelRecord(payload);
    return reply.status(201).send({ channel });
  });

  fastify.put("/channels/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const payload = parseWithSchema(channelInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    const channel = await updateChannelRecord((request.params as { id: string }).id, payload);
    return { channel };
  });

  fastify.delete("/channels/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    await deleteChannelRecord((request.params as { id: string }).id);
    return reply.status(204).send();
  });
};
