import { loginInputSchema } from "@tv-dash/shared";
import type { FastifyPluginAsync } from "fastify";
import { getAuthenticatedUser, verifyPassword } from "../lib/auth.js";
import { parseWithSchema } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/auth/login", async (request, reply) => {
    const payload = parseWithSchema(loginInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email: payload.email.toLowerCase() },
    });

    if (!user || !(await verifyPassword(payload.password, user.passwordHash))) {
      return reply.status(401).send({ message: "Invalid credentials" });
    }

    const token = await reply.jwtSign({
      sub: user.id,
      email: user.email,
      role: user.role,
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
    const user = await getAuthenticatedUser(request);
    return { user };
  });
};

