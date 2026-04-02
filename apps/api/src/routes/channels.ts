import { channelInputSchema } from "@tv-dash/shared";
import type { FastifyPluginAsync } from "fastify";
import { parseWithSchema } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../lib/auth.js";

function mapChannelQuery(searchParams: { search?: string; groupId?: string; active?: string }) {
  const where: Record<string, unknown> = {};

  if (searchParams.search) {
    where.OR = [
      { name: { contains: searchParams.search, mode: "insensitive" } },
      { slug: { contains: searchParams.search, mode: "insensitive" } },
    ];
  }

  if (searchParams.groupId) {
    where.groupId = searchParams.groupId;
  }

  if (searchParams.active === "true") {
    where.isActive = true;
  }

  if (searchParams.active === "false") {
    where.isActive = false;
  }

  return where;
}

export const channelRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/channels", async (request) => {
    const channels = await prisma.channel.findMany({
      where: mapChannelQuery(request.query as { search?: string; groupId?: string; active?: string }),
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        group: true,
      },
    });

    return { channels };
  });

  fastify.get("/channels/:id", async (request, reply) => {
    const channel = await prisma.channel.findUnique({
      where: { id: (request.params as { id: string }).id },
      include: { group: true },
    });

    if (!channel) {
      return reply.status(404).send({ message: "Channel not found" });
    }

    return { channel };
  });

  fastify.get("/channels/slug/:slug", async (request, reply) => {
    const channel = await prisma.channel.findUnique({
      where: { slug: (request.params as { slug: string }).slug },
      include: { group: true },
    });

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

    const channel = await prisma.channel.create({
      data: payload,
      include: { group: true },
    });

    return reply.status(201).send({ channel });
  });

  fastify.put("/channels/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const payload = parseWithSchema(channelInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    const channel = await prisma.channel.update({
      where: { id: (request.params as { id: string }).id },
      data: payload,
      include: { group: true },
    });

    return { channel };
  });

  fastify.delete("/channels/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    await prisma.channel.delete({ where: { id } });
    return reply.status(204).send();
  });
};

