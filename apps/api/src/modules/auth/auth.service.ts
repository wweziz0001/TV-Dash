import bcrypt from "bcryptjs";
import type {
  AuthProviderType,
  AuthSessionProviderType,
  LdapLoginInput,
  LdapProviderConfigInput,
  LdapProviderTestInput,
  OidcProviderConfigInput,
} from "@tv-dash/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { summarizeEmailAddress, writeStructuredLog } from "../../app/structured-log.js";
import { findUserByEmail, findUserByUsername, findAuthenticatedUser, invalidateUserSessions, createUser } from "./auth.repository.js";
import {
  canEncryptAuthProviderSecrets,
  decryptAuthProviderSecrets,
  encryptAuthProviderSecrets,
} from "./auth-provider-crypto.js";
import {
  buildLdapSecretState,
  buildOidcSecretState,
  buildStoredLdapProviderConfig,
  buildStoredOidcProviderConfig,
  parseStoredLdapProviderConfig,
  parseStoredOidcProviderConfig,
  type AuthProviderAdminSummary,
  type LdapProviderConfig,
  type LdapProviderSecretState,
  type OidcProviderConfig,
  type OidcProviderSecretState,
} from "./auth-provider-config.js";
import {
  createExternalIdentity,
  ensureDefaultAuthProviders,
  findAuthProviderByType,
  findExternalIdentityByProviderSubject,
  findExternalIdentityForUser,
  listAuthProviders,
  updateAuthProvider,
  updateExternalIdentity,
} from "./auth-provider.repository.js";
import { authenticateAgainstLdap, testLdapProviderConnection, type LdapIdentityProfile } from "./ldap-auth.js";
import {
  beginOidcAuthorization,
  buildOidcLogoutUrl,
  completeOidcAuthorization,
  testOidcProviderConfiguration,
  type OidcAuthorizationRequestState,
  type OidcIdentityProfile,
} from "./oidc-auth.js";

interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  role: "ADMIN" | "USER";
  sessionVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthSessionInfo {
  providerType: AuthSessionProviderType;
  providerId: string | null;
  providerName: string | null;
}

export interface AuthenticatedSessionResult {
  user: AuthenticatedUser;
  session: AuthSessionInfo;
}

interface EnterpriseIdentityProfile {
  subject: string;
  username: string | null;
  email: string | null;
  displayName: string | null;
  groups: string[];
}

interface StoredAuthProviderRecord {
  id: string;
  type: AuthProviderType;
  name: string;
  isEnabled: boolean;
  isVisibleOnLogin: boolean;
  allowAutoProvision: boolean;
  autoLinkByEmail: boolean;
  autoLinkByUsername: boolean;
  defaultRole: "ADMIN" | "USER";
  configurationJson: Prisma.JsonValue;
  secretCiphertext: string | null;
  lastValidatedAt: Date | null;
  lastValidationStatus: "NEVER_VALIDATED" | "SUCCEEDED" | "FAILED";
  lastValidationMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicAuthProviderOptions {
  local: {
    enabled: boolean;
    loginLabel: string;
  };
  ldap: {
    name: string;
    loginLabel: string;
    identifierLabel: string;
    identifierPlaceholder: string;
  } | null;
  oidc: {
    name: string;
    loginLabel: string;
  } | null;
}

export interface AdminAuthProviderSettings {
  local: {
    enabled: boolean;
    loginLabel: string;
  };
  providers: {
    ldap: AuthProviderAdminSummary & {
      config: LdapProviderConfig;
      hasBindPassword: boolean;
    };
    oidc: AuthProviderAdminSummary & {
      config: OidcProviderConfig;
      hasClientSecret: boolean;
    };
  };
}

export interface OidcLoginStartResult {
  authorizationUrl: string;
  state: OidcAuthorizationRequestState;
}

export interface OidcLoginCompletionResult {
  authenticatedSession: AuthenticatedSessionResult;
  nextPath: string;
}

function createLocalSessionInfo(): AuthSessionInfo {
  return {
    providerType: "LOCAL",
    providerId: null,
    providerName: "Local login",
  };
}

function createEnterpriseSessionInfo(provider: StoredAuthProviderRecord): AuthSessionInfo {
  return {
    providerType: provider.type,
    providerId: provider.id,
    providerName: provider.name,
  };
}

function buildAuthProviderAdminSummary(provider: StoredAuthProviderRecord): AuthProviderAdminSummary {
  return {
    id: provider.id,
    type: provider.type,
    name: provider.name,
    isEnabled: provider.isEnabled,
    isVisibleOnLogin: provider.isVisibleOnLogin,
    allowAutoProvision: provider.allowAutoProvision,
    autoLinkByEmail: provider.autoLinkByEmail,
    autoLinkByUsername: provider.autoLinkByUsername,
    defaultRole: provider.defaultRole,
    lastValidatedAt: provider.lastValidatedAt?.toISOString() ?? null,
    lastValidationStatus: provider.lastValidationStatus,
    lastValidationMessage: provider.lastValidationMessage,
  };
}

async function getProviderRecordOrThrow(type: AuthProviderType) {
  await ensureDefaultAuthProviders();
  const provider = await findAuthProviderByType(type);

  if (!provider) {
    throw new Error(`${type} auth provider is not configured`);
  }

  return provider satisfies StoredAuthProviderRecord;
}

function requireSecretEncryptionIfNeeded(hasSecretValue: boolean) {
  if (hasSecretValue && !canEncryptAuthProviderSecrets()) {
    throw new Error("AUTH_CONFIG_ENCRYPTION_SECRET must be configured before saving enterprise auth secrets");
  }
}

function decodeLdapSecrets(provider: StoredAuthProviderRecord) {
  return decryptAuthProviderSecrets<LdapProviderSecretState>(provider.secretCiphertext) ?? { bindPassword: null };
}

function decodeOidcSecrets(provider: StoredAuthProviderRecord) {
  return decryptAuthProviderSecrets<OidcProviderSecretState>(provider.secretCiphertext) ?? { clientSecret: null };
}

function sanitizeNextPath(nextPath?: string) {
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/";
  }

  return nextPath;
}

function normalizeProvisionedUsernameCandidate(profile: EnterpriseIdentityProfile) {
  const rawValue = profile.username
    ?? profile.email?.split("@")[0]
    ?? profile.displayName
    ?? profile.subject;

  const normalized = rawValue
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return normalized || "enterprise-user";
}

function buildSyntheticProvisionedEmail(profile: EnterpriseIdentityProfile, provider: StoredAuthProviderRecord) {
  const subjectHash = Buffer.from(profile.subject, "utf8")
    .toString("base64url")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 24)
    .toLowerCase();

  return `${provider.type.toLowerCase()}-${subjectHash || "user"}@external.local`;
}

async function ensureUniqueProvisionedUsername(baseValue: string) {
  let candidate = baseValue;
  let suffix = 2;

  while (await findUserByUsername(candidate)) {
    candidate = `${baseValue.slice(0, Math.max(1, 36 - String(suffix).length))}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function resolveOrProvisionEnterpriseUser(
  provider: StoredAuthProviderRecord,
  identityProfile: EnterpriseIdentityProfile,
) {
  const existingIdentity = await findExternalIdentityByProviderSubject(provider.id, identityProfile.subject);

  if (existingIdentity?.user) {
    await updateExternalIdentity(existingIdentity.id, {
      externalUsername: identityProfile.username,
      externalEmail: identityProfile.email,
      externalDisplayName: identityProfile.displayName,
      lastLoginAt: new Date(),
    });

    return existingIdentity.user satisfies AuthenticatedUser;
  }

  let linkedUser: AuthenticatedUser | null = null;

  if (provider.autoLinkByEmail && identityProfile.email) {
    linkedUser = await findUserByEmail(identityProfile.email);
  }

  if (!linkedUser && provider.autoLinkByUsername && identityProfile.username) {
    linkedUser = await findUserByUsername(identityProfile.username.toLowerCase());
  }

  if (linkedUser) {
    const existingProviderIdentity = await findExternalIdentityForUser(linkedUser.id, provider.id);

    if (existingProviderIdentity && existingProviderIdentity.externalSubject !== identityProfile.subject) {
      throw new Error("This TV-Dash user is already linked to another identity for this provider");
    }

    await prisma.$transaction(async (tx) => {
      await createExternalIdentity({
        userId: linkedUser!.id,
        providerId: provider.id,
        externalSubject: identityProfile.subject,
        externalUsername: identityProfile.username,
        externalEmail: identityProfile.email,
        externalDisplayName: identityProfile.displayName,
        lastLoginAt: new Date(),
      }, tx);
    });

    return linkedUser;
  }

  if (identityProfile.email) {
    const conflictingEmailUser = await findUserByEmail(identityProfile.email);

    if (conflictingEmailUser) {
      throw new Error("An existing TV-Dash user already uses that email address");
    }
  }

  if (!provider.allowAutoProvision) {
    throw new Error("No linked TV-Dash user was found and automatic provisioning is disabled");
  }

  const requestedUsername = normalizeProvisionedUsernameCandidate(identityProfile);
  const uniqueUsername = await ensureUniqueProvisionedUsername(requestedUsername);
  const provisionedEmail = identityProfile.email ?? buildSyntheticProvisionedEmail(identityProfile, provider);

  return prisma.$transaction(async (tx) => {
    const user = await createUser({
      email: provisionedEmail,
      username: uniqueUsername,
      passwordHash: null,
      role: provider.defaultRole,
    }, tx);

    await createExternalIdentity({
      userId: user.id,
      providerId: provider.id,
      externalSubject: identityProfile.subject,
      externalUsername: identityProfile.username,
      externalEmail: identityProfile.email,
      externalDisplayName: identityProfile.displayName,
      lastLoginAt: new Date(),
    }, tx);

    return user;
  });
}

async function authenticateEnterpriseIdentity(
  provider: StoredAuthProviderRecord,
  identityProfile: EnterpriseIdentityProfile,
) {
  const user = await resolveOrProvisionEnterpriseUser(provider, identityProfile);

  return {
    user,
    session: createEnterpriseSessionInfo(provider),
  } satisfies AuthenticatedSessionResult;
}

function buildStoredProviderUpdateData(
  provider: StoredAuthProviderRecord,
  config: LdapProviderConfig,
  secretCiphertext: string | null,
) {
  return {
    name: config.name,
    isEnabled: config.isEnabled,
    isVisibleOnLogin: config.isVisibleOnLogin,
    allowAutoProvision: config.allowAutoProvision,
    autoLinkByEmail: config.autoLinkByEmail,
    autoLinkByUsername: config.autoLinkByUsername,
    defaultRole: config.defaultRole,
    configurationJson: config as unknown as Prisma.InputJsonValue,
    secretCiphertext,
    lastValidatedAt: provider.lastValidatedAt,
    lastValidationStatus: provider.lastValidationStatus,
    lastValidationMessage: provider.lastValidationMessage,
  } satisfies Prisma.AuthProviderUpdateInput;
}

function buildStoredOidcProviderUpdateData(
  provider: StoredAuthProviderRecord,
  config: OidcProviderConfig,
  secretCiphertext: string | null,
) {
  return {
    name: config.name,
    isEnabled: config.isEnabled,
    isVisibleOnLogin: config.isVisibleOnLogin,
    allowAutoProvision: config.allowAutoProvision,
    autoLinkByEmail: config.autoLinkByEmail,
    autoLinkByUsername: config.autoLinkByUsername,
    defaultRole: config.defaultRole,
    configurationJson: config as unknown as Prisma.InputJsonValue,
    secretCiphertext,
    lastValidatedAt: provider.lastValidatedAt,
    lastValidationStatus: provider.lastValidationStatus,
    lastValidationMessage: provider.lastValidationMessage,
  } satisfies Prisma.AuthProviderUpdateInput;
}

export async function verifyLoginCredentials(email: string, password: string) {
  const user = await findUserByEmail(email.toLowerCase());

  if (!user || !user.passwordHash) {
    return null;
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);

  if (!isValid) {
    return null;
  }

  return {
    user,
    session: createLocalSessionInfo(),
  } satisfies AuthenticatedSessionResult;
}

export async function authenticateLdapCredentials(payload: LdapLoginInput) {
  const provider = await getProviderRecordOrThrow("LDAP");

  if (!provider.isEnabled) {
    throw new Error("LDAP login is not enabled");
  }

  const config = parseStoredLdapProviderConfig(provider.configurationJson);
  const secrets = decodeLdapSecrets(provider);
  const identity = await authenticateAgainstLdap(config, secrets, payload.identifier, payload.password);

  return authenticateEnterpriseIdentity(provider, identity satisfies EnterpriseIdentityProfile);
}

export async function getCurrentUser(userId?: string) {
  if (!userId) {
    return null;
  }

  return findAuthenticatedUser(userId);
}

export async function getVerifiedSessionUser(userId?: string, sessionVersion?: number) {
  if (!userId || typeof sessionVersion !== "number") {
    return null;
  }

  const user = await findAuthenticatedUser(userId);

  if (!user || user.sessionVersion !== sessionVersion) {
    return null;
  }

  return user;
}

export async function revokeCurrentUserSessions(userId?: string) {
  if (!userId) {
    return null;
  }

  return invalidateUserSessions(userId);
}

export async function listEnterpriseAuthProviderSettings() {
  await ensureDefaultAuthProviders();
  const providers = await listAuthProviders();

  const ldapProvider = providers.find((provider) => provider.type === "LDAP");
  const oidcProvider = providers.find((provider) => provider.type === "OIDC");

  if (!ldapProvider || !oidcProvider) {
    throw new Error("Enterprise auth providers are unavailable");
  }

  return {
    local: {
      enabled: true,
      loginLabel: "Email and password",
    },
    providers: {
      ldap: {
        ...buildAuthProviderAdminSummary(ldapProvider),
        config: parseStoredLdapProviderConfig(ldapProvider.configurationJson),
        hasBindPassword: Boolean(decodeLdapSecrets(ldapProvider).bindPassword),
      },
      oidc: {
        ...buildAuthProviderAdminSummary(oidcProvider),
        config: parseStoredOidcProviderConfig(oidcProvider.configurationJson),
        hasClientSecret: Boolean(decodeOidcSecrets(oidcProvider).clientSecret),
      },
    },
  } satisfies AdminAuthProviderSettings;
}

export async function getPublicAuthProviderOptions() {
  await ensureDefaultAuthProviders();
  const providers = await listAuthProviders();
  const ldapProvider = providers.find((provider) => provider.type === "LDAP");
  const oidcProvider = providers.find((provider) => provider.type === "OIDC");
  const ldapConfig = ldapProvider ? parseStoredLdapProviderConfig(ldapProvider.configurationJson) : null;
  const oidcConfig = oidcProvider ? parseStoredOidcProviderConfig(oidcProvider.configurationJson) : null;

  return {
    local: {
      enabled: true,
      loginLabel: "Email and password",
    },
    ldap: ldapProvider?.isEnabled && ldapProvider.isVisibleOnLogin && ldapConfig
      ? {
          name: ldapProvider.name,
          loginLabel: ldapConfig.loginLabel,
          identifierLabel: ldapConfig.identifierLabel,
          identifierPlaceholder: ldapConfig.identifierPlaceholder,
        }
      : null,
    oidc: oidcProvider?.isEnabled && oidcProvider.isVisibleOnLogin && oidcConfig
      ? {
          name: oidcProvider.name,
          loginLabel: oidcConfig.loginLabel,
        }
      : null,
  } satisfies PublicAuthProviderOptions;
}

export async function saveLdapAuthProviderSettings(input: LdapProviderConfigInput) {
  const provider = await getProviderRecordOrThrow("LDAP");
  const nextConfig = buildStoredLdapProviderConfig(input);
  const nextSecrets = buildLdapSecretState(input, decodeLdapSecrets(provider));

  if (nextConfig.bindDn) {
    requireSecretEncryptionIfNeeded(Boolean(nextSecrets.bindPassword));
  }

  if (nextConfig.isEnabled && nextConfig.bindDn && !nextSecrets.bindPassword) {
    throw new Error("LDAP bind DN is enabled but no bind password is stored");
  }

  const updatedProvider = await updateAuthProvider(
    "LDAP",
    buildStoredProviderUpdateData(
      provider,
      nextConfig,
      nextSecrets.bindPassword ? encryptAuthProviderSecrets(nextSecrets) : null,
    ),
  );

  return {
    ...buildAuthProviderAdminSummary(updatedProvider),
    config: parseStoredLdapProviderConfig(updatedProvider.configurationJson),
    hasBindPassword: Boolean(nextSecrets.bindPassword),
  };
}

export async function saveOidcAuthProviderSettings(input: OidcProviderConfigInput) {
  const provider = await getProviderRecordOrThrow("OIDC");
  const nextConfig = buildStoredOidcProviderConfig(input);
  const nextSecrets = buildOidcSecretState(input, decodeOidcSecrets(provider));

  requireSecretEncryptionIfNeeded(Boolean(nextSecrets.clientSecret));

  const updatedProvider = await updateAuthProvider(
    "OIDC",
    buildStoredOidcProviderUpdateData(
      provider,
      nextConfig,
      nextSecrets.clientSecret ? encryptAuthProviderSecrets(nextSecrets) : null,
    ),
  );

  return {
    ...buildAuthProviderAdminSummary(updatedProvider),
    config: parseStoredOidcProviderConfig(updatedProvider.configurationJson),
    hasClientSecret: Boolean(nextSecrets.clientSecret),
  };
}

export async function testSavedLdapAuthProviderSettings(input: LdapProviderTestInput) {
  const provider = await getProviderRecordOrThrow("LDAP");
  const config = parseStoredLdapProviderConfig(provider.configurationJson);
  const secrets = decodeLdapSecrets(provider);
  const result = await testLdapProviderConnection(config, secrets, input.testIdentifier);

  await updateAuthProvider("LDAP", {
    lastValidatedAt: new Date(),
    lastValidationStatus: "SUCCEEDED",
    lastValidationMessage: result.message,
  });

  return result;
}

export async function testSavedOidcAuthProviderSettings(redirectUri: string) {
  const provider = await getProviderRecordOrThrow("OIDC");
  const config = parseStoredOidcProviderConfig(provider.configurationJson);
  const secrets = decodeOidcSecrets(provider);
  const result = await testOidcProviderConfiguration(config, secrets, redirectUri);

  await updateAuthProvider("OIDC", {
    lastValidatedAt: new Date(),
    lastValidationStatus: "SUCCEEDED",
    lastValidationMessage: "OIDC discovery succeeded",
  });

  return result;
}

export async function recordAuthProviderValidationFailure(type: AuthProviderType, error: unknown) {
  await updateAuthProvider(type, {
    lastValidatedAt: new Date(),
    lastValidationStatus: "FAILED",
    lastValidationMessage: error instanceof Error ? error.message : "Enterprise auth validation failed",
  });
}

export async function startOidcLogin(returnTo: string | undefined, redirectUri: string) {
  const provider = await getProviderRecordOrThrow("OIDC");

  if (!provider.isEnabled) {
    throw new Error("OIDC login is not enabled");
  }

  const config = parseStoredOidcProviderConfig(provider.configurationJson);
  const secrets = decodeOidcSecrets(provider);
  const startedLogin = await beginOidcAuthorization(config, secrets, redirectUri);

  return {
    authorizationUrl: startedLogin.authorizationUrl.toString(),
    state: {
      state: startedLogin.state,
      nonce: startedLogin.nonce,
      codeVerifier: startedLogin.codeVerifier,
    },
    nextPath: sanitizeNextPath(returnTo),
  } satisfies OidcLoginStartResult & { nextPath: string };
}

export async function finishOidcLogin(
  callbackUrl: string,
  redirectUri: string,
  requestState: OidcAuthorizationRequestState,
  nextPath?: string,
) {
  const provider = await getProviderRecordOrThrow("OIDC");
  const config = parseStoredOidcProviderConfig(provider.configurationJson);
  const secrets = decodeOidcSecrets(provider);
  const completion = await completeOidcAuthorization(config, secrets, redirectUri, callbackUrl, requestState);
  const authenticatedSession = await authenticateEnterpriseIdentity(
    provider,
    completion.identity satisfies EnterpriseIdentityProfile,
  );

  return {
    authenticatedSession,
    nextPath: sanitizeNextPath(nextPath),
  } satisfies OidcLoginCompletionResult;
}

export async function buildOidcLogoutRedirect(providerId?: string | null, clientOrigin?: string) {
  if (!providerId) {
    return null;
  }

  const provider = await getProviderRecordOrThrow("OIDC");

  if (provider.id !== providerId) {
    return null;
  }

  const config = parseStoredOidcProviderConfig(provider.configurationJson);
  const secrets = decodeOidcSecrets(provider);
  const resolvedClientOrigin = clientOrigin?.replace(/\/$/, "") ?? "";

  if (!resolvedClientOrigin) {
    return null;
  }

  return buildOidcLogoutUrl(
    config,
    secrets,
    `${resolvedClientOrigin}${config.postLogoutRedirectPath}`,
  );
}

export function buildSessionClaims(session: AuthSessionInfo) {
  return {
    authProviderType: session.providerType,
    authProviderId: session.providerId,
    authProviderName: session.providerName,
  };
}

export function getSessionInfoFromClaims(claims: {
  authProviderType?: AuthSessionProviderType;
  authProviderId?: string | null;
  authProviderName?: string | null;
}) {
  return {
    providerType: claims.authProviderType ?? "LOCAL",
    providerId: claims.authProviderId ?? null,
    providerName: claims.authProviderName ?? null,
  } satisfies AuthSessionInfo;
}

export function logEnterpriseAuthFailure(
  providerType: AuthSessionProviderType,
  requestIp: string,
  detail: {
    identifier?: string;
    email?: string;
    message: string;
  },
) {
  writeStructuredLog("warn", {
    event: "auth.enterprise.failed",
    detail: {
      providerType,
      requestIp,
      identifier: detail.identifier ?? null,
      ...summarizeEmailAddress(detail.email ?? ""),
      message: detail.message,
    },
  });
}

export function logEnterpriseAuthSuccess(
  providerType: AuthSessionProviderType,
  userId: string,
  requestIp: string,
) {
  writeStructuredLog("info", {
    event: "auth.enterprise.succeeded",
    actorUserId: userId,
    detail: {
      providerType,
      requestIp,
    },
  });
}
