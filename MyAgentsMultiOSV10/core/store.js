// Storage: one JSON file per record under the data folder (ARCHITECTURE.md §6). No database server is needed,
// files can be backed up or put under version control, and an agent file opens in any editor.
//
//   <data>/agents/<id>.json      agent documents (the workflow)
//   <data>/runs/<id>.json        run records (the newest `cap` are kept)
//   <data>/knowledge/<id>.json   knowledge bases (documents and chunks)
//   <data>/memory/<agent>/<session>.json   conversation memory
//   <data>/credentials.json, <data>/settings.json
//
// Without a data folder (tests) everything stays in memory.
import fs from 'node:fs';
import path from 'node:path';

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

const safeId = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);

export class Collection {
  /** @param {string|null} dir @param {{ cap?: number, sort?: (a, b) => number }} opts */
  constructor(dir, { cap = 0 } = {}) {
    this.dir = dir;
    this.cap = cap;
    this.items = new Map();
    this.loaded = false;
  }

  load() {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.dir || !fs.existsSync(this.dir)) return;
    for (const name of fs.readdirSync(this.dir)) {
      if (!name.endsWith('.json')) continue;
      try {
        const value = JSON.parse(fs.readFileSync(path.join(this.dir, name), 'utf8'));
        if (value?.id) this.items.set(value.id, value);
      } catch (err) {
        console.error(`[store] ${path.join(this.dir, name)}: ${err.message}`);
      }
    }
  }

  all() { this.load(); return [...this.items.values()]; }
  get(id) { this.load(); return this.items.get(id) ?? null; }
  has(id) { this.load(); return this.items.has(id); }

  put(value) {
    this.load();
    this.items.set(value.id, value);
    if (this.dir) writeAtomic(path.join(this.dir, `${safeId(value.id)}.json`), JSON.stringify(value, null, 2));
    if (this.cap && this.items.size > this.cap) this.trim();
    return value;
  }

  remove(id) {
    this.load();
    const had = this.items.delete(id);
    if (this.dir) fs.rmSync(path.join(this.dir, `${safeId(id)}.json`), { force: true });
    return had;
  }

  /** The oldest records go (by createdAt / startedAt) until `cap` are left. */
  trim() {
    const sorted = [...this.items.values()].sort((a, b) => (a.startedAt ?? a.createdAt ?? 0) - (b.startedAt ?? b.createdAt ?? 0));
    while (sorted.length > this.cap) this.remove(sorted.shift().id);
  }
}

export class JsonFile {
  constructor(file, fallback) { this.file = file; this.fallback = fallback; this.value = undefined; }
  read() {
    if (this.value !== undefined) return this.value;
    this.value = structuredClone(this.fallback);
    if (this.file && fs.existsSync(this.file)) {
      try { this.value = { ...this.value, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) }; } catch (err) { console.error(`[store] ${this.file}: ${err.message}`); }
    }
    return this.value;
  }
  write(value) { this.value = value; if (this.file) writeAtomic(this.file, JSON.stringify(value, null, 2)); return value; }
}

export function createStore(dataDir) {
  const dir = (name) => (dataDir ? path.join(dataDir, name) : null);
  return {
    dataDir: dataDir ?? null,
    agents: new Collection(dir('agents')),
    runs: new Collection(dir('runs'), { cap: 500 }),
    kbs: new Collection(dir('knowledge')),
    credentials: new JsonFile(dataDir ? path.join(dataDir, 'credentials.json') : null, { items: [] }),
    settings: new JsonFile(dataDir ? path.join(dataDir, 'settings.json') : null, {}),
    memoryDir: dir('memory'),
    workDir: dataDir ? path.join(dataDir, 'work') : null,
  };
}
