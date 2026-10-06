# claude-usage

Claude Code marketplace: live 5-hour + weekly usage limits and estimated session API cost in the statusline.

```
[Opus] | 5h ▓░░░░ 77% left (3h12m) | 7d ▓▓░░░ 65% left (2d4h) | ctx 34% | API ~$1.23
```

## Plugins

- `usage-limits@claude-usage` — 5h + 7-day remaining %, reset timers, color-coded, estimated session API cost; plus `/usage-limits:usage` on-demand check.

## Use

```bash
/plugin marketplace add PlayAceTennis/claude-usage
/plugin install usage-limits@claude-usage
```

Then run `/usage-limits:usage install the statusline` in Claude Code (requires Node.js on PATH). Installing the plugin alone does not configure the statusline. Restart Claude Code if needed. See [`plugins/usage-limits/README.md`](plugins/usage-limits/README.md) for details.

## Notes

- Data source is Claude Code's native `rate_limits` statusline payload (official, no network, no token, no API calls of its own). Values appear after the first API response in a session, Pro/Max plans only.
- If numbers differ briefly from `/usage`, trust `/usage`.
- `API ~$1.23` shows Claude Code's estimated API-equivalent cost for the current session in USD, not an extra subscription charge. Hidden when cost data is unavailable.
