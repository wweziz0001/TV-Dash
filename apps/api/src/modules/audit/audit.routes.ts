import type { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../app/auth-guards.js";
import { auditEventsQuerySchema } from "../../app/request-schemas.js";
import { parseWithSchema } from "../../app/validation.js";
import { listAuditEvents } from "./audit.service.js";

export const auditRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/audit/events", { preHandler: [requirePermission("audit:read")] }, async (request, reply) => {
    const query = parseWithSchema(auditEventsQuerySchema, request.query, reply);
    if (!query) {
      return;
    }

    return {
      events: await listAuditEvents(query),
    };
  });
};
