// The catalog: what the user adds to photos (rating, color label, tag, keywords,
// categories, title, caption, notes) and what the app learns about them
// (size, time stamps, metadata summary). Keyed by path. Persisted as JSON
// (desktop: catalog.json in the app data folder; web: IndexedDB).
//
// Pure data and logic — no DOM — so it is unit-tested directly.

export const LABELS = ['red', 'yellow', 'green', 'blue', 'purple'];
export const LABEL_COLORS = { red: '#e5484d', yellow: '#f5c400', green: '#30a46c', blue: '#3e8ef7', purple: '#8e4ec6' };
export const DEFAULT_CATEGORIES = ['Albums', 'People', 'People/Family', 'People/Friends', 'Places', 'Events', 'Favorites'];
const FORMAT = 1;

const uniq = (values) => [...new Set(values.map((v) => String(v).trim()).filter(Boolean))];
const sortText = (values) => [...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

/** Folder part of a path ("/" and "\" both separate). */
export function parentOf(path) {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (index < 0) return '';
  const parent = path.slice(0, index);
  // "C:" → "C:\", "" → "/"
  if (/^[A-Za-z]:$/.test(parent)) return `${parent}\\`;
  return parent || path.slice(0, 1);
}

export function baseName(path) {
  return String(path).split(/[\\/]/).filter(Boolean).pop() ?? String(path);
}

export function joinPath(dir, name) {
  if (!dir) return name;
  const separator = dir.includes('\\') && !dir.includes('/') ? '\\' : '/';
  return /[\\/]$/.test(dir) ? dir + name : dir + separator + name;
}

/** Text fields the user can fill in (title, caption, notes and the IPTC Core fields). */
export const TEXT_FIELDS = ['title', 'caption', 'notes', 'author', 'copyright', 'headline', 'credit', 'source', 'instructions', 'city', 'state', 'country', 'sublocation', 'countryCode', 'usageTerms', 'event'];

const isOrganized = (record) => Boolean(record.rating || record.label || record.tagged || record.keywords?.length || record.categories?.length
  || TEXT_FIELDS.some((key) => record[key]) || record.edited || record.faces?.some((face) => face.person) || record.editState);

export class Catalog {
  constructor(data = null) {
    this.files = new Map(Object.entries(data?.files ?? {}));
    this.categories = sortText(uniq(data?.categories ?? DEFAULT_CATEGORIES));
    this.keywordList = sortText(uniq(data?.keywords ?? []));
    this.savedSearches = Array.isArray(data?.savedSearches) ? data.savedSearches : [];
    this.basket = Array.isArray(data?.basket) ? data.basket : [];
    this.people = sortText(uniq(data?.people ?? []));
    this.presets = Array.isArray(data?.presets) ? data.presets : [];
    this.listeners = new Set();
    this.dirty = false;
    this.revision = 0;
  }

  static fromJSON(text) {
    if (!text) return new Catalog();
    const data = typeof text === 'string' ? JSON.parse(text) : text;
    if (data.format && data.format > FORMAT) throw new Error('catalog was written by a newer version');
    return new Catalog(data);
  }

  toJSON() {
    const files = {};
    for (const [path, record] of this.files) files[path] = record;
    return { format: FORMAT, files, categories: this.categories, keywords: this.keywordList, savedSearches: this.savedSearches, basket: this.basket, people: this.people, presets: this.presets };
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  changed(paths, what) {
    this.dirty = true;
    this.revision += 1;
    for (const listener of this.listeners) listener({ paths, what });
  }

  get(path) {
    return this.files.get(path) ?? null;
  }

  ensure(path) {
    let record = this.files.get(path);
    if (!record) {
      record = {};
      this.files.set(path, record);
    }
    return record;
  }

  /** Applies `change(record)` to each path and notifies once. */
  update(paths, change, what = 'organize') {
    const list = [].concat(paths);
    for (const path of list) change(this.ensure(path), path);
    this.changed(list, what);
  }

  setRating(paths, rating) {
    const value = Math.max(0, Math.min(5, Math.round(rating)));
    this.update(paths, (record) => { if (value) record.rating = value; else delete record.rating; }, 'rating');
  }

  setLabel(paths, label) {
    this.update(paths, (record) => { if (LABELS.includes(label)) record.label = label; else delete record.label; }, 'label');
  }

  setTagged(paths, tagged) {
    this.update(paths, (record) => { if (tagged) record.tagged = true; else delete record.tagged; }, 'tagged');
  }

  /** Tags all when any is untagged, otherwise untags all (the `` ` `` key). */
  toggleTagged(paths) {
    const list = [].concat(paths);
    const tag = list.some((path) => !this.get(path)?.tagged);
    this.setTagged(list, tag);
    return tag;
  }

  addKeywords(paths, keywords) {
    const words = uniq(keywords);
    if (!words.length) return;
    this.keywordList = sortText(uniq([...this.keywordList, ...words]));
    this.update(paths, (record) => { record.keywords = sortText(uniq([...(record.keywords ?? []), ...words])); }, 'keywords');
  }

  removeKeywords(paths, keywords) {
    const drop = new Set(uniq(keywords).map((k) => k.toLowerCase()));
    this.update(paths, (record) => {
      record.keywords = (record.keywords ?? []).filter((k) => !drop.has(k.toLowerCase()));
      if (!record.keywords.length) delete record.keywords;
    }, 'keywords');
  }

  setKeywords(paths, keywords) {
    const words = sortText(uniq(keywords));
    this.keywordList = sortText(uniq([...this.keywordList, ...words]));
    this.update(paths, (record) => { if (words.length) record.keywords = [...words]; else delete record.keywords; }, 'keywords');
  }

  addCategory(path) {
    const clean = path.split('/').map((part) => part.trim()).filter(Boolean);
    if (!clean.length) return null;
    const all = clean.map((_, i) => clean.slice(0, i + 1).join('/'));
    this.categories = sortText(uniq([...this.categories, ...all]));
    this.changed([], 'categories');
    return clean.join('/');
  }

  /** Removes a category and its sub-categories from the tree and from every photo. */
  removeCategory(path) {
    const inside = (c) => c === path || c.startsWith(`${path}/`);
    this.categories = this.categories.filter((c) => !inside(c));
    const touched = [];
    for (const [file, record] of this.files) {
      if (record.categories?.some(inside)) {
        record.categories = record.categories.filter((c) => !inside(c));
        if (!record.categories.length) delete record.categories;
        touched.push(file);
      }
    }
    this.changed(touched, 'categories');
  }

  renameCategory(path, newName) {
    const name = newName.replace(/\//g, '').trim();
    if (!name) return null;
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const target = parent ? `${parent}/${name}` : name;
    const move = (c) => (c === path ? target : c.startsWith(`${path}/`) ? target + c.slice(path.length) : c);
    this.categories = sortText(uniq(this.categories.map(move)));
    const touched = [];
    for (const [file, record] of this.files) {
      if (record.categories?.some((c) => c === path || c.startsWith(`${path}/`))) {
        record.categories = uniq(record.categories.map(move));
        touched.push(file);
      }
    }
    this.changed(touched, 'categories');
    return target;
  }

  assignCategory(paths, category, on = true) {
    if (on) this.addCategory(category);
    this.update(paths, (record) => {
      const current = new Set(record.categories ?? []);
      if (on) current.add(category); else current.delete(category);
      if (current.size) record.categories = sortText([...current]); else delete record.categories;
    }, 'categories');
  }

  setFields(paths, fields) {
    this.update(paths, (record) => {
      for (const key of TEXT_FIELDS) {
        if (!(key in fields)) continue;
        const value = String(fields[key] ?? '').trim();
        if (value) record[key] = value; else delete record[key];
      }
    }, 'fields');
  }

  /** What the app learned from the file: size, time stamp, metadata summary, pixel size. */
  setInfo(path, { size, modified, meta, width, height }) {
    const record = this.ensure(path);
    if (size != null) record.size = size;
    if (modified != null) record.modified = modified;
    if (meta) record.meta = meta;
    if (width && height) { record.width = width; record.height = height; }
    if (!record.indexed) record.indexed = Date.now();
    // Embedded XMP rating / label / keywords count as the photo's own, unless the user already chose.
    if (meta?.xmpRating > 0 && record.rating == null) record.rating = meta.xmpRating;
    if (meta?.xmpLabel && record.label == null) {
      const label = meta.xmpLabel.toLowerCase();
      if (LABELS.includes(label)) record.label = label;
    }
    if (meta?.keywords?.length && !record.keywords && !record.keywordsSeen) {
      record.keywords = sortText(uniq(meta.keywords));
      this.keywordList = sortText(uniq([...this.keywordList, ...meta.keywords]));
    }
    if (meta?.keywords) record.keywordsSeen = true;
    this.dirty = true;
    this.revision += 1;
  }

  /** Is the stored info still about this file (same size and time stamp)? */
  isCurrent(path, size, modified) {
    const record = this.get(path);
    return Boolean(record?.indexed && record.size === size && Math.abs((record.modified ?? 0) - modified) < 2000);
  }

  markEdited(path, edited = true) {
    this.update(path, (record) => { if (edited) record.edited = true; else delete record.edited; }, 'edited');
  }

  /** A file was renamed or moved: its record goes with it. */
  movePath(from, to) {
    if (from === to) return;
    const moved = [];
    for (const [path, record] of [...this.files]) {
      if (path === from || path.startsWith(`${from}/`) || path.startsWith(`${from}\\`)) {
        const target = to + path.slice(from.length);
        this.files.delete(path);
        this.files.set(target, record);
        moved.push(target);
      }
    }
    this.basket = this.basket.map((path) => (path === from ? to : path.startsWith(`${from}/`) || path.startsWith(`${from}\\`) ? to + path.slice(from.length) : path));
    if (moved.length) this.changed(moved, 'move');
  }

  /** A copy gets the organizing data (not the learned info, which is re-read). */
  copyPath(from, to) {
    const record = this.get(from);
    if (!record) return;
    const copy = JSON.parse(JSON.stringify(record));
    this.files.set(to, copy);
    this.changed([to], 'copy');
  }

  removePaths(paths) {
    const drop = new Set(paths);
    for (const path of [...this.files.keys()]) {
      if (drop.has(path) || paths.some((p) => path.startsWith(`${p}/`) || path.startsWith(`${p}\\`))) this.files.delete(path);
    }
    this.basket = this.basket.filter((path) => !drop.has(path));
    this.changed(paths, 'remove');
  }

  /** Drops learned info of files that are gone but keeps records the user organized. */
  forgetMissing(paths) {
    for (const path of paths) {
      const record = this.files.get(path);
      if (record && !isOrganized(record)) this.files.delete(path);
    }
    this.dirty = true;
  }

  // ───────── people (faces found in photos, named by the user)

  /** Faces of a photo: [{ box: { x, y, w, h } (fractions), descriptor: number[], person: name|null, score }]. */
  setFaces(path, faces) {
    const record = this.ensure(path);
    // Names the user gave stay with faces at (nearly) the same place.
    const old = record.faces ?? [];
    record.faces = faces.map((face) => {
      const match = old.find((o) => o.person && Math.abs(o.box.x - face.box.x) < 0.03 && Math.abs(o.box.y - face.box.y) < 0.03);
      return match ? { ...face, person: match.person } : face;
    });
    record.facesScanned = true;
    this.changed([path], 'faces');
  }

  nameFace(path, index, person) {
    const record = this.ensure(path);
    const face = record.faces?.[index];
    if (!face) return;
    const name = String(person ?? '').trim();
    face.person = name || null;
    if (name && !this.people.includes(name)) this.people = sortText(uniq([...this.people, name]));
    this.changed([path], 'faces');
  }

  addFace(path, box) {
    const record = this.ensure(path);
    record.faces = [...(record.faces ?? []), { box, descriptor: null, person: null, manual: true }];
    this.changed([path], 'faces');
    return record.faces.length - 1;
  }

  removeFace(path, index) {
    const record = this.get(path);
    if (!record?.faces) return;
    record.faces.splice(index, 1);
    this.changed([path], 'faces');
  }

  renamePerson(name, newName) {
    const target = String(newName).trim();
    if (!target) return;
    const touched = [];
    for (const [path, record] of this.files) {
      for (const face of record.faces ?? []) if (face.person === name) { face.person = target; touched.push(path); }
    }
    this.people = sortText(uniq(this.people.map((p) => (p === name ? target : p))));
    this.changed(touched, 'faces');
  }

  removePerson(name) {
    const touched = [];
    for (const [path, record] of this.files) {
      for (const face of record.faces ?? []) if (face.person === name) { face.person = null; touched.push(path); }
    }
    this.people = this.people.filter((p) => p !== name);
    this.changed(touched, 'faces');
  }

  /** { name: count of photos } and the number of faces nobody named yet. */
  peopleCounts() {
    const counts = Object.fromEntries(this.people.map((p) => [p, 0]));
    let unnamed = 0;
    for (const record of this.files.values()) {
      const names = new Set();
      for (const face of record.faces ?? []) {
        if (face.person) names.add(face.person); else unnamed += 1;
      }
      for (const name of names) counts[name] = (counts[name] ?? 0) + 1;
    }
    return { counts, unnamed };
  }

  // ───────── edit presets and saved edit settings

  savePreset(name, edit) {
    this.presets = [...this.presets.filter((p) => p.name !== name), { name, edit }].sort((a, b) => a.name.localeCompare(b.name));
    this.changed([], 'presets');
  }

  deletePreset(name) {
    this.presets = this.presets.filter((p) => p.name !== name);
    this.changed([], 'presets');
  }

  /** The edit settings a saved photo was made with (re-opened later on top of the original). */
  setEditState(path, edit) {
    this.update(path, (record) => { if (edit) record.editState = edit; else delete record.editState; }, 'edited');
  }

  // ───────── image basket (a holding area across folders)

  addToBasket(paths) {
    this.basket = [...new Set([...this.basket, ...paths])];
    this.changed(paths, 'basket');
  }

  removeFromBasket(paths) {
    const drop = new Set(paths);
    this.basket = this.basket.filter((path) => !drop.has(path));
    this.changed(paths, 'basket');
  }

  clearBasket() {
    const old = this.basket;
    this.basket = [];
    this.changed(old, 'basket');
  }

  // ───────── saved searches

  saveSearch(name, query) {
    this.savedSearches = [...this.savedSearches.filter((s) => s.name !== name), { name, query }].sort((a, b) => a.name.localeCompare(b.name));
    this.changed([], 'searches');
  }

  deleteSearch(name) {
    this.savedSearches = this.savedSearches.filter((s) => s.name !== name);
    this.changed([], 'searches');
  }

  // ───────── counts for the Catalog pane

  counts() {
    const ratings = [0, 0, 0, 0, 0, 0];
    const labels = Object.fromEntries(LABELS.map((label) => [label, 0]));
    const categories = Object.fromEntries(this.categories.map((c) => [c, 0]));
    const keywords = {};
    let tagged = 0;
    let uncategorized = 0;
    let indexed = 0;
    for (const record of this.files.values()) {
      if (record.indexed) indexed += 1;
      ratings[record.rating ?? 0] += 1;
      if (record.label) labels[record.label] += 1;
      if (record.tagged) tagged += 1;
      for (const c of record.categories ?? []) categories[c] = (categories[c] ?? 0) + 1;
      if (!record.categories?.length && record.indexed) uncategorized += 1;
      for (const k of record.keywords ?? []) keywords[k] = (keywords[k] ?? 0) + 1;
    }
    return { ratings, labels, categories, keywords, tagged, uncategorized, indexed, total: this.files.size };
  }
}

// ───────────────────────── automatic categories (from metadata)

const bucket = (value, edges, format) => {
  for (let i = 0; i < edges.length; i++) if (value < edges[i]) return format(i === 0 ? null : edges[i - 1], edges[i]);
  return format(edges[edges.length - 1], null);
};

export const AUTO_CATEGORIES = {
  camera: (record) => record.meta?.camera ?? null,
  lens: (record) => record.meta?.lens ?? null,
  year: (record) => (record.meta?.taken ? String(new Date(record.meta.taken).getFullYear()) : null),
  iso: (record) => (record.meta?.iso ? bucket(record.meta.iso, [200, 400, 800, 1600, 3200, 6400], (a, b) => (a == null ? `< ${b}` : b == null ? `≥ ${a}` : `${a}–${b - 1}`)) : null),
  focal: (record) => (record.meta?.focal ? bucket(record.meta.focal35 ?? record.meta.focal, [24, 35, 50, 85, 135, 300], (a, b) => (a == null ? `< ${b} mm` : b == null ? `≥ ${a} mm` : `${a}–${b - 1} mm`)) : null),
  aperture: (record) => (record.meta?.fNumber ? `f/${record.meta.fNumber}` : null),
  flash: (record) => (record.meta?.flash == null ? null : record.meta.flash ? 'on' : 'off'),
  orientation: (record) => (record.width && record.height ? (record.width > record.height ? 'landscape' : record.width < record.height ? 'portrait' : 'square') : null),
  gps: (record) => (record.meta?.lat != null ? 'yes' : record.indexed ? 'no' : null),
  country: (record) => record.meta?.country ?? null,
};

/** { key: { value: count } } over the given records. */
export function autoCategoryCounts(records) {
  const out = Object.fromEntries(Object.keys(AUTO_CATEGORIES).map((key) => [key, {}]));
  for (const record of records) {
    for (const [key, read] of Object.entries(AUTO_CATEGORIES)) {
      const value = read(record);
      if (value != null) out[key][value] = (out[key][value] ?? 0) + 1;
    }
  }
  return out;
}

/** The photo's date for calendars and sorting: date taken, else file modified time. */
export const photoDate = (record, fallback = 0) => record?.meta?.taken ?? record?.modified ?? fallback;
