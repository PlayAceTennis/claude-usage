# usage-limits

Shows Claude 5-hour + weekly (7-day) limits and estimated session API cost directly in the Claude Code statusline.

## Install

```bash
/plugin marketplace add PlayAceTennis/claude-usage
/plugin install usage-limits@claude-usage
```

With Node.js on PATH, run `/usage-limits:usage install the statusline` in Claude Code. Installing the plugin alone does not configure the statusline: [plugin defaults do not support `statusLine`](https://code.claude.com/docs/en/plugins/components#default-settings). Restart Claude Code (`exit`, then `claude`) if the line does not appear. No token setup needed — values come from Claude Code's native `rate_limits` payload.

Alternative without the plugin system:

```bash
node plugins/usage-limits/scripts/install.js
```

This copies the statusline script to `~/.claude/` and sets `statusLine` in `~/.claude/settings.json` (unrelated settings preserved, existing files backed up). It respects `CLAUDE_CONFIG_DIR` when set and replaces any existing statusline command. Invalid settings cause installation to stop without changing files.

The installer works from PowerShell, Git Bash, and macOS/Linux shells without Python. Node.js must also be on PATH when Claude Code runs. Re-run setup after plugin updates to refresh the copied script. To remove the statusline, delete the `statusLine` key from your user settings (uninstalling the plugin does not undo this manual setup).

## What you see

```
[Opus] | 5h ▓░░░░ 77% left (3h12m) | 7d ▓▓░░░ 65% left (2d4h) | ctx 34% | API ~$1.23
```

- `5h`: rolling 5-hour session window.
- `7d`: rolling 7-day weekly cap, shared across Claude Code + Claude.ai + Cowork.
- Colors: green <70% used, yellow 70–90%, red ≥90%.
- `ctx`: context-window fill, unrelated to plan limits.
- `API`: estimated API-equivalent cost of all calls in the current session, in USD. On a subscription, this estimates what the session would cost through the API; it is not an extra charge. Displays `$0.00` when reported as zero and is hidden when unavailable.

## On-demand check

Ask Claude `/usage-limits:usage`, or run Claude Code's built-in `/usage`.

## How it works

Reads `rate_limits.five_hour` / `rate_limits.seven_day` from the statusline stdin JSON (official data, same source as `/usage`). No network, no token, no API calls. Appears after the first API response in a session, Pro/Max plans only — otherwise the line shows `limits n/a yet`. The statusline never hangs.

The API cost comes from Claude Code's native `cost.total_cost_usd`, which accumulates its estimated cost across the current session. No hardcoded pricing table or separate token calculation is needed. Cost can appear even when plan limits are unavailable. See the [Claude Code statusline documentation](https://code.claude.com/docs/en/statusline#cost-and-duration-tracking).

## Files

- `scripts/usage-statusline.js` — statusline, Node stdlib only (default).
- `scripts/usage-statusline.py` — same behavior, Python stdlib only (available for manual configuration; UTF-8 input/output).
- `scripts/install.js` — cross-platform installer, Node stdlib only.
- `scripts/install.sh` — compatibility wrapper for the Node installer (now requires Node).
- `skills/usage/SKILL.md` — `/usage-limits:usage` skill.

If numbers differ briefly from `/usage`, trust `/usage`.

## Tests

Run `python -B -m unittest discover -s plugins/usage-limits/scripts` with Node and Python installed. CI runs the renderers and installer tests on Windows, macOS, and Linux.
