#!/usr/bin/env node
/**
 * usage-statusline.js — Claude Code statusline showing limits + API cost.
 *
 * Data source: stdin JSON from Claude Code (`rate_limits.five_hour` and
 * `rate_limits.seven_day`). Official payload, same data as `/usage`.
 * Zero config, zero network, zero tokens.
 *
 * Output: single line, e.g.
 *   [Opus] 5h 77% left (3h12m) | 7d 65% left (2d4h) | ctx 34% | API ~$1.23
 */
'use strict';

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';

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

async function main() {
  const raw = await readStdin();
  let d = {};
  try { d = raw ? JSON.parse(raw) : {}; } catch { d = {}; }

  const model = d?.model?.display_name || d?.model?.id || '';
  const ctxPct = d?.context_window?.used_percentage;

  // Native payload (Pro/Max, after first API response in the session).
  let five = null;
  let seven = null;
  const rl = d?.rate_limits;
  if (rl?.five_hour?.used_percentage != null) {
    five = { used: rl.five_hour.used_percentage, resets_at: rl.five_hour.resets_at };
  }
  const wk = rl?.seven_day || rl?.sevenDay;
  if (wk?.used_percentage != null) {
    seven = { used: wk.used_percentage, resets_at: wk.resets_at };
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

  // Claude Code's cumulative API-equivalent estimate for this session.
  const apiCost = d?.cost?.total_cost_usd;
  if (typeof apiCost === 'number' && Number.isFinite(apiCost) && apiCost >= 0) {
    parts.push(`${DIM}API ~$${apiCost.toFixed(2)}${RESET}`);
  }

  if (parts.length === 0) {
    // Rate limits appear after the first API response on Pro/Max plans.
    console.log(`${DIM}limits n/a yet${RESET}`);
  } else if (!s5 && !s7) {
    // Model, context, and cost are available independently of plan limits.
    console.log(parts.join(' '));
  } else {
    console.log(parts.join(' | '));
  }
}

main().then(
  () => process.exit(0),
  () => { try { console.log(''); } catch {} process.exit(0); },
);
