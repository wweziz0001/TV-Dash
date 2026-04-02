import { channelGroupInputSchema } from "@tv-dash/shared";
import type { FastifyPluginAsync } from "fastify";
import { requireAdmin } from "../../app/auth-guards.js";
import { parseWithSchema } from "../../app/validation.js";
import {
  createChannelGroup,
  deleteChannelGroup,
  listChannelGroups,
  updateChannelGroup,
} from "./group.service.js";

export const groupRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/groups", async () => {
    const groups = await listChannelGroups();
    return { groups };
  });

  fastify.post("/groups", { preHandler: [requireAdmin] }, async (request, reply) => {
    const payload = parseWithSchema(channelGroupInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    const group = await createChannelGroup(payload);
    return reply.status(201).send({ group });
  });

  fastify.put("/groups/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const payload = parseWithSchema(channelGroupInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    const group = await updateChannelGroup((request.params as { id: string }).id, payload);
    return { group };
  });

  fastify.delete("/groups/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    await deleteChannelGroup((request.params as { id: string }).id);
    return reply.status(204).send();
  });
};
