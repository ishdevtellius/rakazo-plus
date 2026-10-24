#!/bin/sh
# Mac host agent installer: builds the agent, writes its sandbox profile, and (unless you pass
# --no-launchd) starts it at login. Nothing here edits your Rakazo stack; it prints what to add.
set -eu

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
D="${HOST_AGENT_DIR:-$HOME/.rakazo/host-agent}"
WORK="${HOST_AGENT_WORK:-$HOME/rakazo-work}"
LAUNCHD=1
[ "${1:-}" = "--no-launchd" ] && LAUNCHD=0

[ "$(uname)" = "Darwin" ] || { echo "The Mac host agent only supports macOS." >&2; exit 1; }
NODE="$(command -v node || true)"
PYTHON="$(command -v python3 || true)"
[ -n "$NODE" ] || { echo "node is required." >&2; exit 1; }
[ -n "$PYTHON" ] || { echo "python3 is required (it runs the browser driver)." >&2; exit 1; }
for tool in "$NODE" "$PYTHON"; do
  case "$tool" in
    "$HOME"/*) echo "Warning: $tool is inside your home folder, which the sandbox blocks. Use a system or Homebrew install." >&2 ;;
  esac
done

mkdir -p "$D" "$D/computers" "$WORK"
# Sandbox rules match real paths only. A symlinked home or folder would silently switch them off.
REAL_HOME="$(cd "$HOME" && pwd -P)"
D="$(cd "$D" && pwd -P)"
WORK="$(cd "$WORK" && pwd -P)"

# Token: 64 hex characters, readable only by you.
if [ ! -f "$D/token" ]; then
  openssl rand -hex 32 > "$D/token"
  chmod 600 "$D/token"
fi

# The agent reuses the adapters package, so the repo's dependencies must be installed.
if [ ! -d "$REPO/node_modules/@rakazo" ]; then
  command -v pnpm >/dev/null || { echo "pnpm is required to install the repo's dependencies." >&2; exit 1; }
  (cd "$REPO" && pnpm install --filter "@rakazo/adapters..." --ignore-scripts --frozen-lockfile)
fi

# esbuild turns the agent into one file that launchd can run (launchd cannot read ~/Downloads).
if [ ! -d "$D/node_modules/esbuild" ]; then
  (cd "$D" && { [ -f package.json ] || npm init -y >/dev/null; } && npm install --silent --no-audit --no-fund esbuild)
fi
cp "$REPO/infra/sandboxes/computer/rakazo-page-browser" "$D/rakazo-page-browser"
chmod 755 "$D/rakazo-page-browser"
NODE_PATH="$REPO/node_modules:$D/node_modules" "$D/node_modules/.bin/esbuild" \
  "$REPO/infra/host-agent/agent.mts" --bundle --platform=node --format=esm \
  --outfile="$D/agent.bundle.mjs" --alias:koffi="$REPO/infra/host-agent/koffi-stub.mjs" \
  --banner:js="import{createRequire}from'module';const require=createRequire(import.meta.url);" \
  --log-level=warning

printf 'NODE="%s"\nPYTHON="%s"\nWORK_DIR="%s"\n' "$NODE" "$PYTHON" "$WORK" > "$D/config.env"
sed -e "s|__HOME__|$REAL_HOME|g" -e "s|__WORK__|$WORK|g" -e "s|__DATA__|$D|g" \
  "$REPO/infra/host-agent/agent.sb.template" > "$D/agent.sb"
cp "$REPO/infra/host-agent/start-agent.sh" "$REPO/infra/host-agent/start-chrome.sh" "$D/"
chmod +x "$D/start-agent.sh" "$D/start-chrome.sh"

if [ "$LAUNCHD" = 1 ]; then
  PLIST="$HOME/Library/LaunchAgents/com.rakazo.hostagent.plist"
  mkdir -p "$HOME/Library/LaunchAgents"
  sed -e "s|__DATA__|$D|g" "$REPO/infra/host-agent/com.rakazo.hostagent.plist.template" > "$PLIST"
  launchctl bootout "gui/$(id -u)/com.rakazo.hostagent" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  echo "Started. The agent now starts at login and restarts if it stops."
fi

cat <<MSG

Installed in $D
Work folder bots can use: $WORK

Next:
1. Add these two lines to your Rakazo stack's .env, then restart the stack:
     SANDBOX_HOST_URL=http://host.docker.internal:47831
     SANDBOX_HOST_TOKEN=<the contents of $D/token>
2. Run  sh $D/start-chrome.sh  and sign in there to anything bots may use.
3. In Rakazo: Settings > Where bots run > Use this Mac.
Check the sandbox any time with:  sh $REPO/infra/host-agent/test-sandbox.sh
MSG
