const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { describe, it } = require('../lib/framework');

const RENDERER = path.join(__dirname, '../../src/renderer');
const CSS_DIR = path.join(RENDERER, 'css');
const css = fs.readFileSync(path.join(CSS_DIR, 'style.css'), 'utf8');

function cssBlock(selector) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return '';
  return css.slice(start, css.indexOf('}', start));
}

function cssVars(block) {
  const vars = {};
  for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) vars[m[1]] = m[2].trim();
  return vars;
}

const light = cssVars(cssBlock(':root'));
const dark = cssVars(cssBlock('[data-theme="dark"]'));

function strokeColor(dataUri) {
  const m = decodeURIComponent(dataUri).match(/stroke='(#[0-9A-Fa-f]{6})'/);
  return m ? m[1].toUpperCase() : null;
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe('Light / Dark theme styles', () => {
  it('defines the light theme variables in :root', () => {
    for (const v of ['--bg', '--bg-card', '--text', '--border', '--primary', '--danger']) {
      assert.ok(light[v], `missing ${v} in :root`);
    }
  });

  it('overrides only variables that also exist in the light theme', () => {
    const extra = Object.keys(dark).filter((k) => !(k in light));
    assert.deepEqual(extra, [], `dark-only variables: ${extra.join(', ')}`);
  });

  it('uses a dark background and light text in the dark theme', () => {
    assert.ok(luminance(dark['--bg']) < luminance(light['--bg']));
    assert.ok(luminance(dark['--text']) > luminance(light['--text']));
  });

  it('uses a dark calendar icon in light theme and a light one in dark theme', () => {
    const lightStroke = strokeColor(light['--calendar-icon-image']);
    const darkStroke = strokeColor(dark['--calendar-icon-image']);
    assert.ok(lightStroke && darkStroke, 'both themes must define --calendar-icon-image');
    assert.notEqual(lightStroke, darkStroke);
    assert.ok(luminance(lightStroke) < 0.2, `light theme icon ${lightStroke} should be dark`);
    assert.ok(luminance(darkStroke) > 0.6, `dark theme icon ${darkStroke} should be light`);
  });

  it('applies the calendar icon to card-edit and burndown date inputs', () => {
    assert.match(css, /input\[type="date"\]\.form-control\s*\{[^}]*background-image:\s*var\(--calendar-icon-image\)/);
    assert.match(css, /input\[type="date"\]\.form-control\.chart-date-input\s*\{[^}]*padding:[^;]*36px/);
    assert.match(css, /::-webkit-calendar-picker-indicator\s*\{[^}]*opacity:\s*0/);
  });

  it('defines theme-aware menubar and toolbar icon colors', () => {
    for (const v of ['--icon-menubar', '--icon-toolbar']) {
      assert.ok(light[v] && dark[v], `${v} must be defined in both themes`);
      assert.ok(luminance(dark[v]) > luminance(light[v]), `${v} should be brighter in dark theme`);
    }
  });

  it('uses a separate login background pattern for each theme', () => {
    assert.match(light['--login-pattern-image'], /login-pattern-light\.svg/);
    assert.match(dark['--login-pattern-image'], /login-pattern-dark\.svg/);
    assert.match(cssBlock('.login-wrap'), /background-image:\s*var\(--login-pattern-image\)/);
  });

  for (const theme of ['light', 'dark']) {
    it(`renders a visible ${theme} login pattern SVG`, () => {
      const file = path.join(CSS_DIR, `login-pattern-${theme}.svg`);
      assert.ok(fs.existsSync(file), `${file} is missing`);
      const svg = fs.readFileSync(file, 'utf8');
      assert.match(svg, /^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      assert.match(svg, /<\/svg>\s*$/);
      const opacities = [...svg.matchAll(/stroke-opacity="([\d.]+)"/g)].map((m) => Number(m[1]));
      assert.ok(opacities.length > 10, 'pattern should contain many arcs');
      assert.ok(Math.max(...opacities) >= 0.2, `max stroke-opacity ${Math.max(...opacities)} is too faint`);
      const stroke = svg.match(/stroke="(#[0-9A-Fa-f]{6})"/)[1];
      const bg = theme === 'light' ? light['--bg'] : dark['--bg'];
      const contrast = Math.abs(luminance(stroke) - luminance(bg));
      assert.ok(contrast > 0.35, `stroke ${stroke} has too little contrast against ${bg}`);
    });
  }

  it('draws the ideal burndown line in red (--danger)', () => {
    const board = fs.readFileSync(path.join(RENDERER, 'js/board.js'), 'utf8');
    assert.match(board, /const danger = getThemeCssVar\('--danger'/);
    assert.match(board, /idealLine:\s*danger/);
    for (const hex of [light['--danger'], dark['--danger']]) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      assert.ok(r > g && r > b, `${hex} should be a red tone`);
    }
  });

  it('references only renderer scripts that exist', () => {
    const html = fs.readFileSync(path.join(RENDERER, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map((m) => m[1]);
    assert.ok(scripts.length >= 5);
    for (const s of scripts) assert.ok(fs.existsSync(path.join(RENDERER, s)), `${s} is missing`);
  });
});
