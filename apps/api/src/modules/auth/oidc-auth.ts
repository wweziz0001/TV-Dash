import * as client from "openid-client";
import type { OidcProviderConfig, OidcProviderSecretState } from "./auth-provider-config.js";

export interface OidcIdentityProfile {
  subject: string;
  username: string | null;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  groups: string[];
}

export interface OidcAuthorizationRequestState {
  state: string;
  nonce: string;
  codeVerifier: string;
}

function normalizeStringClaim(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeStringArrayClaim(value: unknown) {
  if (typeof value === "string") {
    return value.trim().length > 0 ? [value.trim()] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : null))
    .filter((entry): entry is string => Boolean(entry));
}

async function discoverOidcClient(
  config: OidcProviderConfig,
  secrets: OidcProviderSecretState,
  redirectUri: string,
) {
  const clientMetadata: Partial<client.ClientMetadata> = {
    redirect_uris: [redirectUri],
    response_types: ["code"],
    token_endpoint_auth_method: secrets.clientSecret ? "client_secret_post" : "none",
  };

  return client.discovery(
    new URL(config.issuerUrl),
    config.clientId,
    clientMetadata,
    secrets.clientSecret ? client.ClientSecretPost(secrets.clientSecret) : client.None(),
  );
}

function mapOidcIdentityProfile(
  config: OidcProviderConfig,
  claims: Record<string, unknown>,
) {
  return {
    subject: normalizeStringClaim(claims.sub) ?? "",
    username: normalizeStringClaim(claims[config.usernameClaim]),
    email: normalizeStringClaim(claims[config.emailClaim])?.toLowerCase() ?? null,
    displayName: normalizeStringClaim(claims[config.displayNameClaim]),
    emailVerified: claims.email_verified === true,
    groups: config.groupsClaim ? normalizeStringArrayClaim(claims[config.groupsClaim]) : [],
  } satisfies OidcIdentityProfile;
}

export async function testOidcProviderConfiguration(
  config: OidcProviderConfig,
  secrets: OidcProviderSecretState,
  redirectUri: string,
) {
  const oidcClient = await discoverOidcClient(config, secrets, redirectUri);
  const metadata = oidcClient.serverMetadata();

  if (!metadata.authorization_endpoint || !metadata.token_endpoint) {
    throw new Error("OIDC discovery did not expose authorization and token endpoints");
  }

  return {
    issuer: metadata.issuer,
    authorizationEndpoint: metadata.authorization_endpoint,
    tokenEndpoint: metadata.token_endpoint,
    endSessionEndpoint: metadata.end_session_endpoint ?? null,
  };
}

export async function beginOidcAuthorization(
  config: OidcProviderConfig,
  secrets: OidcProviderSecretState,
  redirectUri: string,
) {
  const oidcClient = await discoverOidcClient(config, secrets, redirectUri);
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomNonce();
  const authorizationUrl = client.buildAuthorizationUrl(oidcClient, {
    redirect_uri: redirectUri,
    scope: config.scopes,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });

  return {
    authorizationUrl,
    state,
    nonce,
    codeVerifier,
  } satisfies OidcAuthorizationRequestState & { authorizationUrl: URL };
}

export async function completeOidcAuthorization(
  config: OidcProviderConfig,
  secrets: OidcProviderSecretState,
  redirectUri: string,
  callbackUrl: string,
  requestState: OidcAuthorizationRequestState,
) {
  const oidcClient = await discoverOidcClient(config, secrets, redirectUri);
  const tokens = await client.authorizationCodeGrant(
    oidcClient,
    new URL(callbackUrl),
    {
      expectedNonce: requestState.nonce,
      expectedState: requestState.state,
      pkceCodeVerifier: requestState.codeVerifier,
    },
  );
  const claimSource = tokens.claims()
    ?? (
      tokens.access_token
        ? await client.fetchUserInfo(oidcClient, tokens.access_token, client.skipSubjectCheck)
        : undefined
    );

  if (!claimSource) {
    throw new Error("OIDC provider did not return identity claims");
  }

  const identity = mapOidcIdentityProfile(config, claimSource as Record<string, unknown>);

  if (!identity.subject) {
    throw new Error("OIDC identity is missing the required subject claim");
  }

  if (config.requireVerifiedEmail && identity.email && identity.emailVerified !== true) {
    throw new Error("OIDC identity email address is not verified");
  }

  return {
    identity,
    metadata: oidcClient.serverMetadata(),
  };
}

export async function buildOidcLogoutUrl(
  config: OidcProviderConfig,
  secrets: OidcProviderSecretState,
  redirectUri: string,
) {
  const oidcClient = await discoverOidcClient(config, secrets, redirectUri);
  const endSessionEndpoint = oidcClient.serverMetadata().end_session_endpoint;

  if (!endSessionEndpoint) {
    return null;
  }

  const logoutUrl = new URL(endSessionEndpoint);
  logoutUrl.searchParams.set("client_id", config.clientId);
  logoutUrl.searchParams.set("post_logout_redirect_uri", redirectUri);
  return logoutUrl.toString();
}
