// FreeMind / Freeplane (.mm): an XML tree of <node> elements. Read: text
// (attribute or rich HTML), position, folding, colours, link, icons, notes,
// arrow links (relationships), cloud (boundary). Written: the same.
import { newMap, makeTopic, normalizeMap, uid } from '../model.js';
import { parseXml, elements, element, attr, localName, htmlToText, escapeXml } from './xml.js';

// FreeMind built-in icon ↔ marker
const ICON_IN = {
  'full-1': 'p1', 'full-2': 'p2', 'full-3': 'p3', 'full-4': 'p4', 'full-5': 'p5', 'full-6': 'p6', 'full-7': 'p7', 'full-8': 'p8', 'full-9': 'p9',
  button_ok: 'check', button_cancel: 'cross', help: 'question', messagebox_warning: 'warning', idea: 'idea', yes: 'exclamation',
  info: 'info', flag: 'flag-red', 'flag-blue': 'flag-blue', 'flag-green': 'flag-green', 'flag-orange': 'flag-orange', 'flag-yellow': 'flag-yellow',
  'flag-pink': 'flag-purple', 'flag-black': 'flag-gray', ksmiletris: 'smiley-happy', 'smiley-neutral': 'smiley-neutral', smily_bad: 'smiley-sad',
  'smiley-angry': 'smiley-angry', 'smiley-oh': 'smiley-surprised', up: 'arrow-up', down: 'arrow-down', back: 'arrow-left', forward: 'arrow-right',
  clock: 'clock', calendar: 'calendar', kmail: 'mail', gohome: 'home', family: 'people', male1: 'person', female1: 'person', password: 'lock',
  bookmark: 'bookmark', launch: 'rocket', attach: 'bookmark', list: 'book', korn: 'mail', freemind_butterfly: 'star', licq: 'heart', stop: 'cross',
};
const ICON_OUT = {};
for (const [k, v] of Object.entries(ICON_IN)) if (!(v in ICON_OUT)) ICON_OUT[v] = k;
Object.assign(ICON_OUT, { star: 'bookmark', heart: 'licq', money: 'bookmark', pin: 'gohome', thumbsUp: 'button_ok', thumbsDown: 'button_cancel', fire: 'yes', target: 'idea', chart: 'list', gear: 'wizard', phone: 'kmail', 'arrow-refresh': 'forward' });

export function importFreeMind(text, name = '') {
  const doc = parseXml(text);
  if (localName(doc) !== 'map') throw new Error('Not a FreeMind map');
  const top = element(doc, 'node');
  if (!top) throw new Error('The map has no node');
  const idMap = new Map();
  const arrows = [];
  const conv = (n, level) => {
    let text = attr(n, 'TEXT');
    let noteText = '';
    for (const rc of elements(n, 'richcontent')) {
      const type = (attr(rc, 'TYPE') || '').toUpperCase();
      const body = htmlToText(rc.children.map((c) => (typeof c === 'string' ? c : serialize(c))).join(''));
      if (type === 'NODE' && text == null) text = body;
      else if ((type === 'NOTE' || type === 'DETAILS') && body) noteText = noteText ? `${noteText}\n\n${body}` : body;
    }
    const t = makeTopic(text || '');
    if (attr(n, 'ID')) idMap.set(attr(n, 'ID'), t.id);
    if (noteText) t.notes = noteText;
    if (level === 1 && attr(n, 'POSITION')) t.side = attr(n, 'POSITION') === 'left' ? 'left' : 'right';
    if (attr(n, 'FOLDED') === 'true') t.collapsed = true;
    const style = {};
    if (attr(n, 'COLOR')) style.color = attr(n, 'COLOR');
    if (attr(n, 'BACKGROUND_COLOR')) style.fill = attr(n, 'BACKGROUND_COLOR');
    const font = element(n, 'font');
    if (font) {
      if (attr(font, 'BOLD') === 'true') style.bold = true;
      if (attr(font, 'ITALIC') === 'true') style.italic = true;
      if (attr(font, 'SIZE')) style.fontSize = Math.round(Number(attr(font, 'SIZE')) * 1.15);
    }
    const edge = element(n, 'edge');
    if (edge && attr(edge, 'COLOR')) style.line = attr(edge, 'COLOR');
    if (Object.keys(style).length) t.style = style;
    if (attr(n, 'LINK')) t.link = { url: attr(n, 'LINK') };
    const icons = [];
    for (const ic of elements(n, 'icon')) {
      const m = ICON_IN[attr(ic, 'BUILTIN')];
      if (!m) continue;
      if (/^p\d$/.test(m)) t.task = { ...(t.task || {}), priority: Number(m.slice(1)) };
      else if (!icons.includes(m)) icons.push(m);
    }
    if (icons.length) t.icons = icons;
    if (element(n, 'cloud')) t.boundary = { shape: 'cloud', color: attr(element(n, 'cloud'), 'COLOR') || '' };
    for (const a of elements(n, 'arrowlink')) arrows.push({ from: t.id, toRaw: attr(a, 'DESTINATION'), label: attr(a, 'MIDDLE_LABEL') || attr(a, 'SOURCE_LABEL') || '' });
    t.children = elements(n, 'node').map((c) => conv(c, level + 1));
    return t;
  };
  const root = conv(top, 0);
  const map = { ...newMap({}), root };
  map.relationships = arrows.filter((a) => idMap.has(a.toRaw)).map((a) => ({ id: uid(), from: a.from, to: idMap.get(a.toRaw), label: a.label }));
  if (!root.text) root.text = name.replace(/\.[^.]+$/, '');
  return normalizeMap(map);
}

function serialize(n) {
  const a = Object.entries(n.attrs).map(([k, v]) => ` ${k}="${escapeXml(v)}"`).join('');
  return `<${n.name}${a}>${n.children.map((c) => (typeof c === 'string' ? escapeXml(c) : serialize(c))).join('')}</${n.name}>`;
}

const html = (s) => `<html><head/><body>${String(s).split('\n').map((l) => `<p>${escapeXml(l) || '&#160;'}</p>`).join('')}</body></html>`;

export function exportFreeMind(map) {
  const ids = new Map();
  let n = 0;
  const idOf = (id) => { if (!ids.has(id)) ids.set(id, `ID_${++n}`); return ids.get(id); };
  const relsFrom = new Map();
  for (const r of map.relationships || []) { const l = relsFrom.get(r.from) || []; l.push(r); relsFrom.set(r.from, l); }
  const out = [];
  const walk = (t, d, level) => {
    const pad = '  '.repeat(d);
    const a = [`TEXT="${escapeXml(t.text || '')}"`, `ID="${idOf(t.id)}"`];
    if (level === 1 && t.side) a.push(`POSITION="${t.side}"`);
    if (t.collapsed) a.push('FOLDED="true"');
    const s = t.style || {};
    if (s.color) a.push(`COLOR="${escapeXml(s.color)}"`);
    if (s.fill) a.push(`BACKGROUND_COLOR="${escapeXml(s.fill)}"`);
    if (t.link && t.link.url) a.push(`LINK="${escapeXml(t.link.url)}"`);
    out.push(`${pad}<node ${a.join(' ')}>`);
    if (s.line) out.push(`${pad}  <edge COLOR="${escapeXml(s.line)}"/>`);
    if (s.bold || s.italic || s.fontSize) out.push(`${pad}  <font NAME="SansSerif" SIZE="${Math.round((s.fontSize || 14) / 1.15)}"${s.bold ? ' BOLD="true"' : ''}${s.italic ? ' ITALIC="true"' : ''}/>`);
    if (t.boundary) out.push(`${pad}  <cloud${t.boundary.color ? ` COLOR="${escapeXml(t.boundary.color)}"` : ''}/>`);
    if (t.task && t.task.priority) out.push(`${pad}  <icon BUILTIN="full-${t.task.priority}"/>`);
    if (t.task && t.task.progress === 100) out.push(`${pad}  <icon BUILTIN="button_ok"/>`);
    for (const i of t.icons || []) if (ICON_OUT[i]) out.push(`${pad}  <icon BUILTIN="${ICON_OUT[i]}"/>`);
    if (t.notes) out.push(`${pad}  <richcontent TYPE="NOTE">${html(t.notes)}</richcontent>`);
    for (const r of relsFrom.get(t.id) || []) out.push(`${pad}  <arrowlink DESTINATION="${idOf(r.to)}" ENDARROW="Default" STARTARROW="${r.arrowStart ? 'Default' : 'None'}"${r.label ? ` MIDDLE_LABEL="${escapeXml(r.label)}"` : ''}/>`);
    (t.children || []).forEach((c) => walk(c, d + 1, level + 1));
    out.push(`${pad}</node>`);
  };
  // FreeMind has no floating topics: they join the central topic as main topics.
  const root = { ...map.root, children: [...(map.root.children || []), ...(map.floating || []).map((f) => ({ ...f }))] };
  walk(root, 1, 0);
  return `<map version="1.0.1">\n<!-- My BrainMap export -->\n${out.join('\n')}\n</map>\n`;
}
