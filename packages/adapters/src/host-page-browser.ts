import { spawn } from "node:child_process";
import type { PageBrowserCommand, PageBrowserResult } from "@rakazo/adapter-kit";

export const PAGE_BROWSER_NOT_SET_UP =
  "The local browser is not set up. Start Chrome with the Rakazo debug port, then try again.";

const OUTPUT_LIMIT = 8 * 1024 * 1024;
/** The CDP helper reads at most this much of its arguments from stdin. */
const ARGS_LIMIT = 1_000_000;
const TIMEOUT_MS = 90_000;

/**
 * All bots share one Chrome, so page commands run one at a time: two bots acting on the same tab
 * at once would click each other's pages.
 */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Run one live-page command against the owner's own Chrome. The helper script is the same stdlib
 * CDP client the Docker computer uses; it reads its arguments from stdin and prints one JSON line.
 * The Chrome is a separate, owner-started profile, never the owner's everyday browser.
 */
export function runPageBrowser(
  config: { script: string; python: string; cdpPort: number } | undefined,
  request: PageBrowserCommand,
  signal: AbortSignal,
  /** The bot computer's folder: the helper keeps file uploads inside it. */
  home?: string,
): Promise<PageBrowserResult> {
  const run = queue.then(
    () => execute(config, request, signal, home),
    () => execute(config, request, signal, home),
  );
  queue = run.catch(() => undefined);
  return run;
}

async function execute(
  config: { script: string; python: string; cdpPort: number } | undefined,
  request: PageBrowserCommand,
  signal: AbortSignal,
  home?: string,
): Promise<PageBrowserResult> {
  if (!config) throw new Error(PAGE_BROWSER_NOT_SET_UP);
  signal.throwIfAborted();
  const args =
    request.command === "navigate"
      ? { url: request.url }
      : request.command === "act"
        ? { actions: request.actions }
        : {};
  const payload = `${JSON.stringify(args)}\n`;
  if (Buffer.byteLength(payload) > ARGS_LIMIT) throw new Error("The page action is too large");
  return new Promise<PageBrowserResult>((resolve, reject) => {
    const child = spawn(config.python, [config.script, request.command], {
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        RAKAZO_CDP_PORT: String(config.cdpPort),
        RAKAZO_BROWSER_ARGS_STDIN: "1",
        // The owner's window is often covered or minimised; a lone tab is still unambiguous.
        RAKAZO_ATTACH_SINGLE_HIDDEN_PAGE: "1",
        ...(home ? { HOME: home } : {}),
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
    // A helper that exits before reading its arguments must not crash the agent with an EPIPE.
    child.stdin.on("error", () => undefined);
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
    child.stdin.end(payload);
  });
}
