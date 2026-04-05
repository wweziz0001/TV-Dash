import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

type PrismaClientLike = Prisma.TransactionClient | typeof prisma;

export const userSelection = {
  id: true,
  email: true,
  username: true,
  role: true,
  sessionVersion: true,
  createdAt: true,
  updatedAt: true,
} as const;

function getClient(client?: PrismaClientLike) {
  return client ?? prisma;
}

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
  });
}

export function findUserByUsername(username: string) {
  return prisma.user.findUnique({
    where: { username },
  });
}

export function findAuthenticatedUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: userSelection,
  });
}

export function invalidateUserSessions(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      sessionVersion: {
        increment: 1,
      },
    },
    select: userSelection,
  });
}

export function createUser(
  data: {
    email: string;
    username: string;
    passwordHash?: string | null;
    role: "ADMIN" | "USER";
  },
  client?: PrismaClientLike,
) {
  return getClient(client).user.create({
    data,
    select: userSelection,
  });
}
