---
name: usage
description: Show Claude 5-hour and weekly usage limits, or install the statusline that shows them permanently. Use when the user asks about usage, limits, quota, how much is left, or statusline setup.
---

# Usage limits (`usage-limits` plugin)

Show the user their current 5-hour and 7-day (weekly) Claude limits, or install the permanent statusline display.

## 1. On-demand check (user asks "what's my usage?")

Point the user at Claude Code's built-in `/usage` command — it shows the authoritative 5-hour session usage % and weekly usage % with reset times. Report **remaining %** (what's left), plus reset countdowns.

(This plugin intentionally performs no API calls of its own: the statusline below uses only Claude Code's native `rate_limits` payload.)

## 2. Permanent statusline (user wants it "directly in Claude Code")

Run the Node installer (Node.js must be on PATH). Installing the plugin alone does not register a statusline:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/install.js"
```

Resolve `${CLAUDE_PLUGIN_ROOT}` to the actual plugin directory before invoking this command in PowerShell; it is not PowerShell environment-variable syntax. Use a quoted path with forward slashes.

This copies the statusline script to `~/.claude/` and sets `statusLine` in `~/.claude/settings.json` (unrelated settings preserved, existing files backed up). It respects `CLAUDE_CONFIG_DIR`, replaces any existing statusline command, and refuses malformed settings. Re-run after plugin updates to refresh the copied script. Tell the user:

- The line shows e.g. `[Opus] 5h ▓▓▓░░ 77% left (3h12m) | 7d 65% left (2d4h) | ctx 34%` — green/yellow/red by consumption.
- Values come from Claude Code's native `rate_limits` payload (no token needed, no API calls, no network). They appear after the first API response in a session and only on Pro/Max plans; otherwise the line shows `limits n/a yet`.
- To remove: delete the `statusLine` key from `~/.claude/settings.json` (or run `/statusline remove it`).
