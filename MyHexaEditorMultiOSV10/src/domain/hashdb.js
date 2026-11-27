// The known-hash database (WinHex hash sets, NSRL-style lists): hash values the user collects or imports, each
// with a name and a category — "known" files to ignore, or "notable" ones to look out for. The hashes panel marks
// every result found here. Stored in localStorage; any hash length (CRC-32 … SHA-512) is accepted.

export const HASHDB_KEY = 'myhexa.hashdb.v1';
export const HASHDB_LIMIT = 500_000;
export const CATEGORIES = ['known', 'notable'];

const clean = (value) => String(value ?? '').trim().toLowerCase().replace(/^0x/, '');
const isHash = (value) => /^[0-9a-f]{8,128}$/.test(value);

/** { entries: Map(value → { name, category }) } read from storage (or empty). */
export function loadHashDb(storage = globalThis.localStorage) {
  const entries = new Map();
  try {
    const raw = JSON.parse(storage?.getItem(HASHDB_KEY) ?? 'null');
    for (const [value, name, category] of raw?.entries ?? []) if (isHash(value)) entries.set(value, { name: String(name ?? ''), category: CATEGORIES.includes(category) ? category : 'known' });
  } catch { /* broken: start empty */ }
  return { entries };
}

export function saveHashDb(db, storage = globalThis.localStorage) {
  storage?.setItem(HASHDB_KEY, JSON.stringify({ version: 1, entries: [...db.entries].map(([value, e]) => [value, e.name, e.category]) }));
}

/** The entry of a hash value, or null. */
export const lookupHash = (db, value) => db.entries.get(clean(value)) ?? null;

export function addHash(db, value, name, category = 'known') {
  const v = clean(value);
  if (!isHash(v)) throw new Error(`not a hash value: ${value}`);
  if (!db.entries.has(v) && db.entries.size >= HASHDB_LIMIT) throw new Error(`the database holds at most ${HASHDB_LIMIT} hashes`);
  db.entries.set(v, { name: String(name ?? ''), category: CATEGORIES.includes(category) ? category : 'known' });
  return v;
}

export const removeHash = (db, value) => db.entries.delete(clean(value));

/**
 * Hash lists as text: md5sum / sha1sum / sha256sum lines ("<hash>  <name>", "<hash> *<name>"), BSD style
 * ("SHA256 (name) = <hash>"), CSV / TSV with a hash column (NSRL: "SHA-1","MD5","CRC32","FileName",…, a header
 * line names the columns) and bare hashes one per line. Returns { added, skipped }.
 */
export function importHashList(db, text, category = 'known', fallbackName = '') {
  let added = 0;
  let skipped = 0;
  let header = null;
  let current = category;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    const section = /^#\s*(known|notable)\s*$/i.exec(line);
    if (section) { current = section[1].toLowerCase(); continue; }
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const pairs = [];
    const bsd = /^[A-Za-z0-9-]+\s*\((.*)\)\s*=\s*([0-9a-fA-F]+)$/.exec(line);
    if (bsd) pairs.push([bsd[2], bsd[1]]);
    else if (/[,\t]/.test(line) && !/^[0-9a-fA-F]+\s+\*?\S/.test(line)) {
      const cells = line.split(line.includes('\t') ? '\t' : ',').map((c) => c.trim().replace(/^"|"$/g, ''));
      if (!header && cells.some((c) => /^(sha-?1|sha-?256|md5|crc-?32|hash)$/i.test(c))) { header = cells.map((c) => c.toLowerCase()); continue; }
      const nameAt = header ? header.findIndex((c) => /file ?name|name|path/.test(c)) : -1;
      const name = nameAt >= 0 ? cells[nameAt] : cells.find((c) => !isHash(clean(c))) ?? fallbackName;
      for (const c of cells) if (isHash(clean(c))) pairs.push([c, name]);
    } else {
      const m = /^(?:0x)?([0-9a-fA-F]{8,128})(?:\s+\*?(.*))?$/.exec(line);
      if (m) pairs.push([m[1], m[2] ?? fallbackName]);
    }
    if (!pairs.length) { skipped += 1; continue; }
    for (const [value, name] of pairs) {
      try { addHash(db, value, name, current); added += 1; } catch { skipped += 1; }
    }
  }
  return { added, skipped };
}

/** The database as "<hash>  <name>" lines (with a comment per category), readable by importHashList. */
export function exportHashList(db) {
  const out = ['# MyHexaMaster hash database'];
  for (const category of CATEGORIES) {
    const list = [...db.entries].filter(([, e]) => e.category === category);
    if (!list.length) continue;
    out.push(`# ${category}`);
    for (const [value, e] of list) out.push(`${value}  ${e.name}`);
  }
  return `${out.join('\n')}\n`;
}
