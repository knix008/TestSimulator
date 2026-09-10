// Programming languages the analyzer understands.
//
// "Language" here means a *programming* language (C#, Python, Java…), not UI
// localization — the same distinction the Windows build draws.

/** @typedef {{id:string, displayName:string, extensions:string[], family:string, precision:string}} Language */

/**
 * `family` selects the structural scanner (how a function body is delimited):
 *   brace   — body is `{ … }`            (C#, Java, C/C++, JS/TS, Go, Rust, Swift, Kotlin, PHP)
 *   indent  — body is an indented block  (Python)
 *   keyword — body ends at a keyword     (Ruby `end`, VB.NET `End Sub`)
 */
export const LANGUAGES = [
  { id: 'csharp', displayName: 'C#', extensions: ['.cs'], family: 'brace', precision: 'syntax' },
  { id: 'vbnet', displayName: 'VB.NET', extensions: ['.vb'], family: 'keyword', precision: 'approximate' },
  { id: 'python', displayName: 'Python', extensions: ['.py'], family: 'indent', precision: 'syntax' },
  { id: 'java', displayName: 'Java', extensions: ['.java'], family: 'brace', precision: 'syntax' },
  {
    id: 'cpp',
    displayName: 'C/C++',
    extensions: ['.c', '.h', '.cpp', '.hpp', '.cc', '.cxx', '.hxx', '.hh'],
    family: 'brace',
    precision: 'syntax',
  },
  { id: 'go', displayName: 'Go', extensions: ['.go'], family: 'brace', precision: 'syntax' },
  { id: 'rust', displayName: 'Rust', extensions: ['.rs'], family: 'brace', precision: 'syntax' },
  { id: 'swift', displayName: 'Swift', extensions: ['.swift'], family: 'brace', precision: 'syntax' },
  {
    id: 'javascript',
    displayName: 'JavaScript/TypeScript',
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'],
    family: 'brace',
    precision: 'syntax',
  },
  { id: 'ruby', displayName: 'Ruby', extensions: ['.rb'], family: 'keyword', precision: 'syntax' },
  { id: 'kotlin', displayName: 'Kotlin', extensions: ['.kt', '.kts'], family: 'brace', precision: 'approximate' },
  { id: 'php', displayName: 'PHP', extensions: ['.php'], family: 'brace', precision: 'syntax' },
];

const BY_ID = new Map(LANGUAGES.map((l) => [l.id, l]));

const BY_EXT = new Map();
for (const lang of LANGUAGES) {
  for (const ext of lang.extensions) BY_EXT.set(ext, lang);
}

/** Bracket-prefix used in every display name, e.g. `[Python] app.py::main`. */
export function displayPrefix(languageId) {
  const lang = BY_ID.get(languageId);
  return lang ? '[' + lang.displayName.split('/')[0] + ']' : '[?]';
}

export function getLanguage(id) {
  return BY_ID.get(id) || null;
}

export function languageForExtension(ext) {
  return BY_EXT.get(String(ext || '').toLowerCase()) || null;
}

export function languageForPath(filePath) {
  return languageForExtension(extensionOf(filePath));
}

export function extensionOf(filePath) {
  const name = String(filePath || '');
  const slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
  const base = slash >= 0 ? name.slice(slash + 1) : name;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
}

export function baseName(filePath) {
  const name = String(filePath || '');
  const slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
  return slash >= 0 ? name.slice(slash + 1) : name;
}

export function dirName(filePath) {
  const name = String(filePath || '');
  const slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
  return slash > 0 ? name.slice(0, slash) : '';
}

/** Extensions for the given language ids; empty list ⇒ every known extension. */
export function extensionsFor(languageIds) {
  const ids = new Set(languageIds && languageIds.length ? languageIds : LANGUAGES.map((l) => l.id));
  const out = new Set();
  for (const lang of LANGUAGES) {
    if (!ids.has(lang.id)) continue;
    for (const ext of lang.extensions) out.add(ext);
  }
  return [...out];
}

export function allExtensions() {
  return [...BY_EXT.keys()];
}

/**
 * Normalizes a language id for rule lookups that share a dialect:
 * TypeScript rules live under `javascript`, Kotlin's security rules under `java`.
 */
export function normalizeRuleLanguage(languageId) {
  switch (String(languageId || '').toLowerCase()) {
    case 'vb':
      return 'vbnet';
    case 'ts':
    case 'typescript':
      return 'javascript';
    case 'kt':
    case 'kotlin':
      return 'java';
    default:
      return String(languageId || '').toLowerCase();
  }
}

/**
 * Language ids present in a map of `{'.cs': 12, '.py': 3}` extension counts.
 * Used after a directory scan, which counts extensions without ever building a
 * list of every path.
 */
export function detectLanguagesFromExtensions(extensionCounts) {
  const counts = new Map();
  for (const [ext, count] of Object.entries(extensionCounts || {})) {
    const lang = languageForExtension(ext);
    if (!lang) continue;
    counts.set(lang.id, (counts.get(lang.id) || 0) + count);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ id, count }));
}

/** Language ids that actually occur among the given file paths. */
export function detectLanguages(filePaths) {
  const counts = new Map();
  for (const p of filePaths) {
    const lang = languageForPath(p);
    if (!lang) continue;
    counts.set(lang.id, (counts.get(lang.id) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ id, count }));
}
