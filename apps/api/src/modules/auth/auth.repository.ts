import { prisma } from "../../db/prisma.js";

const userSelection = {
  id: true,
  email: true,
  username: true,
  role: true,
  sessionVersion: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
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
