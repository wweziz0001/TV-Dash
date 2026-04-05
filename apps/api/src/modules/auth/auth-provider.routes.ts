import {
  ldapProviderConfigInputSchema,
  ldapProviderTestInputSchema,
  oidcProviderConfigInputSchema,
} from "@tv-dash/shared";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { requireAdmin } from "../../app/auth-guards.js";
import { parseWithSchema } from "../../app/validation.js";
import {
  recordAuditEvent,
  summarizeLdapAuthProviderAuditDetail,
  summarizeOidcAuthProviderAuditDetail,
} from "../audit/audit.service.js";
import {
  listEnterpriseAuthProviderSettings,
  recordAuthProviderValidationFailure,
  saveLdapAuthProviderSettings,
  saveOidcAuthProviderSettings,
  testSavedLdapAuthProviderSettings,
  testSavedOidcAuthProviderSettings,
} from "./auth.service.js";

function getApiOrigin(request: FastifyRequest) {
  const forwardedProtoHeader = request.headers["x-forwarded-proto"];
  const forwardedProto = Array.isArray(forwardedProtoHeader) ? forwardedProtoHeader[0] : forwardedProtoHeader;
  const protocol = forwardedProto?.split(",")[0]?.trim() || request.protocol;

  return `${protocol}://${request.headers.host}`;
}

export const authProviderRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/auth/providers", { preHandler: [requireAdmin] }, async () => {
    const settings = await listEnterpriseAuthProviderSettings();
    return { settings };
  });

  fastify.put("/auth/providers/ldap", { preHandler: [requireAdmin] }, async (request, reply) => {
    const payload = parseWithSchema(ldapProviderConfigInputSchema, request.body, reply);

    if (!payload) {
      return;
    }

    const settings = await saveLdapAuthProviderSettings(payload);

    await recordAuditEvent({
      actorUserId: request.authUser?.id,
      actorRole: request.authUser?.role,
      action: "auth.provider.ldap.updated",
      targetType: "auth-provider",
      targetId: settings.id,
      targetName: settings.name,
      detail: summarizeLdapAuthProviderAuditDetail(payload),
    });

    return { settings };
  });

  fastify.post("/auth/providers/ldap/test", { preHandler: [requireAdmin] }, async (request, reply) => {
    const payload = parseWithSchema(ldapProviderTestInputSchema, request.body ?? {}, reply);

    if (!payload) {
      return;
    }

    try {
      const result = await testSavedLdapAuthProviderSettings(payload);
      return { result };
    } catch (error) {
      await recordAuthProviderValidationFailure("LDAP", error);
      return reply.status(400).send({
        message: error instanceof Error ? error.message : "LDAP connection test failed",
      });
    }
  });

  fastify.put("/auth/providers/oidc", { preHandler: [requireAdmin] }, async (request, reply) => {
    const payload = parseWithSchema(oidcProviderConfigInputSchema, request.body, reply);

    if (!payload) {
      return;
    }

    const settings = await saveOidcAuthProviderSettings(payload);

    await recordAuditEvent({
      actorUserId: request.authUser?.id,
      actorRole: request.authUser?.role,
      action: "auth.provider.oidc.updated",
      targetType: "auth-provider",
      targetId: settings.id,
      targetName: settings.name,
      detail: summarizeOidcAuthProviderAuditDetail(payload),
    });

    return { settings };
  });

  fastify.post("/auth/providers/oidc/test", { preHandler: [requireAdmin] }, async (request, reply) => {
    try {
      const redirectUri = `${getApiOrigin(request)}/api/auth/oidc/callback`;
      const result = await testSavedOidcAuthProviderSettings(redirectUri);
      return { result };
    } catch (error) {
      await recordAuthProviderValidationFailure("OIDC", error);
      return reply.status(400).send({
        message: error instanceof Error ? error.message : "OIDC discovery test failed",
      });
    }
  });
};
