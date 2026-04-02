import { channelGroupInputSchema } from "@tv-dash/shared";
import type { FastifyPluginAsync } from "fastify";
import { parseWithSchema } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";

export const groupRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/groups", async () => {
    const groups = await prisma.channelGroup.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        _count: {
          select: {
            channels: true,
          },
        },
      },
    });

    return { groups };
  });

  fastify.post("/groups", { preHandler: [requireAdmin] }, async (request, reply) => {
    const payload = parseWithSchema(channelGroupInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    const group = await prisma.channelGroup.create({
      data: payload,
    });

    return reply.status(201).send({ group });
  });

  fastify.put("/groups/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const payload = parseWithSchema(channelGroupInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    const group = await prisma.channelGroup.update({
      where: { id: (request.params as { id: string }).id },
      data: payload,
    });

    return { group };
  });

  fastify.delete("/groups/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    await prisma.channelGroup.delete({ where: { id } });
    return reply.status(204).send();
  });
};

