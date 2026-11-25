'use strict';

/** Super-resolution (superRes.js, superResUI.js, host superres.rs) and the image writers (imageCodec.js). */
const path = require('path');

module.exports = {
  name: 'Super-resolution & image formats',
  run({ test, src, h }) {
    const { html, app, editor, main, preload, css, icons, ko, en, fileDialog } = src;
    const { assert, assertIncludes } = h;
    const SR = require(path.join(__dirname, '..', '..', 'src', 'js', 'superRes.js'));
    const Codec = require(path.join(__dirname, '..', '..', 'src', 'js', 'imageCodec.js'));
    const ui = h.read('src/js/superResUI.js');
    const host = h.read('src-tauri/src/host/superres.rs');
    const web = h.read('src/js/webAPI.js');

    const img = (w, hh, fn) => {
      const data = new Uint8ClampedArray(w * hh * 4);
      for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) data.set(fn(x, y), (y * w + x) * 4);
      return { width: w, height: hh, data };
    };
    const px = (im, x, y) => Array.from(im.data.slice((y * im.width + x) * 4, (y * im.width + x) * 4 + 4));

    test('superResUI.js loads (no top-level error) and picks the first-run defaults', () => {
      const vm = require('vm');
      const store = {};
      const load = (electronAPI) => {
        const win = { SuperRes: SR, electronAPI, I18n: { t: (k) => k } };
        win.window = win;
        win.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
        vm.runInNewContext(ui, win);
        return win.SuperResUI;
      };
      const desk = load({ superresRun() {} });
      assert(desk && typeof desk.open === 'function', 'module built');
      assert(desk._prefs().algo === 'esrgan-x4plus' && desk._prefs().format === 'jpg', 'desktop: Real-ESRGAN x4plus, JPG');
      assert(load(undefined)._prefs().algo === 'lanczos', 'browser: Lanczos');
    });

    test('Catalogue: 4 built-in algorithms and 15 AI models over 7 engines (3 portable, 4 PyTorch)', () => {
      const ids = SR.ALGORITHMS.map((a) => a.id);
      assert(ids.filter((id) => SR.algorithm(id).kind === 'builtin').join() === 'nearest,bilinear,bicubic,lanczos', 'built-in');
      assert(SR.ALGORITHMS.filter((a) => a.kind === 'ai').length === 15, 'AI models');
      assert(SR.ENGINES.map((e) => e.key).join() === 'realesrgan,realcugan,waifu2x,swinir,edsr,aurasr,espcn', 'engines');
      assert(SR.ENGINES.filter((e) => e.py).map((e) => e.key).join() === 'swinir,edsr,aurasr,espcn', 'PyTorch family');
      for (const a of SR.ALGORITHMS.filter((x) => x.py)) assert(a.params.includes('device'), `${a.id}: GPU / CPU choice`);
      for (const e of SR.ENGINES) for (const id of e.algos) assert(SR.algorithm(id).engine === e.key, `${id} → ${e.key}`);
      const hosts = host + h.read('src-tauri/src/host/superres_py.rs');
      for (const a of SR.ALGORITHMS.filter((x) => x.kind === 'ai')) assertIncludes(hosts, `"${a.id}"`, `host knows ${a.id}`);
    });

    test('Every algorithm, description, parameter and choice has Korean and English text', () => {
      const need = new Set(['sr.title', 'sr.tab', 'sr.run', 'sr.titleTip']);
      for (const a of SR.ALGORITHMS) {
        need.add(`sr.algo.${a.id}`); need.add(`sr.desc.${a.id}`);
        for (const k of a.params) need.add(`sr.param.${k}`);
      }
      for (const v of SR.PARAMS.noise.values) need.add(`sr.noise.${v}`);
      for (const v of SR.PARAMS.syncgap.values) need.add(`sr.syncgap.${v}`);
      for (const m of ui.matchAll(/t\('(sr\.[\w.-]+)'/g)) need.add(m[1]);
      for (const m of html.matchAll(/data-i18n(?:-title)?="(sr\.[\w.-]+)"/g)) need.add(m[1]);
      for (const p of ['preparing', 'downloading', 'extracting', 'running', 'reading', 'finishing', 'applying']) need.add(`sr.p.${p}`);
      for (const k of need) assert(ko[k] && en[k], `missing text ${k}`);
    });

    test('Parameters: defaults, allowed values, and the same corrections as the host', () => {
      assert(SR.defaults('lanczos').scale === 2 && SR.defaults('lanczos').lobes === 3, 'lanczos defaults');
      assert(SR.defaults('esrgan-x4plus').outScale === 4, 'x4plus makes ×4');
      // Real-CUGAN SE ×3 / ×4 have only conservative, none and strong models
      assert(SR.normalize('cugan-se', { scale: 4, noise: 2 }).noise === 3, 'cugan ×4 noise 2 → 3 (host: same)');
      assert(SR.normalize('cugan-se', { scale: 2, noise: 2 }).noise === 2, 'cugan ×2 keeps 2');
      assert(SR.normalize('cugan-pro', { scale: 4, noise: 1 }).scale === 3 && SR.normalize('cugan-pro', { noise: 1 }).noise === 0, 'pro ×4 → ×3, noise 1 → 0');
      assert(SR.normalize('waifu2x-cunet', { scale: 1, noise: -1 }).noise === 0, 'waifu2x ×1 is denoise only');
      assert(SR.normalize('waifu2x-photo', { scale: 1 }).scale === 2, 'upconv has no ×1');
      assert(SR.paramSpec('esrgan-x4plus', 'gpu').values.indexOf('cpu') < 0 && SR.paramSpec('cugan-se', 'gpu').values.includes('cpu'), 'CPU only for CUGAN / waifu2x');
      assert(SR.normalize('bicubic', { cubicA: -9, sharpen: 999 }).cubicA === -1 && SR.normalize('bicubic', { sharpen: 999 }).sharpen === 200, 'ranges clamp');
      assert(SR.normalize('esrgan-x4plus', { tta: 1 }).tta === true, 'checkbox');
      assertIncludes(host, 'num(params, key).map(|v| nearest(v, allowed)).unwrap_or(default)', 'host: nearest allowed value');
      assertIncludes(host, 'let noises: &[i64] = if !pro && scale == 2 { &[-1, 0, 1, 2, 3] } else { &[-1, 0, 3] };', 'host: CUGAN noise list');
    });

    test('Defaults: best model on the desktop, Lanczos in a browser, tuned sharpening; reset buttons', () => {
      assert(SR.DEFAULT_AI === 'esrgan-x4plus' && SR.DEFAULT_BUILTIN === 'lanczos', 'first-run algorithm');
      assert(SR.defaults('lanczos').sharpen === 20 && SR.defaults('bicubic').sharpen === 30 && SR.defaults('bilinear').sharpen === 50, 'built-in sharpening');
      assert(SR.defaults('nearest').sharpen === undefined && SR.defaults('esrgan-x4plus').sharpen === 0 && SR.defaults('cugan-se').noise === -1, 'AI: no sharpening, conservative denoise');
      assertIncludes(html, 'id="sr-reset-params" data-i18n="sr.resetParams"', 'this algorithm');
      assertIncludes(html, 'id="sr-reset-all" data-i18n="sr.resetAll"', 'everything, in the dialog');
      assertIncludes(html, 'id="settings-sr-reset" data-i18n="sr.resetAll"', 'everything, in the Settings window');
      for (const id of ['settings-sr-algo', 'settings-sr-format', 'settings-sr-quality', 'settings-sr-save']) assertIncludes(html, `id="${id}"`, id);
      assertIncludes(ui, 'function resetAll() {', 'reset');
    });

    test('Progress: percent from the worker or the engine, elapsed time and time left', () => {
      assertIncludes(ui, "(f) => prog(2 + f * 90, _msg(`running|${Math.round(f * 100)}`, label))", 'built-in percent');
      assertIncludes(ui, 'const tick = () => dlg.setDetail?.(_timeText((performance.now() - started) / 1000, lastPct));', 'time line');
      assertIncludes(ui, "return `${head}  ·  ${t('sr.left', 'about {t} left').replace('{t}', _clock(elapsed * (100 - pct) / pct))}`;", 'estimate');
      for (const k of ['sr.elapsed', 'sr.left', 'sr.sec', 'sr.min', 'sr.resetAll', 'sr.defAlgo']) assert(ko[k] && en[k], k);
    });

    test('Output size, and pictures too large to hold are refused before running', () => {
      const o = SR.outputSize(1200, 800, 'esrgan-x4plus', { outScale: 3 });
      assert(o.width === 3600 && o.height === 2400, 'output ×3');
      assert(SR.engineScale('esrgan-x4plus', { outScale: 2 }) === 4, 'engine still makes ×4');
      assert(SR.sizeProblem(1000, 1000, 'lanczos', { scale: 4 }) === null, '4000² fits');
      assert(SR.sizeProblem(5000, 4000, 'lanczos', { scale: 4 }) === 'side', 'over 16384 px');
      assert(SR.sizeProblem(3000, 3000, 'esrgan-x4plus', { outScale: 2 }) === 'pixels', 'engine ×4 = 144 MP');
    });

    test('Nearest repeats pixels exactly; the filters keep flat colour and the mean', () => {
      const src = img(3, 2, (x, y) => [x * 100, y * 200, 50, 255]);
      const n = SR.upscaleBuiltin(src, 'nearest', { scale: 3 });
      assert(n.width === 9 && n.height === 6, 'size');
      assert(px(n, 4, 4).join() === '100,200,50,255', 'block copy');
      const flat = img(10, 10, () => [90, 140, 200, 255]);
      for (const m of ['bilinear', 'bicubic', 'lanczos']) {
        const o = SR.upscaleBuiltin(flat, m, { scale: 4 });
        assert(o.width === 40 && o.height === 40, `${m} size`);
        for (const [x, y] of [[0, 0], [17, 23], [39, 39]]) assert(px(o, x, y).join() === '90,140,200,255', `${m} flat at ${x},${y}`);
      }
      const odd = SR.upscaleBuiltin(flat, 'lanczos', { scale: 1.5 });
      assert(odd.width === 15 && odd.height === 15, 'non-integer scale');
    });

    test('Lanczos keeps an edge sharper than bilinear; sharpening adds contrast', () => {
      const edge = img(16, 4, (x) => (x < 8 ? [20, 20, 20, 255] : [230, 230, 230, 255]));
      const width = (o) => { let n = 0; for (let x = 0; x < o.width; x++) { const v = px(o, x, 2)[0]; if (v > 40 && v < 210) n++; } return n; };
      const bl = SR.upscaleBuiltin(edge, 'bilinear', { scale: 4, sharpen: 0 });
      const lz = SR.upscaleBuiltin(edge, 'lanczos', { scale: 4, lobes: 3, sharpen: 0 });
      assert(width(lz) < width(bl), `transition: lanczos ${width(lz)} < bilinear ${width(bl)}`);
      const sh = SR.sharpen(bl, 150, 1.5);
      assert(px(sh, 29, 2)[0] < px(bl, 29, 2)[0] && px(sh, 34, 2)[0] > px(bl, 34, 2)[0], 'unsharp mask steepens the edge');
      assert(SR.sharpen(bl, 0) === bl, '0 % is a no-op');
    });

    test('See-through edges do not turn dark (premultiplied filtering)', () => {
      const s = img(8, 8, (x) => (x < 4 ? [255, 0, 0, 255] : [0, 0, 0, 0]));
      const o = SR.upscaleBuiltin(s, 'lanczos', { scale: 4 });
      for (let x = 0; x < o.width; x++) {
        const [r, , , a] = px(o, x, 16);
        if (a > 20) assert(r > 235, `pure red where visible (x ${x}: ${r}, alpha ${a})`);
      }
    });

    test('Progress is reported while the built-in path works', () => {
      const seen = [];
      SR.upscaleBuiltin(img(60, 60, () => [1, 2, 3, 255]), 'bicubic', { scale: 2, sharpen: 20 }, (f) => seen.push(f));
      assert(seen.length > 5 && seen[seen.length - 1] === 1 && seen.every((v, i) => i === 0 || v >= seen[i - 1]), 'climbing to 1');
    });

    test('The worker answers an upscale message with a transferred result', () => {
      const out = [];
      const s = img(4, 4, () => [10, 20, 30, 255]);
      SR._onWorkerMessage({ data: { cmd: 'upscale', id: 7, width: 4, height: 4, buffer: s.data.buffer, algo: 'nearest', params: { scale: 2 } } }, { postMessage: (m, tr) => out.push([m, tr]) });
      const [done, transfer] = out[out.length - 1];
      assert(done.id === 7 && done.done && done.width === 8 && transfer[0] === done.buffer, 'done message');
      SR._onWorkerMessage({ data: { cmd: 'upscale', id: 8, width: 2, height: 2, buffer: new Uint8ClampedArray(16).buffer, finishOnly: true, outW: 6, outH: 3, params: {} } }, { postMessage: (m) => out.push([m]) });
      assert(out[out.length - 1][0].width === 6 && out[out.length - 1][0].height === 3, 'finishing pass fits the AI result to the asked size');
    });

    test('Formats: JPG is the default, all six are offered, GIF / BMP / AVIF go through ImageCodec', () => {
      assert(SR.FORMATS.map((f) => f.ext).join() === 'jpg,png,webp,avif,gif,bmp', 'format list');
      assertIncludes(ui, "return { algo: desktop() ? SR.DEFAULT_AI : SR.DEFAULT_BUILTIN, params: {}, format: 'jpg', quality: 92, save: true };", 'JPG by default');
      assertIncludes(fileDialog, "const SAVE_EXTS = ['png', 'jpg', 'webp', 'avif', 'gif', 'bmp'];", 'Save As offers all of them');
      assertIncludes(fileDialog, "const LOSSY_EXTS = ['jpg', 'jpeg', 'webp', 'avif'];", 'AVIF has a quality');
      assertIncludes(app, "const ext = { 'image/bmp': 'bmp', 'image/gif': 'gif', 'image/avif': 'avif' }[format];", 'save routes them to ImageCodec');
      assertIncludes(app, "exported = await _exportForSave(format, quality);", 'Save As');
      assertIncludes(main, '"encode-avif" => superres::encode_avif(a0),', 'host AVIF writer');
      assertIncludes(preload, "encodeAvif: (opts) => call('encode-avif', opts),", 'bridge');
      for (const k of ['fd.filterAvif', 'fd.filterGif', 'save.avifUnavailable', 'save.gifTooLarge']) assert(ko[k] && en[k], k);
    });

    test('BMP writer: 24-bit, bottom-up, padded rows, transparency on white', () => {
      const b = Codec.encodeBmp(img(3, 2, (x, y) => (y === 0 ? [255, 0, 0, 255] : [0, 0, 255, x === 2 ? 0 : 255])));
      const u32 = (o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);
      assert(b[0] === 0x42 && b[1] === 0x4d && u32(2) === b.length && u32(18) === 3 && u32(22) === 2 && b[28] === 24, 'header');
      assert(b.length === 54 + 12 * 2, 'rows padded to 12 bytes');
      assert(b[54] === 255 && b[55] === 0 && b[56] === 0, 'first stored row = bottom row (blue, BGR)');
      assert(b[54 + 6] === 255 && b[54 + 7] === 255 && b[54 + 8] === 255, 'see-through → white');
      assert(b[54 + 12 + 2] === 255 && b[54 + 12] === 0, 'top row red');
    });

    test('GIF writer: decodes back to the same picture (sharp), palette + transparency', async () => {
      const sharp = require('sharp');
      const w = 120, hh = 80;
      const s = img(w, hh, (x, y) => ((x + y) % 23 === 0 ? [0, 0, 0, 0] : [Math.round(x * 255 / w), Math.round(y * 255 / hh), 140, 255]));
      const g = Codec.encodeGif(s);
      assert(String.fromCharCode(...g.slice(0, 6)) === 'GIF89a' && g[g.length - 1] === 0x3b, 'GIF89a … trailer');
      const { data, info } = await sharp(Buffer.from(g)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert(info.width === w && info.height === hh, 'size');
      let err = 0, n = 0;
      for (let i = 0; i < w * hh; i++) {
        if (s.data[i * 4 + 3] === 0) { assert(data[i * 4 + 3] === 0, 'transparent stays transparent'); continue; }
        for (let k = 0; k < 3; k++) { err += Math.abs(data[i * 4 + k] - s.data[i * 4 + k]); n++; }
      }
      assert(err / n < 6, `mean colour error ${(err / n).toFixed(2)}`);
      // Long runs reset the LZW table (4096 codes) and must still decode
      const big = img(700, 400, (x, y) => [(x * 7 + y * 13) & 255, (x * y) & 255, (x ^ y) & 255, 255]);
      const meta = await sharp(Buffer.from(Codec.encodeGif(big, { dither: false }))).metadata();
      assert(meta.width === 700 && meta.height === 400, 'big noisy GIF decodes');
    });

    test('File name: shown and editable, cleaned before saving', () => {
      const vm = require('vm');
      const win = { SuperRes: SR, electronAPI: { superresRun() {} }, I18n: { t: (k) => k }, localStorage: { getItem: () => null, setItem() {} } };
      win.window = win;
      vm.runInNewContext(ui, win);
      const c = win.SuperResUI.cleanName;
      assert(c('my photo.jpg', 'jpg') === 'my photo', 'extension typed twice');
      assert(c('a/b:c*?.png', 'jpg') === 'a_b_c__.png', 'reserved characters');
      assert(c('name. ', 'png') === 'name', 'trailing dot / space');
      assertIncludes(ui, "nameEdited = el['sr-name'].value.trim() !== '' && el['sr-name'].value !== _autoName();", 'automatic until edited');
      assertIncludes(ui, "if (el['sr-name'] && !nameEdited) el['sr-name'].value = _autoName();", 'follows algorithm and scale');
      for (const k of ['sr.fileName', 'sr.formatQuality', 'sr.saveFolder', 'sr.browse', 'sr.nameAuto', 'sr.saved']) assert(ko[k] && en[k], k);
    });

    test("Scale: buttons up to each model's maximum", () => {
      const max = Object.fromEntries(SR.ALGORITHMS.map((a) => [a.id, SR.maxScale(a.id)]));
      assert(max.lanczos === 8 && max['esrgan-x4plus'] === 4 && max['esrgan-animevideov3'] === 4 && max['cugan-se'] === 4 && max['cugan-pro'] === 3, JSON.stringify(max));
      assert(max['waifu2x-cunet'] === 32 && max['waifu2x-photo'] === 32 && max['waifu2x-anime'] === 32, 'waifu2x goes to 32x');
      assertIncludes(host, 'let scales: &[i64] = if algo == "waifu2x-cunet" { &[1, 2, 4, 8, 16, 32] } else { &[2, 4, 8, 16, 32] };', 'host agrees');
      assertIncludes(ui, "btn.className = `sr-scale-btn${v === p[key] ? ' active' : ''}`;", 'one button per scale');
      assert(ko['sr.maxScale'] && en['sr.maxScale'], 'max text');
    });

    test('PyTorch family: own environment, the CUDA / CPU build by hardware, pinned models, GPU→CPU fallback', () => {
      const py = h.read('src-tauri/src/host/superres_py.rs');
      const worker = h.read('scripts/sr_worker.py');
      assertIncludes(py, 'fn venv_dir() -> PathBuf {\n    base().join("venv")', 'own virtual environment');
      assertIncludes(py, '(m, _) if m >= 13 => "cu130",', 'CUDA build from the driver');
      assertIncludes(py, 'torch_args.extend(["--index-url", index.as_str()]);', 'PyTorch only from its own index');
      assertIncludes(py, '"aura-sr", "opencv-contrib-python-headless<5"', 'AuraSR + OpenCV (ESPCN)');
      assertIncludes(py, '// Only now does the new environment replace the old one', 'rebuild keeps the old one on failure');
      assert((py.match(/"[0-9a-f]{64}"/g) || []).length === 18, '18 pinned model files');
      for (const a of SR.ALGORITHMS.filter((x) => x.py)) assertIncludes(py, `"${a.id}"`, `host plans ${a.id}`);
      assertIncludes(worker, 'return torch.device("cuda"), torch.cuda.get_device_name(0)', 'CUDA first');
      assertIncludes(worker, 'return torch.device("mps"), "Apple GPU (MPS)"', 'then Apple MPS');
      assertIncludes(worker, 'def with_gpu_fallback(device, name, tile, work):', 'GPU out of memory → smaller tiles → CPU');
      assertIncludes(worker, 'sr.setPreferableTarget(cv2.dnn.DNN_TARGET_OPENCL)', 'ESPCN: OpenCL GPU');
      assert(!/import timm|from timm/.test(h.read('scripts/sr_models/network_swinir.py')), 'SwinIR needs nothing but torch');
      assert(h.exists('scripts/sr_models/LICENSE-SwinIR'), 'licence kept');
      assertIncludes(h.read('scripts/stage-runtime.js'), "fs.copyFileSync(path.join(ROOT, 'scripts', 'sr_worker.py'), path.join(OUT, 'sr_worker.py'));", 'installed with the app');
      for (const k of ['sr.env.title', 'sr.env.cuda', 'sr.env.cpu', 'sr.device.auto', 'sr.device.gpu', 'sr.device.cpu', 'sr.p.downloading_packages', 'sr.envFailed']) assert(ko[k] && en[k], k);
    });

    test('Model drop-downs: edit window toolbar and the popup heading, kept in step', () => {
      assertIncludes(html, '<select id="ew-sr-algo" class="ew-select ew-sr-algo" data-i18n-title="sr.modelTip"></select>', 'toolbar');
      assertIncludes(html, '<select id="sr-algo-select" class="resize-select sr-algo-select" data-i18n-title="sr.modelTip"></select>', 'popup');
      assertIncludes(ui, "if (document.getElementById('superres-overlay')?.classList.contains('visible')) _select(sel.value);", 'toolbar → popup');
      assertIncludes(ui, "if (el['sr-algo-select']) el['sr-algo-select'].value = id;\n    syncToolbar();", 'popup → toolbar');
      assertIncludes(app, 'window.SuperResUI?.syncToolbar();', 'language change');
      assert(SR.DEFAULT_AI === 'esrgan-x4plus', 'Real-ESRGAN is the default');
    });

    test('Edit window: toolbar button, Image menu, Ctrl+Shift+U, the dialog and its parts', () => {
      assertIncludes(html, '<button class="ew-btn" id="ew-superres" data-i18n-title="sr.titleTip"></button>', 'toolbar button');
      assertIncludes(app, "['ew-superres',  'superRes',    'sr.titleTip',          () => { SuperResUI.open(); }],", 'button action');
      assertIncludes(app, "shortcut: 'Ctrl+Shift+U', disabled: !Editor.isLoaded(), action: () => SuperResUI.open() },", 'Image menu');
      assertIncludes(app, "if (ctrl && e.shiftKey && e.code === 'KeyU') { e.preventDefault(); if (state.editMode && _isEditableImage()) SuperResUI.open(); return; }", 'shortcut');
      for (const id of ['superres-overlay', 'sr-algo-select', 'sr-params', 'sr-size', 'sr-format', 'sr-quality', 'sr-save', 'sr-ok', 'sr-cancel', 'sr-warn']) assertIncludes(html, `id="${id}"`, id);
      assert(icons.includes('superRes: `<svg') && icons.includes("superRes: '#22d3ee'"), 'icon + colour');
      const order = ['js/editOps.js', 'js/imageCodec.js', 'js/superRes.js', 'js/editor.js', 'js/editTools.js', 'js/superResUI.js', 'js/app.js'].map((s) => html.indexOf(s));
      assert(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), 'script order');
      assertIncludes(css, '.dialog-box.superres-box {', 'fixed-size popup');
    });

    test('Result: applied as one undo step (rotation / effects start over), then saved as a new file', () => {
      assertIncludes(editor, 'function applyImageData(img) {', 'editor API');
      assertIncludes(editor, 'exportImageData, applyImageData,', 'exported');
      assertIncludes(ui, 'Editor.applyImageData(result);', 'applies');
      assertIncludes(ui, 'return `${_stem()}_SR_${algoId}_x${SR.targetScale(algoId, params)}`;', 'automatic name');
      assertIncludes(ui, 'const candidate = await api().pathJoin(dir, n === 1 ? `${stem}.${fmt.ext}` : `${stem} (${n}).${fmt.ext}`);', 'never overwrites');
      assertIncludes(app, 'writeImage: (o) => _writeImageFile(o),', 'written in the chosen format');
      for (const id of ['sr-name', 'sr-name-ext', 'sr-name-auto', 'sr-folder', 'sr-folder-pick']) assertIncludes(html, `id="${id}"`, id);
      assertIncludes(fileDialog, 'const q = Number(quality) > 0 && Number(quality) <= 1 ? Math.max(40, Math.round(quality * 100)) : _savedQuality();', 'quality carried into Save As');
    });

    test('AI: missing engine installs automatically with the progress popup and a Stop button', () => {
      assertIncludes(host, 'if installed_exe(e).is_none() {\n        let r = install_engine(e, false, 1.0, 30.0);', 'run installs first');
      assertIncludes(ui, "onCancel: () => { signal.cancelled = true; api().superresCancel?.(); },", 'Stop');
      assertIncludes(ui, 'unsub = api().onSuperresProgress?.(({ percent, message }) => prog(Math.min(85, percent * 0.85), _msg(message, label)));', 'host progress → popup');
      assertIncludes(ui, "if (r.code === 'DOWNLOAD_FAILED' || r.code === 'ENV_FAILED') {", 'download / package failure offers Retry');
      assertIncludes(preload, "on('sr-progress', cb);", 'bridge event');
      assertIncludes(preload, "return () => { const l = listeners['sr-progress'] || []; const i = l.indexOf(cb); if (i >= 0) l.splice(i, 1); };", 'listener removed after the run');
      assertIncludes(web, 'onSuperresProgress: () => () => {},', 'web build: no engines, no crash');
      for (const ch of ['superres-status', 'superres-install', 'superres-uninstall', 'superres-run', 'superres-cancel', 'superres-discard']) {
        assertIncludes(main, `"${ch}" =>`, `host ${ch}`);
        assertIncludes(preload, `call('${ch}'`, `bridge ${ch}`);
      }
    });

    test('Host: pinned official releases, checksum, staged unpack, cancel, no free-form arguments', () => {
      assert((host.match(/sha256: "[0-9a-f]{64}"/g) || []).length === 9, '3 engines × 3 systems, each SHA-256');
      for (const u of ['github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0', 'github.com/nihui/realcugan-ncnn-vulkan/releases/download/20220728', 'github.com/nihui/waifu2x-ncnn-vulkan/releases/download/20250915']) assertIncludes(host, u, u);
      assertIncludes(host, 'download_cancel(&asset_url(e), &zip_path, Some(("sha256", a.sha256)), Some(&CANCEL),', 'verified download, cancellable');
      assertIncludes(host, '// Only now does the new copy replace the old one', 'failed reinstall keeps the old copy');
      assertIncludes(host, 'fn untrusted_values_never_reach_the_command_line()', 'cargo test');
      assertIncludes(host, 'MYIMAGEVIEWER_SR_URL_BASE', 'test hook: local server');
    });

    test('Settings › Super-resolution: download, reinstall and remove each engine', () => {
      assertIncludes(html, 'data-tab="superres" aria-selected="false" data-i18n="sr.tab"', 'tab');
      assertIncludes(html, '<div id="settings-sr-engines" class="sr-engines"></div>', 'engine list');
      assertIncludes(app, "if (id === 'superres') SuperResUI.syncSettings();", 'filled when opened');
      assertIncludes(ui, "const installed = key === 'pytorch' ? !!engineStatus?.env?.installed : !!_engineInfo(key)?.installed;", 'Download / Reinstall');
      assertIncludes(ui, "rows.push(_engineRow({ key: 'pytorch', label: t('sr.env.title', 'PyTorch environment')", 'the PyTorch environment row');
      assertIncludes(ui, "const r = await api().superresUninstall({ engine: key });", 'Remove');
      assertIncludes(ui, "title: t(force ? 'sr.reinstallTitle' : 'sr.installTitle', 'Install model'),", 'progress popup title');
    });
  },
};
