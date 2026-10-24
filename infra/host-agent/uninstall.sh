#!/bin/sh
# Stops the Mac host agent and removes its launch agent. --purge also deletes its folder,
# including the token and the bots' workspaces on this Mac.
D="${HOST_AGENT_DIR:-$HOME/.rakazo/host-agent}"
launchctl bootout "gui/$(id -u)/com.rakazo.hostagent" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/com.rakazo.hostagent.plist"
if [ "${1:-}" = "--purge" ]; then rm -rf "$D"; echo "Removed $D"; fi
echo "Host agent stopped. Set Settings > Where bots run back to Docker if you have not already."
