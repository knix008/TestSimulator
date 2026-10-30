// ANSI colour for the in-app local terminal. Spawned shells write to pipes,
// so native colour is lost unless we paint it ourselves. Each shell keeps its
// own palette and listing layout:
//   cmd         Windows dir (cyan folders, yellow <DIR>)
//   PowerShell  Get-ChildItem table (blue folders, yellow headers)
//   Git/MSYS/WSL GNU ls (blue folders, green executables)
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { fromPosixLike } = require('./prompts');

const RESET = '\x1b[0m';

const DEFAULT_LS_COLORS =
  'di=1;34:ln=1;36:so=1;35:pi=33:ex=1;32:bd=1;33:cd=1;33:su=1;31:sg=1;31:' +
  'tw=1;34:ow=1;34:or=1;31:mi=1;31:*.zip=1;31:*.tar=1;31:*.gz=1;31:*.7z=1;31:' +
  '*.jpg=1;35:*.jpeg=1;35:*.png=1;35:*.gif=1;35:*.webp=1;35:*.mp3=1;36:*.mp4=1;36:' +
  '*.js=33:*.ts=33:*.mjs=33:*.py=33:*.json=36:*.md=37';

const PALETTES = {
  cmd: {
    dir: '1;36', exec: '1;32', file: '37', link: '1;36',
    archive: '1;31', image: '1;35', header: '1;37', tag: '1;33',
    error: '91', warn: '93', info: '96', property: '93',
  },
  powershell: {
    dir: '94', exec: '92', file: '37', link: '96',
    archive: '91', image: '95', header: '93', tag: '96',
    error: '91', warn: '93', info: '96', property: '96',
    boolTrue: '92', boolFalse: '91',
  },
  posix: {
    dir: '1;34', exec: '1;32', file: '', link: '1;36',
    archive: '1;31', image: '1;35', header: '1;37', tag: '1;33',
    error: '31', warn: '33', info: '36', property: '33',
  },
};

function stripAnsi(s) {
  return String(s == null ? '' : s).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

function paint(code, text) {
  if (!code || text == null || text === '') return text == null ? '' : String(text);
  return `\x1b[${code}m${text}${RESET}`;
}

function hasAnsi(s) {
  return /\x1b\[/.test(String(s || ''));
}

function shellPalette(shell) {
  const id = (shell && shell.id) || '';
  const kind = (shell && shell.kind) || '';
  if (kind === 'cmd' || id === 'cmd') return PALETTES.cmd;
  if (kind === 'powershell' || id === 'powershell' || id === 'pwsh') return PALETTES.powershell;
  return PALETTES.posix;
}

function colorEnv() {
  return {
    TERM: process.env.TERM && process.env.TERM !== 'dumb' ? process.env.TERM : 'xterm-256color',
    COLORTERM: process.env.COLORTERM || 'truecolor',
    FORCE_COLOR: process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0' ? process.env.FORCE_COLOR : '3',
    CLICOLOR: '1',
    CLICOLOR_FORCE: '1',
    PY_COLORS: '1',
    LS_COLORS: process.env.LS_COLORS || DEFAULT_LS_COLORS,
  };
}

function firstToken(line) {
  const m = String(line || '').trim().match(/^("(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\S+)/);
  if (!m) return { cmd: '', rest: '', raw: '' };
  const raw = m[1];
  const rest = String(line).trim().slice(raw.length);
  const cmd = raw.replace(/^["']|["']$/g, '');
  return { cmd, rest, raw };
}

function baseName(cmd) {
  return path.basename(String(cmd || '')).replace(/\.exe$/i, '').toLowerCase();
}

function hasMeta(rest) {
  return /[|&><]/.test(String(rest || ''));
}

function gnuColorLs(shell) {
  const id = (shell && shell.id) || '';
  const kind = (shell && shell.kind) || '';
  if (kind === 'wsl' || id === 'git-bash' || id === 'msys2' || id === 'cygwin') return true;
  return process.platform === 'linux';
}

function wrapCommandForColor(shell, line) {
  const text = String(line ?? '');
  const kind = (shell && shell.kind) || '';
  const id = (shell && shell.id) || '';
  if (id === 'nu' || id === 'fish') return wrapPosixPrefix(kind, text);
  const { cmd, rest } = firstToken(text);
  const base = baseName(cmd);
  let out = text;

  if ((kind === 'posix' || kind === 'wsl') && (base === 'ls' || base === 'dir') && !hasMeta(rest) && !/\s--color\b|\s-G\b/.test(rest)) {
    out = gnuColorLs(shell) || process.platform !== 'darwin'
      ? `${cmd} --color=always${rest}`
      : `${cmd} -G${rest}`;
  } else if ((kind === 'posix' || kind === 'wsl') && /^(grep|egrep|fgrep|rg)$/.test(base) && !/\s--color\b/.test(rest)) {
    out = `${cmd} --color=always${rest}`;
  } else if ((kind === 'posix' || kind === 'wsl') && base === 'diff' && !/\s--color\b/.test(rest)) {
    out = `${cmd} --color=always${rest}`;
  }

  if (base === 'git' && !/\s-c\s+color\./i.test(out)) {
    out = out.replace(/^(\s*git)(\s|$)/i, '$1 -c color.ui=always -c color.status=always -c color.branch=always -c color.diff=always$2');
  }

  if (kind === 'powershell') {
    out = `if ($PSStyle) { $PSStyle.OutputRendering = 'Ansi' }; ${out}`;
  }

  return wrapPosixPrefix(kind, out);
}

function wrapPosixPrefix(kind, line) {
  if (kind !== 'wsl') return line;
  return `export TERM=xterm-256color COLORTERM=truecolor FORCE_COLOR=3 CLICOLOR=1 CLICOLOR_FORCE=1; ${line}`;
}

const DEFAULT_HEAD = {
  cmd: 1, powershell: 1, pwsh: 1, 'git-bash': 1, msys2: 1, cygwin: 1, fish: 1, posix: 1, wsl: 1, nu: 1,
};

function colorizePrompt(shell, text) {
  const s = String(text ?? '');
  if (!s || hasAnsi(s)) return s;
  const id = (shell && shell.id) || '';
  const kind = (shell && shell.kind) || '';

  let m = s.match(/^(PS )(.+?)(>\s*)$/);
  if (id === 'powershell' || (kind === 'powershell' && id !== 'pwsh' && m)) {
    if (m) return paint(96, m[1]) + paint(93, m[2]) + m[3];
  }
  m = s.match(/^(pwsh )(.+?)(>\s*)$/);
  if (id === 'pwsh' && m) return paint(95, m[1]) + paint(93, m[2]) + m[3];

  m = s.match(/^(MINGW64 )(.+?)(\$\s*)$/);
  if (id === 'git-bash' && m) return paint(95, m[1]) + paint(93, m[2]) + m[3];
  m = s.match(/^(MSYS )(.+?)(\$\s*)$/);
  if (id === 'msys2' && m) return paint(95, m[1]) + paint(93, m[2]) + m[3];

  m = s.match(/^(.+?:)(.+?)(\$\s*)$/);
  if ((kind === 'wsl' || String(id).startsWith('wsl:')) && m) {
    return paint(96, m[1]) + paint(32, m[2]) + m[3];
  }

  m = s.match(/^(.+?)(\$\s*)$/);
  if ((id === 'cygwin' || kind === 'posix') && m && (id === 'cygwin' || id === 'posix' || !DEFAULT_HEAD[id])) {
    if (id === 'cygwin') return paint(32, m[1]) + m[2];
  }

  m = s.match(/^(.+?)(>\s*)$/);
  if ((id === 'cmd' || kind === 'cmd') && m) return paint(32, m[1]) + m[2];
  if (id === 'fish' && m) return paint(36, m[1]) + m[2];

  m = s.match(/^(.+?:)(.+?)(\$\s*)$/);
  if (m && (id === 'posix' || kind === 'posix')) return paint(32, m[1]) + paint(33, m[2]) + m[3];

  if (kind === 'cmd') return paint(32, s);
  if (kind === 'powershell') return paint(96, s);
  if (kind === 'wsl') return paint(32, s);
  return paint(36, s);
}

function colorizeBanner(text) {
  return paint(96, text);
}

function nameColor(name, isDir, mode, pal) {
  const p = pal || PALETTES.posix;
  if (isDir) return p.dir;
  const n = String(name || '').toLowerCase();
  if (/\.(zip|tar|gz|tgz|7z|rar|bz2)$/.test(n)) return p.archive;
  if (/\.(png|jpe?g|gif|webp|bmp|svg|ico)$/.test(n)) return p.image;
  if (/\.(mp3|wav|flac|mp4|mkv|avi|webm)$/.test(n)) return p.link;
  if (/\.(exe|bat|cmd|com|ps1|sh|bash|zsh|msi)$/.test(n)) return p.exec;
  if (mode && (mode & 0o111)) return p.exec;
  return p.file;
}

function colorizeName(name, isDir, mode, pal) {
  const code = nameColor(name, isDir, mode, pal);
  return code ? paint(code, name) : name;
}

function visibleWidth(s) {
  return stripAnsi(s).length;
}

function padLeft(s, n) {
  const t = String(s);
  return t.length >= n ? t : ' '.repeat(n - t.length) + t;
}

function padRight(s, n) {
  const t = String(s);
  const w = visibleWidth(t);
  return w >= n ? t : t + ' '.repeat(n - w);
}

function withCommas(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatDirDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}  ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function splitArgs(rest) {
  const out = [];
  const s = String(rest || '').trim();
  let cur = '';
  let q = '';
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (q) {
      if (ch === q) q = '';
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      q = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (cur) out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function isListFlag(a) {
  const x = String(a);
  if (/^\/[wbaWBA]$/.test(x)) return true;
  if (x === '-l' || x === '-a' || x === '-la' || x === '-al' || x === '-1' || x === '--all' || x === '--long') return true;
  if (x === '-Force' || x === '-force') return true;
  if (x === '--color' || /^--color=/.test(x) || x === '-G') return true;
  return false;
}

function isHardListFlag(a) {
  return /^\/s$/i.test(a) || /^-Recurse$/i.test(a) || /^-R$/i.test(a);
}

function listingRequest(shell, cmd, rest) {
  const kind = (shell && shell.kind) || '';
  const c = String(cmd || '').toLowerCase();
  if (hasMeta(rest)) return null;
  const args = splitArgs(rest);
  if (args.some(isHardListFlag)) return null;
  const names = args.filter((a) => !isListFlag(a) && !/^[/-]/.test(a));
  if (names.length > 1) return null;
  const flags = args.filter((a) => isListFlag(a) || /^[/-]/.test(a));
  const all = flags.some((a) => /^\/a$/i.test(a) || a === '-a' || a === '-la' || a === '-al' || a === '--all' || /^-Force$/i.test(a));
  const wide = flags.some((a) => /^\/w$/i.test(a) || a === '-1');
  const longFmt = flags.some((a) => a === '-l' || a === '-la' || a === '-al' || a === '--long');

  if (kind === 'cmd' && (c === 'dir' || c === 'ls')) {
    return { target: names[0] || '.', style: wide ? 'wide' : 'dir', all };
  }
  if (kind === 'powershell' && /^(dir|ls|gci|get-childitem)$/i.test(c)) {
    return { target: names[0] || '.', style: 'ps', all };
  }
  if ((kind === 'posix' || kind === 'wsl') && (c === 'ls' || c === 'dir' || c === 'll')) {
    const long = longFmt || c === 'dir' || c === 'll';
    return { target: names[0] || '.', style: long ? 'long' : 'wide', all };
  }
  return null;
}

function resolveListPath(cwd, target, kind) {
  const raw = String(target || '.').trim() || '.';
  if (raw === '~') return path.resolve(osHome());
  if (raw.startsWith('~/') || raw.startsWith('~\\')) return path.join(osHome(), raw.slice(2));
  if (raw.startsWith('/')) return fromPosixLike(raw, kind);
  if (path.isAbsolute(raw)) return path.normalize(raw);
  return path.resolve(cwd, raw);
}

function osHome() {
  return process.env.USERPROFILE || process.env.HOME || os.homedir();
}

function printColumns(names, cols) {
  const width = Math.max(40, Number(cols) || 80);
  const maxLen = names.reduce((m, n) => Math.max(m, visibleWidth(n)), 1);
  const colWidth = maxLen + 2;
  const numCols = Math.max(1, Math.floor(width / colWidth));
  const numRows = Math.ceil(names.length / numCols);
  const lines = [];
  for (let r = 0; r < numRows; r += 1) {
    let line = '';
    for (let c = 0; c < numCols; c += 1) {
      const idx = c * numRows + r;
      if (idx >= names.length) break;
      const name = names[idx];
      const pad = colWidth - visibleWidth(name);
      line += name + (c < numCols - 1 ? ' '.repeat(Math.max(1, pad)) : '');
    }
    lines.push(line.replace(/\s+$/g, ''));
  }
  return lines;
}

function readEntries(target, all) {
  let entries = fs.readdirSync(target, { withFileTypes: true });
  if (!all) entries = entries.filter((ent) => !String(ent.name).startsWith('.'));
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
  return entries;
}

function paintName(ent, full, pal) {
  let mode = 0;
  try { mode = fs.statSync(full).mode; } catch { /* ignore */ }
  return colorizeName(ent.name, ent.isDirectory(), mode, pal);
}

function renderCmdDir(target, entries, pal) {
  const lines = [paint(pal.header, ` Directory of ${target}`), ''];
  let files = 0;
  let dirs = 0;
  let bytes = 0;
  for (const ent of entries) {
    const full = path.join(target, ent.name);
    let info;
    try { info = fs.statSync(full); } catch { continue; }
    const when = formatDirDate(info.mtime);
    const name = paintName(ent, full, pal);
    if (ent.isDirectory()) {
      dirs += 1;
      lines.push(`${when}    ${paint(pal.tag, '<DIR>')}          ${name}`);
    } else {
      files += 1;
      bytes += info.size || 0;
      lines.push(`${when} ${padLeft(withCommas(info.size || 0), 16)} ${name}`);
    }
  }
  lines.push(paint(pal.info, `${padLeft(String(files), 16)} File(s) ${padLeft(withCommas(bytes), 14)} bytes`));
  lines.push(paint(pal.info, `${padLeft(String(dirs), 16)} Dir(s)`));
  return lines.join('\r\n') + '\r\n';
}

function renderPsTable(target, entries, pal) {
  const lines = [
    '',
    `    ${paint(pal.tag, 'Directory:')} ${paint(pal.header, target)}`,
    '',
    paint(pal.header, 'Mode                 LastWriteTime         Length Name'),
    paint(pal.header, '----                 -------------         ------ ----'),
  ];
  for (const ent of entries) {
    const full = path.join(target, ent.name);
    let info;
    try { info = fs.statSync(full); } catch { continue; }
    const mode = ent.isDirectory() ? 'd-----' : (ent.isSymbolicLink && ent.isSymbolicLink() ? 'l-----' : '-a----');
    const when = padRight(formatDirDate(info.mtime), 20);
    const size = ent.isDirectory() ? padLeft('', 14) : padLeft(String(info.size || 0), 14);
    const name = paintName(ent, full, pal);
    lines.push(`${paint(ent.isDirectory() ? pal.dir : '37', padRight(mode, 7))}    ${when}${size} ${name}`);
  }
  return lines.join('\r\n') + '\r\n';
}

function posixMode(ent, info) {
  const dir = ent.isDirectory() ? 'd' : '-';
  const exec = !ent.isDirectory() && info && (info.mode & 0o111) ? 'x' : '-';
  return `${dir}rw${exec}r-${exec}r-${exec}`;
}

function renderPosixLong(entries, pal) {
  let sizeWidth = 5;
  const rows = entries.map((ent) => {
    const full = ent.full;
    let info;
    try { info = fs.statSync(full); } catch { info = { size: 0, mtime: new Date(), mode: 0 }; }
    const size = ent.isDirectory() ? '0' : String(info.size || 0);
    sizeWidth = Math.max(sizeWidth, size.length);
    return { ent, info, size };
  });
  const lines = [];
  for (const row of rows) {
    const mode = posixMode(row.ent, row.info);
    const name = paintName(row.ent, row.ent.full, pal);
    lines.push(`${paint('2;37', mode)}  1 ${formatDirDate(row.info.mtime)} ${padLeft(row.size, sizeWidth)} ${name}`);
  }
  return (lines.join('\r\n') + (lines.length ? '\r\n' : ''));
}

function renderListing({ cwd, shell, cmd, rest, cols }) {
  const req = listingRequest(shell, cmd, rest);
  if (!req) return null;
  const pal = shellPalette(shell);
  const target = resolveListPath(cwd, req.target, shell && shell.kind);
  let st;
  try {
    st = fs.statSync(target);
  } catch {
    return paint(pal.error, 'The system cannot find the path specified.') + '\r\n';
  }

  const oneFile = (name, isDir, full) => {
    let mode = 0;
    try { mode = fs.statSync(full).mode; } catch { /* ignore */ }
    return colorizeName(name, isDir, mode, pal);
  };

  if (st.isFile()) {
    if (req.style === 'ps') {
      return renderPsTable(path.dirname(target), [{
        name: path.basename(target),
        isDirectory: () => false,
        isSymbolicLink: () => false,
      }], pal);
    }
    if (req.style === 'dir') {
      return [
        paint(pal.header, ` Directory of ${path.dirname(target)}`),
        '',
        `${formatDirDate(st.mtime)} ${padLeft(withCommas(st.size || 0), 16)} ${oneFile(path.basename(target), false, target)}`,
      ].join('\r\n') + '\r\n';
    }
    return oneFile(path.basename(target), false, target) + '\r\n';
  }

  const entries = readEntries(target, req.all).map((ent) => {
    ent.full = path.join(target, ent.name);
    return ent;
  });

  if (req.style === 'ps') return renderPsTable(target, entries, pal);
  if (req.style === 'dir') return renderCmdDir(target, entries, pal);
  if (req.style === 'long') return renderPosixLong(entries, pal);

  const names = entries.map((ent) => oneFile(ent.name, ent.isDirectory(), ent.full));
  return printColumns(names, cols).join('\r\n') + (entries.length ? '\r\n' : '');
}

function colorizeLine(shell, line) {
  if (!line) return line;
  if (hasAnsi(line)) return line;
  const pal = shellPalette(shell);
  const kind = (shell && shell.kind) || '';
  const t = line;

  if (/not recognized as an internal or external command/i.test(t)
    || /The system cannot find/i.test(t)
    || /Access is denied/i.test(t)
    || /command not found/i.test(t)
    || /No such file or directory/i.test(t)
    || /Permission denied/i.test(t)
    || /^\s*ERROR(?:\s|:)/i.test(t)
    || /FullyQualifiedErrorId/i.test(t)
    || /^\s*\+ CategoryInfo/i.test(t)
    || /^\s*\+ FullyQualifiedErrorId/i.test(t)
    || /^\s*At (line|[A-Za-z]:)/i.test(t)) {
    return paint(pal.error, t);
  }
  if (/^\s*WARNING(?:\s|:)/i.test(t) || /^\s*WARN:/i.test(t)) return paint(pal.warn, t);
  if (/^\s*VERBOSE(?:\s|:)/i.test(t) || /^\s*DEBUG(?:\s|:)/i.test(t)) return paint(pal.info, t);

  if (kind === 'powershell') {
    if (/^\s*True\s*$/.test(t)) return paint(pal.boolTrue, t);
    if (/^\s*False\s*$/.test(t)) return paint(pal.boolFalse, t);
    if (/^\s*Mode\s+LastWriteTime/.test(t) || /^\s*Handles\s+NPM/.test(t)) return paint(pal.header, t);
    if (/^[-\s]+$/.test(t) && t.includes('-')) return paint('2;37', t);
    const list = t.match(/^(\s*)([^:]{1,40})(\s+:\s+)(.*)$/);
    if (list) return list[1] + paint(pal.property, list[2]) + list[3] + list[4];
    const dirRow = t.match(/^(\s*d[r-]{4,6}\b)(.*\s)(\S+)\s*$/);
    if (dirRow) return paint(pal.dir, dirRow[1]) + dirRow[2] + paint(pal.dir, dirRow[3]);
  }

  if (/^Microsoft Windows/i.test(t) || /^(Linux|Darwin|MINGW|MSYS|CYGWIN|Windows_NT)\b/.test(t)) {
    return paint(pal.info, t);
  }
  if (/^\s*Directory of /i.test(t) || /^\s*Volume in drive/i.test(t)) return paint(pal.header, t);
  if (/\s<DIR>\s/i.test(t)) return t.replace(/<DIR>/i, paint(pal.tag, '<DIR>'));
  return t;
}

function colorizeCommandOutput(shell, text, stream) {
  const raw = String(text ?? '');
  if (!raw) return raw;
  if (stream === 'stderr') {
    if (hasAnsi(raw)) return raw;
    const pal = shellPalette(shell);
    const ends = raw.match(/(\r\n|\n|\r)?$/);
    const body = ends && ends[0] ? raw.slice(0, -ends[0].length) : raw;
    const nl = (ends && ends[0]) || '';
    if (!body) return raw;
    return paint(pal.error, body) + nl;
  }
  if (hasAnsi(raw)) return raw;
  return raw.split(/(\r\n|\n|\r)/).map((part) => {
    if (part === '\r\n' || part === '\n' || part === '\r') return part;
    return colorizeLine(shell, part);
  }).join('');
}

module.exports = {
  RESET,
  DEFAULT_LS_COLORS,
  PALETTES,
  stripAnsi,
  paint,
  colorEnv,
  shellPalette,
  wrapCommandForColor,
  colorizePrompt,
  colorizeBanner,
  colorizeName,
  colorizeCommandOutput,
  listingRequest,
  renderListing,
};
