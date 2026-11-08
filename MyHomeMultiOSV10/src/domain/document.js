// The open site: the site itself, where it is saved, its undo history, whether it has unsaved
// changes, and the view state (the page shown, the device width, the zoom).
import { History } from './history.js';
import { newId, serializeSite } from './site.js';

const snapshot = (site) => JSON.stringify(site);

export const baseName = (path) => String(path ?? '').split(/[\\/]/).pop();
export const directoryOf = (path) => {
  const text = String(path ?? '');
  const at = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
  return at > 0 ? text.slice(0, at) : '';
};
export const extensionOf = (name) => (/\.([^./\\]+)$/.exec(String(name ?? ''))?.[1] ?? '').toLowerCase();
export const stripExtension = (name) => String(name ?? '').replace(/\.[^./\\]+$/, '');
export const withExtension = (path, extension) => (extensionOf(path) === extension ? path : `${stripExtension(path)}.${extension}`);
/** Files MyHomeMaker opens: projects (.myhome), templates (.mhomt) and plain JSON. */
export const isSiteFileName = (name) => ['myhome', 'mhomt', 'json'].includes(extensionOf(name));
export const isTemplateFileName = (name) => extensionOf(name) === 'mhomt';
export const isImageFileName = (name) => ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'].includes(extensionOf(name));
export const fileSafe = (name) => String(name ?? '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'site';

export class SiteDocument {
  #site;
  #saved;
  #json = null;
  #dirty = null;

  constructor(site, { path = null, handle = null, name = null, template = false } = {}) {
    this.id = `doc-${newId()}`;
    this.site = site;
    this.path = path;
    this.handle = handle;
    this.name = name;
    this.fromTemplate = template;
    this.history = new History();
    this.saved = snapshot(site);
    this.view = { pageId: site.pages[0]?.id ?? null, device: 'desktop', zoom: 100, scroll: {} };
  }

  get site() { return this.#site; }
  set site(value) { this.#site = value; this.touch(); }

  /** The page shown (falls back to the first). */
  get page() {
    let page = this.#site.pages.find((p) => p.id === this.view.pageId);
    if (!page) { page = this.#site.pages[0]; this.view.pageId = page?.id ?? null; }
    return page;
  }

  get saved() { return this.#saved; }
  set saved(value) { this.#saved = value; this.#dirty = null; }

  touch() { this.#json = null; this.#dirty = null; }

  get dirty() {
    this.#dirty ??= snapshot(this.#site) !== this.#saved;
    return this.#dirty;
  }

  #current() {
    this.#json ??= JSON.stringify(this.#site);
    return this.#json;
  }

  /** Runs `change(site)` as one undoable step; returns what it returned. */
  apply(label, change) {
    const before = this.#current();
    let result;
    try { result = change(this.#site); } catch (error) { this.touch(); throw error; }
    const after = JSON.stringify(this.#site);
    if (after !== before) { this.history.record(before, label); this.#dirty = null; }
    this.#json = after;
    return result;
  }

  undo() {
    const entry = this.history.undo(this.#current());
    if (!entry) return null;
    this.site = JSON.parse(entry.snapshot);
    this.#json = entry.snapshot;
    return entry.label;
  }

  redo() {
    const entry = this.history.redo(this.#current());
    if (!entry) return null;
    this.site = JSON.parse(entry.snapshot);
    this.#json = entry.snapshot;
    return entry.label;
  }

  markSaved(path = this.path) {
    this.path = path;
    this.fromTemplate = false;
    this.saved = snapshot(this.#site);
    this.#dirty = false;
  }

  text() { return `${serializeSite(this.#site)}\n`; }
}
