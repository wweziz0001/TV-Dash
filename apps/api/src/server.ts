import { buildServer } from "./app/build-server.js";
import { env } from "./config/env.js";

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
