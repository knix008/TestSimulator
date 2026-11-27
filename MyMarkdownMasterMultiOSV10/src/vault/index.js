// The page's read-only view of the vault index. The Rust core (crates/mdcore: note parsing, link
// resolution, backlinks, tags) builds the index and sends a snapshot after changes; panels, the graph and
// the editor's completion read it synchronously from here. Nothing here parses notes.

export const NOTE_EXTS = ['md', 'markdown'];
export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'];
export const AUDIO_EXTS = ['mp3', 'wav', 'm4a', 'ogg', 'flac', '3gp'];
export const VIDEO_EXTS = ['mp4', 'webm', 'ogv', 'mov', 'mkv'];

export const extOf = (path) => { const name = String(path ?? '').split('/').pop(); const i = name.lastIndexOf('.'); return i > 0 ? name.slice(i + 1).toLowerCase() : ''; };
export const nameOf = (path) => { const name = String(path ?? '').split('/').pop(); const i = name.lastIndexOf('.'); return i > 0 ? name.slice(0, i) : name; };
export const fileNameOf = (path) => String(path ?? '').split('/').pop();
export const folderOf = (path) => { const s = String(path ?? ''); const i = s.lastIndexOf('/'); return i < 0 ? '' : s.slice(0, i); };
export const isNote = (path) => NOTE_EXTS.includes(extOf(path));
export function kindOf(path) {
  const ext = extOf(path);
  if (NOTE_EXTS.includes(ext)) return 'note';
  if (ext === 'canvas') return 'canvas';
  if (ext === 'base') return 'base';
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (AUDIO_EXTS.includes(ext)) return 'audio';
  if (VIDEO_EXTS.includes(ext)) return 'video';
  if (ext === 'pdf') return 'pdf';
  return 'other';
}
export function normalizePath(path) {
  const out = [];
  for (const part of String(path ?? '').replace(/\\/g, '/').split('/')) { if (!part || part === '.') continue; if (part === '..') out.pop(); else out.push(part); }
  return out.join('/');
}

export class VaultIndex {
  constructor() {
    this.files = new Map();
    this.folders = new Set();
    this.notes = new Map();
    this.version = 0;
    this._derived = null;
  }

  /** The core's snapshot: { version, files: [{ path, kind, size, mtime, ctime }], folders, notes: { path: meta } }. */
  load(snapshot) {
    this.files = new Map((snapshot?.files ?? []).map((f) => [f.path, f]));
    this.folders = new Set(snapshot?.folders ?? []);
    this.notes = new Map(Object.entries(snapshot?.notes ?? {}));
    this.version = (this.version || 0) + 1;
    this.coreVersion = snapshot?.version ?? 0;
    this._derived = null;
  }

  has(path) { return this.files.has(normalizePath(path)) || this.folders.has(normalizePath(path)); }
  notePaths() { return [...this.files.keys()].filter(isNote).sort((a, b) => a.localeCompare(b)); }
  allPaths() { return [...this.files.keys()].sort((a, b) => a.localeCompare(b)); }
  meta(path) { return this.notes.get(normalizePath(path)) ?? null; }
  file(path) { return this.files.get(normalizePath(path)) ?? null; }

  derived() {
    if (this._derived) return this._derived;
    const incoming = new Map();
    const unresolved = new Map();
    const tags = new Map();
    for (const [path, note] of this.notes) {
      for (const link of note.links ?? []) {
        const entry = { ...link, from: path };
        if (link.resolved) { if (!incoming.has(link.resolved)) incoming.set(link.resolved, []); incoming.get(link.resolved).push(entry); }
        else if (link.target) { if (!unresolved.has(link.target)) unresolved.set(link.target, []); unresolved.get(link.target).push(entry); }
      }
      for (const tag of note.tags ?? []) {
        const key = tag.toLowerCase();
        if (!tags.has(key)) tags.set(key, { tag, count: 0, files: new Set() });
        const rec = tags.get(key);
        rec.count += 1;
        rec.files.add(path);
      }
    }
    this._derived = { incoming, unresolved, tags };
    return this._derived;
  }

  /** Links from a note, each with `resolved` (vault path or null) filled by the core. */
  outgoing(path) { const p = normalizePath(path); return (this.meta(p)?.links ?? []).map((l) => ({ ...l, from: p })); }
  /** [{ from, links }] — links into `path` from other notes. */
  backlinks(path) {
    const p = normalizePath(path);
    const groups = new Map();
    for (const link of this.derived().incoming.get(p) ?? []) { if (link.from === p) continue; if (!groups.has(link.from)) groups.set(link.from, []); groups.get(link.from).push(link); }
    return [...groups].map(([from, links]) => ({ from, links })).sort((a, b) => a.from.localeCompare(b.from));
  }
  unresolved() { return this.derived().unresolved; }
  tags() { return [...this.derived().tags.values()].sort((a, b) => a.tag.localeCompare(b.tag)); }
  orphans() { const d = this.derived(); return this.notePaths().filter((p) => !(d.incoming.get(p) ?? []).some((l) => l.from !== p) && !(this.meta(p)?.links ?? []).some((l) => l.resolved && l.resolved !== p)); }
  properties() {
    const props = new Map();
    for (const note of this.notes.values()) for (const [key, value] of Object.entries(note.frontmatter ?? {})) { if (!props.has(key)) props.set(key, { key, count: 0, type: propertyType(value) }); props.get(key).count += 1; }
    return [...props.values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  /** Fast local guess of where a link goes (for editor styling); the core's answer (`resolved`) is authoritative. */
  resolveQuick(target, from = '') {
    const t = normalizePath(String(target ?? '').split('#')[0]).toLowerCase();
    if (!t) return from || null;
    const tryPath = (p) => [p, `${p}.md`].find((x) => this.files.has(x)) ?? null;
    const exact = [...this.files.keys()].find((p) => p.toLowerCase() === t || p.toLowerCase() === `${t}.md`);
    if (exact) return exact;
    const byName = [...this.files.keys()].filter((p) => nameOf(p).toLowerCase() === t || fileNameOf(p).toLowerCase() === t || p.toLowerCase().endsWith(`/${t}.md`) || p.toLowerCase().endsWith(`/${t}`));
    if (byName.length) { const base = folderOf(from); return byName.sort((a, b) => (folderOf(a) === base ? -1 : 0) - (folderOf(b) === base ? -1 : 0) || a.length - b.length)[0]; }
    for (const [p, note] of this.notes) if ((note.aliases ?? []).some((a) => a.toLowerCase() === t)) return p;
    return tryPath(t);
  }
}

export function propertyType(value) {
  if (Array.isArray(value)) return 'list';
  if (typeof value === 'boolean') return 'checkbox';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return 'datetime';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
  return 'text';
}
