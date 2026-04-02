import { channelGroupInputSchema } from "@tv-dash/shared";
import type { FastifyPluginAsync } from "fastify";
import { requireAdmin } from "../../app/auth-guards.js";
import { getPrismaErrorCode } from "../../app/prisma-errors.js";
import { idParamSchema } from "../../app/request-schemas.js";
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

    try {
      const group = await createChannelGroup(payload);
      return reply.status(201).send({ group });
    } catch (error) {
      if (getPrismaErrorCode(error) === "P2002") {
        return reply.status(409).send({ message: "Group slug already exists" });
      }

      throw error;
    }
  });

  fastify.put("/groups/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const payload = parseWithSchema(channelGroupInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    try {
      const group = await updateChannelGroup(params.id, payload);
      return { group };
    } catch (error) {
      const prismaCode = getPrismaErrorCode(error);

      if (prismaCode === "P2025") {
        return reply.status(404).send({ message: "Group not found" });
      }

      if (prismaCode === "P2002") {
        return reply.status(409).send({ message: "Group slug already exists" });
      }

      throw error;
    }
  });

  fastify.delete("/groups/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    try {
      await deleteChannelGroup(params.id);
      return reply.status(204).send();
    } catch (error) {
      if (getPrismaErrorCode(error) === "P2025") {
        return reply.status(404).send({ message: "Group not found" });
      }

      throw error;
    }
  });
};
