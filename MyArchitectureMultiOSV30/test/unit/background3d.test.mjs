// Unit tests for the 3D background that follows the theme (src/ui/themes.js
// themeBackground3d, BACKGROUND_3D): every theme gets a gradient in its own
// colours — light above dark for light themes too, readable, different from
// theme to theme — and the sky / plain-colour modes stay as they were.
// Run: node --test test/unit/background3d.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { THEMES, themeById, BACKGROUND_3D, themeBackground3d } from "../../src/ui/themes.js";

const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255; };

describe("3D background", () => {
  test("three modes: sky, follow the theme, theme colour", () => {
    assert.deepEqual(BACKGROUND_3D.map(([id]) => id), ["gradient", "theme", "solid"]);
  });

  test("follow the theme: a gradient in each theme's own colours", () => {
    const seen = new Set();
    for (const th of THEMES) {
      const bg = themeBackground3d(th, "theme");
      assert.match(bg.top, /^#[0-9a-f]{6}$/i, th.id);
      assert.match(bg.bottom, /^#[0-9a-f]{6}$/i, th.id);
      assert.notEqual(bg.top, bg.bottom, `${th.id}: a gradient`);
      // A light theme keeps a light background, a dark one a dark background.
      if (th.mode === "light") assert.ok(lum(bg.bottom) > 0.5, `${th.id}: light ${bg.bottom}`);
      else assert.ok(lum(bg.bottom) < 0.5, `${th.id}: dark ${bg.bottom}`);
      seen.add(`${bg.top}${bg.bottom}`);
    }
    assert.equal(seen.size, THEMES.length, "every theme its own background");
    // It changes with the theme.
    assert.notDeepEqual(themeBackground3d(themeById("nord"), "theme"), themeBackground3d(themeById("dracula"), "theme"));
  });

  test("sky and theme colour as before", () => {
    const dark = themeById("midnight"), light = themeById("daylight");
    assert.equal(themeBackground3d(dark, "gradient"), "gradient");
    assert.deepEqual(themeBackground3d(light, "gradient"), { top: "#a9c9ea", bottom: "#f1f4f6" });
    assert.equal(themeBackground3d(dark, "solid"), dark.bg);
    assert.equal(themeBackground3d(light, "solid"), "#e8ebf0");
    assert.equal(themeBackground3d(dark), "gradient", "the sky by default");
  });
});
