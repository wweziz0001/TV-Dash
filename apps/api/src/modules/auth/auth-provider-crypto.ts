import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../../config/env.js";

const AUTH_PROVIDER_SECRET_VERSION = "v1";
const AUTH_PROVIDER_SECRET_ALGORITHM = "aes-256-gcm";

function getEncryptionKey() {
  if (!env.AUTH_CONFIG_ENCRYPTION_SECRET) {
    throw new Error("AUTH_CONFIG_ENCRYPTION_SECRET is required to store enterprise auth secrets");
  }

  return createHash("sha256").update(env.AUTH_CONFIG_ENCRYPTION_SECRET, "utf8").digest();
}

export function canEncryptAuthProviderSecrets() {
  return Boolean(env.AUTH_CONFIG_ENCRYPTION_SECRET);
}

export function encryptAuthProviderSecrets(secretPayload: object) {
  const plaintext = Buffer.from(JSON.stringify(secretPayload), "utf8");
  const iv = randomBytes(12);
  const cipher = createCipheriv(AUTH_PROVIDER_SECRET_ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    AUTH_PROVIDER_SECRET_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptAuthProviderSecrets<TSecrets extends object>(ciphertext: string | null | undefined) {
  if (!ciphertext) {
    return null;
  }

  const [version, ivValue, tagValue, payloadValue] = ciphertext.split(".");

  if (
    version !== AUTH_PROVIDER_SECRET_VERSION
    || !ivValue
    || !tagValue
    || !payloadValue
  ) {
    throw new Error("Unsupported enterprise auth secret payload");
  }

  const decipher = createDecipheriv(
    AUTH_PROVIDER_SECRET_ALGORITHM,
    getEncryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payloadValue, "base64url")),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8")) as TSecrets;
}
