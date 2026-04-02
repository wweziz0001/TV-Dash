import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/health", async () => ({
    ok: true,
    service: "tv-dash-api",
    now: new Date().toISOString(),
  }));
};

