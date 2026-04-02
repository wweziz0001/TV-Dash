import { savedLayoutInputSchema } from "@tv-dash/shared";
import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../lib/auth.js";
import { parseWithSchema } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

export const layoutRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/layouts", { preHandler: [requireAuth] }, async (request) => {
    const layouts = await prisma.savedLayout.findMany({
      where: { userId: request.user.sub },
      include: {
        items: {
          include: {
            channel: {
              include: {
                group: true,
              },
            },
          },
          orderBy: {
            tileIndex: "asc",
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return { layouts };
  });

  fastify.post("/layouts", { preHandler: [requireAuth] }, async (request, reply) => {
    const payload = parseWithSchema(savedLayoutInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    const layout = await prisma.savedLayout.create({
      data: {
        userId: request.user.sub,
        name: payload.name,
        layoutType: payload.layoutType,
        configJson: payload.configJson,
        items: {
          create: payload.items.map((item: (typeof payload.items)[number]) => ({
            tileIndex: item.tileIndex,
            channelId: item.channelId,
            preferredQuality: item.preferredQuality,
            isMuted: item.isMuted,
          })),
        },
      },
      include: {
        items: {
          include: {
            channel: true,
          },
        },
      },
    });

    return reply.status(201).send({ layout });
  });

  fastify.put("/layouts/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const payload = parseWithSchema(savedLayoutInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    const id = (request.params as { id: string }).id;
    const existing = await prisma.savedLayout.findFirst({
      where: {
        id,
        userId: request.user.sub,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return reply.status(404).send({ message: "Layout not found" });
    }

    const layout = await prisma.savedLayout.update({
      where: { id },
      data: {
        name: payload.name,
        layoutType: payload.layoutType,
        configJson: payload.configJson,
        items: {
          deleteMany: {},
          create: payload.items.map((item: (typeof payload.items)[number]) => ({
            tileIndex: item.tileIndex,
            channelId: item.channelId,
            preferredQuality: item.preferredQuality,
            isMuted: item.isMuted,
          })),
        },
      },
      include: {
        items: {
          include: {
            channel: true,
          },
          orderBy: {
            tileIndex: "asc",
          },
        },
      },
    });

    return { layout };
  });

  fastify.delete("/layouts/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const existing = await prisma.savedLayout.findFirst({
      where: {
        id,
        userId: request.user.sub,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return reply.status(404).send({ message: "Layout not found" });
    }

    await prisma.savedLayout.delete({
      where: { id },
    });
    return reply.status(204).send();
  });
};
