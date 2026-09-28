'use strict';

/**
 * Guards the rule that every native menu entry carries an icon.
 *
 * Runs on plain Node (no Electron): it checks the menu templates in the source
 * and the glyph files on disk, which is what actually breaks when someone adds
 * a menu item later and forgets the icon.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const glyphs = require('../scripts/menu-glyphs');

const MENU_SOURCES = [
  path.join(ROOT, 'src', 'main', 'tray.js'),
  path.join(ROOT, 'src', 'main', 'ipc.js'),
];

/**
 * Object literals that are Electron menu entries.
 *
 * A menu entry always pairs `label:` with one of `click:`, `submenu:` or
 * `enabled:` — which is what separates it from the other label-bearing
 * structures in these files (dock items, display descriptors, dialog filters)
 * that must not be required to carry an icon. `type:` is deliberately not in
 * that list: a dock item has `type: 'app'` and a label, but is not a menu
 * entry, while a `{ type: 'separator' }` menu entry has no label to begin with.
 */
function menuEntries(source) {
  const entries = [];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] !== '{') continue;
    let depth = 0;
    let end = -1;
    for (let j = i; j < source.length; j += 1) {
      if (source[j] === '{') depth += 1;
      else if (source[j] === '}') {
        depth -= 1;
        if (depth === 0) { end = j; break; }
      }
    }
    if (end === -1) continue;
    const block = source.slice(i, end + 1);
    const looksLikeMenuEntry = /(^|[\s{,])label:/.test(block)
      && /(^|[\s{,])(click|submenu|enabled):/.test(block);
    if (looksLikeMenuEntry && block.length < 900) {
      entries.push(block);
      i = end;
    }
  }
  return entries;
}

test('every menu entry in the source declares an icon', () => {
  const missing = [];

  for (const file of MENU_SOURCES) {
    const source = fs.readFileSync(file, 'utf8');
    for (const block of menuEntries(source)) {
      if (/type:\s*'separator'/.test(block)) continue;
      // `icon: x` or the shorthand `icon` - both supply one.
      if (/(^|[\s{,])icon\s*[:,}]/.test(block)) continue;
      const label = /label:\s*([^,\n]+)/.exec(block);
      missing.push(`${path.basename(file)}: ${label ? label[1].trim() : block.slice(0, 60)}`);
    }
  }

  assert.deepStrictEqual(missing, [], `menu entries without an icon:\n  ${missing.join('\n  ')}`);
});

test('every glyph name used by the menus has a generated png', () => {
  const dir = path.join(ROOT, 'build', 'menu');
  const used = new Set();

  for (const file of MENU_SOURCES) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/menuIcons\.get\((['`])([^'`$]+)\1\)/g)) {
      used.add(match[2]);
    }
    // Template-literal forms such as `pos-${position}` expand to every variant.
    for (const match of source.matchAll(/menuIcons\.get\(`([a-z-]+)-\$\{[^}]+\}([a-z-]*)`\)/g)) {
      for (const suffix of ['bottom', 'top', 'left', 'right', 'bottom-left', 'bottom-right', 'top-left', 'top-right']) {
        used.add(`${match[1]}-${suffix}${match[2]}`);
      }
    }
  }

  assert.ok(used.size > 0, 'expected the menus to reference at least one glyph');

  const absent = [...used].filter((name) => !fs.existsSync(path.join(dir, `${name}.png`)));
  assert.deepStrictEqual(absent, [], `glyphs referenced but not generated: ${absent.join(', ')}`);
});

test('make-icons emits a 1x and a 2x png for every glyph', () => {
  const dir = path.join(ROOT, 'build', 'menu');
  const incomplete = glyphs.NAMES.filter((name) =>
    !fs.existsSync(path.join(dir, `${name}.png`)) || !fs.existsSync(path.join(dir, `${name}@2x.png`)));

  assert.deepStrictEqual(incomplete, [], `glyphs missing a size: ${incomplete.join(', ')}`);
});

test('glyph svgs are well formed', () => {
  for (const name of glyphs.NAMES) {
    const svg = glyphs.svg(name);
    assert.match(svg, /^<svg[^>]+viewBox="0 0 64 64"/, `${name}: unexpected root element`);
    assert.ok(svg.trim().endsWith('</svg>'), `${name}: unterminated svg`);
    const open = (svg.match(/<(?!\/)[a-z]/g) || []).length;
    assert.ok(open > 1, `${name}: svg has no content`);
  }
});
