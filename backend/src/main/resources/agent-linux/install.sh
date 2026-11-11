#!/usr/bin/env bash
# prepboard desktop helper for Linux (one time). Run:
#   curl -fsSL __PREPBOARD_SERVER__/api/agent/install.sh | bash
# Links this computer to your prepboard account, installs into your home folder (no sudo)
# and starts the helper whenever you log in to your desktop.
set -euo pipefail
SERVER="__PREPBOARD_SERVER__"
DIR="$HOME/.local/share/prepboard-helper"
CONF="$HOME/.config/prepboard-helper"
AUTOSTART="$HOME/.config/autostart/prepboard-helper.desktop"

echo
echo "  prepboard desktop helper (Linux)"
echo "  server: $SERVER"
echo

if ! command -v python3 > /dev/null; then
  echo "  Needs python3. Install it with your package manager, then run this again." >&2
  exit 1
fi
if ! python3 -c 'import gi; gi.require_version("Gtk", "3.0"); from gi.repository import Gtk' 2> /dev/null; then
  echo "  Needs GTK 3 for Python. Install it, then run this again:" >&2
  echo "    Ubuntu/Debian/Mint:  sudo apt install python3-gi gir1.2-gtk-3.0" >&2
  echo "    Fedora:              sudo dnf install python3-gobject gtk3" >&2
  echo "    Arch/Manjaro:        sudo pacman -S python-gobject gtk3" >&2
  exit 1
fi

# The script itself arrives on stdin (curl | bash), so read the code from the terminal.
CODE="${PREPBOARD_CODE:-}"
if [ -z "$CODE" ]; then
  printf "  Paste the code from prepboard (overview > nudge > desktop helper): "
  read -r CODE < /dev/tty
fi

TOKEN_JSON=$(python3 - "$SERVER" "$CODE" "$(hostname)" <<'PY'
import json, sys, urllib.request, urllib.error
server, code, name = sys.argv[1:4]
req = urllib.request.Request(server + "/api/agent/link", data=json.dumps({"code": code, "deviceName": name}).encode(),
                             headers={"Content-Type": "application/json"}, method="POST")
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        print(r.read().decode())
except urllib.error.HTTPError as e:
    try:
        msg = json.loads(e.read().decode()).get("error", str(e))
    except Exception:
        msg = str(e)
    print("  Could not link: " + msg, file=sys.stderr)
    sys.exit(1)
PY
) || { echo "  Get a fresh code on the dashboard and run the command again." >&2; exit 1; }

mkdir -p "$DIR" "$CONF" "$(dirname "$AUTOSTART")"
chmod 700 "$CONF"

# Stop an older copy before replacing its files.
pkill -f "prepboard-helper/agent.py" 2> /dev/null || true

echo "__AGENT_B64__" | base64 -d > "$DIR/agent.py"
echo "__CAR_B64__" | base64 -d > "$DIR/nudge-car.py"
echo "__UNINSTALL_B64__" | base64 -d > "$DIR/uninstall.sh"
chmod +x "$DIR/agent.py" "$DIR/nudge-car.py" "$DIR/uninstall.sh"

# Only this user can read the token.
( umask 077; python3 - "$SERVER" "$TOKEN_JSON" > "$CONF/config.json" <<'PY'
import json, sys
link = json.loads(sys.argv[2])
print(json.dumps({"server": sys.argv[1], "token": link["token"], "user": link.get("leetcodeUsername")}))
PY
)

# Start with the desktop session (GNOME, KDE, XFCE, Cinnamon, ...).
cat > "$AUTOSTART" <<EOF
[Desktop Entry]
Type=Application
Name=prepboard helper
Comment=Shows the prepboard pixel car at your nudge time
Exec=python3 $DIR/agent.py
NoDisplay=true
X-GNOME-Autostart-enabled=true
EOF

nohup python3 "$DIR/agent.py" > /dev/null 2>&1 &
# Say hello with the car, so you know it works.
nohup python3 "$DIR/nudge-car.py" --title "PREPBOARD HELPER READY" --subtitle "SEE YOU AT YOUR NUDGE TIME" --url "$SERVER" > /dev/null 2>&1 &

echo
echo "  Done! Linked to $(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("leetcodeUsername",""))' "$TOKEN_JSON")."
echo "  The helper starts when you log in and shows the car at your nudge time and at 9 pm."
echo "  To remove it later: $DIR/uninstall.sh"
