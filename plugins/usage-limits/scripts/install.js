#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function install() {
  const dir = path.resolve(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'));
  const settingsPath = path.join(dir, 'settings.json');
  const scriptPath = path.join(dir, 'claude-usage-statusline.js');
  const source = fs.readFileSync(path.join(__dirname, 'usage-statusline.js'));
  const exists = fs.existsSync(settingsPath);
  const original = exists ? fs.readFileSync(settingsPath, 'utf8') : '{}';
  const settings = JSON.parse(original.replace(/^\uFEFF/, ''));
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('settings.json must contain a JSON object; no files changed');
  }

  const portablePath = process.platform === 'win32' ? scriptPath.replace(/\\/g, '/') : scriptPath;
  // Encoding unusual shell characters works in both Bash and PowerShell.
  const command = /["$`\\\r\n]/.test(portablePath)
    ? `node -e "require(Buffer.from('${Buffer.from(scriptPath).toString('base64')}', 'base64').toString('utf8'))"`
    : `node "${portablePath}"`;
  const previous = settings.statusLine;
  settings.statusLine = {
    ...(previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {}),
    type: 'command', command,
    padding: previous?.padding ?? 0,
  };

  fs.mkdirSync(dir, { recursive: true });
  const suffix = `.bak.${Date.now()}-${randomUUID()}`;
  if (exists) fs.copyFileSync(settingsPath, settingsPath + suffix, fs.constants.COPYFILE_EXCL);
  if (fs.existsSync(scriptPath)) fs.copyFileSync(scriptPath, scriptPath + suffix, fs.constants.COPYFILE_EXCL);
  fs.writeFileSync(scriptPath, source);
  // Finish writing before replacing the user's existing configuration.
  const temporary = settingsPath + `.tmp.${randomUUID()}`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(settings, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, settingsPath);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  console.log(`statusLine -> ${command}`);
  if (exists) console.log(`Settings backup: ${settingsPath + suffix}`);
  console.log('Done. Restart Claude Code if the statusline does not appear.');
  console.log('Re-run this installer after plugin updates to refresh the copied script.');
}

try {
  install();
} catch (error) {
  console.error(`Installation failed: ${error.message}`);
  process.exitCode = 1;
}
