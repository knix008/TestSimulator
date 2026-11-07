// The icons of non-UML diagrams: 100 in the library, the user's own, stored safely, drawn everywhere.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as M from '../../src/domain/model.js';
import * as E from '../../src/domain/edit.js';
import { DIAGRAM_TYPES } from '../../src/domain/meta.js';
import { toolById, toolboxFor } from '../../src/domain/toolbox.js';
import { addMyIcon, ICON_GROUPS, isIconSource, libraryIcon, LIBRARY_ICONS, loadMyIcons, MY_ICON_MAX_BYTES, MY_ICONS_MAX, removeMyIcon, storeMyIcons } from '../../src/domain/iconlib.js';
import { renderDiagramSvg } from '../../src/render/notation.js';
import { parseProject, serialize } from '../../src/domain/format.js';
import { validate } from '../../src/domain/validate.js';
import { exportMdj, importMdj } from '../../src/domain/interop/staruml.js';
import { hasIcon } from '../../src/icons.js';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const memory = () => { const data = new Map(); return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }; };
const draw = (type, attrs = {}) => {
  const project = M.createProject({ name: 'P', language: 'en', diagram: null });
  const diagram = M.addDiagram(project, project.ownedElements[0]._id, type, { language: 'en' });
  const tool = toolById(type, 'insertIcon');
  const { view } = E.createNode(project, diagram, { ...tool, view: { ...tool.view, ...attrs } }, { x: 10, y: 10, w: 0, h: 0 }, { language: 'en' });
  return { project, diagram, view };
};

test('the library has exactly 100 icons in ten groups, each with names, a colour and a drawing', () => {
  assert.equal(ICON_GROUPS.length, 10);
  assert.equal(LIBRARY_ICONS.length, 100);
  assert.equal(new Set(LIBRARY_ICONS.map((i) => i.id)).size, 100, 'ids are unique');
  assert.equal(new Set(LIBRARY_ICONS.map((i) => i.body)).size, 100, 'every drawing differs');
  for (const group of ICON_GROUPS) assert.equal(group.icons.length, 10, group.id);
  for (const item of LIBRARY_ICONS) {
    assert.ok(item.ko && item.en, item.id);
    assert.match(item.ko, /[가-힣A-Z]/, item.id);
    assert.match(item.color, /^#[0-9a-f]{6}$/);
    assert.match(item.body, /^<(path|circle|rect|ellipse)\b/, item.id);
    assert.ok(!/<script|on[a-z]+=|href/i.test(item.body), `${item.id}: nothing active`);
    const tags = item.body.match(/<(path|circle|rect|ellipse)\b[^>]*\/>/g).join('');
    assert.equal(tags, item.body, `${item.id}: only closed shapes`);
    for (const d of item.body.matchAll(/ d="([^"]*)"/g)) assert.match(d[1], /^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+$/, `${item.id}: path data`);
  }
  assert.equal(libraryIcon('star').en, 'Star');
  assert.equal(libraryIcon('nope'), undefined);
});

test('every diagram outside UML has the icon tool, and no UML diagram has it', () => {
  const types = Object.keys(DIAGRAM_TYPES);
  for (const type of types) {
    const tool = toolById(type, 'insertIcon');
    if (type.startsWith('UML')) assert.equal(tool, null, type);
    else {
      assert.ok(tool && hasIcon(tool.icon), type);
      assert.deepEqual(toolboxFor(type)[0].slice(0, 3), ['icons', '아이콘', 'Icons'], `${type}: its own group, at the top where it is seen`);
    }
  }
  assert.ok(types.filter((t) => !t.startsWith('UML')).length >= 20);
});

test('every library icon draws on a diagram, in its colour, at any size', () => {
  for (const item of LIBRARY_ICONS) {
    const { project, diagram, view } = draw('FCFlowchartDiagram', { iconId: item.id });
    const { svg } = renderDiagramSvg(project, diagram, {});
    assert.ok(svg.includes(item.body), item.id);
    assert.ok(svg.includes(`stroke="${item.color}"`), `${item.id}: colour`);
    assert.equal(view.iconId, item.id);
    assert.ok(!/NaN|undefined/.test(svg), item.id);
  }
  const { project, diagram, view } = draw('C4Diagram', { iconId: 'star', lineColor: '#123456' });
  view.width = 200; view.height = 100;
  const { svg } = renderDiagramSvg(project, diagram, {});
  assert.ok(svg.includes('stroke="#123456"'), 'the line colour of the Style panel wins');
  assert.match(svg, /scale\(4\.1|scale\(4\)/, 'keeps its proportions');
});

test('the icon renders in every kind of non-UML diagram', () => {
  for (const type of Object.keys(DIAGRAM_TYPES).filter((t) => !t.startsWith('UML'))) {
    const { project, diagram } = draw(type, { iconId: 'cloud' });
    assert.ok(renderDiagramSvg(project, diagram, {}).svg.includes(libraryIcon('cloud').body), type);
    assert.deepEqual(validate(project), [], type);
  }
});

test('a project stores the id, never a drawing; it survives saving and StarUML', () => {
  const { project, diagram } = draw('NetworkDiagram', { iconId: 'router' });
  const text = serialize(project);
  assert.ok(!text.includes(libraryIcon('router').body), 'no markup in the file');
  const again = parseProject(text).project;
  assert.equal(M.allDiagrams(again)[0].ownedViews[0].iconId, 'router');
  const imported = importMdj(exportMdj(project));
  assert.equal(M.allDiagrams(imported.project ?? imported)[0].ownedViews.find((v) => v._type === 'IconView').iconId, 'router');
  assert.ok(renderDiagramSvg(project, diagram, {}).svg.includes('<g transform'));
});

test('a file cannot put markup or scripts on the page through an icon', () => {
  const evil = '"><script>alert(1)</script>';
  for (const fields of [{ iconId: evil }, { iconId: 'star', src: evil }, { iconId: 'star', src: 'javascript:alert(1)' }, { iconId: 'star', src: 'https://example.com/x.png' }, { iconId: 'star', src: `data:text/html,${evil}` }]) {
    const { project, diagram } = draw('WBSDiagram', fields);
    const { svg } = renderDiagramSvg(project, diagram, {});
    assert.ok(!svg.includes('<script') && !svg.includes('javascript:') && !svg.includes('example.com') && !svg.includes('text/html'), JSON.stringify(fields));
  }
  const { project, diagram } = draw('WBSDiagram', { iconId: 'gone' });
  assert.ok(renderDiagramSvg(project, diagram, {}).svg.includes('stroke-dasharray'), 'an unknown icon shows a placeholder');
});

test('the user\'s icons: added, drawn as pictures, kept, removed, limited', () => {
  assert.ok(isIconSource(PNG) && isIconSource('data:image/svg+xml;base64,AAAA'));
  for (const bad of ['data:text/html,x', 'http://x/y.png', 7, null]) assert.equal(isIconSource(bad), false, String(bad));
  const storage = memory();
  assert.deepEqual(loadMyIcons(storage), []);
  const first = addMyIcon([], { name: ' Logo ', src: PNG }, 'a');
  assert.deepEqual(first.icon, { id: 'a', name: 'Logo', src: PNG });
  storeMyIcons(storage, first.list);
  assert.deepEqual(loadMyIcons(storage), first.list);
  assert.equal(addMyIcon(first.list, { name: 'again', src: PNG }).list.length, 1, 'the same picture is not added twice');
  assert.equal(addMyIcon([], { src: 'data:text/html,x' }).error, 'type');
  assert.equal(addMyIcon([], { src: `data:image/png;base64,${'A'.repeat(MY_ICON_MAX_BYTES)}` }).error, 'size');
  assert.equal(addMyIcon(Array.from({ length: MY_ICONS_MAX }, (_, i) => ({ id: String(i), src: PNG + i })), { src: `${PNG}x` }).error, 'count');
  assert.deepEqual(removeMyIcon(first.list, 'a'), []);
  storage.setItem('myumlmaker.myIcons.v1', '{broken');
  assert.deepEqual(loadMyIcons(storage), [], 'a broken list is an empty list');
  storage.setItem('myumlmaker.myIcons.v1', JSON.stringify([{ id: 'x', src: 'javascript:1' }, { id: 'y', name: 'ok', src: PNG }]));
  assert.deepEqual(loadMyIcons(storage).map((i) => i.id), ['y'], 'only pictures are kept');
  const { project, diagram } = draw('C4Diagram', { iconId: 'y', src: PNG });
  assert.ok(renderDiagramSvg(project, diagram, {}).svg.includes(`<image href="${PNG}"`));
});
