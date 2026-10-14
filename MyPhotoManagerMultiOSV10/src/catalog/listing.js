// Sorting and grouping the file list.
import { extensionOf } from '../formats/types.js';
import { LABELS, photoDate } from './catalog.js';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export const SORT_KEYS = ['name', 'taken', 'modified', 'created', 'size', 'type', 'rating', 'label', 'dimensions', 'camera'];
export const GROUP_KEYS = ['none', 'day', 'month', 'year', 'folder', 'rating', 'label', 'type', 'camera'];

function value(item, key, record) {
  switch (key) {
    case 'size': return item.size ?? 0;
    case 'modified': return item.modified ?? 0;
    case 'created': return item.created ?? 0;
    case 'taken': return photoDate(record, item.modified ?? 0);
    case 'type': return extensionOf(item.name);
    case 'rating': return record?.rating ?? 0;
    case 'label': { const index = LABELS.indexOf(record?.label); return index < 0 ? 99 : index; }
    case 'dimensions': return (record?.width ?? 0) * (record?.height ?? 0);
    case 'camera': return record?.meta?.camera ?? '';
    default: return item.name;
  }
}

/** Sorted copy. Folders come first (by name); ties fall back to the name. */
export function sortItems(items, { key = 'name', desc = false } = {}, recordOf = () => null) {
  const direction = desc ? -1 : 1;
  const keyed = items.map((item) => ({ item, v: item.isDir ? item.name : value(item, key, recordOf(item.path)) }));
  keyed.sort((a, b) => {
    if (a.item.isDir !== b.item.isDir) return a.item.isDir ? -1 : 1;
    if (a.item.isDir) return collator.compare(a.item.name, b.item.name);
    const primary = typeof a.v === 'string' || typeof b.v === 'string' ? collator.compare(String(a.v), String(b.v)) : a.v - b.v;
    return primary * direction || collator.compare(a.item.name, b.item.name);
  });
  return keyed.map((entry) => entry.item);
}

const pad = (n) => String(n).padStart(2, '0');

/** Group key and sort order of an item for `by`. */
function groupOf(item, by, record) {
  if (item.isDir) return { key: '\0folders', order: -Infinity, kind: 'folders' };
  switch (by) {
    case 'day': case 'month': case 'year': {
      const when = photoDate(record, item.modified ?? 0);
      if (!when) return { key: 'unknown', order: Infinity, kind: 'unknown' };
      const d = new Date(when);
      const key = by === 'year' ? `${d.getFullYear()}` : by === 'month' ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}` : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const start = by === 'year' ? new Date(d.getFullYear(), 0, 1) : by === 'month' ? new Date(d.getFullYear(), d.getMonth(), 1) : new Date(d.getFullYear(), d.getMonth(), d.getDate());
      return { key, order: -start.getTime(), kind: by, time: start.getTime() };
    }
    case 'folder': {
      const index = Math.max(item.path.lastIndexOf('/'), item.path.lastIndexOf('\\'));
      const folder = index > 0 ? item.path.slice(0, index) : item.path;
      return { key: folder, order: folder.toLowerCase(), kind: 'folder' };
    }
    case 'rating': { const r = record?.rating ?? 0; return { key: String(r), order: -r, kind: 'rating', value: r }; }
    case 'label': { const l = record?.label ?? 'none'; const i = LABELS.indexOf(l); return { key: l, order: i < 0 ? 99 : i, kind: 'label', value: l }; }
    case 'type': { const e = extensionOf(item.name) || '—'; return { key: e, order: e, kind: 'type' }; }
    case 'camera': { const c = record?.meta?.camera ?? ''; return { key: c || 'unknown', order: c ? c.toLowerCase() : '￿', kind: c ? 'camera' : 'unknown' }; }
    default: return { key: 'all', order: 0, kind: 'all' };
  }
}

/** [{ key, kind, time?, value?, items }] in display order; items keep their sorted order. */
export function groupItems(items, by, recordOf = () => null) {
  if (!by || by === 'none') return [{ key: 'all', kind: 'all', items }];
  const groups = new Map();
  for (const item of items) {
    const group = groupOf(item, by, recordOf(item.path));
    if (!groups.has(group.key)) groups.set(group.key, { ...group, items: [] });
    groups.get(group.key).items.push(item);
  }
  return [...groups.values()].sort((a, b) => (typeof a.order === 'string' && typeof b.order === 'string' ? collator.compare(a.order, b.order) : a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
}
