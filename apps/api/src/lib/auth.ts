import bcrypt from "bcryptjs";
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "./prisma.js";

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ message: "Unauthorized" });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    if (request.user.role !== "ADMIN") {
      return reply.status(403).send({ message: "Admin access required" });
    }
  } catch {
    return reply.status(401).send({ message: "Unauthorized" });
  }
}

export async function getAuthenticatedUser(request: FastifyRequest) {
  if (!request.user?.sub) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: request.user.sub },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}
