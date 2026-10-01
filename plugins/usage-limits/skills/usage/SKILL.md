---
name: usage
description: Show Claude 5-hour and weekly usage limits, or install the statusline that shows them permanently. Use when the user asks about usage, limits, quota, how much is left, or statusline setup.
---

# Usage limits (`usage-limits` plugin)

Show the user their current 5-hour and 7-day (weekly) Claude limits, or install the permanent statusline display.

## 1. On-demand check (user asks "what's my usage?")

Run the check script from this plugin and report the result:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/check-usage.js"
```

If node is unavailable, use the OAuth endpoint directly with `python3` + stdlib (`urllib`):

- Token: `~/.claude/.credentials.json` → `claudeAiOauth.accessToken` (on macOS alternatively: `security find-generic-password -s "Claude Code-credentials" -w`)
- `GET https://api.anthropic.com/api/oauth/usage` with headers `Authorization: Bearer <token>` and `anthropic-beta: oauth-2025-04-20`
- Fields: `five_hour.utilization` + `resets_at`, `seven_day.utilization` + `resets_at` (percent **used**; remaining = 100 − used)

Report **remaining %** (what's left), plus reset countdowns.

## 2. Permanent statusline (user wants it "directly in Claude Code")

Run the installer:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/install.sh"
```

This copies the statusline script to `~/.claude/` and sets `statusLine` in `~/.claude/settings.json` (existing settings preserved, backup created). Tell the user:

- The line shows e.g. `[Opus] 5h ▓▓▓░░ 77% left (3h12m) | 7d 65% left (2d4h) | ctx 34%` — green/yellow/red by consumption.
- Values come from Claude Code's native `rate_limits` payload (no token needed, no API calls). They appear after the first API response in a session and only on Pro/Max plans.
- On older clients without `rate_limits`, the statusline shows `limits n/a yet` unless the user explicitly opts into the unofficial fallback: `CLAUDE_USAGE_FALLBACK=1` (e.g. `export CLAUDE_USAGE_FALLBACK=1`). The fallback calls the undocumented OAuth usage endpoint, cached 5 min with retry-after backoff. Unofficial — use at your own discretion.
- To remove: delete the `statusLine` key from `~/.claude/settings.json` (or run `/statusline remove it`).
