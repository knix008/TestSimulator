// Colour icons: every icon has a hue of its own, chosen by meaning, readable on every theme.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICON_TONES, TONE_OF, toneOf } from '../../src/icon-tones.js';
import { icon, ICON_NAMES } from '../../src/icons.js';
import { contrastRatio, THEMES } from '../../src/themes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const css = fs.readFileSync(path.join(root, 'src', 'icon-tones.css'), 'utf8');

/** The --tone-* colours of one block of icon-tones.css. */
function shades(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `block ${selector}`);
  const block = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...block.matchAll(/--tone-([a-z]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}
const LIGHT = shades(':root');
const DARK = shades(':root[data-theme-mode="dark"], .tones-dark, .viewer');

test('icons: every icon has its own hue, set on purpose (no fallback)', () => {
  assert.ok(ICON_NAMES.length >= 60);
  for (const name of ICON_NAMES) {
    assert.ok(Object.hasOwn(TONE_OF, name), `${name} has a tone`);
    assert.ok(ICON_TONES.includes(TONE_OF[name]), `${name}: ${TONE_OF[name]} is a known tone`);
  }
  // No tone for an icon that does not exist (a typo would leave an icon uncoloured).
  for (const name of Object.keys(TONE_OF)) assert.ok(ICON_NAMES.includes(name), `${name} is an icon`);
  // Many hues, not one colour everywhere.
  assert.ok(new Set(ICON_NAMES.map(toneOf)).size >= 12, 'at least 12 hues in use');
});

test('icons: the hue follows the meaning', () => {
  const expect = {
    red: ['trash', 'close', 'stop', 'record'],
    green: ['play', 'check', 'zoomIn', 'zoomOut', 'fit', 'actual'],
    amber: ['folder', 'clock', 'pause'],
    blue: ['info', 'book'],
    pink: ['palette'],
    slate: ['gear', 'sliders'],
    cyan: ['copy'],
    yellow: ['bulb'],
  };
  for (const [tone, names] of Object.entries(expect)) for (const name of names) assert.equal(toneOf(name), tone, name);
  assert.equal(toneOf('no-such-icon'), 'slate');
});

test('icons: the markup carries the tone, and closed shapes a light wash', () => {
  for (const name of ICON_NAMES) {
    const svg = icon(name);
    assert.match(svg, new RegExp(`^<svg class="icon" data-icon="${name}" data-tone="${toneOf(name)}"`), name);
    assert.match(svg, /stroke="currentColor"/);
  }
  assert.match(icon('camera'), /data-wash=""/, 'camera body is a closed shape');
  assert.match(icon('stop'), /data-wash=""/);
  assert.doesNotMatch(icon('pause'), /data-wash/, 'two strokes: nothing to fill');
  assert.match(icon('trash', 'icon big'), /^<svg class="icon big" data-icon="trash" data-tone="red"/, 'extra classes kept');
});

test('icons: a light and a dark shade for every hue, and a colour rule for each', () => {
  assert.deepEqual(Object.keys(LIGHT).sort(), [...ICON_TONES].sort());
  assert.deepEqual(Object.keys(DARK).sort(), [...ICON_TONES].sort());
  for (const tone of ICON_TONES) {
    assert.match(css, new RegExp(`\\.icon\\[data-tone="${tone}"\\] \\{ color: var\\(--tone-${tone}\\) !important; \\}`), tone);
    assert.notEqual(LIGHT[tone], DARK[tone], `${tone}: different shades for light and dark`);
  }
  // Icons on solid coloured buttons keep the button's contrasting colour.
  for (const selector of ['.shutter-disc .icon[data-tone]', '.primary .icon[data-tone]', '.recbar-button.stop .icon[data-tone]', '.viewer-main .icon[data-tone]']) {
    assert.ok(css.includes(selector), selector);
  }
  assert.match(css, /\{ color: inherit !important; \}/);
});

test('icons: every hue stands out on every theme (3:1 against the background and the panels)', () => {
  const weak = [];
  for (const theme of THEMES) {
    const set = theme.mode === 'dark' ? DARK : LIGHT;
    for (const tone of ICON_TONES) {
      for (const surface of ['--bg', '--panel']) {
        const ratio = contrastRatio(set[tone], theme.vars[surface]);
        if (ratio < 3) weak.push(`${theme.id} ${tone} on ${surface}: ${ratio.toFixed(2)}`);
      }
    }
  }
  assert.deepEqual(weak, []);
});

test('icons: the dark recording bar and the viewer use the bright shades; every window loads the colours', () => {
  assert.match(fs.readFileSync(path.join(root, 'src', 'recbar.js'), 'utf8'), /class="recbar tones-dark"/);
  for (const file of ['app.js', 'popup.js', 'recbar.js']) {
    assert.match(fs.readFileSync(path.join(root, 'src', file), 'utf8'), /import '\.\/icon-tones\.css';/, `${file} loads icon-tones.css`);
  }
});

test('toolbar: every segmented option has an icon, in the toolbar and in Settings', async () => {
  const { SEGMENT_ICONS, widgets, imageFormatItems, FORMAT_ICONS } = await import('../../src/ui.js');
  const { IMAGE_FORMATS } = await import('../../src/domain/settings.js');
  for (const [option, glyph] of Object.entries(SEGMENT_ICONS)) assert.ok(ICON_NAMES.includes(glyph), `${option}: ${glyph} is an icon`);
  // The controls the toolbar and Settings build: each option shows its icon before its label.
  const ui = widgets(() => ({ imageFormat: 'png' }));
  const controls = {
    engine: ['display', 'native'], videoFormat: ['mp4', 'webm'], fps: [15, 30, 60], language: ['ko', 'en'],
    sidebarCollapsed: ['false', 'true'], historyCollapsed: ['false', 'true'], startBgMotion: ['animated', 'still', 'off'], customMode: ['dark', 'light'],
  };
  for (const [key, values] of Object.entries(controls)) {
    const html = ui.segmented(key, values.map((value) => [value, `label-${value}`]), values[0]);
    const segments = [...html.matchAll(/<button role="radio"[^>]*data-key="([^"]+)" data-value="([^"]+)"[^>]*>(.*?)<\/button>/gs)];
    assert.equal(segments.length, values.length, key);
    for (const [, , value, inner] of segments) {
      assert.match(inner, new RegExp(`^<svg class="icon" data-icon="${SEGMENT_ICONS[`${key}:${value}`]}" data-tone="[a-z]+"`), `${key}:${value} has its icon`);
      assert.match(inner, new RegExp(`<span>label-${value}</span>$`), `${key}:${value} keeps its label`);
    }
  }
  // Image format: a button (a native <select> list cannot show icons) and a menu with one icon per format.
  const picker = ui.imageFormatPicker();
  assert.doesNotMatch(picker, /<select/);
  assert.match(picker, /data-action="format-menu"/);
  assert.match(picker, /data-icon="images"[^>]*>.*<span>PNG<\/span>.*data-icon="chevronDown"/s, 'current format with its icon');
  const items = imageFormatItems('webp');
  assert.deepEqual(items.map((item) => item.command), IMAGE_FORMATS.map((format) => `image-format:${format}`));
  for (const item of items) assert.ok(ICON_NAMES.includes(item.icon) && item.label, item.command);
  assert.deepEqual(items.filter((item) => item.hint === '✓').map((item) => item.command), ['image-format:webp'], 'the current format is ticked');
  assert.deepEqual(Object.keys(FORMAT_ICONS).sort(), [...IMAGE_FORMATS].sort());
  assert.match(ui.imageFormatPicker(true), / disabled>/);
});
