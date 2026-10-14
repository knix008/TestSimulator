// Finding photos.
//
// Quick search text (the search box and the Search pane):
//   beach "red car" -night          words / phrases in name, title, caption, keywords, categories, camera, notes
//   rating:3  rating:>=4  rating:0  label:red  tagged  is:edited  is:raw  is:video  has:gps
//   kw:sea  cat:People/Family  camera:canon  lens:24-70  ext:jpg  iso:>=1600
//   date:2024  date:2024-05  date:2024-05-01  date:2024-01..2024-06
//
// Catalog pane selection ("selective browsing"): a list of filters. Filters of
// the same kind are alternatives (any of them); different kinds must all match
// (or any, when the user picks "match any").
import { AUTO_CATEGORIES, photoDate } from './catalog.js';
import { extensionOf, kindOf } from '../formats/types.js';

const FIELDS = new Set(['person', 'rating', 'label', 'kw', 'keyword', 'cat', 'category', 'camera', 'lens', 'ext', 'iso', 'date', 'is', 'has', 'name', 'folder']);

/** Splits search text into terms: [{ neg, field, op, value }]. */
export function parseSearch(input) {
  const terms = [];
  const pattern = /(-)?(?:(\w+):)?(?:"([^"]*)"|(\S+))/g;
  for (const match of String(input ?? '').matchAll(pattern)) {
    const [, neg, rawField, quoted, bare] = match;
    let field = rawField?.toLowerCase() ?? null;
    let value = (quoted ?? bare ?? '').trim();
    if (field && !FIELDS.has(field)) { value = `${rawField}:${value}`; field = null; }
    if (!value && !field) continue;
    if (!field && /^(tagged|untagged)$/i.test(value)) { field = 'is'; value = value.toLowerCase(); }
    let op = '=';
    const comparison = /^(>=|<=|>|<|=)(.*)$/.exec(value);
    if (comparison && field) { op = comparison[1]; value = comparison[2]; }
    terms.push({ neg: Boolean(neg), field, op, value });
  }
  return terms;
}

const compare = (a, op, b) => (op === '>=' ? a >= b : op === '<=' ? a <= b : op === '>' ? a > b : op === '<' ? a < b : a === b);
const lower = (value) => String(value ?? '').toLowerCase();

/** [start, end) in ms for "2024", "2024-05", "2024-05-01" (local time). */
export function dateRange(text) {
  const match = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const year = Number(match[1]);
  if (match[3]) { const start = new Date(year, match[2] - 1, Number(match[3])); return [start.getTime(), new Date(year, match[2] - 1, Number(match[3]) + 1).getTime()]; }
  if (match[2]) return [new Date(year, match[2] - 1, 1).getTime(), new Date(year, Number(match[2]), 1).getTime()];
  return [new Date(year, 0, 1).getTime(), new Date(year + 1, 0, 1).getTime()];
}

function haystack(item, record) {
  return lower([item.name, record?.title, record?.caption, record?.notes, record?.author, ...(record?.keywords ?? []), ...(record?.categories ?? []),
    record?.meta?.camera, record?.meta?.lens, record?.meta?.caption, record?.meta?.title, record?.meta?.city, record?.meta?.country].filter(Boolean).join('\n'));
}

function termMatches(term, item, record) {
  const value = lower(term.value);
  switch (term.field) {
    case null: return haystack(item, record).includes(value);
    case 'name': return lower(item.name).includes(value);
    case 'folder': return lower(item.path).includes(value);
    case 'rating': {
      const n = Number.parseInt(value, 10);
      return Number.isFinite(n) && compare(record?.rating ?? 0, term.op, n);
    }
    case 'label': return value === 'none' ? !record?.label : lower(record?.label) === value;
    case 'kw': case 'keyword': return (record?.keywords ?? []).some((k) => lower(k) === value || lower(k).startsWith(`${value}|`) || (term.op === '=' && lower(k).includes(value)));
    case 'person': return (record?.faces ?? []).some((face) => lower(face.person).includes(value));
    case 'cat': case 'category': return (record?.categories ?? []).some((c) => lower(c) === value || lower(c).startsWith(`${value}/`) || lower(c.split('/').pop()) === value);
    case 'camera': return lower(record?.meta?.camera).includes(value);
    case 'lens': return lower(record?.meta?.lens).includes(value);
    case 'ext': return extensionOf(item.name) === value.replace(/^\./, '');
    case 'iso': {
      const n = Number.parseFloat(value);
      return record?.meta?.iso != null && compare(record.meta.iso, term.op, n);
    }
    case 'date': {
      const [from, to] = value.split('..');
      const start = dateRange(from);
      const end = to ? dateRange(to) : start;
      if (!start || !end) return false;
      const when = photoDate(record, item.modified);
      return when >= start[0] && when < end[1];
    }
    case 'is':
      if (value === 'tagged') return Boolean(record?.tagged);
      if (value === 'untagged') return !record?.tagged;
      if (value === 'edited') return Boolean(record?.edited);
      if (value === 'rated') return Boolean(record?.rating);
      if (value === 'unrated') return !record?.rating;
      if (value === 'labeled') return Boolean(record?.label);
      return kindOf(item.name) === value || (value === 'image' && kindOf(item.name) && kindOf(item.name) !== 'video');
    case 'has':
      if (value === 'gps') return record?.meta?.lat != null;
      if (value === 'keywords') return Boolean(record?.keywords?.length);
      if (value === 'caption') return Boolean(record?.caption || record?.meta?.caption);
      if (value === 'categories') return Boolean(record?.categories?.length);
      return false;
    default: return false;
  }
}

/** Does the item match every term (negated terms must not match)? */
export function matchSearch(terms, item, record) {
  return terms.every((term) => termMatches(term, item, record) !== term.neg);
}

// ───────────────────────── catalog pane filters

/** Key that groups alternatives: two ratings are "either", rating + label are "both". */
const groupKey = (filter) => (filter.type === 'auto' ? `auto:${filter.key}` : filter.type);

export function filterMatches(filter, item, record) {
  switch (filter.type) {
    case 'rating': return filter.value === 0 ? !record?.rating : filter.op === '>=' ? (record?.rating ?? 0) >= filter.value : (record?.rating ?? 0) === filter.value;
    case 'label': return filter.value === 'none' ? !record?.label : record?.label === filter.value;
    case 'tagged': return Boolean(record?.tagged);
    case 'uncategorized': return !record?.categories?.length;
    case 'category': return (record?.categories ?? []).some((c) => c === filter.value || c.startsWith(`${filter.value}/`));
    case 'keyword': {
      // Hierarchical keywords ("Places|Korea|Seoul"): a parent matches its children.
      const value = filter.value.toLowerCase();
      return (record?.keywords ?? []).some((k) => k.toLowerCase() === value || k.toLowerCase().startsWith(`${value}|`));
    }
    case 'person': return (record?.faces ?? []).some((face) => (filter.value ? face.person === filter.value : !face.person));
    case 'all': return true;
    case 'auto': return record ? AUTO_CATEGORIES[filter.key]?.(record) === filter.value : false;
    case 'date': {
      const when = photoDate(record, item.modified);
      return when >= filter.from && when < filter.to;
    }
    case 'kind': return kindOf(item.name) === filter.value;
    case 'text': return matchSearch(parseSearch(filter.value), item, record);
    default: return true;
  }
}

/** Filters grouped by kind: any within a kind; across kinds all (mode 'all') or any (mode 'any'). */
export function matchFilters(filters, item, record, mode = 'all') {
  if (!filters?.length) return true;
  const groups = new Map();
  for (const filter of filters) {
    const key = groupKey(filter);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(filter);
  }
  const results = [...groups.values()].map((group) => group.some((filter) => filterMatches(filter, item, record)));
  return mode === 'any' ? results.some(Boolean) : results.every(Boolean);
}

// ───────────────────────── list filter bar (folder view)

/**
 * The file list's quick filter: { rating: min, label, tagged, kinds: Set|null, text }.
 * Folders always pass (they are for navigation).
 */
export function passesListFilter(filter, item, record) {
  if (item.isDir) return true;
  if (!filter) return true;
  if (filter.rating && (record?.rating ?? 0) < filter.rating) return false;
  if (filter.label && record?.label !== filter.label) return false;
  if (filter.tagged && !record?.tagged) return false;
  if (filter.kinds && !filter.kinds.has(kindOf(item.name) ?? 'other')) return false;
  if (filter.text && !matchSearch(parseSearch(filter.text), item, record)) return false;
  return true;
}
