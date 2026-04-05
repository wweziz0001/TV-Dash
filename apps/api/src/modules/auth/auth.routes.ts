import { ldapLoginInputSchema, loginInputSchema, oidcStartQuerySchema } from "@tv-dash/shared";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { requireAuth } from "../../app/auth-guards.js";
import { summarizeEmailAddress, writeStructuredLog } from "../../app/structured-log.js";
import { parseWithSchema } from "../../app/validation.js";
import { env } from "../../config/env.js";
import { recordAuditEvent } from "../audit/audit.service.js";
import {
  authenticateLdapCredentials,
  buildOidcLogoutRedirect,
  buildSessionClaims,
  finishOidcLogin,
  getCurrentUser,
  getPublicAuthProviderOptions,
  getSessionInfoFromClaims,
  logEnterpriseAuthFailure,
  logEnterpriseAuthSuccess,
  revokeCurrentUserSessions,
  startOidcLogin,
  verifyLoginCredentials,
  type AuthenticatedSessionResult,
} from "./auth.service.js";

const OIDC_STATE_COOKIE = "tvdash_oidc_state";
const OIDC_RESULT_COOKIE = "tvdash_oidc_result";

interface OidcStateCookiePayload {
  state: string;
  nonce: string;
  codeVerifier: string;
  nextPath: string;
}

interface OidcResultCookiePayload {
  token: string;
  user: {
    id: string;
    email: string;
    username: string;
    role: "ADMIN" | "USER";
  };
  session: AuthenticatedSessionResult["session"];
  nextPath: string;
}

function getApiOrigin(request: FastifyRequest) {
  const forwardedProtoHeader = request.headers["x-forwarded-proto"];
  const forwardedProto = Array.isArray(forwardedProtoHeader) ? forwardedProtoHeader[0] : forwardedProtoHeader;
  const protocol = forwardedProto?.split(",")[0]?.trim() || request.protocol;

  return `${protocol}://${request.headers.host}`;
}

function getClientOrigin(request: FastifyRequest) {
  const originHeader = request.headers.origin;

  if (typeof originHeader === "string" && originHeader.length > 0) {
    return originHeader.replace(/\/$/, "");
  }

  return env.CLIENT_URL.replace(/\/$/, "");
}

function getOidcCallbackUrl(request: FastifyRequest) {
  return `${getApiOrigin(request)}/api/auth/oidc/callback`;
}

function encodeCookiePayload(payload: object) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeSignedCookiePayload<TPayload>(request: FastifyRequest, cookieName: string) {
  const rawValue = request.cookies[cookieName];

  if (!rawValue) {
    return null;
  }

  const unsigned = request.unsignCookie(rawValue);

  if (!unsigned.valid) {
    return null;
  }

  return JSON.parse(Buffer.from(unsigned.value, "base64url").toString("utf8")) as TPayload;
}

function clearCookie(reply: FastifyReply, cookieName: string) {
  reply.clearCookie(cookieName, {
    path: "/api/auth",
  });
}

function setSignedCookie(reply: FastifyReply, cookieName: string, payload: object, request: FastifyRequest) {
  reply.setCookie(cookieName, encodeCookiePayload(payload), {
    httpOnly: true,
    path: "/api/auth",
    sameSite: "lax",
    secure: getApiOrigin(request).startsWith("https://"),
    signed: true,
    maxAge: 60 * 10,
  });
}

async function buildAuthResponse(reply: FastifyReply, authenticatedSession: AuthenticatedSessionResult) {
  const token = await reply.jwtSign({
    sub: authenticatedSession.user.id,
    email: authenticatedSession.user.email,
    role: authenticatedSession.user.role,
    sessionVersion: authenticatedSession.user.sessionVersion,
    ...buildSessionClaims(authenticatedSession.session),
  }, {
    expiresIn: "12h",
  });

  return {
    token,
    user: {
      id: authenticatedSession.user.id,
      email: authenticatedSession.user.email,
      username: authenticatedSession.user.username,
      role: authenticatedSession.user.role,
    },
    session: authenticatedSession.session,
  };
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/auth/providers/public", async () => {
    const providers = await getPublicAuthProviderOptions();
    return { providers };
  });

  fastify.post("/auth/login", async (request, reply) => {
    const payload = parseWithSchema(loginInputSchema, request.body, reply);

    if (!payload) {
      return;
    }

    const authenticatedSession = await verifyLoginCredentials(payload.email, payload.password);

    if (!authenticatedSession) {
      writeStructuredLog("warn", {
        event: "auth.login.failed",
        detail: {
          requestIp: request.ip,
          ...summarizeEmailAddress(payload.email),
        },
      });
      return reply.status(401).send({ message: "Invalid credentials" });
    }

    const response = await buildAuthResponse(reply, authenticatedSession);

    writeStructuredLog("info", {
      event: "auth.login.succeeded",
      actorUserId: authenticatedSession.user.id,
      detail: {
        role: authenticatedSession.user.role,
        requestIp: request.ip,
      },
    });

    if (authenticatedSession.user.role === "ADMIN") {
      await recordAuditEvent({
        actorUserId: authenticatedSession.user.id,
        actorRole: authenticatedSession.user.role,
        action: "auth.login",
        targetType: "session",
        targetId: authenticatedSession.user.id,
        targetName: authenticatedSession.user.username,
        detail: {
          role: authenticatedSession.user.role,
          providerType: authenticatedSession.session.providerType,
        },
      });
    }

    return response;
  });

  fastify.post("/auth/ldap/login", async (request, reply) => {
    const payload = parseWithSchema(ldapLoginInputSchema, request.body, reply);

    if (!payload) {
      return;
    }

    try {
      const authenticatedSession = await authenticateLdapCredentials(payload);
      const response = await buildAuthResponse(reply, authenticatedSession);

      logEnterpriseAuthSuccess("LDAP", authenticatedSession.user.id, request.ip);

      if (authenticatedSession.user.role === "ADMIN") {
        await recordAuditEvent({
          actorUserId: authenticatedSession.user.id,
          actorRole: authenticatedSession.user.role,
          action: "auth.login",
          targetType: "session",
          targetId: authenticatedSession.user.id,
          targetName: authenticatedSession.user.username,
          detail: {
            role: authenticatedSession.user.role,
            providerType: authenticatedSession.session.providerType,
          },
        });
      }

      return response;
    } catch (error) {
      logEnterpriseAuthFailure("LDAP", request.ip, {
        identifier: payload.identifier,
        message: error instanceof Error ? error.message : "LDAP login failed",
      });
      return reply.status(401).send({
        message: error instanceof Error ? error.message : "LDAP login failed",
      });
    }
  });

  fastify.get("/auth/oidc/start", async (request, reply) => {
    const query = parseWithSchema(oidcStartQuerySchema, request.query, reply);

    if (!query) {
      return;
    }

    try {
      const startedLogin = await startOidcLogin(query.returnTo, getOidcCallbackUrl(request));

      setSignedCookie(reply, OIDC_STATE_COOKIE, {
        state: startedLogin.state.state,
        nonce: startedLogin.state.nonce,
        codeVerifier: startedLogin.state.codeVerifier,
        nextPath: startedLogin.nextPath,
      } satisfies OidcStateCookiePayload, request);

      return reply.redirect(startedLogin.authorizationUrl);
    } catch (error) {
      const redirectUrl = new URL(`${env.CLIENT_URL}/login/oidc/callback`);
      redirectUrl.searchParams.set("error", error instanceof Error ? error.message : "Unable to start SSO login");
      return reply.redirect(redirectUrl.toString());
    }
  });

  fastify.get("/auth/oidc/callback", async (request, reply) => {
    const stateCookie = decodeSignedCookiePayload<OidcStateCookiePayload>(request, OIDC_STATE_COOKIE);
    clearCookie(reply, OIDC_STATE_COOKIE);

    if (!stateCookie) {
      const redirectUrl = new URL(`${env.CLIENT_URL}/login/oidc/callback`);
      redirectUrl.searchParams.set("error", "The SSO login state was missing or expired");
      return reply.redirect(redirectUrl.toString());
    }

    try {
      const completedLogin = await finishOidcLogin(
        `${getApiOrigin(request)}${request.raw.url ?? "/api/auth/oidc/callback"}`,
        getOidcCallbackUrl(request),
        {
          state: stateCookie.state,
          nonce: stateCookie.nonce,
          codeVerifier: stateCookie.codeVerifier,
        },
        stateCookie.nextPath,
      );
      const authResponse = await buildAuthResponse(reply, completedLogin.authenticatedSession);

      setSignedCookie(reply, OIDC_RESULT_COOKIE, {
        ...authResponse,
        nextPath: completedLogin.nextPath,
      } satisfies OidcResultCookiePayload, request);

      logEnterpriseAuthSuccess("OIDC", completedLogin.authenticatedSession.user.id, request.ip);

      if (completedLogin.authenticatedSession.user.role === "ADMIN") {
        await recordAuditEvent({
          actorUserId: completedLogin.authenticatedSession.user.id,
          actorRole: completedLogin.authenticatedSession.user.role,
          action: "auth.login",
          targetType: "session",
          targetId: completedLogin.authenticatedSession.user.id,
          targetName: completedLogin.authenticatedSession.user.username,
          detail: {
            role: completedLogin.authenticatedSession.user.role,
            providerType: completedLogin.authenticatedSession.session.providerType,
          },
        });
      }

      return reply.redirect(`${env.CLIENT_URL}/login/oidc/callback`);
    } catch (error) {
      logEnterpriseAuthFailure("OIDC", request.ip, {
        message: error instanceof Error ? error.message : "OIDC login failed",
      });
      const redirectUrl = new URL(`${env.CLIENT_URL}/login/oidc/callback`);
      redirectUrl.searchParams.set("error", error instanceof Error ? error.message : "OIDC login failed");
      return reply.redirect(redirectUrl.toString());
    }
  });

  fastify.get("/auth/oidc/session", async (request, reply) => {
    const result = decodeSignedCookiePayload<OidcResultCookiePayload>(request, OIDC_RESULT_COOKIE);
    clearCookie(reply, OIDC_RESULT_COOKIE);

    if (!result) {
      return reply.status(400).send({ message: "No completed OIDC login is waiting to be consumed" });
    }

    return {
      token: result.token,
      user: result.user,
      session: result.session,
      nextPath: result.nextPath,
    };
  });

  fastify.get("/auth/me", { preHandler: [requireAuth] }, async (request) => {
    const user = await getCurrentUser(request.authUser?.id);

    if (!user && request.authUser?.id) {
      writeStructuredLog("warn", {
        event: "auth.me.user-missing",
        actorUserId: request.authUser.id,
      });
    }

    return {
      user,
      session: getSessionInfoFromClaims(request.user),
    };
  });

  fastify.post("/auth/logout", { preHandler: [requireAuth] }, async (request) => {
    const user = await revokeCurrentUserSessions(request.authUser?.id);
    const session = getSessionInfoFromClaims(request.user);
    const logoutUrl = session.providerType === "OIDC"
      ? await buildOidcLogoutRedirect(session.providerId, getClientOrigin(request))
      : null;

    if (user) {
      if (user.role === "ADMIN") {
        await recordAuditEvent({
          actorUserId: user.id,
          actorRole: user.role,
          action: "auth.logout",
          targetType: "session",
          targetId: user.id,
          targetName: user.username,
          detail: {
            role: user.role,
            providerType: session.providerType,
            revokedSessionVersion: user.sessionVersion,
          },
        });
      }

      writeStructuredLog("info", {
        event: "auth.logout.succeeded",
        actorUserId: user.id,
        detail: {
          role: user.role,
          providerType: session.providerType,
        },
      });
    }

    return { logoutUrl };
  });
};
