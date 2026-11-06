// The facts about formats and sizes the interface needs, kept free of React so they can be tested.

export const LEVELS = [0, 1, 3, 5, 7, 9];

// Everything a format can do when creating. `ext` is what the output file gets.
export const FORMATS = {
  zip: { ext: 'zip', methods: ['deflate', 'store', 'bzip2', 'lzma', 'xz', 'zstd'], password: true, cipher: true, split: true, comment: true, sfx: true, levels: true },
  '7z': { ext: '7z', methods: ['lzma2', 'lzma', 'bzip2', 'deflate', 'ppmd', 'copy'], password: true, encryptNames: true, solid: true, split: true, levels: true },
  rar: { ext: 'rar', methods: [], password: true, encryptNames: true, solid: true, split: true, comment: true, recovery: true, versions: ['rar5', 'rar4'], levels: true },
  tar: { ext: 'tar', methods: [], split: true },
  'tar.gz': { ext: 'tar.gz', methods: [], split: true, levels: true },
  'tar.bz2': { ext: 'tar.bz2', methods: [], split: true, levels: true },
  'tar.xz': { ext: 'tar.xz', methods: [], split: true, levels: true },
  'tar.zst': { ext: 'tar.zst', methods: [], split: true, levels: true },
  gz: { ext: 'gz', methods: [], split: true, single: true, levels: true },
  bz2: { ext: 'bz2', methods: [], split: true, single: true, levels: true },
  xz: { ext: 'xz', methods: [], split: true, single: true, levels: true },
  zst: { ext: 'zst', methods: [], split: true, single: true, levels: true },
};

export const FORMAT_NAMES = Object.keys(FORMATS);

// What opens: the writable ones plus the read-only ones, and the names they go by.
export const OPENABLE_EXTENSIONS = [
  'zip', 'zipx', 'jar', 'apk', 'war', 'ear', 'xpi', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'epub',
  '7z', 'rar', 'tar', 'tgz', 'tbz', 'tbz2', 'txz', 'tzst', 'gz', 'gzip', 'bz2', 'bzip2', 'xz', 'zst', 'zstd',
  'cab', 'iso', '001', 'exe',
];

// `.exe` and `.docx` only count as archives when asked to open them, not when guessing.
const LIKELY_ARCHIVE = new Set(OPENABLE_EXTENSIONS.filter((e) => !['exe', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'epub', 'apk', 'xpi'].includes(e)));

export function looksLikeArchive(name) {
  const lower = String(name).toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return false;
  const ext = lower.slice(dot + 1);
  if (LIKELY_ARCHIVE.has(ext)) return true;
  return /^z\d\d$/.test(ext) || /^r\d\d$/.test(ext) || /^\d{3}$/.test(ext);
}

const UNIT = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4 };

// Split sizes offered. Sizes are in bytes, and media carry their real capacity.
export const SPLIT_PRESETS = [
  { id: 'none', bytes: null },
  { id: '1.44mb', bytes: 1457664, label: '1.44 MB (3.5" floppy)' },
  { id: '10mb', bytes: 10 * UNIT.mb, label: '10 MB' },
  { id: '25mb', bytes: 25 * UNIT.mb, label: '25 MB (e-mail)' },
  { id: '100mb', bytes: 100 * UNIT.mb, label: '100 MB' },
  { id: '650mb', bytes: 650 * UNIT.mb, label: '650 MB (CD)' },
  { id: '700mb', bytes: 700 * UNIT.mb, label: '700 MB (CD)' },
  { id: '1gb', bytes: UNIT.gb, label: '1 GB' },
  { id: '2gb', bytes: 2 * UNIT.gb, label: '2 GB' },
  { id: '4092mb', bytes: 4092 * UNIT.mb, label: '4092 MB (FAT32)' },
  { id: 'dvd', bytes: 4700372992, label: '4.7 GB (DVD)' },
  { id: 'dvd-dl', bytes: 8543666176, label: '8.5 GB (DVD DL)' },
  { id: 'bd', bytes: 25025314816, label: '25 GB (Blu-ray)' },
  { id: 'custom', bytes: null },
];

export const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'];

// "100", "1.5 GB", "700m", "4,092 MB": bytes, or null when it is not a size. A plain number is
// taken in `defaultUnit`.
export function parseSize(text, defaultUnit = 'MB') {
  const m = String(text ?? '').trim().replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*([kmgt]?)(i?b?)$/i);
  if (!m) return null;
  const letter = m[2].toLowerCase();
  let unit;
  if (letter) unit = UNIT[`${letter}b`];
  else if (m[3]) unit = 1;
  else unit = UNIT[String(defaultUnit).toLowerCase()] ?? 1;
  const bytes = Math.floor(Number(m[1]) * unit);
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : null;
}

export function formatSize(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let v = bytes;
  let i = -1;
  do {
    v /= 1024;
    i += 1;
  } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0)} ${units[i]}`;
}

export function formatDate(unixSeconds) {
  if (unixSeconds == null) return '';
  const d = new Date(unixSeconds * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Space saved as a percentage. Empty when it means nothing.
export function ratioText(size, packed) {
  if (!size || packed == null) return '';
  return `${Math.round((packed / size) * 100)}%`;
}

export function fileExtension(name) {
  const lower = String(name).toLowerCase();
  for (const ext of ['tar.gz', 'tar.bz2', 'tar.xz', 'tar.zst']) {
    if (lower.endsWith(`.${ext}`)) return ext;
  }
  const dot = lower.lastIndexOf('.');
  return dot > 0 ? lower.slice(dot + 1) : '';
}

// `report.zip` -> `report`; `a.tar.gz` -> `a`; `set.7z.003` -> `set`; `x.part02.rar` -> `x`.
export function archiveStem(name) {
  let s = String(name);
  s = s.replace(/\.\d{3}$/, '');
  s = s.replace(/\.part\d+\.rar$/i, '');
  s = s.replace(/\.(tar\.(gz|bz2|xz|zst)|tgz|tbz2?|txz|tzst)$/i, '');
  s = s.replace(/\.(zip|zipx|7z|rar|tar|gz|bz2|xz|zst|cab|iso|exe|z\d\d|r\d\d|jar)$/i, '');
  return s || String(name);
}

// A file name with its extension replaced by the format's, keeping any folder in front.
export function withFormatExt(path, format, sfx = false, windows = true) {
  const spec = FORMATS[format];
  if (!spec) return path;
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1;
  const dir = path.slice(0, cut);
  const base = archiveStem(path.slice(cut));
  if (sfx) return `${dir}${base}${windows ? '.exe' : ''}`;
  return `${dir}${base}.${spec.ext}`;
}

// The name a set of sources suggests for its archive.
export function suggestName(names) {
  if (!names.length) return 'archive';
  if (names.length === 1) {
    const n = names[0];
    const dot = n.lastIndexOf('.');
    return dot > 0 ? n.slice(0, dot) : n;
  }
  return 'archive';
}

// The checks the create dialog runs before it enables OK. Returns the i18n key of the problem, or null.
export function validateCreate(form) {
  const spec = FORMATS[form.format];
  if (!spec) return 'create.errFormat';
  if (!form.sources?.length && !form.convert) return 'create.errNoSources';
  if (!form.output?.trim()) return 'create.errNoOutput';
  if (spec.single && !form.convert && (form.sources.length !== 1 || form.sources[0].isDir)) return 'create.errSingle';
  if (form.password && form.password !== form.confirm) return 'create.errPasswordMatch';
  if (form.split === 'custom') {
    const size = parseSize(form.splitText, form.splitUnit);
    if (!size) return 'create.errSplitSize';
    if (form.format === 'zip' && form.zipStyle !== 'numbered' && size < 65536) return 'create.errZipSplitMin';
    if (size < 1024) return 'create.errSplitMin';
  }
  if (form.sfx && form.split !== 'none') return 'create.errSfxSplit';
  return null;
}

// Bytes per part for a form, or null.
export function splitBytes(form) {
  if (form.split === 'none' || !form.split) return null;
  if (form.split === 'custom') return parseSize(form.splitText, form.splitUnit);
  return SPLIT_PRESETS.find((p) => p.id === form.split)?.bytes ?? null;
}

// Why the sources must not be removed after compressing: the i18n key, or null when they may be.
// Excluded files live in those folders and are in no archive; an archive inside a source would go too.
export function deleteSourcesProblem(form) {
  if (String(form.exclude ?? '').trim()) return 'create.deleteNoExclude';
  const clean = (p) => String(p ?? '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const output = clean(form.output);
  for (const source of form.sources ?? []) {
    const path = clean(source.path);
    if (path && (output === path || output.startsWith(`${path}/`))) return 'create.deleteInside';
  }
  return null;
}

// What the engine is asked to do, from what the dialog holds.
export function createOptions(form) {
  const spec = FORMATS[form.format];
  const o = {
    output: form.output.trim(),
    format: form.format,
    level: spec.levels ? Number(form.level) : 6,
    sources: (form.sources ?? []).map((s) => ({ path: s.path, name: s.name ?? null })),
    exclude: String(form.exclude ?? '').split(/[;\n]/).map((s) => s.trim()).filter(Boolean),
    overwrite: !!form.overwrite,
  };
  if (spec.methods.length) o.method = form.method || spec.methods[0];
  const volume = splitBytes(form);
  if (volume && spec.split) {
    o.volumeSize = volume;
    if (form.format === 'zip') o.zipSplitStyle = form.zipStyle || 'span';
  }
  if (spec.password && form.password) {
    o.password = form.password;
    if (spec.cipher) o.encryption = form.cipher || 'aes256';
    if (spec.encryptNames) o.encryptNames = !!form.encryptNames;
  }
  if (spec.solid) o.solid = !!form.solid;
  if (spec.comment && form.comment) o.comment = form.comment;
  if (spec.recovery && Number(form.recovery) > 0) o.recoveryPercent = Number(form.recovery);
  if (spec.versions) o.rarVersion = form.rarVersion || 'rar5';
  if (form.format === 'zip') o.smartStore = form.smartStore !== false;
  if (form.rootFolder?.trim()) o.rootFolder = form.rootFolder.trim();
  if (spec.sfx && form.sfx) o.sfx = true;
  if (form.format === 'rar' && form.useRarTool) o.useRarTool = true;
  return o;
}

// The i18n key for an engine failure.
export function errorKey(code, detail) {
  if (code === 'invalid' && detail === 'single_file_only') return 'error.single_file_only';
  if (code === 'invalid' && detail === 'rar4_volume_names') return 'error.rar4_volume_names';
  if (code === 'unsupported' && detail === 'volumes_read_only') return 'error.volumes_read_only';
  if (code === 'unsupported' && detail === 'format_read_only') return 'error.format_read_only';
  return `error.${code}`;
}

// The 3D document icon for a file name: the same ones the operating system shows after installing.
const ICON_OF_EXT = {
  zip: 'zip', zipx: 'zip', jar: 'zip', '7z': '7z', rar: 'rar', tar: 'tar', gz: 'gz', tgz: 'gz', bz2: 'bz2', tbz: 'bz2', tbz2: 'bz2',
  xz: 'xz', txz: 'xz', zst: 'zst', tzst: 'zst', cab: 'cab', iso: 'iso',
};

export function fileIconFor(name) {
  const lower = String(name).toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = lower.slice(dot + 1);
  if (/^\d{3}$/.test(ext)) return 'part';
  if (/^z\d\d$/.test(ext)) return 'zip';
  if (/^r\d\d$/.test(ext)) return 'rar';
  return ICON_OF_EXT[ext] ?? null;
}
