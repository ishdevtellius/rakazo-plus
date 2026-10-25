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

describe("catalog wrapper tools", () => {
  const block: ConnectorToolPolicy = { writes: "block", allowWriteTools: [], blockTools: [] };
  const verdict = (tool: string, args: Record<string, unknown>) =>
    evaluateConnectorToolPolicy(block, connectorToolSlugs(tool, args)).decision;

  it("lets search and load through: they only read", () => {
    expect(verdict("connectors_search_tools", { query: "jira" })).toBe("allow");
    expect(verdict("connectors_load_tool", { id: "atlassian:createJiraIssue" })).toBe("allow");
    expect(verdict("composio_search_tools", {})).toBe("allow");
  });

  it("judges execute by the tool its id names, not by the wrapper", () => {
    const run = (name: string) => ({ id: `atlassian:${encodeURIComponent(name)}`, arguments: {} });
    expect(verdict("connectors_execute_tool", run("searchJiraIssuesUsingJql"))).toBe("allow");
    expect(verdict("connectors_execute_tool", run("getJiraIssue"))).toBe("allow");
    expect(verdict("connectors_execute_tool", run("createJiraIssue"))).toBe("block");
    expect(verdict("connectors_execute_tool", run("transitionJiraIssue"))).toBe("block");
  });

  it("reads a bare tool name as the id, as MCP servers use", () => {
    const bare = (id: string) => ({ id, arguments: {} });
    expect(verdict("connectors_execute_tool", bare("getAccessibleAtlassianResources"))).toBe(
      "allow",
    );
    expect(
      verdict("connectors_execute_tool", bare("mcp__atlassian.com__searchJiraIssuesUsingJql")),
    ).toBe("allow");
    expect(verdict("connectors_execute_tool", bare("createJiraIssue"))).toBe("block");
    expect(verdict("connectors_execute_tool", bare("mcp__atlassian.com__editJiraIssue"))).toBe(
      "block",
    );
  });

  it("blocks an execute call whose id cannot be read", () => {
    expect(verdict("connectors_execute_tool", {})).toBe("block");
    expect(verdict("connectors_execute_tool", { id: "   " })).toBe("block");
    expect(verdict("connectors_execute_tool", { id: "x:" })).toBe("block");
    expect(verdict("connectors_execute_tool", { id: "x:%E0%A4%A" })).toBe("block");
  });

  it("names the real tool when it blocks an execute call", () => {
    const slugs = connectorToolSlugs("connectors_execute_tool", {
      id: "atlassian:createJiraIssue",
      arguments: {},
    });
    expect(slugs).toEqual(["createJiraIssue"]);
  });
});

describe("camelCase tool names", () => {
  it("reads camelCase reads as reads and camelCase writes as writes", () => {
    for (const name of [
      "getJiraIssue",
      "searchJiraIssuesUsingJql",
      "getConfluencePage",
      "lookupJiraAccountId",
      "getVisibleJiraProjects",
      "atlassianUserInfo2".replace("atlassianUserInfo2", "getAccessibleAtlassianResources"),
    ]) {
      expect(isConnectorWriteName(name), name).toBe(false);
    }
    for (const name of [
      "createJiraIssue",
      "editJiraIssue",
      "transitionJiraIssue",
      "addCommentToJiraIssue",
      "updateConfluencePage",
      "createConfluencePage",
      "addWorklogToJiraIssue",
      "executeWrite",
      "executeDestructive",
    ]) {
      expect(isConnectorWriteName(name), name).toBe(true);
    }
  });
});

describe("connector tool classification", () => {
  const reads = [
    "GITHUB_GET_A_COMMIT",
    "GITHUB_GET_A_WORKFLOW_RUN",
    "GITHUB_LIST_COMMITS",
    "SLACK_SEARCH_MESSAGES",
    "SLACK_LIST_CONVERSATIONS",
    "search_issues_and_pull_requests",
    "RETRIEVE_CHARGE",
    "get_merge_request",
    "get_share_link",
    "mcp__notion__notion-search",
    "mcp__context7__get-library-docs",
    "pc-files/read_file",
    "files.list",
    "getJiraIssue",
    "mcp__atlassian.com__searchJiraIssuesUsingJql",
  ];
  const writes = [
    "SLACK_SEND_MESSAGE",
    "GITHUB_COMMIT_MULTIPLE_FILES",
    "createJiraIssue",
    "mcp__atlassian.com__editJiraIssue",
    "mcp__search_api__append_row",
    "mcp__list_service__toggle_flag",
    "search__pin_message",
    "get_or_create_user",
    "search_and_replace",
    "list_and_delete_all",
    "find_then_archive",
    "drive.files.delete",
    "mark_as_read",
    "UNKNOWN_THING",
    "toggle_flag",
    "execute_sql",
    "COMPOSIO_REMOTE_BASH_TOOL",
    "composio.COMPOSIO_MANAGE_CONNECTIONS",
  ];
  it.each(reads)("treats %s as a read", (name) => {
    expect(isConnectorWriteName(name)).toBe(false);
  });
  it.each(writes)("treats %s as a write", (name) => {
    expect(isConnectorWriteName(name)).toBe(true);
  });

  it("matches block and allow lists by canonical name, however the call is spelled", () => {
    const blockList = policy({ writes: "allow", blockTools: ["mcp__github__delete_repo"] });
    expect(evaluateConnectorToolPolicy(blockList, ["delete_repo"]).decision).toBe("block");
    expect(evaluateConnectorToolPolicy(blockList, ["github/delete-repo"]).decision).toBe("block");
    const allowList = policy({ writes: "block", allowWriteTools: ["send_message"] });
    expect(evaluateConnectorToolPolicy(allowList, ["mcp__slack__send_message"]).decision).toBe(
      "allow",
    );
    expect(evaluateConnectorToolPolicy(allowList, ["SLACK_SEND_MESSAGE"]).decision).toBe("block");
  });

  it("unwraps a Composio wrapper that a connector prefixed on a name clash", () => {
    expect(
      connectorToolSlugs("composio.COMPOSIO_MULTI_EXECUTE_TOOL", {
        tools: [{ tool_slug: "SLACK_LIST_CONVERSATIONS" }, { tool_slug: "SLACK_SEND_MESSAGE" }],
      }),
    ).toEqual(["SLACK_LIST_CONVERSATIONS", "SLACK_SEND_MESSAGE"]);
  });

  it("reads a group-qualified catalog id by the tool it names", () => {
    const block = policy({ writes: "block" });
    const run = (id: string) =>
      evaluateConnectorToolPolicy(block, connectorToolSlugs("connectors_execute_tool", { id }))
        .decision;
    expect(run("search__pin_message")).toBe("block");
    expect(run("github/list_repos")).toBe("allow");
    expect(run("github.delete_repo")).toBe("block");
  });
});
