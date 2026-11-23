import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COPIES, DEFAULT_PRINT, FOOTER_MM, GAP_MM, MARGIN_PRESETS, PAPERS, TITLE_MM,
  fitBox, marginPreset, normalizeMargins, normalizePrint, pageCss, planSheet, printJob, resolveOrientation,
} from '../src/printLayout.js';

const inside = (box, plan) => box.x >= plan.margins.left - 0.01
  && box.y >= plan.margins.top - 0.01
  && box.x + box.w <= plan.page.w - plan.margins.right + 0.01
  && box.y + box.h <= plan.page.h - plan.margins.bottom + 0.01;

test('unknown or missing print options fall back to the defaults', () => {
  assert.deepEqual(normalizePrint(null), DEFAULT_PRINT);
  const p = normalizePrint({ paper: 'A9', orientation: 'sideways', margins: { top: -4, left: 99 }, hAlign: 'up', vAlign: 'x', ink: 'gold', scale: 7, title: 0, copies: 500 });
  assert.equal(p.paper, 'A4');
  assert.equal(p.orientation, 'auto');
  assert.deepEqual(p.margins, { top: 0, right: 15, bottom: 15, left: 50 });
  assert.equal(p.hAlign, 'center');
  assert.equal(p.vAlign, 'middle');
  assert.equal(p.ink, 'mono');
  assert.equal(p.scale, 20);
  assert.equal(p.title, false);
  assert.equal(p.copies, COPIES.max);
  assert.equal(normalizePrint({ copies: 0 }).copies, 1);
  assert.equal(normalizePrint({ scale: 73 }).scale, 75);
});

test('margin presets set all four sides; older settings with a preset name still load', () => {
  assert.deepEqual(normalizeMargins('wide'), { top: 25, right: 25, bottom: 25, left: 25 });
  assert.equal(marginPreset({ top: 8, right: 8, bottom: 8, left: 8 }), 'narrow');
  assert.equal(marginPreset({ top: 0, right: 0, bottom: 0, left: 0 }), 'none');
  assert.equal(marginPreset({ top: 10, right: 15, bottom: 15, left: 15 }), '');
  assert.deepEqual(Object.keys(MARGIN_PRESETS), ['none', 'narrow', 'normal', 'wide']);
});

test('auto orientation turns the sheet for wide pictures', () => {
  assert.equal(resolveOrientation({ orientation: 'auto', source: false }, 1.6), 'landscape');
  assert.equal(resolveOrientation({ orientation: 'auto', source: false }, 0.7), 'portrait');
  assert.equal(resolveOrientation({ orientation: 'portrait', source: false }, 3), 'portrait');
  const plan = planSheet({ paper: 'A4' }, 1.6);
  assert.deepEqual([plan.page.w, plan.page.h], [297, 210]);
});

test('the picture fills the printable area and keeps its aspect ratio on every paper', () => {
  for (const paper of Object.keys(PAPERS)) {
    for (const preset of Object.keys(MARGIN_PRESETS)) {
      const mm = MARGIN_PRESETS[preset];
      const plan = planSheet({ paper, margins: { top: mm, right: mm, bottom: mm, left: mm }, title: false, orientation: 'portrait' }, 1.25);
      const [box] = plan.boxes;
      assert.ok(inside(box, plan), `${paper}/${preset} inside the margins`);
      assert.ok(Math.abs(box.w / box.h - 1.25) < 0.01, `${paper}/${preset} aspect`);
      assert.ok(Math.abs(box.w - (plan.page.w - mm * 2)) < 0.02, `${paper}/${preset} fills the width`);
    }
  }
});

test('each side has its own margin', () => {
  const plan = planSheet({ margins: { top: 30, right: 5, bottom: 10, left: 40 }, title: false, orientation: 'portrait', scale: 50 }, 1);
  assert.ok(inside(plan.boxes[0], plan));
  assert.deepEqual(plan.margins, { top: 30, right: 5, bottom: 10, left: 40 });
});

test('the picture can be aligned left, centre or right and top, middle or bottom', () => {
  const at = (hAlign, vAlign) => planSheet({ hAlign, vAlign, scale: 50, title: false, orientation: 'portrait' }, 1).boxes[0];
  const left = at('left', 'top');
  const right = at('right', 'bottom');
  const mid = at('center', 'middle');
  const plan = planSheet({ scale: 50, title: false, orientation: 'portrait' }, 1);
  assert.equal(left.x, plan.margins.left);
  assert.equal(left.y, plan.margins.top);
  assert.ok(Math.abs(right.x + right.w - (plan.page.w - plan.margins.right)) < 0.02);
  assert.ok(Math.abs(right.y + right.h - (plan.page.h - plan.margins.bottom)) < 0.02);
  assert.ok(Math.abs(mid.x - (left.x + right.x) / 2) < 0.02);
});

test('the title band sits above the picture and the date footer below it', () => {
  const plan = planSheet({ title: true, footer: true, orientation: 'portrait' }, 0.5);
  assert.equal(plan.title.h, TITLE_MM);
  assert.equal(plan.footer.h, FOOTER_MM);
  const [box] = plan.boxes;
  assert.ok(box.y >= plan.title.y + TITLE_MM - 0.01);
  assert.ok(box.y + box.h <= plan.footer.y + 0.01);
  assert.ok(inside(box, plan));
});

test('the source goes beside wide content on landscape and above it on portrait', () => {
  const side = planSheet({ source: true, title: false, orientation: 'landscape' }, 1.3, 1.3);
  assert.deepEqual(side.boxes.map((b) => b.kind), ['source', 'text']);
  assert.ok(side.sideBySide);
  assert.ok(side.boxes[1].x >= side.boxes[0].x + side.boxes[0].w + GAP_MM - 0.02, 'side by side');
  const stack = planSheet({ source: true, title: false, orientation: 'portrait' }, 1.3, 1.3);
  assert.ok(!stack.sideBySide);
  assert.ok(stack.boxes[1].y >= stack.boxes[0].y + stack.boxes[0].h + GAP_MM - 0.02, 'one above the other');
  for (const plan of [side, stack]) for (const box of plan.boxes) assert.ok(inside(box, plan));
});

test('the size shrinks the picture around its centre', () => {
  const full = planSheet({ scale: 100, title: false }, 1).boxes[0];
  const half = planSheet({ scale: 50, title: false }, 1).boxes[0];
  assert.ok(Math.abs(half.w - full.w / 2) < 0.02);
  assert.ok(Math.abs(half.x + half.w / 2 - (full.x + full.w / 2)) < 0.02);
  assert.ok(Math.abs(half.y + half.h / 2 - (full.y + full.h / 2)) < 0.02);
});

test('the printer gets the exact sheet, the printer name and the copies', () => {
  const plan = planSheet({ paper: 'A5', orientation: 'portrait', printer: 'Office', copies: 3 }, 1);
  assert.equal(pageCss(plan), '@page { size: 148mm 210mm; margin: 0; }');
  assert.deepEqual(printJob(plan), { printer: 'Office', copies: 3, widthMm: 148, heightMm: 210 });
  assert.deepEqual(fitBox(100, 50, 1), { w: 50, h: 50 });
  assert.deepEqual(fitBox(0, 50, 1), { w: 0, h: 0 });
});
