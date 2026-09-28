'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const generator = require('../scripts/make-themes');

const THEMES_DIR = path.join(__dirname, '..', 'themes');

function readAll() {
  return fs.readdirSync(THEMES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => JSON.parse(fs.readFileSync(path.join(THEMES_DIR, entry.name, 'theme.json'), 'utf8')));
}

const themes = readAll();

describe('theme catalogue', () => {
  it('ships a usable number of themes', () => {
    assert.ok(themes.length >= 30, `only ${themes.length} themes on disk`);
  });

  it('has the same number of light and dark themes', () => {
    const dark = themes.filter((t) => t.dark).length;
    const light = themes.length - dark;
    assert.strictEqual(dark, light, `${dark} dark vs ${light} light`);
  });

  it('pairs every dark theme with a light one', () => {
    const lightIds = new Set(themes.filter((t) => !t.dark).map((t) => t.id));
    const unpaired = themes.filter((t) => t.dark && !lightIds.has(`${t.id}-light`)).map((t) => t.id);
    assert.deepStrictEqual(unpaired, [], `no light variant for: ${unpaired.join(', ')}`);
  });

  it('gives every theme a unique id and a name', () => {
    const ids = new Set();
    for (const theme of themes) {
      assert.ok(theme.id, 'a theme has no id');
      assert.ok(theme.name, `${theme.id} has no name`);
      assert.ok(!ids.has(theme.id), `duplicate id ${theme.id}`);
      ids.add(theme.id);
    }
  });

  it('includes a red family, not just one red', () => {
    const reds = generator.PALETTES.filter((p) => p.hue >= 330 || p.hue <= 30);
    assert.ok(reds.length >= 5, `only ${reds.length} palettes in the red range`);
  });
});

describe('theme contents', () => {
  it('defines the variables the dock actually reads', () => {
    const required = ['--plate-bg', '--plate-border', '--plate-radius', '--plate-shadow',
      '--sep-color', '--icon-shadow', '--indicator-color', '--tooltip-bg', '--tooltip-fg'];
    for (const theme of themes) {
      for (const key of required) {
        assert.ok(theme.variables[key], `${theme.id} is missing ${key}`);
      }
    }
  });

  it('carries a settings-window palette so the whole app re-skins', () => {
    const required = ['--bg', '--bg-raised', '--bg-sunken', '--fg', '--fg-dim', '--line', '--accent'];
    for (const theme of themes) {
      assert.ok(theme.ui, `${theme.id} has no ui block`);
      for (const key of required) {
        assert.match(theme.ui[key], /^#[0-9a-f]{6}$/i, `${theme.id}.ui${key} is not a hex colour`);
      }
    }
  });

  it('never emits a malformed colour', () => {
    const suspicious = /(#[0-9a-f]{0,5}[^0-9a-f,;)\s]|rgba\([^)]*NaN)/i;
    for (const theme of themes) {
      for (const [key, value] of Object.entries(theme.variables)) {
        assert.ok(!suspicious.test(String(value)), `${theme.id} ${key}: ${value}`);
      }
    }
  });
});

describe('colour separation', () => {
  it('gives every palette a visibly different colour', () => {
    // Hue alone is the wrong measure: two greys three degrees apart are still
    // the same grey, and the near-neutral palettes are deliberately close in
    // hue. What matters is the colour that actually comes out.
    const tooClose = [];
    for (const dark of [true, false]) {
      const bases = generator.PALETTES.map((entry) => ({
        name: entry.name,
        base: generator.paletteFor(entry, dark).base,
      }));
      for (let i = 0; i < bases.length; i += 1) {
        for (let j = i + 1; j < bases.length; j += 1) {
          const gap = colourDistance(bases[i].base, bases[j].base);
          if (gap < 6) tooClose.push(`${bases[i].name}/${bases[j].name} (${gap})`);
        }
      }
    }
    assert.deepStrictEqual(tooClose, [], `palettes look alike: ${tooClose.join(', ')}`);
  });

  it('separates the near-neutral palettes by lightness', () => {
    // Hue cannot tell these apart, so something else has to.
    const neutrals = generator.PALETTES.filter((entry) => entry.sat < 20);
    assert.ok(neutrals.length >= 3, 'expected several near-neutral palettes');

    const lightnesses = neutrals.map((entry) => 30 + (entry.lift || 0));
    assert.strictEqual(new Set(lightnesses).size, neutrals.length,
      `neutral palettes share a lightness: ${lightnesses.join(', ')}`);
  });

  it('gives dark and light variants clearly different backgrounds', () => {
    for (const entry of generator.PALETTES) {
      const dark = generator.chrome(entry, generator.paletteFor(entry, true), true);
      const light = generator.chrome(entry, generator.paletteFor(entry, false), false);
      assert.ok(luminance(dark['--bg']) < 0.3, `${entry.slug} dark bg is not dark`);
      assert.ok(luminance(light['--bg']) > 0.7, `${entry.slug} light bg is not light`);
    }
  });

  it('keeps text readable against its own background', () => {
    for (const theme of themes) {
      const gap = Math.abs(luminance(theme.ui['--fg']) - luminance(theme.ui['--bg']));
      assert.ok(gap > 0.5, `${theme.id}: foreground and background are too close (${gap.toFixed(2)})`);
    }
  });
});

describe('hsl conversion', () => {
  it('produces the expected primaries', () => {
    assert.strictEqual(generator.hsl(0, 100, 50), '#ff0000');
    assert.strictEqual(generator.hsl(120, 100, 50), '#00ff00');
    assert.strictEqual(generator.hsl(240, 100, 50), '#0000ff');
  });

  it('produces greys when saturation is zero', () => {
    assert.strictEqual(generator.hsl(200, 0, 0), '#000000');
    assert.strictEqual(generator.hsl(200, 0, 100), '#ffffff');
  });

  it('wraps hues past 360', () => {
    assert.strictEqual(generator.hsl(360, 100, 50), generator.hsl(0, 100, 50));
    assert.strictEqual(generator.hsl(420, 100, 50), generator.hsl(60, 100, 50));
  });
});

function colourDistance(a, b) {
  const rgb = (hex) => {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.round(Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2));
}

function luminance(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
