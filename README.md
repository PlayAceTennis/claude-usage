# claude-usage

Claude Code marketplace: live 5-hour + weekly usage limits in the statusline, so you can see what's left at a glance.

```
[Opus] | 5h ▓░░░░ 77% left (3h12m) | 7d ▓▓░░░ 65% left (2d4h) | ctx 34%
```

## Plugins

- `usage-limits@claude-usage` — 5h + 7-day remaining %, reset timers, color-coded; plus `/usage-limits:usage` on-demand check.

## Use

```bash
/plugin marketplace add PlayAceTennis/claude-usage
/plugin install usage-limits@claude-usage
```

Then restart Claude Code. See [`plugins/usage-limits/README.md`](plugins/usage-limits/README.md) for details.

## Notes

- Data source is Claude Code's native `rate_limits` statusline payload (official, no network, no token, no API calls of its own). Values appear after the first API response in a session, Pro/Max plans only.
- If numbers differ briefly from `/usage`, trust `/usage`.
