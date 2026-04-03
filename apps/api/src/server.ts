import { buildServer } from "./app/build-server.js";
import { env } from "./config/env.js";
import { startRecordingRuntime, stopRecordingRuntime } from "./modules/recordings/recording-runtime.js";

const server = await buildServer();

try {
  await server.listen({
    port: env.API_PORT,
    host: "0.0.0.0",
  });
  await startRecordingRuntime();
} catch (error) {
  server.log.error(error);
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void (async () => {
      await stopRecordingRuntime();
      await server.close();
      process.exit(0);
    })();
  });
}
