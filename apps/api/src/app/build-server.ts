import cors from "@fastify/cors";
import Fastify from "fastify";
import { env } from "../config/env.js";
import { authPlugin } from "./plugins/auth.js";
import { createAllowedOrigins } from "./cors.js";
import { configureStructuredLogger } from "./structured-log.js";
import { authRoutes } from "../modules/auth/auth.routes.js";
import { channelRoutes } from "../modules/channels/channel.routes.js";
import { diagnosticRoutes } from "../modules/diagnostics/diagnostic.routes.js";
import { epgRoutes } from "../modules/epg/epg.routes.js";
import { favoriteRoutes } from "../modules/favorites/favorite.routes.js";
import { groupRoutes } from "../modules/groups/group.routes.js";
import { healthRoutes } from "../modules/health/health.routes.js";
import { layoutRoutes } from "../modules/layouts/layout.routes.js";
import { streamRoutes } from "../modules/streams/stream.routes.js";

export async function buildServer() {
  const app = Fastify({
    logger: true,
  });
  configureStructuredLogger(app.log);

  const allowedOrigins = createAllowedOrigins(env.CLIENT_URL, env.CLIENT_URLS);

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
  await app.register(diagnosticRoutes, { prefix: "/api" });
  await app.register(epgRoutes, { prefix: "/api" });
  await app.register(favoriteRoutes, { prefix: "/api" });
  await app.register(layoutRoutes, { prefix: "/api" });
  await app.register(streamRoutes, { prefix: "/api" });

  return app;
}
