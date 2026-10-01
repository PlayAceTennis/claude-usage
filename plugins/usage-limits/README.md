# usage-limits

Shows Claude 5-hour + weekly (7-day) limits directly in the Claude Code statusline, so you can see what's left at a glance.

## Install

```bash
/plugin marketplace add PlayAceTennis/claude-usage
/plugin install usage-limits@claude-usage
```

Restart Claude Code (`exit`, then `claude`). The statusline appears at the bottom of every prompt. No token setup needed — values come from Claude Code's native `rate_limits` payload.

Alternative without the plugin system:

```bash
bash plugins/usage-limits/scripts/install.sh
```

This copies the statusline script to `~/.claude/` and sets `statusLine` in `~/.claude/settings.json` (existing settings preserved, backup created).

## What you see

```
[Opus] | 5h ▓░░░░ 77% left (3h12m) | 7d ▓▓░░░ 65% left (2d4h) | ctx 34%
```

- `5h`: rolling 5-hour session window.
- `7d`: rolling 7-day weekly cap, shared across Claude Code + Claude.ai + Cowork.
- Colors: green <70% used, yellow 70–90%, red ≥90%.
- `ctx`: context-window fill, unrelated to plan limits.

## On-demand check

Ask Claude `/usage-limits:usage`, or run directly:

```bash
node plugins/usage-limits/scripts/check-usage.js
```

## How it works

1. **Primary (default, always on):** `rate_limits.five_hour` / `rate_limits.seven_day` from the statusline stdin JSON (official data, same source as `/usage`). No network, no token. Appears after the first API response in a session, Pro/Max plans only.
2. **Fallback (unofficial, opt-in only):** only when stdin has no `rate_limits` AND `CLAUDE_USAGE_FALLBACK=1` is set, calls the undocumented `GET https://api.anthropic.com/api/oauth/usage` with the OAuth token from `~/.claude/.credentials.json` (or macOS keychain), cached 5 min in the tmpdir with retry-after backoff (min 60s) after 429s/errors. The token is only sent to `api.anthropic.com`, never stored or transmitted elsewhere. Without the opt-in, missing data degrades to `limits n/a yet` — the statusline never hangs (3s fetch timeout).

## Files

- `settings.json` — wires the statusline (plugin-provided).
- `scripts/usage-statusline.js` — statusline, Node stdlib only (default).
- `scripts/usage-statusline.py` — same behavior, Python stdlib only (used by `install.sh` when node is missing).
- `scripts/check-usage.js` — detailed on-demand view.
- `scripts/install.sh` — manual install without the plugin system.
- `skills/usage/SKILL.md` — `/usage-limits:usage` skill.

If numbers differ briefly from `/usage`, trust `/usage`.
