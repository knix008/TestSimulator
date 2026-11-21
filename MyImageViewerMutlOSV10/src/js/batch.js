/* Batch processing: many pictures at once — shrink by a percent or a longest side, convert the format,
 * lay a watermark text over them — written as new files (an existing file is never
 * replaced: a number is added to the name). The photo information is carried over the
 * same way a single save does (app.js withPhotoInfo).
 *
 * app.js calls init(ctx) once and open({ selected, folder }) from the File menu or the
 * thumbnail sheet's right-click menu.
 */
window.Batch = (() => {
  let ctx = null;   // { t, runWithProgress, withPhotoInfo, folderImages, status, showDialog, refreshTree, drawWatermark }
  const el = {};
  let selected = [];
  let folder = '';
  let folderFiles = [];

  const t = (k, fb) => {
    const s = ctx?.t ? ctx.t(k) : k;
    return s && s !== k ? s : (fb ?? k);
  };

  function _nudge(id, dir) {
    const input = el[id];
    if (!input || input.disabled) return;
    const min = Number(input.min), max = Number(input.max);
    const cur = Number(input.value);
    const next = Math.max(min, Math.min(max, Math.round((Number.isFinite(cur) ? cur : min) + dir)));
    input.value = String(next);
    _syncEnds(id);
  }

  function _syncEnds(id) {
    const input = el[id];
    const down = el[id + '-down'];
    const up = el[id + '-up'];
    if (!input || !down || !up) return;
    const v = Number(input.value);
    const known = Number.isFinite(v);
    down.disabled = input.disabled || (known && v <= Number(input.min));
    up.disabled = input.disabled || (known && v >= Number(input.max));
  }

  function init(appCtx) {
    ctx = appCtx;
    for (const id of ['batch-overlay', 'batch-count-selected', 'batch-count-folder', 'batch-resize', 'batch-resize-mode', 'batch-longest-step', 'batch-longest', 'batch-longest-down', 'batch-longest-up', 'batch-percent-step', 'batch-percent', 'batch-percent-down', 'batch-percent-up', 'batch-resize-unit', 'batch-format',
      'batch-quality', 'batch-quality-val', 'batch-wm', 'batch-wm-text', 'batch-dir', 'batch-browse', 'batch-suffix',
      'batch-subdir', 'batch-subdir-name', 'batch-subdir-row', 'batch-subdir-hint', 'batch-title',
      'batch-cancel', 'batch-ok', 'batch-close']) {
      el[id] = document.getElementById(id);
    }
    if (!el['batch-overlay'] || el['batch-overlay']._bound) return;
    el['batch-overlay']._bound = true;
    el['batch-quality'].addEventListener('input', () => { el['batch-quality-val'].textContent = el['batch-quality'].value; });
    const sync = () => {
      const on = el['batch-resize'].checked;
      const percent = el['batch-resize-mode'].value === 'percent';
      el['batch-resize-mode'].disabled = !on;
      _syncSubdir();
      el['batch-longest-step'].hidden = percent;
      el['batch-percent-step'].hidden = !percent;
      el['batch-longest'].disabled = !on;
      el['batch-percent'].disabled = !on;
      _syncEnds('batch-longest');
      _syncEnds('batch-percent');
      el['batch-wm-text'].disabled = !el['batch-wm'].checked;
      const f = el['batch-format'].value;
      el['batch-quality'].disabled = !(f === 'jpg' || f === 'webp' || f === 'keep');
    };
    for (const id of ['batch-resize', 'batch-resize-mode', 'batch-wm', 'batch-format', 'batch-subdir']) el[id].addEventListener('change', sync);
    // The subfolder only matters with more than one picture: follow the Pictures choice
    el['batch-overlay'].querySelectorAll('input[name="batch-target"]').forEach((r) => r.addEventListener('change', _syncSubdir));
    el['batch-percent'].addEventListener('input', () => _syncEnds('batch-percent'));
    el['batch-longest'].addEventListener('input', () => _syncEnds('batch-longest'));
    el['batch-percent-down'].addEventListener('click', () => _nudge('batch-percent', -1));
    el['batch-percent-up'].addEventListener('click', () => _nudge('batch-percent', 1));
    el['batch-longest-down'].addEventListener('click', () => _nudge('batch-longest', -1));
    el['batch-longest-up'].addEventListener('click', () => _nudge('batch-longest', 1));
    sync();
    el['batch-browse'].addEventListener('click', async () => {
      const r = await window.electronAPI.pickDirectory?.({ defaultPath: el['batch-dir'].value || folder });
      if (r && !r.canceled && r.filePath) el['batch-dir'].value = r.filePath;
    });
    const close = () => { el['batch-overlay'].style.display = 'none'; el['batch-overlay'].classList.remove('visible'); };
    el['batch-cancel'].addEventListener('click', close);
    el['batch-close'].addEventListener('click', close);
    el['batch-ok'].addEventListener('click', async () => {
      const opts = _options();
      if (!opts.files.length) return;
      _remember(opts);
      close();
      await run(opts);
    });
  }

  let mode = 'batch';   // 'batch' (File ▸ Batch processing) | 'resize' (several pictures ▸ Resize)

  function _targetFiles() {
    if (mode === 'resize') return selected;
    const target = el['batch-overlay'].querySelector('input[name="batch-target"]:checked')?.value || 'folder';
    return target === 'selected' ? selected : folderFiles;
  }

  // One picture is written next to the others; several get their own folder (when asked)
  function _syncSubdir() {
    const many = _targetFiles().length > 1;
    el['batch-subdir-row'].classList.toggle('is-off', !many);
    el['batch-subdir'].disabled = !many;
    el['batch-subdir-name'].disabled = !many || !el['batch-subdir'].checked;
  }

  // Resize mode keeps only the size and where to save; the title says what it does
  function _applyMode() {
    const resize = mode === 'resize';
    el['batch-overlay'].classList.toggle('batch-resize-mode', resize);
    el['batch-overlay'].querySelectorAll('.batch-convert-only').forEach((n) => { n.hidden = resize; });
    el['batch-overlay'].querySelectorAll('.batch-resize-only').forEach((n) => { n.hidden = !resize; });
    const key = resize ? 'batch.resizeTitle' : 'batch.title';
    el['batch-title'].dataset.i18n = key;
    el['batch-title'].textContent = resize ? `${t(key, 'Resize')} (${selected.length})` : t(key);
    const lbl = el['batch-resize'].parentElement?.querySelector('[data-i18n]');
    if (lbl) { lbl.dataset.i18n = resize ? 'batch.resizeTo' : 'batch.resize'; lbl.textContent = t(lbl.dataset.i18n); }
    el['batch-resize'].disabled = resize;
    // Resize may enlarge; batch processing only reduces
    el['batch-percent'].max = resize ? '1000' : '100';
    el['batch-longest'].max = '20000';
  }

  /**
   * The dialog for the selected thumbnails (or, without a selection, the whole folder).
   * `resize: true` opens it as "Resize" for the given pictures only (size + where to save).
   */
  async function open({ selected: sel = [], folder: dir = '', resize = false } = {}) {
    mode = resize ? 'resize' : 'batch';
    selected = sel.filter((p) => window.FormatSupport?.isImage?.(p) && !FormatSupport.isVideo?.(p) && !FormatSupport.isAudio?.(p));
    folder = dir || (selected[0] ? await window.electronAPI.pathDirname(selected[0]) : '');
    folderFiles = (folder && !resize) ? await ctx.folderImages(folder) : [];
    el['batch-count-selected'].textContent = String(selected.length);
    el['batch-count-folder'].textContent = String(folderFiles.length);
    const target = el['batch-overlay'].querySelector(`input[name="batch-target"][value="${selected.length > 1 ? 'selected' : 'folder'}"]`);
    if (target) target.checked = true;
    el['batch-overlay'].querySelector('input[name="batch-target"][value="selected"]').disabled = !selected.length;
    const saved = _recall();
    const r = resize ? (saved.resizeOnly || {}) : saved;
    el['batch-resize'].checked = resize ? true : (saved.resize ?? true);
    // Batch defaults to the longest side, Resize to a percent
    if (resize) el['batch-resize-mode'].value = r.resizeMode === 'longest' ? 'longest' : 'percent';
    else el['batch-resize-mode'].value = r.resizeMode === 'percent' ? 'percent' : 'longest';
    el['batch-longest'].value = r.longest || 1920;
    el['batch-percent'].value = r.percent || 50;
    el['batch-format'].value = resize ? 'keep' : (saved.format || 'jpg');
    // Resize keeps its own quality (it writes the original format, so JPEG / WebP use it)
    el['batch-quality'].value = (resize ? r.quality : saved.quality) || 90;
    el['batch-quality-val'].textContent = el['batch-quality'].value;
    el['batch-wm'].checked = resize ? false : !!saved.wm;
    el['batch-wm-text'].value = saved.wmText || '© ';
    const word = resize ? t('batch.resizeSuffixDefault', 'resized') : t('batch.suffixDefault', 'converted');
    el['batch-suffix'].value = (resize ? r.suffix : saved.suffix) ?? `_${word}`;
    // On unless the user turned it off
    el['batch-subdir'].checked = saved.subdir !== false;
    el['batch-subdir-name'].value = word;
    el['batch-dir'].value = folder;
    _applyMode();
    for (const id of ['batch-resize', 'batch-wm', 'batch-format']) el[id].dispatchEvent(new Event('change'));
    _syncSubdir();
    ctx.showDialog('batch-overlay');
  }

  function _options() {
    const resize = mode === 'resize';
    const files = _targetFiles();
    const subName = String(el['batch-subdir-name'].value || '').trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/^\.+$/, '');
    return {
      mode,
      files,
      resize: resize || el['batch-resize'].checked,
      resizeMode: el['batch-resize-mode'].value === 'percent' ? 'percent' : 'longest',
      longest: Math.max(16, Math.round(+el['batch-longest'].value || 1920)),
      percent: Math.max(1, Math.min(resize ? 1000 : 100, Math.round(+el['batch-percent'].value || 50))),
      enlarge: resize,
      subdir: el['batch-subdir'].checked,
      subdirName: files.length > 1 && el['batch-subdir'].checked ? subName : '',
      format: el['batch-format'].value,
      quality: Math.max(40, Math.min(100, +el['batch-quality'].value || 90)) / 100,
      wm: el['batch-wm'].checked && !!el['batch-wm-text'].value.trim(),
      wmText: el['batch-wm-text'].value.trim(),
      dir: el['batch-dir'].value.trim() || folder,
      suffix: el['batch-suffix'].value,
    };
  }

  function _recall() {
    try { return JSON.parse(localStorage.getItem('batchV1') || '{}') || {}; } catch { return {}; }
  }

  function _remember(o) {
    try {
      const prev = _recall();
      const next = o.mode === 'resize'
        ? { ...prev, subdir: o.subdir, resizeOnly: { resizeMode: o.resizeMode, longest: o.longest, percent: o.percent, suffix: o.suffix, quality: Math.round(o.quality * 100) } }
        : {
          ...prev, resize: o.resize, resizeMode: o.resizeMode, longest: o.longest, percent: o.percent, format: o.format,
          quality: Math.round(o.quality * 100), wm: o.wm, wmText: o.wmText, suffix: o.suffix, subdir: o.subdir,
        };
      localStorage.setItem('batchV1', JSON.stringify(next));
    } catch { /* no storage */ }
  }

  const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

  // Output format: the chosen one, or the source's own when it can be written (else JPEG)
  function _formatFor(path, choice) {
    if (choice !== 'keep') return choice;
    const ext = (FormatSupport.getExtension(path) || '').toLowerCase();
    if (ext === 'jpeg' || ext === 'jpg') return 'jpg';
    return MIME[ext] ? ext : 'jpg';
  }

  /** Any supported picture (incl. HEIC, TIFF, DICOM) as a canvas, or null. */
  async function _decode(path) {
    const r = await FormatSupport.loadImageFile(path);
    if (!r || r.type === 'error' || r.type === 'video' || r.type === 'audio') return null;
    try {
      let src = r.canvas || null;
      if (!src && r.dicom) src = (await r.dicom.toCanvas({})).canvas;
      if (!src && r.dataUrl) {
        const img = new Image();
        img.src = r.dataUrl;
        await img.decode();
        src = img;
      }
      if (!src) return null;
      const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(src, 0, 0);
      return c;
    } finally {
      try { r.dicom?.release?.(); } catch { /* ignore */ }
    }
  }

  // Scale by k (0 < k < 1), stepping down by halves for quality
  function _resample(canvas, k) {
    let cur = canvas;
    const tw = Math.max(1, Math.round(canvas.width * k)), th = Math.max(1, Math.round(canvas.height * k));
    while (cur.width / 2 > tw) {
      const half = document.createElement('canvas');
      half.width = Math.round(cur.width / 2); half.height = Math.round(cur.height / 2);
      const hc = half.getContext('2d');
      hc.imageSmoothingQuality = 'high';
      hc.drawImage(cur, 0, 0, half.width, half.height);
      cur = half;
    }
    const out = document.createElement('canvas');
    out.width = tw; out.height = th;
    const oc = out.getContext('2d');
    oc.imageSmoothingQuality = 'high';
    oc.drawImage(cur, 0, 0, tw, th);
    return out;
  }

  // Longest side at most `longest` (enlarged only with `enlarge`, i.e. Resize)
  function _fit(canvas, longest, enlarge = false) {
    const k = longest / Math.max(canvas.width, canvas.height);
    if (k === 1 || (k > 1 && !enlarge)) return canvas;
    return _resample(canvas, k);
  }

  // Each side becomes `percent` percent of the original (above 100 only with `enlarge`)
  function _byPercent(canvas, percent, enlarge = false) {
    const k = Math.min(enlarge ? 1000 : 100, Math.max(1, Math.round(+percent) || 100)) / 100;
    if (k === 1 || (k > 1 && !enlarge)) return canvas;
    return _resample(canvas, k);
  }

  function _encode(canvas, format, quality) {
    const mime = MIME[format] || 'image/png';
    if (mime !== 'image/jpeg') return canvas.toDataURL(mime, quality);
    const flat = document.createElement('canvas');
    flat.width = canvas.width; flat.height = canvas.height;
    const fc = flat.getContext('2d');
    fc.fillStyle = '#ffffff';
    fc.fillRect(0, 0, flat.width, flat.height);
    fc.drawImage(canvas, 0, 0);
    return flat.toDataURL(mime, quality);
  }

  async function _freeName(dir, stem, ext) {
    for (let n = 1; n < 1000; n++) {
      const name = n === 1 ? `${stem}.${ext}` : `${stem} (${n}).${ext}`;
      const p = await window.electronAPI.pathJoin(dir, name);
      const st = await window.electronAPI.getFileStats(p).catch(() => null);
      if (!st || st.error) return p;
    }
    return window.electronAPI.pathJoin(dir, `${stem} (${Date.now()}).${ext}`);
  }

  /** 75 → "1분 15초" / "1:15"-style text from the i18n patterns. */
  function _duration(sec) {
    const s = Math.max(1, Math.round(sec));
    if (s < 60) return t('batch.timeSec', '{s} s').replace('{s}', s);
    if (s < 3600) {
      return t('batch.timeMin', '{m} min {s} s').replace('{m}', Math.floor(s / 60)).replace('{s}', String(s % 60).padStart(2, '0'));
    }
    return t('batch.timeHour', '{h} h {m} min').replace('{h}', Math.floor(s / 3600)).replace('{m}', String(Math.floor(s % 3600 / 60)).padStart(2, '0'));
  }

  /** Process every file; one progress popup (true percent, time left, Stop), a summary at the end. */
  async function run(o) {
    const done = [], failed = [];
    const total = o.files.length;
    // Several pictures: into <folder>/<subfolder> (made here; an existing one is reused)
    if (o.subdirName && total > 1) {
      const sub = await window.electronAPI.pathJoin(o.dir, o.subdirName);
      const made = await window.electronAPI.makeDir?.(sub).catch((e) => ({ error: e?.message || String(e) }));
      if (made && made.error) {
        ctx.status?.(`${t('batch.subdirError', 'Could not make the folder')}: ${sub}`);
        await ctx.report?.([], o.files.map((p) => p.split(/[/\\]/).pop()), sub, 0);
        return { done, failed: o.files.slice(), skipped: 0 };
      }
      o = { ...o, dir: sub };
    }
    let stop = false;
    const started = performance.now();
    await ctx.runWithProgress(async (dlg) => {
      // Each file's share of the bar is split over its steps, so a big picture still moves it
      const step = (i, frac, name) => {
        dlg?.set((i + frac) / total * 100, `${i + 1} / ${total}  ·  ${name}`);
      };
      const showEta = (finished) => {
        if (!dlg?.setDetail) return;
        const elapsed = (performance.now() - started) / 1000;
        if (finished < 1 || elapsed < 1.5) { dlg.setDetail(t('batch.estimating', 'Estimating time left…')); return; }
        const left = elapsed / finished * (total - finished);
        dlg.setDetail(`${t('batch.elapsed', 'Elapsed')} ${_duration(elapsed)}  ·  ${t('batch.left', 'About {time} left').replace('{time}', _duration(left))}`);
      };
      for (let i = 0; i < total; i++) {
        if (stop) break;
        const src = o.files[i];
        const name = src.split(/[/\\]/).pop();
        step(i, 0, name);
        showEta(i);
        // Let the popup paint before the decode takes the page
        // (a frame, or a short timer when the window is minimised and frames stop)
        await Promise.race([
          dlg?.yieldFrame ? dlg.yieldFrame() : Promise.resolve(),
          new Promise((r) => setTimeout(r, 40)),
        ]);
        try {
          let c = await _decode(src);
          if (!c) { failed.push(name); continue; }
          step(i, 0.45, name);
          if (o.resize) c = o.resizeMode === 'percent' ? _byPercent(c, o.percent, o.enlarge) : _fit(c, o.longest, o.enlarge);
          if (o.wm) {
            const saved = (() => { try { return JSON.parse(localStorage.getItem('watermarkV1') || '{}') || {}; } catch { return {}; } })();
            ctx.drawWatermark(c.getContext('2d'), c.width, c.height, {
              font: saved.font || 'Segoe UI', color: saved.color || '#ffffff', size: saved.size || 6,
              opacity: saved.opacity ?? 0.45, angle: saved.angle || 0, tile: !!saved.tile, shadow: saved.shadow !== false,
              anchor: saved.anchor && Number.isFinite(saved.anchor.x) ? saved.anchor : { x: 1, y: 1 }, text: o.wmText,
            });
          }
          step(i, 0.6, name);
          const fmt = _formatFor(src, o.format);
          let dataUrl = _encode(c, fmt, o.quality);
          step(i, 0.85, name);
          dataUrl = await ctx.withPhotoInfo(dataUrl, { w: c.width, h: c.height }, src);
          const stem = name.replace(/\.[^.]+$/, '') + (o.suffix || '');
          const out = await _freeName(o.dir, stem, fmt);
          const wr = await window.electronAPI.writeFile({ filePath: out, dataUrl });
          if (wr && wr.success) done.push(out); else failed.push(name);
        } catch (err) {
          console.error('batch', src, err);
          failed.push(name);
        }
        step(i, 1, name);
      }
      if (!stop) dlg?.set(100);
    }, {
      titleKey: 'batch.title', messageKey: 'batch.running', kind: 'encode', force: true,
      modal: true, creep: false, onCancel: () => { stop = true; },
    });
    const skipped = Math.max(0, total - done.length - failed.length);
    await ctx.refreshTree?.();
    ctx.status?.(`${t('batch.done')}: ${done.length} / ${total}${failed.length ? ` · ${t('batch.failed')}: ${failed.length}` : ''}${skipped ? ` · ${t('batch.stopped', 'Stopped')}: ${skipped}` : ''}`);
    await ctx.report?.(done, failed, o.dir, skipped);
    return { done, failed, skipped };
  }

  return { init, open, run };
})();
