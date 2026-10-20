// XMind (.xmind — a ZIP). XMind 2020+ keeps the sheets in content.json,
// XMind 8 in content.xml; both are read (the first sheet). Written as
// content.json + metadata.json + manifest.json, which current XMind opens.
import { newMap, makeTopic, normalizeMap, uid, mapTitle } from '../model.js';
import { parseXml, elements, element, attr, textOf } from './xml.js';

const PROGRESS = { 'task-start': 0, 'task-oct': 12, 'task-quarter': 25, 'task-3oct': 37, 'task-half': 50, 'task-5oct': 62, 'task-3quar': 75, 'task-7oct': 87, 'task-done': 100 };
const MARKER_IN = {
  'flag-red': 'flag-red', 'flag-orange': 'flag-orange', 'flag-yellow': 'flag-yellow', 'flag-green': 'flag-green', 'flag-blue': 'flag-blue', 'flag-purple': 'flag-purple', 'flag-gray': 'flag-gray', 'flag-black': 'flag-gray',
  'smiley-smile': 'smiley-happy', 'smiley-laugh': 'smiley-happy', 'smiley-angry': 'smiley-angry', 'smiley-cry': 'smiley-sad', 'smiley-surprise': 'smiley-surprised', 'smiley-boring': 'smiley-neutral',
  'arrow-up': 'arrow-up', 'arrow-down': 'arrow-down', 'arrow-left': 'arrow-left', 'arrow-right': 'arrow-right', 'arrow-refresh': 'arrow-refresh',
  'symbol-question': 'question', 'symbol-exclam': 'exclamation', 'symbol-info': 'info', 'symbol-wrong': 'cross', 'symbol-right': 'check', 'symbol-attention': 'warning',
  'symbol-plus': 'check', 'symbol-minus': 'cross', 'symbol-pin': 'pin', 'symbol-money': 'money', 'symbol-heart': 'heart', 'symbol-star': 'star',
  'star-red': 'star', 'star-orange': 'star', 'star-yellow': 'star', 'star-blue': 'star', 'star-green': 'star', 'star-purple': 'star',
  'people-red': 'person', 'people-blue': 'person', 'people-green': 'person', 'c_symbol_idea': 'idea', 'symbol-idea': 'idea', 'symbol-lock': 'lock', 'symbol-clock': 'clock', 'symbol-calendar': 'calendar', 'symbol-email': 'mail', 'symbol-phone': 'phone', 'symbol-home': 'home', 'symbol-book': 'book', 'symbol-thumbup': 'thumbsUp', 'symbol-thumbdown': 'thumbsDown', 'symbol-fire': 'fire', 'symbol-target': 'target',
};
const MARKER_OUT = {};
for (const [k, v] of Object.entries(MARKER_IN)) if (!(v in MARKER_OUT)) MARKER_OUT[v] = k;

function applyMarker(t, id) {
  if (!id) return;
  const pr = /^priority-(\d)$/.exec(id);
  if (pr) { t.task = { ...(t.task || {}), priority: Number(pr[1]) }; return; }
  if (id in PROGRESS) { t.task = { ...(t.task || {}), progress: [0, 25, 50, 75, 100].reduce((a, b) => (Math.abs(b - PROGRESS[id]) < Math.abs(a - PROGRESS[id]) ? b : a)) }; return; }
  const m = MARKER_IN[id];
  if (m) t.icons = [...new Set([...(t.icons || []), m])];
}

function imageOf(src, entries) {
  const name = String(src || '').replace(/^xap:/, '');
  const e = entries.find((x) => x.name === name);
  if (!e || !e.base64) return null;
  const ext = name.split('.').pop().toLowerCase();
  const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp' }[ext] || 'image/png';
  return `data:${mime};base64,${e.base64}`;
}

// entries: [{ name, text } | { name, base64 }] from zip.read
export function importXmind(entries, name = '') {
  const json = entries.find((e) => e.name === 'content.json');
  const xml = entries.find((e) => e.name === 'content.xml');
  if (json && json.text) return fromJson(JSON.parse(json.text), entries, name);
  if (xml && xml.text) return fromXml(xml.text, entries, name);
  throw new Error('No XMind content in the file');
}

function fromJson(sheets, entries, name) {
  const sheet = Array.isArray(sheets) ? sheets[0] : sheets;
  if (!sheet || !sheet.rootTopic) throw new Error('The XMind file has no sheet');
  const ids = new Map();
  const conv = (x) => {
    const t = makeTopic(x.title || '');
    ids.set(x.id, t.id);
    const plain = x.notes && x.notes.plain && x.notes.plain.content;
    if (plain) t.notes = String(plain);
    for (const mk of x.markers || []) applyMarker(t, mk.markerId);
    if (Array.isArray(x.labels) && x.labels.length) t.tags = x.labels.map(String);
    if (x.href) t.link = { url: x.href.replace(/^xap:/, '') };
    if (x.branch === 'folded') t.collapsed = true;
    if (x.image && x.image.src) {
      const src = imageOf(x.image.src, entries);
      if (src) t.image = { src, w: x.image.width || 160, h: x.image.height || 120 };
    }
    const ch = x.children || {};
    t.children = (ch.attached || []).map(conv);
    if ((ch.callout || []).length) t.callouts = ch.callout.map(conv);
    t._detached = (ch.detached || []).map((d) => ({ d, pos: d.position }));
    // A boundary over the whole topic ("master"); boundaries over a range of subtopics have no equivalent.
    const master = Array.isArray(x.boundaries) ? x.boundaries.find((bb) => bb.range === 'master') : null;
    if (master) t.boundary = { shape: 'rounded', label: master.title || '' };
    return t;
  };
  const root = conv(sheet.rootTopic);
  const floating = (root._detached || []).map(({ d, pos }) => ({ ...conv(d), x: pos ? pos.x : 300, y: pos ? pos.y : 200 }));
  const strip = (t) => { delete t._detached; (t.children || []).forEach(strip); (t.callouts || []).forEach(strip); };
  strip(root); floating.forEach(strip);
  const map = { ...newMap({}), root, floating };
  map.relationships = (sheet.relationships || []).filter((r) => ids.has(r.end1Id) && ids.has(r.end2Id)).map((r) => ({ id: uid(), from: ids.get(r.end1Id), to: ids.get(r.end2Id), label: r.title || '' }));
  if (!root.text) root.text = name.replace(/\.[^.]+$/, '');
  return normalizeMap(map);
}

function fromXml(text, entries, name) {
  const doc = parseXml(text);
  const sheet = element(doc, 'sheet');
  const top = sheet && element(sheet, 'topic');
  if (!top) throw new Error('The XMind file has no sheet');
  const ids = new Map();
  const conv = (x) => {
    const t = makeTopic(textOf(element(x, 'title')) || '');
    ids.set(attr(x, 'id'), t.id);
    const notes = element(x, 'notes');
    const plain = notes && element(notes, 'plain');
    if (plain) t.notes = textOf(plain).trim();
    const refs = element(x, 'marker-refs');
    for (const m of elements(refs, 'marker-ref')) applyMarker(t, attr(m, 'marker-id'));
    const labels = element(x, 'labels');
    if (labels) { const l = elements(labels, 'label').map((e) => textOf(e)).filter(Boolean); if (l.length) t.tags = l; }
    if (attr(x, 'href')) t.link = { url: attr(x, 'href').replace(/^xap:/, '') };
    if (attr(x, 'branch') === 'folded') t.collapsed = true;
    const ch = element(x, 'children');
    t.children = [];
    t._detached = [];
    for (const group of elements(ch, 'topics')) {
      const list = elements(group, 'topic').map(conv);
      if (attr(group, 'type') === 'detached') t._detached.push(...list.map((d) => ({ ...d, x: 300, y: 200 })));
      else if (attr(group, 'type') === 'callout') t.callouts = list;
      else t.children.push(...list);
    }
    return t;
  };
  const root = conv(top);
  const floating = root._detached;
  const strip = (t) => { delete t._detached; (t.children || []).forEach(strip); (t.callouts || []).forEach(strip); };
  strip(root); floating.forEach(strip);
  const map = { ...newMap({}), root, floating };
  const rels = element(sheet, 'relationships');
  map.relationships = elements(rels, 'relationship').filter((r) => ids.has(attr(r, 'end1')) && ids.has(attr(r, 'end2'))).map((r) => ({ id: uid(), from: ids.get(attr(r, 'end1')), to: ids.get(attr(r, 'end2')), label: textOf(element(r, 'title')) || '' }));
  if (!root.text) root.text = name.replace(/\.[^.]+$/, '');
  return normalizeMap(map);
}

const PROGRESS_OUT = { 0: 'task-start', 25: 'task-quarter', 50: 'task-half', 75: 'task-3quar', 100: 'task-done' };
const XMIND_LAYOUT = { map: 'org.xmind.ui.map.clockwise', right: 'org.xmind.ui.logic.right', left: 'org.xmind.ui.logic.left', orgDown: 'org.xmind.ui.org-chart.down', orgUp: 'org.xmind.ui.org-chart.up', treeRight: 'org.xmind.ui.tree.right', treeLeft: 'org.xmind.ui.tree.left', timeline: 'org.xmind.ui.timeline.horizontal', fishbone: 'org.xmind.ui.fishbone.leftHeaded' };

// → [{ name, text }] for zip.write
export function exportXmind(map) {
  const conv = (t, root = false) => {
    const x = { id: t.id, class: 'topic', title: t.text || '' };
    if (root) x.structureClass = XMIND_LAYOUT[map.layout] || XMIND_LAYOUT.map;
    if (t.notes) x.notes = { plain: { content: t.notes } };
    const markers = [];
    if (t.task && t.task.priority) markers.push({ markerId: `priority-${t.task.priority}` });
    if (t.task && t.task.progress != null && PROGRESS_OUT[t.task.progress]) markers.push({ markerId: PROGRESS_OUT[t.task.progress] });
    for (const i of t.icons || []) if (MARKER_OUT[i]) markers.push({ markerId: MARKER_OUT[i] });
    if (markers.length) x.markers = markers;
    if ((t.tags || []).length) x.labels = t.tags.slice();
    if (t.link && t.link.url) x.href = t.link.url;
    if (t.collapsed) x.branch = 'folded';
    const children = {};
    if ((t.children || []).length) children.attached = t.children.map((c) => conv(c));
    if ((t.callouts || []).length) children.callout = t.callouts.map((c) => conv(c));
    if (root && (map.floating || []).length) children.detached = map.floating.map((f) => ({ ...conv(f), position: { x: Math.round(f.x || 0), y: Math.round(f.y || 0) } }));
    if (Object.keys(children).length) x.children = children;
    if (t.boundary) x.boundaries = [{ id: uid(), range: 'master', title: t.boundary.label || undefined }];
    return x;
  };
  const sheet = {
    id: uid(),
    class: 'sheet',
    title: mapTitle(map) || 'Sheet 1',
    rootTopic: conv(map.root, true),
    relationships: (map.relationships || []).map((r) => ({ id: r.id, end1Id: r.from, end2Id: r.to, title: r.label || undefined })),
  };
  const metadata = { creator: { name: 'MyBrainMap', version: '1.0.0' } };
  const manifest = { 'file-entries': { 'content.json': {}, 'metadata.json': {} } };
  return [
    { name: 'content.json', text: JSON.stringify([sheet]) },
    { name: 'metadata.json', text: JSON.stringify(metadata) },
    { name: 'manifest.json', text: JSON.stringify(manifest) },
  ];
}
