import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../../config/env.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: {
      sub: string;
      email: string;
      role: "ADMIN" | "USER";
      sessionVersion: number;
    };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }

  interface FastifyRequest {
    authUser?: {
      id: string;
      email: string;
      username: string;
      role: "ADMIN" | "USER";
      sessionVersion: number;
      createdAt: Date;
      updatedAt: Date;
    };
  }
}

export const authPlugin = fp(async (fastify) => {
  await fastify.register(fastifyJwt, {
    secret: env.JWT_SECRET,
  });

  fastify.decorate("authenticate", async function authenticate(request, reply) {
    await request.jwtVerify();
  });
});
