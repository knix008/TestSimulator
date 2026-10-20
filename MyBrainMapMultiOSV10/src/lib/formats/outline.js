// Text-shaped formats: OPML, Markdown, an indented text outline, an HTML
// outline page and a CSV task list. Each import gives a normalized map; each
// export takes a map and gives text.
import { newMap, makeTopic, normalizeMap, mapTitle, topicsFromText } from '../model.js';
import { escapeXml, parseXml, elements, attr, localName } from './xml.js';
import { markerLabel } from '../markers.js';

const firstLine = (s) => String(s || '').split('\n')[0];

// Several top-level topics become the main topics of a new central topic named after the file.
function mapFromTopics(tops, title) {
  const map = newMap({ title: '' });
  if (tops.length === 1) map.root = { ...tops[0] };
  else map.root = { ...map.root, text: title || 'Map', children: tops };
  return normalizeMap(map);
}

// ── OPML ──

export function importOpml(text, name = '') {
  const doc = parseXml(text);
  if (localName(doc) !== 'opml') throw new Error('Not an OPML file');
  const body = elements(doc, 'body')[0];
  const head = elements(doc, 'head')[0];
  const title = head ? (elements(head, 'title')[0] ? elements(head, 'title')[0].children.join('') : '') : '';
  const conv = (o) => {
    const t = makeTopic(attr(o, 'text') ?? attr(o, 'title') ?? '');
    const note = attr(o, '_note') || attr(o, 'note');
    if (note) t.notes = note;
    const url = attr(o, 'url') || attr(o, 'htmlUrl') || attr(o, 'xmlUrl');
    if (url) t.link = { url };
    t.children = elements(o, 'outline').map(conv);
    return t;
  };
  const tops = body ? elements(body, 'outline').map(conv) : [];
  if (!tops.length) throw new Error('The OPML file has no outline');
  return mapFromTopics(tops, title || name);
}

export function exportOpml(map) {
  const out = [];
  const walk = (t, d) => {
    const pad = '  '.repeat(d + 2);
    const a = [`text="${escapeXml(t.text || '')}"`];
    if (t.notes) a.push(`_note="${escapeXml(t.notes)}"`);
    if (t.link && t.link.url) a.push(`url="${escapeXml(t.link.url)}"`);
    const kids = t.children || [];
    if (!kids.length) { out.push(`${pad}<outline ${a.join(' ')}/>`); return; }
    out.push(`${pad}<outline ${a.join(' ')}>`);
    kids.forEach((c) => walk(c, d + 1));
    out.push(`${pad}</outline>`);
  };
  walk(map.root, 0);
  for (const f of map.floating || []) walk(f, 0);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>${escapeXml(mapTitle(map))}</title>\n    <dateModified>${new Date().toUTCString()}</dateModified>\n  </head>\n  <body>\n${out.join('\n')}\n  </body>\n</opml>\n`;
}

// ── Markdown ──

// Headings (#…) and list items (- * + 1.) make topics; other lines are the notes of the topic above.
export function importMarkdown(text, name = '') {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const root = makeTopic('');
  let hasH1 = false;
  const headStack = [{ level: 0, t: root }];
  let listStack = [];   // [{ indent, t }]
  let last = root;
  let inCode = false;
  const notes = new Map();
  const addNote = (t, line) => { const cur = notes.get(t) || []; cur.push(line); notes.set(t, cur); };
  for (const raw of lines) {
    if (/^\s*```/.test(raw)) { inCode = !inCode; addNote(last, raw); continue; }
    if (inCode) { addNote(last, raw); continue; }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(raw);
    if (h) {
      const level = h[1].length;
      const t = makeTopic(h[2].trim());
      if (level === 1 && !hasH1 && headStack.length === 1 && !root.children.length) { root.text = t.text; hasH1 = true; last = root; listStack = []; continue; }
      while (headStack.length > 1 && headStack[headStack.length - 1].level >= level) headStack.pop();
      headStack[headStack.length - 1].t.children.push(t);
      headStack.push({ level, t });
      listStack = [];
      last = t;
      continue;
    }
    const li = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/.exec(raw);
    if (li) {
      const indent = li[1].replace(/\t/g, '    ').length;
      const t = makeTopic(li[3].trim());
      if (li[2]) t.task = { progress: li[2].trim() ? 100 : 0 };
      while (listStack.length && listStack[listStack.length - 1].indent >= indent) listStack.pop();
      const parent = listStack.length ? listStack[listStack.length - 1].t : headStack[headStack.length - 1].t;
      parent.children.push(t);
      listStack.push({ indent, t });
      last = t;
      continue;
    }
    if (!raw.trim()) { if (notes.has(last)) addNote(last, ''); continue; }
    addNote(last, raw.replace(/^\s{2,}/, ''));
  }
  const apply = (t) => {
    const n = notes.get(t);
    if (n) { const s = n.join('\n').trim(); if (s) t.notes = s; }
    t.children.forEach(apply);
  };
  apply(root);
  if (!root.text) root.text = name.replace(/\.[^.]+$/, '') || 'Map';
  return normalizeMap({ ...newMap({}), root });
}

function taskText(task, lang) {
  if (!task) return '';
  const p = [];
  if (task.priority) p.push(markerLabel(`priority-${task.priority}`, lang));
  if (task.progress != null) p.push(`${task.progress}%`);
  if (task.start) p.push(`${lang === 'ko' ? '시작' : 'Start'} ${task.start}`);
  if (task.due) p.push(`${lang === 'ko' ? '마감' : 'Due'} ${task.due}`);
  if (task.effort) p.push(`${task.effort}${lang === 'ko' ? '시간' : 'h'}`);
  if (task.resources) p.push(task.resources);
  return p.join(' · ');
}

export function exportMarkdown(map, { lang = 'ko' } = {}) {
  const out = [];
  const mdText = (t) => {
    const txt = String(t.text || '').replace(/\n/g, ' ');
    return t.link && t.link.url ? `[${txt}](${t.link.url})` : txt;
  };
  const extras = (t, indent) => {
    const bits = [];
    const tt = taskText(t.task, lang);
    if (tt) bits.push(`${indent}*${tt}*`);
    const icons = (t.icons || []).map((i) => markerLabel(i, lang));
    const tags = (t.tags || []).map((g) => `#${g.replace(/\s+/g, '_')}`);
    if (icons.length || tags.length) bits.push(`${indent}${[...icons.map((x) => `[${x}]`), ...tags].join(' ')}`);
    if (t.notes) bits.push(t.notes.split('\n').map((l) => indent + l).join('\n'));
    return bits;
  };
  const walk = (t, d) => {
    if (d <= 3) {
      out.push(`${'#'.repeat(d + 1)} ${mdText(t)}`, '');
      const ex = extras(t, '');
      if (ex.length) out.push(...ex, '');
    } else {
      const ind = '  '.repeat(d - 4);
      out.push(`${ind}- ${mdText(t)}`);
      const ex = extras(t, `${ind}  `);
      if (ex.length) out.push(...ex);
    }
    (t.children || []).forEach((c) => walk(c, d + 1));
    if (d === 4 && !(t.children || []).length) { /* list continues */ }
  };
  walk(map.root, 0);
  for (const f of map.floating || []) walk(f, 1);
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

// ── plain text outline (tabs) ──

export function importTextOutline(text, name = '') {
  const tops = topicsFromText(text);
  if (!tops.length) throw new Error('The text has no lines');
  return mapFromTopics(tops, name.replace(/\.[^.]+$/, ''));
}

export function exportTextOutline(map) {
  const out = [];
  const walk = (t, d) => {
    out.push('\t'.repeat(d) + String(t.text || '').replace(/\n/g, ' '));
    (t.children || []).forEach((c) => walk(c, d + 1));
  };
  walk(map.root, 0);
  for (const f of map.floating || []) walk(f, 0);
  return `${out.join('\n')}\n`;
}

// ── HTML outline page (with the map picture) ──

export function exportHtml(map, { svg = '', lang = 'ko', renderNotes = (s) => `<p>${escapeXml(s).replace(/\n/g, '<br>')}</p>` } = {}) {
  const title = escapeXml(mapTitle(map));
  const item = (t, d) => {
    const kids = t.children || [];
    const tt = taskText(t.task, lang);
    const head = `<span class="t">${escapeXml(t.text || '').replace(/\n/g, '<br>')}</span>${t.link && t.link.url ? ` <a href="${escapeXml(t.link.url)}">↗</a>` : ''}${tt ? ` <span class="task">${escapeXml(tt)}</span>` : ''}${(t.tags || []).map((g) => ` <span class="tag">${escapeXml(g)}</span>`).join('')}`;
    const notes = t.notes ? `<div class="notes">${renderNotes(t.notes)}</div>` : '';
    if (!kids.length) return `<li>${head}${notes}</li>`;
    return `<li><details ${d < 2 ? 'open' : ''}><summary>${head}</summary>${notes}<ul>${kids.map((c) => item(c, d + 1)).join('')}</ul></details></li>`;
  };
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>
body{font-family:-apple-system,'Segoe UI','Noto Sans KR','Malgun Gothic',sans-serif;margin:0;color:#1f2933;background:#f7f8fa}
header{padding:18px 28px;background:#fff;border-bottom:1px solid #e1e5eb}h1{margin:0;font-size:22px}
.map{margin:20px 28px;background:#fff;border:1px solid #e1e5eb;border-radius:10px;overflow:auto;max-height:70vh}.map svg{display:block;max-width:100%;height:auto}
.outline{margin:20px 28px 60px;background:#fff;border:1px solid #e1e5eb;border-radius:10px;padding:14px 18px}
ul{list-style:none;padding-left:22px;margin:4px 0}.outline>ul{padding-left:0}li{margin:3px 0}
summary{cursor:pointer}.t{font-weight:600}.task{color:#6b7785;font-size:12px}.tag{font-size:11px;background:#e7eef8;border-radius:8px;padding:1px 7px;color:#2c4a6e}
.notes{margin:4px 0 6px 18px;padding:6px 10px;border-left:3px solid #9fb3d9;background:#f5f7fb;font-size:14px}.notes p{margin:4px 0}
</style></head><body>
<header><h1>${title}</h1></header>
${svg ? `<div class="map">${svg}</div>` : ''}
<div class="outline"><ul>${item(map.root, 0)}${(map.floating || []).map((f) => item(f, 1)).join('')}</ul></div>
</body></html>
`;
}

// ── CSV (topics with their task fields; opens in Excel with the BOM the writer adds) ──

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function exportCsv(map, { lang = 'ko' } = {}) {
  const head = lang === 'ko'
    ? ['수준', '토픽', '경로', '우선순위', '진행률', '시작일', '마감일', '작업량(시간)', '담당', '태그', '아이콘', '메모']
    : ['Level', 'Topic', 'Path', 'Priority', 'Progress', 'Start', 'Due', 'Effort (h)', 'Resources', 'Tags', 'Icons', 'Notes'];
  const rows = [head];
  const walk = (t, d, path) => {
    const task = t.task || {};
    const p = [...path, firstLine(t.text)];
    rows.push([d, String(t.text || '').replace(/\n/g, ' '), p.join(' > '), task.priority || '', task.progress != null ? `${task.progress}%` : '', task.start || '', task.due || '', task.effort || '', task.resources || '', (t.tags || []).join('; '), (t.icons || []).map((i) => markerLabel(i, lang)).join('; '), String(t.notes || '').replace(/\s*\n\s*/g, ' ')]);
    (t.children || []).forEach((c) => walk(c, d + 1, p));
  };
  walk(map.root, 0, []);
  for (const f of map.floating || []) walk(f, 1, []);
  return `${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
