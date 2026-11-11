#!/usr/bin/env bash
# Removes the prepboard desktop helper from this computer.
pkill -f "prepboard-helper/agent.py" 2> /dev/null || true
rm -f "$HOME/.config/autostart/prepboard-helper.desktop"
rm -rf "$HOME/.config/prepboard-helper" "$HOME/.local/share/prepboard-helper"
echo "prepboard helper removed."
