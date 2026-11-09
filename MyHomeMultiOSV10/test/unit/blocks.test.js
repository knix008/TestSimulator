// Every block kind, one test each: starting content in both languages, its fields, its item lists,
// the editor hooks on the canvas and clean HTML when published, its style.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK_TYPES, BLOCKS, blockDef, normalizeStyle, renderBlock } from '../../src/domain/blocks.js';
import * as S from '../../src/domain/site.js';

const site = S.createSite({ L: 'ko' });
const ctx = (editor, L = 'ko') => ({ editor, site, page: site.pages[0], pages: site.pages, L });

for (const type of BLOCK_TYPES) {
  test(`block ${type} (${BLOCKS[type].en})`, () => {
    const def = blockDef(type);
    for (const L of ['ko', 'en']) {
      const block = S.createBlock(type, { L });
      for (const field of def.fields.filter((x) => x.kind !== 'actions')) assert.ok(field.key in block.props, `${L} ${field.key}`);
      const editor = renderBlock(block, ctx(true, L));
      assert.match(editor, new RegExp(`data-block-type="${type}"`));
      assert.ok(!/undefined|NaN|\[object/.test(editor), `${L}: junk in the HTML`);
      const clean = renderBlock(block, ctx(false, L));
      assert.ok(clean.length > 40, 'published HTML');
      assert.ok(!/data-edit|data-block-id|data-page-link/.test(clean), 'editor hooks published');
    }
    for (const field of def.fields.filter((f) => f.kind === 'items')) {
      const item = field.add();
      for (const sub of field.item) assert.ok(sub.key in item, `${field.key}.add() has ${sub.key}`);
      const block = S.createBlock(type, { L: 'en' });
      block.props[field.key] = [...block.props[field.key], item];
      assert.ok(renderBlock(block, ctx(false)).length > 0);
    }
    const hidden = S.createBlock(type, { style: { hidden: true } });
    assert.equal(renderBlock(hidden, ctx(false)), '', 'a hidden block is not published');
    assert.match(renderBlock(hidden, ctx(true)), /hm-hidden/, 'a hidden block shows faded on the canvas');
    const styled = S.createBlock(type, { style: { bg: 'custom', bgColor: '#123456', color: '#abcdef', padTop: 12, padBottom: 34, align: 'right', width: 'full', anchor: 'x y!', hideMobile: true, radius: true } });
    const html = renderBlock(styled, ctx(false));
    for (const piece of ['background-color:#123456', 'color:#abcdef', '--pt:12px', '--pb:34px', 'align-right', 'w-full', 'id="xy"', 'hm-hide-mobile', 'hm-round-block']) assert.ok(html.includes(piece), piece);
    assert.deepEqual(normalizeStyle({ padTop: 999, align: 'up', bg: 'neon' }, def).padTop, 320);
  });
}
