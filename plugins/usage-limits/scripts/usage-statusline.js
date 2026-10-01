#!/usr/bin/env node
/**
 * usage-statusline.js — Claude Code statusline showing 5h + weekly limits.
 *
 * Primary data source: stdin JSON from Claude Code (`rate_limits.five_hour`
 * and `rate_limits.seven_day`). Zero config, zero network, zero tokens.
 *
 * Fallback (older Claude Code without `rate_limits` in payload): OAuth usage
 * API https://api.anthropic.com/api/oauth/usage — UNOFFICIAL, undocumented
 * endpoint. DISABLED by default; enable explicitly with
 * CLAUDE_USAGE_FALLBACK=1. Result cached 300s in tmpdir, with
 * retry-after backoff (min 60s) after 429s/errors so we never hammer it.
 *
 * Install: /usage-limits:usage skill, or run ../scripts/install.sh
 * Output: single line, e.g.
 *   [Opus] 5h 77% left (3h12m) | 7d 65% left (2d4h) | ctx 34%
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;
const RETRY_BACKOFF_MIN_MS = 60 * 1000;

// Unofficial fallback must be explicitly opted in — native rate_limits
// payload is the default and only always-on source.
const FALLBACK_ENABLED = process.env.CLAUDE_USAGE_FALLBACK === '1';

function colorForUsed(used) {
  if (used == null || Number.isNaN(used)) return RESET;
  if (used >= 90) return RED;
  if (used >= 70) return YELLOW;
  return GREEN;
}

/** "3h12m", "42m", "2d4h", "now" */
function fmtResetIn(resetsAtSec, nowSec) {
  if (!resetsAtSec) return '?';
  let d = Math.max(0, Math.floor(resetsAtSec - nowSec));
  if (d <= 0) return 'now';
  const days = Math.floor(d / 86400);
  d %= 86400;
  const hrs = Math.floor(d / 3600);
  const mins = Math.floor((d % 3600) / 60);
  if (days > 0) return hrs > 0 ? `${days}d${hrs}h` : `${days}d`;
  if (hrs > 0) return mins > 0 ? `${hrs}h${mins}m` : `${hrs}h`;
  if (mins > 0) return `${mins}m`;
  return `${d % 60}s`;
}

function bar(used, width = 5) {
  const u = Math.min(100, Math.max(0, used || 0));
  const filled = Math.round((u * width) / 100);
  return '▓'.repeat(filled) + '░'.repeat(width - filled);
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let s = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { s += c; });
    process.stdin.on('end', () => resolve(s));
    // Never hang the statusline.
    setTimeout(() => resolve(s), 800);
  });
}

function cacheFile() {
  return path.join(os.tmpdir(), 'claude-usage-limits.json');
}

function readCache() {
  try {
    const raw = fs.readFileSync(cacheFile(), 'utf8');
    const c = JSON.parse(raw);
    if (!c || !c.fetchedAt) return null;
    // Backoff window after 429s/errors: stay quiet until it lapses.
    if (c.retryAfterUntil && Date.now() < c.retryAfterUntil) return 'BACKOFF';
    if (Date.now() - c.fetchedAt < CACHE_TTL_MS) return c.data;
  } catch { /* miss */ }
  return null;
}

function writeCache(data, retryAfterUntil = 0) {
  try {
    fs.writeFileSync(cacheFile(), JSON.stringify({ fetchedAt: Date.now(), data, retryAfterUntil }), 'utf8');
  } catch { /* tmp unwritable — ignore */ }
}

function tokenFromCredentialsFile() {
  try {
    const p = path.join(os.homedir(), '.claude', '.credentials.json');
    const raw = fs.readFileSync(p, 'utf8');
    const j = JSON.parse(raw);
    return j?.claudeAiOauth?.accessToken || null;
  } catch { return null; }
}

function tokenFromKeychain() {
  if (process.platform !== 'darwin') return null;
  try {
    const out = execSync('security find-generic-password -s "Claude Code-credentials" -w', {
      encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    // Keychain may hold raw JSON or the bare token.
    try {
      return JSON.parse(out)?.claudeAiOauth?.accessToken || null;
    } catch {
      return out || null;
    }
  } catch { return null; }
}

async function fetchOAuthUsage() {
  if (!FALLBACK_ENABLED) return null;
  const cached = readCache();
  if (cached === 'BACKOFF') return null;
  if (cached) return cached;
  const token = tokenFromCredentialsFile() || tokenFromKeychain();
  if (!token) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      // Respect retry-after; never hammer an undocumented endpoint.
      const ra = parseInt(res.headers.get('retry-after') || '0', 10);
      const backoffMs = Math.max(Number.isNaN(ra) ? 0 : ra * 1000, RETRY_BACKOFF_MIN_MS);
      writeCache(null, Date.now() + backoffMs);
      return null;
    }
    const j = await res.json();
    const norm = {
      five_hour: j.five_hour
        ? { used: j.five_hour.utilization, resets_at_iso: j.five_hour.resets_at }
        : null,
      seven_day: (j.seven_day || j.seven_day_oauth_apps)
        ? {
            used: (j.seven_day || j.seven_day_oauth_apps).utilization,
            resets_at_iso: (j.seven_day || j.seven_day_oauth_apps).resets_at,
          }
        : null,
    };
    if (!norm.five_hour && !norm.seven_day) return null;
    writeCache(norm);
    return norm;
  } catch {
    // Network/timeout: back off quietly, don't retry every tick.
    writeCache(null, Date.now() + RETRY_BACKOFF_MIN_MS);
    return null;
  }
}

function isoToEpochSec(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
}

async function main() {
  const raw = await readStdin();
  let d = {};
  try { d = raw ? JSON.parse(raw) : {}; } catch { d = {}; }

  const model = d?.model?.display_name || d?.model?.id || '';
  const ctxPct = d?.context_window?.used_percentage;

  let five = null;
  let seven = null;

  // 1) Native payload (Claude Code >= ~2.1, Pro/Max, after first API response).
  const rl = d?.rate_limits;
  if (rl?.five_hour?.used_percentage != null) {
    five = { used: rl.five_hour.used_percentage, resets_at: rl.five_hour.resets_at };
  }
  const wk = rl?.seven_day || rl?.sevenDay;
  if (wk?.used_percentage != null) {
    seven = { used: wk.used_percentage, resets_at: wk.resets_at };
  }

  // 2) OAuth fallback for older clients / pre-first-response.
  if (!five && !seven) {
    const api = await fetchOAuthUsage();
    if (api?.five_hour) {
      five = { used: api.five_hour.used, resets_at: isoToEpochSec(api.five_hour.resets_at_iso) };
    }
    if (api?.seven_day) {
      seven = { used: api.seven_day.used, resets_at: isoToEpochSec(api.seven_day.resets_at_iso) };
    }
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const parts = [];
  if (model) parts.push(`${CYAN}[${model}]${RESET}`);

  const seg = (label, w) => {
    if (w == null || w.used == null) return null;
    const left = Math.max(0, 100 - w.used);
    const c = colorForUsed(w.used);
    const resetTxt = w.resets_at ? fmtResetIn(w.resets_at, nowSec) : '?';
    return `${label} ${c}${bar(w.used)} ${Math.round(left)}% left${RESET}${DIM} (${resetTxt})${RESET}`;
  };

  const s5 = seg('5h', five);
  const s7 = seg('7d', seven);
  if (s5) parts.push(s5);
  if (s7) parts.push(s7);

  if (ctxPct != null) {
    const c = Math.round(ctxPct);
    parts.push(`${DIM}ctx ${c}%${RESET}`);
  }

  if (parts.length === 0) {
    // Rate limits appear after the first API response on Pro/Max plans.
    console.log(`${DIM}limits n/a yet${RESET}`);
  } else if (!s5 && !s7) {
    // Only model/ctx available — still useful, hint why limits are missing.
    console.log(parts.join(' '));
  } else {
    console.log(parts.join(' | '));
  }
}

main().then(
  () => process.exit(0),
  () => { try { console.log(''); } catch {} process.exit(0); },
);
