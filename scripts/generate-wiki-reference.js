#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const INDEX_PATH = path.join(ROOT, 'src/cli/index.ts');
const COMMANDS_DIR = path.join(ROOT, 'src/cli/commands');
const PKG_PATH = path.join(ROOT, 'package.json');

function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }

function getVersion() {
  try { const pkg = JSON.parse(read(PKG_PATH)); return pkg.version || '0.6.1'; } catch { return '0.6.1'; }
}

function extractDescriptions(fileContent) {
  const descs = [];
  const simple = /\.description\(\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = simple.exec(fileContent)) !== null) {
    descs.push(m[1].trim());
  }
  return descs;
}

function extractOptions(fileContent) {
  const opts = [];
  const optRe = /\.option\(\s*["'`]([^"'`]+)["'`]\s*,?\s*["'`]?([^"'`]*)["'`]?/g;
  let m;
  while ((m = optRe.exec(fileContent)) !== null) {
    const flag = m[1].trim();
    const desc = (m[2]||'').trim();
    if (flag) opts.push({ flag, desc });
  }
  return opts;
}

function extractCommandsFromIndex(indexContent) {
  const cmds = [];
  const re = /program\.addCommand\((\w+)\)/g;
  let m;
  while ((m = re.exec(indexContent)) !== null) cmds.push(m[1]);
  return cmds;
}

const indexContent = read(INDEX_PATH);
const commandsFromIndex = extractCommandsFromIndex(indexContent);

const files = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith('.ts'));
const cmdData = {};

for (const f of files) {
  const content = read(path.join(COMMANDS_DIR, f));
  const base = f.replace('.ts','');
  const descs = extractDescriptions(content);
  const opts = extractOptions(content);
  const nameRe = /new Command\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
  const names = [];
  let nm;
  while ((nm = nameRe.exec(content)) !== null) names.push(nm[1]);
  cmdData[base] = { file: f, desc: descs[0] || base, allDescs: descs, opts, names };
}

const version = getVersion();
const date = new Date().toISOString().slice(0,10);

let md = '# CLI Reference\n\n';
md += 'Complete command surface for `tdm` — grouped by workflow. Auto-generated from `src/cli/commands/*` + `src/cli/index.ts` via `scripts/generate-wiki-reference.js`. Source of truth is the repo.\n\n';
md += '> Tip: `tdm <command> --help` always wins for flags. This page is for planning.\n\n';
md += '## Conventions\n\n';
md += '- All commands respect XDG: `~/.config/tdm/` + `~/.local/state/tdm/`\n';
md += '- Global: `tdm --version` → `' + version + '`, `tdm --help`\n';
md += '- Config via `src/config/schema.ts` — see [[Configuration]]\n';
md += '- Auth via `src/state/authStore.ts` — see [[Authentication]]\n\n';
md += 'Index detected ' + commandsFromIndex.length + ' top-level commands: `' + commandsFromIndex.join('`, `') + '`.\n\n';
md += 'Files in src/cli/commands: ' + files.join(', ') + '\n\n---\n\n';

function renderBlock(key, title) {
  const d = cmdData[key];
  if (!d) return '';
  let out = '';
  if (title) out += '### ' + title + '\n\n';
  out += '**File:** `' + d.file + '` → ' + d.allDescs.map(s=> '"' + s + '"').join(' | ') + '\n\n';
  if (d.names.length) out += 'Subcommands/names: `' + d.names.join('`, `') + '`\n\n';
  if (d.opts.length) {
    out += 'Options detected (' + d.opts.length + '):\n\n';
    d.opts.forEach(o=> { out += '- `' + o.flag + '` — ' + o.desc + '\n'; });
    out += '\n';
  }
  return out;
}

md += '## Core\n\n';
md += renderBlock('run','`tdm run` — the miner');
md += '```bash\ntdm run\ntdm run --verbose\ntdm run --dry-run --verbose\ntdm run --no-lock\ntdm run --metrics-port 9098 --metrics-host 0.0.0.0\n```\n\n';
md += renderBlock('status','`tdm status`');
md += '```bash\ntdm status\ntdm status --json | jq\ntdm status --verbose\n```\n\n';
md += renderBlock('doctor','`tdm doctor`');
md += '```bash\ntdm doctor\ntdm doctor --json | jq\n```\n\n---\n\n## Auth\n\n';
md += renderBlock('auth','`tdm auth`');
md += '```bash\ntdm auth login --no-open\ntdm auth validate\ntdm auth validate --local-only\ntdm auth import --token "auth-token=XXX"\ntdm auth import --token-file /secure/token.txt\ntdm auth import-cookie --cookie "auth-token=..."\ntdm auth import-cookie --cookie-file /path/cookies.txt\ntdm auth export --format env\ntdm auth export --format json --show-secrets\ntdm auth logout\n```\n\nRelated: [[Authentication]]\n\n---\n\n## Config & Games\n\n';
md += renderBlock('config','`tdm config`');
md += '```bash\ntdm config get\ntdm config get priority\ntdm config set priority \'["Overwatch","Marvel Rivals"]\'\ntdm config path\ntdm config validate\n```\n\n';
md += renderBlock('games','`tdm games`');
md += '```bash\ntdm games\ntdm games --json | jq\ntdm games --add "Overwatch"\n```\n\n---\n\n## Service & Logs\n\n';
md += renderBlock('service','`tdm service`');
md += '```bash\ntdm service install --user --autostart\ntdm service start\ntdm service status\ntdm service restart\ntdm service stop\ntdm service uninstall\n```\n\n';
md += renderBlock('logs','`tdm logs`');
md += '```bash\ntdm logs\ntdm logs --follow\n```\n\n---\n\n## Observability\n\n';
md += renderBlock('history','`tdm history`') + '\n';
md += renderBlock('metrics','`tdm metrics`') + '\n';
md += renderBlock('watch','`tdm watch`') + '\n';
md += renderBlock('drops','`tdm drops`') + '\n';
md += renderBlock('homelab','`tdm hooks` / `tdm export`') + '\n';
md += '```bash\ntdm history --summary\ntdm history --limit 50\ntdm history --paths\ntdm metrics\ntdm metrics --serve --port 9098\ntdm watch\ntdm watch --interval 5\ntdm drops\ntdm drops --claimable\ntdm drops --game "Overwatch"\ntdm hooks\ntdm hooks --json | jq\ntdm export --what history --format json --limit 1000\ntdm export --what metrics --format prometheus\n```\n\nRelated: [[Observability]], [[Homelab-Integrations]]\n\n---\n\n## Strategy\n\n';
md += renderBlock('strategy','calendar / optimize / simulate') + '\n';
md += renderBlock('rules','`tdm rules`') + '\n';
md += '```bash\ntdm calendar\ntdm calendar --days 30 --active --upcoming --json\ntdm optimize --mode history|ending_soonest|low_avbl_first\ntdm simulate --hours 72\ntdm rules\ntdm rules --add \'viewers < 100 => skip\'\ntdm rules --remove 0\ntdm rules --clear\n```\n\nRelated: [[Strategy-Engine]]\n\n---\n\n## Other\n\n';
md += renderBlock('healthcheck','`tdm healthcheck`');
md += '```bash\ntdm healthcheck\ntdm healthcheck --json\n```\n\n---\n\n*Auto-generated skeleton — enhance with hand-written examples in https://github.com/vocino/TwitchDropsMiner-CLI/wiki/CLI-Reference.*\n\n';
md += '*Last synced: ' + version + ' — ' + date + '*\n';

console.log(md);
