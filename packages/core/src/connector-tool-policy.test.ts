import {
  type ConnectorToolPolicy,
  DEFAULT_NEW_BOT_CONNECTOR_TOOL_POLICY,
  parseConnectorToolPolicy,
} from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { isConnectorWriteName } from "./action-approval.js";
import { connectorToolSlugs, evaluateConnectorToolPolicy } from "./connector-tool-policy.js";

const policy = (overrides: Partial<ConnectorToolPolicy> = {}): ConnectorToolPolicy => ({
  ...DEFAULT_NEW_BOT_CONNECTOR_TOOL_POLICY,
  ...overrides,
});

const multi = (...slugs: string[]) => ({
  tools: slugs.map((tool_slug) => ({ tool_slug, arguments: {} })),
});

describe("isConnectorWriteName", () => {
  it.each([
    "SLACK_LIST_CONVERSATIONS",
    "SLACK_FETCH_CONVERSATION_HISTORY",
    "SLACK_RETRIEVE_CONVERSATION_INFORMATION",
    "SLACK_SEARCH_MESSAGES",
    "SLACK_FIND_USERS",
    "GITHUB_GET_A_PULL_REQUEST",
    "GMAIL_FETCH_EMAILS",
    "JIRA_SEARCH_FOR_ISSUES_USING_JQL_GET",
    "COMPOSIO_SEARCH_TOOLS",
    "COMPOSIO_GET_TOOL_SCHEMAS",
  ])("treats %s as a read", (name) => {
    expect(isConnectorWriteName(name)).toBe(false);
  });

  it.each([
    "SLACK_SEND_MESSAGE",
    "SLACK_ADD_REACTION_TO_AN_ITEM",
    "SLACK_DELETE_A_MESSAGE",
    "GMAIL_CREATE_EMAIL_DRAFT",
    "GITHUB_MERGE_A_PULL_REQUEST",
    "JIRA_TRANSITION_ISSUE_AND_COMMENT",
    "COMPOSIO_MULTI_EXECUTE_TOOL",
    "COMPOSIO_REMOTE_WORKBENCH",
    "SOMETHING_UNFAMILIAR",
  ])("treats %s as a write", (name) => {
    expect(isConnectorWriteName(name)).toBe(true);
  });
});

describe("connectorToolSlugs", () => {
  it("returns the tool itself for a direct call", () => {
    expect(connectorToolSlugs("SLACK_SEND_MESSAGE", {})).toEqual(["SLACK_SEND_MESSAGE"]);
  });

  it("reads the real tools out of a Composio wrapper call", () => {
    expect(
      connectorToolSlugs(
        "COMPOSIO_MULTI_EXECUTE_TOOL",
        multi("SLACK_LIST_CONVERSATIONS", "SLACK_SEND_MESSAGE"),
      ),
    ).toEqual(["SLACK_LIST_CONVERSATIONS", "SLACK_SEND_MESSAGE"]);
  });

  it("falls back to the wrapper when its tools cannot be read", () => {
    expect(connectorToolSlugs("COMPOSIO_MULTI_EXECUTE_TOOL", {})).toEqual([
      "COMPOSIO_MULTI_EXECUTE_TOOL",
    ]);
    expect(connectorToolSlugs("COMPOSIO_MULTI_EXECUTE_TOOL", { tools: "nope" })).toEqual([
      "COMPOSIO_MULTI_EXECUTE_TOOL",
    ]);
    expect(connectorToolSlugs("COMPOSIO_MULTI_EXECUTE_TOOL", { tools: [{}, 5] })).toEqual([
      "COMPOSIO_MULTI_EXECUTE_TOOL",
      "COMPOSIO_MULTI_EXECUTE_TOOL",
    ]);
  });
});

describe("evaluateConnectorToolPolicy", () => {
  it("allows everything when the bot has no policy", () => {
    expect(evaluateConnectorToolPolicy(null, ["SLACK_SEND_MESSAGE"])).toEqual({
      decision: "allow",
    });
  });

  it("lets reads through and blocks writes under the default policy", () => {
    expect(evaluateConnectorToolPolicy(policy(), ["SLACK_LIST_CONVERSATIONS"]).decision).toBe(
      "allow",
    );
    const verdict = evaluateConnectorToolPolicy(policy(), ["SLACK_SEND_MESSAGE"]);
    expect(verdict.decision).toBe("block");
    if (verdict.decision === "block") {
      expect(verdict.message).toContain("SLACK_SEND_MESSAGE");
      expect(verdict.message).toContain("Connector tools");
    }
  });

  it("blocks a whole wrapper call when one of its tools is a write", () => {
    const slugs = connectorToolSlugs(
      "COMPOSIO_MULTI_EXECUTE_TOOL",
      multi("SLACK_FETCH_CONVERSATION_HISTORY", "SLACK_SEND_MESSAGE"),
    );
    expect(evaluateConnectorToolPolicy(policy(), slugs).decision).toBe("block");
  });

  it("lets a listed write tool through, ignoring case", () => {
    const allowed = policy({ allowWriteTools: ["slack_send_message"] });
    expect(evaluateConnectorToolPolicy(allowed, ["SLACK_SEND_MESSAGE"]).decision).toBe("allow");
    expect(evaluateConnectorToolPolicy(allowed, ["SLACK_DELETE_A_MESSAGE"]).decision).toBe("block");
  });

  it("asks for approval every time in ask mode", () => {
    const ask = policy({ writes: "ask" });
    expect(evaluateConnectorToolPolicy(ask, ["SLACK_SEND_MESSAGE"])).toEqual({
      decision: "ask",
      slugs: ["SLACK_SEND_MESSAGE"],
    });
    expect(evaluateConnectorToolPolicy(ask, ["SLACK_LIST_CONVERSATIONS"]).decision).toBe("allow");
  });

  it("leaves writes to the normal gate in allow mode", () => {
    expect(
      evaluateConnectorToolPolicy(policy({ writes: "allow" }), ["SLACK_SEND_MESSAGE"]).decision,
    ).toBe("allow");
  });

  it("always honors the block list, even for reads and in allow mode", () => {
    const blocking = policy({ writes: "allow", blockTools: ["Slack_Search_Messages"] });
    expect(evaluateConnectorToolPolicy(blocking, ["SLACK_SEARCH_MESSAGES"]).decision).toBe("block");
  });

  it("lets block beat ask", () => {
    const mixed = policy({ writes: "ask", blockTools: ["SLACK_DELETE_A_MESSAGE"] });
    expect(
      evaluateConnectorToolPolicy(mixed, ["SLACK_SEND_MESSAGE", "SLACK_DELETE_A_MESSAGE"]).decision,
    ).toBe("block");
  });
});

describe("parseConnectorToolPolicy", () => {
  it("treats null, undefined and malformed values as no policy", () => {
    expect(parseConnectorToolPolicy(null)).toBeNull();
    expect(parseConnectorToolPolicy(undefined)).toBeNull();
    expect(parseConnectorToolPolicy({ writes: "sometimes" })).toBeNull();
    expect(parseConnectorToolPolicy("block")).toBeNull();
  });

  it("fills in empty lists", () => {
    expect(parseConnectorToolPolicy({ writes: "block" })).toEqual({
      writes: "block",
      allowWriteTools: [],
      blockTools: [],
    });
  });
});
