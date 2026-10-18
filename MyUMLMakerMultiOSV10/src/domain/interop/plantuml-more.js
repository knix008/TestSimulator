// PlantUML text ↔ model for the kinds beyond UML: Gantt charts (@startgantt),
// work breakdown structures (@startwbs), chronologies (@startchronology),
// ArchiMate (@startuml with the archimate sprites or the archimate library
// macros), network diagrams (@startnwdiag), JSON and YAML data (@startjson,
// @startyaml), EBNF grammars (@startebnf), regular expressions (@startregex)
// and Salt wireframes (@startsalt → the wireframe widgets).
//
// importPlantUmlMore(text, options) → { owner, diagram, kind } like
// importPlantUml (the owner is not yet in a project: insertElement(target,
// result.owner) where canContain), or null when the text is none of these.
// exportPlantUmlMore(project, diagram) → text, or null for other diagram types.
// plantuml.js calls both first. Pure (no DOM).
import { addView, createEdgeView, createElement, createNodeView, insertElement, ref, refId, siblingsIn } from '../model.js';
import { ARCHIMATE_LAYERS, ARCHIMATE_RELATIONS, LAYER_OF, archimateInfo, archimateKindOf, archimateMacro } from '../archimate.js';
import { NW_DEVICES } from '../meta.js';
import { dataRows, parseData, splitEbnfRules } from '../datatext.js';
import { formatDate, parseDate, WEEKDAYS } from '../planning.js';
import { createRenderContext, layoutDiagram, nodeBox } from '../../render/notation.js';
import { idMaker, layered } from './mermaid.js';

const fail = (code, detail) => Object.assign(new Error(code), { code, detail });
const unq = (s) => String(s ?? '').trim().replace(/^"(.*)"$/s, '$1');
const q = (s) => `"${String(s ?? '').replace(/"/g, "'").replace(/\r?\n/g, '\\n')}"`;

/** The @start…/@end… blocks of a text: [{ tag, lines }] (the whole text is one 'uml' block without markers). */
function blocksOf(text) {
  const source = String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const out = [];
  const re = /^[ \t]*@start(\w+)[^\n]*\n([\s\S]*?)^[ \t]*@end\1\b[^\n]*$/gim;
  for (let m = re.exec(source); m; m = re.exec(source)) out.push({ tag: m[1].toLowerCase(), body: m[2] });
  if (!out.length && source.trim() && !/@start/i.test(source)) out.push({ tag: 'uml', body: source });
  return out;
}
/** Lines of a block without comments and blank lines (block comments /' … '/ too). */
const linesOf = (body) => String(body).replace(/\/'[\s\S]*?'\//g, '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith("'"));
/** "title X" of a block (and the lines without it). */
function takeTitle(lines) {
  const at = lines.findIndex((l) => /^title\s+/i.test(l));
  if (at < 0) return { title: '', lines };
  return { title: unq(lines[at].replace(/^title\s+/i, '')), lines: lines.filter((_, i) => i !== at) };
}
/** Drops <style> … </style> and skinparam blocks. */
const withoutStyles = (body) => String(body).replace(/<style>[\s\S]*?<\/style>/gi, '').replace(/^\s*skinparam\b[^\n{]*\{[\s\S]*?^\s*\}\s*$/gim, '');

/** Builds elements and views under one owner. */
function builder(ownerType, diagramType, name, language) {
  const owner = createElement(ownerType, { name: name || 'Imported' }, { language });
  const diagram = insertElement(owner, createElement(diagramType, { name: name || 'Imported', ownedViews: [] }, { language }));
  const add = (type, attrs = {}, parent = owner) => insertElement(parent, createElement(type, attrs, { language, siblings: siblingsIn(parent, type) }));
  const show = (element, x, y, w = 0, h = 0, extra = {}) => addView(diagram, createNodeView(`${element._type}View`, element._id, { x, y, w, h }, extra));
  const link = (type, from, to, attrs = {}, tailView, headView, extra = {}) => {
    const element = add(type, { ...attrs, source: ref(from), target: ref(to) });
    return { element, view: addView(diagram, createEdgeView(`${type}View`, element._id, tailView._id, headView._id, extra)) };
  };
  return { owner, diagram, add, show, link };
}

/** Boxes of a diagram's views as drawn. */
function drawnBoxes(project, diagram) {
  const ctx = layoutDiagram(createRenderContext({ project, diagram, language: 'en' }));
  const boxes = new Map();
  for (const view of diagram.ownedViews ?? []) if (!(view.tail || view.head)) boxes.set(view._id, nodeBox(ctx, view));
  return { ctx, boxes };
}
const insideBox = (a, b) => a && b && a !== b && a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;

// ───────────────────────── Gantt

const DATE_RE = String.raw`(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})`;
const iso = (text) => { const d = parseDate(text); return d === null ? '' : formatDate(d); };
const taskName = (s) => String(s ?? '').replace(/[[\]]/g, '').trim();

function importGantt(body, { language, name }) {
  const { title, lines } = takeTitle(linesOf(withoutStyles(body)));
  const rows = []; // { kind: 'task'|'milestone'|'separator', key, name, … }
  const byKey = new Map();
  const alias = new Map();
  const closedDays = new Set(); const closedDates = [];
  let start = '';
  const deps = [];
  const item = (raw, kind = 'task') => {
    const label = taskName(raw);
    const key = alias.get(label) ?? label;
    if (!byKey.has(key)) { const row = { kind, key, name: label, start: '', end: '', duration: 0, completion: 0, resources: [], color: '' }; byKey.set(key, row); rows.push(row); }
    const row = byKey.get(key);
    if (kind === 'milestone') row.kind = 'milestone';
    return row;
  };
  for (const line of lines) {
    let m;
    if (/^(printscale|projectscale|language|hide|show|scale|skinparam|!|<style|today|footer|header|legend|caption|ganttscale|zoom|labels|separator|weeks|days)/i.test(line) && !/^-- /.test(line)) continue;
    if ((m = new RegExp(String.raw`^project\s+starts\s+(?:on\s+|at\s+|the\s+)?${DATE_RE}`, 'i').exec(line))) { start = iso(m[1]); continue; }
    if ((m = /^((?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?(?:\s*(?:,|and)\s*)?)+)\s+(?:are|is)\s+closed$/i.exec(line))) { for (const w of m[1].toLowerCase().match(/[a-z]+/g)) if (WEEKDAYS.includes(w.replace(/s$/, ''))) closedDays.add(w.replace(/s$/, '')); continue; }
    if ((m = new RegExp(String.raw`^${DATE_RE}(?:\s+to\s+${DATE_RE})?\s+(?:are|is)\s+closed$`, 'i').exec(line))) { closedDates.push(m[2] ? `${iso(m[1])} to ${iso(m[2])}` : iso(m[1])); continue; }
    if ((m = /^--\s*(.*?)\s*--$/.exec(line))) { rows.push({ kind: 'separator', key: `#${rows.length}`, name: m[1] }); continue; }
    if ((m = /^(\[[^\]]+\](?:\s*->\s*\[[^\]]+\])+)$/.exec(line))) {
      const chain = [...m[1].matchAll(/\[([^\]]+)\]/g)].map((x) => item(x[1]).key);
      for (let i = 1; i < chain.length; i += 1) deps.push([chain[i - 1], chain[i]]);
      continue;
    }
    if (!(m = /^\[([^\]]+)\](?:\s+as\s+\[([^\]]+)\])?\s*(.*)$/.exec(line))) continue;
    const [, rawName, rawAlias, restAll] = m;
    const milestone = /^happens\b/i.test(restAll.trim());
    const row = item(rawName, milestone ? 'milestone' : 'task');
    if (rawAlias) alias.set(taskName(rawAlias), row.key);
    for (const phrase of restAll.split(/\s+and\s+/i).map((s) => s.trim()).filter(Boolean)) {
      let p;
      if ((p = /^(?:lasts|requires)\s+(\d+)\s*(day|days|week|weeks)?/i.exec(phrase))) row.duration = Number(p[1]) * (/week/i.test(p[2] ?? '') ? (closedDays.size >= 2 ? 5 : 7) : 1);
      else if ((p = new RegExp(String.raw`^(?:starts|happens)\s+(?:on\s+|at\s+)?(?:the\s+)?${DATE_RE}`, 'i').exec(phrase))) row.start = iso(p[1]);
      else if ((p = /^(?:starts|happens)\s+(?:at|after|on)?\s*\[([^\]]+)\]'s\s+end/i.exec(phrase))) deps.push([item(p[1]).key, row.key]);
      else if ((p = /^(?:starts|happens)\s+(?:at|on)?\s*\[([^\]]+)\]'s\s+start/i.exec(phrase))) row.startWith = item(p[1]).key;
      else if ((p = new RegExp(String.raw`^ends\s+(?:on\s+|at\s+)?${DATE_RE}`, 'i').exec(phrase))) row.end = iso(p[1]);
      else if ((p = /^is\s+(\d+)\s*%\s*complete/i.exec(phrase))) row.completion = Math.min(100, Number(p[1]));
      else if ((p = /^on\s+(.*)$/i.exec(phrase))) row.resources.push(...[...p[1].matchAll(/\{([^}]+)\}/g)].map((x) => x[1].trim()));
      else if ((p = /^is\s+colou?red\s+in\s+([#\w]+)/i.exec(phrase))) row.color = /^#?[0-9a-f]{6}$/i.test(p[1]) ? `#${p[1].replace('#', '')}` : p[1].toLowerCase();
      else if ((p = /^displays\s+on\s+same\s+row/i.exec(phrase))) { /* one row each here */ }
    }
  }
  if (!rows.length) throw fail('interop.empty', 'gantt');
  const b = builder('PMPlan', 'GanttDiagram', title || name || 'Gantt', language);
  b.owner.start = start;
  const calendar = b.add('GanttCalendar', { name: title || (language === 'ko' ? '일정' : 'Schedule'), start, closedDays: [...closedDays].join(','), closedDates: closedDates.join(', '), dayWidth: 18 });
  b.show(calendar, 20, 20);
  const views = new Map(); const elements = new Map();
  rows.forEach((row, i) => {
    const y = 64 + i * 28;
    let el;
    if (row.kind === 'separator') el = b.add('GanttSeparator', { name: row.name });
    else if (row.kind === 'milestone') el = b.add('GanttMilestone', { name: row.name, date: row.start });
    else el = b.add('GanttTask', { name: row.name, start: row.start, end: row.end, duration: row.duration || (row.end ? 0 : 1), completion: row.completion, resources: row.resources.join(', ') });
    const view = b.show(el, 230, y, 0, 0, row.color ? { fillColor: row.color } : {});
    views.set(row.key, view); elements.set(row.key, el);
  });
  // "starts at [X]'s start": the same start date when X has one.
  for (const row of rows) if (row.startWith && !row.start) { const other = elements.get(row.startWith); if (other?.start) elements.get(row.key).start = other.start; }
  const seen = new Set();
  for (const [a, z] of deps) {
    const k = `${a}>${z}`;
    if (a === z || seen.has(k) || !elements.has(a) || !elements.has(z)) continue;
    seen.add(k);
    b.link('GanttDependency', elements.get(a), elements.get(z), {}, views.get(a), views.get(z));
  }
  return { owner: b.owner, diagram: b.diagram, kind: 'gantt' };
}

function exportGantt(project, diagram) {
  const { ctx } = drawnBoxes(project, diagram);
  const index = ctx.index;
  const views = (diagram.ownedViews ?? []).filter((v) => !(v.tail || v.head) && v.model).sort((a, b) => (a.top ?? 0) - (b.top ?? 0));
  const cal = views.map((v) => index.get(v.model)).find((e) => e?._type === 'GanttCalendar');
  const out = ['@startgantt'];
  // The name an untitled chart got on import is not written back as a title (it would rename the calendar).
  if (diagram.name && diagram.name !== 'Gantt') out.push(`title ${diagram.name}`);
  const start = cal?.start || index.parent(diagram._id)?.start || '';
  if (start) out.push(`Project starts ${iso(start) || start}`);
  for (const day of String(cal?.closedDays ?? '').split(/[\s,;]+/).filter(Boolean)) out.push(`${day.toLowerCase()} are closed`);
  for (const part of String(cal?.closedDates ?? '').split(/[,;]+/).map((s) => s.trim()).filter(Boolean)) out.push(`${part} is closed`);
  const preds = new Map();
  for (const v of diagram.ownedViews ?? []) {
    const el = (v.tail || v.head) && v.model ? index.get(v.model) : null;
    if (el?._type !== 'GanttDependency') continue;
    const [a, z] = [index.get(refId(el.source)), index.get(refId(el.target))];
    if (a && z) { if (!preds.has(z._id)) preds.set(z._id, []); preds.get(z._id).push(a); }
  }
  const nameOf = (el) => `[${taskName(el.name) || el._type.replace(/^Gantt/, '')}]`;
  const done = new Set();
  for (const v of views) {
    const el = index.get(v.model);
    if (!el || done.has(el._id)) continue;
    done.add(el._id);
    if (el._type === 'GanttSeparator') { out.push(`-- ${el.name ?? ''} --`); continue; }
    if (el._type !== 'GanttTask' && el._type !== 'GanttMilestone') continue;
    const before = preds.get(el._id) ?? [];
    const name = nameOf(el);
    if (el._type === 'GanttMilestone') {
      if (el.date) out.push(`${name} happens ${iso(el.date) || el.date}`);
      else if (before.length) out.push(`${name} happens at ${nameOf(before[0])}'s end`);
      else out.push(`${name} happens at ${nameOf(el)}'s end`.replace(/ happens at .*$/, ` happens ${start || '2026-01-05'}`));
      for (const p of before.slice(el.date ? 0 : 1)) out.push(`${nameOf(p)} -> ${name}`);
      continue;
    }
    if (Number(el.duration) > 0) out.push(`${name} lasts ${Math.round(el.duration)} days`);
    else if (!el.end) out.push(`${name} lasts 1 days`);
    if (el.start) out.push(`${name} starts ${iso(el.start) || el.start}`);
    else if (before.length) out.push(`${name} starts at ${nameOf(before[0])}'s end`);
    for (const p of before.slice(el.start ? 0 : 1)) out.push(`${nameOf(p)} -> ${name}`);
    if (el.end && !(Number(el.duration) > 0)) out.push(`${name} ends ${iso(el.end) || el.end}`);
    if (Number(el.completion) > 0) out.push(`${name} is ${Math.round(el.completion)}% completed`);
    const resources = String(el.resources ?? '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    if (resources.length) out.push(`${name} on ${resources.map((r) => `{${r}}`).join(' ')}`);
    if (v.fillColor) out.push(`${name} is colored in ${String(v.fillColor).replace(/^#/, '#')}`);
  }
  out.push('@endgantt');
  return `${out.join('\n')}\n`;
}

// ───────────────────────── WBS

function importWbs(body, { language, name }) {
  const raw = withoutStyles(body).split('\n');
  const { title } = takeTitle(linesOf(body));
  const items = []; // { depth, text, side }
  for (let i = 0; i < raw.length; i += 1) {
    const line = raw[i].trim();
    const m = /^([*+-]+)(_)?([<>])?(?:\[[^\]]*\])?\s*(.*)$/.exec(line);
    if (!m || /^-{2,}\s*$/.test(line) || (/^-/.test(m[1]) && !/^-+[<>_[\s]/.test(line) && !/^-+$/.test(m[1]))) continue;
    if (/^title\b/i.test(line)) continue;
    let textValue = m[4];
    if (textValue.startsWith(':')) {
      // Multi-line ":text … ;"
      const parts = [textValue.slice(1)];
      while (!parts.at(-1).trimEnd().endsWith(';') && i + 1 < raw.length) parts.push(raw[++i].trim());
      textValue = parts.join('\n').replace(/;\s*$/, '');
    }
    const marker = m[1][0];
    const side = m[3] === '<' || marker === '-' ? 'left' : m[3] === '>' || marker === '+' ? 'right' : 'auto';
    items.push({ depth: m[1].length, text: textValue.trim(), side });
  }
  if (!items.length) throw fail('interop.empty', 'wbs');
  const b = builder('PMPlan', 'WBSDiagram', title || name || items[0].text, language);
  const stack = [];
  const nodes = [];
  for (const it of items) {
    while (stack.length && stack.at(-1).depth >= it.depth) stack.pop();
    const parent = stack.at(-1)?.element ?? b.owner;
    const code = /^(\d+(?:\.\d+)*)\.?\s+(.+)$/s.exec(it.text);
    const element = b.add('WBSNode', { name: code ? code[2] : it.text, code: code ? code[1] : '', side: it.side }, parent);
    const node = { depth: it.depth, element, parent: stack.at(-1) ?? null, children: [] };
    if (node.parent) node.parent.children.push(node);
    nodes.push(node);
    stack.push(node);
  }
  layoutWbs(b, nodes.filter((n) => !n.parent));
  return { owner: b.owner, diagram: b.diagram, kind: 'wbs' };
}
/** Root on top, first-level items in a row, the rest listed below their first-level item. */
function layoutWbs(b, roots) {
  const colW = 230; const levelW = 160; const leafW = 150;
  let x0 = 20;
  for (const root of roots) {
    const cols = Math.max(1, root.children.length);
    const width = cols * colW;
    const rootView = b.show(root.element, x0 + width / 2 - 100 - (colW - levelW) / 2, 20, 200, 40);
    const rootCX = x0 + width / 2 - (colW - levelW) / 2;
    root.children.forEach((child, i) => {
      const x = x0 + i * colW;
      const view = b.show(child.element, x, 110, levelW, 34);
      addView(b.diagram, createEdgeView('WBSEdgeView', null, rootView._id, view._id, { points: [{ x: rootCX, y: 85 }, { x: x + levelW / 2, y: 85 }] }));
      let row = 0;
      const walk = (parentNode, parentView, px, depth) => {
        for (const kid of parentNode.children) {
          const y = 175 + row * 48; row += 1;
          // Listed under their parent (the side PlantUML puts them on is kept in `side`).
          const kx = px + 26;
          const kview = b.show(kid.element, kx, y, leafW, 30);
          const railX = px + 12;
          addView(b.diagram, createEdgeView('WBSEdgeView', null, parentView._id, kview._id, { points: [{ x: railX, y: y + 15 }] }));
          walk(kid, kview, kx, depth + 1);
        }
      };
      walk(child, view, x, 2);
    });
    x0 += width + 40;
  }
}

function exportWbs(project, diagram) {
  const { ctx } = drawnBoxes(project, diagram);
  const index = ctx.index;
  const shown = new Set((diagram.ownedViews ?? []).filter((v) => v.model).map((v) => refId(v.model)));
  const roots = [...shown].map((id) => index.get(id)).filter((e) => e?._type === 'WBSNode' && index.parent(e._id)?._type !== 'WBSNode');
  const blocks = roots.map((root, r) => {
    const out = ['@startwbs'];
    if (r === 0 && diagram.name) out.push(`title ${diagram.name}`);
    const emit = (el, depth) => {
      const side = el.side === 'left' ? '<' : el.side === 'right' && depth > 1 ? '>' : '';
      const label = `${el.code ? `${el.code} ` : ''}${el.name ?? ''}`;
      out.push(label.includes('\n') ? `${'*'.repeat(depth)}${side}:${label};` : `${'*'.repeat(depth)}${side} ${label}`);
      for (const kid of (el.ownedElements ?? []).filter((k) => k._type === 'WBSNode')) emit(kid, depth + 1);
    };
    emit(root, 1);
    out.push('@endwbs');
    return out.join('\n');
  });
  return blocks.length ? `${blocks.join('\n\n')}\n` : '@startwbs\n* (empty)\n@endwbs\n';
}

// ───────────────────────── chronology (timeline)

function importChronology(body, { language, name }) {
  const { title, lines } = takeTitle(linesOf(withoutStyles(body)));
  const rows = []; const byName = new Map(); const links = [];
  let start = ''; let end = '';
  const row = (raw) => { const label = taskName(raw); if (!byName.has(label)) { const r = { name: label, date: '', start: '', end: '' }; byName.set(label, r); rows.push(r); } return byName.get(label); };
  for (const line of lines) {
    let m;
    if ((m = new RegExp(String.raw`^project\s+starts\s+(?:on\s+|at\s+)?${DATE_RE}`, 'i').exec(line))) { start = iso(m[1]); continue; }
    if ((m = new RegExp(String.raw`^project\s+ends\s+(?:on\s+|at\s+)?${DATE_RE}`, 'i').exec(line))) { end = iso(m[1]); continue; }
    if ((m = /^(\[[^\]]+\](?:\s*->\s*\[[^\]]+\])+)$/.exec(line))) { const chain = [...m[1].matchAll(/\[([^\]]+)\]/g)].map((x) => row(x[1])); for (let i = 1; i < chain.length; i += 1) links.push([chain[i - 1], chain[i]]); continue; }
    if (!(m = /^\[([^\]]+)\]\s*(.*)$/.exec(line))) continue;
    const r = row(m[1]);
    const rest = m[2];
    const dates = [...rest.matchAll(new RegExp(DATE_RE, 'g'))].map((x) => iso(x[1]));
    if (/^(happens|occurs|is)\b/i.test(rest) && dates.length === 1 && !/\b(ends?|to|until)\b/i.test(rest)) r.date = dates[0];
    else if (dates.length >= 2) { r.start = dates[0]; r.end = dates[1]; } else if (/^starts\b/i.test(rest) && dates.length) r.start = dates[0];
    else if (/^ends\b/i.test(rest) && dates.length) r.end = dates[0];
    else if (dates.length) r.date = dates[0];
  }
  if (!rows.length) throw fail('interop.empty', 'chronology');
  const b = builder('PMPlan', 'TimelineDiagram', title || name || 'Timeline', language);
  b.show(b.add('TLTimeline', { name: title, start, end, dayWidth: 3 }), 20, 40);
  const views = new Map();
  rows.forEach((r, i) => {
    const period = !r.date && (r.start || r.end);
    const el = period ? b.add('TLPeriod', { name: r.name, start: r.start || r.end, end: r.end || r.start }) : b.add('TLEvent', { name: r.name, date: r.date });
    views.set(r, { el, view: b.show(el, 20, 84 + i * 34) });
  });
  for (const [a, z] of links) if (a !== z) b.link('TLLink', views.get(a).el, views.get(z).el, {}, views.get(a).view, views.get(z).view);
  return { owner: b.owner, diagram: b.diagram, kind: 'chronology' };
}

function exportChronology(project, diagram) {
  const { ctx } = drawnBoxes(project, diagram);
  const index = ctx.index;
  const out = ['@startchronology'];
  if (diagram.name && diagram.name !== 'Timeline') out.push(`title ${diagram.name}`);
  const views = (diagram.ownedViews ?? []).filter((v) => v.model && !(v.tail || v.head)).sort((a, b) => (a.top ?? 0) - (b.top ?? 0));
  const axis = views.map((v) => index.get(v.model)).find((e) => e?._type === 'TLTimeline');
  if (axis?.start) out.push(`Project starts ${axis.start}`);
  if (axis?.end) out.push(`Project ends ${axis.end}`);
  const label = (el) => `[${taskName(el.name) || 'item'}]`;
  for (const v of views) {
    const el = index.get(v.model);
    if (el?._type === 'TLEvent') out.push(`${label(el)} happens on ${el.date || axis?.start || '2026-01-01'}`);
    if (el?._type === 'TLPeriod') out.push(`${label(el)} starts ${el.start || el.end} and ends ${el.end || el.start}`);
  }
  for (const v of diagram.ownedViews ?? []) {
    const el = (v.tail || v.head) && v.model ? index.get(v.model) : null;
    if (el?._type === 'TLLink') { const a = index.get(refId(el.source)); const z = index.get(refId(el.target)); if (a && z) out.push(`${label(a)} -> ${label(z)}`); }
  }
  out.push('@endchronology');
  return `${out.join('\n')}\n`;
}

// ───────────────────────── ArchiMate

const REL_BY_NAME = new Map(ARCHIMATE_RELATIONS.map(([type, , , rel]) => [rel.toLowerCase(), type]));
const looksArchimate = (body) => /^\s*archimate\s/im.test(body) || /<archimate\//i.test(body) || /^\s*(Business|Application|Technology|Physical|Motivation|Strategy|Implementation|Other)_\w+\s*\(/m.test(body) || /^\s*Rel_(Composition|Aggregation|Assignment|Realization|Serving|Access|Influence|Triggering|Flow|Specialization|Association)\w*\s*\(/m.test(body); // not C4's Rel_D / Rel_U …

function importArchimate(body, { language, name }) {
  const { title, lines } = takeTitle(linesOf(withoutStyles(body)));
  const elements = new Map(); // alias → { kind | grouping | junction, label, group }
  const order = [];
  const rels = [];
  const stack = [];
  const element = (alias, data) => { if (!elements.has(alias)) { elements.set(alias, { alias, ...data, group: stack.at(-1) ?? null }); order.push(alias); } else Object.assign(elements.get(alias), data); return elements.get(alias); };
  for (const line of lines) {
    let m;
    if (/^(!|skinparam|hide|show|left to right|top to bottom|scale|sprite|legend|endlegend|footer|header)/i.test(line)) continue;
    if (line === '}') { stack.pop(); continue; }
    // archimate #Business "Customer" as c <<business-actor>>
    if ((m = /^archimate\s+(?:(#[\w-]+)\s+)?("[^"]*"|[^\s<]+)(?:\s+as\s+(\S+))?\s*(?:<<\s*([^>]+?)\s*>>)?(?:\s+as\s+(\S+))?\s*(\{)?$/i.exec(line))) {
      const [, color, label, alias1, sprite, alias2, brace] = m;
      const alias = alias1 ?? alias2 ?? unq(label);
      const layer = color ? ARCHIMATE_LAYERS.find(([, , , , keyword]) => keyword.toLowerCase() === color.slice(1).toLowerCase())?.[0] : null;
      const kind = (sprite && archimateKindOf(sprite)) || archimateKindOf(`${layer ?? 'business'}-${sprite ?? ''}`) || (layer === 'other' ? 'other-location' : `${layer ?? 'business'}-${{ business: 'actor', application: 'component', technology: 'node', physical: 'equipment', motivation: 'goal', strategy: 'capability', implementation: 'work-package' }[layer ?? 'business']}`);
      if (sprite && /^grouping$/i.test(sprite)) element(alias, { grouping: true, label: unq(label) }); else element(alias, { kind, label: unq(label) });
      if (brace) stack.push(alias);
      continue;
    }
    // Grouping(alias, "label") {   Group(alias, "label") {
    if ((m = /^(?:Grouping|Group|Boundary)\s*\(\s*(\w+)\s*(?:,\s*"([^"]*)")?[^)]*\)\s*(\{)?$/i.exec(line))) { element(m[1], { grouping: true, label: m[2] ?? m[1] }); if (m[3]) stack.push(m[1]); continue; }
    if ((m = /^Junction_(And|Or)\s*\(\s*(\w+)\s*(?:,\s*"([^"]*)")?[^)]*\)$/i.exec(line))) { element(m[2], { junction: m[1].toLowerCase(), label: m[3] ?? '' }); continue; }
    // Business_Actor(alias, "label"[, "description"])
    if ((m = /^((?:Business|Application|Technology|Physical|Motivation|Strategy|Implementation|Other)_\w+)\s*\(\s*(\w+)\s*(?:,\s*"([^"]*)")?[^)]*\)\s*(\{)?$/.exec(line))) {
      const kind = archimateKindOf(m[1]);
      if (kind) { element(m[2], { kind, label: m[3] ?? m[2] }); if (m[4]) stack.push(m[2]); }
      continue;
    }
    // rectangle "Business" <<grouping>> as g {   package "X" {
    if ((m = /^(?:rectangle|package|folder|frame|node)\s+("[^"]*"|\S+)(?:\s+as\s+(\w+))?(?:\s+<<[^>]*>>)?(?:\s+as\s+(\w+))?\s*\{$/i.exec(line))) { const alias = m[2] ?? m[3] ?? `group${order.length}`; element(alias, { grouping: true, label: unq(m[1]) }); stack.push(alias); continue; }
    // Rel_Serving(a, b, "label")  Rel_Access_rw_Up(a, b)
    if ((m = /^Rel_([A-Za-z]+)((?:_[A-Za-z]+)*)\s*\(\s*(\w+)\s*,\s*(\w+)\s*(?:,\s*"([^"]*)")?[^)]*\)$/.exec(line))) {
      const type = REL_BY_NAME.get(m[1].toLowerCase());
      if (!type) continue;
      const flags = m[2].toLowerCase().split('_').filter(Boolean);
      const attrs = {};
      if (type === 'ArchiMateAccess') attrs.accessType = flags.includes('rw') ? 'readwrite' : flags.includes('r') ? 'read' : flags.includes('w') ? 'write' : 'access';
      let label = m[5] ?? '';
      if (type === 'ArchiMateInfluence') { const s = /^([+-]+|\+\/-)\s*(.*)$/.exec(label); if (s) { attrs.strength = s[1]; label = s[2]; } }
      rels.push({ type, from: m[3], to: m[4], name: label, attrs });
      continue;
    }
    // Plain arrows between aliases.
    if ((m = /^(\w+)\s+([-.<>|*o]+(?:\[[^\]]*\])?(?:up|down|left|right)?[-.<>|*o]*)\s+(\w+)\s*(?::\s*(.*))?$/.exec(line)) && elements.has(m[1]) && elements.has(m[3])) {
      const arrow = m[2].replace(/\[[^\]]*\]|up|down|left|right/g, '');
      let type = 'ArchiMateAssociation'; let [from, to] = [m[1], m[3]]; const attrs = {};
      if (/\|>$/.test(arrow)) type = arrow.includes('.') ? 'ArchiMateRealization' : 'ArchiMateSpecialization';
      else if (/^<\|/.test(arrow)) { type = arrow.includes('.') ? 'ArchiMateRealization' : 'ArchiMateSpecialization'; [from, to] = [to, from]; } else if (/^\*/.test(arrow)) type = 'ArchiMateComposition';
      else if (/^o/.test(arrow)) type = 'ArchiMateAggregation';
      else if (/>$/.test(arrow)) { if (arrow.includes('.')) { type = 'ArchiMateAccess'; attrs.accessType = 'write'; } else attrs.isDirected = true; } else if (/^</.test(arrow)) { [from, to] = [to, from]; attrs.isDirected = true; }
      rels.push({ type, from, to, name: unq(m[4] ?? ''), attrs });
    }
  }
  if (!elements.size) throw fail('interop.empty', 'archimate');
  const b = builder('ArchiMateModel', 'ArchiMateDiagram', title || name || 'ArchiMate', language);
  const created = new Map();
  for (const alias of order) {
    const e = elements.get(alias);
    if (e.grouping) created.set(alias, b.add('ArchiMateGrouping', { name: e.label }));
    else if (e.junction) created.set(alias, b.add('ArchiMateJunction', { name: e.label, junctionType: e.junction }));
    else created.set(alias, b.add('ArchiMateElement', { name: e.label, kind: e.kind }));
  }
  // Layout in layers, as ArchiMate views are read: motivation and strategy on top, then business,
  // application and technology; within a layer the served element above its server, the realized
  // above its realizer, the whole above its parts. Groupings go around their members.
  const LAYER_ROW = ['motivation', 'strategy', 'implementation', 'business', 'application', 'technology', 'physical', 'other'];
  const groups = order.filter((a) => elements.get(a).grouping);
  const groupOf = (alias) => elements.get(alias).group;
  const layerRank = (alias) => { const e = elements.get(alias); return LAYER_ROW.indexOf(e.junction ? 'other' : archimateInfo(e.kind).layer); };
  const placed = order.filter((a) => !elements.get(a).grouping);
  const UP = new Set(['ArchiMateServing', 'ArchiMateRealization', 'ArchiMateSpecialization']);
  const DOWN = new Set(['ArchiMateComposition', 'ArchiMateAggregation', 'ArchiMateAssignment', 'ArchiMateAccess', 'ArchiMateInfluence']);
  const order2 = [];
  for (const r of rels) {
    if (!elements.has(r.from) || !elements.has(r.to) || elements.get(r.from).grouping || elements.get(r.to).grouping) continue;
    const [la, lz] = [layerRank(r.from), layerRank(r.to)];
    if (la !== lz) order2.push(la < lz ? [r.from, r.to] : [r.to, r.from]);
    else if (UP.has(r.type)) order2.push([r.to, r.from]);
    else if (DOWN.has(r.type)) order2.push([r.from, r.to]);
  }
  // Layers keep their order: a chain through each layer's elements pushes the next layer down.
  const ranks = [...new Set(placed.map(layerRank))].sort((a, b) => a - b);
  for (let i = 1; i < ranks.length; i += 1) {
    for (const lower of placed.filter((a) => layerRank(a) === ranks[i])) {
      if (!order2.some(([x, z]) => z === lower && layerRank(x) < ranks[i])) { const upper = placed.find((a) => layerRank(a) === ranks[i - 1]); if (upper) order2.push([upper, lower]); }
    }
  }
  const sizeOf = (alias) => (elements.get(alias).junction ? { w: 14, h: 14 } : { w: 150, h: 60 });
  const layout = layered(placed.map((alias) => ({ id: alias, ...sizeOf(alias) })), order2, { gapX: 40, gapY: 50, wrap: 6 });
  const boxes = new Map();
  for (const alias of placed) { const p = layout.get(alias); boxes.set(alias, { x: 40 + p.x, y: 50 + p.y, ...sizeOf(alias) }); }
  let y = 50 + (layout.extent?.h ?? 0) + 60;
  // Groupings: the box around their members (inner groupings first).
  const depth = (alias) => { let d = 0; for (let g = groupOf(alias); g; g = groupOf(g)) d += 1; return d; };
  for (const g of [...groups].sort((a, b) => depth(b) - depth(a))) {
    const members = order.filter((a) => groupOf(a) === g && boxes.has(a)).map((a) => boxes.get(a));
    if (!members.length) { boxes.set(g, { x: 40, y, w: 240, h: 120 }); y += 150; continue; }
    const x0 = Math.min(...members.map((m) => m.x)) - 16; const y0 = Math.min(...members.map((m) => m.y)) - 36;
    const x1 = Math.max(...members.map((m) => m.x + m.w)) + 16; const y1 = Math.max(...members.map((m) => m.y + m.h)) + 14;
    boxes.set(g, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  const views = new Map();
  for (const g of [...groups].sort((a, b) => depth(a) - depth(b))) { const bx = boxes.get(g); views.set(g, b.show(created.get(g), bx.x, bx.y, bx.w, bx.h)); }
  for (const alias of order) {
    if (views.has(alias)) continue;
    const bx = boxes.get(alias);
    views.set(alias, b.show(created.get(alias), bx.x, bx.y, elements.get(alias).junction ? 0 : bx.w, elements.get(alias).junction ? 0 : bx.h));
  }
  for (const r of rels) {
    if (!created.has(r.from) || !created.has(r.to)) continue;
    b.link(r.type, created.get(r.from), created.get(r.to), { name: r.name, ...r.attrs }, views.get(r.from), views.get(r.to));
  }
  return { owner: b.owner, diagram: b.diagram, kind: 'archimate' };
}

function exportArchimate(project, diagram) {
  const { ctx, boxes } = drawnBoxes(project, diagram);
  const index = ctx.index;
  const id = idMaker(['as', 'archimate', 'title']);
  const nodes = (diagram.ownedViews ?? []).filter((v) => v.model && !(v.tail || v.head)).map((v) => ({ view: v, el: index.get(v.model), box: boxes.get(v._id) })).filter((x) => x.el);
  const groups = nodes.filter((x) => x.el._type === 'ArchiMateGrouping');
  // Each view in its smallest enclosing grouping.
  const parentOf = new Map();
  for (const x of nodes) {
    const holders = groups.filter((g) => g !== x && insideBox(x.box, g.box)).sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h);
    if (holders.length) parentOf.set(x, holders[0]);
  }
  const out = ['@startuml', '!include <archimate/Archimate>'];
  if (diagram.name) out.push(`title ${diagram.name}`);
  const written = new Set();
  const emit = (holder, indent) => {
    for (const x of nodes.filter((n) => (parentOf.get(n) ?? null) === holder)) {
      if (written.has(x.el._id)) continue;
      written.add(x.el._id);
      const alias = id(x.el._id, x.el.name || x.el._type);
      if (x.el._type === 'ArchiMateGrouping') { out.push(`${indent}Grouping(${alias}, ${q(x.el.name)}) {`); emit(x, `${indent}  `); out.push(`${indent}}`); } else if (x.el._type === 'ArchiMateJunction') out.push(`${indent}Junction_${x.el.junctionType === 'or' ? 'Or' : 'And'}(${alias}, ${q(x.el.name ?? '')})`);
      else out.push(`${indent}${archimateMacro(x.el.kind)}(${alias}, ${q(x.el.name)})`);
    }
  };
  emit(null, '');
  for (const v of diagram.ownedViews ?? []) {
    const el = (v.tail || v.head) && v.model ? index.get(v.model) : null;
    const rel = ARCHIMATE_RELATIONS.find(([type]) => type === el?._type);
    if (!rel) continue;
    const a = index.get(refId(el.source)); const z = index.get(refId(el.target));
    if (!a || !z || !written.has(a._id) || !written.has(z._id)) continue;
    let macro = `Rel_${rel[3]}`;
    if (el._type === 'ArchiMateAccess') macro += { read: '_r', write: '_w', readwrite: '_rw' }[el.accessType] ?? '';
    const label = el._type === 'ArchiMateInfluence' ? [el.strength, el.name].filter(Boolean).join(' ') : el.name;
    out.push(`${macro}(${id(a._id, a.name)}, ${id(z._id, z.name)}${label ? `, ${q(label)}` : ''})`);
  }
  out.push('@enduml');
  return `${out.join('\n')}\n`;
}

// ───────────────────────── network (nwdiag)

/** key = "value", key = value, … → { key: value }. */
function nwAttrs(text) {
  const out = {};
  for (const m of String(text ?? '').matchAll(/(\w+)\s*=\s*("[^"]*"|[^,\]]+)/g)) out[m[1].toLowerCase()] = unq(m[2].trim());
  return out;
}
const DEVICE_OF = { database: 'database', db: 'database', cloud: 'cloud', storage: 'storage', queue: 'queue', collections: 'storage', router: 'router', switch: 'switch', firewall: 'firewall', pc: 'pc', laptop: 'laptop', mobile: 'mobile', printer: 'printer', node: 'server', box: 'server', server: 'server', actor: 'pc', person: 'pc', agent: 'server', component: 'server', file: 'storage', folder: 'storage', frame: 'server', rectangle: 'server', stack: 'storage' };

function importNwdiag(body, { language, name }) {
  const { title } = takeTitle(linesOf(body));
  const text = withoutStyles(body).replace(/\/\/[^\n]*/g, '').replace(/^\s*'.*$/gm, '').replace(/^\s*title\b.*$/gim, '');
  const inner = /nwdiag\s*\{([\s\S]*)\}\s*$/.exec(text.trim())?.[1] ?? text;
  // Statements: split at ; and newlines, keeping { and } as their own tokens.
  const tokens = inner.replace(/\{/g, '{\n').replace(/\}/g, '\n}\n').split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
  const nodes = new Map(); const nodeOrder = [];
  const networks = []; const groups = []; const peers = [];
  const node = (raw) => { const key = unq(raw); if (!nodes.has(key)) { nodes.set(key, { name: key, attrs: {}, nets: [] }); nodeOrder.push(key); } return nodes.get(key); };
  const stack = [];
  for (const token of tokens) {
    let m;
    if (token === '}') { stack.pop(); continue; }
    if ((m = /^network\s*("[^"]*"|[\w.-]+)?\s*\{$/i.exec(token))) { const net = { name: unq(m[1] ?? `network${networks.length + 1}`), attrs: {}, members: [] }; networks.push(net); stack.push({ kind: 'network', net }); continue; }
    if ((m = /^group\s*("[^"]*"|[\w.-]+)?\s*\{$/i.exec(token))) { const group = { name: unq(m[1] ?? ''), attrs: {}, members: [] }; groups.push(group); stack.push({ kind: 'group', group }); continue; }
    if (/^\w+\s*\{$/.test(token)) { stack.push({ kind: 'other' }); continue; }
    const top = stack.at(-1);
    if ((m = /^(\w+)\s*=\s*(.+)$/.exec(token)) && top && top.kind !== 'other') { (top.net ?? top.group).attrs[m[1].toLowerCase()] = unq(m[2]); continue; }
    if ((m = /^("[^"]*"|[\w.-]+)\s*--\s*("[^"]*"|[\w.-]+)$/.exec(token))) { peers.push([node(m[1]), node(m[2])]); continue; }
    for (const part of token.split(/,(?![^[]*\])/).map((s) => s.trim()).filter(Boolean)) {
      if (!(m = /^("[^"]*"|[\w.-]+)\s*(?:\[([^\]]*)\])?$/.exec(part))) continue;
      const n = node(m[1]);
      const attrs = nwAttrs(m[2]);
      if (top?.kind === 'network') { top.net.members.push({ node: n, address: attrs.address ?? '' }); n.nets.push(top.net); delete attrs.address; }
      if (top?.kind === 'group') top.group.members.push(n);
      Object.assign(n.attrs, attrs);
    }
  }
  if (!nodes.size && !networks.length) throw fail('interop.empty', 'nwdiag');
  const b = builder('NWModel', 'NetworkDiagram', title || name || 'Network', language);
  const netY = (i) => 110 + i * 190;
  // Rows: nodes without a network on top, the others below their first network.
  const rows = new Map();
  for (const key of nodeOrder) { const n = nodes.get(key); const row = n.nets.length ? networks.indexOf(n.nets[0]) : -1; if (!rows.has(row)) rows.set(row, []); rows.get(row).push(n); }
  const widest = Math.max(1, ...[...rows.values()].map((r) => r.length));
  const barW = Math.max(700, widest * 170 + 60);
  const created = new Map();
  for (const n of nodeOrder.map((k) => nodes.get(k))) {
    const device = DEVICE_OF[String(n.attrs.shape ?? '').toLowerCase()] ?? (NW_DEVICES.includes(n.attrs.shape) ? n.attrs.shape : 'server');
    created.set(n, b.add('NWNode', { name: n.name, device, description: n.attrs.description ?? '' }));
  }
  const groupEls = groups.map((g) => b.add('NWGroup', { name: g.name || g.attrs.label || '', description: g.attrs.description ?? '' }));
  const nodeBoxes = new Map();
  for (const [row, list] of [...rows.entries()].sort((a, b) => a[0] - b[0])) list.forEach((n, i) => nodeBoxes.set(n, { x: 60 + i * 170, y: row < 0 ? 20 : netY(row) + 70, w: 130, h: n.attrs.description ? 52 : 40 }));
  groups.forEach((g, i) => {
    const members = g.members.map((n) => nodeBoxes.get(n)).filter(Boolean);
    if (!members.length) return;
    const x0 = Math.min(...members.map((m) => m.x)) - 14; const y0 = Math.min(...members.map((m) => m.y)) - 30;
    const x1 = Math.max(...members.map((m) => m.x + m.w)) + 14; const y1 = Math.max(...members.map((m) => m.y + m.h)) + 12;
    b.show(groupEls[i], x0, y0, x1 - x0, y1 - y0, g.attrs.color ? { fillColor: /^#?[0-9a-f]{6}$/i.test(g.attrs.color) ? `#${g.attrs.color.replace('#', '')}` : g.attrs.color.toLowerCase() } : {});
  });
  const netViews = networks.map((net, i) => {
    const el = b.add('NWNetwork', { name: net.name, address: net.attrs.address ?? '', description: net.attrs.description ?? '' });
    return { el, view: b.show(el, 40, netY(i), barW, 0, net.attrs.color ? { fillColor: /^#?[0-9a-f]{6}$/i.test(net.attrs.color) ? `#${net.attrs.color.replace('#', '')}` : net.attrs.color.toLowerCase() } : {}) };
  });
  const nodeViews = new Map();
  for (const [n, bx] of nodeBoxes) nodeViews.set(n, b.show(created.get(n), bx.x, bx.y));
  networks.forEach((net, i) => { for (const { node: n, address } of net.members) b.link('NWConnection', created.get(n), netViews[i].el, { address }, nodeViews.get(n), netViews[i].view); });
  for (const [x, y] of peers) b.link('NWConnection', created.get(x), created.get(y), {}, nodeViews.get(x), nodeViews.get(y));
  return { owner: b.owner, diagram: b.diagram, kind: 'nwdiag' };
}

function exportNwdiag(project, diagram) {
  const { ctx, boxes } = drawnBoxes(project, diagram);
  const index = ctx.index;
  const id = (el) => (/^[A-Za-z_][\w.-]*$/.test(el.name ?? '') ? el.name : q(el.name || 'node'));
  const views = diagram.ownedViews ?? [];
  const items = views.filter((v) => v.model && !(v.tail || v.head)).map((v) => ({ view: v, el: index.get(v.model), box: boxes.get(v._id) })).filter((x) => x.el);
  const nets = items.filter((x) => x.el._type === 'NWNetwork').sort((a, b) => a.box.y - b.box.y);
  const nodes = items.filter((x) => x.el._type === 'NWNode');
  const conns = views.filter((v) => (v.tail || v.head) && index.get(v.model)?._type === 'NWConnection').map((v) => index.get(v.model));
  const out = ['@startnwdiag'];
  if (diagram.name) out.push(`title ${diagram.name}`);
  out.push('nwdiag {');
  for (const x of nodes) {
    const attrs = [];
    if (x.el.device && x.el.device !== 'server') attrs.push(`shape = ${x.el.device}`);
    if (x.el.description) attrs.push(`description = ${q(x.el.description)}`);
    if (attrs.length) out.push(`  ${id(x.el)} [${attrs.join(', ')}];`);
  }
  for (const c of conns) {
    const a = index.get(refId(c.source)); const z = index.get(refId(c.target));
    if (a?._type === 'NWNode' && z?._type === 'NWNode') out.push(`  ${id(a)} -- ${id(z)};`);
  }
  for (const net of nets) {
    out.push(`  network ${id(net.el)} {`);
    if (net.el.address) out.push(`    address = ${q(net.el.address)}`);
    if (net.el.description) out.push(`    description = ${q(net.el.description)}`);
    if (net.view.fillColor) out.push(`    color = ${q(net.view.fillColor)}`);
    for (const c of conns) {
      const a = index.get(refId(c.source)); const z = index.get(refId(c.target));
      const [nodeEl, netEl] = a?._type === 'NWNetwork' ? [z, a] : [a, z];
      if (netEl !== net.el || nodeEl?._type !== 'NWNode') continue;
      out.push(`    ${id(nodeEl)}${c.address ? ` [address = ${q(c.address)}]` : ''};`);
    }
    out.push('  }');
  }
  for (const g of items.filter((x) => x.el._type === 'NWGroup')) {
    out.push(`  group ${id(g.el)} {`);
    if (g.view.fillColor) out.push(`    color = ${q(g.view.fillColor)};`);
    if (g.el.description) out.push(`    description = ${q(g.el.description)};`);
    for (const x of nodes) if (insideBox(x.box, g.box)) out.push(`    ${id(x.el)};`);
    out.push('  }');
  }
  out.push('}', '@endnwdiag');
  return `${out.join('\n')}\n`;
}

// ───────────────────────── JSON, YAML, EBNF, regex

/** Stacks views in two columns by their estimated heights. */
function columns(count, heightOf, { x0 = 20, gap = 40, colW = 420 } = {}) {
  const bottoms = [20, 20];
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const col = bottoms[0] <= bottoms[1] ? 0 : 1;
    out.push({ x: x0 + col * colW, y: bottoms[col] });
    bottoms[col] += heightOf(i) + gap;
  }
  return out;
}

function importData(blocks, format, { language, name }) {
  const docs = blocks.map((block, i) => {
    const raw = withoutStyles(block.body).split('\n').filter((l) => !/^\s*#highlight\b/i.test(l));
    const at = raw.findIndex((l) => /^\s*title\s+/i.test(l));
    const title = at >= 0 && (format === 'json' ? !raw.slice(0, at).some((l) => l.trim()) : true) ? unq(raw[at].trim().replace(/^title\s+/i, '')) : '';
    const body = (at >= 0 && title ? raw.filter((_, k) => k !== at) : raw).join('\n').replace(/^\s*\n/, '').replace(/\s+$/, '');
    return { title: title || `${format.toUpperCase()} ${i + 1}`, text: body };
  });
  const b = builder('DSSpecification', format === 'yaml' ? 'YAMLDiagram' : 'JSONDiagram', name || docs[0].title, language);
  const heights = docs.map((d) => { const parsed = parseData(format, d.text); return 34 + (parsed.ok ? dataRows(parsed.value).length : 1) * 20; });
  const places = columns(docs.length, (i) => heights[i]);
  docs.forEach((d, i) => b.show(b.add('DSDocument', { name: d.title, format, text: d.text }), places[i].x, places[i].y));
  return { owner: b.owner, diagram: b.diagram, kind: format };
}

function importEbnf(blocks, { language, name }) {
  const rules = []; let title = '';
  for (const block of blocks) {
    const t = takeTitle(withoutStyles(block.body).split('\n').map((l) => l.trim()).filter(Boolean));
    title ||= t.title;
    rules.push(...splitEbnfRules(t.lines.join('\n')));
  }
  if (!rules.length) throw fail('interop.empty', 'ebnf');
  const b = builder('DSSpecification', 'EBNFDiagram', title || name || 'EBNF', language);
  const places = columns(rules.length, (i) => 90 + (rules[i].expression.match(/\|/g)?.length ?? 0) * 32, { colW: 520 });
  const made = rules.map((r, i) => { const el = b.add('EBNFRule', { name: r.name, expression: r.expression }); return { el, view: b.show(el, places[i].x, places[i].y), rule: r }; });
  // Rules that use other rules of the grammar.
  const byName = new Map(made.map((m) => [m.rule.name, m]));
  for (const m of made) {
    const used = new Set();
    const src = m.rule.expression.replace(/"[^"]*"|'[^']*'|\?[^?]*\?/g, ' ');
    for (const word of src.split(/[,|()[\]{}=;*+?-]/).map((w) => w.trim()).filter(Boolean)) if (byName.has(word) && word !== m.rule.name) used.add(word);
    for (const word of used) b.link('DSReference', m.el, byName.get(word).el, { name: 'uses' }, m.view, byName.get(word).view);
  }
  return { owner: b.owner, diagram: b.diagram, kind: 'ebnf' };
}

function importRegex(blocks, { language, name }) {
  const patterns = blocks.map((block, i) => {
    const t = takeTitle(withoutStyles(block.body).split('\n').filter((l) => l.trim()));
    return { name: t.title || `Pattern ${i + 1}`, pattern: t.lines.map((l) => l.trim()).join('') };
  }).filter((p) => p.pattern);
  if (!patterns.length) throw fail('interop.empty', 'regex');
  const b = builder('DSSpecification', 'RegexDiagram', name || (patterns.length === 1 ? patterns[0].name : 'Regex'), language);
  const places = columns(patterns.length, () => 150, { colW: 560 });
  patterns.forEach((p, i) => b.show(b.add('RegexPattern', p), places[i].x, places[i].y));
  return { owner: b.owner, diagram: b.diagram, kind: 'regex' };
}

/** The node models of a diagram, top to bottom, left to right. */
function shownModels(project, diagram, types) {
  const { ctx, boxes } = drawnBoxes(project, diagram);
  const seen = new Set();
  return (diagram.ownedViews ?? []).filter((v) => v.model && !(v.tail || v.head)).map((v) => ({ el: ctx.index.get(v.model), box: boxes.get(v._id) }))
    .filter((x) => x.el && types.includes(x.el._type) && !seen.has(x.el._id) && seen.add(x.el._id))
    .sort((a, b) => (Math.abs(a.box.y - b.box.y) > 20 ? a.box.y - b.box.y : a.box.x - b.box.x)).map((x) => x.el);
}

function exportData(project, diagram) {
  return `${shownModels(project, diagram, ['DSDocument']).map((doc) => {
    const tag = doc.format === 'yaml' ? 'yaml' : 'json';
    return `@start${tag}\n${doc.name ? `title ${doc.name}\n` : ''}${String(doc.text ?? '').replace(/\s+$/, '')}\n@end${tag}`;
  }).join('\n\n')}\n`;
}
function exportEbnf(project, diagram) {
  const rules = shownModels(project, diagram, ['EBNFRule']);
  return `@startebnf\n${diagram.name ? `title ${diagram.name}\n` : ''}${rules.map((r) => `${r.name} = ${String(r.expression ?? '').replace(/;\s*$/, '').replace(/\s*\n\s*/g, ' ')};`).join('\n')}\n@endebnf\n`;
}
function exportRegex(project, diagram) {
  return `${shownModels(project, diagram, ['RegexPattern']).map((r) => `@startregex\n${r.name ? `title ${r.name}\n` : ''}${String(r.pattern ?? '').replace(/\s*\n\s*/g, '')}\n@endregex`).join('\n\n')}\n`;
}

// ───────────────────────── Salt (→ wireframe widgets)

/** Parses Salt text into a block tree: { kind, title, rows: [[cell]] } where a cell is a string or a block. */
function parseSalt(text) {
  const src = String(text ?? '');
  let i = 0;
  const block = () => {
    // At '{': the modifier right after it (+ # ! - ^"title" * / T S SI …).
    i += 1;
    let kind = '';
    let title = '';
    const mod = /^(\^"[^"]*"|\^|SI|S|T|#|!|-|\+|\*|\/|b)/.exec(src.slice(i));
    if (mod) {
      kind = mod[1].startsWith('^') ? '^' : mod[1];
      if (mod[1].startsWith('^"')) title = mod[1].slice(2, -1);
      i += mod[1].length;
    }
    const rows = [[]];
    let cell = '';
    const pushCell = () => { rows.at(-1).push(cell.trim()); cell = ''; };
    while (i < src.length) {
      const ch = src[i];
      if (ch === '"') { const end = src.indexOf('"', i + 1); const stop = end < 0 ? src.length : end + 1; cell += src.slice(i, stop); i = stop; continue; }
      if (ch === '{') { if (cell.trim()) pushCell(); const child = block(); rows.at(-1).push(child); cell = ''; continue; }
      if (ch === '}') { i += 1; if (cell.trim()) pushCell(); break; }
      if (ch === '|') { if (cell.trim() || !rows.at(-1).length || typeof rows.at(-1).at(-1) === 'string') pushCell(); i += 1; continue; }
      if (ch === '\n') { if (cell.trim()) pushCell(); if (rows.at(-1).length) rows.push([]); i += 1; continue; }
      cell += ch; i += 1;
    }
    return { kind, title, rows: rows.filter((r) => r.length) };
  };
  const start = src.indexOf('{');
  if (start < 0) { i = -1; const lines = src.split('\n').map((l) => l.trim()).filter(Boolean); return { kind: '', title: '', rows: lines.map((l) => l.split('|').map((c) => c.trim())) }; }
  i = start;
  return block();
}

const stripTags = (s) => String(s ?? '').replace(/<\/?[a-z][^>]*>/gi, '').replace(/<&[\w-]+>/g, '').trim();
/** One Salt cell → a widget { type, attrs, w, h } (or null for an empty cell). */
function saltWidget(cell) {
  const t = String(cell).trim();
  const len = (s) => Math.ceil(String(s).length * 7.2);
  let m;
  if (!t || t === '.') return null;
  if (/^(--+|==+|\.\.+|~~+)$/.test(t)) return { type: 'WFDivider', attrs: { name: '' }, w: 0, h: 10, divider: true };
  if ((m = /^\[\s*([Xx]?)\s*\]\s*(.*)$/.exec(t))) return { type: 'WFCheckbox', attrs: { name: stripTags(m[2]), checked: Boolean(m[1]) }, w: len(m[2]) + 26, h: 22 };
  if ((m = /^\(\s*([Xx]?)\s*\)\s*(.*)$/.exec(t))) return { type: 'WFRadio', attrs: { name: stripTags(m[2]), checked: Boolean(m[1]) }, w: len(m[2]) + 26, h: 22 };
  if ((m = /^\[(.+)\]$/.exec(t))) return { type: 'WFButton', attrs: { name: stripTags(m[1]) }, w: Math.max(70, len(m[1].trim()) + 30), h: 30 };
  if ((m = /^"(.*)"$/.exec(t))) return { type: 'WFInput', attrs: { name: m[1].trim() }, w: Math.max(120, len(m[1]) + 16), h: 30 };
  if ((m = /^\^(.*?)\^?$/.exec(t))) { const list = m[1].split('^').map((s) => s.trim()).filter(Boolean); return { type: 'WFDropdown', attrs: { name: list[0] ?? '', items: list.join(',') }, w: Math.max(140, len(list[0] ?? '') + 40), h: 30 }; }
  if (/^<&[\w-]+>$/.test(t)) return { type: /person|user/.test(t) ? 'WFAvatar' : /image|picture/.test(t) ? 'WFImage' : 'WFIcon', attrs: { name: t.slice(2, -1) }, w: /image|picture/.test(t) ? 80 : 24, h: /image|picture/.test(t) ? 60 : 24 };
  if (/<u>|<color:blue>/i.test(t)) return { type: 'WFLink', attrs: { name: stripTags(t) }, w: len(stripTags(t)) + 6, h: 22 };
  return { type: 'WFText', attrs: { name: stripTags(t) }, w: len(stripTags(t)) + 6, h: 22, bold: /<b>/i.test(t) };
}
/** Layout of a Salt block: { w, h, place(x, y, emit) } — emit(type, attrs, box, viewProps). */
function saltLayout(blockNode) {
  const kind = blockNode.kind;
  if (kind === '*' || kind === '/') {
    const items = blockNode.rows.flat().map((c) => (typeof c === 'string' ? stripTags(c) : '')).filter(Boolean);
    const w = Math.max(200, items.length * 90);
    return { w, h: 30, place: (x, y, emit) => emit('WFTabList', { name: '', items: items.join(',') }, { x, y, w, h: 30 }) };
  }
  if (kind === 'T') {
    const items = blockNode.rows.map((r) => r.map((c) => (typeof c === 'string' ? c : '')).join(' ').replace(/^\++\s*/, '').trim()).filter(Boolean);
    const h = Math.max(48, items.length * 24);
    return { w: 200, h, place: (x, y, emit) => emit('WFList', { name: '', items: items.join(',') }, { x, y, w: 200, h }) };
  }
  if (kind === '#') {
    const head = (blockNode.rows[0] ?? []).map((c) => (typeof c === 'string' ? stripTags(c) : '')).filter(Boolean);
    const w = Math.max(240, head.length * 100); const h = Math.max(60, blockNode.rows.length * 26);
    return { w, h, place: (x, y, emit) => emit('WFTable', { name: '', items: head.join(',') }, { x, y, w, h }) };
  }
  const gap = 10;
  const pad = kind === '+' || kind === '^' || kind === 'S' || kind === 'SI' ? 12 : 0;
  const titleH = kind === '^' ? 26 : 0;
  const cells = blockNode.rows.map((row) => row.map((c) => (typeof c === 'string' ? saltWidget(c) : { block: saltLayout(c) })));
  const width = (c) => (c ? (c.block ? c.block.w : c.w) : 0);
  const height = (c) => (c ? (c.block ? c.block.h : c.h) : 0);
  const ncols = Math.max(1, ...cells.map((r) => r.length));
  const colW = Array.from({ length: ncols }, (_, k) => Math.max(0, ...cells.filter((r) => r.length > 1 || !r[0]?.divider).map((r) => width(r[k]))));
  const inner = colW.reduce((s, w) => s + w, 0) + gap * (ncols - 1);
  const rowH = cells.map((r) => Math.max(10, ...r.map(height)));
  const w = Math.max(inner, 60) + pad * 2;
  const h = rowH.reduce((s, x) => s + x, 0) + gap * Math.max(0, cells.length - 1) + pad * 2 + titleH;
  return {
    w, h,
    place: (x, y, emit) => {
      if (pad) emit('WFPanel', { name: blockNode.title || '' }, { x, y, w, h }, { back: true });
      let cy = y + pad + titleH;
      cells.forEach((row, r) => {
        let cx = x + pad;
        row.forEach((c, k) => {
          if (c?.block) c.block.place(cx, cy, emit);
          else if (c?.divider) emit(c.type, c.attrs, { x: x + pad, y: cy, w: inner, h: c.h });
          else if (c) emit(c.type, c.attrs, { x: cx, y: cy + (rowH[r] - c.h) / 2, w: c.w, h: c.h }, c.bold ? { bold: true } : null);
          cx += colW[k] + gap;
        });
        cy += rowH[r] + gap;
      });
    },
  };
}

function importSalt(body, { language, name }) {
  const { title, lines } = takeTitle(withoutStyles(body).split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim() && !l.trim().startsWith("'")));
  const tree = parseSalt(lines.join('\n'));
  const b = builder('WFWireframe', 'WFWireframeDiagram', title || name || 'Salt', language);
  const layout = saltLayout(tree);
  const back = [];
  layout.place(20, 20, (type, attrs, box, viewProps) => {
    const el = b.add(type, attrs);
    const view = createNodeView(`${type}View`, el._id, { x: box.x, y: box.y, w: box.w, h: box.h }, viewProps && !viewProps.back ? viewProps : {});
    if (viewProps?.back) back.push(view); else addView(b.diagram, view);
  });
  // Panels behind their widgets, outer ones first.
  for (const view of back.reverse()) addView(b.diagram, view, { back: true });
  if (!b.diagram.ownedViews.length) throw fail('interop.empty', 'salt');
  return { owner: b.owner, diagram: b.diagram, kind: 'salt' };
}

const FRAME_TYPES = new Set(['WFDesktopFrame', 'WFWebFrame', 'WFMobileFrame', 'WFPanel']);
function saltCell(el, view) {
  const label = String(el.name ?? '').replace(/[|{}]/g, ' ').trim();
  switch (el._type) {
    case 'WFButton': return `[${label || ' '}]`;
    case 'WFCheckbox': case 'WFSwitch': return `[${el.checked ? 'X' : ''}] ${label}`;
    case 'WFRadio': return `(${el.checked ? 'X' : ''}) ${label}`;
    case 'WFInput': case 'WFTextArea': return `"${label.replace(/"/g, "'")}${' '.repeat(Math.max(1, Math.round((Number(view.width) || 120) / 10) - label.length))}"`;
    case 'WFDropdown': return `^${[label, ...String(el.items ?? '').split(',').map((s) => s.trim()).filter((s) => s && s !== label)].join('^')}^`;
    case 'WFLink': return `<u>${label}</u>`;
    case 'WFTabList': return `{/ ${String(el.items ?? label).split(',').map((s) => s.trim()).filter(Boolean).join(' | ') || 'Tab'} }`;
    case 'WFTable': return `{# ${String(el.items ?? label).split(',').map((s) => s.trim()).filter(Boolean).join(' | ') || ' '} }`;
    case 'WFList': return `{T\n${String(el.items ?? label).split(',').map((s) => s.trim()).filter(Boolean).map((s) => `+ ${s}`).join('\n') || '+ item'}\n}`;
    case 'WFImage': return '<&image>';
    case 'WFAvatar': return '<&person>';
    case 'WFIcon': return '<&star>';
    case 'WFDivider': return '--';
    case 'WFProgress': case 'WFSlider': return '';
    default: return view.bold ? `<b>${label}` : label || '.';
  }
}
function exportSalt(project, diagram) {
  const { ctx, boxes } = drawnBoxes(project, diagram);
  const items = (diagram.ownedViews ?? []).filter((v) => v.model && !(v.tail || v.head)).map((v) => ({ view: v, el: ctx.index.get(v.model), box: boxes.get(v._id) })).filter((x) => x.el && /^WF/.test(x.el._type));
  const frames = items.filter((x) => FRAME_TYPES.has(x.el._type));
  const holderOf = new Map();
  for (const x of items) {
    const holders = frames.filter((f) => f !== x && insideBox(x.box, f.box)).sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h);
    if (holders.length) holderOf.set(x, holders[0]);
  }
  const rowsOf = (list) => {
    const sorted = [...list].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
    const rows = [];
    for (const x of sorted) {
      const mid = x.box.y + x.box.h / 2;
      const row = rows.find((r) => Math.abs(r.mid - mid) < 12);
      if (row) row.items.push(x); else rows.push({ mid, items: [x] });
    }
    return rows.map((r) => r.items.sort((a, b) => a.box.x - b.box.x));
  };
  const blockText = (holder, indent) => {
    const kids = items.filter((x) => (holderOf.get(x) ?? null) === holder);
    const lines = [];
    for (const row of rowsOf(kids)) {
      const cells = row.map((x) => (FRAME_TYPES.has(x.el._type) ? blockText(x, `${indent}  `) : saltCell(x.el, x.view))).filter((c) => c !== '');
      if (cells.length) lines.push(`${indent}${cells.join(' | ')}`);
    }
    const head = holder ? (holder.el._type === 'WFPanel' && holder.el.name ? `{^"${String(holder.el.name).replace(/"/g, "'")}"` : '{+') : '{';
    return `${head}\n${lines.join('\n')}\n${indent.slice(2)}}`;
  };
  return `@startsalt\n${diagram.name ? `title ${diagram.name}\n` : ''}${blockText(null, '  ')}\n@endsalt\n`;
}

// ───────────────────────── entry points

/**
 * Reads PlantUML text of one of these kinds (all blocks of the first block's kind).
 * Returns { owner, diagram, kind } or null when the text is something else (class, sequence … diagrams).
 */
export function importPlantUmlMore(text, { language = 'en', name = '' } = {}) {
  const blocks = blocksOf(text);
  if (!blocks.length) return null;
  const tag = blocks[0].tag;
  const same = blocks.filter((b) => b.tag === tag);
  const options = { language, name };
  switch (tag) {
    case 'gantt': return importGantt(same[0].body, options);
    case 'wbs': return importWbs(same[0].body, options);
    case 'chronology': return importChronology(same[0].body, options);
    case 'nwdiag': return importNwdiag(same[0].body, options);
    case 'json': return importData(same, 'json', options);
    case 'yaml': return importData(same, 'yaml', options);
    case 'ebnf': return importEbnf(same, options);
    case 'regex': return importRegex(same, options);
    case 'salt': return importSalt(same[0].body, options);
    case 'uml': return looksArchimate(blocks[0].body) ? importArchimate(blocks[0].body, options) : null;
    default: return null;
  }
}

/** A diagram of these kinds (and wireframes, as Salt) as PlantUML text, or null. */
export function exportPlantUmlMore(project, diagram) {
  switch (diagram?._type) {
    case 'GanttDiagram': return exportGantt(project, diagram);
    case 'WBSDiagram': return exportWbs(project, diagram);
    case 'TimelineDiagram': return exportChronology(project, diagram);
    case 'ArchiMateDiagram': return exportArchimate(project, diagram);
    case 'NetworkDiagram': return exportNwdiag(project, diagram);
    case 'JSONDiagram': case 'YAMLDiagram': return exportData(project, diagram);
    case 'EBNFDiagram': return exportEbnf(project, diagram);
    case 'RegexDiagram': return exportRegex(project, diagram);
    case 'WFWireframeDiagram': return exportSalt(project, diagram);
    default: return null;
  }
}

export { LAYER_OF };
