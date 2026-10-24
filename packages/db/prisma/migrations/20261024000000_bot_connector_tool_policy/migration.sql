-- Per-bot policy for connector tools (writes allow/ask/block plus allow and block lists).
-- NULL keeps today's behavior: the approval gate alone decides.
ALTER TABLE "bots" ADD COLUMN "connectorToolPolicy" JSONB;
