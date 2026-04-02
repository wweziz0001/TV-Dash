import { favoriteInputSchema } from "@tv-dash/shared";
import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../lib/auth.js";
import { parseWithSchema } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

export const favoriteRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/favorites", { preHandler: [requireAuth] }, async (request) => {
    const favorites = await prisma.favorite.findMany({
      where: { userId: request.user.sub },
      include: {
        channel: {
          include: {
            group: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return { favorites };
  });

  fastify.post("/favorites", { preHandler: [requireAuth] }, async (request, reply) => {
    const payload = parseWithSchema(favoriteInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    const favorite = await prisma.favorite.upsert({
      where: {
        userId_channelId: {
          userId: request.user.sub,
          channelId: payload.channelId,
        },
      },
      update: {},
      create: {
        userId: request.user.sub,
        channelId: payload.channelId,
      },
      include: {
        channel: {
          include: {
            group: true,
          },
        },
      },
    });

    return reply.status(201).send({ favorite });
  });

  fastify.delete("/favorites/:channelId", { preHandler: [requireAuth] }, async (request, reply) => {
    const channelId = (request.params as { channelId: string }).channelId;

    await prisma.favorite.deleteMany({
      where: {
        userId: request.user.sub,
        channelId,
      },
    });

    return reply.status(204).send();
  });
};

