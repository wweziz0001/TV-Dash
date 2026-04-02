import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";

interface ProxyTokenPayload {
  channelId: string;
  target: string;
  exp: number;
}

const TOKEN_SEPARATOR = ".";
const DEFAULT_PROXY_TOKEN_TTL_MS = 10 * 60 * 1000;

function signPayload(payload: string) {
  return createHmac("sha256", env.JWT_SECRET).update(payload).digest("base64url");
}

export function createProxyToken(
  payload: Omit<ProxyTokenPayload, "exp">,
  { ttlMs = DEFAULT_PROXY_TOKEN_TTL_MS }: { ttlMs?: number } = {},
) {
  const encodedPayload = Buffer.from(
    JSON.stringify({
      ...payload,
      exp: Date.now() + ttlMs,
    } satisfies ProxyTokenPayload),
  ).toString("base64url");

  return `${encodedPayload}${TOKEN_SEPARATOR}${signPayload(encodedPayload)}`;
}

export function readProxyToken(token: string, expectedChannelId: string) {
  const [encodedPayload, signature] = token.split(TOKEN_SEPARATOR);

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expectedSignature);

  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as ProxyTokenPayload;

  if (payload.channelId !== expectedChannelId || payload.exp < Date.now()) {
    return null;
  }

  return payload;
}
