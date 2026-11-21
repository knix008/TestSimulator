// The start page's moving backgrounds: twenty music scenes, each with a name, an icon, and a drawing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANIMATIONS, normalizeSettings } from '../../src/domain/settings.js';
import { AnimatedBackground } from '../../src/ui/background.js';
import { animationIcon, hasIcon } from '../../src/icons.js';
import { DICTIONARIES } from '../../src/i18n.js';

test('twenty music backgrounds, each named in both languages and with an icon', () => {
  assert.equal(ANIMATIONS.length, 20);
  for (const kind of ANIMATIONS) {
    assert.ok(DICTIONARIES.ko[`animation.${kind}`], `ko ${kind}`);
    assert.ok(DICTIONARIES.en[`animation.${kind}`], `en ${kind}`);
    assert.ok(hasIcon(animationIcon(kind)), `icon ${kind}`);
    assert.equal(typeof AnimatedBackground.prototype[kind], 'function', `scene ${kind}`);
  }
  assert.equal(normalizeSettings({ animation: 'blueprint' }).animation, ANIMATIONS[0], 'an old 3D background falls back');
});

test('every scene draws on a canvas without throwing', () => {
  const calls = { n: 0 };
  const ctx = new Proxy({}, {
    get: (target, key) => {
      if (key in target) return target[key];
      if (key === 'measureText') return () => ({ width: 10 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
      return () => { calls.n += 1; };
    },
    set: (target, key, value) => { target[key] = value; return true; },
  });
  const colors = { bg: '#101820', accent: '#3fd6b0', text: '#ffffff', dark: true };
  for (const kind of ANIMATIONS) {
    const self = { items: Array.from({ length: 40 }, (_, i) => ({ x: i / 40, y: (i * 7 % 40) / 40, z: 0.5, s: 0.5, v: 0.5, h: 0.5 })) };
    const before = calls.n;
    AnimatedBackground.prototype[kind].call(self, ctx, 800, 450, 3.7, colors);
    assert.ok(calls.n > before, `${kind} draws`);
  }
});
