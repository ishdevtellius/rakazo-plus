import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BotTemplate } from "../lib/bot-templates";

const create = vi.fn(async (input: Record<string, unknown>) => ({ id: "bot-1", ...input }));
const routineCreate = vi.fn(async (_input: Record<string, unknown>) => ({}));
const credentials = vi.fn(async () => [] as Array<{ provider: string; hasKey: boolean }>);
const me = vi.fn(async () => ({ timezone: "Europe/London" }) as { timezone?: string });

vi.mock("../lib/rpc", () => ({
  rpc: {
    bots: { create: (input: Record<string, unknown>) => create(input) },
    routines: { create: (input: Record<string, unknown>) => routineCreate(input) },
    models: { credentials: () => credentials() },
    me: () => me(),
  },
}));

// The component file also holds the install logic; its UI imports are not what is under test.
vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: (parts: TemplateStringsArray) => parts.join("") }),
  Trans: () => null,
}));
vi.mock("@rakazo/ui-web", () => ({
  Button: () => null,
  Dialog: () => null,
  DialogClose: () => null,
  DialogContent: () => null,
  DialogHeader: () => null,
  DialogTitle: () => null,
  Input: () => null,
}));
vi.mock("lucide-react", () => ({ X: () => null }));

import { installBotTemplate } from "./BotTemplatesOverlay";

const template: BotTemplate = {
  id: "t",
  category: "Operations",
  name: "Example",
  title: "Title",
  summary: "Summary",
  never: "Never does anything risky.",
  connectors: [],
  description: "Description",
  instructions: "You are Example.",
  computerMode: "dedicated",
  model: { provider: "anthropic", modelId: "claude-sonnet-5-5" },
  connectorToolPolicy: { writes: "block", allowWriteTools: [], blockTools: [] },
  routine: {
    name: "Daily",
    prompt: "Do it",
    crons: ["30 7 * * 1-5"],
    timezone: "UTC",
  },
};

beforeEach(() => {
  create.mockClear();
  routineCreate.mockClear();
  credentials.mockResolvedValue([]);
  me.mockResolvedValue({ timezone: "Europe/London" });
  routineCreate.mockResolvedValue({});
});

describe("installBotTemplate", () => {
  it("pins the model only when its provider is connected", async () => {
    credentials.mockResolvedValue([{ provider: "anthropic", hasKey: true }]);
    await installBotTemplate(template, []);
    expect(create).toHaveBeenLastCalledWith(
      expect.objectContaining({ modelProvider: "anthropic", modelId: "claude-sonnet-5-5" }),
    );
    credentials.mockResolvedValue([{ provider: "openai", hasKey: true }]);
    await installBotTemplate(template, []);
    expect(create).toHaveBeenLastCalledWith(
      expect.objectContaining({ modelProvider: null, modelId: null }),
    );
    credentials.mockResolvedValue([{ provider: "anthropic", hasKey: false }]);
    await installBotTemplate(template, []);
    expect(create).toHaveBeenLastCalledWith(expect.objectContaining({ modelId: null }));
  });

  it("creates the routine switched off, in the user's own timezone", async () => {
    await installBotTemplate(template, []);
    expect(routineCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        active: false,
        timezone: "Europe/London",
        crons: ["30 7 * * 1-5"],
      }),
    );
  });

  it("falls back to the browser's timezone when the account has none", async () => {
    me.mockResolvedValue({});
    await installBotTemplate(template, []);
    const used = routineCreate.mock.calls.at(-1)?.[0]?.timezone;
    expect(used).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("reports a failed routine without losing the bot", async () => {
    routineCreate.mockRejectedValue(new Error("routine service down"));
    const result = await installBotTemplate(template, []);
    expect(result.bot).toMatchObject({ id: "bot-1" });
    expect(result.routineError).toContain("routine service down");
  });

  it("makes the name unique and never sends a routine for a template without one", async () => {
    const { routine: _routine, ...plain } = template;
    await installBotTemplate(plain, ["Example"]);
    expect(create).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Example 2" }));
    expect(routineCreate).not.toHaveBeenCalled();
  });
});
