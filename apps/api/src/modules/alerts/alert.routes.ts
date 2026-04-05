import type { FastifyPluginAsync } from "fastify";
import { requirePermission } from "../../app/auth-guards.js";
import { alertListQuerySchema, idParamSchema } from "../../app/request-schemas.js";
import { parseWithSchema } from "../../app/validation.js";
import { recordAuditEvent } from "../audit/audit.service.js";
import {
  acknowledgeOperationalAlert,
  dismissOperationalAlert,
  getOperationalAlertSummary,
  listOperationalAlerts,
  resolveOperationalAlert,
} from "./alert.service.js";

export const alertRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/alerts/summary", { preHandler: [requirePermission("diagnostics:read")] }, async () => {
    return {
      summary: await getOperationalAlertSummary(),
    };
  });

  fastify.get("/alerts", { preHandler: [requirePermission("diagnostics:read")] }, async (request, reply) => {
    const query = parseWithSchema(alertListQuerySchema, request.query, reply);
    if (!query) {
      return;
    }

    return {
      alerts: await listOperationalAlerts(query),
      summary: await getOperationalAlertSummary(),
    };
  });

  fastify.post("/alerts/:id/acknowledge", { preHandler: [requirePermission("diagnostics:read")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const alert = await acknowledgeOperationalAlert(params.id, request.authUser?.id ?? null);

    if (!alert) {
      return reply.status(404).send({ message: "Alert not found" });
    }

    await recordAuditEvent({
      actorUserId: request.authUser?.id ?? null,
      actorRole: request.authUser?.role ?? null,
      action: "alert.acknowledge",
      targetType: "OperationalAlert",
      targetId: alert.id,
      targetName: alert.title,
      detail: {
        status: alert.status,
        severity: alert.severity,
        category: alert.category,
      },
    });

    return { alert };
  });

  fastify.post("/alerts/:id/resolve", { preHandler: [requirePermission("diagnostics:read")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const alert = await resolveOperationalAlert(params.id, request.authUser?.id ?? null);

    if (!alert) {
      return reply.status(404).send({ message: "Alert not found" });
    }

    await recordAuditEvent({
      actorUserId: request.authUser?.id ?? null,
      actorRole: request.authUser?.role ?? null,
      action: "alert.resolve",
      targetType: "OperationalAlert",
      targetId: alert.id,
      targetName: alert.title,
      detail: {
        status: alert.status,
        severity: alert.severity,
        category: alert.category,
      },
    });

    return { alert };
  });

  fastify.post("/alerts/:id/dismiss", { preHandler: [requirePermission("diagnostics:read")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const alert = await dismissOperationalAlert(params.id, request.authUser?.id ?? null);

    if (!alert) {
      return reply.status(404).send({ message: "Alert not found" });
    }

    await recordAuditEvent({
      actorUserId: request.authUser?.id ?? null,
      actorRole: request.authUser?.role ?? null,
      action: "alert.dismiss",
      targetType: "OperationalAlert",
      targetId: alert.id,
      targetName: alert.title,
      detail: {
        status: alert.status,
        severity: alert.severity,
        category: alert.category,
      },
    });

    return { alert };
  });
};
