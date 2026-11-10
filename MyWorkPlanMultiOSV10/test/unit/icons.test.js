// Icons: every command has its own picture (no two commands share one), every
// icon used exists, and the menu headings have distinct icons too.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ICON_NAMES, icon } from '../../src/icons.js';
import { TEMPLATES } from '../../src/domain/templates.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const app = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');

/** The commands table of app.js: id → icon (including the generated view and report commands). */
function commandIcons() {
  const block = app.slice(app.indexOf('const commands = {'), app.indexOf('function commandEnabled'));
  const out = new Map();
  for (const match of block.matchAll(/^\s+'?([\w:]+)'?: \{ icon: '(\w+)'/gm)) out.set(match[1], match[2]);
  const views = /const VIEW_ICONS = \{([^}]+)\}/.exec(app)[1];
  for (const match of views.matchAll(/(\w+): '(\w+)'/g)) out.set(`view:${match[1]}`, match[2]);
  const reports = fs.readFileSync(path.join(root, 'src', 'views', 'reports.js'), 'utf8');
  const list = /export const REPORTS = \[([\s\S]*?)\];/.exec(reports)[1];
  for (const match of list.matchAll(/\['(\w+)', '(\w+)'\]/g)) out.set(`report:${match[1]}`, match[2]);
  return out;
}

test('the command table is complete', () => {
  const icons = commandIcons();
  assert.ok(icons.size >= 110, `found ${icons.size} commands`);
});

test('no two commands share an icon', () => {
  const byIcon = new Map();
  for (const [id, name] of commandIcons()) {
    if (!byIcon.has(name)) byIcon.set(name, []);
    byIcon.get(name).push(id);
  }
  const shared = [...byIcon].filter(([, ids]) => ids.length > 1).map(([name, ids]) => `${name}: ${ids.join(', ')}`);
  assert.deepEqual(shared, []);
});

test('every icon a command, menu, template or the code uses exists', () => {
  const missing = [...commandIcons()].filter(([, name]) => !ICON_NAMES.includes(name)).map(([id, name]) => `${id} → ${name}`);
  assert.deepEqual(missing, []);
  for (const template of TEMPLATES) assert.ok(ICON_NAMES.includes(template.icon), template.id);
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

test('menu headings have their own icons', () => {
  const menus = /const MENU_ICONS = \{([^}]+)\}/.exec(app)[1];
  const icons = [...menus.matchAll(/(\w+): '(\w+)'/g)].map((m) => m[2]);
  assert.equal(new Set(icons).size, icons.length);
  assert.equal(icons.length, 8);
});

test('the toolbar shows only commands, each once', () => {
  const toolbar = /const TOOLBAR = (\[[\s\S]*?\]);/.exec(app)[1];
  const ids = [...toolbar.matchAll(/'(\w+)'/g)].map((m) => m[1]).filter((id) => !['zoom', 'viewSplit'].includes(id));
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

// ── colours (icon-tones.js): every icon of every window has a hue of its own
test('every icon has a colour, and icons carry it in every window', async () => {
  const { ICON_TONES, toneOf } = await import('../../src/icon-tones.js');
  for (const name of ICON_NAMES) assert.ok(ICON_TONES.includes(toneOf(name)), `${name} has a tone`);
  for (const name of ICON_NAMES) assert.match(icon(name), new RegExp(`data-tone="${toneOf(name)}"`), name);
  // Meaning: delete is red, open is amber, save is indigo, print is purple.
  assert.equal(toneOf('trash'), 'red');
  assert.equal(toneOf('folderOpen'), 'amber');
  assert.equal(toneOf('save'), 'indigo');
  assert.equal(toneOf('print'), 'purple');
  assert.equal(toneOf('reportLabor'), 'brown');
  // The toolbar is not one hue: its commands use many colours.
  const icons = commandIcons();
  const hues = new Set([...icons.values()].map((name) => toneOf(name)));
  assert.ok(hues.size >= 10, `commands use ${hues.size} hues`);
  const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
  for (const tone of ICON_TONES) assert.ok(css.includes(`.icon[data-tone="${tone}"] { color: var(--tone-${tone}) !important; }`), `${tone} is styled`);
  assert.match(css, /:root\[data-mode="dark"\] \{[^}]*--tone-blue/, 'brighter shades on dark themes');
  assert.match(fs.readFileSync(path.join(root, 'src', 'themes.js'), 'utf8'), /root\.dataset\.mode = theme\.dark \? 'dark' : 'light'/, 'popups and the main window mark dark themes');
});
