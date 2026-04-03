import { savedLayoutInputSchema } from "@tv-dash/shared";
import type { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../app/auth-guards.js";
import { idParamSchema } from "../../app/request-schemas.js";
import { parseWithSchema } from "../../app/validation.js";
import {
  createUserLayout,
  deleteUserLayout,
  getOwnedLayout,
  listUserLayouts,
  updateUserLayout,
} from "./layout.service.js";

export const layoutRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/layouts", { preHandler: [requirePermission("layouts:manage-own")] }, async (request) => {
    const layouts = await listUserLayouts(request.authUser?.id ?? "");
    return { layouts };
  });

  fastify.post("/layouts", { preHandler: [requirePermission("layouts:manage-own")] }, async (request, reply) => {
    const payload = parseWithSchema(savedLayoutInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    const layout = await createUserLayout(request.authUser?.id ?? "", payload);
    return reply.status(201).send({ layout });
  });

  fastify.put("/layouts/:id", { preHandler: [requirePermission("layouts:manage-own")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const payload = parseWithSchema(savedLayoutInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    const existing = await getOwnedLayout(params.id, request.authUser?.id ?? "");

    if (!existing) {
      return reply.status(404).send({ message: "Layout not found" });
    }

    const layout = await updateUserLayout(params.id, payload);
    return { layout };
  });

  fastify.delete("/layouts/:id", { preHandler: [requirePermission("layouts:manage-own")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const existing = await getOwnedLayout(params.id, request.authUser?.id ?? "");

    if (!existing) {
      return reply.status(404).send({ message: "Layout not found" });
    }

    await deleteUserLayout(params.id);
    return reply.status(204).send();
  });
};
