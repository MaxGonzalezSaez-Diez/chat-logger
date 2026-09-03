#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
	echo "uninstall.sh is macOS only." >&2
	exit 1
fi

LA="$HOME/Library/LaunchAgents"
uid="$(id -u)"

for label in com.read-chat-gui.logger com.max.read-chat-gui.logger; do
	launchctl bootout "gui/${uid}/${label}" >/dev/null 2>&1 || true
	rm -f "$LA/${label}.plist"
	echo "Removed LaunchAgent: $label"
done

echo "Uninstall done. Chat files on disk were not deleted."
