import bcrypt from "bcryptjs";
import { findAuthenticatedUser, findUserByEmail, invalidateUserSessions } from "./auth.repository.js";

export async function verifyLoginCredentials(email: string, password: string) {
  const user = await findUserByEmail(email.toLowerCase());

  if (!user) {
    return null;
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  return isValid ? user : null;
}

export async function getCurrentUser(userId?: string) {
  if (!userId) {
    return null;
  }

  return findAuthenticatedUser(userId);
}

export async function getVerifiedSessionUser(userId?: string, sessionVersion?: number) {
  if (!userId || typeof sessionVersion !== "number") {
    return null;
  }

  const user = await findAuthenticatedUser(userId);

  if (!user) {
    return null;
  }

  if (user.sessionVersion !== sessionVersion) {
    return null;
  }

  return user;
}

export async function revokeCurrentUserSessions(userId?: string) {
  if (!userId) {
    return null;
  }

  return invalidateUserSessions(userId);
}
