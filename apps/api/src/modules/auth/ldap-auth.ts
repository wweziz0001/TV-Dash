import { Client } from "ldapts";
import type { LdapProviderConfig, LdapProviderSecretState } from "./auth-provider-config.js";

export interface LdapIdentityProfile {
  subject: string;
  username: string | null;
  email: string | null;
  displayName: string | null;
  groups: string[];
}

function escapeLdapFilterValue(value: string) {
  return value
    .replaceAll("\\", "\\5c")
    .replaceAll("*", "\\2a")
    .replaceAll("(", "\\28")
    .replaceAll(")", "\\29")
    .replaceAll("\u0000", "\\00");
}

function normalizeAttributeValue(value: Buffer | Buffer[] | string | string[] | undefined) {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (Buffer.isBuffer(value)) {
    const normalized = value.toString("utf8").trim();
    return normalized || null;
  }

  if (Array.isArray(value)) {
    const firstValue = value.find((candidate) => candidate !== null && candidate !== undefined);

    if (typeof firstValue === "string") {
      return firstValue.trim() || null;
    }

    if (Buffer.isBuffer(firstValue)) {
      const normalized = firstValue.toString("utf8").trim();
      return normalized || null;
    }
  }

  return null;
}

function normalizeAttributeList(value: Buffer | Buffer[] | string | string[] | undefined) {
  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }

  if (Buffer.isBuffer(value)) {
    const normalized = value.toString("utf8").trim();
    return normalized ? [normalized] : [];
  }

  if (Array.isArray(value)) {
    return value
      .map((candidate) => {
        if (typeof candidate === "string") {
          return candidate.trim() || null;
        }

        if (Buffer.isBuffer(candidate)) {
          const normalized = candidate.toString("utf8").trim();
          return normalized || null;
        }

        return null;
      })
      .filter((candidate): candidate is string => Boolean(candidate));
  }

  return [];
}

function createLdapClient(config: LdapProviderConfig) {
  return new Client({
    url: config.serverUrl,
    timeout: config.timeoutMs,
    connectTimeout: config.connectTimeoutMs,
    strictDN: true,
    tlsOptions: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: config.rejectUnauthorized,
    },
  });
}

async function initializeLdapClient(client: Client, config: LdapProviderConfig, secrets: LdapProviderSecretState) {
  if (config.startTls) {
    await client.startTLS({
      minVersion: "TLSv1.2",
      rejectUnauthorized: config.rejectUnauthorized,
    });
  }

  if (config.bindDn) {
    if (!secrets.bindPassword) {
      throw new Error("LDAP bind DN is configured but the bind password is missing");
    }

    await client.bind(config.bindDn, secrets.bindPassword);
  }
}

async function searchForLdapUser(
  client: Client,
  config: LdapProviderConfig,
  identifier: string,
) {
  const filter = config.userSearchFilter.replaceAll("{identifier}", escapeLdapFilterValue(identifier));
  const attributes = [
    config.usernameAttribute,
    config.emailAttribute,
    config.displayNameAttribute,
    config.groupAttribute,
  ].filter((value): value is string => Boolean(value));
  const result = await client.search(config.userSearchBaseDn, {
    scope: config.userSearchScope,
    filter,
    attributes,
  });

  if (result.searchEntries.length === 0) {
    throw new Error("LDAP user was not found for the supplied identifier");
  }

  if (result.searchEntries.length > 1) {
    throw new Error("LDAP search returned multiple matching users");
  }

  return result.searchEntries[0];
}

function mapLdapIdentityProfile(
  config: LdapProviderConfig,
  entry: Record<string, Buffer | Buffer[] | string | string[]>,
): LdapIdentityProfile {
  return {
    subject: typeof entry.dn === "string" ? entry.dn : "",
    username: normalizeAttributeValue(entry[config.usernameAttribute]),
    email: normalizeAttributeValue(entry[config.emailAttribute])?.toLowerCase() ?? null,
    displayName: normalizeAttributeValue(entry[config.displayNameAttribute]),
    groups: config.groupAttribute ? normalizeAttributeList(entry[config.groupAttribute]) : [],
  };
}

export async function testLdapProviderConnection(
  config: LdapProviderConfig,
  secrets: LdapProviderSecretState,
  testIdentifier?: string,
) {
  const client = createLdapClient(config);

  try {
    await initializeLdapClient(client, config, secrets);

    if (!testIdentifier) {
      return {
        message: "LDAP connection succeeded",
      };
    }

    const entry = await searchForLdapUser(client, config, testIdentifier);
    const identity = mapLdapIdentityProfile(config, entry);

    return {
      message: "LDAP connection and user search succeeded",
      identity,
    };
  } finally {
    await client.unbind().catch(() => undefined);
  }
}

export async function authenticateAgainstLdap(
  config: LdapProviderConfig,
  secrets: LdapProviderSecretState,
  identifier: string,
  password: string,
) {
  const client = createLdapClient(config);

  try {
    await initializeLdapClient(client, config, secrets);
    const entry = await searchForLdapUser(client, config, identifier);
    const identity = mapLdapIdentityProfile(config, entry);

    if (!identity.subject) {
      throw new Error("LDAP user entry is missing a distinguished name");
    }

    await client.bind(identity.subject, password);
    return identity;
  } finally {
    await client.unbind().catch(() => undefined);
  }
}
