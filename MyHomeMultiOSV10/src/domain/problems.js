// The Problems panel's list: what to fix before publishing (errors and warnings, each with the
// page, block and field it is about) and words the dictionaries do not know (spelling).
// Every row says where it is, so a double click can show it: { scope: 'site' | 'page' | 'block',
// pageId, blockId, path, start, end }.
import { blockDef, pageFile } from './blocks.js';
import { words } from './spell.js';

/** Text a block keeps in a field kind that is spelling-checked. */
const TEXT_KINDS = new Set(['text', 'textarea', 'md']);
/** Fields that are not words even when they are text (phone numbers, e-mail, emoji icons, markers, prices). */
const NOT_WORDS = new Set(['phone', 'email', 'icon', 'mark', 'price', 'time', 'date', 'value', 'number', 'code', 'html', 'query', 'endpoint', 'embed', 'avatar', 'logo', 'image', 'url', 'ctaUrl', 'href', 'lat', 'lng', 'address', 'map', 'hours', 'brand']);

const pagesOf = (site) => site?.pages ?? [];
const globals = (site) => [site?.layout?.header, site?.layout?.footer].filter(Boolean);

/** Every text of the site that is read by visitors: { scope, pageId, blockId, path, text, label }. */
export function* textFields(site) {
  if (!site) return;
  yield { scope: 'site', pageId: null, blockId: null, path: 'meta.title', text: site.meta?.title ?? '' };
  yield { scope: 'site', pageId: null, blockId: null, path: 'meta.description', text: site.meta?.description ?? '' };
  yield { scope: 'site', pageId: null, blockId: null, path: 'meta.keywords', text: site.meta?.keywords ?? '' };
  const blockFields = function* (block, pageId) {
    const def = blockDef(block.type);
    if (!def || block.type === 'html') return;
    const p = block.props ?? {};
    for (const field of def.fields ?? []) {
      if (field.kind === 'items') {
        const list = Array.isArray(p[field.key]) ? p[field.key] : [];
        for (let i = 0; i < list.length; i++) {
          const item = list[i];
          for (const sub of field.item ?? []) {
            if (TEXT_KINDS.has(sub.kind) && !NOT_WORDS.has(sub.key) && typeof item?.[sub.key] === 'string') yield { scope: 'block', pageId, blockId: block.id, path: `${field.key}.${i}.${sub.key}`, text: item[sub.key], kind: sub.kind };
          }
        }
      } else if (TEXT_KINDS.has(field.kind) && !NOT_WORDS.has(field.key) && typeof p[field.key] === 'string') {
        yield { scope: 'block', pageId, blockId: block.id, path: field.key, text: p[field.key], kind: field.kind };
      }
    }
  };
  for (const block of globals(site)) yield* blockFields(block, pagesOf(site)[0]?.id ?? null);
  for (const page of pagesOf(site)) {
    yield { scope: 'page', pageId: page.id, blockId: null, path: 'name', text: page.name ?? '' };
    yield { scope: 'page', pageId: page.id, blockId: null, path: 'title', text: page.title ?? '' };
    yield { scope: 'page', pageId: page.id, blockId: null, path: 'description', text: page.description ?? '' };
    for (const block of page.blocks) yield* blockFields(block, page.id);
  }
}

/** Every link field of the site: { pageId, blockId, path, url }. */
function* linkFields(site) {
  const fromBlock = function* (block, pageId) {
    const def = blockDef(block.type);
    if (!def) return;
    const p = block.props ?? {};
    for (const field of def.fields ?? []) {
      if (field.kind === 'items') {
        const list = Array.isArray(p[field.key]) ? p[field.key] : [];
        for (let i = 0; i < list.length; i++) {
          const item = list[i];
          for (const sub of field.item ?? []) if (sub.kind === 'url' && typeof item?.[sub.key] === 'string') yield { pageId, blockId: block.id, path: `${field.key}.${i}.${sub.key}`, url: item[sub.key] };
        }
      } else if (field.kind === 'url' && typeof p[field.key] === 'string') yield { pageId, blockId: block.id, path: field.key, url: p[field.key] };
    }
  };
  for (const block of globals(site)) yield* fromBlock(block, pagesOf(site)[0]?.id ?? null);
  for (const page of pagesOf(site)) for (const block of page.blocks) yield* fromBlock(block, page.id);
}

/** What to fix: { severity, code, params, scope, pageId, blockId, path }. `code` is a translation key. */
export function siteChecks(site) {
  const out = [];
  if (!site) return out;
  const push = (severity, code, where = {}, params = {}) => out.push({ kind: 'check', severity, code, params, scope: where.blockId ? 'block' : where.pageId ? 'page' : 'site', pageId: null, blockId: null, path: '', ...where });
  const title = site.meta?.title?.trim() ?? '';
  const description = site.meta?.description?.trim() ?? '';
  if (!title) push('warning', 'check.noTitle', { path: 'meta.title' });
  else if (title.length > 60) push('warning', 'check.longTitle', { path: 'meta.title' }, { count: title.length });
  if (!description) push('warning', 'check.noDescription', { path: 'meta.description' });
  else if (description.length > 160) push('warning', 'check.longDescription', { path: 'meta.description' }, { count: description.length });
  const files = new Set(pagesOf(site).map((page) => pageFile(page)));
  const seen = new Map();
  for (const page of pagesOf(site)) {
    const name = page.name;
    if (seen.has(page.slug)) push('error', 'check.sameSlugPage', { pageId: page.id, path: 'slug' }, { name, other: seen.get(page.slug) });
    else seen.set(page.slug, name);
    if (!String(page.name ?? '').trim()) push('error', 'check.noPageName', { pageId: page.id, path: 'name' });
    if (!page.blocks.length) push('warning', 'check.emptyPage', { pageId: page.id }, { name });
    if (page.blocks.length && page.blocks.every((b) => b.style?.hidden)) push('warning', 'check.allHidden', { pageId: page.id }, { name });
    for (const block of page.blocks) {
      const p = block.props ?? {};
      if (block.type === 'image' && p.src && !String(p.alt ?? '').trim()) push('warning', 'check.noAlt', { pageId: page.id, blockId: block.id, path: 'alt' }, { name });
      if (block.type === 'image' && !p.src) push('warning', 'check.noImage', { pageId: page.id, blockId: block.id, path: 'src' }, { name });
      if (block.type === 'contact' && p.form && !p.endpoint && !p.email) push('error', 'check.noFormTarget', { pageId: page.id, blockId: block.id, path: 'endpoint' }, { name });
      if (block.type === 'video' && p.url && !/youtu|vimeo/i.test(p.url)) push('warning', 'check.videoUrl', { pageId: page.id, blockId: block.id, path: 'url' }, { name });
    }
  }
  for (const link of linkFields(site)) {
    const url = link.url.trim();
    if (/^javascript:/i.test(url)) push('error', 'check.unsafeLink', link, { url });
    else if (/^[\w-]+\.html(?:#.*)?$/i.test(url) && !files.has(url.replace(/#.*$/, ''))) push('error', 'check.brokenLink', link, { url });
  }
  return out;
}

/** Words the checker does not know: { severity: 'spelling', word, suggestions: [] (filled later), … where }. */
export function spellingProblems(site, checker, { limit = 2000 } = {}) {
  const out = [];
  if (!site || !checker) return out;
  for (const field of textFields(site)) {
    for (const w of words(field.text)) {
      if (checker.check(w.word)) continue;
      out.push({ kind: 'spelling', severity: 'spelling', code: 'problems.unknownWord', params: { word: w.word }, word: w.word, scope: field.scope, pageId: field.pageId, blockId: field.blockId, path: field.path, start: w.start, end: w.end });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** The panel's rows with a stable key each (the same problem keeps its key after an edit elsewhere). */
export function siteProblems(site, { checker = null, spelling = true } = {}) {
  const list = [...siteChecks(site), ...(spelling && checker ? spellingProblems(site, checker) : [])];
  const counts = new Map();
  return list.map((p) => {
    const base = `${p.kind}|${p.code}|${p.pageId ?? ''}|${p.blockId ?? ''}|${p.path}|${p.word ?? ''}`;
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    return { ...p, key: `${base}|${n}` };
  });
}

export const SEVERITIES = ['error', 'warning', 'spelling'];

export function countProblems(rows) {
  const c = { error: 0, warning: 0, spelling: 0, total: rows.length };
  for (const r of rows) c[r.severity] += 1;
  return c;
}

/** Rows that pass the panel's filters: `severity` ('all' | one), `pageId` (current page only), `query`. */
export function filterProblems(rows, { severity = 'all', pageId = null, query = '', text = (r) => r.code } = {}) {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => (severity === 'all' || r.severity === severity)
    && (!pageId || r.pageId === pageId || r.scope === 'site')
    && (!q || text(r).toLowerCase().includes(q)));
}

/** Rows by severity, in the panel's order: errors, warnings, spelling. */
export function groupProblems(rows) {
  return SEVERITIES.map((severity) => ({ severity, rows: rows.filter((r) => r.severity === severity) })).filter((g) => g.rows.length);
}

/** The text with `start…end` replaced (a spelling suggestion taken). */
export const replaceRange = (text, start, end, replacement) => `${text.slice(0, start)}${replacement}${text.slice(end)}`;

/** Which occurrence of `word` (0 = the first) starts at `start` in the text — to find it in the page. */
export function occurrenceIndex(text, word, start) {
  let n = 0;
  let at = text.indexOf(word);
  while (at >= 0 && at < start) { n += 1; at = text.indexOf(word, at + 1); }
  return n;
}
