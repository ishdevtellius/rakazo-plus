-- CreateTable
CREATE TABLE "vault_logins" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vault_logins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_vault_logins" (
    "botId" TEXT NOT NULL,
    "vaultLoginId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_vault_logins_pkey" PRIMARY KEY ("botId","vaultLoginId")
);

-- CreateIndex
CREATE INDEX "vault_logins_spaceId_idx" ON "vault_logins"("spaceId");

-- CreateIndex
CREATE UNIQUE INDEX "vault_logins_userId_spaceId_name_key" ON "vault_logins"("userId", "spaceId", "name");

-- CreateIndex
CREATE INDEX "bot_vault_logins_vaultLoginId_idx" ON "bot_vault_logins"("vaultLoginId");

-- AddForeignKey
ALTER TABLE "vault_logins" ADD CONSTRAINT "vault_logins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_logins" ADD CONSTRAINT "vault_logins_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_vault_logins" ADD CONSTRAINT "bot_vault_logins_botId_fkey" FOREIGN KEY ("botId") REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_vault_logins" ADD CONSTRAINT "bot_vault_logins_vaultLoginId_fkey" FOREIGN KEY ("vaultLoginId") REFERENCES "vault_logins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
