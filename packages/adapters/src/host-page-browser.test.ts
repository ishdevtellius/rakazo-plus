import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hostComputerRequest } from "./host-computer-protocol.js";
import { PAGE_BROWSER_NOT_SET_UP, runPageBrowser } from "./host-page-browser.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function driver(body: string) {
  const dir = await mkdtemp(path.join(tmpdir(), "page-browser-"));
  dirs.push(dir);
  const script = path.join(dir, "driver.mjs");
  await writeFile(script, body);
  return { script, python: process.execPath, cdpPort: 9333 };
}

const echo = `
import { readFileSync } from "node:fs";
const args = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify({ ok: true, command: process.argv[2], port: process.env.RAKAZO_CDP_PORT,
  stdinMode: process.env.RAKAZO_BROWSER_ARGS_STDIN, args, url: args.url ?? "", title: "t" }));
`;

describe("host page browser", () => {
  it("passes the command and its arguments to the driver on the configured debug port", async () => {
    const config = await driver(echo);
    const result = await runPageBrowser(
      config,
      { command: "navigate", url: "https://example.com" },
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      ok: true,
      command: "navigate",
      port: "9333",
      stdinMode: "1",
      args: { url: "https://example.com" },
    });
  });

  it("passes act steps through and sends no arguments for a snapshot", async () => {
    const config = await driver(echo);
    const actions = [{ kind: "click", ref: "e1" }];
    expect(
      await runPageBrowser(
        config,
        { command: "act", actions } as never,
        new AbortController().signal,
      ),
    ).toMatchObject({ command: "act", args: { actions } });
    expect(
      await runPageBrowser(config, { command: "snapshot" }, new AbortController().signal),
    ).toMatchObject({ command: "snapshot", args: {} });
  });

  it("fails clearly when the local browser is not configured", async () => {
    await expect(
      runPageBrowser(undefined, { command: "snapshot" }, new AbortController().signal),
    ).rejects.toThrow(PAGE_BROWSER_NOT_SET_UP);
  });

  it("rejects output that is not a result", async () => {
    const config = await driver(`console.log("not json");`);
    await expect(
      runPageBrowser(config, { command: "snapshot" }, new AbortController().signal),
    ).rejects.toThrow("returned no result");
  });

  it("does not pass the host environment to the driver", async () => {
    process.env.SECRET_FOR_TEST = "leak";
    const config = await driver(
      `console.log(JSON.stringify({ ok: true, leaked: process.env.SECRET_FOR_TEST ?? null }));`,
    );
    const result = await runPageBrowser(
      config,
      { command: "snapshot" },
      new AbortController().signal,
    );
    delete process.env.SECRET_FOR_TEST;
    expect(result).toMatchObject({ leaked: null });
  });

  it("is a valid bridge request", () => {
    expect(
      hostComputerRequest.safeParse({
        botId: "b",
        method: "pageBrowser",
        request: { command: "navigate", url: "https://example.com" },
      }).success,
    ).toBe(true);
    expect(
      hostComputerRequest.safeParse({
        botId: "b",
        method: "pageBrowser",
        request: { command: "evaluate", code: "1" },
      }).success,
    ).toBe(false);
  });
});
