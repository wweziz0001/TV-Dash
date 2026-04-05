import type { AuthProviderType } from "@tv-dash/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import {
  DEFAULT_LDAP_PROVIDER_INPUT,
  DEFAULT_OIDC_PROVIDER_INPUT,
  buildStoredLdapProviderConfig,
  buildStoredOidcProviderConfig,
} from "./auth-provider-config.js";

type PrismaClientLike = Prisma.TransactionClient | typeof prisma;

const authProviderSelection = {
  id: true,
  type: true,
  name: true,
  isEnabled: true,
  isVisibleOnLogin: true,
  allowAutoProvision: true,
  autoLinkByEmail: true,
  autoLinkByUsername: true,
  defaultRole: true,
  configurationJson: true,
  secretCiphertext: true,
  lastValidatedAt: true,
  lastValidationStatus: true,
  lastValidationMessage: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AuthProviderSelect;

const externalIdentitySelection = {
  id: true,
  providerId: true,
  userId: true,
  externalSubject: true,
  externalUsername: true,
  externalEmail: true,
  externalDisplayName: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ExternalIdentitySelect;

function getClient(client?: PrismaClientLike) {
  return client ?? prisma;
}

export async function ensureDefaultAuthProviders(client?: PrismaClientLike) {
  const db = getClient(client);

  await db.authProvider.upsert({
    where: { type: "LDAP" },
    update: {},
    create: {
      type: "LDAP",
      name: DEFAULT_LDAP_PROVIDER_INPUT.name,
      configurationJson: buildStoredLdapProviderConfig(DEFAULT_LDAP_PROVIDER_INPUT),
    },
  });

  await db.authProvider.upsert({
    where: { type: "OIDC" },
    update: {},
    create: {
      type: "OIDC",
      name: DEFAULT_OIDC_PROVIDER_INPUT.name,
      configurationJson: buildStoredOidcProviderConfig(DEFAULT_OIDC_PROVIDER_INPUT),
    },
  });
}

export function listAuthProviders(client?: PrismaClientLike) {
  return getClient(client).authProvider.findMany({
    orderBy: {
      type: "asc",
    },
    select: authProviderSelection,
  });
}

export function findAuthProviderByType(type: AuthProviderType, client?: PrismaClientLike) {
  return getClient(client).authProvider.findUnique({
    where: { type },
    select: authProviderSelection,
  });
}

export function updateAuthProvider(
  type: AuthProviderType,
  data: Prisma.AuthProviderUpdateInput,
  client?: PrismaClientLike,
) {
  return getClient(client).authProvider.update({
    where: { type },
    data,
    select: authProviderSelection,
  });
}

export function findExternalIdentityByProviderSubject(
  providerId: string,
  externalSubject: string,
  client?: PrismaClientLike,
) {
  return getClient(client).externalIdentity.findUnique({
    where: {
      providerId_externalSubject: {
        providerId,
        externalSubject,
      },
    },
    select: {
      ...externalIdentitySelection,
      user: {
        select: {
          id: true,
          email: true,
          username: true,
          passwordHash: true,
          role: true,
          sessionVersion: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });
}

export function findExternalIdentityForUser(userId: string, providerId: string, client?: PrismaClientLike) {
  return getClient(client).externalIdentity.findFirst({
    where: {
      userId,
      providerId,
    },
    select: externalIdentitySelection,
  });
}

export function createExternalIdentity(
  data: Prisma.ExternalIdentityUncheckedCreateInput,
  client?: PrismaClientLike,
) {
  return getClient(client).externalIdentity.create({
    data,
    select: externalIdentitySelection,
  });
}

export function updateExternalIdentity(
  identityId: string,
  data: Prisma.ExternalIdentityUpdateInput,
  client?: PrismaClientLike,
) {
  return getClient(client).externalIdentity.update({
    where: { id: identityId },
    data,
    select: externalIdentitySelection,
  });
}
