# Mac host agent

Run your bots' commands and browsing **on this Mac** instead of in a Docker computer. It is much
faster to start and use. macOS only; on Windows and Linux use the Rakazo desktop app's "Use this
computer" option instead.

## What it is

A small agent that your Docker stack calls through `host.docker.internal`. It runs commands as you,
inside a macOS sandbox, and drives a **separate Chrome window** for browsing.

## Set up

```sh
sh infra/host-agent/install.sh
```

It builds the agent, writes its sandbox profile, and starts it at login. Then follow what it
prints: add `SANDBOX_HOST_URL` and `SANDBOX_HOST_TOKEN` to your stack's `.env`, restart the stack,
start the browser with `sh ~/.rakazo/host-agent/start-chrome.sh`, and choose
**Settings > Where bots run > Use this Mac**. Switching back to Docker is one click in the same place.

Needs: `node`, `python3` (system or Homebrew, not inside your home folder), `pnpm`, and Google Chrome.
`install.sh --no-launchd` skips the start-at-login step. `uninstall.sh [--purge]` removes it.

## What bots can and cannot do on your Mac

- Commands run as you and are **not asked about first**. Only use this on a machine you control.
- The sandbox (`agent.sb`) blocks reading or listing your home folder and writing in it. Bots work
  in `~/rakazo-work` and in the agent's own workspace folder. Put repos you want them to use in
  `~/rakazo-work`.
- Run `sh infra/host-agent/test-sandbox.sh` any time. It uses a harmless canary file to prove the
  rules still hold, and fails loudly if they do not (for example if your home folder is a symlink).
- Network access is not restricted. Apple Events, the clipboard and other apps you have open are
  not covered by the sandbox, so this is not a complete lock.

## The browser

`start-chrome.sh` starts Chrome with its own profile (`~/.rakazo/host-agent/chrome-profile`) and a
debug port that only this Mac can reach. It is never your everyday browser. Sign in there only to
what bots may use. All bots share this one browser, and a bot's shell can reach the debug port, so
the cookies in that profile are reachable by bots.

## Files

| File | Purpose |
|---|---|
| `agent.mts` | The agent: the host-computer server plus the page-browser bridge |
| `agent.sb.template` | Sandbox profile; `install.sh` fills in your real paths |
| `start-agent.sh` | Starts the agent in the sandbox with a clean environment |
| `start-chrome.sh` | Starts the separate Chrome |
| `com.rakazo.hostagent.plist.template` | Start-at-login and restart-on-crash |
| `install.sh`, `uninstall.sh`, `test-sandbox.sh` | Set up, remove, verify |
