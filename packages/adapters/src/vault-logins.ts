import { randomBytes } from "node:crypto";
import type { SecretStore } from "@rakazo/adapter-kit";
import type { VaultLoginMetadata } from "@rakazo/contracts";
import { decodeLoginSecret } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { normalizeSecretDestination } from "./bot-secrets.js";
import { deleteSecretBestEffort } from "./secret-store-factory.js";

export type VaultScope = { userId: string; spaceId: string };

const MAX_VAULT_LOGINS = 100;

const select = {
  id: true,
  name: true,
  origin: true,
  createdAt: true,
  updatedAt: true,
  bots: { select: { botId: true } },
} as const;

function metadata(row: {
  id: string;
  name: string;
  origin: string;
  createdAt: Date;
  updatedAt: Date;
  bots: Array<{ botId: string }>;
}): VaultLoginMetadata {
  return {
    id: row.id,
    name: row.name,
    origin: row.origin,
    botIds: row.bots.map((bot) => bot.botId).sort(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listVaultLogins(prisma: PrismaClient, scope: VaultScope) {
  const rows = await prisma.vaultLogin.findMany({
    where: scope,
    select,
    orderBy: { name: "asc" },
    take: MAX_VAULT_LOGINS,
  });
  return rows.map(metadata);
}

/** Save or replace a login. The site cannot change on a replace: remove it and add it again. */
export async function putVaultLogin(input: {
  prisma: PrismaClient;
  secretStore: SecretStore;
  scope: VaultScope;
  name: string;
  origin: string;
  value: string;
}): Promise<VaultLoginMetadata> {
  const { prisma, secretStore, scope } = input;
  // Same rules as a bot's own website login: an HTTPS origin and a username and password pair.
  const destination = normalizeSecretDestination({
    name: input.name,
    origin: input.origin,
    auth: { type: "login" },
  });
  if (destination.auth.type !== "login") throw new Error("Invalid login");
  const origin = destination.origin;
  if (new URL(origin).protocol !== "https:") {
    throw new Error("Vault logins can only be used on an HTTPS site");
  }
  decodeLoginSecret(input.value);
  const existing = await prisma.vaultLogin.findUnique({
    where: { userId_spaceId_name: { ...scope, name: destination.name } },
  });
  if (existing && existing.origin !== origin) {
    throw new Error("Remove the existing login before changing its site");
  }
  if (!existing && (await prisma.vaultLogin.count({ where: scope })) >= MAX_VAULT_LOGINS) {
    throw new Error("Login limit reached");
  }
  const id = existing?.id ?? randomBytes(12).toString("hex");
  const stored = await secretStore.put(
    input.value,
    {
      operationId: id,
      traceId: id,
      userId: scope.userId,
      spaceId: scope.spaceId,
      signal: new AbortController().signal,
    },
    { recordId: id },
  );
  const row = await prisma.vaultLogin.upsert({
    where: { userId_spaceId_name: { ...scope, name: destination.name } },
    create: { id, ...scope, name: destination.name, origin, ciphertext: stored.ciphertext },
    update: { ciphertext: stored.ciphertext },
    select,
  });
  if (existing && existing.ciphertext !== stored.ciphertext) {
    await deleteSecretBestEffort(secretStore, existing.ciphertext, existing.id);
  }
  return metadata(row);
}

export async function removeVaultLogin(
  prisma: PrismaClient,
  secretStore: SecretStore,
  scope: VaultScope,
  id: string,
) {
  const row = await prisma.vaultLogin.findFirst({ where: { id, ...scope } });
  if (!row) return;
  await prisma.vaultLogin.delete({ where: { id: row.id } });
  await deleteSecretBestEffort(secretStore, row.ciphertext, row.id);
}

/** Replace the set of bots allowed to use one login. Unknown or archived bots are refused. */
export async function setVaultLoginAccess(
  prisma: PrismaClient,
  scope: VaultScope,
  id: string,
  botIds: string[],
): Promise<VaultLoginMetadata> {
  const unique = [...new Set(botIds)];
  return prisma.$transaction(async (tx) => {
    const login = await tx.vaultLogin.findFirst({ where: { id, ...scope }, select: { id: true } });
    if (!login) throw new Error("Login not found");
    const bots = await tx.bot.findMany({
      where: { id: { in: unique }, ...scope, archivedAt: null },
      select: { id: true },
    });
    if (bots.length !== unique.length) throw new Error("Bot not found");
    await tx.botVaultLogin.deleteMany({ where: { vaultLoginId: id } });
    if (unique.length) {
      await tx.botVaultLogin.createMany({
        data: unique.map((botId) => ({ botId, vaultLoginId: id })),
      });
    }
    return metadata(await tx.vaultLogin.findUniqueOrThrow({ where: { id }, select }));
  });
}
