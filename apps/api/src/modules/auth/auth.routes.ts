import { loginInputSchema } from "@tv-dash/shared";
import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../../app/auth-guards.js";
import { summarizeEmailAddress, writeStructuredLog } from "../../app/structured-log.js";
import { parseWithSchema } from "../../app/validation.js";
import { recordAuditEvent } from "../audit/audit.service.js";
import { getCurrentUser, revokeCurrentUserSessions, verifyLoginCredentials } from "./auth.service.js";

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/auth/login", async (request, reply) => {
    const payload = parseWithSchema(loginInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    const user = await verifyLoginCredentials(payload.email, payload.password);
    if (!user) {
      writeStructuredLog("warn", {
        event: "auth.login.failed",
        detail: {
          requestIp: request.ip,
          ...summarizeEmailAddress(payload.email),
        },
      });
      return reply.status(401).send({ message: "Invalid credentials" });
    }

    const token = await reply.jwtSign({
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionVersion: user.sessionVersion,
    }, {
      expiresIn: "12h",
    });

    writeStructuredLog("info", {
      event: "auth.login.succeeded",
      actorUserId: user.id,
      detail: {
        role: user.role,
        requestIp: request.ip,
      },
    });

    if (user.role === "ADMIN") {
      await recordAuditEvent({
        actorUserId: user.id,
        actorRole: user.role,
        action: "auth.login",
        targetType: "session",
        targetId: user.id,
        targetName: user.username,
        detail: {
          role: user.role,
        },
      });
    }

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    };
  });

  fastify.get("/auth/me", { preHandler: [requireAuth] }, async (request) => {
    const user = await getCurrentUser(request.authUser?.id);

    if (!user && request.authUser?.id) {
      writeStructuredLog("warn", {
        event: "auth.me.user-missing",
        actorUserId: request.authUser.id,
      });
    }

    return { user };
  });

  fastify.post("/auth/logout", { preHandler: [requireAuth] }, async (request, reply) => {
    const user = await revokeCurrentUserSessions(request.authUser?.id);

    if (user) {
      if (user.role === "ADMIN") {
        await recordAuditEvent({
          actorUserId: user.id,
          actorRole: user.role,
          action: "auth.logout",
          targetType: "session",
          targetId: user.id,
          targetName: user.username,
          detail: {
            role: user.role,
            revokedSessionVersion: user.sessionVersion,
          },
        });
      }

      writeStructuredLog("info", {
        event: "auth.logout.succeeded",
        actorUserId: user.id,
        detail: {
          role: user.role,
        },
      });
    }

    return reply.status(204).send();
  });
};
