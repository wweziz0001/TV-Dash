import bcrypt from "bcryptjs";
import { findAuthenticatedUser, findUserByEmail } from "./auth.repository.js";

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
