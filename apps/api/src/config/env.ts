import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const currentDir = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: path.resolve(currentDir, "../../../../.env") });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  API_PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_URL: z.string().url().default("http://localhost:5173"),
  CLIENT_URLS: z.string().optional(),
  RECORDINGS_STORAGE_DIR: z.string().min(1).default(path.resolve(currentDir, "../../../../recordings")),
  RECORDINGS_FFMPEG_PATH: z.string().min(1).default("ffmpeg"),
  RECORDINGS_FFPROBE_PATH: z.string().min(1).default("ffprobe"),
  RECORDINGS_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).max(60000).default(5000),
  RECORDING_PLAYBACK_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(3600),
});

export const env = envSchema.parse(process.env);
