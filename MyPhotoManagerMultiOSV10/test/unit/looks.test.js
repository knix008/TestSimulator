// Effect presets (looks): every look converts to valid settings, strength scales them, other edits survive.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_ADJUST } from '../../src/edit/adjust.js';
import { EFFECTS } from '../../src/edit/advanced.js';
import { applyLook, clearLook, isLook, LOOK_FIELDS, lookCategories, lookSettings, lookTouches, LOOKS, ART_LOOKS, PRO_LOOKS } from '../../src/edit/looks.js';
import { defaultEdit, isEmptyEdit } from '../../src/edit/pipeline.js';
import en from '../../src/i18n/en-more.js';
import ko from '../../src/i18n/ko-more.js';

const ids = lookCategories().flatMap((c) => c.ids);

test('every look is in exactly one category, has en/ko names and gives settings in range', () => {
  assert.equal(new Set(ids).size, ids.length, 'no look twice');
  assert.deepEqual([...ids].sort(), [...Object.keys(LOOKS), ...Object.keys(PRO_LOOKS), ...Object.keys(ART_LOOKS)].sort(), 'every look listed');
  assert.ok(ids.length >= 185, `${ids.length} looks`);
  for (const category of lookCategories()) for (const dict of [en, ko]) assert.ok(dict[`lookCat.${category.key}`], `name of ${category.key}`);
  for (const id of ids) {
    for (const dict of [en, ko]) assert.ok(dict[`look.${id}`], `name of ${id}`);
    const s = lookSettings(id);
    assert.equal(s.adjust.exposure, undefined, `${id} leaves exposure alone`);
    for (const key of ['brightness', 'contrast', 'saturation', 'temperature', 'highlights', 'shadows', 'whites', 'blacks', 'tint', 'vibrance']) if (key in s.adjust) assert.ok(Math.abs(s.adjust[key]) <= 100, `${id} ${key}`);
    assert.ok(s.detail.blur >= 0 && s.detail.blur <= 50 && s.detail.sharpen >= 0 && s.detail.sharpen <= 200, `${id} detail`);
    assert.ok(Math.abs(s.fx.vignette) <= 100 && s.fx.grain >= 0 && s.fx.grain <= 100, `${id} fx`);
    for (const effect of s.effects) assert.ok(EFFECTS[effect.id], `${id}: effect ${effect.id}`);
    assert.ok(lookTouches(id).length > 0 || s.effects.length || s.tilt, `${id} changes something`);
  }
  assert.equal(isLook('nope'), false);
});

test('looks map ImageViewer notation onto the editor (grayscale → saturation, vignette darkens, blur px)', () => {
  const noir = lookSettings('noir');
  assert.equal(noir.adjust.saturation, -100, 'noir is black and white');
  assert.ok(noir.fx.vignette < 0, 'dark corners');
  assert.equal(noir.adjust.brightness, -18, 'darker (brightness 82)');
  assert.equal(lookSettings('sepia').adjust.effect, 'sepia');
  assert.equal(lookSettings('sketch').adjust.effect, 'invert');
  assert.equal(lookSettings('sketch').fx.edges, true);
  assert.deepEqual(lookSettings('comic').effects.map((e) => e.id), ['posterize']);
  assert.ok(lookSettings('miniature').tilt?.blur > 0, 'miniature is a tilt-shift');
  assert.ok(Math.abs(lookSettings('soft').detail.blur - 2 / 0.3) < 0.1, 'blur 2 px');
  assert.deepEqual(lookSettings('artOilPaint').effects.map((e) => e.id), ['oilPaint']);
});

test('strength scales the look: 0 % changes nothing, 50 % is half way, 150 % goes further', () => {
  assert.equal(isEmptyEdit(applyLook(defaultEdit(), 'vivid', 0)), true);
  const full = lookSettings('vivid', 100).adjust.saturation;
  const half = lookSettings('vivid', 50).adjust.saturation;
  const more = lookSettings('vivid', 150).adjust.saturation;
  assert.ok(Math.abs(half - full / 2) <= 1, `${half} vs ${full}`);
  assert.ok(more > full);
});

test('a look replaces the previous look but keeps the other edits; clearLook removes only the look', () => {
  const edit = defaultEdit();
  edit.adjust.shadows = 40;
  edit.adjust.exposure = 0.5;
  edit.adjust.tint = 12;
  edit.geometry.rotate = 90;
  edit.overlay.texts = [{ text: 'hi' }];
  const a = applyLook(edit, 'trix');
  assert.ok(a.fx.grain > 0);
  const b = applyLook(a, 'vivid');
  assert.equal(b.fx.grain, 0, 'the old look\'s grain is gone');
  assert.ok(b.adjust.saturation > 0);
  for (const e of [a, b]) {
    assert.equal(e.adjust.shadows, 40);
    assert.equal(e.adjust.exposure, 0.5, 'the exposure stays the user\'s');
    assert.equal(e.adjust.tint, 12);
    assert.equal(e.geometry.rotate, 90);
    assert.equal(e.overlay.texts.length, 1);
  }
  const cleared = clearLook(b);
  for (const [group, key] of LOOK_FIELDS) if (group === 'adjust') assert.equal(cleared.adjust[key], DEFAULT_ADJUST[key], key);
  assert.equal(cleared.adjust.shadows, 40, 'other edits stay');
  assert.equal(edit.fx.grain, 0, 'the edit passed in is not changed');
});

test('the editor\'s own looks use split toning, LUTs, clarity …, and a look replaces the previous one\'s extras only', () => {
  assert.equal(lookSettings('blockbuster').lut.id, 'teal-orange');
  assert.ok(lookSettings('editorial').tone.splitTone.shadowSat > 0);
  assert.ok(lookSettings('clearHaze').tone.dehaze > 0);
  assert.equal(lookSettings('bwHigh').adjust.saturation, -100);
  assert.equal(lookSettings('editorial', 50).adjust.highlights, -12, 'strength scales the extras');
  const edit = defaultEdit();
  edit.adjust.shadows = 30; // the user's own
  const a = applyLook(edit, 'editorial');
  assert.equal(a.adjust.shadows, 18, 'the look sets shadows');
  assert.ok(a.tone.splitTone);
  // The next look resets what editorial set (split toning, shadows) — shadows go to neutral, not back to 30.
  const b = applyLook(a, 'vivid', 100, 'editorial');
  assert.equal(b.tone.splitTone, null);
  assert.equal(b.adjust.shadows, 0);
  assert.equal(b.adjust.highlights, 0);
  // Without a previous look, extras the user set stay.
  const c = applyLook(edit, 'vivid');
  assert.equal(c.adjust.shadows, 30);
  // A LUT look removed with its LUT.
  const d = clearLook(applyLook(edit, 'blockbuster'), 'blockbuster');
  assert.equal(d.lut, null);
  assert.equal(d.adjust.shadows, 30);
});
