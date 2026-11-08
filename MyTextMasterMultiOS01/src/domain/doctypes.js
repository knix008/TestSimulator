// What kind of document a file is (it decides the highlighting, the preview and the tools),
// the file name helpers, and how text comes in and goes out (line endings, BOM).

/** markdown | html | text — each with its extensions, icon and the language CodeMirror uses. */
export const KINDS = {
  markdown: { ext: ['md', 'markdown', 'mdown', 'mkd', 'mdx'], icon: 'mdFile', preview: true },
  html: { ext: ['html', 'htm', 'xhtml', 'shtml'], icon: 'htmlFile', preview: true },
  text: { ext: ['txt', 'text', 'log', 'ini', 'cfg', 'conf', 'csv', 'tsv', 'json', 'xml', 'yml', 'yaml', 'css', 'scss', 'less', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'py', 'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'cs', 'rs', 'go', 'rb', 'php', 'swift', 'lua', 'pl', 'r', 'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1', 'sql', 'toml', 'properties', 'env', 'gitignore', 'dockerfile', 'makefile', 'diff', 'patch', 'tex', 'rst', 'adoc', 'srt', 'vtt', 'svg'], icon: 'txtFile', preview: false },
  // Viewers (ui/viewers.js) and the hex editor (ui/hexeditor.js): shown in the main window, not as text.
  image: { ext: ['png', 'jpg', 'jpeg', 'jfif', 'gif', 'webp', 'bmp', 'ico', 'avif', 'apng'], icon: 'imageFile', preview: false, viewer: true },
  video: { ext: ['mp4', 'm4v', 'webm', 'mkv', 'mov', 'ogv', 'avi', 'mpg', 'mpeg', '3gp', 'wmv'], icon: 'videoFile', preview: false, viewer: true },
  audio: { ext: ['mp3', 'wav', 'flac', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'weba', 'wma', 'aif', 'aiff', 'mid', 'midi'], icon: 'audioFile', preview: false, viewer: true },
  pdf: { ext: ['pdf'], icon: 'pdfFile', preview: false, viewer: true },
  hex: { ext: ['bin', 'exe', 'dll', 'so', 'dylib', 'o', 'obj', 'class', 'zip', '7z', 'rar', 'gz', 'tar', 'iso', 'img', 'dat', 'db', 'sqlite', 'woff', 'woff2', 'ttf', 'otf'], icon: 'hexFile', preview: false, viewer: false },
};

/** Kinds edited as text in the editor. */
export const isTextKind = (kind) => kind === 'markdown' || kind === 'html' || kind === 'text';
/** Kinds shown by a viewer (image, video, audio, PDF). */
export const isViewerKind = (kind) => Boolean(KINDS[kind]?.viewer);

export function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

/** The extensions the Open dialog offers, grouped like its filter list. */
export const OPEN_FILTERS = [
  { id: 'all', ext: [...KINDS.markdown.ext, ...KINDS.html.ext, ...KINDS.text.ext] },
  { id: 'markdown', ext: KINDS.markdown.ext },
  { id: 'html', ext: KINDS.html.ext },
  { id: 'text', ext: KINDS.text.ext },
];

export const extOf = (name) => {
  const base = baseName(name);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
};

export function baseName(path) {
  const text = String(path ?? '');
  const parts = text.split(/[\\/]/);
  return parts[parts.length - 1] || text;
}

export function dirName(path) {
  const text = String(path ?? '');
  const index = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
  return index > 0 ? text.slice(0, index) : '';
}

/** The kind of a file from its name; unknown extensions are plain text. */
export function kindOf(name) {
  const ext = extOf(name) || baseName(name).toLowerCase();
  for (const [kind, def] of Object.entries(KINDS)) if (def.ext.includes(ext)) return kind;
  return 'text';
}

export const defaultExt = (kind) => ({ markdown: 'md', html: 'html', text: 'txt' })[kind] ?? 'txt';

/** "Untitled-3.md" — the first number no open document uses. */
export function untitledName(kind, taken, word = 'Untitled') {
  const names = new Set(taken);
  for (let n = 1; ; n += 1) {
    const name = `${word}-${n}.${defaultExt(kind)}`;
    if (!names.has(name)) return name;
  }
}

/** The name with its extension changed to fit the kind (Save as with another kind). */
export function withExt(name, kind) {
  if (kindOf(name) === kind && extOf(name)) return name;
  const base = baseName(name);
  const dot = base.lastIndexOf('.');
  return `${dot > 0 ? base.slice(0, dot) : base}.${defaultExt(kind)}`;
}

/** The line ending a text uses most: 'crlf' or 'lf' (lf when it has no line breaks). */
export function detectEol(text) {
  const crlf = (String(text).match(/\r\n/g) ?? []).length;
  const lf = (String(text).match(/\n/g) ?? []).length - crlf;
  return crlf > lf ? 'crlf' : 'lf';
}

/** Text as read from a file: BOM removed, line endings as the editor wants them (\n). */
export function decodeText(raw) {
  const text = String(raw ?? '');
  const bom = text.charCodeAt(0) === 0xfeff;
  const body = bom ? text.slice(1) : text;
  return { text: body.replace(/\r\n?/g, '\n'), eol: detectEol(body), bom };
}

/** Text as written to a file, in the document's line ending (and with its BOM, if it had one). */
export function encodeText(text, { eol = 'lf', bom = false } = {}) {
  const body = String(text ?? '').replace(/\r\n?/g, '\n');
  return (bom ? '﻿' : '') + (eol === 'crlf' ? body.replace(/\n/g, '\r\n') : body);
}
