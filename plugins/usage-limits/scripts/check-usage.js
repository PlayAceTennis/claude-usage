#!/usr/bin/env node
/**
 * check-usage.js — on-demand detailed usage view (`/usage-limits:usage`).
 * Uses the OAuth usage API directly (works outside the statusline payload).
 * NOTE: unofficial, undocumented endpoint. Explicit on-demand user invocation
 * only (never background polling). Respects retry-after on 429s.
 * Token: ~/.claude/.credentials.json, else macOS Keychain. Token is only
 * sent to api.anthropic.com, never stored or transmitted elsewhere.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

function token() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', '.credentials.json'), 'utf8'));
    if (j?.claudeAiOauth?.accessToken) return j.claudeAiOauth.accessToken;
  } catch {}
  if (process.platform === 'darwin') {
    try {
      const out = execSync('security find-generic-password -s "Claude Code-credentials" -w',
        { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      try { return JSON.parse(out)?.claudeAiOauth?.accessToken || out; }
      catch { return out || null; }
    } catch {}
  }
  return null;
}

function bar(used, w = 20) {
  const u = Math.min(100, Math.max(0, used || 0));
  const f = Math.round((u * w) / 100);
  return '█'.repeat(f) + '░'.repeat(w - f);
}

function fmtIn(iso) {
  if (!iso) return 'unknown';
  const ms = Date.parse(iso) - Date.now();
  if (Number.isNaN(ms)) return 'unknown';
  if (ms <= 0) return 'now';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  const at = new Date(iso).toLocaleString();
  const rel = d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  return `in ${rel} (${at})`;
}

async function main() {
  const t = token();
  if (!t) {
    console.log('No Claude credentials found.\nLooked in ~/.claude/.credentials.json and macOS Keychain ("Claude Code-credentials").\nAre you signed in to Claude Code?');
    process.exit(1);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  let res;
  try {
    res = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        Accept: 'application/json', 'Content-Type': 'application/json',
        Authorization: `Bearer ${t}`, 'anthropic-beta': 'oauth-2025-04-20',
      },
      signal: ctrl.signal,
    });
  } catch (e) {
    console.log(`Request failed: ${e.message}`);
    process.exit(1);
  } finally { clearTimeout(timer); }
  if (!res.ok) {
    const ra = res.headers.get('retry-after');
    const hint = ra ? ` Retry after ${ra}s.` : ' Please try again later.';
    console.log(`API returned HTTP ${res.status}.${hint} Token may be expired — run /login in Claude Code.`);
    process.exit(1);
  }
  const j = await res.json();
  const rows = [
    ['5-hour session', j.five_hour],
    ['7-day weekly  ', j.seven_day || j.seven_day_oauth_apps],
  ];
  if (j.seven_day_opus?.utilization) rows.push(['7-day Opus    ', j.seven_day_opus]);
  for (const [label, w] of rows) {
    if (!w) { console.log(`${label}: n/a`); continue; }
    const used = w.utilization ?? 0;
    const left = Math.max(0, 100 - used);
    console.log(`${label}  ${bar(used)} ${used.toFixed(0)}% used · ${left.toFixed(0)}% left`);
    console.log(`                resets ${fmtIn(w.resets_at)}`);
  }
}
main();
