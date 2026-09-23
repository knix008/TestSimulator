'use strict';

/**
 * Generates the built-in themes into `themes/<id>/theme.json`.
 *
 * Every theme comes from one entry in PALETTES, and each entry produces a
 * matching dark and light theme. That is what keeps the two families the same
 * size, and it means a change to how (say) glass highlights work applies to all
 * of them at once instead of to three dozen hand-written files.
 *
 * Hues are deliberately spread around the wheel so neighbouring cards in the
 * theme picker never read as the same colour.
 */

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'themes');

/* ----------------------------- colour helpers ----------------------------- */

/** HSL (h 0-360, s/l 0-100) to #rrggbb. */
function hsl(h, s, l) {
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const lum = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * lum - 1)) * sat;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));

  const [r, g, b] = hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
      : hp < 3 ? [0, c, x]
        : hp < 4 ? [0, x, c]
          : hp < 5 ? [x, 0, c]
            : [c, 0, x];

  const m = lum - c / 2;
  const hex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function rgbOf(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const rgba = (hex, a) => `rgba(${rgbOf(hex).join(',')},${a})`;

/** Mix `hex` toward white (t > 0) or black (t < 0). */
function shade(hex, t) {
  const [r, g, b] = rgbOf(hex);
  const target = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  const mix = (c) => Math.round(c + (target - c) * k);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/* -------------------------------- styles --------------------------------- */

/** Translucent, blurred panel - the "frosted glass" family. */
function glass(p) {
  return {
    '--plate-bg': `linear-gradient(180deg, ${rgba(shade(p.base, 0.4), 0.42)} 0%, `
      + `${rgba(p.base, 0.34)} 48%, ${rgba(shade(p.base, -0.4), 0.42)} 100%)`,
    '--plate-border': `1px solid ${rgba(shade(p.base, 0.55), 0.5)}`,
    '--plate-radius': '20px',
    '--plate-shadow': `0 14px 40px ${rgba(shade(p.base, -0.75), 0.5)}, `
      + `inset 0 1px 0 ${rgba(shade(p.base, 0.9), 0.65)}, inset 0 -1px 0 ${rgba('#ffffff', 0.12)}`,
    '--plate-backdrop': 'blur(22px) saturate(180%)',
    '--reflection-opacity': '0.36',
  };
}

/** Opaque gradient slab with a crisp top highlight. */
function solid(p) {
  return {
    '--plate-bg': `linear-gradient(180deg, ${shade(p.base, 0.32)} 0%, ${p.base} 42%, ${shade(p.base, -0.42)} 100%)`,
    '--plate-border': `1px solid ${rgba(shade(p.base, 0.7), 0.45)}`,
    '--plate-radius': '14px',
    '--plate-shadow': `0 12px 30px ${rgba('#000000', 0.5)}, `
      + `inset 0 1px 0 ${rgba(shade(p.base, 0.95), 0.55)}, inset 0 -2px 6px ${rgba('#000000', 0.3)}`,
    '--plate-backdrop': 'none',
    '--reflection-opacity': '0.28',
  };
}

/** Dark panel ringed with a coloured glow. */
function neon(p) {
  return {
    '--plate-bg': `linear-gradient(180deg, ${rgba(shade(p.base, -0.5), 0.92)}, ${rgba(shade(p.base, -0.8), 0.95)})`,
    '--plate-border': `1px solid ${rgba(p.accent, 0.65)}`,
    '--plate-radius': '16px',
    '--plate-shadow': `0 0 26px ${rgba(p.accent, 0.42)}, 0 14px 34px ${rgba('#000000', 0.6)}, `
      + `inset 0 1px 0 ${rgba(p.sep, 0.4)}`,
    '--plate-backdrop': 'blur(14px) saturate(170%)',
    '--reflection-opacity': '0.4',
  };
}

/** Flat, low-contrast surface - quiet and modern. */
function matte(p) {
  return {
    '--plate-bg': `linear-gradient(180deg, ${rgba(shade(p.base, 0.16), 0.94)}, ${rgba(shade(p.base, -0.26), 0.96)})`,
    '--plate-border': `1px solid ${rgba(shade(p.base, 0.55), 0.3)}`,
    '--plate-radius': '16px',
    '--plate-shadow': `0 10px 26px ${rgba('#000000', 0.4)}, inset 0 1px 0 ${rgba('#ffffff', 0.12)}`,
    '--plate-backdrop': 'blur(8px)',
    '--reflection-opacity': '0.22',
  };
}

const STYLES = { glass, solid, neon, matte };


/* -------------------------------- shapes --------------------------------- */

/**
 * The structural half of a theme. Colour decides what a dock looks like;
 * shape decides what form it takes - rounded bar, hard-edged slab, a tapered
 * shelf, or a strip of individual tiles. These drive the same CSS custom
 * properties the base stylesheet already reads.
 */
const SHAPES = {
  /** Classic rounded bar. */
  bar: () => ({
    '--plate-radius': '18px',
    '--plate-clip': 'none',
    '--icon-radius': '0px',
    '--sep-width': '2px',
  }),

  /** Fully rounded ends, like a capsule. */
  pill: () => ({
    '--plate-radius': '999px',
    '--plate-clip': 'none',
    '--icon-radius': '0px',
    '--sep-width': '2px',
  }),

  /** Hard-edged slab with squared corners. */
  slab: () => ({
    '--plate-radius': '0px',
    '--plate-clip': 'none',
    '--icon-radius': '0px',
    '--sep-width': '3px',
  }),

  /** Flat against the screen edge, rounded on the side that faces the desktop. */
  tray: () => ({
    '--plate-radius': '16px 16px 0 0',
    '--plate-clip': 'none',
    '--icon-radius': '0px',
    '--sep-width': '2px',
  }),

  /** A shelf that tapers toward the screen edge, suggesting perspective. */
  shelf: () => ({
    '--plate-radius': '8px',
    '--plate-clip': 'polygon(2% 0, 98% 0, 100% 100%, 0 100%)',
    '--icon-radius': '0px',
    '--sep-width': '2px',
  }),

  /** Notched ends, like a strip of film. */
  notched: () => ({
    '--plate-radius': '10px',
    '--plate-clip': 'polygon(0 0, 100% 0, 100% 62%, 97% 100%, 3% 100%, 0 62%)',
    '--icon-radius': '0px',
    '--sep-width': '2px',
  }),

  /** Every icon sits in its own rounded tile. */
  tile: (p) => ({
    '--plate-radius': '14px',
    '--plate-clip': 'none',
    '--icon-radius': '6px',
    '--sep-width': '2px',
    '--item-bg': rgba(shade(p.base, 0.35), 0.28),
    '--item-border': `1px solid ${rgba(shade(p.base, 0.7), 0.35)}`,
    '--item-radius': '10px',
    '--item-shadow': `inset 0 1px 0 ${rgba('#ffffff', 0.25)}`,
    '--item-inset': '-4px',
  }),

  /** Recessed slots cut into the bar. */
  slot: (p) => ({
    '--plate-radius': '12px',
    '--plate-clip': 'none',
    '--icon-radius': '4px',
    '--sep-width': '2px',
    '--item-bg': rgba(shade(p.base, -0.55), 0.34),
    '--item-border': `1px solid ${rgba(shade(p.base, -0.7), 0.4)}`,
    '--item-radius': '8px',
    '--item-shadow': `inset 0 2px 5px ${rgba('#000000', 0.45)}, `
      + `0 1px 0 ${rgba('#ffffff', 0.14)}`,
    '--item-inset': '-5px',
  }),

  /** No bar at all: the icons float on the desktop. */
  floating: () => ({
    '--plate-radius': '0px',
    '--plate-clip': 'none',
    '--plate-bg': 'transparent',
    '--plate-border': 'none',
    '--plate-shadow': 'none',
    '--plate-backdrop': 'none',
    '--icon-radius': '0px',
    '--sep-width': '2px',
  }),
};

/* ------------------------------- palettes -------------------------------- */

/**
 * hue   position on the colour wheel - kept well apart between neighbours
 * sat   saturation; the neutral sits near zero on purpose
 * style which surface treatment the pair uses
 */
const PALETTES = [
  { slug: 'aqua', name: 'Aqua', hue: 197, sat: 74, shape: 'bar', style: 'glass', desc: 'Clear water blue.' },
  { slug: 'azure', name: 'Azure', hue: 214, sat: 72, shape: 'pill', style: 'solid', desc: 'Open-sky blue.' },
  { slug: 'indigo', name: 'Indigo', hue: 243, sat: 62, shape: 'slab', style: 'matte', desc: 'Deep evening indigo.' },
  { slug: 'violet', name: 'Violet', hue: 268, sat: 66, shape: 'tray', style: 'neon', desc: 'Electric violet with a halo.' },
  { slug: 'orchid', name: 'Orchid', hue: 292, sat: 58, shape: 'shelf', style: 'glass', desc: 'Soft orchid purple.' },
  { slug: 'magenta', name: 'Magenta', hue: 320, sat: 72, shape: 'notched', style: 'neon', desc: 'Hot magenta tubing.' },
  { slug: 'rose', name: 'Rose', hue: 342, sat: 66, shape: 'tile', style: 'glass', desc: 'Blush rose with a pearly sheen.' },
  { slug: 'ruby', name: 'Ruby', hue: 354, sat: 72, shape: 'slot', style: 'glass', desc: 'Polished ruby red.' },
  { slug: 'crimson', name: 'Crimson', hue: 350, sat: 52, shape: 'floating', style: 'matte', desc: 'Deep crimson velvet.' },
  { slug: 'scarlet', name: 'Scarlet', hue: 5, sat: 78, shape: 'tile', style: 'neon', desc: 'Hot scarlet against near-black.' },
  { slug: 'ember', name: 'Ember', hue: 18, sat: 76, shape: 'bar', style: 'solid', desc: 'Banked embers, orange-red.' },
  { slug: 'amber', name: 'Amber', hue: 34, sat: 74, shape: 'slot', style: 'solid', desc: 'Warm amber and brass.' },
  { slug: 'gold', name: 'Gold', hue: 47, sat: 70, shape: 'pill', style: 'glass', desc: 'Bright polished gold.' },
  { slug: 'lime', name: 'Lime', hue: 80, sat: 58, shape: 'shelf', style: 'matte', desc: 'Fresh lime green.' },
  { slug: 'emerald', name: 'Emerald', hue: 148, sat: 60, shape: 'tray', style: 'solid', desc: 'Rich jewel-green.' },
  { slug: 'jade', name: 'Jade', hue: 168, sat: 56, shape: 'notched', style: 'glass', desc: 'Cool jade with a soft glow.' },
  { slug: 'teal', name: 'Teal', hue: 184, sat: 66, shape: 'slab', style: 'neon', desc: 'Luminous teal on deep water.' },
  { slug: 'graphite', name: 'Graphite', hue: 220, sat: 8, shape: 'tile', style: 'matte', desc: 'Neutral graphite. Stays out of the way.' },
];

/* ------------------------------ derivation -------------------------------- */

/** The dock colours for one half of a palette pair. */
function paletteFor(entry, dark) {
  const { hue: h, sat: s } = entry;
  return dark
    ? {
      base: hsl(h, s, 30),
      accent: hsl(h, Math.min(96, s + 22), 68),
      sep: hsl(h, s * 0.85, 80),
      tipBg: hsl(h, s * 0.5, 9),
      tipFg: hsl(h, 45, 93),
    }
    : {
      base: hsl(h, s * 0.45, 85),
      accent: hsl(h, s, 42),
      sep: hsl(h, s * 0.6, 42),
      tipBg: hsl(h, 35, 98),
      tipFg: hsl(h, 50, 16),
    };
}

function variables(entry, palette, dark) {
  const surface = STYLES[entry.style](palette);
  const shape = SHAPES[entry.shape](palette);
  return {
    ...surface,
    // Shape comes after the surface so a shape may override the radius, the
    // clip and - for "floating" - the plate itself.
    ...shape,
    '--sep-color': rgba(palette.sep, dark ? 0.5 : 0.55),
    '--icon-shadow': `0 6px 13px ${rgba(shade(palette.base, -0.8), dark ? 0.55 : 0.32)}`,
    '--indicator-color': palette.accent,
    '--indicator-glow': `0 0 10px ${rgba(palette.accent, 0.9)}`,
    '--tooltip-bg': rgba(palette.tipBg, 0.96),
    '--tooltip-fg': palette.tipFg,
    '--tooltip-border': `1px solid ${rgba(palette.accent, 0.4)}`,
    '--tooltip-shadow': `0 8px 20px ${rgba('#000000', 0.45)}`,
    '--drop-accent': palette.accent,
  };
}

/** The palette the settings window paints itself with. */
function chrome(entry, palette, dark) {
  const { hue: h, sat: s } = entry;
  return dark
    ? {
      '--bg': hsl(h, s * 0.35, 11),
      '--bg-raised': hsl(h, s * 0.32, 16),
      '--bg-sunken': hsl(h, s * 0.38, 8),
      '--fg': hsl(h, 22, 93),
      '--fg-dim': hsl(h, 18, 62),
      '--line': hsl(h, s * 0.3, 24),
      '--accent': palette.accent,
      '--accent-fg': hsl(h, s * 0.5, 8),
      '--danger': '#ff7a72',
    }
    : {
      '--bg': hsl(h, s * 0.22, 96),
      '--bg-raised': hsl(h, s * 0.16, 100),
      '--bg-sunken': hsl(h, s * 0.26, 91),
      '--fg': hsl(h, 30, 15),
      '--fg-dim': hsl(h, 16, 42),
      '--line': hsl(h, s * 0.22, 82),
      '--accent': palette.accent,
      '--accent-fg': '#ffffff',
      '--danger': '#c8352f',
    };
}

/* ------------------------------- generation ------------------------------- */

function build() {
  const manifests = [];

  for (const entry of PALETTES) {
    for (const dark of [true, false]) {
      const palette = paletteFor(entry, dark);
      manifests.push({
        id: dark ? entry.slug : `${entry.slug}-light`,
        name: dark ? entry.name : `${entry.name} Light`,
        author: 'MyDockBar',
        description: `${dark ? entry.desc : `${entry.desc.replace(/\.$/, '')}, on a light surface.`}`
          + ` (${entry.shape} shape)`,
        dark,
        variables: variables(entry, palette, dark),
        ui: chrome(entry, palette, dark),
      });
    }
  }

  return manifests;
}

function main() {
  const manifests = build();
  const ids = new Set();

  for (const manifest of manifests) {
    if (ids.has(manifest.id)) throw new Error(`duplicate theme id: ${manifest.id}`);
    ids.add(manifest.id);

    const dir = path.join(OUT, manifest.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'theme.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }

  // Drop folders for themes that are no longer in the table.
  for (const entry of fs.readdirSync(OUT, { withFileTypes: true })) {
    if (entry.isDirectory() && !ids.has(entry.name)) {
      fs.rmSync(path.join(OUT, entry.name), { recursive: true, force: true });
    }
  }

  const dark = manifests.filter((m) => m.dark).length;
  console.log(`${manifests.length} themes written (${dark} dark, ${manifests.length - dark} light)`);
}

if (require.main === module) main();

module.exports = { PALETTES, SHAPES, build, paletteFor, variables, chrome, hsl, shade, rgba };
