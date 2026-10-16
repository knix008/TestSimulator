'use strict';

/**
 * Guards the glyphs every native menu entry and settings tab draws.
 *
 * That each menu entry *declares* an icon is checked in Rust, next to the
 * menus (src-tauri/src/menus.rs); this checks the pictures exist at both sizes
 * and that the settings window only asks for ones that do.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'build', 'menu');
const glyphs = require('../scripts/menu-glyphs');

test('make-icons emits a 1x and a 2x png for every glyph', () => {
  const incomplete = glyphs.NAMES.filter((name) =>
    !fs.existsSync(path.join(DIR, `${name}.png`)) || !fs.existsSync(path.join(DIR, `${name}@2x.png`)));
  assert.deepStrictEqual(incomplete, [], `glyphs missing a size: ${incomplete.join(', ')}`);
});

test('every position and language glyph the menus pick by name is generated', () => {
  // Built from a name at run time (`pos-${position}-active`, `flag-${lang}`),
  // so no search of the source would find them. The glyphs the menus name
  // outright are checked next to the menus, in src-tauri/src/menus.rs.
  const used = ['flag-ko', 'flag-en', 'theme', 'theme-active'];
  for (const pos of ['bottom', 'top', 'left', 'right', 'bottom-left', 'bottom-right', 'top-left', 'top-right']) {
    used.push(`pos-${pos}`, `pos-${pos}-active`);
  }
  const absent = used.filter((name) => !fs.existsSync(path.join(DIR, `${name}.png`)));
  assert.deepStrictEqual(absent, [], `glyphs referenced but not generated: ${absent.join(', ')}`);
});

test('every glyph a settings tab shows is generated', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'js', 'settings.js'), 'utf8');
  const block = source.slice(source.indexOf('const TAB_ICONS'), source.indexOf('};', source.indexOf('const TAB_ICONS')));
  const used = [...block.matchAll(/:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);
  assert.ok(used.length >= 8);
  const absent = used.filter((name) => !fs.existsSync(path.join(DIR, `${name}.png`)));
  assert.deepStrictEqual(absent, [], `tab glyphs not generated: ${absent.join(', ')}`);
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
