export function createAllowedOrigins(clientUrl: string, extraClientUrls?: string) {
  const configuredOrigins = new Set<string>([clientUrl]);
  const extraOrigins = extraClientUrls?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];

  for (const origin of extraOrigins) {
    configuredOrigins.add(origin);
  }

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
