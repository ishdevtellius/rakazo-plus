import { type ConnectorToolPolicy, normalizeConnectorToolSlug } from "@rakazo/contracts";
import { isConnectorWriteName } from "./action-approval.js";

const COMPOSIO_MULTI_EXECUTE_TOOL = "COMPOSIO_MULTI_EXECUTE_TOOL";

/**
 * The tools a connector call will actually run. Composio nests the real tool (SLACK_SEND_MESSAGE)
 * under `tools[].tool_slug` of one wrapper call, so the wrapper's own name says nothing about
 * whether it reads or writes. A wrapper call whose tools cannot be read counts as the wrapper
 * itself, which classifies as a write.
 */
export function connectorToolSlugs(toolName: string, args: Record<string, unknown>): string[] {
  if (toolName !== COMPOSIO_MULTI_EXECUTE_TOOL) return [toolName];
  const tools = args.tools;
  if (!Array.isArray(tools) || tools.length === 0) return [toolName];
  return tools.map((item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const slug = (item as Record<string, unknown>).tool_slug;
      if (typeof slug === "string" && slug.trim()) return slug.trim();
    }
    return toolName;
  });
}

export type ConnectorToolVerdict =
  | { decision: "allow" }
  | { decision: "ask"; slugs: string[] }
  | { decision: "block"; slugs: string[]; message: string };

/**
 * Applies a bot's connector tool policy to the tools one call would run. No policy (null) leaves
 * the normal approval gate in charge. Block beats ask, ask beats allow.
 */
export function evaluateConnectorToolPolicy(
  policy: ConnectorToolPolicy | null | undefined,
  slugs: readonly string[],
): ConnectorToolVerdict {
  if (!policy) return { decision: "allow" };
  const blockTools = new Set(policy.blockTools.map(normalizeConnectorToolSlug));
  const allowWriteTools = new Set(policy.allowWriteTools.map(normalizeConnectorToolSlug));
  const blocked: string[] = [];
  const asked: string[] = [];
  for (const slug of slugs) {
    const key = normalizeConnectorToolSlug(slug);
    if (blockTools.has(key)) {
      blocked.push(slug);
      continue;
    }
    if (!isConnectorWriteName(slug) || allowWriteTools.has(key)) continue;
    if (policy.writes === "block") blocked.push(slug);
    else if (policy.writes === "ask") asked.push(slug);
  }
  if (blocked.length > 0) {
    const names = [...new Set(blocked)].slice(0, 5).join(", ");
    return {
      decision: "block",
      slugs: blocked,
      message: `${names} is blocked for this bot. Tell the user which tool you needed and that they can allow it in the bot's settings under Connector tools. Do not retry it or look for a way around it.`,
    };
  }
  if (asked.length > 0) return { decision: "ask", slugs: asked };
  return { decision: "allow" };
}
