import { loginInputSchema } from "@tv-dash/shared";
import type { FastifyPluginAsync } from "fastify";
import { summarizeEmailAddress, writeStructuredLog } from "../../app/structured-log.js";
import { parseWithSchema } from "../../app/validation.js";
import { getCurrentUser, verifyLoginCredentials } from "./auth.service.js";

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
    });

    writeStructuredLog("info", {
      event: "auth.login.succeeded",
      actorUserId: user.id,
      detail: {
        role: user.role,
        requestIp: request.ip,
      },
    });

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

  fastify.get("/auth/me", { preHandler: [fastify.authenticate] }, async (request) => {
    const user = await getCurrentUser(request.user?.sub);

    if (!user && request.user?.sub) {
      writeStructuredLog("warn", {
        event: "auth.me.user-missing",
        actorUserId: request.user.sub,
      });
    }

    return { user };
  });
};
