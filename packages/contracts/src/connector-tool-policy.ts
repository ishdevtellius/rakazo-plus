import { z } from "zod";

/**
 * What a bot may do with connector tools that can change data (send, post, create, delete...).
 * `block` refuses them, `ask` always shows the approval card (even past an "Always allow" rule),
 * `allow` leaves the normal approval gate alone.
 */
export const CONNECTOR_WRITE_MODES = ["allow", "ask", "block"] as const;
export type ConnectorWriteMode = (typeof CONNECTOR_WRITE_MODES)[number];

const ToolSlug = z.string().trim().min(1).max(160);

export const ConnectorToolPolicySchema = z.object({
  /** How write tools are treated unless listed in `allowWriteTools`. */
  writes: z.enum(CONNECTOR_WRITE_MODES),
  /** Write tools this bot may call under the normal approval gate. */
  allowWriteTools: z.array(ToolSlug).max(200).default([]),
  /** Tools this bot may never call, read or write. */
  blockTools: z.array(ToolSlug).max(200).default([]),
});
export type ConnectorToolPolicy = z.infer<typeof ConnectorToolPolicySchema>;

/** New bots start with every write tool blocked; reads stay open. Existing bots stay null. */
export const DEFAULT_NEW_BOT_CONNECTOR_TOOL_POLICY: ConnectorToolPolicy = {
  writes: "block",
  allowWriteTools: [],
  blockTools: [],
};

/** Tool slugs compare case-insensitively: Composio uses SLACK_SEND_MESSAGE, MCP servers use snake_case. */
export function normalizeConnectorToolSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

/** Stored JSON back to a policy. Anything malformed is treated as no policy (today's behavior). */
export function parseConnectorToolPolicy(value: unknown): ConnectorToolPolicy | null {
  if (value === null || value === undefined) return null;
  const parsed = ConnectorToolPolicySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
