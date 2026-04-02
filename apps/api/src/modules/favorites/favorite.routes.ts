import { favoriteInputSchema } from "@tv-dash/shared";
import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../../app/auth-guards.js";
import { parseWithSchema } from "../../app/validation.js";
import { listUserFavorites, removeFavorite, saveFavorite } from "./favorite.service.js";

export const favoriteRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/favorites", { preHandler: [requireAuth] }, async (request) => {
    const favorites = await listUserFavorites(request.user.sub);
    return { favorites };
  });

  fastify.post("/favorites", { preHandler: [requireAuth] }, async (request, reply) => {
    const payload = parseWithSchema(favoriteInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    const favorite = await saveFavorite(request.user.sub, payload.channelId);
    return reply.status(201).send({ favorite });
  });

  fastify.delete("/favorites/:channelId", { preHandler: [requireAuth] }, async (request, reply) => {
    await removeFavorite(request.user.sub, (request.params as { channelId: string }).channelId);
    return reply.status(204).send();
  });
};
