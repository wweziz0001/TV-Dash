import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";

interface RecordingPlaybackTokenPayload {
  recordingJobId: string;
  recordingAssetId: string;
  exp: number;
}

const TOKEN_SEPARATOR = ".";

function signPayload(payload: string) {
  return createHmac("sha256", env.JWT_SECRET).update(payload).digest("base64url");
}

export function createRecordingPlaybackToken(payload: Omit<RecordingPlaybackTokenPayload, "exp">) {
  const encodedPayload = Buffer.from(
    JSON.stringify({
      ...payload,
      exp: Date.now() + env.RECORDING_PLAYBACK_TOKEN_TTL_SECONDS * 1000,
    } satisfies RecordingPlaybackTokenPayload),
  ).toString("base64url");

  return `${encodedPayload}${TOKEN_SEPARATOR}${signPayload(encodedPayload)}`;
}

export function readRecordingPlaybackToken(token: string, expectedRecordingJobId: string) {
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

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as RecordingPlaybackTokenPayload;

  if (payload.recordingJobId !== expectedRecordingJobId || payload.exp < Date.now()) {
    return null;
  }

  return payload;
}
