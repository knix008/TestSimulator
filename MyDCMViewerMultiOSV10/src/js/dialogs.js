/* Dialog contents shared by the popup windows (desktop: popup.html) and the in-page modal fallback (web).
 *
 *   Dialogs.render(kind, box, payload, ctx)   kind: about | shortcuts | error | prompt | settings | batch | mpr
 *   ctx: { send(event, data), close(), onMessage(fn), isPopup }
 *   Dialogs.size(kind) → { width, height } hints for the popup window
 */
window.Dialogs = (function () {
  const t = (k, p) => window.I18n.t(k, p);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const btn = (label, cls, onClick) => { const b = el('button', `btn${cls ? ' ' + cls : ''}`); b.type = 'button'; b.textContent = label; if (onClick) b.addEventListener('click', onClick); return b; };
  const fmt = (v, d = 1) => (Number.isFinite(v) ? (+v.toFixed(d)).toString() : '');
  const P = () => window.Platform;

  const SIZES = { tageditor: { width: 980, height: 720 }, about: { width: 640 }, shortcuts: { width: 720 }, error: { width: 600 }, prompt: { width: 440 }, settings: { width: 860 }, batch: { width: 600 }, mpr: { width: 1180 }, anonymize: { width: 560 }, progress: { width: 460 }, print: { width: 1040 }, filters: { width: 560 }, exportas: { width: 720 } };

  function actions(box, ...buttons) { const a = el('div', 'modal-actions'); buttons.forEach((b) => a.append(b)); box.append(a); return a; }

  /* ── About ── */
  function about(box, payload, ctx) {
    const info = payload.info || {};
    box.classList.add('about');
    // icon on the left, the name and what the program does to its right; the details below as label / value rows
    const head = el('div', 'about-head');
    const icon = el('img', 'about-icon'); icon.src = 'assets/icon.png'; icon.alt = '';
    const intro = el('div', 'about-intro');
    intro.append(el('h2', '', `MyDCMViewer <span>v${esc(info.version || '')}</span>`));
    for (const k of ['about.text', 'about.text2']) if (t(k) !== k) intro.append(el('p', '', esc(t(k))));
    head.append(icon, intro);
    box.append(head);
    const dl = el('dl', 'about-list');
    const add = (k, v) => { if (v) dl.append(el('dt', '', esc(k)), el('dd', '', esc(v))); };
    add(t('about.version'), info.version || '');
    add(t('about.platform'), info.platform === 'web' ? 'Web' : `${info.platform} ${info.arch || ''}`);
    add(t('about.runtime'), info.tauri ? `Tauri ${info.tauri}${info.webview ? ` · WebView ${info.webview}` : ''}` : navigator.userAgent.replace(/^.*\) /, ''));
    add(t('about.formats'), t('about.formatsList'));
    add(t('about.exports'), t('about.exportsList'));
    add(t('about.network'), t('about.networkList'));
    add(t('about.languages'), t('about.languagesList'));
    add(t('about.license'), 'MIT');
    add(t('about.copyright'), 'Copyright © 2026 SHKWON');
    add(t('about.contact'), 'knix008@naver.com');
    box.append(dl);
    actions(box, btn(t('dlg.close'), 'primary', ctx.close));
  }

  /* ── Shortcuts ── */
  function shortcuts(box, payload, ctx) {
    box.append(el('h2', '', esc(t('help.shortcuts'))));
    const rows = [
      ['Ctrl+O', 'sc.open'], ['Ctrl+Shift+O', 'sc.openFolder'], ['Ctrl+E', 'sc.export'], ['Ctrl+C', 'sc.copy'], ['Ctrl+P', 'sc.print'], ['Ctrl+,', 'sc.settings'],
      ['Ctrl+0', 'sc.fit'], ['Ctrl+1', 'sc.actual'], ['+ / −', 'sc.zoom'], ['', 'sc.wheel'], ['Ctrl+← / →', 'sc.rotate'], ['H / V', 'sc.flip'], ['R', 'sc.reset'], ['I', 'sc.invert'],
      ['1 … 9, 0', 'sc.tools'], ['↑ / ↓', 'sc.frames'], ['Home / End', 'sc.frameEnds'], ['Space', 'sc.play'], ['S', 'sc.stop'], ['M / Shift+M', 'sc.mprVolume'], ['Shift+5 7 8 9 0', 'sc.moreTools'], ['Q', 'sc.magnify'], ['← / →, PgUp / PgDn', 'sc.series'],
      ['A', 'sc.wlAuto'], ['W', 'sc.wlFile'], ['Shift+W', 'sc.wlReset'], ['Backspace / Del', 'sc.delete'], ['F9', 'sc.sidebar'], ['F8', 'sc.rightPanel'], ['B', 'sc.scaleBar'], ['K / G', 'sc.rulerGrid'], ['F11', 'sc.fullscreen'], ['Esc', 'sc.escape'], ['', 'sc.rightDrag'],
    ];
    const grid = el('div', 'shortcut-grid');
    grid.innerHTML = rows.map(([k, d]) => `<div class="sc-key">${k ? `<kbd>${esc(k)}</kbd>` : ''}</div><div class="sc-desc">${esc(t(d))}</div>`).join('');
    box.append(grid);
    actions(box, btn(t('dlg.close'), 'primary', ctx.close));
  }

  /* ── Error ── */
  function error(box, payload, ctx) {
    box.classList.add('error');
    box.append(el('h2', '', esc(payload.title || t('dlg.errorTitle'))));
    box.append(el('p', 'error-message', esc(payload.message || '')));
    if (payload.detail) {
      const lines = String(payload.detail).split('\n');
      const shown = lines.slice(0, 14).join('\n') + (lines.length > 14 ? `\n… (+${lines.length - 14})` : '');
      box.append(el('pre', '', esc(shown)));
    }
    actions(box,
      btn(t('dlg.copy'), '', async () => { await P().clipboardWriteText(`${payload.message || ''}\n\n${payload.detail || ''}`); }),
      btn(t('dlg.close'), 'primary', ctx.close));
  }

  /* ── Prompt ── */
  function prompt(box, payload, ctx) {
    box.classList.add('prompt');
    box.append(el('h2', '', esc(payload.title || '')));
    const input = el('input');
    input.type = 'text'; input.value = payload.value || '';
    box.append(input);
    const ok = () => { ctx.send('result', { value: input.value.trim() }); ctx.close(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    actions(box, btn(t('dlg.cancel'), '', () => { ctx.send('result', { value: '' }); ctx.close(); }), btn(t('dlg.ok'), 'primary', ok));
    setTimeout(() => { input.focus(); input.select(); }, 50);
  }

  /* ── Settings ── */
  const SETTINGS_SPEC = [
    { section: 'appearance', key: 'theme', type: 'themes' },
    { section: 'appearance', key: 'lang', type: 'select', options: [['ko', '한국어'], ['en', 'English']] },
    { section: 'appearance', key: 'sidebar', type: 'bool' },
    { section: 'appearance', key: 'rightPanel', type: 'bool' },
    { section: 'start', key: 'showStartOnLaunch', type: 'bool' },
    { section: 'start', key: 'showTourOnLaunch', type: 'bool' },
    { section: 'start', key: 'startScreen.scene', type: 'scene' },
    { section: 'start', key: 'startScreen.transparency', type: 'number', min: 0, max: 100 },
    { section: 'start', key: 'startScreen.motion', type: 'number', min: 0, max: 100 },
    { section: 'viewer', key: 'interpolate', type: 'bool' },
    { section: 'viewer', key: 'cornerInfo', type: 'bool' },
    { section: 'viewer', key: 'markers', type: 'bool' },
    { section: 'viewer', key: 'overlays', type: 'bool' },
    { section: 'viewer', key: 'measurements', type: 'bool' },
    { section: 'viewer', key: 'scaleBar', type: 'bool' },
    { section: 'viewer', key: 'measureUnit', type: 'select', options: [['cm', 'settings.unitCm'], ['in', 'settings.unitIn']] },
    { section: 'viewer', key: 'burnAnnotations', type: 'bool' },
    { section: 'viewer', key: 'wheelMode', type: 'select', options: [['zoom', 'settings.wheelZoom'], ['stack', 'settings.wheelStack']] },
    { section: 'viewer', key: 'defaultFps', type: 'number', min: 1, max: 120 },
    { section: 'viewer', key: 'loop', type: 'bool' },
    { section: 'viewer', key: 'syncScroll', type: 'bool' },
    { section: 'viewer', key: 'refLines', type: 'bool' },
    { section: 'viewer', key: 'annotationColor', type: 'color' },
    { section: 'viewer', key: 'overlayColor', type: 'color' },
    { section: 'files', key: 'rememberLastDir', type: 'bool', desktop: true },
    { section: 'files', key: 'startupDir', type: 'dir', desktop: true },
    { section: 'files', key: 'confirmDelete', type: 'bool', desktop: true },
  ];

  function settings(box, payload, ctx) {
    box.classList.add('settings');
    let values = { ...(payload.defaults || {}), ...(payload.settings || {}) };
    const isDesktop = !!payload.isDesktop;
    let tab = payload.tab || 'appearance';
    // 'startScreen.x' is one field of the startScreen object (start page background); missing fields use the start page defaults
    const opt = (k) => {
      if (!k.startsWith('startScreen.')) return values[k];
      const f = k.slice(12), v = (values.startScreen || {})[f];
      return v == null ? (payload.startDefaults || {})[f] : v;
    };

    function render() {
      box.innerHTML = '';
      box.append(el('h2', '', esc(t('settings.title'))));
      const tabs = isDesktop ? ['appearance', 'start', 'viewer', 'files'] : ['appearance', 'start', 'viewer'];
      if (!tabs.includes(tab)) tab = 'appearance';
      const tabBar = el('div', 'settings-tabs');
      for (const id of tabs) {
        const b = el('button', `tab${id === tab ? ' active' : ''}`, esc(t(`settings.${id}`)));
        b.type = 'button';
        b.addEventListener('click', () => { tab = id; render(); ctx.resize && ctx.resize(); });
        tabBar.append(b);
      }
      box.append(tabBar);
      const body = el('div', 'settings-body');
      for (const spec of SETTINGS_SPEC) {
        if (spec.section !== tab || (spec.desktop && !isDesktop)) continue;
        body.append(row(spec));
      }
      box.append(body);
      const a = actions(box, btn(t('settings.reset'), '', () => ctx.send('reset')), el('span', 'spacer'), btn(t('dlg.close'), 'primary', ctx.close));
      void a;
    }

    function change(key, value) {
      if (key.startsWith('startScreen.')) { value = { ...(values.startScreen || {}), [key.slice(12)]: value }; key = 'startScreen'; }
      values[key] = value;
      ctx.send('setting', { key, value });
      if (key === 'theme') window.Themes.apply(value);
      if (key === 'lang') { window.I18n.setLang(value); render(); }
    }

    function row(spec) {
      const r = el('div', 'setting-row');
      const value = opt(spec.key);
      const label = el('div', 'label', esc(t(`settings.${spec.key}`)));
      const ctl = el('div', 'control');
      if (spec.type === 'themes') {
        // one compact row per theme (colours + name), dark and light in four columns, then the custom theme
        r.style.gridTemplateColumns = '1fr';
        const wrap = el('div', 'theme-groups');
        const rows = [];
        const select = (id) => { change('theme', id); rows.forEach((x) => x.classList.toggle('active', x.dataset.id === id)); };
        const themeRow = (th) => {
          const v = th.vars;
          const b = el('button', `theme-row${th.id === window.Themes.get(value).id ? ' active' : ''}`);
          b.type = 'button'; b.dataset.id = th.id; b.title = th.name;
          b.innerHTML = `<span class="sw">${['--bg', '--panel-bg', '--accent', '--text'].map((k) => `<i style="background:${v[k]}"></i>`).join('')}</span><span class="name">${esc(th.name)}</span>`;
          b.addEventListener('click', () => select(th.id));
          rows.push(b);
          return b;
        };
        for (const scheme of ['dark', 'light']) {
          wrap.append(el('div', 'theme-group-title', esc(t(scheme === 'dark' ? 'view.themeDark' : 'view.themeLight'))));
          const list = el('div', 'theme-rows');
          for (const th of window.Themes.list().filter((x) => x.scheme === scheme)) list.append(themeRow(th));
          wrap.append(list);
        }
        // custom theme: its row and the colours it is made of
        wrap.append(el('div', 'theme-group-title', esc(t('view.themeCustom'))));
        const own = el('div', 'theme-custom');
        let customRow = themeRow(window.Themes.custom());
        own.append(customRow);
        const colors = el('div', 'theme-custom-colors');
        const fields = [['scheme', 'settings.customScheme'], ['bg', 'settings.customBg'], ['panel', 'settings.customPanel'], ['text', 'settings.customText'], ['accent', 'settings.customAccent'], ['viewport', 'settings.customViewport']];
        const inputs = {};
        const commit = () => {
          const spec = {};
          for (const [k] of fields) spec[k] = inputs[k].value;
          window.Themes.setCustom(spec);
          values.customTheme = spec;
          ctx.send('setting', { key: 'customTheme', value: spec });
          const fresh = themeRow(window.Themes.custom());
          rows.splice(rows.indexOf(customRow), 1);
          customRow.replaceWith(fresh); customRow = fresh;
          select('custom');
        };
        const fill = (c) => { for (const [k] of fields) inputs[k].value = c[k]; };
        for (const [k, label] of fields) {
          const f = el('label', 'cc-field');
          let inp;
          if (k === 'scheme') {
            inp = el('select');
            for (const sc of ['dark', 'light']) { const o = el('option', '', esc(t(sc === 'dark' ? 'view.themeDark' : 'view.themeLight'))); o.value = sc; inp.append(o); }
            inp.addEventListener('change', commit);
          } else {
            inp = el('input'); inp.type = 'color';
            inp.addEventListener('change', commit);
          }
          inputs[k] = inp;
          f.append(el('span', '', esc(t(label))), inp);
          colors.append(f);
        }
        fill(window.Themes.customColors());
        const from = btn(t('settings.customFrom'), '', () => {
          const th = window.Themes.get(values.theme);
          if (th.id === 'custom') return;
          const v = th.vars;
          fill({ scheme: th.scheme, bg: v['--bg'], panel: v['--panel-bg'], text: v['--text'], accent: v['--accent'], viewport: v['--viewport-bg'] });
          commit();
        });
        colors.append(from);
        own.append(colors);
        wrap.append(own, el('div', 'desc', esc(t('settings.customHint'))));
        ctl.append(wrap);
        r.append(label, ctl);
        return r;
      }
      if (spec.type === 'bool') {
        const sw = el('div', `switch${value ? ' on' : ''}`);
        sw.addEventListener('click', () => { sw.classList.toggle('on'); change(spec.key, sw.classList.contains('on')); });
        ctl.append(sw);
      } else if (spec.type === 'select') {
        const sel = el('select');
        for (const [v, l] of spec.options) { const o = el('option', '', esc(l.includes('.') ? t(l) : l)); o.value = v; sel.append(o); }
        sel.value = value;
        sel.addEventListener('change', () => change(spec.key, sel.value));
        ctl.append(sel);
      } else if (spec.type === 'number') {
        const inp = el('input'); inp.type = 'number'; inp.min = spec.min; inp.max = spec.max; inp.value = value;
        inp.addEventListener('change', () => change(spec.key, Math.max(spec.min, Math.min(spec.max, +inp.value || spec.min))));
        ctl.append(inp);
      } else if (spec.type === 'scene') {
        const sel = el('select');
        const lang = window.I18n.lang === 'ko' ? 'ko' : 'en';
        for (const sc of payload.startScenes || []) { const o = el('option', '', esc(sc[lang])); o.value = sc.id; sel.append(o); }
        sel.value = value || (payload.startScenes && payload.startScenes[0] ? payload.startScenes[0].id : '');
        sel.addEventListener('change', () => change(spec.key, sel.value));
        ctl.append(sel);
      } else if (spec.type === 'color') {
        const inp = el('input'); inp.type = 'color'; inp.value = value;
        inp.addEventListener('input', () => change(spec.key, inp.value));
        ctl.append(inp);
      } else if (spec.type === 'dir') {
        const wrap = el('div', 'row');
        const inp = el('input'); inp.type = 'text'; inp.value = value || ''; inp.placeholder = t('settings.startupDirHint');
        inp.addEventListener('change', () => change(spec.key, inp.value.trim()));
        const pick = btn(t('batch.choose'), '', async () => { const d = await P().pickFolder(); if (d) { inp.value = d; change(spec.key, d); } });
        const clear = btn(t('settings.clear'), '', () => { inp.value = ''; change(spec.key, ''); });
        wrap.append(inp, pick, clear);
        ctl.append(wrap);
      }
      r.append(label, ctl);
      const descKey = `settings.${spec.key}Desc`;
      if (t(descKey) !== descKey) r.append(el('div', 'desc', esc(t(descKey))));
      return r;
    }

    ctx.onMessage((event, data) => {
      if (event === 'settings') { values = { ...(payload.defaults || {}), ...(data || {}) }; window.Themes.apply(values.theme); window.I18n.setLang(values.lang); render(); }
    });
    render();
  }

  /* ── Batch conversion (runs here: decoder + encoders + platform are loaded in the popup too) ── */
  const DICOM_EXTS = new Set(['dcm', 'dicm', 'dicom', 'dic']);
  const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'ico', 'svg', 'avif', 'heic', 'heif', 'hif', 'jp2', 'j2k', 'jpc', 'jpx', 'j2c']);
  const EXPORT_EXT = { png: 'png', jpeg: 'jpg', webp: 'webp', bmp: 'bmp', tiff: 'tif', gif: 'gif' };
  const EXPORT_MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp', tiff: 'image/tiff', gif: 'image/gif' };

  function isCandidate(name) {
    const ext = P().extname(name);
    if (DICOM_EXTS.has(ext)) return true;
    if (IMAGE_EXTS.has(ext)) return false;
    return !ext && !/^(dicomdir|readme|license)$/i.test(name);
  }
  async function collectDicomFiles(dir, recursive, out = []) {
    const entries = await P().readDir(dir);
    for (const e of entries) {
      if (e.isDir) { if (recursive && !/^converted_/i.test(e.name)) await collectDicomFiles(e.path, true, out); continue; }
      if (!isCandidate(e.name)) continue;
      if (DICOM_EXTS.has(P().extname(e.name))) { out.push(e.path); continue; }
      try { if (window.DicomDecoder.isDicom(new Uint8Array(await P().readFileHead(e.path, 4096)))) out.push(e.path); } catch { /* skip */ }
    }
    return out;
  }
  async function encodeCanvas(canvas, format, dpi) {
    const E = window.Encoders;
    if (format === 'png' || format === 'jpeg' || format === 'webp') {
      const blob = await new Promise((r) => canvas.toBlob(r, EXPORT_MIME[format], 0.92));
      return new Uint8Array(await blob.arrayBuffer());
    }
    const id = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const args = { width: canvas.width, height: canvas.height, rgba: id.data };
    if (format === 'bmp') return E.bmp(args);
    if (format === 'gif') return E.gif(args);
    return E.tiff({ ...args, dpi: dpi || 72 });
  }

  function batch(box, payload, ctx) {
    box.classList.add('batch');
    box.append(el('h2', '', esc(t('batch.title'))));
    const form = el('div');
    form.innerHTML = `
      <div class="form-row"><label>${esc(t('batch.source'))}</label><div class="row"><input id="bSource" type="text" readonly><button class="btn" id="bChoose" type="button">${esc(t('batch.choose'))}</button></div></div>
      <div class="form-row"><label>${esc(t('batch.format'))}</label><div class="row radios">${['png', 'jpeg', 'webp', 'bmp', 'tiff', 'gif'].map((f, i) => `<label><input type="radio" name="bFormat" value="${f}"${i === 0 ? ' checked' : ''}>${f.toUpperCase()}</label>`).join('')}</div></div>
      <div class="form-row"><label>${esc(t('batch.options'))}</label><div class="row checks">
        <label><input type="checkbox" id="bRecursive"><span>${esc(t('batch.recursive'))}</span></label>
        <label><input type="checkbox" id="bAllFrames" checked><span>${esc(t('batch.allFrames'))}</span></label>
        <label><input type="checkbox" id="bCurrentWL"${payload.wl ? '' : ' disabled'}><span>${esc(t('batch.currentWL'))}</span></label>
      </div></div>
      <p class="hint">${esc(t('batch.hint'))}</p>
      <div class="progress" id="bProgress"><div class="bar" id="bBar"></div><span id="bText"></span></div>`;
    box.append(form);
    const q = (id) => box.querySelector('#' + id);
    q('bSource').value = payload.source || '';
    q('bChoose').addEventListener('click', async () => { const d = await P().pickFolder(); if (d) q('bSource').value = d; });
    const start = btn(t('batch.start'), 'primary', run);
    actions(box, btn(t('dlg.cancel'), '', ctx.close), start);

    async function run() {
      const src = q('bSource').value;
      if (!src) { q('bText').textContent = t('batch.noSource'); q('bProgress').classList.add('show'); ctx.resize && ctx.resize(); return; }
      const format = box.querySelector('input[name=bFormat]:checked').value;
      const recursive = q('bRecursive').checked, allFrames = q('bAllFrames').checked, useWL = q('bCurrentWL').checked && payload.wl;
      const ext = EXPORT_EXT[format];
      const D = window.DicomDecoder, E = window.Encoders, Pl = P();
      start.disabled = true;
      q('bProgress').classList.add('show'); q('bText').textContent = t('batch.scanning'); q('bBar').style.width = '0%';
      ctx.resize && ctx.resize();
      const failures = [];
      let ok = 0, outDir = null, zipFiles = null;
      try {
        const files = await collectDicomFiles(src, recursive);
        if (!files.length) { q('bText').textContent = t('batch.noFiles'); return; }
        if (Pl.canWriteInto(src)) outDir = await Pl.uniqueDir(Pl.join(src, `converted_${ext}`)); else zipFiles = [];
        for (let i = 0; i < files.length; i++) {
          const p = files[i], name = Pl.basename(p);
          q('bBar').style.width = `${Math.round(i / files.length * 100)}%`;
          q('bText').textContent = t('batch.progress', { done: i + 1, total: files.length, name });
          await new Promise((r) => setTimeout(r, 0));
          try {
            const img = await D.load(new Uint8Array(await Pl.readFile(p)));
            const frames = allFrames ? img.frames : 1;
            const base = name.replace(/\.[^.]+$/, '');
            const rel = recursive ? Pl.dirname(p).slice(src.length).replace(/^[\\/]+/, '') : '';
            for (let fr = 0; fr < frames; fr++) {
              const r = await img.render({ frame: fr, ...(useWL ? payload.wl : { resetWindow: true, colormap: 'gray', invert: img.defaultInvert() }) });
              const c = document.createElement('canvas'); c.width = r.width; c.height = r.height;
              const id = c.getContext('2d').createImageData(r.width, r.height); id.data.set(r.rgba); c.getContext('2d').putImageData(id, 0, 0);
              const sp = img.frameInfo(fr).pixelSpacing;
              const data = await encodeCanvas(c, format, sp ? 25.4 / sp[1] : 72);
              const outName = `${base}${frames > 1 ? `_frame${String(fr + 1).padStart(2, '0')}` : ''}.${ext}`;
              if (outDir) await Pl.writeFile(Pl.join(outDir, rel, outName), data);
              else zipFiles.push({ name: rel ? `${rel}/${outName}` : outName, data });
            }
            img.release();
            ok++;
          } catch (err) { failures.push(`${p}: ${err && err.message ? err.message : err}`); }
        }
        q('bBar').style.width = '100%';
        if (zipFiles && zipFiles.length) { const zipName = `converted_${ext}.zip`; Pl.download(zipName, E.zip(zipFiles), 'application/zip'); outDir = zipName; }
        const summary = `${t('batch.done', { ok, fail: failures.length })}${outDir ? `\n${t('batch.output', { dir: outDir })}` : ''}`;
        q('bText').textContent = summary;
        ctx.send('done', { source: src, outDir, ok, failures });
      } finally { start.disabled = false; ctx.resize && ctx.resize(); }
    }
  }

  /* ── Anonymize (in-place overwrite of identifying values, lengths preserved) ── */
  const PHI_TAGS = [
    ['00100010', 'Patient Name'], ['00100020', 'Patient ID'], ['00100030', 'Patient Birth Date'], ['00100040', 'Patient Sex'], ['00101010', 'Patient Age'],
    ['00101000', 'Other Patient IDs'], ['00101001', 'Other Patient Names'], ['00101020', 'Patient Size'], ['00101030', 'Patient Weight'], ['00102160', 'Ethnic Group'], ['00104000', 'Patient Comments'],
    ['00080050', 'Accession Number'], ['00080080', 'Institution Name'], ['00080081', 'Institution Address'], ['00080090', 'Referring Physician Name'], ['00081010', 'Station Name'],
    ['00081040', 'Institutional Department Name'], ['00081048', 'Physicians of Record'], ['00081050', 'Performing Physician Name'], ['00081060', 'Reading Physician Name'], ['00081070', 'Operators Name'],
    ['00200010', 'Study ID'], ['00080020', 'Study Date'], ['00080021', 'Series Date'], ['00080022', 'Acquisition Date'], ['00080023', 'Content Date'],
    ['00080030', 'Study Time'], ['00080031', 'Series Time'], ['00080032', 'Acquisition Time'], ['00080033', 'Content Time'], ['00081030', 'Study Description'], ['0008103E', 'Series Description'],
    ['00181000', 'Device Serial Number'], ['00321032', 'Requesting Physician'], ['00380010', 'Admission ID'], ['00400244', 'PPS Start Date'], ['00400245', 'PPS Start Time'], ['00400253', 'PPS ID'],
  ];
  function anonymize(box, payload, ctx) {
    box.classList.add('anonymize');
    box.append(el('h2', '', esc(t('anon.title'))));
    box.append(el('p', 'hint', esc(t('anon.hint'))));
    const list = el('div', 'anon-list');
    const boxes = [];
    for (const [tag, name] of PHI_TAGS) {
      const lab = el('label');
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = true; cb.dataset.tag = tag;
      lab.append(cb, el('span', '', `(${tag.slice(0, 4)},${tag.slice(4)}) ${esc(name)}`));
      list.append(lab); boxes.push(cb);
    }
    box.append(list);
    const priv = el('label', 'anon-private'); const pcb = el('input'); pcb.type = 'checkbox'; pcb.checked = true; priv.append(pcb, el('span', '', esc(t('anon.private'))));
    box.append(priv);
    const uids = el('label', 'anon-private'); const ucb = el('input'); ucb.type = 'checkbox'; ucb.checked = true; uids.append(ucb, el('span', '', esc(t('anon.newUids'))));
    box.append(uids);
    const nameRow = el('div', 'form-row'); nameRow.innerHTML = `<label>${esc(t('anon.replacement'))}</label><div class="row"><input id="anonName" type="text" value="ANONYMOUS"></div>`;
    box.append(nameRow);
    actions(box, btn(t('dlg.cancel'), '', ctx.close), btn(t('anon.save'), 'primary', () => {
      ctx.send('run', { tags: boxes.filter((b) => b.checked).map((b) => b.dataset.tag), privateTags: pcb.checked, newUids: ucb.checked, replacement: box.querySelector('#anonName').value || 'ANONYMOUS' });
      ctx.close();
    }));
  }

  /* ── MPR / MIP volume viewer ── */
  function mpr(box, payload, ctx) {
    box.classList.add('mpr');
    box.innerHTML = `<h2>${esc(t('mpr.title'))} <span class="mpr-sub" id="mprSub"></span></h2>
      <div class="mpr-controls">
        <label>${esc(t('mpr.mode'))} <select id="mprMode"><option value="mpr">MPR</option><option value="mip">MIP</option><option value="minip">MinIP</option><option value="avg">${esc(t('mpr.avg'))}</option></select></label>
        <label>${esc(t('mpr.slab'))} <input id="mprSlab" type="number" min="0" max="500" step="1" value="0"> mm</label>
        <label>W <input id="mprWW" type="number" step="1"></label>
        <label>L <input id="mprWC" type="number" step="1"></label>
        <label><input type="checkbox" id="mprCross" checked> ${esc(t('mpr.crosshair'))}</label>
        <label title="${esc(t('mpr.curvedHint'))}"><input type="checkbox" id="mprCurved"> ${esc(t('mpr.curved'))}</label>
        <button class="btn" id="mprCurveClear" type="button">${esc(t('mpr.curveClear'))}</button>
        <button class="btn" id="mprExport" type="button">${esc(t('mpr.export'))}</button>
        <span class="mpr-status" id="mprStatus"></span>
      </div>
      <div class="mpr-grid">
        ${['axial', 'coronal', 'sagittal'].map((v) => `<div class="mpr-view" data-view="${v}"><div class="mpr-label">${esc(t('mpr.' + v))} <span class="pos"></span></div><canvas></canvas><input type="range" min="0" max="0" value="0" data-spin-format="index"></div>`).join('')}
      </div>
      <div class="mpr-curved" id="mprCurvedView" hidden><div class="mpr-label">${esc(t('mpr.curvedView'))} <span id="mprCurveLen"></span></div><canvas id="mprCurveCanvas"></canvas></div>`;
    const q = (id) => box.querySelector('#' + id);
    const views = {};
    box.querySelectorAll('.mpr-view').forEach((v) => { views[v.dataset.view] = { el: v, canvas: v.querySelector('canvas'), slider: v.querySelector('input'), pos: v.querySelector('.pos') }; });
    const D = window.DicomDecoder, Pl = P();
    const st = { vol: null, nx: 0, ny: 0, nz: 0, sx: 1, sy: 1, sz: 1, x: 0, y: 0, z: 0, wc: 40, ww: 400, mode: 'mpr', slab: 0, cross: true, min: 0, max: 0, curved: false, curve: [] };
    actions(box, btn(t('dlg.close'), 'primary', ctx.close));

    async function build() {
      const files = payload.files || [];
      const status = q('mprStatus');
      const slices = [];
      let nx = 0, ny = 0, spacing = null, positions = [];
      try {
        if (payload.multiframe) {
          const img = await D.load(new Uint8Array(await Pl.readFile(payload.multiframe)));
          nx = img.width; ny = img.height;
          const fi = img.frameInfo(0); spacing = fi.pixelSpacing;
          for (let f = 0; f < img.frames; f++) {
            status.textContent = t('mpr.loading', { done: f + 1, total: img.frames });
            await new Promise((r) => setTimeout(r, 0));
            slices.push(await img.valuesOf(f));
            const info = img.frameInfo(f);
            positions.push(img.enhanced && Number.isFinite(info.sliceLocation) ? info.sliceLocation : f * (info.spacingBetweenSlices || info.sliceThickness || 1));
          }
          st.wc = img.state.wc; st.ww = img.state.ww;
          img.release();
        } else {
          for (let i = 0; i < files.length; i++) {
            status.textContent = t('mpr.loading', { done: i + 1, total: files.length });
            await new Promise((r) => setTimeout(r, 0));
            const img = await D.load(new Uint8Array(await Pl.readFile(files[i])));
            if (!img.gray) throw new Error(t('mpr.notGray'));
            if (!nx) { nx = img.width; ny = img.height; spacing = img.frameInfo(0).pixelSpacing; st.wc = img.defaultWindow() ? img.defaultWindow().wc : 0; st.ww = img.defaultWindow() ? img.defaultWindow().ww : 1; }
            if (img.width !== nx || img.height !== ny) throw new Error(t('mpr.sizeMismatch'));
            slices.push(await img.valuesOf(0));
            const fi = img.frameInfo(0);
            positions.push(Number.isFinite(fi.sliceLocation) ? fi.sliceLocation : i * (fi.spacingBetweenSlices || fi.sliceThickness || 1));
            img.release();
          }
        }
      } catch (err) { status.textContent = String(err && err.message || err); return; }
      const nz = slices.length;
      if (!nz) { status.textContent = t('mpr.noSlices'); return; }
      const vol = new Float32Array(nx * ny * nz);
      let min = Infinity, max = -Infinity;
      for (let z = 0; z < nz; z++) { const s = slices[z]; for (let i = 0; i < s.length; i++) { const v = s[i]; if (v === v) { if (v < min) min = v; if (v > max) max = v; } } }
      if (!Number.isFinite(min)) { min = 0; max = 1; }
      for (let z = 0; z < nz; z++) { const s = slices[z]; const off = z * nx * ny; for (let i = 0; i < s.length; i++) { const v = s[i]; vol[off + i] = v === v ? v : min; } }
      let sz = 1;
      if (nz > 1) { const d = []; for (let i = 1; i < nz; i++) d.push(Math.abs(positions[i] - positions[i - 1])); d.sort((a, b) => a - b); sz = d[d.length >> 1] || 1; }
      Object.assign(st, { vol, nx, ny, nz, sx: spacing ? spacing[1] : 1, sy: spacing ? spacing[0] : 1, sz, x: nx >> 1, y: ny >> 1, z: nz >> 1, min, max });
      if (!Number.isFinite(st.ww) || st.ww <= 0) { st.wc = (min + max) / 2; st.ww = Math.max(1, max - min); }
      q('mprWW').value = fmt(st.ww, 0); q('mprWC').value = fmt(st.wc, 0);
      q('mprSub').textContent = `${nx} × ${ny} × ${nz} · ${fmt(st.sx, 3)} × ${fmt(st.sy, 3)} × ${fmt(st.sz, 3)} mm`;
      status.textContent = '';
      views.axial.slider.max = nz - 1; views.axial.slider.value = st.z;
      views.coronal.slider.max = ny - 1; views.coronal.slider.value = st.y;
      views.sagittal.slider.max = nx - 1; views.sagittal.slider.value = st.x;
      drawAll();
      ctx.resize && ctx.resize();
    }

    // Sample the volume along one axis into an RGBA image. axis: 'z' (axial), 'y' (coronal), 'x' (sagittal).
    function project(axis) {
      const { vol, nx, ny, nz } = st;
      const lo = st.wc - st.ww / 2, k = 255 / Math.max(1e-6, st.ww);
      const spacingAlong = axis === 'z' ? st.sz : axis === 'y' ? st.sy : st.sx;
      const half = st.mode === 'mpr' ? 0 : Math.max(0, Math.round(st.slab / 2 / spacingAlong));
      const n = axis === 'z' ? nz : axis === 'y' ? ny : nx;
      const center = axis === 'z' ? st.z : axis === 'y' ? st.y : st.x;
      const from = Math.max(0, center - half), to = Math.min(n - 1, center + half);
      const w = axis === 'x' ? ny : nx;
      const h = axis === 'z' ? ny : nz;
      const out = new Uint8ClampedArray(w * h * 4);
      const idx = (x, y, z) => (z * ny + y) * nx + x;
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          let acc = st.mode === 'minip' ? Infinity : st.mode === 'mip' ? -Infinity : 0;
          let cnt = 0;
          for (let s = from; s <= to; s++) {
            let v;
            if (axis === 'z') v = vol[idx(i, j, s)];
            else if (axis === 'y') v = vol[idx(i, s, nz - 1 - j)];
            else v = vol[idx(s, i, nz - 1 - j)];
            if (st.mode === 'mip') { if (v > acc) acc = v; }
            else if (st.mode === 'minip') { if (v < acc) acc = v; }
            else { acc += v; cnt++; }
          }
          if (st.mode === 'mpr' || st.mode === 'avg') acc = cnt ? acc / cnt : acc;
          let g = Math.round((acc - lo) * k);
          g = g < 0 ? 0 : g > 255 ? 255 : g;
          const o = (j * w + i) * 4;
          out[o] = out[o + 1] = out[o + 2] = g; out[o + 3] = 255;
        }
      }
      return { rgba: out, w, h };
    }

    function draw(axis) {
      if (!st.vol) return;
      const view = axis === 'z' ? views.axial : axis === 'y' ? views.coronal : views.sagittal;
      const { rgba, w, h } = project(axis);
      const c = view.canvas;
      c.width = w; c.height = h;
      const cx = c.getContext('2d');
      const id = cx.createImageData(w, h); id.data.set(rgba); cx.putImageData(id, 0, 0);
      // physical aspect via CSS size
      const pw = axis === 'x' ? st.sy : st.sx, ph = axis === 'z' ? st.sy : st.sz;
      const box = view.el.getBoundingClientRect();
      const availW = Math.max(100, box.width - 8), availH = 330;
      const s = Math.min(availW / (w * pw), availH / (h * ph));
      c.style.width = `${Math.round(w * pw * s)}px`; c.style.height = `${Math.round(h * ph * s)}px`;
      if (st.cross) {
        cx.strokeStyle = 'rgba(56,189,248,0.9)'; cx.lineWidth = 1;
        const hx = axis === 'x' ? st.y : st.x, hy = axis === 'z' ? st.y : (st.nz - 1 - st.z);
        cx.beginPath(); cx.moveTo(hx + 0.5, 0); cx.lineTo(hx + 0.5, h); cx.moveTo(0, hy + 0.5); cx.lineTo(w, hy + 0.5); cx.stroke();
      }
      const pos = axis === 'z' ? st.z : axis === 'y' ? st.y : st.x;
      const n = axis === 'z' ? st.nz : axis === 'y' ? st.ny : st.nx;
      view.pos.textContent = `${pos + 1} / ${n}`;
    }
    /* Curved MPR: the volume sampled along the path drawn on the axial view, at every slice —
     * one column per millimetre of path, the slices from head (top) to feet. */
    function curvedImage() {
      const pts = st.curve;
      if (pts.length < 2) return null;
      const steps = [];
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        const len = Math.hypot((x1 - x0) * st.sx, (y1 - y0) * st.sy);
        const n = Math.max(1, Math.round(len));
        for (let k = i === 1 ? 0 : 1; k <= n; k++) steps.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]);
      }
      const w = steps.length, h = st.nz;
      const lo = st.wc - st.ww / 2, kk = 255 / Math.max(1e-6, st.ww);
      const out = new Uint8ClampedArray(w * h * 4);
      for (let j = 0; j < h; j++) {
        const z = st.nz - 1 - j;
        for (let i = 0; i < w; i++) {
          // bilinear inside the slice
          const [fx, fy] = steps[i];
          const x0 = Math.max(0, Math.min(st.nx - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(st.ny - 2, Math.floor(fy)));
          const ax = Math.max(0, Math.min(1, fx - x0)), ay = Math.max(0, Math.min(1, fy - y0));
          const base = z * st.nx * st.ny;
          const v00 = st.vol[base + y0 * st.nx + x0], v10 = st.vol[base + y0 * st.nx + x0 + 1], v01 = st.vol[base + (y0 + 1) * st.nx + x0], v11 = st.vol[base + (y0 + 1) * st.nx + x0 + 1];
          const v = (v00 * (1 - ax) + v10 * ax) * (1 - ay) + (v01 * (1 - ax) + v11 * ax) * ay;
          let g = Math.round((v - lo) * kk); g = g < 0 ? 0 : g > 255 ? 255 : g;
          const o = (j * w + i) * 4; out[o] = out[o + 1] = out[o + 2] = g; out[o + 3] = 255;
        }
      }
      return { rgba: out, w, h, lengthMm: w };
    }
    function drawCurved() {
      const view = q('mprCurvedView');
      view.hidden = !st.curved;
      if (!st.curved || !st.vol) return;
      const img = curvedImage();
      const c = q('mprCurveCanvas');
      if (!img) { c.width = 1; c.height = 1; q('mprCurveLen').textContent = t('mpr.curveStart'); return; }
      c.width = img.w; c.height = img.h;
      const id = c.getContext('2d').createImageData(img.w, img.h); id.data.set(img.rgba); c.getContext('2d').putImageData(id, 0, 0);
      const s = Math.min((view.getBoundingClientRect().width - 8) / img.w, 260 / (img.h * st.sz));
      c.style.width = `${Math.round(img.w * s)}px`; c.style.height = `${Math.round(img.h * st.sz * s)}px`;
      q('mprCurveLen').textContent = `${fmt(img.lengthMm, 0)} mm · ${st.curve.length} ${t('mpr.curvePoints')}`;
      ctx.resize && ctx.resize();
    }
    function drawCurvePath() {
      if (!st.curved || st.curve.length === 0) return;
      const cx = views.axial.canvas.getContext('2d');
      cx.strokeStyle = 'rgba(250,204,21,0.95)'; cx.fillStyle = 'rgba(250,204,21,0.95)'; cx.lineWidth = 1.5;
      cx.beginPath(); st.curve.forEach(([x, y], i) => (i ? cx.lineTo(x, y) : cx.moveTo(x, y))); cx.stroke();
      st.curve.forEach(([x, y]) => { cx.beginPath(); cx.arc(x, y, 2.5, 0, Math.PI * 2); cx.fill(); });
    }
    // the slices may still be loading when the dialog is closed (its box emptied or reused): stop then
    function drawAll() { if (!box.contains(views.axial.canvas)) return; draw('z'); draw('y'); draw('x'); drawCurvePath(); drawCurved(); }

    views.axial.slider.addEventListener('input', (e) => { st.z = +e.target.value; drawAll(); });
    views.coronal.slider.addEventListener('input', (e) => { st.y = +e.target.value; drawAll(); });
    views.sagittal.slider.addEventListener('input', (e) => { st.x = +e.target.value; drawAll(); });
    for (const [axis, view] of [['z', views.axial], ['y', views.coronal], ['x', views.sagittal]]) {
      const pick = (e) => {
        if (!st.vol) return;
        if (st.curved && axis === 'z') return;
        const r = view.canvas.getBoundingClientRect();
        const px = Math.floor((e.clientX - r.left) / r.width * view.canvas.width), py = Math.floor((e.clientY - r.top) / r.height * view.canvas.height);
        if (axis === 'z') { st.x = clamp(px, st.nx); st.y = clamp(py, st.ny); }
        else if (axis === 'y') { st.x = clamp(px, st.nx); st.z = clamp(st.nz - 1 - py, st.nz); }
        else { st.y = clamp(px, st.ny); st.z = clamp(st.nz - 1 - py, st.nz); }
        views.axial.slider.value = st.z; views.coronal.slider.value = st.y; views.sagittal.slider.value = st.x;
        drawAll();
      };
      view.canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0 && st.curved && axis === 'z' && st.vol) {
          const r = view.canvas.getBoundingClientRect();
          st.curve.push([(e.clientX - r.left) / r.width * view.canvas.width, (e.clientY - r.top) / r.height * view.canvas.height]);
          drawAll();
          return;
        }
        if (e.button === 0) { pick(e); const mv = (ev) => pick(ev); const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); } });
      view.canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const d = e.deltaY > 0 ? 1 : -1;
        if (axis === 'z') st.z = clamp(st.z + d, st.nz); else if (axis === 'y') st.y = clamp(st.y + d, st.ny); else st.x = clamp(st.x + d, st.nx);
        views.axial.slider.value = st.z; views.coronal.slider.value = st.y; views.sagittal.slider.value = st.x;
        drawAll();
      }, { passive: false });
    }
    const clamp = (v, n) => Math.max(0, Math.min(n - 1, v));
    q('mprMode').addEventListener('change', (e) => { st.mode = e.target.value; drawAll(); });
    q('mprSlab').addEventListener('change', (e) => { st.slab = Math.max(0, +e.target.value || 0); drawAll(); });
    const wl = () => { const ww = +q('mprWW').value, wc = +q('mprWC').value; if (ww > 0 && Number.isFinite(wc)) { st.ww = ww; st.wc = wc; drawAll(); } };
    q('mprWW').addEventListener('change', wl); q('mprWC').addEventListener('change', wl);
    q('mprCross').addEventListener('change', (e) => { st.cross = e.target.checked; drawAll(); });
    q('mprCurved').addEventListener('change', (e) => { st.curved = e.target.checked; drawAll(); ctx.resize && ctx.resize(); });
    q('mprCurveClear').addEventListener('click', () => { st.curve = []; drawAll(); });
    q('mprExport').addEventListener('click', async () => {
      if (!st.vol) return;
      const targets = [['axial', views.axial.canvas], ['coronal', views.coronal.canvas], ['sagittal', views.sagittal.canvas]];
      if (st.curved && st.curve.length >= 2) targets.push(['curved', q('mprCurveCanvas')]);
      for (const [axis, canvas] of targets) {
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
        const bytes = new Uint8Array(await blob.arrayBuffer());
        await Pl.saveFile({ name: `${payload.name || 'volume'}_${axis}.png`, bytes, mime: 'image/png', filters: [{ name: 'PNG', extensions: ['png'] }] });
      }
    });
    window.addEventListener('resize', () => drawAll());
    build();
  }

  /* ── Progress (long operations): bar + percentage, optional cancel ── */
  function progress(box, payload, ctx) {
    box.classList.add('progress-dialog');
    box.innerHTML = `<h2 id="pgTitle"></h2><div class="progress show"><div class="bar" id="pgBar"></div><span id="pgText"></span></div><div class="pg-detail" id="pgDetail"></div>`;
    const q = (id) => box.querySelector('#' + id);
    const apply = (p) => {
      if (p.title) q('pgTitle').textContent = p.title;
      const total = p.total || 0, done = p.done || 0;
      const pct = total ? Math.round(done / total * 100) : (p.percent != null ? Math.round(p.percent) : null);
      q('pgBar').style.width = `${pct == null ? 0 : pct}%`;
      q('pgBar').classList.toggle('indeterminate', pct == null && !total);   // no known total: a moving bar
      q('pgText').textContent = pct == null ? (total ? `${done} / ${total}` : '') : `${pct}%${total ? `  (${done} / ${total})` : ''}`;
      q('pgDetail').textContent = p.text || '';
    };
    apply(payload);
    const cancel = btn(t('dlg.cancel'), '', () => { ctx.send('cancel'); cancel.disabled = true; });
    const a = actions(box, cancel);
    if (payload.cancellable === false) a.style.display = 'none';
    ctx.onMessage((event, data) => {
      if (event === 'update') apply(data || {});
      if (event === 'finish') ctx.close();
    });
    ctx.send('ready');
  }

  /* ── Print / PDF document: one page layout (title, details, notes, the image), a live preview and the
   * output settings. mode 'print' prints it (desktop: straight to the chosen printer), mode 'pdf' saves it.
   * payload: { dataUrl, name, mode, sections: [{ id, title, rows: [[label, value]] }], layout (last used settings) } ── */
  const PAPER_MM = { A4: [210, 297], Letter: [215.9, 279.4], A3: [297, 420], A5: [148, 210], B5: [182, 257], Legal: [215.9, 355.6] };
  const MARGIN_MM = { narrow: 6, normal: 12, wide: 20 };
  const DOC_DEFAULTS = {
    title: '', subtitle: '', author: '', notes: '', keywords: '',
    include: { patient: true, study: true, image: true, measure: true }, showDate: true, footer: true,
    landscape: false, paper: 'A4', margin: 'normal', columns: 2,
    imageSize: 100, imageAlign: 'top', imageBorder: false, grayscale: false,
    dpi: 200, copies: 1, printer: '', duplex: '',
  };
  /** The settings a document starts with: defaults ← last used (payload.layout) ← this call; the title is the file name. */
  function docOptions(payload, o) {
    const d = { ...DOC_DEFAULTS, ...(payload.layout || {}), ...(o || {}) };
    d.include = { ...DOC_DEFAULTS.include, ...((payload.layout || {}).include || {}), ...((o || {}).include || {}) };
    if (o == null || o.title == null) d.title = payload.name || '';
    return d;
  }
  /** Sections of the payload (older callers send one flat `info` list). */
  const docSections = (payload) => payload.sections || (payload.info && payload.info.length ? [{ id: 'info', title: '', rows: payload.info }] : []);

  /** The page drawn on a canvas at o.dpi: what goes to the printer, into the PDF and into the browser's print. */
  async function printPageCanvas(payload, opts) {
    const o = docOptions(payload, opts);
    const DPI = +o.dpi || 200, mm = (v) => Math.round(v / 25.4 * DPI), pt = (v) => v * DPI / 72;
    let [w, h] = PAPER_MM[o.paper] || PAPER_MM.A4;
    if (o.landscape) [w, h] = [h, w];
    const c = document.createElement('canvas');
    c.width = mm(w); c.height = mm(h);
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    const m = mm(MARGIN_MM[o.margin] || MARGIN_MM.normal), left = m, right = c.width - m, width = right - left;
    const FONT = '"Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", system-ui, sans-serif';
    const font = (size, weight = 400) => { x.font = `${weight} ${pt(size)}px ${FONT}`; };
    const fit = (s, max) => { s = String(s); if (x.measureText(s).width <= max) return s; while (s && x.measureText(s + '…').width > max) s = s.slice(0, -1); return s + '…'; };
    const wrap = (text, max) => {
      const lines = [];
      for (const para of String(text).split(/\r?\n/)) {
        let line = '';
        for (const word of para.split(/(\s+)/)) {
          if (x.measureText(line + word).width <= max || !line.trim()) { line += word; continue; }
          lines.push(line.trimEnd()); line = word.trimStart();
        }
        // a single word wider than the line: cut it by characters
        while (x.measureText(line).width > max) { let k = line.length; while (k > 1 && x.measureText(line.slice(0, k)).width > max) k--; lines.push(line.slice(0, k)); line = line.slice(k); }
        lines.push(line);
      }
      return lines;
    };
    x.textBaseline = 'top';
    let y = m;
    // title block: title and subtitle on the left, author and date on the right, a rule below
    const date = new Date().toLocaleString();
    const side = [o.author, o.showDate ? date : ''].filter(Boolean);
    if (o.title || o.subtitle || side.length) {
      font(9);
      const sideW = side.length ? Math.max(...side.map((s) => x.measureText(s).width)) + pt(12) : 0;
      const top = y;
      x.textAlign = 'right'; x.fillStyle = '#555';
      side.forEach((s, i) => x.fillText(fit(s, width / 2), right, top + i * pt(9) * 1.4));
      x.textAlign = 'left';
      if (o.title) { font(17, 700); x.fillStyle = '#000'; for (const line of wrap(o.title, width - sideW).slice(0, 2)) { x.fillText(line, left, y); y += pt(17) * 1.3; } }
      if (o.subtitle) { font(11); x.fillStyle = '#444'; for (const line of wrap(o.subtitle, width - sideW).slice(0, 2)) { x.fillText(line, left, y); y += pt(11) * 1.4; } }
      y = Math.max(y, top + side.length * pt(9) * 1.4) + pt(4);
      x.fillStyle = '#000'; x.fillRect(left, y, width, Math.max(1, pt(0.8))); y += pt(8);
    }
    // the details, section by section, in one or two columns of label / value
    const cols = o.columns === 1 || o.columns === '1' ? 1 : 2, gap = pt(14), colW = (width - gap * (cols - 1)) / cols;
    for (const sec of docSections(payload)) {
      if (o.include[sec.id] === false || !sec.rows || !sec.rows.length) continue;
      if (sec.title) { font(10, 700); x.fillStyle = '#1f4e79'; x.fillText(sec.title, left, y); y += pt(10) * 1.45; }
      font(9, 600);
      const kw = Math.min(colW * 0.45, Math.max(0, ...sec.rows.map(([k]) => x.measureText(k).width)) + pt(8));
      const rows = Math.ceil(sec.rows.length / cols);
      sec.rows.forEach(([k, v], i) => {
        const col = Math.floor(i / rows), cx = left + col * (colW + gap), cy = y + (i % rows) * pt(9) * 1.4;
        font(9, 600); x.fillStyle = '#555'; x.fillText(fit(k, kw - pt(6)), cx, cy);
        font(9); x.fillStyle = '#000'; x.fillText(fit(v, colW - kw), cx + kw, cy);
      });
      y += rows * pt(9) * 1.4 + pt(6);
    }
    if (o.notes && o.notes.trim()) {
      font(10, 700); x.fillStyle = '#1f4e79'; x.fillText(t('report.notes'), left, y); y += pt(10) * 1.45;
      font(9.5); x.fillStyle = '#000';
      for (const line of wrap(o.notes.trim(), width).slice(0, 14)) { x.fillText(line, left, y); y += pt(9.5) * 1.4; }
      y += pt(6);
    }
    // the image in what is left above the footer
    const footH = o.footer ? pt(9) * 2 : 0;
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = payload.dataUrl; });
    const aw = width, ah = Math.max(pt(40), c.height - m - footH - y);
    const s = Math.min(aw / img.naturalWidth, ah / img.naturalHeight) * Math.max(10, Math.min(100, +o.imageSize || 100)) / 100;
    const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
    const ix = left + (aw - iw) / 2, iy = o.imageAlign === 'center' ? y + (ah - ih) / 2 : y;
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, ix, iy, iw, ih);
    if (o.imageBorder) { x.strokeStyle = '#000'; x.lineWidth = Math.max(1, pt(0.6)); x.strokeRect(ix, iy, iw, ih); }
    if (o.footer) {
      font(8); x.fillStyle = '#666';
      const fy = c.height - m - pt(8);
      x.fillRect(left, fy - pt(5), width, Math.max(1, pt(0.4)));
      x.textAlign = 'left'; x.fillText(fit(`MyDCMViewer · ${payload.name || ''}`, width * 0.65), left, fy);
      x.textAlign = 'right'; x.fillText(date, right, fy);
      x.textAlign = 'left';
    }
    if (o.grayscale) {
      const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
      for (let i = 0; i < p.length; i += 4) { const g = Math.round(p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114); p[i] = p[i + 1] = p[i + 2] = g; }
      x.putImageData(d, 0, 0);
    }
    return c;
  }
  /** The same page for the browser's / webview's print dialog: one picture filling one sheet. */
  async function printHtml(payload, opts) {
    const o = docOptions(payload, opts);
    const page = await printPageCanvas(payload, o);
    const css = { A4: 'A4', Letter: 'letter', A3: 'A3', A5: 'A5', B5: 'B5', Legal: 'legal' }[o.paper] || 'A4';
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(o.title || payload.name || '')}</title>
<style>@page{size:${css} ${o.landscape ? 'landscape' : 'portrait'};margin:0}html,body{margin:0;padding:0;background:#fff}img{display:block;width:100vw;height:100vh;object-fit:contain}</style></head>
<body><img src="${page.toDataURL('image/jpeg', 0.92)}"></body></html>`;
  }

  function print(box, payload, ctx) {
    const pdf = payload.mode === 'pdf';
    const o0 = docOptions(payload);
    box.classList.add('print');
    const sel = (id, list, value) => `<select id="${id}">${list.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const check = (id, label, on, extra = '') => `<label><input type="checkbox" id="${id}"${on ? ' checked' : ''}><span>${esc(label)}${extra}</span></label>`;
    const row = (label, ctl, cls = '') => `<div class="form-row${cls ? ' ' + cls : ''}"><label>${esc(label)}</label>${ctl}</div>`;
    const sections = docSections(payload);
    box.innerHTML = `<h2>${esc(t(pdf ? 'report.pdfTitle' : 'print.title'))} <span class="mpr-sub">${esc(payload.name || '')}</span></h2>
      <div class="print-layout">
        <div class="print-preview"><img id="prPage" alt=""><span class="print-paper" id="prPaperLabel"></span></div>
        <div class="print-options">
          <fieldset><legend>${esc(t('report.document'))}</legend>
            ${row(t('report.titleField'), `<input type="text" id="prTitle" value="${esc(o0.title)}">`)}
            ${row(t('report.subtitle'), `<input type="text" id="prSubtitle" value="${esc(o0.subtitle)}" placeholder="${esc(t('report.subtitleHint'))}">`)}
            ${row(t('report.author'), `<input type="text" id="prAuthor" value="${esc(o0.author)}">`)}
            ${pdf ? row(t('report.keywords'), `<input type="text" id="prKeywords" value="${esc(o0.keywords)}" placeholder="${esc(t('report.keywordsHint'))}">`) : ''}
            ${row(t('report.notes'), `<textarea id="prNotes" rows="3" placeholder="${esc(t('report.notesHint'))}">${esc(o0.notes)}</textarea>`)}
          </fieldset>
          <fieldset><legend>${esc(t('report.include'))}</legend><div class="row checks">
            ${sections.map((s) => check(`prInc-${s.id}`, s.title || t('print.header'), o0.include[s.id] !== false, ` <small>(${s.rows.length})</small>`)).join('')}
            ${check('prDate', t('report.showDate'), o0.showDate)}
            ${check('prFooter', t('print.footer'), o0.footer)}
          </div></fieldset>
          <fieldset><legend>${esc(t('report.page'))}</legend>
            ${row(t('print.orientation'), `<div class="row radios"><label><input type="radio" name="prOri" value="portrait"${o0.landscape ? '' : ' checked'}>${esc(t('print.portrait'))}</label><label><input type="radio" name="prOri" value="landscape"${o0.landscape ? ' checked' : ''}>${esc(t('print.landscape'))}</label></div>`)}
            ${row(t('print.paper'), sel('prPaper', Object.keys(PAPER_MM).map((k) => [k, `${k} (${PAPER_MM[k][0]} × ${PAPER_MM[k][1]} mm)`]), o0.paper))}
            ${row(t('report.margin'), sel('prMargin', Object.keys(MARGIN_MM).map((k) => [k, `${t('report.margin.' + k)} (${MARGIN_MM[k]} mm)`]), o0.margin))}
            ${row(t('report.columns'), sel('prColumns', [[1, t('report.columns1')], [2, t('report.columns2')]], o0.columns))}
          </fieldset>
          <fieldset><legend>${esc(t('report.image'))}</legend>
            ${row(t('report.imageSize'), sel('prImageSize', [100, 90, 75, 50].map((v) => [v, v === 100 ? t('print.fit') : `${v}%`]), o0.imageSize))}
            ${row(t('report.imageAlign'), sel('prImageAlign', [['top', t('report.alignTop')], ['center', t('report.alignCenter')]], o0.imageAlign))}
            <div class="row checks">${check('prBorder', t('report.imageBorder'), o0.imageBorder)}${check('prGray', t('report.grayscale'), o0.grayscale)}</div>
          </fieldset>
          <fieldset><legend>${esc(t('report.output'))}</legend>
            ${row(t('report.dpi'), sel('prDpi', [[150, `150 dpi — ${t('report.dpiSmall')}`], [200, '200 dpi'], [300, `300 dpi — ${t('report.dpiFine')}`]], o0.dpi))}
            ${pdf ? '' : `${row(t('print.printer'), `<select id="prPrinter"><option value="">${esc(t('print.defaultPrinter'))}</option></select>`, 'desktop-row')}
            ${row(t('print.copies'), `<input id="prCopies" type="number" min="1" max="99" value="${+o0.copies || 1}">`)}
            ${row(t('report.duplex'), sel('prDuplex', [['', t('report.duplexPrinter')], ['off', t('report.duplexOff')], ['long', t('report.duplexLong')], ['short', t('report.duplexShort')]], o0.duplex), 'desktop-row')}`}
          </fieldset>
          <p class="hint">${esc(t(pdf ? 'report.pdfHint' : 'print.hint'))}</p>
        </div>
      </div>`;
    const q = (id) => box.querySelector('#' + id);
    const val = (id, d = '') => (q(id) ? q(id).value : d);
    const opts = () => {
      const include = {};
      for (const s of sections) include[s.id] = q(`prInc-${s.id}`).checked;
      return {
        title: val('prTitle').trim(), subtitle: val('prSubtitle').trim(), author: val('prAuthor').trim(), notes: val('prNotes'), keywords: val('prKeywords').trim(),
        include, showDate: q('prDate').checked, footer: q('prFooter').checked,
        landscape: box.querySelector('input[name=prOri]:checked').value === 'landscape', paper: val('prPaper'), margin: val('prMargin'), columns: +val('prColumns', 2),
        imageSize: +val('prImageSize', 100), imageAlign: val('prImageAlign'), imageBorder: q('prBorder').checked, grayscale: q('prGray').checked,
        dpi: +val('prDpi', 200), copies: Math.max(1, Math.min(99, +val('prCopies', 1) || 1)), printer: val('prPrinter'), duplex: val('prDuplex'),
      };
    };
    // the preview is the real page drawn small; typing waits a moment before it is drawn again
    let token = 0, timer = 0;
    const refresh = async () => {
      if (!q('prPage')) return;   // the dialog was closed while a redraw was waiting
      const my = ++token, o = opts();
      const page = await printPageCanvas(payload, { ...o, dpi: 72 });
      if (my !== token || !q('prPage')) return;
      q('prPage').src = page.toDataURL('image/png');
      box.querySelector('.print-preview').classList.toggle('landscape', o.landscape);
      q('prPaperLabel').textContent = `${o.paper} · ${t(o.landscape ? 'print.landscape' : 'print.portrait')}`;
    };
    box.querySelectorAll('input, select, textarea').forEach((e) => {
      e.addEventListener('change', refresh);
      if (e.type === 'text' || e.tagName === 'TEXTAREA') e.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(refresh, 250); });
    });
    refresh();
    // what is kept for the next document (not its words)
    const layout = (o) => { const { title, subtitle, notes, keywords, ...rest } = o; void title; void subtitle; void notes; void keywords; return rest; };
    const desktop = P().isDesktop;
    box.querySelectorAll('.desktop-row').forEach((r) => { r.style.display = desktop ? '' : 'none'; });
    if (pdf) {
      const save = btn(t('report.savePdf'), 'primary', () => { const o = opts(); ctx.send('save', { options: o, layout: layout(o) }); ctx.close(); });
      actions(box, btn(t('dlg.cancel'), '', ctx.close), save);
      return;
    }
    if (desktop) {
      P().listPrinters().then((list) => {
        const s = q('prPrinter');
        for (const name of (list && list.printers) || []) { const op = el('option', '', esc(name + (name === list.default ? ` (${t('print.default')})` : ''))); op.value = name; s.append(op); }
        if (o0.printer && [...s.options].some((op) => op.value === o0.printer)) s.value = o0.printer;
      }).catch(() => {});
    }
    const now = btn(t('print.now'), 'primary', async () => {
      const o = opts();
      now.disabled = true;
      try {
        if (!desktop) { await P().print(await printHtml(payload, o), { silent: false, ...o }); ctx.send('printed', { ok: true, system: true, layout: layout(o) }); ctx.close(); return; }
        const page = await printPageCanvas(payload, o);
        const blob = await new Promise((r) => page.toBlob(r, 'image/jpeg', 0.92));
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const r = await P().print('', { silent: true, pages: [bytes], printer: o.printer, copies: o.copies, landscape: o.landscape, paper: o.paper, duplex: o.duplex, color: !o.grayscale, title: o.title || payload.name || 'MyDCMViewer' });
        ctx.send('printed', { ...r, printer: o.printer, layout: layout(o) });
        if (r.ok || r.reason === 'cancelled') ctx.close();
      } finally { now.disabled = false; }
    });
    actions(box,
      btn(t('dlg.cancel'), '', ctx.close),
      btn(t('print.system'), '', async () => { const o = opts(); await P().print(await printHtml(payload, o), { silent: false, ...o }); ctx.send('printed', { ok: true, system: true, layout: layout(o) }); }),
      now);
  }

  /* ── Tag editor: change, add or remove elements and save a new DICOM file (dicomWriter.js) ── */
  function tageditor(box, payload, ctx) {
    box.classList.add('tageditor');
    const W = window.DicomWriter;
    let model = null, rows = [], filter = '', dirty = new Map(), removed = new Set();
    box.innerHTML = `<h2>${esc(t('tagedit.title'))} <span class="mpr-sub">${esc(payload.name || '')}</span></h2>
      <div class="tagedit-bar"><input type="search" id="teSearch" placeholder="${esc(t('sidebar.search'))}"><span class="spacer"></span><span class="hint" id="teCount"></span></div>
      <div class="tagedit-list" id="teList"><div class="hint">${esc(t('status.loading'))}</div></div>
      <div class="tagedit-add"><input id="teTag" placeholder="(0010,0010)" size="12"><input id="teVr" placeholder="VR" size="3"><input id="teValue" placeholder="${esc(t('tagedit.value'))}"><button type="button" class="btn" id="teAdd">${esc(t('tagedit.add'))}</button></div>
      <label class="tagedit-open"><input type="checkbox" id="teOpen" checked><span>${esc(t('tagedit.openAfter'))}</span></label>`;
    const q = (id) => box.querySelector('#' + id);
    const list = q('teList');
    function draw() {
      const f = filter.toLowerCase();
      const shown = rows.filter((r) => !f || `${r.label} ${r.name} ${r.vr} ${r.value}`.toLowerCase().includes(f));
      q('teCount').textContent = t('tags.count', { n: shown.length });
      list.innerHTML = shown.slice(0, 1500).map((r) => {
        const val = dirty.has(r.tag) ? dirty.get(r.tag) : r.value;
        const gone = removed.has(r.tag);
        return `<div class="tagedit-row${gone ? ' removed' : ''}${dirty.has(r.tag) ? ' changed' : ''}" data-tag="${esc(r.tag)}" style="padding-left:${6 + (r.depth || 0) * 14}px">
          <span class="tag-id">${esc(r.label)}</span><span class="tag-name">${esc(r.name)}</span><span class="tag-vr">${esc(r.vr)}</span>
          ${r.editable ? `<input class="tag-input" value="${esc(val)}"${gone ? ' disabled' : ''}>` : `<span class="tag-value">${esc(r.value)}</span>`}
          ${r.editable || r.depth === 0 ? `<button type="button" class="icon-btn tag-del" title="${esc(t(gone ? 'tagedit.restore' : 'tagedit.remove'))}">${gone ? '↺' : '×'}</button>` : '<span></span>'}
        </div>`;
      }).join('');
    }
    list.addEventListener('input', (e) => {
      const row = e.target.closest('.tagedit-row');
      if (!row || !e.target.classList.contains('tag-input')) return;
      dirty.set(row.dataset.tag, e.target.value);
      row.classList.add('changed');
    });
    list.addEventListener('click', (e) => {
      const b = e.target.closest('.tag-del');
      if (!b) return;
      const tag = b.closest('.tagedit-row').dataset.tag;
      if (removed.has(tag)) removed.delete(tag); else removed.add(tag);
      draw();
    });
    q('teSearch').addEventListener('input', (e) => { filter = e.target.value.trim(); draw(); });
    q('teAdd').addEventListener('click', () => {
      const tag = q('teTag').value.replace(/[^0-9a-f]/gi, '').toUpperCase();
      if (!/^[0-9A-F]{8}$/.test(tag)) { q('teTag').focus(); return; }
      try {
        W.set(model, tag, q('teValue').value, q('teVr').value.trim().toUpperCase() || undefined);
        rows = W.editableTags(model);
        q('teTag').value = q('teVr').value = q('teValue').value = '';
        draw();
      } catch (err) { ctx.send('error', { message: String(err && err.message || err) }); }
    });
    async function save() {
      try {
        for (const [tag, value] of dirty) if (!removed.has(tag)) W.set(model, tag, value);
        for (const tag of removed) W.remove(model, tag);
        const bytes = W.write(model);
        const base = String(payload.name || 'edited').replace(/\.[^.]+$/, '');
        const saved = await P().saveFile({ name: `${base}_edited.dcm`, bytes, mime: 'application/dicom', filters: [{ name: 'DICOM', extensions: ['dcm'] }] });
        if (saved) { ctx.send('saved', { path: saved, open: q('teOpen').checked }); ctx.close(); }
      } catch (err) { list.insertAdjacentHTML('afterbegin', `<div class="doc-error">${esc(err && err.message || err)}</div>`); }
    }
    actions(box, btn(t('dlg.cancel'), '', ctx.close), btn(t('tagedit.save'), 'primary', save));
    (async () => {
      try {
        model = W.parse(new Uint8Array(await P().readFile(payload.path)));
        rows = W.editableTags(model);
        draw();
      } catch (err) { list.innerHTML = `<div class="doc-error">${esc(err && err.message || err)}</div>`; }
    })();
  }

  /* ── Fusion: lay another open DICOM image over this one in a colour map ── */
  function fusion(box, payload, ctx) {
    box.classList.add('fusion');
    const cur = payload.current || {};
    box.innerHTML = `<h2>${esc(t('fusion.title'))}</h2><p class="hint">${esc(t('fusion.hint'))}</p>
      <div class="form-row"><label>${esc(t('fusion.overlay'))}</label><select id="fuTab"><option value="">${esc(t('fusion.off'))}</option>${(payload.tabs || []).map((x) => `<option value="${x.id}"${x.id === cur.tabId ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
      <div class="form-row"><label>${esc(t('wl.colormap'))}</label><select id="fuCm">${(payload.colormaps || []).map((c) => `<option value="${c.id}"${c.id === (cur.colormap || 'hotiron') ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div>
      <div class="form-row"><label>${esc(t('fusion.opacity'))}</label><input id="fuOp" type="range" min="0" max="100" value="${Math.round((cur.opacity == null ? 0.5 : cur.opacity) * 100)}"><span id="fuOpV"></span></div>
      <div class="form-row"><label>${esc(t('fusion.threshold'))}</label><input id="fuTh" type="range" min="0" max="90" value="${Math.round((cur.threshold == null ? 0.05 : cur.threshold) * 100)}"><span id="fuThV"></span></div>
      <p class="hint" id="fuInfo"></p>`;
    const q = (id) => box.querySelector('#' + id);
    const send = () => {
      q('fuOpV').textContent = `${q('fuOp').value}%`; q('fuThV').textContent = `${q('fuTh').value}%`;
      ctx.send('set', { tabId: +q('fuTab').value || 0, colormap: q('fuCm').value, opacity: +q('fuOp').value / 100, threshold: +q('fuTh').value / 100 });
    };
    box.querySelectorAll('select, input').forEach((e) => e.addEventListener('input', send));
    ctx.onMessage((event, data) => { if (event === 'info') q('fuInfo').textContent = data || ''; });
    q('fuOpV').textContent = `${q('fuOp').value}%`; q('fuThV').textContent = `${q('fuTh').value}%`;
    actions(box, btn(t('dlg.close'), 'primary', ctx.close));
  }

  /* ── Image filters: a chain of ImageFilters steps applied while rendering (grey: on values before windowing) ── */
  function filters(box, payload, ctx) {
    box.classList.add('filters');
    const F = window.ImageFilters;
    const list = (F && F.FILTERS) || [];
    let chain = (payload.filters || []).map((x) => ({ name: x.name, params: { ...(x.params || {}) } }));
    const label = (id, fallback) => { const k = t(id); return k === id ? fallback : k; };
    box.innerHTML = `<h2>${esc(t('filter.title'))}</h2><p class='hint'>${esc(t('filter.hint'))}</p><div class='filter-chain' id='fiChain'></div>
      <div class='form-row'><button type='button' class='btn' id='fiAdd'>${esc(t('filter.add'))}</button><button type='button' class='btn' id='fiReset'>${esc(t('filter.none'))}</button></div>`;
    const host = box.querySelector('#fiChain');
    let timer = null;
    const send = () => { clearTimeout(timer); timer = setTimeout(() => ctx.send('set', { filters: chain }), 120); };
    const draw = () => {
      host.innerHTML = '';
      if (!chain.length) host.append(el('p', 'hint', esc(t('filter.empty'))));
      chain.forEach((step, i) => {
        const spec = list.find((x) => x.id === step.name) || list[0];
        const row = el('div', 'form-row filter-step');
        const sel = el('select');
        sel.innerHTML = list.map((x) => `<option value='${x.id}'${x.id === step.name ? ' selected' : ''}>${esc(label(`filter.${x.id}`, x.label))}</option>`).join('');
        sel.addEventListener('change', () => { chain[i] = { name: sel.value, params: F.defaults(sel.value) }; draw(); send(); });
        row.append(el('span', 'filter-n', String(i + 1)), sel);
        for (const p of spec.params) {
          const lab = el('label', 'filter-param', esc(label(`filter.p.${p.name}`, p.label)));
          let input;
          if (p.type === 'select') {
            input = el('select');
            input.innerHTML = p.options.map((o) => `<option value='${o}'${+o === +step.params[p.name] ? ' selected' : ''}>${o}</option>`).join('');
          } else {
            input = el('input'); input.type = 'number';
            if (p.min != null) input.min = p.min; if (p.max != null) input.max = p.max; if (p.step != null) input.step = p.step;
            const v = step.params[p.name];
            input.value = v == null ? '' : v;
            if (v == null) input.placeholder = t('filter.auto');
          }
          input.addEventListener('input', () => { const v = input.value === '' ? null : +input.value; if (v === null || Number.isFinite(v)) { step.params[p.name] = v; send(); } });
          lab.append(input);
          row.append(lab);
        }
        const up = btn('↑', '', () => { if (i > 0) { [chain[i - 1], chain[i]] = [chain[i], chain[i - 1]]; draw(); send(); } });
        up.title = t('filter.up'); up.disabled = i === 0;
        const rm = btn('✕', '', () => { chain.splice(i, 1); draw(); send(); });
        rm.title = t('filter.remove');
        row.append(up, rm);
        host.append(row);
      });
      if (ctx.resize) ctx.resize();
    };
    box.querySelector('#fiAdd').addEventListener('click', () => { const id = (list[0] || {}).id; if (!id) return; chain.push({ name: id, params: F.defaults(id) }); draw(); send(); });
    box.querySelector('#fiReset').addEventListener('click', () => { chain = []; draw(); send(); });
    draw();
    actions(box, btn(t('dlg.close'), 'primary', ctx.close));
  }

  /* ── Export as: every format ImageExport writes, grouped, with its options ── */
  function exportas(box, payload, ctx) {
    box.classList.add('exportas');
    const formats = payload.formats || [];
    const label = (k, fb) => { const v = t(k); return v === k ? fb : v; };
    const groups = ['common', 'pro', 'hdr', 'medical', 'scientific', 'vector', 'icon', 'legacy'];
    box.innerHTML = `<h2>${esc(t('exp.title'))}</h2><p class="hint">${esc(t('exp.hint'))}</p>
      <div class="form-row"><label>${esc(t('exp.format'))}</label><select id="exFmt">${groups.map((g) => {
        const list = formats.filter((f) => f.group === g);
        return list.length ? `<optgroup label="${esc(label('exp.group.' + g, g))}">${list.map((f) => `<option value="${f.id}"${f.available ? '' : ' disabled'}>${esc(f.label)} (.${esc(f.ext)})${f.available ? '' : ' — ' + esc(t('exp.notHere'))}</option>`).join('')}</optgroup>` : '';
      }).join('')}</select></div>
      <p class="hint" id="exNotes"></p>
      <div id="exOpts" class="export-options"></div>
      <div class="form-row" id="exScopeRow" hidden><label>${esc(t('exp.scope'))}</label><select id="exScope"><option value="all">${esc(t('exp.scopeAll', { n: payload.frames }))}</option><option value="frame">${esc(t('exp.scopeFrame'))}</option></select></div>`;
    const q = (id) => box.querySelector('#' + id);
    const sel = q('exFmt');
    const first = formats.find((f) => f.id === payload.last && f.available) || formats.find((f) => f.available);
    if (first) sel.value = first.id;
    const draw = () => {
      const f = formats.find((x) => x.id === sel.value);
      if (!f) return;
      q('exNotes').textContent = f.notes || '';
      q('exScopeRow').hidden = !(f.kinds.includes('frames') && payload.frames > 1);
      const host = q('exOpts');
      host.innerHTML = '';
      for (const o of f.options) {
        const row = el('div', 'form-row');
        row.append(el('label', '', esc(label('exp.opt.' + o.key, o.key))));
        let input;
        if (o.type === 'bool') { input = el('input'); input.type = 'checkbox'; input.checked = !!o.default; }
        else if (o.type === 'select') { input = el('select'); input.innerHTML = (o.choices || []).map((c) => `<option value="${esc(c)}"${String(c) === String(o.default) ? ' selected' : ''}>${esc(label('exp.val.' + c, c))}</option>`).join(''); }
        else if (o.type === 'text') { input = el('input'); input.type = 'text'; input.value = o.default || ''; const hint = label('exp.hint.' + o.key, ''); if (hint) input.placeholder = hint; }
        else { input = el('input'); input.type = 'number'; input.value = o.default; if (o.type === 'quality') { input.min = 0; input.max = 100; } if (o.min != null) input.min = o.min; if (o.max != null) input.max = o.max; }
        input.dataset.key = o.key; input.dataset.type = o.type;
        row.append(input);
        host.append(row);
      }
      if (ctx.resize) ctx.resize();
    };
    sel.addEventListener('change', draw);
    draw();
    const go = () => {
      const options = {};
      box.querySelectorAll('#exOpts [data-key]').forEach((i) => { options[i.dataset.key] = i.dataset.type === 'bool' ? i.checked : i.dataset.type === 'select' || i.dataset.type === 'text' ? i.value.trim() : +i.value; });
      ctx.send('export', { id: sel.value, options, scope: q('exScopeRow').hidden ? 'frame' : q('exScope').value });
      ctx.close();
    };
    actions(box, btn(t('dlg.cancel'), '', ctx.close), btn(t('exp.export'), 'primary', go));
  }

  const EXTRA = {}, EXTRA_SIZES = {};
  // Dialogs in modules of their own, looked up when first used (the page may load them after this file).
  const LAZY = { volume: () => window.Volume3D, pacs: () => window.PacsUI, help: () => window.HelpUI };
  const lazy = (kind) => { const m = LAZY[kind] && LAZY[kind](); return m && m.dialog; };
  const RENDERERS = { exportas, filters, fusion, tageditor, about, shortcuts, error, prompt, settings, batch, anonymize, mpr, progress, print };
  return {
    render(kind, box, payload, ctx) { const r = RENDERERS[kind] || EXTRA[kind] || lazy(kind); if (!r) throw new Error(`Unknown dialog ${kind}`); box.dataset.kind = kind; r(box, payload || {}, ctx); },
    size(kind) { const m = LAZY[kind] && LAZY[kind](); return SIZES[kind] || EXTRA_SIZES[kind] || (m && m.SIZE) || { width: 520 }; },
    kinds: () => [...Object.keys(RENDERERS), ...Object.keys(EXTRA), ...Object.keys(LAZY)],
    /** Dialogs that live in their own modules (volume3d.js, the PACS window): Dialogs.register('volume', fn, { width }). */
    register(kind, fn, size) { EXTRA[kind] = fn; if (size) EXTRA_SIZES[kind] = size; },
    PHI_TAGS,
    printPageCanvas, printHtml, docOptions,
  };
})();
