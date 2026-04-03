import { favoriteInputSchema } from "@tv-dash/shared";
import type { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../app/auth-guards.js";
import { channelIdParamSchema } from "../../app/request-schemas.js";
import { parseWithSchema } from "../../app/validation.js";
import { listUserFavorites, removeFavorite, saveFavorite } from "./favorite.service.js";

export const favoriteRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/favorites", { preHandler: [requirePermission("favorites:manage-own")] }, async (request) => {
    const favorites = await listUserFavorites(request.authUser?.id ?? "");
    return { favorites };
  });

  fastify.post("/favorites", { preHandler: [requirePermission("favorites:manage-own")] }, async (request, reply) => {
    const payload = parseWithSchema(favoriteInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    const favorite = await saveFavorite(request.authUser?.id ?? "", payload.channelId);
    return reply.status(201).send({ favorite });
  });

  fastify.delete("/favorites/:channelId", { preHandler: [requirePermission("favorites:manage-own")] }, async (request, reply) => {
    const params = parseWithSchema(channelIdParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    await removeFavorite(request.authUser?.id ?? "", params.channelId);
    return reply.status(204).send();
  });
};
