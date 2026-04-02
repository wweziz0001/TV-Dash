import cors from "@fastify/cors";
import Fastify from "fastify";
import { authPlugin } from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { channelRoutes } from "./routes/channels.js";
import { favoriteRoutes } from "./routes/favorites.js";
import { groupRoutes } from "./routes/groups.js";
import { healthRoutes } from "./routes/health.js";
import { layoutRoutes } from "./routes/layouts.js";
import { streamRoutes } from "./routes/streams.js";
import { env } from "./lib/env.js";

function createAllowedOrigins() {
  const configuredOrigins = new Set<string>([env.CLIENT_URL]);
  const extraOrigins = env.CLIENT_URLS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean) ?? [];

  for (const origin of extraOrigins) {
    configuredOrigins.add(origin);
  }

  // Local development often alternates between localhost and 127.0.0.1.
  for (const origin of [...configuredOrigins]) {
    try {
      const url = new URL(origin);
      if (url.hostname === "localhost") {
        configuredOrigins.add(origin.replace("localhost", "127.0.0.1"));
      }
      if (url.hostname === "127.0.0.1") {
        configuredOrigins.add(origin.replace("127.0.0.1", "localhost"));
      }
    } catch {
      // Ignore malformed origins here; env validation already covers CLIENT_URL.
    }
  }

  return configuredOrigins;
}

export async function buildServer() {
  const app = Fastify({
    logger: true,
  });

  const allowedOrigins = createAllowedOrigins();

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      callback(null, allowedOrigins.has(origin));
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
  });

  await app.register(authPlugin);
  await app.register(healthRoutes, { prefix: "/api" });
  await app.register(authRoutes, { prefix: "/api" });
  await app.register(groupRoutes, { prefix: "/api" });
  await app.register(channelRoutes, { prefix: "/api" });
  await app.register(favoriteRoutes, { prefix: "/api" });
  await app.register(layoutRoutes, { prefix: "/api" });
  await app.register(streamRoutes, { prefix: "/api" });

  return app;
}
