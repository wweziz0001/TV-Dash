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
  TIMESHIFT_ENABLED: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  TIMESHIFT_STORAGE_DIR: z
    .string()
    .min(1)
    .default(path.resolve(currentDir, "../../../../recordings/timeshift")),
  TIMESHIFT_DEFAULT_WINDOW_MINUTES: z.coerce.number().int().min(5).max(360).default(30),
  TIMESHIFT_MIN_AVAILABLE_WINDOW_SECONDS: z.coerce.number().int().min(10).max(600).default(30),
  TIMESHIFT_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).max(30000).default(4000),
  TIMESHIFT_IDLE_TTL_MS: z.coerce.number().int().min(60000).max(3600000).default(900000),
  RECORDINGS_FFMPEG_PATH: z.string().min(1).default("ffmpeg"),
  RECORDINGS_FFPROBE_PATH: z.string().min(1).default("ffprobe"),
  RECORDINGS_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).max(60000).default(5000),
  RECORDING_PLAYBACK_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(3600),
  RECORDINGS_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  RECORDINGS_RETENTION_MAX_PER_CHANNEL: z.coerce.number().int().min(1).max(1000).default(25),
  RECORDINGS_FAILED_CLEANUP_HOURS: z.coerce.number().int().min(1).max(720).default(24),
  RECORDINGS_RETENTION_SWEEP_INTERVAL_MS: z.coerce.number().int().min(60000).max(86400000).default(3600000),
});

export const env = envSchema.parse(process.env);
