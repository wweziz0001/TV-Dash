import { prisma } from "../../db/prisma.js";

const userSelection = {
  id: true,
  email: true,
  username: true,
  role: true,
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
