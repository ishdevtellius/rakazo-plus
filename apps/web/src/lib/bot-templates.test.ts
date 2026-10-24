import {
  BOT_DESCRIPTION_MAX_LENGTH,
  BOT_INSTRUCTIONS_MAX_LENGTH,
  BOT_NAME_MAX_LENGTH,
  BOT_TITLE_MAX_LENGTH,
  CreateBotInput,
  CreateRoutineInput,
} from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { BOT_TEMPLATE_CATEGORIES, BOT_TEMPLATES, uniqueBotName } from "./bot-templates";

describe("bot templates", () => {
  it("have unique ids and fit the create-bot contract", () => {
    expect(new Set(BOT_TEMPLATES.map((t) => t.id)).size).toBe(BOT_TEMPLATES.length);
    for (const t of BOT_TEMPLATES) {
      expect(t.name.length).toBeLessThanOrEqual(BOT_NAME_MAX_LENGTH);
      expect(t.title.length).toBeLessThanOrEqual(BOT_TITLE_MAX_LENGTH);
      expect(t.description.length).toBeLessThanOrEqual(BOT_DESCRIPTION_MAX_LENGTH);
      expect(t.instructions.length).toBeLessThanOrEqual(BOT_INSTRUCTIONS_MAX_LENGTH);
      expect(
        CreateBotInput.safeParse({
          name: t.name,
          title: t.title,
          description: t.description,
          instructions: t.instructions,
          computerMode: t.computerMode,
          modelProvider: t.model?.provider ?? null,
          modelId: t.model?.modelId ?? null,
          connectorToolPolicy: t.connectorToolPolicy,
        }).success,
      ).toBe(true);
    }
  });

  it("covers every marketplace category and keeps the rows populated", () => {
    for (const category of BOT_TEMPLATE_CATEGORIES) {
      expect(BOT_TEMPLATES.some((t) => t.category === category)).toBe(true);
    }
    expect(BOT_TEMPLATES.filter((t) => t.featured).length).toBeGreaterThanOrEqual(4);
    expect(BOT_TEMPLATES.length).toBeGreaterThanOrEqual(30);
  });

  it("gives every template hard rules, a never line and distinct names", () => {
    expect(new Set(BOT_TEMPLATES.map((t) => t.name)).size).toBe(BOT_TEMPLATES.length);
    for (const t of BOT_TEMPLATES) {
      expect(t.never.length).toBeGreaterThan(10);
      expect(t.instructions).toContain("HARD RULES");
      expect(t.instructions).toMatch(/secret|password|token/i);
      for (const slug of t.connectors) expect(slug).toBe(slug.toLowerCase());
    }
  });

  it("never start with connector writes allowed", () => {
    for (const t of BOT_TEMPLATES) expect(t.connectorToolPolicy.writes).not.toBe("allow");
  });

  it("routines are created inactive-friendly and valid", () => {
    for (const t of BOT_TEMPLATES.filter((item) => item.routine)) {
      expect(
        CreateRoutineInput.safeParse({
          botId: "x",
          name: t.routine?.name,
          prompt: t.routine?.prompt,
          crons: t.routine?.crons,
          timezone: t.routine?.timezone,
          active: false,
        }).success,
      ).toBe(true);
    }
  });
});

describe("uniqueBotName", () => {
  it("keeps a free name and numbers a taken one", () => {
    expect(uniqueBotName("Codebase Guide", [])).toBe("Codebase Guide");
    expect(uniqueBotName("Codebase Guide", ["codebase guide"])).toBe("Codebase Guide 2");
    expect(uniqueBotName("A", ["A", "A 2"])).toBe("A 3");
  });
  it("respects the length limit", () => {
    const long = "x".repeat(80);
    const name = uniqueBotName(long, [long]);
    expect(name.length).toBeLessThanOrEqual(80);
    expect(name.endsWith(" 2")).toBe(true);
  });
});
