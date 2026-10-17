// Icons: every command has its own picture (no two commands share one), every
// icon used exists (commands, element types, diagram kinds, toolbox tools,
// templates), and the menu headings have distinct icons too.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ICON_NAMES, icon } from '../../src/icons.js';
import { TEMPLATES } from '../../src/domain/templates.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const app = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');

/** The commands table of app.js: id → icon (including the generated line-style, layout and theme commands). */
function commandIcons() {
  const block = app.slice(app.indexOf('const commands = {'), app.indexOf('function commandEnabled'));
  const out = new Map();
  for (const match of block.matchAll(/^\s+'?([\w:]+)'?: \{ icon: '(\w+)'/gm)) out.set(match[1], match[2]);
  for (const s of ['rectilinear', 'oblique', 'roundRect', 'curve']) out.set(`lineStyle:${s}`, `line${s[0].toUpperCase()}${s.slice(1)}`);
  for (const d of ['TB', 'BT', 'LR', 'RL']) out.set(`layout:${d}`, `layout${d}`);
  for (const s of ['label', 'decoration', 'icon', 'none']) out.set(`stereotype:${s}`, `stereo${s[0].toUpperCase()}${s.slice(1)}`);
  const lineStyleMenu = /commands\.lineStyleMenu = \{ icon: '(\w+)'/.exec(app);
  if (lineStyleMenu) out.set('lineStyleMenu', lineStyleMenu[1]);
  return out;
}

test('the command table is complete', () => {
  const icons = commandIcons();
  assert.ok(icons.size >= 120, `found ${icons.size} commands`);
});

test('no two commands share an icon', () => {
  const byIcon = new Map();
  // Dropdown arrows of split buttons all show the same chevron.
  for (const [id, name] of [...commandIcons()].filter(([, icon]) => icon !== 'chevronDown')) {
    if (!byIcon.has(name)) byIcon.set(name, []);
    byIcon.get(name).push(id);
  }
  const shared = [...byIcon].filter(([, ids]) => ids.length > 1).map(([name, ids]) => `${name}: ${ids.join(', ')}`);
  assert.deepEqual(shared, []);
});

test('every icon a command, menu, template or the code uses exists', () => {
  const missing = [...commandIcons()].filter(([, name]) => !ICON_NAMES.includes(name)).map(([id, name]) => `${id} → ${name}`);
  assert.deepEqual(missing, []);
  for (const [id, , glyph] of TEMPLATES) assert.ok(ICON_NAMES.includes(glyph), id);
  const used = new Set();
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      if (fs.statSync(file).isDirectory()) walk(file);
      else if (name.endsWith('.js')) for (const match of fs.readFileSync(file, 'utf8').matchAll(/icon\('(\w+)'/g)) used.add(match[1]);
    }
  };
  walk(path.join(root, 'src'));
  assert.deepEqual([...used].filter((name) => !ICON_NAMES.includes(name)), []);
});

test('every element type, diagram kind and toolbox tool has an icon', async () => {
  const { TYPES, VIEW_ONLY } = await import('../../src/domain/meta.js');
  const { TOOLBOX } = await import('../../src/domain/toolbox.js');
  for (const [type, def] of [...Object.entries(TYPES), ...Object.entries(VIEW_ONLY)]) assert.ok(ICON_NAMES.includes(def.icon), `${type} → ${def.icon}`);
  for (const [diagram, groups] of Object.entries(TOOLBOX)) for (const [, , , tools] of groups) for (const tool of tools) assert.ok(ICON_NAMES.includes(tool.icon), `${diagram} › ${tool.id} → ${tool.icon}`);
});

test('menu headings have their own icons', () => {
  const menus = /const MENU_ICONS = \{([^}]+)\}/.exec(app)[1];
  const icons = [...menus.matchAll(/(\w+): '(\w+)'/g)].map((m) => m[2]);
  assert.equal(new Set(icons).size, icons.length);
  assert.equal(icons.length, 8);
});

test('the toolbar shows only commands, each once', () => {
  const toolbar = /const TOOLBAR = (\[[\s\S]*?\]);/.exec(app)[1];
  const ids = [...toolbar.matchAll(/'(\w+)'/g)].map((m) => m[1]).filter((id) => !['zoom', 'fillSplit', 'lineSplit', 'themeSplit', 'exportSplit'].includes(id));
  const commands = commandIcons();
  for (const id of ids) assert.ok(commands.has(id), `toolbar button ${id} is a command`);
  assert.equal(new Set(ids).size, ids.length);
});

test('icons are well-formed SVG with a fallback', () => {
  for (const name of ICON_NAMES) {
    const svg = icon(name);
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), name);
    assert.equal((svg.match(/<svg/g) ?? []).length, 1, `${name}: one svg element`);
  }
  assert.ok(icon('no-such-icon').includes('<circle'), 'unknown names show a dot');
});
