// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: this agent runs under launchd, outside turbo
// The Mac host agent: lets Rakazo's Docker stack run bots' commands and browsing on this Mac.
// Built into one file by install.sh and started by launchd inside a macOS sandbox (agent.sb).
import { homedir } from "node:os";
import path from "node:path";
import { startHostComputerServer } from "../../packages/adapters/src/host-computer-server.ts";

const dir = process.env.HOST_AGENT_DIR ?? path.join(homedir(), ".rakazo", "host-agent");
// start-agent.sh reads the token before the sandbox starts. It is removed from the environment
// straight away so no command a bot runs can inherit it.
const token = (process.env.HOST_AGENT_TOKEN ?? "").trim();
delete process.env.HOST_AGENT_TOKEN;
if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("HOST_AGENT_TOKEN missing");

const server = await startHostComputerServer({
  root: path.join(dir, "computers"),
  token,
  port: Number(process.env.HOST_AGENT_PORT ?? 47831),
  // Only this machine, and the Docker stack through its host gateway, can reach the agent.
  hostname: process.env.HOST_AGENT_BIND ?? "127.0.0.1",
  pageBrowser: {
    script: path.join(dir, "rakazo-page-browser"),
    python: process.env.HOST_AGENT_PYTHON ?? "/usr/bin/python3",
    cdpPort: Number(process.env.HOST_AGENT_CDP_PORT ?? 9333),
  },
});
server.setEnabled(true);
console.log(`host-agent listening on ${process.env.HOST_AGENT_BIND ?? "127.0.0.1"}:${server.port}`);
process.on("SIGTERM", () => void server.close().then(() => process.exit(0)));
process.on("SIGINT", () => void server.close().then(() => process.exit(0)));
