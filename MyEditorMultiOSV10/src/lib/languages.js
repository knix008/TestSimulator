// Language modes: the 150+ descriptions of @codemirror/language-data (each
// loaded lazily on first use → Vite code-splits every grammar into its own
// chunk), plus "Plain text".
import { languages } from '@codemirror/language-data';
import { LanguageDescription } from '@codemirror/language';

export const PLAIN = 'plain';

// The most common ones first in menus; the rest alphabetically.
const FEATURED = ['JavaScript', 'TypeScript', 'JSX', 'TSX', 'HTML', 'CSS', 'JSON', 'Markdown', 'Python', 'C', 'C++', 'C#', 'Java', 'Go', 'Rust', 'PHP', 'Ruby', 'Shell', 'PowerShell', 'SQL', 'XML', 'YAML', 'TOML', 'Dockerfile', 'diff'];

const byName = new Map(languages.map((d) => [d.name, d]));
const collator = new Intl.Collator('en', { sensitivity: 'base' });

export const FEATURED_LANGUAGES = FEATURED.map((n) => byName.get(n)).filter(Boolean);
export const OTHER_LANGUAGES = languages.filter((d) => !FEATURED.includes(d.name)).sort((a, b) => collator.compare(a.name, b.name));
export const ALL_LANGUAGES = [...FEATURED_LANGUAGES, ...OTHER_LANGUAGES];

// Extra file names / extensions the bundled list does not know about.
const EXTRA = {
  txt: PLAIN, log: PLAIN, text: PLAIN, csv: PLAIN, tsv: PLAIN,
  ini: 'Properties files', cfg: 'Properties files', conf: 'Properties files', env: 'Shell', bat: 'Shell', cmd: 'Shell',
  gitignore: 'Shell', npmrc: 'Properties files', editorconfig: 'Properties files',
  mjs: 'JavaScript', cjs: 'JavaScript', mts: 'TypeScript', cts: 'TypeScript', htm: 'HTML', xhtml: 'HTML', svg: 'XML', plist: 'XML', csproj: 'XML',
  jsonc: 'JSON', json5: 'JSON', webmanifest: 'JSON', yml: 'YAML', ps1: 'PowerShell', psm1: 'PowerShell', md: 'Markdown', markdown: 'Markdown',
  h: 'C', hpp: 'C++', cs: 'C#', kt: 'Kotlin', kts: 'Kotlin', gradle: 'Groovy', rs: 'Rust', go: 'Go', rb: 'Ruby', py: 'Python', pyw: 'Python',
  makefile: 'Shell', sh: 'Shell', bash: 'Shell', zsh: 'Shell', tex: 'LaTeX', nsh: 'NSIS', nsi: 'NSIS',
};

export function languageByName(name) {
  if (!name || name === PLAIN) return null;
  return byName.get(name) || LanguageDescription.matchLanguageName(languages, name, true) || null;
}

// The language for a file name — a LanguageDescription, or null for plain text.
export function detectLanguage(fileName) {
  if (!fileName) return null;
  const base = fileName.replace(/^.*[\\/]/, '');
  const lower = base.toLowerCase();
  if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) return byName.get('Dockerfile');
  if (lower === 'makefile' || lower === 'cmakelists.txt') return byName.get(lower === 'makefile' ? 'Shell' : 'CMake');
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : lower;
  if (EXTRA[ext] !== undefined) return EXTRA[ext] === PLAIN ? null : byName.get(EXTRA[ext]) || null;
  return LanguageDescription.matchFilename(languages, base) || null;
}

const loaded = new Map();   // name → Promise<LanguageSupport>

export function loadLanguage(desc) {
  if (!desc) return Promise.resolve(null);
  if (!loaded.has(desc.name)) loaded.set(desc.name, desc.load());
  return loaded.get(desc.name);
}
