#!/usr/bin/env bash
set -euo pipefail

# macOS. Edit PYTHON3 if needed, then re-run.
PYTHON3="/usr/bin/python3"

if [[ "$(uname -s)" != "Darwin" ]]; then
	echo "install.sh is macOS only." >&2
	exit 1
fi

ROOT="$(cd "$(dirname "$0")" && pwd)"
PY="${PYTHON3:-$(command -v python3)}"
if [[ -z "$PY" || ! -x "$PY" ]]; then
	echo "PYTHON3 must be an executable python3." >&2
	exit 1
fi

LOG_ROOT="$("$PY" -c "
import os
from pathlib import Path
p = Path('$ROOT') / 'settings.yaml'
root = str(Path.home() / 'Library/Application Support/read_chat_gui/chats')
if p.is_file():
    for raw in p.read_text().splitlines():
        line = raw.split('#', 1)[0].strip()
        if line.startswith('log_root:'):
            root = line.split(':', 1)[1].strip().strip('\"')
            break
print(os.path.expandvars(os.path.expanduser(root)))
")"
mkdir -p "$LOG_ROOT"

if [[ -f "$ROOT/package.json" ]]; then
	echo "== npm =="
	(cd "$ROOT" && npm install)
fi

LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
STD_LOG="$HOME/Library/Logs/read_chat_gui"
PATH_LAUNCHD="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
LABEL="com.read-chat-gui.logger"
OLD_LABEL="com.max.read-chat-gui.logger"

mkdir -p "$LAUNCH_AGENTS" "$STD_LOG"

PLIST="$LAUNCH_AGENTS/${LABEL}.plist"
cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${PY}</string>
    <string>${ROOT}/logger/daemon.py</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${PATH_LAUNCHD}</string>
  </dict>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${STD_LOG}/daemon.out.log</string>
  <key>StandardErrorPath</key>
  <string>${STD_LOG}/daemon.err.log</string>
</dict>
</plist>
EOF
chmod 644 "$PLIST"

uid="$(id -u)"
launchctl bootout "gui/${uid}/${OLD_LABEL}" >/dev/null 2>&1 || true
rm -f "$LAUNCH_AGENTS/${OLD_LABEL}.plist"
launchctl bootout "gui/${uid}/${LABEL}" >/dev/null 2>&1 || true
launchctl bootstrap "gui/${uid}" "$PLIST"
launchctl enable "gui/${uid}/${LABEL}"
launchctl kickstart -k "gui/${uid}/${LABEL}"

echo "Logger: $LABEL"
echo "Chats: $LOG_ROOT"
echo "Health: curl -s http://127.0.0.1:17842/health"
echo "Re-run ./install.sh after editing settings.yaml."
