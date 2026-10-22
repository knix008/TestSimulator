'use strict';

/** Effect category colors, button icons, every PRESETS entry. */
module.exports = {
  name: 'Effects',
  run({ test, each, src, h }) {
    const { app, css, editor } = src;
    const { assert, assertIncludes, extractPresetIds } = h;

    const cats = ['catFilmColor', 'catSlide', 'catBW', 'catInstant', 'catCinema', 'catCreative'];
    each(cats, (c) => `Category ${c} is tagged`, (c) => {
      assertIncludes(app, c, `category ${c}`);
      assertIncludes(css, `data-cat="${c}"`, `css ${c}`);
    });

    test('Effect buttons include icon + label', () => {
      assertIncludes(app, 'preset-icon', 'icon span');
      assertIncludes(app, 'preset-label', 'label span');
      assertIncludes(app, 'FX_CAT_ICON', 'icon map');
      assertIncludes(css, '.preset-icon', 'icon css');
    });

    test('Category accent CSS variable exists', () => {
      assertIncludes(css, '--fx-accent', 'category accent');
    });

    const ids = extractPresetIds(editor);
    test(`Editor defines ${ids.length} presets`, () => {
      assert(ids.length >= 80, `expected 80+ presets, got ${ids.length}`);
    });

    each(ids, (id) => `Preset ${id}`, (id) => {
      const re = new RegExp(`^\\s{4}${id}:\\s+\\{`, 'm');
      assert(re.test(editor), `PRESETS missing ${id}`);
    });
  },
};
