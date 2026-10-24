#!/bin/sh
# Starts the browser bots use on this Mac: a separate Chrome profile (not your everyday one) whose
# debug port is reachable only from this machine. Sign in here to what the bots may use.
D="${HOST_AGENT_DIR:-$HOME/.rakazo/host-agent}"
PORT="${HOST_AGENT_CDP_PORT:-9333}"
mkdir -p "$D/chrome-profile"
exec "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port="$PORT" --remote-debugging-address=127.0.0.1 \
  --user-data-dir="$D/chrome-profile" --no-first-run --no-default-browser-check \
  --window-size=1280,900 "about:blank"
