// MindManager (.mmap — a ZIP with Document.xml). Read: the central topic and
// its subtopics, floating topics, callouts, plain text, notes (the preview
// text), priority / progress / task dates / resources, stock icons, text
// labels (tags), hyperlinks, collapsed state, boundaries and relationships.
// (Writing .mmap is not offered: MindManager checks its own schema closely.)
import { newMap, makeTopic, normalizeMap, uid } from '../model.js';
import { parseXml, elements, element, attr, localName, textOf, htmlToText } from './xml.js';

const ICON_IN = [
  [/Flag(Red)/i, 'flag-red'], [/FlagOrange/i, 'flag-orange'], [/FlagYellow/i, 'flag-yellow'], [/FlagGreen/i, 'flag-green'], [/FlagBlue/i, 'flag-blue'], [/FlagPurple/i, 'flag-purple'], [/Flag(Black|Gray|Grey)/i, 'flag-gray'],
  [/SmileyHappy|SmileyLaugh/i, 'smiley-happy'], [/SmileyNeutral/i, 'smiley-neutral'], [/SmileySad/i, 'smiley-sad'], [/SmileyAngry/i, 'smiley-angry'], [/SmileyScreaming|SmileySurprise/i, 'smiley-surprised'],
  [/ArrowUp/i, 'arrow-up'], [/ArrowDown/i, 'arrow-down'], [/ArrowLeft/i, 'arrow-left'], [/ArrowRight/i, 'arrow-right'],
  [/QuestionMark|Question/i, 'question'], [/ExclamationMark|Exclamation/i, 'exclamation'], [/ThumbsUp/i, 'thumbsUp'], [/ThumbsDown/i, 'thumbsDown'],
  [/Check|Tick/i, 'check'], [/Cross|Cancel/i, 'cross'], [/Star/i, 'star'], [/Heart/i, 'heart'], [/Info/i, 'info'], [/Warning|Caution/i, 'warning'],
  [/Idea|Bulb/i, 'idea'], [/Clock|Time/i, 'clock'], [/Calendar/i, 'calendar'], [/Phone/i, 'phone'], [/Mail|Email/i, 'mail'], [/Home|House/i, 'home'],
  [/Person|User/i, 'person'], [/People|Team|Group/i, 'people'], [/Money|Dollar|Euro/i, 'money'], [/Lock/i, 'lock'], [/Pin|Location/i, 'pin'], [/Book/i, 'book'],
  [/Fire|Hot/i, 'fire'], [/Rocket/i, 'rocket'], [/Target|Goal/i, 'target'],
];

const date = (s) => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(s || ''); return m ? m[1] : ''; };

export function importMmap(entries, name = '') {
  const doc = entries.find((e) => /(^|\/)Document\.xml$/i.test(e.name));
  if (!doc || !doc.text) throw new Error('No MindManager document in the file');
  const xml = parseXml(doc.text);
  if (localName(xml) !== 'Map') throw new Error('Not a MindManager map');
  const one = element(xml, 'OneTopic');
  const topTopic = one && element(one, 'Topic');
  if (!topTopic) throw new Error('The map has no central topic');
  const ids = new Map();
  const conv = (x) => {
    const textEl = element(x, 'Text');
    let text = textEl ? attr(textEl, 'PlainText') : '';
    if (!text && textEl) text = textOf(textEl);
    const t = makeTopic(String(text || '').replace(/\r\n?/g, '\n'));
    if (attr(x, 'OId')) ids.set(attr(x, 'OId'), t.id);
    const notes = element(x, 'NotesGroup');
    if (notes) {
      const data = element(notes, 'NotesXhtmlData');
      const plain = data ? attr(data, 'PreviewPlainText') : '';
      const n = plain || (data ? htmlToText(textOf(data)) : '');
      if (n && n.trim()) t.notes = n.trim();
    }
    const task = element(x, 'Task');
    if (task) {
      const tk = {};
      const pr = /Prio(\d)/i.exec(attr(task, 'TaskPriority') || '');
      if (pr) tk.priority = Number(pr[1]);
      const pc = attr(task, 'TaskPercentage');
      if (pc != null && pc !== '') tk.progress = [0, 25, 50, 75, 100].reduce((a, b) => (Math.abs(b - Number(pc)) < Math.abs(a - Number(pc)) ? b : a));
      if (date(attr(task, 'StartDate'))) tk.start = date(attr(task, 'StartDate'));
      if (date(attr(task, 'DueDate'))) tk.due = date(attr(task, 'DueDate'));
      if (attr(task, 'Resources')) tk.resources = attr(task, 'Resources').replace(/;/g, ', ');
      if (Object.keys(tk).length) t.task = tk;
    }
    const icons = [];
    const ig = element(x, 'IconsGroup');
    for (const ic of elements(ig && element(ig, 'Icons'), 'Icon')) {
      const type = attr(ic, 'IconType') || '';
      const pr = /Prio(\d)/i.exec(type);
      if (pr) { t.task = { ...(t.task || {}), priority: Number(pr[1]) }; continue; }
      const pc = /Percentage(\d+)/i.exec(type);
      if (pc) { t.task = { ...(t.task || {}), progress: Number(pc[1]) }; continue; }
      const hit = ICON_IN.find(([re]) => re.test(type));
      if (hit && !icons.includes(hit[1])) icons.push(hit[1]);
    }
    if (icons.length) t.icons = icons;
    const labels = element(x, 'TextLabels');
    const tags = elements(labels, 'TextLabel').map((l) => attr(l, 'TextLabelName')).filter(Boolean);
    if (tags.length) t.tags = tags;
    const link = element(x, 'Hyperlink');
    if (link && attr(link, 'Url')) t.link = { url: attr(link, 'Url') };
    const col = element(x, 'Collapsed');
    if (col && attr(col, 'Collapsed') === 'true') t.collapsed = true;
    if (element(x, 'Boundary')) t.boundary = { shape: 'rounded' };
    const subs = element(x, 'SubTopics');
    t.children = elements(subs, 'Topic').map(conv);
    const calls = element(x, 'Callouts') || element(x, 'CalloutTopics');
    if (calls) { const c = elements(calls, 'Topic').map(conv); if (c.length) t.callouts = c; }
    return t;
  };
  const root = conv(topTopic);
  const floating = [];
  const ft = element(topTopic, 'FloatingTopics') || element(one, 'FloatingTopics') || element(xml, 'FloatingTopics');
  let y = 220;
  for (const f of elements(ft, 'Topic')) { floating.push({ ...conv(f), x: 420, y }); y += 90; }
  const map = { ...newMap({}), root, floating };
  const rels = element(xml, 'Relationships') || element(one, 'Relationships');
  map.relationships = [];
  for (const r of elements(rels, 'Relationship')) {
    const groups = elements(r, 'ConnectionGroup');
    const end = (i) => {
      const g = groups.find((gg) => attr(gg, 'Index') === String(i)) || groups[i];
      const ref = g && element(element(g, 'Connection'), 'ObjectReference');
      return ref ? ids.get(attr(ref, 'OIdRef')) : null;
    };
    const from = end(0), to = end(1);
    if (from && to && from !== to) map.relationships.push({ id: uid(), from, to, label: '' });
  }
  if (!root.text) root.text = name.replace(/\.[^.]+$/, '');
  return normalizeMap(map);
}
