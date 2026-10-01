#!/bin/bash
# install.sh — wire the usage-limits statusline into Claude Code.
# Copies the statusline script to ~/.claude/ and adds `statusLine` to
# ~/.claude/settings.json (keeps existing settings, backs up first).
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_DIR="$HOME/.claude"
SETTINGS="$TARGET_DIR/settings.json"

pick_script() {
  if command -v node >/dev/null 2>&1; then echo "usage-statusline.js"; else echo "usage-statusline.py"; fi
}

SCRIPT="$(pick_script)"
mkdir -p "$TARGET_DIR"
cp "$PLUGIN_DIR/scripts/$SCRIPT" "$TARGET_DIR/claude-usage-statusline.${SCRIPT##*.}"
chmod +x "$TARGET_DIR/claude-usage-statusline.${SCRIPT##*.}"

CMD="$TARGET_DIR/claude-usage-statusline.${SCRIPT##*.}"
if [ "${SCRIPT##*.}" = "js" ]; then CMD="node \"$CMD\""; fi

[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
cp "$SETTINGS" "$SETTINGS.bak.$(date +%Y%m%d%H%M%S)"

python3 - "$SETTINGS" "$CMD" <<'EOF'
import json, sys
path, cmd = sys.argv[1], sys.argv[2]
with open(path) as f:
    try: s = json.load(f)
    except Exception: s = {}
sl = s.get("statusLine") or {}
sl["type"] = "command"
sl["command"] = cmd
s["statusLine"] = sl
with open(path, "w") as f:
    json.dump(s, f, indent=2)
    f.write("\n")
print(f"statusLine -> {cmd}")
EOF

echo "Done. Restart Claude Code (or it picks settings up automatically)."
echo "Note: 5h/7d values appear after your first API response in a session (Pro/Max plans)."
