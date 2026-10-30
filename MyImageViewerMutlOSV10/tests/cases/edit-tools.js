'use strict';

/** Edit window: drawing / retouch tools, crop & straighten, tone, selection edits,
 *  canvas size, watermark (editTools.js), the pixel maths (editOps.js) and the
 *  Editor pixel API they share. */
const path = require('path');

module.exports = {
  name: 'Edit tools & pixel operations',
  run({ test, src, h }) {
    const { html, app, editor, css, icons, ko, en } = src;
    const { assert, assertIncludes } = h;
    const tools = h.read('src/js/editTools.js');
    const E = require(path.join(__dirname, '..', '..', 'src', 'js', 'editOps.js'));

    const solid = (w, hgt, rgba) => {
      const img = E.make(w, hgt);
      for (let i = 0; i < w * hgt; i++) img.data.set(rgba, i * 4);
      return img;
    };
    const at = (img, x, y) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));

    /* ── EditOps: tone ── */
    test('Tone curve is a monotone cubic through its points (identity when untouched)', () => {
      const id = E.curveLUT([[0, 0], [255, 255]]);
      assert([0, 64, 128, 255].every((v) => id[v] === v), 'identity');
      const lut = E.curveLUT([[0, 0], [128, 180], [255, 255]]);
      assert(lut[128] === 180, 'passes through the point');
      for (let i = 1; i < 256; i++) assert(lut[i] >= lut[i - 1], `monotone at ${i}`);
      assert(E.toneIsIdentity({}) && !E.toneIsIdentity({ exposure: 10 }) && !E.toneIsIdentity({ curve: { rgb: [[0, 0], [128, 180], [255, 255]] } }), 'identity check');
    });

    test('Exposure, levels, highlights / shadows and white balance move tones the right way', () => {
      assert(E.toneLUTs({ exposure: 50 }).r[100] === 200, 'one stop up doubles');
      const lv = E.toneLUTs({ levels: { black: 50, white: 200, gamma: 1, outBlack: 0, outWhite: 255 } });
      assert(lv.g[50] === 0 && lv.g[200] === 255 && lv.g[125] > 120 && lv.g[125] < 135, 'levels stretch black…white');
      const px = (v, p) => E.applyTone(solid(1, 1, [v, v, v, 255]), p).data[0];
      assert(px(40, { shadows: 60 }) > 60 && px(40, { shadows: 60 }) < 100, 'shadows lift the dark end moderately');
      assert(px(220, { highlights: -60 }) < 200, 'highlights recover the bright end');
      assert(Math.abs(px(128, { shadows: 100 }) - 128) < 15, 'midtones mostly stay');
      const gains = E.wbFromSample(200, 150, 100);
      assert(Math.abs(200 * gains[0] - 100 * gains[2]) < 2 && Math.abs(150 * gains[1] - 200 * gains[0]) < 2, 'sampled colour becomes neutral');
      const auto = E.autoLevels({ width: 4, height: 1, data: Uint8ClampedArray.from([50, 50, 50, 255, 60, 60, 60, 255, 180, 180, 180, 255, 200, 200, 200, 255]) });
      assert(auto.black === 50 && auto.white === 200, 'auto enhance stretches to the darkest / brightest');
      assert(auto.gamma >= 0.7 && auto.gamma <= 1.45, 'gentle midtone gamma');
    });

    /* ── EditOps: masks ── */
    test('Selection grow / shrink / feather / invert work on the mask', () => {
      const w = 9, hh = 9, m = new Uint8ClampedArray(81);
      m[40] = 255;
      const g = E.growMask(m, w, hh, 2);
      assert(g.filter((v) => v).length === 25, 'grow 2 px = 5×5');
      const s = E.shrinkMask(g, w, hh, 2);
      assert(s.filter((v) => v).length === 1 && s[40] === 255, 'shrink back');
      const f = E.featherMask(g, w, hh, 2);
      assert(f[40] > 150 && f[40] < 255 && f[0] < 40, 'soft edge');
      assert(E.invertMask(m)[0] === 255 && E.invertMask(m)[40] === 0, 'invert');
      assert(JSON.stringify(E.maskBounds(g, w, hh)) === JSON.stringify({ x: 2, y: 2, w: 5, h: 5 }), 'bounds');
    });

    /* ── EditOps: pixels ── */
    test('Mosaic, blur, masked blend, spot healing and red-eye change the right pixels', () => {
      const stripes = E.make(4, 1);
      stripes.data.set([0, 0, 0, 255, 100, 100, 100, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
      assert(at(E.pixelate(stripes, 2), 0, 0)[0] === 50, 'mosaic = block average');
      const edge = E.make(10, 1);
      for (let x = 0; x < 10; x++) edge.data.set(x < 5 ? [0, 0, 0, 255] : [200, 200, 200, 255], x * 4);
      const bl = E.boxBlur(edge, 4);
      assert(at(bl, 4, 0)[0] > 30 && at(bl, 5, 0)[0] < 170, 'blur softens the edge');
      const dst = solid(2, 1, [0, 0, 0, 255]);
      E.blendByMask(dst, solid(2, 1, [200, 200, 200, 255]), Uint8ClampedArray.from([255, 128]));
      assert(at(dst, 0, 0)[0] === 200 && Math.abs(at(dst, 1, 0)[0] - 100) <= 1, 'feathered blend');
      const img = solid(20, 20, [100, 150, 200, 255]);
      const mask = new Uint8ClampedArray(400);
      for (let y = 8; y < 12; y++) for (let x = 8; x < 12; x++) { mask[y * 20 + x] = 255; img.data[(y * 20 + x) * 4] = 0; }
      assert(E.inpaint(img, mask) === 16, 'all masked pixels filled');
      assert(Math.abs(at(img, 10, 10)[0] - 100) < 8, 'filled from the surroundings');
      const eye = solid(20, 20, [200, 30, 30, 255]);
      assert(E.redEye(eye, 10, 10, 5) > 0 && at(eye, 10, 10)[0] < 60, 'red pupil darkened');
      const grey = solid(20, 20, [120, 120, 120, 255]);
      assert(E.redEye(grey, 10, 10, 5) === 0, 'non-red untouched');
    });

    test('Straighten keeps the largest upright rectangle; crop ratios centre in the picture', () => {
      const f0 = E.rotatedFit(400, 300, 0);
      assert(f0.crop.w === 400 && f0.crop.h === 300 && f0.expand.w === 400, 'no turn, no change');
      const f = E.rotatedFit(400, 300, 10 * Math.PI / 180);
      assert(f.expand.w > 400 && f.expand.h > 300, 'expanded canvas holds the corners');
      assert(f.crop.w < 400 && f.crop.h < 300 && f.crop.w / f.crop.h > 1.3, 'crop without empty corners, same shape');
      assert(JSON.stringify(E.ratioRect(400, 300, 1)) === JSON.stringify({ x: 50, y: 0, w: 300, h: 300 }), '1:1');
      assert(JSON.stringify(E.ratioRect(400, 300, 16 / 9)) === JSON.stringify({ x: 0, y: 38, w: 400, h: 225 }), '16:9');
    });

    /* ── Editor ── */
    test('Pixel edits become the base: rotate / flip after crop, fill, drawing keep them', () => {
      assertIncludes(editor, 'function _bake()', 'base from the edited pixels');
      assertIncludes(editor, 'base: originalImg === sourceImg ? sourceImg : null,', 'history shares the file, no canvas per step');
      assertIncludes(editor, 'originalImg = frame.base || _baseFromFrame(frame);', 'undo rebuilds an edited base');
      for (const [label, needle] of [
        ['fill', "data[i*4]=r; data[i*4+1]=g; data[i*4+2]=b; data[i*4+3]=a;\n      }\n    }\n    _bake();"],
        ['crop to selection', 'if (ok) { _bake(); _saveHistory(); }'],
        ['cut', "if (selMask[i]) workingPixels.data[i*4+3]=0;\n      }\n\n      clearSelection();\n      _bake();"],
      ]) assert(editor.replace(/\r\n/g, '\n').includes(needle), `${label} bakes`);
      const commit = editor.slice(editor.indexOf('function commitPixels('), editor.indexOf('function getMask('));
      assert(commit.indexOf('_bake()') < commit.indexOf('_saveHistory()'), 'commitPixels: base, then one undo step');
      // Reset all still goes back to the file as opened
      const reset = editor.slice(editor.indexOf('async function resetAll()'), editor.indexOf('Selection Tools'));
      assertIncludes(reset, 'const needP = !!sourceImg && originalImg !== sourceImg;', 'pixel edits count as edits');
      assertIncludes(reset, 'originalImg = sourceImg;', 'back to the loaded file');
    });

    test('Tone effects render first, survive presets and preview without undo steps', () => {
      assertIncludes(editor, 'exposure: 0, highlights: 0, shadows: 0, vibrance: 0, levels: null, curve: null, wb: null,', 'effect keys');
      const compose = editor.slice(editor.indexOf('function _composePhoto()'), editor.indexOf('function _smoothstep('));
      assert(compose.indexOf('EditOps.applyTone') > 0 && compose.indexOf('EditOps.applyTone') < compose.indexOf('_applySharpen'), 'tone before the other effects');
      assertIncludes(editor, 'Object.assign(effects, border, tone);', 'presets keep tone corrections');
      assertIncludes(editor, "if (!saveHist) { _requestEffectRender(false, false); return; }", 'live preview: no history step');
      assertIncludes(editor, 'function commitEffects()', 'one step on OK');
    });

    test('Tools get the pointer through Editor.setToolHandler; the overlay keeps the selection', () => {
      assertIncludes(editor, 'if (toolHandler) { if (e.button === 0) toolHandler.down?.(_canvasPoint(e), e); return; }', 'left button to the tool');
      assertIncludes(editor, "if (toolHandler) { toolHandler.leave?.(); toolHandler = null; }", 'selection tools take it back');
      assertIncludes(editor, 'function redrawOverlay(draw)', 'overlay redraw');
      assertIncludes(editor, "_maskTint.mask !== selMask", 'mask tint cached (redrawn on every move)');
      for (const fn of ['setToolHandler', 'clientToImage', 'previewPixels', 'commitPixels', 'paintPixels', 'setMask', 'selectAll', 'editSelection', 'filterSelection', 'rotateFree', 'cropTo', 'resizeCanvas', 'commitEffects']) {
        assert(new RegExp(`\\b${fn},`).test(editor.slice(editor.lastIndexOf('return {'))), `${fn} exported`);
      }
    });

    test('Undo memory: one pixel copy per pixel change, effect steps share it, a byte budget', () => {
      assert(!/originalPixels/.test(editor), 'no hidden second copy of the picture');
      const snap = editor.slice(editor.indexOf('function _snapshot()'), editor.indexOf('function _historyBytes()'));
      assertIncludes(snap, 'const working = same ? _histShare.copy : _cloneImageData(workingPixels);', 'unchanged pixels shared');
      assertIncludes(editor, 'const MAX_HISTORY_BYTES = 768 * 1024 * 1024;', 'budget');
      assertIncludes(editor, 'while (history.length > 2 && _historyBytes() > MAX_HISTORY_BYTES) history.shift();', 'oldest steps dropped');
      const bake = editor.slice(editor.indexOf('function _bake()'), editor.indexOf('function _saveHistory()'));
      assertIncludes(bake, '_pixVersion++;', 'in-place pixel edits get a new copy');
    });

    test('Selections: Shift adds, Alt subtracts, drag moves the outline, Ctrl+drag moves the pixels', () => {
      const E2 = require(path.join(__dirname, '..', '..', 'src', 'js', 'editOps.js'));
      const add = E2.combineMasks(Uint8ClampedArray.from([255, 0, 0]), Uint8ClampedArray.from([0, 255, 0]), 'add');
      const sub = E2.combineMasks(Uint8ClampedArray.from([255, 255, 0]), Uint8ClampedArray.from([0, 255, 0]), 'sub');
      assert(add.join() === '255,255,0' && sub.join() === '255,0,0', 'combine');
      const m = new Uint8ClampedArray(9); m[4] = 255;
      assert(E2.shiftMask(m, 3, 3, 1, 1)[8] === 255 && E2.shiftMask(m, 3, 3, 1, 1)[4] === 0, 'shift');
      const down = editor.slice(editor.indexOf('function _onSelMouseDown(e)'), editor.indexOf('function _maskAt('));
      assertIncludes(down, "mode: e.shiftKey ? 'add' : 'sub'", 'Shift / Alt');
      assertIncludes(down, 'if (e.ctrlKey || e.metaKey) { _startSelMove(p, true); return; }', 'Ctrl+drag moves pixels');
      assertIncludes(down, "if (currentTool === 'rect-select' || currentTool === 'lasso') { _startSelMove(p, false); return; }", 'drag moves the outline');
      const mv = editor.slice(editor.indexOf('function _startSelMove('), editor.indexOf('function _onSelMouseMove('));
      assertIncludes(mv, 'if (lifted) { _bake(); _render(); _saveHistory(); }', 'moving pixels is one undo step');
      assert(editor.split('_applyCombine();').length - 1 >= 3, 'rectangle, lasso, polygon merge');
    });

    test('Shapes and text stay editable (live) until the next one; any other edit draws them in first', () => {
      const sc = tools.slice(tools.indexOf('function _shapeCommit('), tools.indexOf('function _restyle()'));
      assertIncludes(sc, "live = { kind: 'shape', tool: active, a, b, st: _shapeStyle(active) };", 'shape placed live, not painted');
      assert(!sc.includes('paintPixels'), 'not painted on release');
      assertIncludes(tools, "live = { kind: 'text', at, text, st: _textStyle() };", 'text placed live');
      assertIncludes(tools, "if (live && live.kind === 'text' && _liveHit(p)) _textEdit();", 'double-click edits text again');
      assertIncludes(tools, "if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); discardLive(); return true; }", 'Delete');
      assertIncludes(tools, 'Editor.setPendingHook?.({ flush:', 'Editor flushes it');
      for (const fn of ['rotate(deg)', 'flip(axis)', 'exportAsDataUrl(', 'exportSelection(', 'cropTo(rect)', 'cut()']) {
        const at = editor.indexOf('function ' + fn);
        assert(at > 0 && editor.slice(at, at + 160).includes('_flush();'), fn + ' flushes first');
      }
      assertIncludes(editor, 'if (pendingHook?.discard?.()) return true;   // the live shape / text was not drawn yet', 'Undo drops it');
      const draw = tools.slice(tools.indexOf('function _drawText('), tools.indexOf('function _liveBox('));
      assertIncludes(draw, 'c.strokeText(ln, at.x, y);', 'text outline');
      assertIncludes(draw, "c.shadowColor = 'rgba(0,0,0,0.6)';", 'text shadow');
      for (const k of ['et.outline', 'et.outlineColor', 'et.shadow', 'et.hint.live']) assert(ko[k] && en[k], k);
    });

    test('While typing, the text box can be dragged by its grip; handles show resize cursors', () => {
      const td = tools.slice(tools.indexOf('function _textDown('), tools.indexOf('function _textRestyle('));
      assertIncludes(td, "grip.className = 'et-text-grip';", 'move grip');
      assertIncludes(td, 'grip.setPointerCapture(ev.pointerId);', 'drag follows the pointer');
      assertIncludes(td, 'if (textBox) textBox.at = Editor.clientToImage(r.left + 1, r.top + 1);', 'text goes where the box is');
      assertIncludes(td, 'el.focus();', 'typing continues');
      const hc = tools.slice(tools.indexOf('const HANDLE_CURSOR = {'), tools.indexOf('function _move('));
      for (const c of ['nwse-resize', 'nesw-resize', 'ns-resize', 'ew-resize', 'move']) assertIncludes(hc, c, c);
      assertIncludes(hc, "['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][Math.round(deg / 45) % 4]", 'line ends: arrow along the line');
      assertIncludes(css, '.et-text-grip {', 'grip style');
      assert(ko['et.textMove'] && en['et.textMove'], 'grip tooltip');
    });

    /* ── UI ── */
    test('Second toolbar row: one button per tool with an icon, a name in both languages and a key', () => {
      assertIncludes(html, '<div id="ew-tools-row">', 'row markup');
      assert(html.indexOf('id="ew-tools-row"') > html.indexOf('id="ew-toolbar-row"') && html.indexOf('id="ew-tools-row"') < html.indexOf('id="edit-window-body"'), 'under the toolbar');
      const ids = [...tools.matchAll(/\{ id: '(\w+)', icon: '(\w+)', key: '(\w)'/g)];
      assert(ids.length === 16, `16 tools (got ${ids.length})`);
      const keys = new Set();
      for (const [, id, icon, key] of ids) {
        assert(new RegExp(`\\n  ${icon}: \``).test(icons.replace(/\r\n/g, '\n')), `icon ${icon}`);
        assert(ko[`et.tool.${id}`] && en[`et.tool.${id}`], `name of ${id}`);
        assert(!keys.has(key), `key ${key} used once`);
        keys.add(key);
      }
      assert(!keys.has('z') && !keys.has('v'), 'no clash with the pointer / undo letters');
    });

    test('Lines and shapes start 20 px wide (older saved widths are reset once)', () => {
      const sizes = tools.match(/const SIZE_DEFAULT = \{([^}]*)\}/)[1];
      for (const k of ['line', 'arrow', 'rect', 'ellipse']) assert(new RegExp(`\\b${k}: 20\\b`).test(sizes), `${k} 20 px`);
      assertIncludes(tools, 'if (o.size && o.shapeWidthV !== SHAPE_WIDTH_V) for (const k of SHAPES) delete o.size[k];', 'old widths dropped');
      assertIncludes(tools, 'cropFill: true, shapeWidthV: SHAPE_WIDTH_V,', 'fresh settings carry the version');
    });

    test('Every tool shows where it acts: "+" for shapes and click tools, an outline for brushes', () => {
      const cur = tools.slice(tools.indexOf('function _cursorFor(id)'), tools.indexOf('function _setCursor()'));
      assertIncludes(cur, "if (SHAPES.includes(id) || id === 'crop' || id === 'straighten' || id === 'wb' || id === 'redeye') return 'crosshair';", 'shapes get the crosshair');
      // Tools left with no system cursor must draw their outline instead
      const outlined = tools.match(/\['brush', 'highlighter', 'eraser', 'mosaic', 'blurBrush', 'clone', 'heal', 'redeye'\]\.includes\(tool\)/);
      assert(outlined, 'brush outline list');
      for (const m of tools.matchAll(/\{ id: '(\w+)', icon:/g)) {
        const id = m[1];
        const cross = ['line', 'arrow', 'rect', 'ellipse', 'crop', 'straighten', 'wb', 'redeye'].includes(id) || id === 'text';
        assert(cross || outlined[0].includes(`'${id}'`), `${id} has a visible cursor`);
      }
    });

    test('Every editTools string exists in both languages', () => {
      const keys = new Set([...tools.matchAll(/\bt\('([a-zA-Z]+\.[\w.]+)'/g)].map((m) => m[1]));
      for (const m of tools.matchAll(/'(et\.hint\.\w+)'/g)) keys.add(m[1]);
      for (const k of keys) assert(ko[k] && en[k], `missing ${k}`);
      for (const m of html.matchAll(/data-i18n="((?:tone|canvasSize|watermark|et|sel)\.[\w.]+)"/g)) assert(ko[m[1]] && en[m[1]], `missing ${m[1]}`);
      for (const k of ['menu.image', 'menu.select', 'effects.exposure', 'effects.highlights', 'effects.shadows']) assert(ko[k] && en[k], k);
    });

    test('Dialogs are in index.html (so they open in their own windows), scripts load in order', () => {
      for (const id of ['tone-overlay', 'canvas-size-overlay', 'watermark-overlay', 'amount-overlay']) {
        assertIncludes(html, `<div id="${id}" class="dialog-overlay"`, id);
      }
      const i1 = html.indexOf('js/editOps.js'), i2 = html.indexOf('js/editor.js'), i3 = html.indexOf('js/editTools.js');
      assert(i1 > 0 && i1 < i2 && i2 < i3 && i3 < html.indexOf('js/app.js'), 'editOps → editor → editTools → app');
      assertIncludes(tools, "cv.setPointerCapture(ev.pointerId);", 'curve drag works in the dialog window');
    });

    test('app.js: menus, adjustment sliders, keys first, pan with any tool', () => {
      assertIncludes(app, "items: () => EditTools.imageMenuItems() }", 'Image menu');
      assertIncludes(app, "items: () => _ewSelectMenuItems() }", 'Select menu');
      for (const k of ['exposure', 'highlights', 'shadows']) assertIncludes(app, `{ key:'${k}',`, `${k} slider`);
      const kb = app.slice(app.indexOf('function _initKeyboard()'));
      assert(kb.indexOf('EditTools?.handleKey(e)') < kb.indexOf("e.key === 'Escape'"), 'Esc leaves the tool before it closes the editor');
      assertIncludes(app, 'const panAnyTool = e.button === 1 || (e.button === 0 && window.EditTools?.isSpaceHeld());', 'middle button / Space + drag');
      assertIncludes(app, 'if (window.EditTools?.getActive()) EditTools.deactivate();', 'selection tools switch the drawing tool off');
      assertIncludes(app, 'if (state.editMode) window.EditTools?.refresh();', 'crop frame follows undo / redo');
    });

    test('A selection can be saved as its own picture (menus, right-click, viewer)', () => {
      const exp = editor.slice(editor.indexOf('function exportSelection('), editor.indexOf('History (Undo / Redo)'));
      assertIncludes(exp, 'cc.drawImage(_composePhoto(), -box.x, -box.y);', 'what is on screen (effects included)');
      assertIncludes(exp, 'd.data[i] = d.data[i] * m / 255;', 'outside the shape transparent, feathered edge fades');
      assertIncludes(exp, 'return _encode(c, format, quality);', 'white behind formats without alpha');
      assertIncludes(editor, "return _runSyncWithProgress(() => exportSelection('image/png')", 'copy uses the same export');
      const save = app.slice(app.indexOf('async function _saveSelectionAs()'), app.indexOf('async function _saveAs('));
      assertIncludes(save, 'Editor.exportSelection(format, quality)', 'exports the selection');
      assert(!save.includes('_cropToSelection') && !save.includes('_clearDirty'), 'the picture itself is not changed');
      const menu = app.slice(app.indexOf('function _ewSelectMenuItems()'), app.indexOf('async function _selectRegionToSave()'));
      for (const tool of ['rect-select', 'lasso', 'polygon', 'magic-wand']) assertIncludes(menu, "pickTool('" + tool + "')", tool);
      assertIncludes(menu, '...EditTools.selectMenuItems()', 'selection edits');
      const ctxMenu = app.slice(app.indexOf('function _showEditContextMenu('), app.indexOf('function _buildEditEffectsPanel('));
      assertIncludes(ctxMenu, "submenu: () => _ewSelectMenuItems() }", 'right-click: Select flyout');
      assertIncludes(ctxMenu, 'action: () => _saveSelectionAs() }', 'right-click: save selection');
      assertIncludes(app, "label: `${t('sel.pickRegion')}…`, action: () => _selectRegionToSave() }", 'viewer right-click');
      for (const k of ['sel.saveAs', 'sel.pickRegion', 'sel.pickRegionHint', 'sel.none', 'sel.saved', 'save.selectionSuffix']) assert(ko[k] && en[k], k);
      // A right-click (to open the menu) must not replace the selection with an empty one
      const down = editor.slice(editor.indexOf('function _onSelMouseDown(e)'), editor.indexOf('function _onSelMouseMove(e)'));
      assert(down.indexOf('if (e.button !== 0) return;') > 0 && down.indexOf('if (e.button !== 0) return;') < down.indexOf('isDrawingSelection = true'), 'left button only');
    });

    test('Tool options fit the narrowest window (1200 px) and never widen it', () => {
      const row = css.slice(css.indexOf('#ew-tools-row {'), css.indexOf('#ew-tool-buttons {'));
      assertIncludes(row, 'overflow: hidden;', 'row clips');
      const opts = css.slice(css.indexOf('#ew-tool-options {'), css.indexOf('#ew-tool-options .et-name'));
      assertIncludes(opts, 'min-width: 0;', 'options shrink');
      assertIncludes(css, '@media (max-width: 1349px) { #ew-tool-options .et-name { display: none; } }', 'name hidden when narrow');
      const measure = app.slice(app.indexOf('function _measureEditTitlebarWidth()'), app.indexOf('function _mainMinWidth()'));
      assert(!measure.includes('ew-tools-row'), 'min width follows the toolbar row only');
    });
  },
};
