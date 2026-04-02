import { buildServer } from "./app.js";
import { env } from "./lib/env.js";

const server = await buildServer();

try {
  await server.listen({
    port: env.API_PORT,
    host: "0.0.0.0",
  });
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
