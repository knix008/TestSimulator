// File-type icons for the Windows file associations the installer can
// register (build/installer.nsh): one .ico per language — a document sheet
// with the language's badge (the colours and labels of LangIcon in
// src/components/Icons.jsx) — plus the list of extensions the installer
// reads (build/file-types.nsh). Output: build/fileicons/<key>.ico
//
//   node scripts/generate-file-icons.mjs
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { encodeIco } from './ico.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'build', 'fileicons');
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const DARK = '#1b1e24';

// key → { name (shown by Explorer), exts, label, bg, fg }
export const FILE_TYPES = [
  { key: 'javascript', name: 'JavaScript', exts: ['js', 'mjs', 'cjs'], label: 'JS', bg: '#f7df1e', fg: DARK },
  { key: 'typescript', name: 'TypeScript', exts: ['ts', 'mts', 'cts'], label: 'TS', bg: '#3178c6' },
  { key: 'jsx', name: 'JSX', exts: ['jsx'], label: 'JSX', bg: '#61dafb', fg: DARK },
  { key: 'tsx', name: 'TSX', exts: ['tsx'], label: 'TSX', bg: '#3178c6' },
  { key: 'json', name: 'JSON', exts: ['json', 'jsonc', 'json5'], label: '{ }', bg: '#cbcb41', fg: DARK },
  { key: 'html', name: 'HTML', exts: ['html', 'htm', 'xhtml'], label: '<>', bg: '#e34c26' },
  { key: 'css', name: 'CSS', exts: ['css'], label: 'CSS', bg: '#264de4' },
  { key: 'scss', name: 'SCSS / Sass', exts: ['scss', 'sass'], label: 'SCSS', bg: '#c6538c' },
  { key: 'less', name: 'LESS', exts: ['less'], label: 'LESS', bg: '#1d365d' },
  { key: 'markdown', name: 'Markdown', exts: ['md', 'markdown'], label: 'M↓', bg: '#519aba' },
  { key: 'xml', name: 'XML', exts: ['xml', 'svg', 'xsl', 'plist', 'csproj'], label: 'XML', bg: '#0060ac' },
  { key: 'yaml', name: 'YAML', exts: ['yml', 'yaml'], label: 'YML', bg: '#cb171e' },
  { key: 'toml', name: 'TOML', exts: ['toml'], label: 'TOML', bg: '#9c4221' },
  { key: 'python', name: 'Python', exts: ['py', 'pyw'], label: 'Py', bg: '#3572a5' },
  { key: 'c', name: 'C', exts: ['c', 'h'], label: 'C', bg: '#555555' },
  { key: 'cpp', name: 'C++', exts: ['cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx'], label: 'C++', bg: '#f34b7d' },
  { key: 'csharp', name: 'C#', exts: ['cs'], label: 'C#', bg: '#178600' },
  { key: 'java', name: 'Java', exts: ['java'], label: 'Java', bg: '#b07219' },
  { key: 'kotlin', name: 'Kotlin', exts: ['kt', 'kts'], label: 'Kt', bg: '#a97bff' },
  { key: 'go', name: 'Go', exts: ['go'], label: 'Go', bg: '#00add8' },
  { key: 'rust', name: 'Rust', exts: ['rs'], label: 'Rs', bg: '#dea584', fg: DARK },
  { key: 'php', name: 'PHP', exts: ['php'], label: 'PHP', bg: '#4f5d95' },
  { key: 'ruby', name: 'Ruby', exts: ['rb'], label: 'Rb', bg: '#701516' },
  { key: 'swift', name: 'Swift', exts: ['swift'], label: 'Sw', bg: '#f05138' },
  { key: 'dart', name: 'Dart', exts: ['dart'], label: 'Dart', bg: '#00b4ab' },
  { key: 'lua', name: 'Lua', exts: ['lua'], label: 'Lua', bg: '#000080' },
  { key: 'shell', name: 'Shell script', exts: ['sh', 'bash', 'zsh'], label: '$_', bg: '#89e051', fg: DARK },
  { key: 'batch', name: 'Batch file', exts: ['bat', 'cmd'], label: '$_', bg: '#c1f0dc', fg: DARK },
  { key: 'powershell', name: 'PowerShell', exts: ['ps1', 'psm1'], label: 'PS', bg: '#012456' },
  { key: 'sql', name: 'SQL', exts: ['sql'], label: 'SQL', bg: '#e38c00' },
  { key: 'dockerfile', name: 'Dockerfile', exts: ['dockerfile'], label: 'Dock', bg: '#384d54' },
  { key: 'ini', name: 'Settings', exts: ['ini', 'cfg', 'conf', 'env', 'properties', 'editorconfig'], label: '.ini', bg: '#6b7280' },
  { key: 'text', name: 'Text', exts: ['txt', 'log', 'text', 'csv', 'tsv'], label: 'Aa', bg: '#6b7280' },
  { key: 'latex', name: 'LaTeX', exts: ['tex'], label: 'TeX', bg: '#3d6117' },
  { key: 'diff', name: 'Diff / patch', exts: ['diff', 'patch'], label: '±', bg: '#41535b' },
];

// The icon: a sheet with a folded corner, the badge across its lower part.
function iconSvg({ label, bg, fg = '#ffffff' }) {
  const n = label.length;
  const fs_ = n <= 1 ? 88 : n === 2 ? 80 : n === 3 ? 62 : 50;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs><linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e9edf3"/></linearGradient></defs>
  <path d="M56 12h96l60 60v160a12 12 0 0 1-12 12H56a12 12 0 0 1-12-12V24a12 12 0 0 1 12-12z" fill="url(#p)" stroke="#9aa4b1" stroke-width="6" stroke-linejoin="round"/>
  <path d="M152 12v48a12 12 0 0 0 12 12h48" fill="#d5dbe3" stroke="#9aa4b1" stroke-width="6" stroke-linejoin="round"/>
  <path d="M76 104h60M76 128h84M76 152h72" stroke="#c2c9d3" stroke-width="10" stroke-linecap="round"/>
  <rect x="24" y="140" width="208" height="84" rx="14" fill="${bg}" stroke="rgba(0,0,0,0.25)" stroke-width="4"/>
  <text x="128" y="${182 + fs_ * 0.35}" text-anchor="middle" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-weight="800" font-size="${fs_}" fill="${fg}">${label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>
</svg>`;
}

async function main() {
  const sharp = (await import('sharp')).default;
  fs.mkdirSync(outDir, { recursive: true });
  const nsh = ['; Generated by scripts/generate-file-icons.mjs — the file types the installer can associate with My Editor.', '; !insertmacro MED_FILE_TYPE key "Display name" "ext1 ext2 …"', ''];
  const nshUn = ['; Generated by scripts/generate-file-icons.mjs — the same list for the uninstaller.', ''];
  for (const ft of FILE_TYPES) {
    const svg = Buffer.from(iconSvg(ft));
    const entries = [];
    for (const size of ICO_SIZES) entries.push({ size, png: new Uint8Array(await sharp(svg, { density: 384 }).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()) });
    fs.writeFileSync(path.join(outDir, `${ft.key}.ico`), Buffer.from(encodeIco(entries)));
    nsh.push(`!insertmacro MED_FILE_TYPE "${ft.key}" "${ft.name}" "${ft.exts.join(' ')}"`);
    nshUn.push(`!insertmacro MED_FILE_TYPE_UN "${ft.key}" "${ft.name}" "${ft.exts.join(' ')}"`);
  }
  fs.writeFileSync(path.join(outDir, 'file-types.nsh'), `${nsh.join('\r\n')}\r\n`);
  fs.writeFileSync(path.join(outDir, 'file-types-un.nsh'), `${nshUn.join('\r\n')}\r\n`);
  console.log(`[file-icons] Wrote ${FILE_TYPES.length} icons → build/fileicons/ and file-types.nsh`);
}

main().catch((err) => { console.error('[file-icons] Failed:', err); process.exit(1); });
