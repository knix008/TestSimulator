// Feature parity with the well-known mind-mapping and diagramming tools —
// MindManager, EdrawMind, SmartDraw and Lucidchart — for the features that
// apply to a mind map. Every row of FEATURES names the tools that have the
// feature and checks it against the real code (model, commands, layout,
// renderer, import / export, undo history). doc/feature-parity.md lists the
// same rows, and the features of those tools that My BrainMap does not have.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  newMap, makeTopic, addChild, addCallout, addFloating, addRelationship, updateRelationship, removeTopics, findTopic, entryOf,
  setStyle, setField, setTask, setCollapsed, expandToLevel, sortChildren, balanceSides, findTopics, replaceInTopics, filterTopics,
  numberingOf, normalizeMap, copyFragment, pasteFragment, topicsFromText, usage, insertParent, shiftTopic, LAYOUTS,
  nudgeTopics, arrangeMap, hasOffsets, addComment, removeComment, setProps, subtreeIds,
} from '../src/lib/model.js';
import { cmdMove, cmdFloat, cmdNudge, cmdDelete, cmdAddSibling, cmdToggleFold, navigate } from '../src/lib/commands.js';
import { createDoc, commit, undo, redo, isDirty } from '../src/lib/docs.js';
import { layoutMap } from '../src/lib/layout.js';
import { resolveMapStyle, MAP_STYLES, SHAPES, LINE_STYLES } from '../src/lib/mapstyles.js';
import { renderMapSvg } from '../src/lib/render.js';
import { MARKERS, toggleIcon, topicMarkers } from '../src/lib/markers.js';
import { TEMPLATES, mapFromTemplate } from '../src/lib/templates.js';
import { SAMPLES } from '../src/lib/samples.js';
import { EXPORTS } from '../src/lib/formats/index.js';
import { importOpml, exportOpml, importMarkdown, exportMarkdown, exportHtml, exportCsv, importTextOutline, exportTextOutline } from '../src/lib/formats/outline.js';
import { importFreeMind, exportFreeMind } from '../src/lib/formats/freemind.js';
import { importXmind, exportXmind } from '../src/lib/formats/xmind.js';
import { exportDocx } from '../src/lib/formats/docx.js';
import { buildPdf } from '../src/lib/formats/pdf.js';
import { gridCell, rulerStep } from '../src/lib/canvasgrid.js';

const require = createRequire(import.meta.url);
const { readZip, writeZip } = require('../core/zip.js');

const measure = (text, font) => { const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)[1]); return [...String(text)].reduce((s, ch) => s + (ch.charCodeAt(0) > 0x2e80 ? size : size * 0.56), 0); };
const lay = (map, extra = {}) => layoutMap(map, { ms: resolveMapStyle(map, {}), measure, ...extra });
const svgOf = (map) => renderMapSvg(map, lay(map), resolveMapStyle(map, {}), { measure }).svg;

// A small project map: Root → A (A1, A2), B (B1), C.
function project(layout = 'map') {
  let map = newMap({ title: 'Launch', layout });
  const ids = {};
  for (const [name, kids] of [['A', ['A1', 'A2']], ['B', ['B1']], ['C', []]]) {
    const r = addChild(map, map.root.id, makeTopic(name)); map = r.map; ids[name] = r.id;
    for (const k of kids) { const s = addChild(map, r.id, makeTopic(k)); map = s.map; ids[k] = s.id; }
  }
  return { map, ids };
}
const MM = 'MindManager', ED = 'EdrawMind', SD = 'SmartDraw', LC = 'Lucidchart';

const FEATURES = [
  // ── topics and structure ──
  { tools: [MM, ED, SD, LC], name: 'central, main topics and subtopics', check() {
    const { map, ids } = project();
    assert.equal(entryOf(map, ids.A).kind, 'child');
    assert.equal(findTopic(map, ids.A).children.length, 2);
  } },
  { tools: [MM, ED], name: 'sibling before / after and a parent inserted above', check() {
    const { map, ids } = project();
    const r = cmdAddSibling(map, [ids.A1], { before: true });
    assert.equal(findTopic(r.map, ids.A).children[0].id, r.sel[0]);
    const p = insertParent(map, ids.B1, makeTopic('P'));
    assert.equal(entryOf(p.map, ids.B1).parent, p.id);
  } },
  { tools: [MM, ED], name: 'callouts', check() {
    const { map, ids } = project();
    const c = addCallout(map, ids.A, makeTopic('remark'));
    assert.equal(entryOf(c.map, c.id).kind, 'callout');
    assert.ok(lay(c.map).lines.some((l) => l.kind === 'callout'));
  } },
  { tools: [MM, ED, LC], name: 'floating topics', check() {
    const { map } = project();
    const f = addFloating(map, makeTopic('idea'), 300, -120);
    const n = lay(f.map).nodes.get(f.id);
    assert.equal(n.kind, 'floating');
    assert.ok(Math.abs(n.x + n.w / 2 - 300) < 1);
  } },
  { tools: [MM, ED, SD, LC], name: 'drag & drop: re-parent, reorder, and moving keeps the connection', check() {
    const { map, ids } = project();
    const moved = cmdMove(map, [ids.A2], ids.B, 'child');
    assert.equal(entryOf(moved.map, ids.A2).parent, ids.B);
    const nudged = cmdNudge(map, [ids.A], 40, -30);
    assert.equal(entryOf(nudged.map, ids.A).parent, map.root.id, 'still connected to its parent');
    assert.deepEqual(findTopic(nudged.map, ids.A).offset, { x: 40, y: -30 });
    const before = lay(map).nodes.get(ids.A1), after = lay(nudged.map).nodes.get(ids.A1);
    assert.deepEqual([after.x - before.x, after.y - before.y], [40, -30], 'the subtree moves with it');
    assert.ok(lay(nudged.map).lines.some((l) => l.id === ids.A), 'its line is still drawn');
    const torn = cmdFloat(map, [ids.C], { x: 200, y: 200 });
    assert.equal(entryOf(torn.map, ids.C).kind, 'floating', 'Alt+drop detaches on purpose');
  } },
  { tools: [MM, ED, SD], name: 'auto arrange and redraw in a direction', check() {
    const { map, ids } = project();
    const moved = nudgeTopics(map, [{ id: ids.A, dx: 50, dy: 10 }, { id: ids.B1, dx: -20, dy: 5 }]);
    assert.ok(hasOffsets(moved));
    const tidy = arrangeMap(moved);
    assert.ok(!hasOffsets(tidy));
    for (const layout of ['orgDown', 'right', 'left', 'map']) {
      const m = { ...arrangeMap(moved), layout };
      const L = lay(m);
      assert.equal(L.nodes.size, 7, layout);
    }
    const down = lay({ ...map, layout: 'orgDown' });
    assert.ok(down.nodes.get(ids.A).y > down.nodes.get(map.root.id).y, 'top to bottom');
    const left = lay({ ...map, layout: 'left' });
    assert.ok(left.nodes.get(ids.A).x < left.nodes.get(map.root.id).x, 'right to left');
  } },
  { tools: [MM, ED, SD, LC], name: 'delete (with or without the subtopics)', check() {
    const { map, ids } = project();
    assert.ok(!findTopic(cmdDelete(map, [ids.A]).map, ids.A1));
    const kept = cmdDelete(map, [ids.A], { keepChildren: true }).map;
    assert.equal(entryOf(kept, ids.A1).parent, map.root.id);
  } },
  { tools: [MM, ED], name: 'move up / down among siblings, sort', check() {
    const { map, ids } = project();
    assert.equal(findTopic(shiftTopic(map, ids.A2, -1), ids.A).children[0].id, ids.A2);
    const s = sortChildren(map, [map.root.id], { descending: true });
    assert.deepEqual(s.root.children.map((c) => c.text), ['C', 'B', 'A']);
  } },
  { tools: [MM, ED], name: 'collapse / expand, show levels', check() {
    const { map, ids } = project();
    const c = setCollapsed(map, [ids.A], true);
    assert.ok(!lay(c).nodes.has(ids.A1));
    const lv = expandToLevel(map, 1);
    assert.ok(!lay(lv).nodes.has(ids.B1));
    assert.ok(cmdToggleFold(map, [ids.B]).map);
  } },
  { tools: [MM, ED], name: 'focus on a branch', check() {
    const { map, ids } = project();
    const L = lay(map, { focusId: ids.A });
    assert.deepEqual([...L.nodes.keys()].sort(), [ids.A, ids.A1, ids.A2].sort());
  } },
  { tools: [MM, ED, SD, LC], name: 'keyboard navigation between topics', check() {
    const { map, ids } = project('right');
    const L = lay(map);
    assert.ok([ids.A, ids.B, ids.C].includes(navigate(L, map, map.root.id, 'ArrowRight')), 'right of the centre: a main topic');
    assert.equal(navigate(L, map, ids.A1, 'ArrowLeft'), ids.A);
  } },
  { tools: [MM, ED, SD, LC], name: 'copy / paste with structure, paste text as topics', check() {
    const { map, ids } = project();
    const frag = copyFragment(map, [ids.A]);
    const p = pasteFragment(map, ids.C, frag);
    assert.equal(findTopic(p.map, ids.C).children[0].children.length, 2);
    assert.equal(topicsFromText('one\n\ttwo\nthree').length, 2);
  } },
  { tools: [MM, ED, SD, LC], name: 'undo / redo of every edit, and the unsaved mark', check() {
    const { map, ids } = project();
    let doc = createDoc(map, { name: 'x' });
    assert.ok(!isDirty(doc));
    doc = commit(doc, setStyle(doc.map, [ids.A], { bold: true }));
    doc = commit(doc, cmdNudge(doc.map, [ids.B], 10, 10).map);
    assert.ok(isDirty(doc));
    doc = undo(doc);
    assert.equal(findTopic(doc.map, ids.B).offset, undefined);
    doc = undo(doc);
    assert.equal(doc.map, map);
    assert.ok(!isDirty(doc), 'back to the saved map');
    doc = redo(redo(doc));
    assert.deepEqual(findTopic(doc.map, ids.B).offset, { x: 10, y: 10 });
  } },

  // ── layouts and styles ──
  { tools: [MM, ED, SD, LC], name: 'layouts: map, right, left, org chart down / up, tree, timeline, fishbone', check() {
    for (const layout of LAYOUTS) {
      const { map } = project(layout);
      const L = lay(map);
      assert.equal(L.nodes.size, 7, layout);
      assert.ok(svgOf(map).includes('<g'), layout);
    }
    assert.ok(LAYOUTS.includes('fishbone') && LAYOUTS.includes('timeline') && LAYOUTS.includes('orgDown'));
  } },
  { tools: [MM, ED], name: 'a different layout per branch', check() {
    const { map, ids } = project('right');
    const m = setField(map, [ids.A], 'layout', 'down');
    const L = lay(m);
    assert.ok(L.nodes.get(ids.A1).y > L.nodes.get(ids.A).y);
  } },
  { tools: [MM, ED, SD, LC], name: 'map styles / themes, shapes and line styles', check() {
    assert.ok(MAP_STYLES.length >= 8);
    assert.ok(SHAPES.includes('ellipse') && SHAPES.includes('diamond') && SHAPES.includes('hexagon'));
    assert.ok(LINE_STYLES.includes('elbow') && LINE_STYLES.includes('straight'));
    const { map, ids } = project();
    for (const st of MAP_STYLES) assert.ok(svgOf({ ...map, style: st.id }).length > 100, st.id);
    const styled = setStyle(map, [ids.A], { shape: 'diamond', fill: '#ff0000', bold: true });
    assert.ok(svgOf(styled).includes('#ff0000'));
  } },
  { tools: [ED], name: 'rainbow branch colours and numbering', check() {
    const { map, ids } = project();
    const L = lay(map);
    assert.notEqual(L.nodes.get(ids.A).st.branch, L.nodes.get(ids.B).st.branch);
    const numbered = { ...map, numbering: { ...(map.numbering || {}), enabled: true } };
    assert.ok(numberingOf(numbered, ids.A1));
  } },
  { tools: [ED, MM], name: 'balance the two sides of a map', check() {
    const { map } = project();
    const b = balanceSides(map);
    assert.deepEqual(b.root.children.map((c) => c.side), ['right', 'left', 'right']);
  } },

  // ── content on topics ──
  { tools: [MM, ED, SD, LC], name: 'relationships with labels, arrows and colours', check() {
    const { map, ids } = project();
    const r = addRelationship(map, ids.A1, ids.B1, { label: 'depends' });
    const m = updateRelationship(r.map, r.id, { color: '#123456', arrowStart: true });
    const svg = svgOf(m);
    assert.ok(svg.includes('depends') && svg.includes('#123456'));
  } },
  { tools: [MM, ED, LC], name: 'boundaries (containers) with labels', check() {
    const { map, ids } = project();
    const m = setField(map, [ids.A], 'boundary', { shape: 'cloud', label: 'Phase 1' });
    assert.equal(lay(m).boundaries.length, 1);
    assert.ok(svgOf(m).includes('Phase 1'));
  } },
  { tools: [ED, MM], name: 'summary braces beside subtopics', check() {
    const { map, ids } = project('right');
    const m = setField(map, [ids.A], 'summary', { text: 'Front end' });
    const L = lay(m);
    assert.equal(L.summaries.length, 1);
    const s = L.summaries[0], a1 = L.nodes.get(ids.A1);
    assert.ok(s.x >= a1.x + a1.w, 'the brace is to the right of the subtopics');
    assert.ok(svgOf(m).includes('Front end') && svgOf(m).includes('tm-summary'));
    assert.ok(L.bounds.x1 >= s.lx + s.w, 'the label is inside the map bounds');
  } },
  { tools: [MM, ED, SD, LC], name: 'notes (Markdown), hyperlinks, attachments and pictures', check() {
    const { map, ids } = project();
    let m = setField(map, [ids.A], 'notes', '**bold** note');
    m = setField(m, [ids.A], 'link', { url: 'https://example.com' });
    m = setField(m, [ids.A], 'attachments', [{ name: 'a.pdf', path: '/tmp/a.pdf' }]);
    m = setField(m, [ids.B], 'image', { src: 'data:image/png;base64,AAAA', w: 40, h: 30 });
    const n = lay(m).nodes.get(ids.A);
    assert.deepEqual(n.m.badges, ['notes', 'link', 'attachments']);
    assert.ok(svgOf(m).includes('data:image/png;base64,AAAA'));
  } },
  { tools: [MM, ED, LC], name: 'comments on topics (author, date) with a badge', check() {
    const { map, ids } = project();
    let m = addComment(map, ids.A, { author: 'Kim', text: 'Looks good?' });
    m = addComment(m, ids.A, { author: 'Lee', text: 'Yes' });
    assert.equal(findTopic(m, ids.A).comments.length, 2);
    assert.ok(lay(m).nodes.get(ids.A).m.badges.includes('comments'));
    assert.equal(addComment(m, ids.A, { text: '   ' }), m, 'an empty comment is not added');
    const first = findTopic(m, ids.A).comments[0].id;
    m = removeComment(m, ids.A, first);
    assert.equal(findTopic(m, ids.A).comments[0].author, 'Lee');
    const back = normalizeMap(JSON.parse(JSON.stringify(m)));
    assert.equal(findTopic(back, ids.A).comments.length, 1, 'comments are saved in the file');
  } },
  { tools: [MM, SD, LC], name: 'custom properties (data fields) on topics', check() {
    const { map, ids } = project();
    const m = setProps(map, ids.B, [{ key: 'Budget', value: '1200' }, { key: '', value: 'dropped' }, { key: 'Owner', value: 'Kim' }]);
    assert.deepEqual(findTopic(m, ids.B).props, [{ key: 'Budget', value: '1200' }, { key: 'Owner', value: 'Kim' }]);
    assert.equal(findTopic(setProps(m, ids.B, []), ids.B).props, undefined);
    assert.equal(findTopic(normalizeMap(JSON.parse(JSON.stringify(m))), ids.B).props.length, 2);
  } },
  { tools: [MM, ED], name: 'icons / markers, tags', check() {
    assert.ok(MARKERS.size >= 40);
    const { map, ids } = project();
    const icons = toggleIcon([], 'star');
    let m = setField(map, [ids.A], 'icons', icons);
    m = setField(m, [ids.A], 'tags', ['urgent']);
    assert.ok(topicMarkers(findTopic(m, ids.A)).includes('star'));
    assert.equal(usage(m).tags.get('urgent'), 1);
  } },
  { tools: [MM, ED, SD, LC], name: 'task info: priority, progress, start / due, effort, resources, milestones', check() {
    const { map, ids } = project();
    const m = setTask(map, [ids.A1], { priority: 1, progress: 50, start: '2026-01-05', due: '2026-01-09', effort: 8, resources: 'Kim', milestone: false });
    const t = findTopic(m, ids.A1).task;
    assert.deepEqual([t.priority, t.progress, t.start, t.due, t.effort, t.resources], [1, 50, '2026-01-05', '2026-01-09', 8, 'Kim']);
    assert.ok(exportCsv(m, { lang: 'en' }).includes('2026-01-09'));
  } },

  // ── views ──
  { tools: [MM, ED], name: 'Kanban board: columns are main topics, cards move between them', check() {
    const { map, ids } = project();
    // the board shows root.children as columns and their children as cards; a drop is a move
    assert.deepEqual(map.root.children.map((c) => c.text), ['A', 'B', 'C']);
    const toC = cmdMove(map, [ids.A1], ids.C, 'child');
    assert.deepEqual(findTopic(toC.map, ids.C).children.map((c) => c.text), ['A1']);
    const between = cmdMove(map, [ids.B1], ids.A2, 'before');
    assert.deepEqual(findTopic(between.map, ids.A).children.map((c) => c.text), ['A1', 'B1', 'A2']);
  } },
  { tools: [MM, ED], name: 'outline and Gantt data from the same map', check() {
    const { map, ids } = project();
    const m = setTask(map, [ids.A1], { start: '2026-02-01', due: '2026-02-03' });
    assert.ok(exportTextOutline(m).includes('\tA1'));
    assert.ok(exportCsv(m, { lang: 'en' }).split('\n').some((row) => row.includes('A1') && row.includes('2026-02-03')));
  } },
  { tools: [MM, ED, SD, LC], name: 'grid and rulers on the canvas', check() {
    assert.equal(gridCell(1), 24);
    assert.equal(gridCell(0.2), 120, 'cells grow when zoomed out');
    assert.equal(rulerStep(1), 100);
    assert.equal(rulerStep(2), 50);
    assert.equal(rulerStep(0.25), 500);
  } },

  // ── find, filter, templates ──
  { tools: [MM, ED, SD, LC], name: 'find and replace (case, whole word, regex, notes)', check() {
    const { map, ids } = project();
    const m = setField(map, [ids.B], 'notes', 'alpha beta');
    assert.deepEqual(findTopics(m, 'beta'), [ids.B]);
    assert.deepEqual(findTopics(m, '^A\\d$', { regex: true }).sort(), [ids.A1, ids.A2].sort());
    const r = replaceInTopics(m, [ids.A1, ids.A2], 'A', 'Z');
    assert.equal(findTopic(r.map, ids.A1).text, 'Z1');
  } },
  { tools: [MM, ED], name: 'filter by priority, icons, tags, progress', check() {
    const { map, ids } = project();
    const m = setTask(map, [ids.B1], { priority: 2 });
    const f = filterTopics(m, { priority: [2] });
    assert.ok(f.hits.has(ids.B1) && !f.hits.has(ids.A1));
  } },
  { tools: [MM, ED, SD, LC], name: 'templates and sample maps', check() {
    assert.ok(TEMPLATES.length >= 12);
    assert.ok(SAMPLES.length >= 16);
    for (const tpl of TEMPLATES) assert.ok(lay(mapFromTemplate(tpl.id, 'en')).nodes.size >= 1, tpl.id);
  } },

  // ── files ──
  { tools: [MM, ED, SD, LC], name: 'export: PNG, JPEG, SVG, PDF, Word, HTML, Markdown, OPML, text, FreeMind, XMind, CSV', check() {
    assert.deepEqual(EXPORTS.map((e) => e.id), ['png', 'jpeg', 'svg', 'pdf', 'docx', 'html', 'md', 'opml', 'txt', 'mm', 'xmind', 'csv']);
    const { map } = project();
    assert.ok(exportHtml(map, { lang: 'en' }).includes('<html'));
    assert.ok(exportMarkdown(map).includes('A1'));
    const docx = exportDocx(map, { lang: 'en' });
    assert.ok(docx.some((f) => f.name === 'word/document.xml'));
    const pdf = Buffer.from(buildPdf([{ jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), width: 100, height: 50 }], { title: 'x' })).toString('latin1');
    assert.ok(pdf.startsWith('%PDF'));
  } },
  { tools: [MM, ED, LC], name: 'import: FreeMind, XMind, OPML, Markdown, text outlines (MindManager .mmap too)', check() {
    const { map } = project();
    const texts = (m) => [m.root.text, ...m.root.children.map((c) => c.text)];
    assert.deepEqual(texts(importOpml(exportOpml(map))), texts(map));
    assert.deepEqual(texts(importFreeMind(exportFreeMind(map))), texts(map));
    assert.deepEqual(texts(importMarkdown(exportMarkdown(map))), texts(map));
    assert.deepEqual(texts(importTextOutline(exportTextOutline(map))), texts(map));
    const zip = writeZip(exportXmind(map).map((f) => ({ name: f.name, data: f.text })));
    assert.deepEqual(texts(importXmind(readZip(zip).map((e) => ({ name: e.name, text: e.data.toString('utf8') })))), texts(map));
  } },
  { tools: [MM, ED, SD, LC], name: 'the map file keeps everything (positions, comments, properties, summaries)', check() {
    const { map, ids } = project();
    let m = cmdNudge(map, [ids.A], 12, 34).map;
    m = setField(m, [ids.B], 'summary', { text: 'S' });
    m = addComment(m, ids.C, { author: 'a', text: 'b' });
    m = setProps(m, ids.C, [{ key: 'k', value: 'v' }]);
    const back = normalizeMap(JSON.parse(JSON.stringify(m)));
    assert.deepEqual(findTopic(back, ids.A).offset, { x: 12, y: 34 });
    assert.equal(findTopic(back, ids.B).summary.text, 'S');
    assert.equal(findTopic(back, ids.C).comments.length, 1);
    assert.equal(findTopic(back, ids.C).props[0].value, 'v');
    assert.equal(subtreeIds(back, back.root.id).length, 7);
  } },
  { tools: [MM, ED], name: 'a moved topic dropped into another branch loses its manual offset', check() {
    const { map, ids } = project();
    const m = cmdNudge(map, [ids.A1], 30, 30).map;
    const moved = cmdMove(m, [ids.A1], ids.B, 'child').map;
    assert.equal(findTopic(moved, ids.A1).offset, undefined);
    assert.equal(findTopic(removeTopics(moved, [ids.B]).map, ids.A1), null);
  } },
];

for (const f of FEATURES) {
  test(`[${f.tools.join(', ')}] ${f.name}`, () => f.check());
}
