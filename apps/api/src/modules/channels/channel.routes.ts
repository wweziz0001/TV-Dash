import { channelInputSchema, channelSortOrderInputSchema } from "@tv-dash/shared";
import type { FastifyPluginAsync } from "fastify";
import { requireAdmin } from "../../app/auth-guards.js";
import { getPrismaErrorCode } from "../../app/prisma-errors.js";
import { channelListQuerySchema, idParamSchema, slugParamSchema } from "../../app/request-schemas.js";
import { parseWithSchema } from "../../app/validation.js";
import {
  createChannelRecord,
  deleteChannelRecord,
  getChannelById,
  getChannelConfigForAdmin,
  getChannelBySlug,
  listChannelCatalog,
  updateChannelSortOrderRecord,
  updateChannelRecord,
} from "./channel.service.js";

export const channelRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/channels", async (request, reply) => {
    const query = parseWithSchema(channelListQuerySchema, request.query, reply);
    if (!query) {
      return;
    }

    const channels = await listChannelCatalog(query);
    return { channels };
  });

  fastify.get("/channels/:id", async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const channel = await getChannelById(params.id);

    if (!channel) {
      return reply.status(404).send({ message: "Channel not found" });
    }

    return { channel };
  });

  fastify.get("/channels/:id/config", { preHandler: [requireAdmin] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const channel = await getChannelConfigForAdmin(params.id);

    if (!channel) {
      return reply.status(404).send({ message: "Channel not found" });
    }

    return { channel };
  });

  fastify.get("/channels/slug/:slug", async (request, reply) => {
    const params = parseWithSchema(slugParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const channel = await getChannelBySlug(params.slug);

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

    try {
      const channel = await createChannelRecord(payload);
      return reply.status(201).send({ channel });
    } catch (error) {
      const prismaCode = getPrismaErrorCode(error);

      if (prismaCode === "P2002") {
        return reply.status(409).send({ message: "Channel slug already exists" });
      }

      if (prismaCode === "P2003") {
        return reply.status(400).send({ message: "Group or EPG source is invalid" });
      }

      throw error;
    }
  });

  fastify.put("/channels/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const payload = parseWithSchema(channelInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    try {
      const channel = await updateChannelRecord(params.id, payload);
      return { channel };
    } catch (error) {
      const prismaCode = getPrismaErrorCode(error);

      if (prismaCode === "P2025") {
        return reply.status(404).send({ message: "Channel not found" });
      }

      if (prismaCode === "P2002") {
        return reply.status(409).send({ message: "Channel slug already exists" });
      }

      if (prismaCode === "P2003") {
        return reply.status(400).send({ message: "Group or EPG source is invalid" });
      }

      throw error;
    }
  });

  fastify.put("/channels/:id/sort-order", { preHandler: [requireAdmin] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const payload = parseWithSchema(channelSortOrderInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    try {
      const channel = await updateChannelSortOrderRecord(params.id, payload.sortOrder);
      return { channel };
    } catch (error) {
      if (getPrismaErrorCode(error) === "P2025") {
        return reply.status(404).send({ message: "Channel not found" });
      }

      throw error;
    }
  });

  fastify.delete("/channels/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    try {
      await deleteChannelRecord(params.id);
      return reply.status(204).send();
    } catch (error) {
      if (getPrismaErrorCode(error) === "P2025") {
        return reply.status(404).send({ message: "Channel not found" });
      }

      throw error;
    }
  });
};
