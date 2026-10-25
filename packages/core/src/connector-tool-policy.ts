import type { ConnectorToolPolicy } from "@rakazo/contracts";
import {
  canonicalConnectorToolName,
  connectorToolBaseName,
  isConnectorWriteName,
} from "./action-approval.js";

const COMPOSIO_MULTI_EXECUTE_TOOL = "COMPOSIO_MULTI_EXECUTE_TOOL";
const CATALOG_SEARCH_SUFFIX = "_search_tools";
const CATALOG_LOAD_SUFFIX = "_load_tool";
const CATALOG_EXECUTE_SUFFIX = "_execute_tool";

/**
 * The tools a connector call will actually run. Composio nests the real tool (SLACK_SEND_MESSAGE)
 * under `tools[].tool_slug` of one wrapper call, so the wrapper's own name says nothing about
 * whether it reads or writes. A wrapper call whose tools cannot be read counts as the wrapper
 * itself, which classifies as a write. The catalog wrappers behave the same way.
 */
export function connectorToolSlugs(toolName: string, args: Record<string, unknown>): string[] {
  // A connector can prefix the wrapper's name (composio.COMPOSIO_MULTI_EXECUTE_TOOL), so look at
  // the part that names the tool.
  const base = connectorToolBaseName(toolName);
  if (base.toUpperCase() === COMPOSIO_MULTI_EXECUTE_TOOL) {
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
  const lower = base.toLowerCase();
  // The lazy catalog wrappers (`<prefix>_search_tools`, `_load_tool`, `_execute_tool`) are generic:
  // searching and loading only read, and executing runs whichever tool `id` names.
  if (lower.endsWith(CATALOG_SEARCH_SUFFIX) || lower.endsWith(CATALOG_LOAD_SUFFIX)) return [];
  if (lower.endsWith(CATALOG_EXECUTE_SUFFIX)) {
    const inner = catalogInnerToolName(args.id);
    return [inner ?? toolName];
  }
  return [toolName];
}

/**
 * A catalog tool id is `<resource>:<encoded tool name>` for installed tools and the bare tool name
 * for the rest (MCP servers); either way the tool name is what reads or writes.
 */
function catalogInnerToolName(id: unknown): string | undefined {
  if (typeof id !== "string") return undefined;
  const trimmed = id.trim();
  if (!trimmed) return undefined;
  const separator = trimmed.indexOf(":");
  const encoded = separator > 0 ? trimmed.slice(separator + 1) : trimmed;
  if (!encoded) return undefined;
  try {
    const name = decodeURIComponent(encoded).trim();
    return name || undefined;
  } catch {
    return undefined;
  }
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
  // Compared by canonical name, so a list entry matches the tool however the call names it.
  const blockTools = new Set(policy.blockTools.map(canonicalConnectorToolName));
  const allowWriteTools = new Set(policy.allowWriteTools.map(canonicalConnectorToolName));
  const blocked: string[] = [];
  const asked: string[] = [];
  for (const slug of slugs) {
    const key = canonicalConnectorToolName(slug);
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
