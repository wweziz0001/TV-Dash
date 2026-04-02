import type { FastifyInstance } from "fastify";

interface AuthTokenPayload {
  sub?: string;
  email?: string;
  role?: "ADMIN" | "USER";
}

export function createAuthHeaders(
  server: FastifyInstance,
  { sub = "11111111-1111-1111-1111-111111111111", email = "ops@example.com", role = "USER" }: AuthTokenPayload = {},
) {
  const token = (server as FastifyInstance & { jwt: { sign(payload: object): string } }).jwt.sign({
    sub,
    email,
    role,
  });

  return {
    authorization: `Bearer ${token}`,
  };
}

export function createPrismaError(code: string) {
  return Object.assign(new Error(code), { code });
}
