/* Edit window › Super-resolution: the dialog (algorithm list, the chosen algorithm's
 * parameters, output size and file format), the run (built-in in a worker, AI through the
 * host's engines — installed on first use, progress and Stop in the progress popup) and
 * Settings › Super-resolution (download / reinstall / remove each engine).
 *
 * app.js calls init(ctx) once; open() shows the dialog; renderSettings() fills the tab.
 * ctx = { t, progress, showDialog, hideDialog, showError, messageBox, status, afterApply,
 *         saveAs({ ext, quality, defaultPath }), currentFile() }
 */
window.SuperResUI = (() => {
  const STORE_KEY = 'superResV1';
  const SR = window.SuperRes;
  let ctx = null;
  let el = {};
  let busy = false;
  let engineStatus = null;   // last superres-status answer
  let nameEdited = false;    // the user typed a file name: stop renaming it automatically
  let folder = '';           // where the result is saved (the original's folder unless changed)

  const t = (k, fb) => {
    try { const s = ctx?.t ? ctx.t(k) : I18n.t(k); return s && s !== k ? s : (fb ?? k); } catch { return fb ?? k; }
  };
  // (function declarations: _load() below runs while this module is being built)
  function api() { return window.electronAPI || {}; }
  function desktop() { return typeof api().superresRun === 'function'; }
  let prefs = _load();

  /** Everything as first installed: the best-quality model on the desktop (Real-ESRGAN x4plus,
   *  photos, ×4), Lanczos in a browser; JPG at 92; save as a new file. */
  function _defaults() {
    return { algo: desktop() ? SR.DEFAULT_AI : SR.DEFAULT_BUILTIN, params: {}, format: 'jpg', quality: 92, save: true };
  }

  function _load() {
    const base = _defaults();
    try {
      const o = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
      const f = SR.format(o.format);
      return { ...base, ...o, format: f ? f.ext : 'jpg', params: o.params && typeof o.params === 'object' ? o.params : {} };
    } catch { return base; }
  }
  function _save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(prefs)); } catch { /* no storage */ } }

  const _esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function _paramsOf(id) { return SR.normalize(id, prefs.params[id] || {}); }

  /* ════════════ Dialog ════════════ */

  function init(appCtx) {
    ctx = appCtx || {};
    for (const id of ['superres-overlay', 'sr-algo-select', 'sr-algo-desc', 'sr-algo-badge', 'sr-params', 'sr-size',
      'sr-warn', 'sr-format', 'sr-quality-row', 'sr-quality', 'sr-quality-val', 'sr-save', 'sr-ok', 'sr-cancel', 'sr-close',
      'sr-reset-params', 'sr-reset-all', 'sr-name', 'sr-name-ext', 'sr-name-auto', 'sr-folder', 'sr-folder-pick']) el[id] = document.getElementById(id);
    if (!el['superres-overlay'] || el['superres-overlay']._srBound) return;
    el['superres-overlay']._srBound = true;
    el['sr-ok'].addEventListener('click', () => _confirm());
    for (const b of [el['sr-cancel'], el['sr-close']]) b?.addEventListener('click', () => close());
    el['sr-format'].addEventListener('change', () => { prefs.format = el['sr-format'].value; _save(); _syncOutput(); });
    el['sr-quality'].addEventListener('input', () => { prefs.quality = +el['sr-quality'].value; el['sr-quality-val'].textContent = `${prefs.quality}`; _save(); });
    el['sr-save'].addEventListener('change', () => { prefs.save = el['sr-save'].checked; _save(); _syncOutput(); });
    el['sr-reset-params']?.addEventListener('click', () => { delete prefs.params[prefs.algo]; _save(); _renderParams(); _syncOutput(); });
    el['sr-name']?.addEventListener('input', () => { nameEdited = el['sr-name'].value.trim() !== '' && el['sr-name'].value !== _autoName(); });
    el['sr-name-auto']?.addEventListener('click', () => { nameEdited = false; _syncOutput(); el['sr-name'].focus(); });
    el['sr-folder-pick']?.addEventListener('click', async () => {
      const r = await window.FileDialog?.openFolder({ defaultPath: folder });
      if (r && !r.canceled && r.filePath) { folder = r.filePath; _syncOutput(); }
    });
    el['sr-algo-select']?.addEventListener('change', () => _select(el['sr-algo-select'].value));
    _bindToolbar();
    el['sr-reset-all']?.addEventListener('click', () => { resetAll(); _fillFormats(); _select(prefs.algo); });
    el['superres-overlay'].addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      if (e.key === 'Enter' && !/^(SELECT|BUTTON)$/.test(e.target.tagName)) { e.preventDefault(); _confirm(); }
    });
  }

  async function open() {
    if (!Editor.isLoaded() || busy) return;
    nameEdited = false;
    folder = await _sourceDir();
    _fillFormats();
    _fillAlgoSelect(el['sr-algo-select']);
    _select(SR.algorithm(prefs.algo) ? prefs.algo : SR.DEFAULT_BUILTIN);
    ctx.showDialog('superres-overlay');
    el['sr-ok']?.focus();
    refreshStatus().then(() => { _syncBadge(); _syncOutput(); });
  }

  function close() { ctx.hideDialog('superres-overlay'); }

  function _fillFormats() {
    const sel = el['sr-format'];
    sel.innerHTML = SR.FORMATS.map((f) => `<option value="${f.ext}">${f.label}${f.ext === 'jpg' ? ` (${_esc(t('sr.default', 'default'))})` : ''}</option>`).join('');
    sel.value = prefs.format;
    el['sr-quality'].value = String(prefs.quality);
    el['sr-quality-val'].textContent = String(prefs.quality);
    el['sr-save'].checked = prefs.save !== false;
  }

  function _engineInfo(key) {
    return engineStatus?.engines?.find((e) => e.key === key) || null;
  }

  function _badge(a) {
    if (a.kind === 'builtin') return { cls: 'ok', text: t('sr.builtin', 'Built in') };
    if (!desktop()) return { cls: 'off', text: t('sr.desktopOnly', 'Desktop app only') };
    const info = _engineInfo(a.engine);
    if (!info) return { cls: 'wait', text: '…' };
    return info.installed
      ? { cls: 'ok', text: t('sr.installed', 'Installed') }
      : { cls: 'dl', text: t('sr.willDownload', 'Downloads {mb} MB').replace('{mb}', info.downloadMB) };
  }

  function _select(id) {
    const a = SR.algorithm(id);
    if (!a) return;
    prefs.algo = id;
    _save();
    if (el['sr-algo-select']) el['sr-algo-select'].value = id;
    syncToolbar();
    el['sr-algo-desc'].textContent = t(`sr.desc.${id}`, '');
    _syncBadge();
    _renderParams();
    _syncOutput();
  }

  /** <optgroup> per engine, the same order as the list: for the toolbar and the popup heading. */
  function _algoOptions() {
    const groups = [{ title: t('sr.group.builtin', 'Built-in algorithms'), algos: SR.ALGORITHMS.filter((a) => a.kind === 'builtin') }]
      .concat(SR.ENGINES.map((e) => ({ title: `${t('sr.group.ai', 'AI models')} · ${e.label}`, algos: e.algos.map(SR.algorithm) })));
    return groups.map((g) => `<optgroup label="${_esc(g.title)}">${g.algos.map((a) => `<option value="${a.id}"${a.kind === 'ai' && !desktop() ? ' disabled' : ''}>${_esc(t(`sr.algo.${a.id}`, a.id))}</option>`).join('')}</optgroup>`).join('');
  }

  function _fillAlgoSelect(sel) {
    if (!sel) return;
    const lang = (window.I18n?.getLang?.() || '') + SR.ALGORITHMS.length;
    if (sel.dataset.lang !== lang) { sel.innerHTML = _algoOptions(); sel.dataset.lang = lang; }
    sel.value = prefs.algo;
  }

  /** Edit window toolbar: the model the 초고해상도 button opens with. */
  function syncToolbar() {
    _fillAlgoSelect(document.getElementById('ew-sr-algo'));
    _fillAlgoSelect(el['sr-algo-select']);
  }

  function _bindToolbar() {
    const sel = document.getElementById('ew-sr-algo');
    if (!sel || sel._srBound) return;
    sel._srBound = true;
    sel.addEventListener('change', () => {
      if (!SR.algorithm(sel.value)) return;
      prefs.algo = sel.value;
      _save();
      // The popup open: it follows
      if (document.getElementById('superres-overlay')?.classList.contains('visible')) _select(sel.value);
    });
    syncToolbar();
  }

  function _syncBadge() {
    const a = SR.algorithm(prefs.algo);
    if (!a || !el['sr-algo-badge']) return;
    const b = _badge(a);
    el['sr-algo-badge'].className = `sr-chip sr-chip-${b.cls}`;
    el['sr-algo-badge'].textContent = b.text;
  }

  function _valueLabel(key, v, spec) {
    if (key === 'noise') return t(`sr.noise.${v}`, String(v));
    if (key === 'gpu') return v === 'auto' ? t('sr.gpu.auto', 'Automatic') : v === 'cpu' ? t('sr.gpu.cpu', 'CPU') : `GPU ${v}`;
    if (key === 'device') return t(`sr.device.${v}`, v);
    if (key === 'precision' || key === 'seams') return t(`sr.${key}.${v}`, v);
    if (key === 'batch') return v === 0 ? t('sr.tile.auto', 'Automatic') : String(v);
    if (key === 'tile' && v === 0) return t('sr.tile.auto', 'Automatic');
    if (key === 'syncgap') return t(`sr.syncgap.${v}`, String(v));
    if (spec.fmt === 'x') return `×${v}`;
    if (spec.fmt === 'px') return `${v} px`;
    return String(v);
  }

  function _renderParams() {
    const id = prefs.algo;
    const a = SR.algorithm(id);
    const p = _paramsOf(id);
    const host = el['sr-params'];
    host.innerHTML = '';
    const order = [...a.params.filter((k) => k === 'scale' || k === 'outScale'), ...a.params.filter((k) => k !== 'scale' && k !== 'outScale')];
    for (const key of order) {
      const spec = SR.paramSpec(id, key, p);
      const row = document.createElement('label');
      row.className = 'dlg-row sr-param';
      row.dataset.param = key;
      // The scale row says how far this model goes
      const hint = (key === 'scale' || key === 'outScale')
        ? [t('sr.maxScale', 'Up to {n}x').replace('{n}', SR.maxScale(id)), t(`sr.param.${key}.hint`, '')].filter(Boolean).join(' · ')
        : t(`sr.param.${key}.hint`, '');
      row.innerHTML = `<span class="dlg-label">${_esc(t(`sr.param.${key}`, key))}${hint ? `<span class="sr-param-hint">${_esc(hint)}</span>` : ''}</span><span class="dlg-ctl"></span>`;
      const ctl = row.querySelector('.dlg-ctl');
      if (key === 'scale' || key === 'outScale') {
        // How much bigger: one button per scale the model can make
        const group = document.createElement('span');
        group.className = 'sr-scale-group';
        group.setAttribute('role', 'radiogroup');
        group.id = `sr-p-${key}`;
        for (const v of spec.values) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `sr-scale-btn${v === p[key] ? ' active' : ''}`;
          btn.dataset.value = String(v);
          btn.setAttribute('role', 'radio');
          btn.setAttribute('aria-checked', String(v === p[key]));
          btn.textContent = `${v}x`;
          btn.addEventListener('click', () => _setParam(key, v));
          group.appendChild(btn);
        }
        ctl.appendChild(group);
      } else if (spec.kind === 'select') {
        const sel = document.createElement('select');
        sel.className = 'resize-select';
        sel.id = `sr-p-${key}`;
        sel.innerHTML = spec.values.map((v) => `<option value="${_esc(v)}"${v === p[key] ? ' selected' : ''}>${_esc(_valueLabel(key, v, spec))}</option>`).join('');
        sel.addEventListener('change', () => _setParam(key, typeof spec.values[0] === 'number' ? Number(sel.value) : sel.value));
        ctl.appendChild(sel);
      } else if (spec.kind === 'range') {
        const r = document.createElement('input');
        r.type = 'range';
        r.id = `sr-p-${key}`;
        Object.assign(r, { min: spec.min, max: spec.max, step: spec.step });
        r.value = String(p[key]);
        const out = document.createElement('span');
        out.className = 'sr-range-val';
        const show = () => { out.textContent = `${r.value}${spec.unit ? ` ${spec.unit}` : ''}`; };
        show();
        r.addEventListener('input', () => { show(); _setParam(key, Number(r.value), false); });
        ctl.append(r, out);
      } else {
        const c = document.createElement('input');
        c.type = 'checkbox';
        c.className = 'settings-toggle';
        c.id = `sr-p-${key}`;
        c.checked = !!p[key];
        c.addEventListener('change', () => _setParam(key, c.checked));
        ctl.appendChild(c);
      }
      host.appendChild(row);
    }
  }

  function _setParam(key, value, rerender = true) {
    const id = prefs.algo;
    const next = { ..._paramsOf(id), [key]: value };
    prefs.params[id] = SR.normalize(id, next);
    _save();
    // A scale change can change which noise levels exist
    if (rerender && (key === 'scale' || key === 'outScale')) _renderParams();
    _syncOutput();
  }

  function _syncOutput() {
    const id = prefs.algo;
    const p = _paramsOf(id);
    const d = Editor.getDimensions?.() || { w: 0, h: 0 };
    const w = d.w || d.width || 0, h = d.h || d.height || 0;
    const o = SR.outputSize(w, h, id, p);
    if (el['sr-size']) el['sr-size'].textContent = w ? `${w} × ${h}  →  ${o.width} × ${o.height} px  (×${SR.targetScale(id, p)})` : '—';
    const problem = w ? SR.sizeProblem(w, h, id, p) : null;
    const a = SR.algorithm(id);
    let warn = '';
    if (problem) warn = t(problem === 'side' ? 'sr.tooLargeSide' : 'sr.tooLargePixels', 'The result would be too large').replace('{max}', problem === 'side' ? SR.MAX_SIDE : Math.round(SR.MAX_PIXELS / 1e6));
    else if (a.kind === 'ai' && !desktop()) warn = t('sr.desktopOnlyLong', 'AI models run in the desktop app only.');
    else if (a.kind === 'ai' && _engineInfo(a.engine) && !_engineInfo(a.engine).installed) warn = t('sr.autoInstall', '{engine} is downloaded and installed automatically first (about {mb} MB).').replace('{engine}', _engineInfo(a.engine).label).replace('{mb}', _engineInfo(a.engine).downloadMB);
    if (el['sr-warn']) { el['sr-warn'].textContent = warn; el['sr-warn'].classList.toggle('is-error', !!problem || (a.kind === 'ai' && !desktop())); }
    const f = SR.format(prefs.format);
    if (el['sr-quality-row']) el['sr-quality-row'].style.visibility = (f && f.lossy) ? '' : 'hidden';
    for (const k of ['sr-format', 'sr-quality', 'sr-name', 'sr-name-auto', 'sr-folder-pick']) if (el[k]) el[k].disabled = !prefs.save;
    if (el['sr-name'] && !nameEdited) el['sr-name'].value = _autoName();
    if (el['sr-name-ext']) el['sr-name-ext'].textContent = `.${(f || SR.format('jpg')).ext}`;
    if (el['sr-folder']) { el['sr-folder'].textContent = folder || t('sr.downloadsFolder', 'Downloads'); el['sr-folder'].title = folder; }
    if (el['sr-folder-pick']) el['sr-folder-pick'].hidden = !desktop();
    if (el['sr-ok']) el['sr-ok'].disabled = !!problem || (a.kind === 'ai' && !desktop());
  }

  async function _confirm() {
    if (el['sr-ok']?.disabled || busy) return;
    close();
    // Let the dialog window go first, so the progress popup opens in the page
    await new Promise((r) => setTimeout(r, 0));
    await run(prefs.algo, _paramsOf(prefs.algo), { save: prefs.save, format: prefs.format, quality: prefs.quality / 100, name: el['sr-name']?.value, folder });
  }

  /* ════════════ Run ════════════ */

  function _msg(code, label) {
    const [kind, a, b, c] = String(code || '').split('|');
    let s;
    if (kind === 'downloading') s = `${t('sr.p.downloading', 'Downloading the model…')}${a != null && b ? `  ${a} / ${b} MB` : ''}`;
    else if (kind === 'downloading_packages') s = `${t('sr.p.downloading_packages', 'Downloading {what}…').replace('{what}', c || 'PyTorch')}  ${a} / ${b} MB`;
    else if (kind === 'installing_packages') s = t('sr.p.installing_packages', 'Installing {what}…').replace('{what}', a || 'PyTorch');
    else if (kind === 'running') s = `${t('sr.p.running', 'Upscaling…')}${a ? `  ${a}%` : ''}${b ? `  ·  ${b}` : ''}`;
    else if (kind === 'device') s = `${t('sr.p.running', 'Upscaling…')}  ·  ${a}`;
    else s = t(`sr.p.${kind}`, t('sr.p.running', 'Upscaling…'));
    return label ? `${s} (${label})` : s;
  }

  function _clock(sec) {
    const v = Math.max(0, Math.round(sec));
    return v < 60 ? t('sr.sec', '{s} s').replace('{s}', v) : t('sr.min', '{m} min {s} s').replace('{m}', Math.floor(v / 60)).replace('{s}', v % 60);
  }

  /** "Elapsed 12 s · about 30 s left" (left once there is enough to go on). */
  function _timeText(elapsed, pct) {
    const head = t('sr.elapsed', 'Elapsed {t}').replace('{t}', _clock(elapsed));
    if (pct < 5 || pct >= 99 || elapsed < 1.5) return head;
    return `${head}  ·  ${t('sr.left', 'about {t} left').replace('{t}', _clock(elapsed * (100 - pct) / pct))}`;
  }

  async function _readOutput(outPath) {
    const bytes = await api().readFileBytes(outPath);
    api().superresDiscard?.(outPath);
    if (!bytes || bytes.error) throw new Error(bytes?.error || 'no result');
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    bmp.close?.();
    return g.getImageData(0, 0, c.width, c.height);
  }

  function _pngOf(img) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }

  /**
   * Upscale the picture in the editor with `algoId` and apply it (one undo step); then,
   * with out.save, save it as a new file in out.format. Answers true when applied.
   */
  async function run(algoId, params, out = {}) {
    const a = SR.algorithm(algoId);
    if (!a || busy || !Editor.isLoaded()) return false;
    const p = SR.normalize(algoId, params);
    const src = Editor.exportImageData();
    if (!src) return false;
    const problem = SR.sizeProblem(src.width, src.height, algoId, p);
    if (problem) { await ctx.showError(t('sr.failed', 'Super-resolution failed'), t(problem === 'side' ? 'sr.tooLargeSide' : 'sr.tooLargePixels').replace('{max}', problem === 'side' ? SR.MAX_SIDE : Math.round(SR.MAX_PIXELS / 1e6))); return false; }
    if (a.kind === 'ai' && !desktop()) { await ctx.showError(t('sr.failed'), t('sr.desktopOnlyLong')); return false; }
    const label = t(`sr.algo.${algoId}`, algoId);
    const o = SR.outputSize(src.width, src.height, algoId, p);
    const signal = { cancelled: false };
    const dlg = ctx.progress;
    busy = true;
    dlg.show({
      // The size in the title row; the line under the bar shows elapsed / time left
      title: `${t('sr.title', 'Super-resolution')}  ${src.width}×${src.height} → ${o.width}×${o.height}`,
      message: _msg('preparing', label),
      percent: 1,
      modal: true,
      onCancel: () => { signal.cancelled = true; api().superresCancel?.(); },
    });
    let unsub = null;
    let retry = false;
    const started = performance.now();
    let lastPct = 1;
    const prog = (pct, msg) => { lastPct = Math.max(lastPct, pct); dlg.set(pct, msg); };
    const tick = () => dlg.setDetail?.(_timeText((performance.now() - started) / 1000, lastPct));
    tick();
    const ticker = setInterval(tick, 500);
    try {
      await dlg.yieldFrame();
      let result;
      if (a.kind === 'builtin') {
        result = await SR.runInWorker(src, { algo: algoId, params: p }, (f) => prog(2 + f * 90, _msg(`running|${Math.round(f * 100)}`, label)), signal);
      } else {
        unsub = api().onSuperresProgress?.(({ percent, message }) => prog(Math.min(85, percent * 0.85), _msg(message, label)));
        const r = await api().superresRun({ dataUrl: _pngOf(src), algo: algoId, params: p });
        if (typeof unsub === 'function') { unsub(); unsub = null; }
        if (signal.cancelled || r?.code === 'CANCELLED') throw Object.assign(new Error('cancelled'), { code: 'CANCELLED' });
        if (!r || r.error) {
          dlg.hide();
          retry = await _reportEngineError(r || { error: 'no answer' }, a);
          return false;
        }
        prog(86, _msg('reading', label));
        const raw = await _readOutput(r.outPath);
        // ×4 models made bigger than asked, or a post-sharpen: the finishing pass
        result = (raw.width !== o.width || raw.height !== o.height || p.sharpen > 0)
          ? await SR.runInWorker(raw, { finishOnly: true, outW: o.width, outH: o.height, params: p }, (f) => prog(87 + f * 6, _msg('finishing', label)), signal)
          : raw;
      }
      if (signal.cancelled) throw Object.assign(new Error('cancelled'), { code: 'CANCELLED' });
      prog(95, _msg('applying', label));
      await dlg.yieldFrame();
      Editor.applyImageData(result);
      ctx.afterApply?.();
      dlg.hide();
      const secs = ((performance.now() - started) / 1000).toFixed(1);
      ctx.status?.(t('sr.done', 'Super-resolution: {w} × {h} px ({s} s)').replace('{w}', result.width).replace('{h}', result.height).replace('{s}', secs));
      busy = false;
      if (out.save) await _saveResult(algoId, p, out);
      return true;
    } catch (err) {
      dlg.hide();
      if (err && err.code === 'CANCELLED') { ctx.status?.(t('sr.cancelled', 'Super-resolution stopped.')); return false; }
      await ctx.showError(t('sr.failed', 'Super-resolution failed'), (err && err.message) || String(err));
      return false;
    } finally {
      clearInterval(ticker);
      dlg.setDetail?.('');
      if (typeof unsub === 'function') unsub();
      dlg.stopCreep?.();
      busy = false;
      refreshStatus().then(() => renderSettings());
      if (retry) setTimeout(() => run(algoId, params, out), 0);
    }
  }

  /** The engine's failure as a message; true when the user asked to download again. */
  async function _reportEngineError(r, a) {
    if (r.code === 'DOWNLOAD_FAILED' || r.code === 'ENV_FAILED') {
      const ans = await ctx.messageBox({
        type: 'error',
        icon: 'warning',
        title: t(r.code === 'ENV_FAILED' ? 'sr.envFailed' : 'sr.downloadFailed', 'Could not download the model'),
        message: t(r.code === 'ENV_FAILED' ? 'sr.envFailed' : 'sr.downloadFailed', 'Could not download the model'),
        detail: `${r.error}\n\n${t('sr.downloadHint', 'Check the internet connection. Retry downloads it again from the start.')}`,
        buttons: [t('bgAlgo.retryDownload', 'Retry'), t('bgAlgo.close', 'Close')],
        defaultId: 0,
        cancelId: 1,
      });
      return !!(ans && ans.response === 0);
    }
    if (r.code === 'BUSY') { await ctx.showError(t('sr.failed'), t('sr.busy', 'Another super-resolution job is running.')); return false; }
    const hint = r.code === 'GPU'
      ? `\n\n${t(a.engine === 'realesrgan' ? 'sr.gpuHintEsrgan' : 'sr.gpuHint', 'No usable Vulkan GPU.')}`
      : r.code === 'NO_GPU' ? `\n\n${t('sr.noGpuHint', 'Set Device to Automatic or CPU.')}` : '';
    await ctx.showError(t('sr.failed', 'Super-resolution failed'), `${r.error}${hint}`);
    return false;
  }

  function _stem() {
    const file = ctx?.currentFile?.() || '';
    const name = file ? file.split(/[/\\]/).pop() : 'image';
    return name.replace(/\.[^.]+$/, '') || 'image';
  }

  /** <original>_SR_<algorithm>_x<scale>, e.g. photo_SR_esrgan-x4plus_x4 (the extension follows the format). */
  function _autoName(algoId = prefs.algo, params = _paramsOf(prefs.algo)) {
    return `${_stem()}_SR_${algoId}_x${SR.targetScale(algoId, params)}`;
  }

  /** A name the file system takes: no path, no reserved characters, no extension typed twice. */
  function cleanName(name, ext) {
    let n = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().replace(/[. ]+$/, '');
    const e = String(ext || '').toLowerCase();
    if (e && n.toLowerCase().endsWith(`.${e}`)) n = n.slice(0, -(e.length + 1));
    return n;
  }

  async function _sourceDir() {
    const file = ctx?.currentFile?.() || '';
    if (!file || !desktop() || !api().pathDirname) return '';
    try { return await api().pathDirname(file); } catch { return ''; }
  }

  /** Save into the shown folder under the shown name; an existing file gets " (2)", " (3)" … */
  async function _saveResult(algoId, p, out) {
    const fmt = SR.format(out.format) || SR.format('jpg');
    const stem = cleanName(out.name, fmt.ext) || _autoName(algoId, p);
    if (!desktop()) return ctx.writeImage({ filePath: `${stem}.${fmt.ext}`, ext: fmt.ext, quality: out.quality });
    const dir = out.folder || await _sourceDir() || await api().getHomeDir?.();
    let filePath = '';
    for (let n = 1; n < 1000 && !filePath; n++) {
      const candidate = await api().pathJoin(dir, n === 1 ? `${stem}.${fmt.ext}` : `${stem} (${n}).${fmt.ext}`);
      const st = await api().getFileStats(candidate).catch(() => null);
      if (!st || st.error) filePath = candidate;
    }
    return ctx.writeImage({ filePath, ext: fmt.ext, quality: out.quality });
  }

  /* ════════════ Settings › Super-resolution ════════════ */

  async function refreshStatus() {
    if (!desktop() || typeof api().superresStatus !== 'function') { engineStatus = null; return null; }
    try { engineStatus = await api().superresStatus(); } catch { engineStatus = null; }
    return engineStatus;
  }

  function _mb(bytes) { return `${(bytes / 1048576).toFixed(bytes >= 1048576 * 10 ? 0 : 1)} MB`; }

  /** Fill #settings-sr-engines (the Settings tab) from the last status. */
  function _envText(env) {
    const v = String(env?.variant || '');
    const build = v.startsWith('cu') ? t('sr.env.cuda', 'CUDA {v} build (NVIDIA GPU)').replace('{v}', `${v.slice(2, -1)}.${v.slice(-1)}`)
      : v === 'default' ? t('sr.env.mps', 'Standard build (Apple GPU)') : t('sr.env.cpu', 'CPU build');
    if (!env?.installed) return t('sr.env.missing', 'Not installed · for this PC: {build} · about {mb} MB').replace('{build}', build).replace('{mb}', env?.downloadMB ?? '?');
    const dev = env.device && env.device !== 'cpu' ? `GPU: ${env.deviceName}` : `CPU: ${env.deviceName || ''}`;
    return `${dev} · ${build} · ${_mb(env.diskBytes || 0)}`;
  }

  const _icon = (name) => (window.Icons && window.Icons[name]) || '';

  function _engineRow({ key, label, version, installed, models, state, title }) {
    return `<div class="sr-engine-row" data-engine="${key}">
        <span class="sr-engine-name">${_esc(label)} <span class="sr-engine-ver">${_esc(version || '')}</span></span>
        <span class="sr-chip sr-chip-${installed ? 'ok' : 'dl'}">${_esc(installed ? t('sr.installed', 'Installed') : t('sr.notInstalled', 'Not installed'))}</span>
        <span class="sr-engine-state" title="${_esc(title || '')}">${_esc(models ? `${models} — ${state}` : state)}</span>
        <button type="button" class="settings-btn" data-sr-act="install" data-engine="${key}"><span class="btn-ico">${_icon(installed ? 'reset' : 'download')}</span><span>${_esc(installed ? t('sr.reinstall', 'Reinstall') : t('sr.download', 'Download'))}</span></button>
        <button type="button" class="settings-btn" data-sr-act="remove" data-engine="${key}"${installed ? '' : ' disabled'}><span class="btn-ico">${_icon('delete')}</span><span>${_esc(t('sr.remove', 'Remove'))}</span></button>
      </div>`;
  }

  /** Fill #settings-sr-engines (the Settings tab) from the last status. */
  function renderSettings() {
    const host = document.getElementById('settings-sr-engines');
    if (!host) return;
    if (!desktop()) {
      host.innerHTML = `<div class="settings-hint">${_esc(t('sr.desktopOnlyLong', 'AI models run in the desktop app only.'))}</div>`;
      return;
    }
    const st = engineStatus;
    const rows = [];
    for (const e of SR.ENGINES) {
      if (e.py && e.key === 'swinir') {
        const env = st?.env;
        rows.push(`<div class="sr-engine-group">${_esc(t('sr.group.python', 'PyTorch models'))}</div>`);
        rows.push(_engineRow({ key: 'pytorch', label: t('sr.env.title', 'PyTorch environment'), version: env?.torch ? `torch ${env.torch}` : '', installed: !!env?.installed,
          state: _envText(env), title: env?.path || '' }));
      }
      const info = st?.engines?.find((x) => x.key === e.key);
      const models = e.algos.map((id) => t(`sr.algo.${id}`, id).replace(`${e.label} `, '')).join(' · ');
      let state = '…';
      if (info && info.installed) state = t('sr.state.installed', 'Installed · {size}').replace('{size}', _mb(info.diskBytes));
      else if (info && e.py && info.modelsInstalled) state = t('sr.state.partial', '{n} / {all} models · download about {mb} MB').replace('{n}', info.modelsInstalled).replace('{all}', info.models).replace('{mb}', info.downloadMB);
      else if (info) state = t('sr.state.missing', 'Not installed · download about {mb} MB').replace('{mb}', info.downloadMB);
      rows.push(_engineRow({ key: e.key, label: e.label, version: info?.version, installed: !!info?.installed, models, state, title: info?.path || '' }));
    }
    host.innerHTML = rows.join('') + (st?.root ? `<div class="settings-hint sr-root">${_esc(t('sr.folder', 'Folder'))}: ${_esc(st.root)}</div>` : '');
    host.querySelectorAll('[data-sr-act]').forEach((b) => b.addEventListener('click', () => {
      const key = b.dataset.engine;
      const installed = key === 'pytorch' ? !!engineStatus?.env?.installed : !!_engineInfo(key)?.installed;
      if (b.dataset.srAct === 'install') install(key, { force: installed });
      else uninstall(key);
    }));
  }

  /** Download (again, with force) one engine with the progress popup. */
  async function install(key, { force = false, reopen = false } = {}) {
    if (busy || !desktop()) return false;
    const e = key === 'pytorch' ? { key, label: t('sr.env.title', 'PyTorch environment') } : SR.ENGINES.find((x) => x.key === key);
    if (!e) return false;
    busy = true;
    // Started from Settings: on the desktop Settings is a window of its own and would cover the
    // progress popup, so it steps aside for the download and comes back on this tab after.
    const fromSettings = reopen || !!ctx.settingsOpen?.();
    if (fromSettings && ctx.settingsOpen?.()) {
      ctx.hideDialog('settings-overlay');
      await new Promise((r) => setTimeout(r, 120));
    }
    const dlg = ctx.progress;
    dlg.show({
      title: t(force ? 'sr.reinstallTitle' : 'sr.installTitle', 'Install model'),
      message: _msg('downloading', e.label),
      percent: 0,
      modal: true,
      onCancel: () => api().superresCancel?.(),
    });
    const unsub = api().onSuperresProgress?.(({ percent, message }) => dlg.set(percent, _msg(message, e.label)));
    let retry = false;
    try {
      const r = await api().superresInstall({ engine: key, force });
      if (typeof unsub === 'function') unsub();
      dlg.hide();
      if (r?.code === 'CANCELLED') { ctx.status?.(t('sr.installCancelled', 'Download stopped.')); return false; }
      if (!r || r.error) {
        retry = await _reportEngineError(r || { error: 'no answer' }, { engine: key });
        return false;
      }
      ctx.status?.(t('sr.installDone', '{engine} is installed.').replace('{engine}', e.label));
      return true;
    } catch (err) {
      dlg.hide();
      await ctx.showError(t('sr.downloadFailed'), (err && err.message) || String(err));
      return false;
    } finally {
      if (typeof unsub === 'function') unsub();
      busy = false;
      await refreshStatus();
      renderSettings();
      if (retry) setTimeout(() => install(key, { force, reopen: fromSettings }), 0);
      else if (fromSettings) ctx.openSettings?.('superres');
    }
  }

  async function uninstall(key) {
    if (busy || !desktop()) return false;
    const e = key === 'pytorch' ? { key, label: t('sr.env.title', 'PyTorch environment') } : SR.ENGINES.find((x) => x.key === key);
    const ans = await ctx.messageBox({
      type: 'question',
      icon: 'delete',
      title: t('sr.remove', 'Remove'),
      message: t('sr.removeAsk', 'Remove {engine}? It is downloaded again when needed.').replace('{engine}', e?.label || key),
      buttons: [t('sr.remove', 'Remove'), t('dialog.unsaved.cancel', 'Cancel')],
      defaultId: 1,
      cancelId: 1,
    });
    if (!ans || ans.response !== 0) return false;
    const r = await api().superresUninstall({ engine: key });
    if (r?.error) await ctx.showError(t('sr.failed'), r.error);
    await refreshStatus();
    renderSettings();
    return !r?.error;
  }

  /** Back to the first-run choices (algorithm, every algorithm's values, format, quality). */
  function resetAll() {
    prefs = _defaults();
    _save();
    _syncSettingsDefaults();
    syncToolbar();
  }

  /** Settings › Super-resolution: the defaults the dialog opens with. */
  function _syncSettingsDefaults() {
    const algo = document.getElementById('settings-sr-algo');
    if (!algo) return;
    algo.innerHTML = SR.ALGORITHMS.map((a) => `<option value="${a.id}"${a.id === prefs.algo ? ' selected' : ''}${a.kind === 'ai' && !desktop() ? ' disabled' : ''}>${_esc(t(`sr.algo.${a.id}`, a.id))}</option>`).join('');
    const fmt = document.getElementById('settings-sr-format');
    fmt.innerHTML = SR.FORMATS.map((x) => `<option value="${x.ext}"${x.ext === prefs.format ? ' selected' : ''}>${x.label}</option>`).join('');
    const q = document.getElementById('settings-sr-quality');
    q.value = String(prefs.quality);
    document.getElementById('settings-sr-quality-val').textContent = String(prefs.quality);
    document.getElementById('settings-sr-save').checked = prefs.save !== false;
    if (algo._srBound) return;
    algo._srBound = true;
    algo.addEventListener('change', () => { prefs.algo = algo.value; _save(); syncToolbar(); });
    fmt.addEventListener('change', () => { prefs.format = fmt.value; _save(); });
    q.addEventListener('input', () => { prefs.quality = +q.value; document.getElementById('settings-sr-quality-val').textContent = q.value; _save(); });
    document.getElementById('settings-sr-save').addEventListener('change', (e) => { prefs.save = e.target.checked; _save(); });
    document.getElementById('settings-sr-reset')?.addEventListener('click', () => { resetAll(); ctx.status?.(t('sr.resetDone', 'Super-resolution settings are back to their defaults.')); });
  }

  /** Settings tab opened: ask the host, then draw. */
  async function syncSettings() {
    _syncSettingsDefaults();
    renderSettings();
    await refreshStatus();
    renderSettings();
  }

  return { init, open, close, run, install, uninstall, refreshStatus, renderSettings, syncSettings, resetAll, cleanName, syncToolbar, isBusy: () => busy, _prefs: () => prefs };
})();
