import { roleHasPermission, type AccessPermission } from "@tv-dash/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { writeStructuredLog } from "./structured-log.js";
import { getVerifiedSessionUser } from "../modules/auth/auth.service.js";

function sendUnauthorized(reply: FastifyReply) {
  return reply.status(401).send({ message: "Unauthorized" });
}

async function authenticateRequest(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return sendUnauthorized(reply);
  }

  const tokenClaims = request.user;

  if (!tokenClaims?.sub) {
    return sendUnauthorized(reply);
  }

  if (typeof tokenClaims.sessionVersion !== "number") {
    return sendUnauthorized(reply);
  }

  const user = await getVerifiedSessionUser(tokenClaims.sub, tokenClaims.sessionVersion);

  if (!user) {
    writeStructuredLog("warn", {
      event: "auth.session.rejected",
      actorUserId: tokenClaims.sub,
      detail: {
        reason: "missing-or-invalid-session",
      },
    });
    return sendUnauthorized(reply);
  }

  request.authUser = user;
  return null;
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  return authenticateRequest(request, reply);
}

export function requirePermission(permission: AccessPermission) {
  return async function permissionGuard(request: FastifyRequest, reply: FastifyReply) {
    const unauthorizedResponse = await authenticateRequest(request, reply);

    if (unauthorizedResponse) {
      return unauthorizedResponse;
    }

    if (!request.authUser || !roleHasPermission(request.authUser.role, permission)) {
      return reply.status(403).send({ message: "Forbidden" });
    }

    return null;
  };
}

export const requireAdmin = requirePermission("admin:access");
