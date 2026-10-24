import type { ConnectorToolPolicy } from "@rakazo/contracts";
import { CATALOG_TEMPLATES } from "./bot-templates-catalog";

export const BOT_TEMPLATE_CATEGORIES = [
  "Engineering",
  "Sales",
  "Marketing",
  "Design",
  "Personal",
  "Recruiting & People",
  "Product",
  "Operations",
] as const;
export type BotTemplateCategory = (typeof BOT_TEMPLATE_CATEGORIES)[number];

export type BotTemplate = {
  id: string;
  category: BotTemplateCategory;
  name: string;
  title: string;
  /** One line on the card. */
  summary: string;
  /** What the bot never does without the user's yes, shown on the card. */
  never: string;
  /** Composio app slugs the bot reads or writes through. */
  connectors: string[];
  description: string;
  instructions: string;
  computerMode: "team" | "dedicated";
  /** Omitted: the space default model. */
  model?: { provider: string; modelId: string };
  connectorToolPolicy: ConnectorToolPolicy;
  /** Shown in the Featured row. */
  featured?: boolean;
  /** Created switched off; the user turns it on after connecting the apps. */
  routine?: { name: string; prompt: string; crons: string[]; timezone: string };
};

/** Generic, ready-made bots. A new install has no bots of its own until one is added from here. */
export const BOT_TEMPLATES: BotTemplate[] = CATALOG_TEMPLATES;

/** `Name`, then `Name 2`, `Name 3`... so a second install never collides with the first. */
export function uniqueBotName(base: string, existing: readonly string[], maxLength = 80): string {
  const taken = new Set(existing.map((name) => name.trim().toLowerCase()));
  const clip = (name: string) => name.slice(0, maxLength).trim();
  if (!taken.has(clip(base).toLowerCase())) return clip(base);
  for (let n = 2; n < 1000; n += 1) {
    const suffix = ` ${n}`;
    const candidate = clip(`${base.slice(0, maxLength - suffix.length)}${suffix}`);
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return clip(`${base.slice(0, maxLength - 5)} ${Date.now() % 10000}`);
}
