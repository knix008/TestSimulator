// Hover help of the editor: a tooltip over a function or constant name with
// its description and syntax. Names defined in the open file (local functions,
// `name = value` assignments) come first, then the engine's help (builtins,
// functions on the path).
import { hoverTooltip } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { getLanguage, t } from './i18n.js';

const NAME = /[A-Za-z_]\w*/;
// Builtins shown as constants (the rest of the engine's help entries are functions).
const CONSTANTS = new Set(['pi', 'eps', 'Inf', 'inf', 'NaN', 'nan', 'NA', 'i', 'j', 'I', 'J', 'true', 'false', 'realmax', 'realmin', 'intmax', 'intmin', 'flintmax']);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Text of the % comment lines in `lines` from index i going in direction step. */
function commentRun(lines, i, step) {
  const out = [];
  for (let k = i; k >= 0 && k < lines.length; k += step) {
    const m = /^\s*%(?!%)\s?(.*)$/.exec(lines[k]);
    if (!m) break;
    out.push(m[1].trim());
  }
  return (step < 0 ? out.reverse() : out).filter(Boolean).join(' ');
}

/** The trailing `% comment` of a line (outside quotes), or ''. */
function trailingComment(line) {
  let q = null;
  for (let k = 0; k < line.length; k++) {
    const c = line[k];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || (c === "'" && !/[\w)\]}.']/.test(line[k - 1] || ''))) q = c;
    else if (c === '%') return line.slice(k + 1).replace(/^%*\s*/, '').trim();
  }
  return '';
}

/**
 * Where `name` is defined in `text`: a function (signature + help comment) or
 * the first `name = value` (value + its comment). null when it is not.
 */
export function localDefinition(text, name) {
  if (!name || !NAME.test(name)) return null;
  const lines = String(text).split(/\r?\n/);
  const n = escapeRe(name);
  const fnRe = new RegExp(`^\\s*function\\s+(?:(?:\\[[^\\]]*\\]|[A-Za-z_]\\w*)\\s*=\\s*)?${n}\\b(.*)$`);
  for (let i = 0; i < lines.length; i++) {
    if (!fnRe.test(lines[i])) continue;
    const sig = lines[i].replace(/^\s*function\s+/, '').replace(/[;,]?\s*(%.*)?$/, '').trim();
    return { kind: 'function', line: i + 1, syntax: [sig], text: commentRun(lines, i + 1, 1) || commentRun(lines, i - 1, -1) };
  }
  const asRe = new RegExp(`^\\s*${n}\\s*=(?!=)\\s*(.*)$`);
  for (let i = 0; i < lines.length; i++) {
    const m = asRe.exec(lines[i]);
    if (!m) continue;
    const comment = trailingComment(m[1]);
    const value = (comment ? m[1].slice(0, m[1].lastIndexOf('%')) : m[1]).replace(/[;,]\s*$/, '').trim();
    return { kind: 'constant', line: i + 1, syntax: [`${name} = ${value}`], text: comment || commentRun(lines, i - 1, -1) };
  }
  return null;
}

/** The name under `pos` in `lineText` (line-relative), skipping struct fields: { from, to, name } | null. */
export function nameAt(lineText, pos) {
  let a = pos, b = pos;
  while (a > 0 && /\w/.test(lineText[a - 1])) a--;
  while (b < lineText.length && /\w/.test(lineText[b])) b++;
  const name = lineText.slice(a, b);
  if (!name || !/^[A-Za-z_]/.test(name)) return null;
  if (lineText[a - 1] === '.') return null;
  return { from: a, to: b, name };
}

function tooltipDom(name, info, lang) {
  const dom = document.createElement('div');
  dom.className = 'cm-hover-help';
  const head = document.createElement('div');
  head.className = 'cm-hover-help-head';
  const nm = document.createElement('strong');
  nm.textContent = name;
  head.appendChild(nm);
  if (info.kind) {
    const tag = document.createElement('span');
    tag.className = 'cm-hover-help-kind';
    tag.textContent = info.line ? t('hv_local', { kind: t(`hv_${info.kind}`), line: info.line }) : t(`hv_${info.kind}`);
    head.appendChild(tag);
  }
  dom.appendChild(head);
  const desc = (lang === 'ko' ? info.ko || info.en : info.en || info.ko) || info.text || '';
  if (desc) { const d = document.createElement('div'); d.className = 'cm-hover-help-text'; d.textContent = desc; dom.appendChild(d); }
  const syn = (info.syntax || []).slice(0, 6);
  if (syn.length) {
    const s = document.createElement('div');
    s.className = 'cm-hover-help-syntax';
    s.textContent = syn.join('\n');
    dom.appendChild(s);
  }
  return dom;
}

/** The hover extension; help(name) → Promise<{ en, ko, syntax } | null> (the engine). */
export function hoverHelp(help) {
  const cache = new Map(); // name → Promise (engine help of builtins does not change)
  const engineHelp = (name) => {
    if (!help) return Promise.resolve(null);
    if (!cache.has(name)) cache.set(name, Promise.resolve(help(name)).catch(() => null));
    return cache.get(name);
  };
  return hoverTooltip(async (view, pos, side) => {
    const line = view.state.doc.lineAt(pos);
    const hit = nameAt(line.text, pos - line.from);
    if (!hit) return null;
    if ((pos === line.from + hit.from && side < 0) || (pos === line.from + hit.to && side > 0)) return null;
    const node = syntaxTree(view.state).resolveInner(pos, 1);
    if (/comment|string/.test(node.name)) return null;
    let info = localDefinition(view.state.doc.toString(), hit.name);
    if (!info) {
      const h = await engineHelp(hit.name);
      if (!h || !(h.en || h.ko || h.text)) return null;
      info = { ...h, kind: CONSTANTS.has(hit.name) ? 'constant' : 'function' };
    }
    return {
      pos: line.from + hit.from, end: line.from + hit.to, above: true,
      create: () => ({ dom: tooltipDom(hit.name, info, getLanguage()) }),
    };
  });
}
