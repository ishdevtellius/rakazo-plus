import { spawn } from "node:child_process";
import type { PageBrowserCommand, PageBrowserResult } from "@rakazo/adapter-kit";

export const PAGE_BROWSER_NOT_SET_UP =
  "The local browser is not set up. Start Chrome with the Rakazo debug port, then try again.";

const OUTPUT_LIMIT = 8 * 1024 * 1024;
const TIMEOUT_MS = 90_000;

/**
 * Run one live-page command against the owner's own Chrome. The helper script is the same stdlib
 * CDP client the Docker computer uses; it reads its arguments from stdin and prints one JSON line.
 * The Chrome is a separate, owner-started profile, never the owner's everyday browser.
 */
export async function runPageBrowser(
  config: { script: string; python: string; cdpPort: number } | undefined,
  request: PageBrowserCommand,
  signal: AbortSignal,
): Promise<PageBrowserResult> {
  if (!config) throw new Error(PAGE_BROWSER_NOT_SET_UP);
  const args =
    request.command === "navigate"
      ? { url: request.url }
      : request.command === "act"
        ? { actions: request.actions }
        : {};
  return new Promise<PageBrowserResult>((resolve, reject) => {
    const child = spawn(config.python, [config.script, request.command], {
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        RAKAZO_CDP_PORT: String(config.cdpPort),
        RAKAZO_BROWSER_ARGS_STDIN: "1",
      },
      stdio: ["pipe", "pipe", "ignore"],
      signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
    });
    let out = "";
    let overflow = false;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      out += chunk;
      if (out.length > OUTPUT_LIMIT) {
        overflow = true;
        child.kill("SIGKILL");
      }
    });
    child.on("error", reject);
    child.on("close", () => {
      if (overflow) return reject(new Error("The page browser result was too large"));
      const line = out.trim().split("\n").at(-1) ?? "";
      try {
        resolve(JSON.parse(line) as PageBrowserResult);
      } catch {
        reject(new Error("The page browser returned no result"));
      }
    });
    child.stdin.end(`${JSON.stringify(args)}\n`);
  });
}
