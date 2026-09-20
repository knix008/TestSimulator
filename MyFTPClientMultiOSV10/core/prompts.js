// Prompt text for the in-app local terminal. Templates follow the same
// MyShell model as MyTerminal (app-owned prompt, one-shot cmd /c ·
// powershell -Command · bash -c) with each shell's native path style:
//   cmd / PowerShell  D:\folder
//   Git Bash / MSYS2  /d/folder
//   Cygwin            /cygdrive/d/folder
//   WSL               /mnt/d/folder
// Placeholders: {path} {folder} {name} {shell} {user} {host}
'use strict';

const os = require('os');
const path = require('path');
const { shortName } = require('./shells');

const DEFAULT_SHELL_PROMPTS = {
  cmd: '{path}>',
  powershell: 'PS {path}> ',
  pwsh: 'pwsh {path}> ',
  'git-bash': 'MINGW64 {path}$ ',
  msys2: 'MSYS {path}$ ',
  cygwin: '{path}$ ',
  nu: '{shell} {path}> ',
  fish: '{path}> ',
  posix: '{shell}:{path}$ ',
  wsl: '{shell}:{path}$ ',
};

function winDrivePath(winPath) {
  const n = String(winPath || '').replace(/\//g, '\\');
  const m = n.match(/^([A-Za-z]):\\(.*)$/);
  if (!m) return null;
  return { drive: m[1].toLowerCase(), rest: m[2].replace(/\\/g, '/') };
}

function promptPathStyle(shell) {
  const id = (shell && shell.id) || '';
  const kind = (shell && shell.kind) || '';
  if (kind === 'cmd' || kind === 'powershell') return 'windows';
  if (kind === 'wsl' || String(id).startsWith('wsl:')) return 'wsl';
  if (id === 'cygwin') return 'cygdrive';
  return 'msys';
}

function toPosixPromptPath(winPath, style) {
  const kindOrStyle = style === 'posix' ? 'msys' : style;
  const d = winDrivePath(winPath);
  if (!d) return String(winPath || '').replace(/\\/g, '/');
  const rest = d.rest.replace(/\/$/, '');
  if (kindOrStyle === 'wsl') return rest ? `/mnt/${d.drive}/${rest}` : `/mnt/${d.drive}`;
  if (kindOrStyle === 'cygdrive') return rest ? `/cygdrive/${d.drive}/${rest}` : `/cygdrive/${d.drive}`;
  return rest ? `/${d.drive}/${rest}` : `/${d.drive}`;
}

function fromPosixLike(p, kind) {
  const s = String(p || '').trim().replace(/\\/g, '/');
  let m = s.match(/^\/(?:mnt|cygdrive)\/([a-zA-Z])(?:\/(.*))?$/);
  if (m) return `${m[1].toUpperCase()}:\\${(m[2] || '').replace(/\//g, '\\')}`;
  m = s.match(/^\/([a-zA-Z])(?:\/(.*))?$/);
  if (m && kind !== 'wsl') return `${m[1].toUpperCase()}:\\${(m[2] || '').replace(/\//g, '\\')}`;
  return p;
}

function promptUser() {
  try { return os.userInfo().username || 'user'; } catch { return 'user'; }
}

function promptHost() {
  try { return os.hostname() || 'host'; } catch { return 'host'; }
}

function sanitizePrompt(s, fallback = DEFAULT_SHELL_PROMPTS.powershell) {
  const t = String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').replace(/^\s+/, '').slice(0, 80);
  return t.trim() ? t : fallback;
}

function defaultPromptFor(shell) {
  const id = (shell && shell.id) || '';
  const kind = (shell && shell.kind) || '';
  if (DEFAULT_SHELL_PROMPTS[id]) return DEFAULT_SHELL_PROMPTS[id];
  if (String(id).startsWith('wsl:')) return DEFAULT_SHELL_PROMPTS.wsl;
  if (kind && DEFAULT_SHELL_PROMPTS[kind]) return DEFAULT_SHELL_PROMPTS[kind];
  return DEFAULT_SHELL_PROMPTS.posix;
}

function sanitizePromptMap(raw, legacyPs) {
  const out = { ...DEFAULT_SHELL_PROMPTS };
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  for (const [k, v] of Object.entries(src)) {
    if (typeof v !== 'string') continue;
    out[k] = sanitizePrompt(v, out[k] || DEFAULT_SHELL_PROMPTS.posix);
  }
  if (legacyPs && src.powershell === undefined && src.pwsh === undefined) {
    const ps = sanitizePrompt(legacyPs, DEFAULT_SHELL_PROMPTS.powershell);
    out.powershell = ps;
    out.pwsh = ps;
  }
  return out;
}

function resolvePromptTemplate(shell, templates) {
  const map = templates && typeof templates === 'object' ? templates : {};
  const id = (shell && shell.id) || '';
  const kind = (shell && shell.kind) || '';
  if (id && typeof map[id] === 'string' && map[id].trim()) return sanitizePrompt(map[id], defaultPromptFor(shell));
  if (String(id).startsWith('wsl:') && typeof map.wsl === 'string' && map.wsl.trim()) {
    return sanitizePrompt(map.wsl, defaultPromptFor(shell));
  }
  if (kind && typeof map[kind] === 'string' && map[kind].trim()) {
    return sanitizePrompt(map[kind], defaultPromptFor(shell));
  }
  return defaultPromptFor(shell);
}

function formatShellPrompt(shell, cwd, templates) {
  const sh = shell || {};
  const style = promptPathStyle(sh);
  const winPath = String(cwd || '');
  const displayPath = style === 'windows' ? winPath : toPosixPromptPath(winPath, style);
  const folder = path.basename(winPath) || winPath;
  const tmpl = resolvePromptTemplate(sh, templates);
  return tmpl
    .replace(/\{path\}/g, displayPath)
    .replace(/\{folder\}/g, folder)
    .replace(/\{name\}/g, folder)
    .replace(/\{shell\}/g, shortName(sh))
    .replace(/\{user\}/g, promptUser())
    .replace(/\{host\}/g, promptHost());
}

module.exports = {
  DEFAULT_SHELL_PROMPTS,
  defaultPromptFor,
  sanitizePrompt,
  sanitizePromptMap,
  resolvePromptTemplate,
  formatShellPrompt,
  promptPathStyle,
  toPosixPromptPath,
  fromPosixLike,
};
