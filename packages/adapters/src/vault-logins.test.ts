import type { SecretStore } from "@rakazo/adapter-kit";
import { encodeLoginSecret } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { listBotSecrets, resolveLoginFill } from "./bot-secrets.js";
import { putVaultLogin, setVaultLoginAccess } from "./vault-logins.js";

const scope = { userId: "u1", spaceId: "s1" };
const login = encodeLoginSecret({ username: "demo-user", password: "hunter2-secret" });

function fakeStore() {
  const data = new Map<string, string>();
  const store = {
    async put(plaintext: string, _ctx: unknown, opts?: { recordId?: string }) {
      const ciphertext = `ct-${opts?.recordId}-${data.size}`;
      data.set(ciphertext, plaintext);
      return { ciphertext };
    },
    async load(ref: string) {
      const value = data.get(ref);
      if (value === undefined) throw new Error("missing");
      return value;
    },
    async delete(ref: string) {
      data.delete(ref);
    },
  };
  return { store: store as unknown as SecretStore, data };
}

type Row = {
  id: string;
  userId: string;
  spaceId: string;
  name: string;
  origin: string;
  ciphertext: string;
};

function fakePrisma(options: {
  vault?: Row[];
  granted?: string[];
  own?: Array<Record<string, unknown>>;
}) {
  const vault = options.vault ?? [];
  const prisma = {
    botSecret: {
      findMany: async () => options.own ?? [],
      findFirst: async ({ where }: { where: { name: string } }) =>
        (options.own ?? []).find((row) => row.name === where.name) ?? null,
    },
    botVaultLogin: {
      findMany: async () =>
        vault
          .filter((row) => (options.granted ?? []).includes(row.id))
          .map((row) => ({ vaultLogin: row })),
    },
    vaultLogin: {
      findUnique: async ({ where }: { where: { userId_spaceId_name: { name: string } } }) =>
        vault.find((row) => row.name === where.userId_spaceId_name.name) ?? null,
      count: async () => vault.length,
      create: async ({ data }: { data: Row }) => ({
        ...data,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        bots: [],
      }),
      update: async ({ where, data }: { where: { id: string }; data: { ciphertext: string } }) => ({
        ...(vault.find((row) => row.id === where.id) as Row),
        ...data,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        bots: [],
      }),
    },
  };
  return prisma as unknown as PrismaClient;
}

const botScope = { ...scope, botId: "b1" };

describe("vault logins", () => {
  it("lists a granted login to the bot, and the bot's own credential wins a name clash", async () => {
    const vault = [
      { id: "v1", ...scope, name: "vendor", origin: "https://app.example.com", ciphertext: "c" },
      { id: "v2", ...scope, name: "github", origin: "https://github.com", ciphertext: "c2" },
    ];
    const own = [{ name: "github", origin: "https://own.example.com", auth: { type: "login" } }];
    const listed = await listBotSecrets(
      fakePrisma({ vault, granted: ["v1", "v2"], own }),
      botScope,
    );
    expect(listed.map((row) => row.name)).toEqual(["github", "vendor"]);
    expect(
      (listed.find((row) => row.name === "github") as { origin?: string } | undefined)?.origin,
    ).toBe("https://own.example.com");
    expect(JSON.stringify(listed)).not.toContain("ciphertext");
  });

  it("lists nothing from the vault for a bot without a grant", async () => {
    const vault = [
      { id: "v1", ...scope, name: "vendor", origin: "https://a.com", ciphertext: "c" },
    ];
    expect(await listBotSecrets(fakePrisma({ vault, granted: [] }), botScope)).toEqual([]);
  });

  it("fills a granted vault login, only for its stored origin", async () => {
    const { store, data } = fakeStore();
    data.set("c", login);
    const vault = [
      { id: "v1", ...scope, name: "vendor", origin: "https://app.example.com", ciphertext: "c" },
    ];
    const prisma = fakePrisma({ vault, granted: ["v1"] });
    const user = await resolveLoginFill({
      prisma,
      secretStore: store,
      scope: botScope,
      name: "vendor",
      field: "username",
    });
    expect(user).toMatchObject({ text: "demo-user", origin: "https://app.example.com" });
    const denied = await resolveLoginFill({
      prisma: fakePrisma({ vault, granted: [] }),
      secretStore: store,
      scope: botScope,
      name: "vendor",
      field: "password",
    });
    expect(denied).toHaveProperty("error");
  });

  it("refuses a non-HTTPS site and a changed site on replace", async () => {
    const { store } = fakeStore();
    await expect(
      putVaultLogin({
        prisma: fakePrisma({}),
        secretStore: store,
        scope,
        name: "x",
        origin: "http://insecure.example.com",
        value: login,
      }),
    ).rejects.toThrow();
    const vault = [
      { id: "v1", ...scope, name: "vendor", origin: "https://a.com", ciphertext: "c" },
    ];
    await expect(
      putVaultLogin({
        prisma: fakePrisma({ vault }),
        secretStore: store,
        scope,
        name: "vendor",
        origin: "https://b.com",
        value: login,
        replace: true,
      }),
    ).rejects.toThrow("Remove the existing login");
  });

  it("saves a valid login without returning the password", async () => {
    const { store } = fakeStore();
    const saved = await putVaultLogin({
      prisma: fakePrisma({}),
      secretStore: store,
      scope,
      name: "vendor",
      origin: "https://app.example.com",
      value: login,
    });
    expect(saved.origin).toBe("https://app.example.com");
    expect(JSON.stringify(saved)).not.toContain("hunter2");
  });

  it("refuses to grant a bot that is not in the account", async () => {
    const tx = {
      vaultLogin: { findFirst: async () => ({ id: "v1" }) },
      bot: { findMany: async () => [] },
    };
    const prisma = {
      $transaction: async (fn: (t: unknown) => unknown) => fn(tx),
    } as unknown as PrismaClient;
    await expect(setVaultLoginAccess(prisma, scope, "v1", ["ghost"])).rejects.toThrow(
      "Bot not found",
    );
  });

  it("replaces the password of an existing login in place and drops the old secret", async () => {
    const { store, data } = fakeStore();
    data.set("old-ct", login);
    const vault = [
      {
        id: "v1",
        ...scope,
        name: "vendor",
        origin: "https://app.example.com",
        ciphertext: "old-ct",
      },
    ];
    const saved = await putVaultLogin({
      prisma: fakePrisma({ vault }),
      secretStore: store,
      scope,
      name: "vendor",
      origin: "https://app.example.com",
      value: encodeLoginSecret({ username: "demo-user", password: "another-secret" }),
      replace: true,
    });
    expect(saved.id).toBe("v1");
    expect(data.has("old-ct")).toBe(false);
    expect(JSON.stringify(saved)).not.toContain("another-secret");
  });

  it("never overwrites an existing login when adding, only when replacing", async () => {
    const { store, data } = fakeStore();
    data.set("old-ct", login);
    const vault = [
      {
        id: "v1",
        ...scope,
        name: "vendor",
        origin: "https://app.example.com",
        ciphertext: "old-ct",
      },
    ];
    await expect(
      putVaultLogin({
        prisma: fakePrisma({ vault }),
        secretStore: store,
        scope,
        name: "vendor",
        origin: "https://app.example.com",
        value: login,
      }),
    ).rejects.toThrow("already exists");
    expect(data.get("old-ct")).toBe(login);
  });

  it("reports a concurrent duplicate create as a name clash, not a server error", async () => {
    const { store } = fakeStore();
    const prisma = fakePrisma({});
    (prisma as unknown as { vaultLogin: { create: unknown } }).vaultLogin.create = async () => {
      throw Object.assign(new Error("unique"), { code: "P2002" });
    };
    await expect(
      putVaultLogin({
        prisma,
        secretStore: store,
        scope,
        name: "vendor",
        origin: "https://app.example.com",
        value: login,
      }),
    ).rejects.toThrow("A login with this name already exists");
  });

  it("drops an archived bot from a grant instead of failing every change", async () => {
    const createMany = vi.fn(async () => ({ count: 1 }));
    const tx = {
      vaultLogin: {
        findFirst: async () => ({ id: "v1" }),
        findUniqueOrThrow: async () => ({
          id: "v1",
          name: "vendor",
          origin: "https://app.example.com",
          createdAt: new Date(0),
          updatedAt: new Date(0),
          bots: [{ botId: "live" }],
        }),
      },
      bot: {
        findMany: async () => [
          { id: "live", archivedAt: null },
          { id: "gone", archivedAt: new Date(1) },
        ],
      },
      botVaultLogin: { deleteMany: async () => ({ count: 2 }), createMany },
    };
    const prisma = {
      $transaction: async (fn: (t: unknown) => unknown) => fn(tx),
    } as unknown as PrismaClient;
    const result = await setVaultLoginAccess(prisma, scope, "v1", ["live", "gone"]);
    expect(createMany).toHaveBeenCalledWith({ data: [{ botId: "live", vaultLoginId: "v1" }] });
    expect(result.botIds).toEqual(["live"]);
  });
});
