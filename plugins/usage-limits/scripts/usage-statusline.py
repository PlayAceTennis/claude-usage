#!/usr/bin/env python3
"""usage-statusline.py — Claude Code statusline showing 5h + weekly limits.

Same behavior as usage-statusline.js, stdlib only. Use whichever runtime
you prefer; the installer defaults to node when available.

Data: native `rate_limits` stdin payload only, by default.
Fallback (UNOFFICIAL, undocumented OAuth usage endpoint) is DISABLED unless
CLAUDE_USAGE_FALLBACK=1 is set. Cached 300s with retry-after backoff.
"""
import json
import os
import sys
import time
import urllib.request
import tempfile

RESET = "\033[0m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RED = "\033[31m"
CYAN = "\033[36m"
DIM = "\033[2m"

CACHE_TTL = 300
RETRY_BACKOFF_MIN = 60
CACHE_FILE = os.path.join(tempfile.gettempdir(), "claude-usage-limits.json")

FALLBACK_ENABLED = os.environ.get("CLAUDE_USAGE_FALLBACK") == "1"


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


def read_cache():
    try:
        with open(CACHE_FILE) as f:
            c = json.load(f)
        if not c.get("fetchedAt"):
            return None
        if c.get("retryAfterUntil") and time.time() * 1000 < c["retryAfterUntil"]:
            return "BACKOFF"
        if time.time() - c.get("fetchedAt", 0) / 1000 < CACHE_TTL:
            return c.get("data")
    except Exception:
        pass
    return None


def write_cache(data, retry_after_until=0):
    try:
        with open(CACHE_FILE, "w") as f:
            json.dump({"fetchedAt": int(time.time() * 1000), "data": data,
                       "retryAfterUntil": retry_after_until}, f)
    except Exception:
        pass


def token_from_file():
    try:
        with open(os.path.expanduser("~/.claude/.credentials.json")) as f:
            return json.load(f).get("claudeAiOauth", {}).get("accessToken")
    except Exception:
        return None


def fetch_oauth():
    if not FALLBACK_ENABLED:
        return None
    cached = read_cache()
    if cached == "BACKOFF":
        return None
    if cached:
        return cached
    token = token_from_file()
    if not token and sys.platform == "darwin":
        try:
            import subprocess
            out = subprocess.run(
                ["security", "find-generic-password", "-s", "Claude Code-credentials", "-w"],
                capture_output=True, text=True, timeout=2,
            ).stdout.strip()
            try:
                token = json.loads(out).get("claudeAiOauth", {}).get("accessToken")
            except Exception:
                token = out or None
        except Exception:
            pass
    if not token:
        return None
    try:
        req = urllib.request.Request(
            "https://api.anthropic.com/api/oauth/usage",
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {token}",
                "anthropic-beta": "oauth-2025-04-20",
            },
        )
        with urllib.request.urlopen(req, timeout=3) as res:
            j = json.load(res)
        norm = {"five_hour": None, "seven_day": None}
        if j.get("five_hour"):
            norm["five_hour"] = {
                "used": j["five_hour"].get("utilization"),
                "resets_at_iso": j["five_hour"].get("resets_at"),
            }
        wk = j.get("seven_day") or j.get("seven_day_oauth_apps")
        if wk:
            norm["seven_day"] = {"used": wk.get("utilization"), "resets_at_iso": wk.get("resets_at")}
        if not norm["five_hour"] and not norm["seven_day"]:
            return None
        write_cache(norm)
        return norm
    except Exception as e:
        # Respect retry-after on 429s; back off quietly on any failure so an
        # undocumented endpoint is never hammered from the statusline.
        try:
            import urllib.error
            if isinstance(e, urllib.error.HTTPError):
                try:
                    ra = int(e.headers.get("retry-after") or 0)
                except Exception:
                    ra = 0
                backoff_ms = max(ra * 1000, RETRY_BACKOFF_MIN * 1000)
                write_cache(None, int(time.time() * 1000) + backoff_ms)
                return None
        except Exception:
            pass
        try:
            write_cache(None, int(time.time() * 1000) + RETRY_BACKOFF_MIN * 1000)
        except Exception:
            pass
        return None


def iso_to_epoch(iso):
    if not iso:
        return None
    try:
        from datetime import datetime
        return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp())
    except Exception:
        return None


def main():
    try:
        raw = sys.stdin.read() if not sys.stdin.isatty() else ""
        d = json.loads(raw) if raw.strip() else {}
    except Exception:
        d = {}

    model = (d.get("model") or {}).get("display_name") or (d.get("model") or {}).get("id") or ""
    ctx = (d.get("context_window") or {}).get("used_percentage")

    five = seven = None
    rl = d.get("rate_limits") or {}
    fh = rl.get("five_hour") or {}
    if fh.get("used_percentage") is not None:
        five = {"used": fh["used_percentage"], "resets_at": fh.get("resets_at")}
    wk = rl.get("seven_day") or rl.get("sevenDay") or {}
    if wk.get("used_percentage") is not None:
        seven = {"used": wk["used_percentage"], "resets_at": wk.get("resets_at")}

    if five is None and seven is None:
        api = fetch_oauth()
        if api:
            if api.get("five_hour"):
                five = {"used": api["five_hour"]["used"],
                        "resets_at": iso_to_epoch(api["five_hour"]["resets_at_iso"])}
            if api.get("seven_day"):
                seven = {"used": api["seven_day"]["used"],
                         "resets_at": iso_to_epoch(api["seven_day"]["resets_at_iso"])}

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

    print(" | ".join(parts) if parts else f"{DIM}limits n/a yet{RESET}")


if __name__ == "__main__":
    main()
