import type { FastifyInstance } from "fastify";

interface AuthTokenPayload {
  sub?: string;
  email?: string;
  role?: "ADMIN" | "USER";
  sessionVersion?: number;
  authProviderType?: "LOCAL" | "LDAP" | "OIDC";
  authProviderId?: string | null;
  authProviderName?: string | null;
}

export function createAuthHeaders(
  server: FastifyInstance,
  {
    sub,
    email,
    role = "USER",
    sessionVersion = 0,
    authProviderType = "LOCAL",
    authProviderId = null,
    authProviderName = null,
  }: AuthTokenPayload = {},
) {
  const resolvedSub =
    sub ?? (role === "ADMIN" ? "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" : "11111111-1111-1111-1111-111111111111");
  const resolvedEmail = email ?? (role === "ADMIN" ? "admin@example.com" : "ops@example.com");
  const token = (server as FastifyInstance & { jwt: { sign(payload: object): string } }).jwt.sign({
    sub: resolvedSub,
    email: resolvedEmail,
    role,
    sessionVersion,
    authProviderType,
    authProviderId,
    authProviderName,
  });

  return {
    authorization: `Bearer ${token}`,
  };
}

export function createPrismaError(code: string) {
  return Object.assign(new Error(code), { code });
}
