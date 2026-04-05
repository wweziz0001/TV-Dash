import {
  ldapProviderConfigInputSchema,
  oidcProviderConfigInputSchema,
  type AuthProviderType,
  type LdapProviderConfigInput,
  type OidcProviderConfigInput,
  type UserRole,
} from "@tv-dash/shared";

export interface LdapProviderConfig {
  name: string;
  loginLabel: string;
  identifierLabel: string;
  identifierPlaceholder: string;
  isEnabled: boolean;
  isVisibleOnLogin: boolean;
  allowAutoProvision: boolean;
  autoLinkByEmail: boolean;
  autoLinkByUsername: boolean;
  defaultRole: UserRole;
  serverUrl: string;
  bindDn: string | null;
  userSearchBaseDn: string;
  userSearchFilter: string;
  userSearchScope: "base" | "one" | "sub";
  usernameAttribute: string;
  emailAttribute: string;
  displayNameAttribute: string;
  groupAttribute: string | null;
  startTls: boolean;
  rejectUnauthorized: boolean;
  timeoutMs: number;
  connectTimeoutMs: number;
}

export interface OidcProviderConfig {
  name: string;
  loginLabel: string;
  isEnabled: boolean;
  isVisibleOnLogin: boolean;
  allowAutoProvision: boolean;
  autoLinkByEmail: boolean;
  autoLinkByUsername: boolean;
  defaultRole: UserRole;
  issuerUrl: string;
  clientId: string;
  scopes: string;
  usernameClaim: string;
  emailClaim: string;
  displayNameClaim: string;
  groupsClaim: string | null;
  postLogoutRedirectPath: string;
  requireVerifiedEmail: boolean;
}

export interface LdapProviderSecretState {
  bindPassword: string | null;
}

export interface OidcProviderSecretState {
  clientSecret: string | null;
}

export interface AuthProviderAdminSummary {
  id: string;
  type: AuthProviderType;
  name: string;
  isEnabled: boolean;
  isVisibleOnLogin: boolean;
  allowAutoProvision: boolean;
  autoLinkByEmail: boolean;
  autoLinkByUsername: boolean;
  defaultRole: UserRole;
  lastValidatedAt: string | null;
  lastValidationStatus: "NEVER_VALIDATED" | "SUCCEEDED" | "FAILED";
  lastValidationMessage: string | null;
}

export const DEFAULT_LDAP_PROVIDER_INPUT: LdapProviderConfigInput = {
  name: "Enterprise LDAP",
  loginLabel: "Directory login",
  identifierLabel: "Username or email",
  identifierPlaceholder: "jane.doe",
  isEnabled: false,
  isVisibleOnLogin: true,
  allowAutoProvision: false,
  autoLinkByEmail: false,
  autoLinkByUsername: false,
  defaultRole: "USER",
  serverUrl: "ldaps://ldap.example.com",
  bindDn: null,
  userSearchBaseDn: "dc=example,dc=com",
  userSearchFilter: "(|(uid={identifier})(mail={identifier})(sAMAccountName={identifier}))",
  userSearchScope: "sub",
  usernameAttribute: "uid",
  emailAttribute: "mail",
  displayNameAttribute: "cn",
  groupAttribute: null,
  startTls: false,
  rejectUnauthorized: true,
  timeoutMs: 5000,
  connectTimeoutMs: 5000,
  clearBindPassword: false,
};

export const DEFAULT_OIDC_PROVIDER_INPUT: OidcProviderConfigInput = {
  name: "Enterprise SSO",
  loginLabel: "Continue with SSO",
  isEnabled: false,
  isVisibleOnLogin: true,
  allowAutoProvision: false,
  autoLinkByEmail: false,
  autoLinkByUsername: false,
  defaultRole: "USER",
  issuerUrl: "https://sso.example.com/realms/tv-dash",
  clientId: "tv-dash",
  scopes: "openid profile email",
  usernameClaim: "preferred_username",
  emailClaim: "email",
  displayNameClaim: "name",
  groupsClaim: null,
  postLogoutRedirectPath: "/login",
  requireVerifiedEmail: false,
  clearClientSecret: false,
};

export function buildStoredLdapProviderConfig(input: LdapProviderConfigInput) {
  const parsed = ldapProviderConfigInputSchema.parse(input);
  const { bindPassword: _bindPassword, clearBindPassword: _clearBindPassword, ...storedConfig } = parsed;
  return storedConfig;
}

export function parseStoredLdapProviderConfig(value: unknown) {
  const parsed = ldapProviderConfigInputSchema.parse(value);
  const { bindPassword: _bindPassword, clearBindPassword: _clearBindPassword, ...storedConfig } = parsed;
  return storedConfig;
}

export function buildStoredOidcProviderConfig(input: OidcProviderConfigInput) {
  const parsed = oidcProviderConfigInputSchema.parse(input);
  const { clientSecret: _clientSecret, clearClientSecret: _clearClientSecret, ...storedConfig } = parsed;
  return storedConfig;
}

export function parseStoredOidcProviderConfig(value: unknown) {
  const parsed = oidcProviderConfigInputSchema.parse(value);
  const { clientSecret: _clientSecret, clearClientSecret: _clearClientSecret, ...storedConfig } = parsed;
  return storedConfig;
}

export function buildLdapSecretState(
  input: LdapProviderConfigInput,
  existingSecret: LdapProviderSecretState,
): LdapProviderSecretState {
  if (input.clearBindPassword) {
    return { bindPassword: null };
  }

  return {
    bindPassword: input.bindPassword ?? existingSecret.bindPassword,
  };
}

export function buildOidcSecretState(
  input: OidcProviderConfigInput,
  existingSecret: OidcProviderSecretState,
): OidcProviderSecretState {
  if (input.clearClientSecret) {
    return { clientSecret: null };
  }

  return {
    clientSecret: input.clientSecret ?? existingSecret.clientSecret,
  };
}
