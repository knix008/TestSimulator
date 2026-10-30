/* Batch processing: many pictures at once — resize to a longest side, convert the format,
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

  function init(appCtx) {
    ctx = appCtx;
    for (const id of ['batch-overlay', 'batch-count-selected', 'batch-count-folder', 'batch-resize', 'batch-longest', 'batch-format',
      'batch-quality', 'batch-quality-val', 'batch-wm', 'batch-wm-text', 'batch-dir', 'batch-browse', 'batch-suffix',
      'batch-cancel', 'batch-ok', 'batch-close']) {
      el[id] = document.getElementById(id);
    }
    if (!el['batch-overlay'] || el['batch-overlay']._bound) return;
    el['batch-overlay']._bound = true;
    el['batch-quality'].addEventListener('input', () => { el['batch-quality-val'].textContent = el['batch-quality'].value; });
    const sync = () => {
      el['batch-longest'].disabled = !el['batch-resize'].checked;
      el['batch-wm-text'].disabled = !el['batch-wm'].checked;
      const f = el['batch-format'].value;
      el['batch-quality'].disabled = !(f === 'jpg' || f === 'webp' || f === 'keep');
    };
    for (const id of ['batch-resize', 'batch-wm', 'batch-format']) el[id].addEventListener('change', sync);
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

  /** The dialog for the selected thumbnails (or, without a selection, the whole folder). */
  async function open({ selected: sel = [], folder: dir = '' } = {}) {
    selected = sel.filter((p) => window.FormatSupport?.isImage?.(p) && !FormatSupport.isVideo?.(p) && !FormatSupport.isAudio?.(p));
    folder = dir || (selected[0] ? await window.electronAPI.pathDirname(selected[0]) : '');
    folderFiles = folder ? await ctx.folderImages(folder) : [];
    el['batch-count-selected'].textContent = String(selected.length);
    el['batch-count-folder'].textContent = String(folderFiles.length);
    const target = el['batch-overlay'].querySelector(`input[name="batch-target"][value="${selected.length > 1 ? 'selected' : 'folder'}"]`);
    if (target) target.checked = true;
    el['batch-overlay'].querySelector('input[name="batch-target"][value="selected"]').disabled = !selected.length;
    const saved = _recall();
    el['batch-resize'].checked = saved.resize ?? true;
    el['batch-longest'].value = saved.longest || 1920;
    el['batch-format'].value = saved.format || 'jpg';
    el['batch-quality'].value = saved.quality || 90;
    el['batch-quality-val'].textContent = el['batch-quality'].value;
    el['batch-wm'].checked = !!saved.wm;
    el['batch-wm-text'].value = saved.wmText || '© ';
    el['batch-suffix'].value = saved.suffix ?? `_${t('batch.suffixDefault', 'converted')}`;
    el['batch-dir'].value = folder;
    for (const id of ['batch-resize', 'batch-wm', 'batch-format']) el[id].dispatchEvent(new Event('change'));
    ctx.showDialog('batch-overlay');
  }

  function _options() {
    const target = el['batch-overlay'].querySelector('input[name="batch-target"]:checked')?.value || 'folder';
    return {
      files: target === 'selected' ? selected : folderFiles,
      resize: el['batch-resize'].checked,
      longest: Math.max(16, Math.round(+el['batch-longest'].value || 1920)),
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
      localStorage.setItem('batchV1', JSON.stringify({
        resize: o.resize, longest: o.longest, format: o.format, quality: Math.round(o.quality * 100), wm: o.wm, wmText: o.wmText, suffix: o.suffix,
      }));
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

  // Longest side at most `longest` (never enlarged), stepping down by halves for quality
  function _fit(canvas, longest) {
    const k = longest / Math.max(canvas.width, canvas.height);
    if (k >= 1) return canvas;
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

  /** Process every file; one progress window, a summary at the end. */
  async function run(o) {
    const done = [], failed = [];
    await ctx.runWithProgress(async (dlg) => {
      for (let i = 0; i < o.files.length; i++) {
        const src = o.files[i];
        const name = src.split(/[/\\]/).pop();
        dlg?.set(Math.round(i / o.files.length * 100), `${i + 1} / ${o.files.length}  ${name}`);
        try {
          let c = await _decode(src);
          if (!c) { failed.push(name); continue; }
          if (o.resize) c = _fit(c, o.longest);
          if (o.wm) {
            const saved = (() => { try { return JSON.parse(localStorage.getItem('watermarkV1') || '{}') || {}; } catch { return {}; } })();
            ctx.drawWatermark(c.getContext('2d'), c.width, c.height, {
              font: saved.font || 'Segoe UI', color: saved.color || '#ffffff', size: saved.size || 6,
              opacity: saved.opacity ?? 0.45, angle: saved.angle || 0, tile: !!saved.tile, shadow: saved.shadow !== false,
              anchor: saved.anchor && Number.isFinite(saved.anchor.x) ? saved.anchor : { x: 1, y: 1 }, text: o.wmText,
            });
          }
          const fmt = _formatFor(src, o.format);
          let dataUrl = _encode(c, fmt, o.quality);
          dataUrl = await ctx.withPhotoInfo(dataUrl, { w: c.width, h: c.height }, src);
          const stem = name.replace(/\.[^.]+$/, '') + (o.suffix || '');
          const out = await _freeName(o.dir, stem, fmt);
          const wr = await window.electronAPI.writeFile({ filePath: out, dataUrl });
          if (wr && wr.success) done.push(out); else failed.push(name);
        } catch (err) {
          console.error('batch', src, err);
          failed.push(name);
        }
        // Let the progress window and the page breathe between files
        await new Promise((r) => setTimeout(r, 0));
      }
      dlg?.set(100);
    }, { messageKey: 'batch.running', kind: 'encode', force: true });
    await ctx.refreshTree?.();
    ctx.status?.(`${t('batch.done')}: ${done.length} / ${o.files.length}${failed.length ? ` · ${t('batch.failed')}: ${failed.length}` : ''}`);
    await ctx.report?.(done, failed, o.dir);
    return { done, failed };
  }

  return { init, open, run };
})();
