import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "./build-server.js";

describe("buildServer", () => {
  let server: Awaited<ReturnType<typeof buildServer>> | undefined;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
  });

  it("serves the health endpoint", async () => {
    server = await buildServer();

    const response = await server.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      service: "tv-dash-api",
    });
  });
});
