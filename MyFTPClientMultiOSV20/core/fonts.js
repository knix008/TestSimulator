// Installed font families for the terminal settings dropdown.
'use strict';

const { execFileSync } = require('child_process');

const CACHE_MS = 30_000;
let cache = null;
let cacheAt = 0;

const FALLBACK = {
  win32: ['Cascadia Mono', 'Cascadia Code', 'Consolas', 'Courier New', 'D2Coding', 'Lucida Console', 'Malgun Gothic', 'Microsoft YaHei', 'Segoe UI'],
  darwin: ['Menlo', 'Monaco', 'SF Mono', 'Courier', 'Apple SD Gothic Neo', 'Helvetica Neue'],
  linux: ['DejaVu Sans Mono', 'Ubuntu Mono', 'Noto Sans Mono', 'Liberation Mono', 'Noto Sans CJK KR', 'monospace'],
};

const PREFER = {
  win32: ['Cascadia Mono', 'Cascadia Code', 'Consolas', 'D2Coding', 'Courier New'],
  darwin: ['Menlo', 'SF Mono', 'Monaco', 'Courier'],
  linux: ['DejaVu Sans Mono', 'Ubuntu Mono', 'Noto Sans Mono', 'Liberation Mono'],
};

function uniqueSorted(names) {
  const seen = new Set();
  const out = [];
  for (const raw of names || []) {
    const n = String(raw || '').replace(/\u0000/g, '').trim();
    if (!n || n.length > 80 || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    out.push(n);
  }
  out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return out;
}

function run(file, args, extra = {}) {
  const raw = execFileSync(file, args, {
    windowsHide: true,
    timeout: extra.timeout || 15000,
    encoding: extra.encoding || 'buffer',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (typeof raw === 'string') return raw;
  if (raw.length >= 2 && raw[1] === 0) return raw.toString('utf16le');
  if (raw.length >= 2 && raw[0] === 0xFF && raw[1] === 0xFE) return raw.toString('utf16le');
  return raw.toString('utf8');
}

function listWindowsFonts() {
  try {
    const ps = [
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      'Add-Type -AssemblyName System.Drawing | Out-Null',
      '(New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }',
    ].join('; ');
    const text = run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 20000 });
    const names = uniqueSorted(text.split(/\r?\n/));
    if (names.length) return names;
  } catch { /* registry fallback */ }
  return listWindowsFontsFromReg();
}

function parseRegFontName(label) {
  let name = String(label || '').trim();
  if (!name || name.startsWith('@')) return '';
  name = name.replace(/\s*\((?:TrueType|OpenType|All res[^)]*)\)\s*$/i, '');
  name = name.replace(/\s+(Bold Italic|Italic|Bold|Light|Medium|Black|Thin|ExtraLight|SemiBold|ExtraBold|Oblique|Regular|Narrow|Condensed)$/i, '');
  return name.trim();
}

function listWindowsFontsFromReg() {
  const keys = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
    'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
  ];
  const names = [];
  for (const key of keys) {
    try {
      const text = run('reg', ['query', key, '/reg:64'], { timeout: 8000 });
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s+(.+?)\s+REG_(?:SZ|EXPAND_SZ)\s+/i);
        if (m) names.push(parseRegFontName(m[1]));
      }
    } catch { /* ignore */ }
  }
  return uniqueSorted(names);
}

function listMacFonts() {
  try {
    const js = [
      'ObjC.import("AppKit");',
      'const fam = $.NSFontManager.sharedFontManager.availableFontFamilies;',
      'const n = fam.count;',
      'const out = [];',
      'for (let i = 0; i < n; i++) out.push(ObjC.unwrap(fam.objectAtIndex(i)));',
      'out.join("\\n");',
    ].join('\n');
    const text = run('osascript', ['-l', 'JavaScript', '-e', js], { timeout: 15000 });
    const names = uniqueSorted(text.split(/\r?\n/));
    if (names.length) return names;
  } catch { /* fc-list fallback */ }
  return listFontconfig();
}

function listFontconfig() {
  try {
    const text = run('fc-list', ['--format', '%{family[0]}\n'], { timeout: 8000 });
    return uniqueSorted(text.split(/\r?\n/));
  } catch {
    return [];
  }
}

function fallback() {
  return FALLBACK[process.platform] || FALLBACK.linux;
}

function listInstalledFonts() {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_MS) return cache;
  let names = [];
  try {
    if (process.platform === 'win32') names = listWindowsFonts();
    else if (process.platform === 'darwin') names = listMacFonts();
    else names = listFontconfig();
  } catch {
    names = [];
  }
  if (!names.length) names = fallback();
  cache = names;
  cacheAt = now;
  return names;
}

function defaultTerminalFont(fonts) {
  const list = fonts || listInstalledFonts();
  const prefer = PREFER[process.platform] || PREFER.linux;
  const lower = new Map(list.map((n) => [n.toLowerCase(), n]));
  for (const p of prefer) {
    const hit = lower.get(p.toLowerCase());
    if (hit) return hit;
  }
  return list[0] || 'monospace';
}

function sanitizeFontName(name, fallbackName = '') {
  const n = String(name == null ? '' : name).replace(/[\r\n"'\\;]/g, '').trim().slice(0, 80);
  return n || fallbackName || '';
}

function clampFontSize(n, fallback = 13) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return fallback;
  return Math.max(8, Math.min(32, x));
}

function cssFontStack(name) {
  const n = sanitizeFontName(name);
  const quoted = !n ? '' : (/\s/.test(n) || /[^\w-]/.test(n) ? `"${n}"` : n);
  const rest = '"Cascadia Mono", Consolas, D2Coding, "Noto Sans Mono CJK KR", monospace';
  return quoted ? `${quoted}, ${rest}` : rest;
}

module.exports = {
  listInstalledFonts,
  defaultTerminalFont,
  sanitizeFontName,
  clampFontSize,
  cssFontStack,
};
