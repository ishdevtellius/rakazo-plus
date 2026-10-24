#!/bin/sh
# Starts the Mac host agent inside a macOS sandbox, with a clean environment.
D="${HOST_AGENT_DIR:-$HOME/.rakazo/host-agent}"
. "$D/config.env"
TOKEN="$(cat "$D/token")"
cd "$WORK_DIR" || exit 1
exec env -i PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" HOME="$HOME" USER="$USER" \
  TMPDIR="${TMPDIR:-/tmp/}" LANG="en_US.UTF-8" HOST_AGENT_DIR="$D" HOST_AGENT_PYTHON="$PYTHON" \
  HOST_AGENT_TOKEN="$TOKEN" HOST_AGENT_PORT="${HOST_AGENT_PORT:-47831}" \
  HOST_AGENT_BIND="${HOST_AGENT_BIND:-127.0.0.1}" HOST_AGENT_CDP_PORT="${HOST_AGENT_CDP_PORT:-9333}" \
  /usr/bin/sandbox-exec -f "$D/agent.sb" "$NODE" "$D/agent.bundle.mjs"
