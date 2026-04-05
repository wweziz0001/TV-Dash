import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnsureDefaultAuthProviders = vi.fn();
const mockFindAuthProviderByType = vi.fn();
const mockFindExternalIdentityByProviderSubject = vi.fn();
const mockFindExternalIdentityForUser = vi.fn();
const mockListAuthProviders = vi.fn();
const mockCreateExternalIdentity = vi.fn();
const mockUpdateExternalIdentity = vi.fn();
const mockFindUserByEmail = vi.fn();
const mockFindUserByUsername = vi.fn();
const mockCreateUser = vi.fn();
const mockAuthenticateAgainstLdap = vi.fn();

vi.mock("../../db/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: object) => Promise<unknown>) => callback({})),
  },
}));

vi.mock("./auth-provider.repository.js", () => ({
  ensureDefaultAuthProviders: mockEnsureDefaultAuthProviders,
  findAuthProviderByType: mockFindAuthProviderByType,
  findExternalIdentityByProviderSubject: mockFindExternalIdentityByProviderSubject,
  findExternalIdentityForUser: mockFindExternalIdentityForUser,
  listAuthProviders: mockListAuthProviders,
  createExternalIdentity: mockCreateExternalIdentity,
  updateExternalIdentity: mockUpdateExternalIdentity,
  updateAuthProvider: vi.fn(),
}));

vi.mock("./auth.repository.js", () => ({
  findUserByEmail: mockFindUserByEmail,
  findUserByUsername: mockFindUserByUsername,
  findAuthenticatedUser: vi.fn(),
  invalidateUserSessions: vi.fn(),
  createUser: mockCreateUser,
}));

vi.mock("./ldap-auth.js", () => ({
  authenticateAgainstLdap: mockAuthenticateAgainstLdap,
  testLdapProviderConnection: vi.fn(),
}));

const {
  authenticateLdapCredentials,
  getPublicAuthProviderOptions,
} = await import("./auth.service.js");

function buildLdapProvider(overrides: Record<string, unknown> = {}) {
  return {
    id: "provider-ldap",
    type: "LDAP",
    name: "Enterprise LDAP",
    isEnabled: true,
    isVisibleOnLogin: true,
    allowAutoProvision: false,
    autoLinkByEmail: true,
    autoLinkByUsername: false,
    defaultRole: "USER",
    configurationJson: {
      name: "Enterprise LDAP",
      loginLabel: "Directory login",
      identifierLabel: "Username or email",
      identifierPlaceholder: "jane.doe",
      isEnabled: true,
      isVisibleOnLogin: true,
      allowAutoProvision: false,
      autoLinkByEmail: true,
      autoLinkByUsername: false,
      defaultRole: "USER",
      serverUrl: "ldaps://ldap.example.com",
      bindDn: null,
      userSearchBaseDn: "dc=example,dc=com",
      userSearchFilter: "(uid={identifier})",
      userSearchScope: "sub",
      usernameAttribute: "uid",
      emailAttribute: "mail",
      displayNameAttribute: "cn",
      groupAttribute: null,
      startTls: false,
      rejectUnauthorized: true,
      timeoutMs: 5000,
      connectTimeoutMs: 5000,
    },
    secretCiphertext: null,
    lastValidatedAt: null,
    lastValidationStatus: "NEVER_VALIDATED",
    lastValidationMessage: null,
    createdAt: new Date("2026-04-05T00:00:00.000Z"),
    updatedAt: new Date("2026-04-05T00:00:00.000Z"),
    ...overrides,
  };
}

function buildOidcProvider(overrides: Record<string, unknown> = {}) {
  return {
    id: "provider-oidc",
    type: "OIDC",
    name: "Enterprise SSO",
    isEnabled: true,
    isVisibleOnLogin: true,
    allowAutoProvision: false,
    autoLinkByEmail: false,
    autoLinkByUsername: false,
    defaultRole: "USER",
    configurationJson: {
      name: "Enterprise SSO",
      loginLabel: "Continue with SSO",
      isEnabled: true,
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
    },
    secretCiphertext: null,
    lastValidatedAt: null,
    lastValidationStatus: "NEVER_VALIDATED",
    lastValidationMessage: null,
    createdAt: new Date("2026-04-05T00:00:00.000Z"),
    updatedAt: new Date("2026-04-05T00:00:00.000Z"),
    ...overrides,
  };
}

describe("auth.service enterprise auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns only enabled and visible public providers", async () => {
    mockListAuthProviders.mockResolvedValue([
      buildLdapProvider({ isEnabled: true, isVisibleOnLogin: true }),
      buildOidcProvider({ isEnabled: false, isVisibleOnLogin: true }),
    ]);

    const result = await getPublicAuthProviderOptions();

    expect(result.local.enabled).toBe(true);
    expect(result.ldap?.loginLabel).toBe("Directory login");
    expect(result.oidc).toBeNull();
  });

  it("links an LDAP identity to an existing user by email on first login", async () => {
    const existingUser = {
      id: "user-1",
      email: "jane@example.com",
      username: "jane",
      role: "USER",
      sessionVersion: 1,
      createdAt: new Date("2026-04-05T00:00:00.000Z"),
      updatedAt: new Date("2026-04-05T00:00:00.000Z"),
    };

    mockFindAuthProviderByType.mockResolvedValue(buildLdapProvider());
    mockAuthenticateAgainstLdap.mockResolvedValue({
      subject: "uid=jane,dc=example,dc=com",
      username: "jane",
      email: "jane@example.com",
      displayName: "Jane Ops",
      groups: [],
    });
    mockFindExternalIdentityByProviderSubject.mockResolvedValue(null);
    mockFindUserByEmail.mockResolvedValue(existingUser);
    mockFindExternalIdentityForUser.mockResolvedValue(null);
    mockCreateExternalIdentity.mockResolvedValue({
      id: "identity-1",
    });

    const result = await authenticateLdapCredentials({
      identifier: "jane",
      password: "secret",
    });

    expect(mockCreateExternalIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        providerId: "provider-ldap",
        externalSubject: "uid=jane,dc=example,dc=com",
      }),
      expect.any(Object),
    );
    expect(result.user.id).toBe("user-1");
    expect(result.session.providerType).toBe("LDAP");
  });

  it("auto-provisions a new LDAP-linked user when no local match exists", async () => {
    const provider = buildLdapProvider({
      allowAutoProvision: true,
      autoLinkByEmail: false,
    });

    mockFindAuthProviderByType.mockResolvedValue(provider);
    mockAuthenticateAgainstLdap.mockResolvedValue({
      subject: "uid=new-user,dc=example,dc=com",
      username: "new.user",
      email: "new.user@example.com",
      displayName: "New User",
      groups: [],
    });
    mockFindExternalIdentityByProviderSubject.mockResolvedValue(null);
    mockFindUserByEmail.mockResolvedValue(null);
    mockFindUserByUsername.mockResolvedValue(null);
    mockCreateUser.mockResolvedValue({
      id: "user-2",
      email: "new.user@example.com",
      username: "new.user",
      role: "USER",
      sessionVersion: 0,
      createdAt: new Date("2026-04-05T00:00:00.000Z"),
      updatedAt: new Date("2026-04-05T00:00:00.000Z"),
    });

    const result = await authenticateLdapCredentials({
      identifier: "new.user",
      password: "secret",
    });

    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new.user@example.com",
        username: "new.user",
        passwordHash: null,
      }),
      expect.any(Object),
    );
    expect(result.user.id).toBe("user-2");
  });

  it("reuses an existing linked external identity on repeat login", async () => {
    mockFindAuthProviderByType.mockResolvedValue(buildLdapProvider());
    mockAuthenticateAgainstLdap.mockResolvedValue({
      subject: "uid=jane,dc=example,dc=com",
      username: "jane",
      email: "jane@example.com",
      displayName: "Jane Ops",
      groups: [],
    });
    mockFindExternalIdentityByProviderSubject.mockResolvedValue({
      id: "identity-1",
      userId: "user-1",
      providerId: "provider-ldap",
      externalSubject: "uid=jane,dc=example,dc=com",
      externalUsername: "jane",
      externalEmail: "jane@example.com",
      externalDisplayName: "Jane Ops",
      lastLoginAt: new Date("2026-04-05T00:00:00.000Z"),
      createdAt: new Date("2026-04-05T00:00:00.000Z"),
      updatedAt: new Date("2026-04-05T00:00:00.000Z"),
      user: {
        id: "user-1",
        email: "jane@example.com",
        username: "jane",
        passwordHash: null,
        role: "USER",
        sessionVersion: 4,
        createdAt: new Date("2026-04-05T00:00:00.000Z"),
        updatedAt: new Date("2026-04-05T00:00:00.000Z"),
      },
    });

    const result = await authenticateLdapCredentials({
      identifier: "jane",
      password: "secret",
    });

    expect(mockUpdateExternalIdentity).toHaveBeenCalledWith(
      "identity-1",
      expect.objectContaining({
        externalEmail: "jane@example.com",
      }),
    );
    expect(result.user.sessionVersion).toBe(4);
  });
});
