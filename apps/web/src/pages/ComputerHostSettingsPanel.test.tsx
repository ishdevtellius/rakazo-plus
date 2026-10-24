// @vitest-environment jsdom

import type { ComponentProps, ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const me = vi.fn(async () => ({ computerHost: null as string | null }));
const update = vi.fn(async (_input: { computerHost: string }) => ({}));
vi.mock("../lib/rpc", () => ({
  rpc: {
    me: () => me(),
    deployment: { update: (input: { computerHost: string }) => update(input) },
  },
}));
vi.mock("@lingui/react/macro", () => {
  const t = (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce((text, part, index) => `${text}${index > 0 ? values[index - 1] : ""}${part}`, "");
  return { useLingui: () => ({ t }), Trans: ({ children }: { children: ReactNode }) => children };
});
vi.mock("@rakazo/ui-web", () => ({
  Button: ({
    variant: _variant,
    size: _size,
    ...props
  }: ComponentProps<"button"> & { variant?: string; size?: string }) => <button {...props} />,
}));

import { ComputerHostSettingsPanel } from "./ComputerHostSettingsPanel";

let container: HTMLDivElement;
let root: Root;

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function click(testId: string) {
  const element = container.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
  expect(element, testId).not.toBeNull();
  await act(async () => {
    element?.click();
  });
  await flush();
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  me.mockClear();
  update.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("ComputerHostSettingsPanel", () => {
  it("asks before moving every bot onto this machine, then saves the choice", async () => {
    me.mockResolvedValue({ computerHost: "docker" });
    await act(async () => root.render(<ComputerHostSettingsPanel />));
    await flush();
    expect(container.querySelector('[data-testid="use-docker"]')).toBeNull();
    await click("use-mac");
    expect(update).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Every bot will be able to run commands");
    await click("use-mac-yes");
    expect(update).toHaveBeenCalledWith({ computerHost: "this-mac" });
    expect(container.querySelector('[data-testid="use-docker"]')).not.toBeNull();
  });

  it("switches back to Docker with one click", async () => {
    me.mockResolvedValue({ computerHost: "this-mac" });
    await act(async () => root.render(<ComputerHostSettingsPanel />));
    await flush();
    await click("use-docker");
    expect(update).toHaveBeenCalledWith({ computerHost: "docker" });
    expect(container.querySelector('[data-testid="use-mac"]')).not.toBeNull();
  });

  it("treats an unset choice like Docker and cancels without saving", async () => {
    me.mockResolvedValue({ computerHost: null });
    await act(async () => root.render(<ComputerHostSettingsPanel />));
    await flush();
    await click("use-mac");
    const cancel = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Cancel",
    );
    await act(async () => cancel?.click());
    expect(update).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="use-mac-confirm"]')).toBeNull();
  });
});
