#!/usr/bin/env python3
"""usage-statusline.py — Claude Code statusline showing limits + API cost.

Data source: stdin JSON from Claude Code (`rate_limits.five_hour` and
`rate_limits.seven_day`). Official payload, same data as `/usage`.
Zero config, zero network, zero tokens. Stdlib only.
"""
import json
import math
import sys
import time

RESET = "\033[0m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RED = "\033[31m"
CYAN = "\033[36m"
DIM = "\033[2m"


def color_for_used(used):
    if used is None:
        return RESET
    if used >= 90:
        return RED
    if used >= 70:
        return YELLOW
    return GREEN


def fmt_reset_in(resets_at, now):
    if not resets_at:
        return "?"
    d = max(0, int(resets_at - now))
    if d <= 0:
        return "now"
    days, d = divmod(d, 86400)
    hrs, d = divmod(d, 3600)
    mins, secs = divmod(d, 60)
    if days:
        return f"{days}d{hrs}h" if hrs else f"{days}d"
    if hrs:
        return f"{hrs}h{mins}m" if mins else f"{hrs}h"
    if mins:
        return f"{mins}m"
    return f"{secs}s"


def bar(used, width=5):
    u = min(100, max(0, used or 0))
    filled = round(u * width / 100)
    return "▓" * filled + "░" * (width - filled)


def main():
    # Piped streams on Windows otherwise use a code page without these bars.
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        raw = sys.stdin.read() if not sys.stdin.isatty() else ""
        d = json.loads(raw) if raw.strip() else {}
    except Exception:
        d = {}

    model = (d.get("model") or {}).get("display_name") or (d.get("model") or {}).get("id") or ""
    ctx = (d.get("context_window") or {}).get("used_percentage")

    # Native payload (Pro/Max, after first API response in the session).
    five = seven = None
    rl = d.get("rate_limits") or {}
    fh = rl.get("five_hour") or {}
    if fh.get("used_percentage") is not None:
        five = {"used": fh["used_percentage"], "resets_at": fh.get("resets_at")}
    wk = rl.get("seven_day") or rl.get("sevenDay") or {}
    if wk.get("used_percentage") is not None:
        seven = {"used": wk["used_percentage"], "resets_at": wk.get("resets_at")}

    now = int(time.time())
    parts = []
    if model:
        parts.append(f"{CYAN}[{model}]{RESET}")

    def seg(label, w):
        if not w or w.get("used") is None:
            return None
        left = max(0, 100 - w["used"])
        c = color_for_used(w["used"])
        reset_txt = fmt_reset_in(w.get("resets_at"), now)
        return f"{label} {c}{bar(w['used'])} {round(left)}% left{RESET}{DIM} ({reset_txt}){RESET}"

    s5, s7 = seg("5h", five), seg("7d", seven)
    if s5:
        parts.append(s5)
    if s7:
        parts.append(s7)
    if ctx is not None:
        parts.append(f"{DIM}ctx {round(ctx)}%{RESET}")

    # Claude Code's cumulative API-equivalent estimate for this session.
    api_cost = (d.get("cost") or {}).get("total_cost_usd")
    if (type(api_cost) in (int, float) and math.isfinite(api_cost)
            and api_cost >= 0):
        parts.append(f"{DIM}API ~${api_cost:.2f}{RESET}")

    if not parts:
        # Rate limits appear after the first API response on Pro/Max plans.
        print(f"{DIM}limits n/a yet{RESET}")
    elif not s5 and not s7:
        # Model, context, and cost are available independently of plan limits.
        print(" ".join(parts))
    else:
        print(" | ".join(parts))


if __name__ == "__main__":
    main()
