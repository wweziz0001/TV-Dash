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

export async function buildServer() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: env.CLIENT_URL,
    credentials: true,
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

