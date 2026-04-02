import { savedLayoutInputSchema } from "@tv-dash/shared";
import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../../app/auth-guards.js";
import { parseWithSchema } from "../../app/validation.js";
import {
  createUserLayout,
  deleteUserLayout,
  getOwnedLayout,
  listUserLayouts,
  updateUserLayout,
} from "./layout.service.js";

export const layoutRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/layouts", { preHandler: [requireAuth] }, async (request) => {
    const layouts = await listUserLayouts(request.user.sub);
    return { layouts };
  });

  fastify.post("/layouts", { preHandler: [requireAuth] }, async (request, reply) => {
    const payload = parseWithSchema(savedLayoutInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    const layout = await createUserLayout(request.user.sub, payload);
    return reply.status(201).send({ layout });
  });

  fastify.put("/layouts/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const payload = parseWithSchema(savedLayoutInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    const id = (request.params as { id: string }).id;
    const existing = await getOwnedLayout(id, request.user.sub);

    if (!existing) {
      return reply.status(404).send({ message: "Layout not found" });
    }

    const layout = await updateUserLayout(id, payload);
    return { layout };
  });

  fastify.delete("/layouts/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const existing = await getOwnedLayout(id, request.user.sub);

    if (!existing) {
      return reply.status(404).send({ message: "Layout not found" });
    }

    await deleteUserLayout(id);
    return reply.status(204).send();
  });
};
