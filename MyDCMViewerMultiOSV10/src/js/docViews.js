/* Document views — DICOM files that are not pictures, shown in place of the image:
 * structured reports (SR), waveforms (ECG and others), encapsulated PDF / CDA / STL,
 * RT structure sets and RT plans, DICOMDIR. The readers are in dicomDocs.js.
 *
 *   DocViews.render(host, bytes, ctx)   ctx: { kind, name, stem, t, fmt, esc, toast, save({ name, bytes, mime, filters }), openDicomdir? }
 *   DocViews.drawWaveform(canvas, group, { speed, gain, cols })   (pure canvas drawing, also used by the tests)
 */
window.DocViews = (function () {
  const DD = () => window.DicomDocs;

  function head(ctx, title, sub, buttons) {
    const { esc } = ctx;
    return `<div class="doc-head"><h2>${esc(title)}</h2><span class="doc-meta">${esc(sub || '')}</span><span class="spacer"></span>${buttons.map(([id, label]) => `<button type="button" class="btn" data-doc="${id}">${esc(label)}</button>`).join('')}</div>`;
  }
  const enc = (s) => new TextEncoder().encode(s);
  const common = (d) => [d.patientName, d.patientId, d.modality, d.studyDate].filter(Boolean).join(' · ');
  function table(ctx, rows, headers) {
    const { esc } = ctx;
    return `<table class="doc-table">${headers ? `<tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>` : ''}${rows.map((r) => `<tr>${r.map((c, i) => (!headers && i === 0 ? `<th>${esc(c)}</th>` : `<td>${c && c.html ? c.html : esc(c == null ? '' : c)}</td>`)).join('')}</tr>`).join('')}</table>`;
  }
  const n = (v, d = 1) => (Number.isFinite(+v) && v !== '' && v != null ? String(+(+v).toFixed(d)) : (v == null ? '' : String(v)));

  async function render(host, bytes, ctx) {
    const kind = ctx.kind && ctx.kind !== 'other' ? ctx.kind : DD().kindOf(bytes);
    const fn = { video, sr: sr, waveform, pdf: encapsulated, cda: encapsulated, stl: encapsulated, rtstruct, rtplan, dicomdir }[kind];
    if (!fn) {
      host.innerHTML = head(ctx, ctx.name, ctx.t('doc.other'), []) + `<p class="doc-meta">${ctx.esc(ctx.t('msg.noPixelData'))}</p>`;
      return kind;
    }
    await fn(host, bytes, ctx);
    host.dataset.kind = kind;
    return kind;
  }

  /* ── DICOM video the browser engine cannot play: what it is, and the stream to save for a video player ── */
  function video(host, bytes, ctx) {
    const { t, esc } = ctx;
    const v = ctx.video || {};
    const why = v.codec === 'mpeg2' ? t('video.noMpeg2') : t('video.noCodec', { codec: (v.codec || '').toUpperCase() });
    host.innerHTML = head(ctx, ctx.name, t('video.title'), [['extract', t('video.extract')]])
      + table(ctx, [[t('video.codec'), (v.codec || '').toUpperCase()], [t('video.ts'), v.transferSyntaxName || ''], [t('video.size'), `${v.width} × ${v.height}`],
        [t('video.frames'), String(v.frames || '')], [t('video.fps'), v.fps ? (+v.fps.toFixed(2)).toString() : ''], [t('video.duration'), v.fps ? `${(v.frames / v.fps).toFixed(1)} s` : '']])
      + `<p class="doc-note">${esc(why)}</p>`;
    host.querySelector('[data-doc="extract"]').addEventListener('click', () => ctx.extractVideo && ctx.extractVideo());
  }

  /* ── Structured report ── */
  function sr(host, bytes, ctx) {
    const { t } = ctx;
    const doc = DD().readSR(bytes);
    const flags = [doc.completion, doc.verification].filter(Boolean).join(' · ');
    host.innerHTML = head(ctx, doc.title || t('doc.sr'), [common(doc), flags].filter(Boolean).join(' · '), [['html', t('doc.saveHtml')], ['txt', t('doc.saveText')]])
      + (doc.observers && doc.observers.length ? table(ctx, doc.observers.map((o) => [t('doc.observer'), [o.name, o.organization, o.dateTime].filter(Boolean).join(' · ')])) : '')
      + `<div class="doc-tree">${DD().srToHtml(doc)}</div>`;
    host.querySelector('[data-doc="html"]').onclick = () => ctx.save({ name: `${ctx.stem}_report.html`, bytes: enc(`<!DOCTYPE html><meta charset="utf-8"><title>${ctx.esc(doc.title || '')}</title>${DD().srToHtml(doc)}`), mime: 'text/html', filters: [{ name: 'HTML', extensions: ['html'] }] });
    host.querySelector('[data-doc="txt"]').onclick = () => ctx.save({ name: `${ctx.stem}_report.txt`, bytes: enc(DD().srToText(doc)), mime: 'text/plain', filters: [{ name: 'Text', extensions: ['txt'] }] });
  }

  /* ── Waveform (ECG paper: 25 mm/s, 10 mm/mV by default) ── */
  function drawWaveform(canvas, group, { speed = 25, gain = 10, cols = 1, pxPerMm = 4, dark = false } = {}) {
    const chans = group.channels || [];
    const fs = group.samplingFrequency || 500;
    const seconds = group.nSamples / fs;
    const rows = Math.ceil(chans.length / cols);
    const rowMm = 25, labelMm = 14;
    const colMm = Math.min(seconds * speed, cols > 1 ? 250 / cols : 1e9);
    const W = Math.ceil((labelMm + colMm) * cols * pxPerMm) + 2, H = Math.ceil(rows * rowMm * pxPerMm) + 2;
    canvas.width = Math.min(W, 16000); canvas.height = Math.min(H, 16000);
    const c = canvas.getContext('2d');
    c.fillStyle = dark ? '#111' : '#fff'; c.fillRect(0, 0, canvas.width, canvas.height);
    // the grid: 1 mm fine, 5 mm bold
    for (let mm = 0; mm * pxPerMm <= canvas.width; mm++) { c.fillStyle = mm % 5 ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.45)'; c.fillRect(Math.round(mm * pxPerMm), 0, 1, canvas.height); }
    for (let mm = 0; mm * pxPerMm <= canvas.height; mm++) { c.fillStyle = mm % 5 ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.45)'; c.fillRect(0, Math.round(mm * pxPerMm), canvas.width, 1); }
    c.font = `${Math.round(3 * pxPerMm)}px "Segoe UI", system-ui, sans-serif`;
    c.textBaseline = 'top';
    chans.forEach((ch, i) => {
      const col = Math.floor(i / rows), row = i % rows;
      const x0 = (col * (labelMm + colMm) + labelMm) * pxPerMm, mid = (row + 0.5) * rowMm * pxPerMm;
      c.fillStyle = dark ? '#ddd' : '#111';
      c.fillText(ch.label || `#${i + 1}`, col * (labelMm + colMm) * pxPerMm + 4, (row * rowMm + 2) * pxPerMm);
      // physical units → mV (µV and V are common too)
      const u = String(ch.units || 'mV').toLowerCase();
      const toMv = u.includes('uv') || u.includes('µv') ? 1e-3 : u === 'v' ? 1e3 : 1;
      const s = ch.samples;
      const limit = Math.min(s.length, Math.floor((colMm / speed) * fs));
      c.strokeStyle = dark ? '#7dd3fc' : '#111'; c.lineWidth = Math.max(1, pxPerMm / 3);
      c.beginPath();
      for (let k = 0; k < limit; k++) {
        const x = x0 + (k / fs) * speed * pxPerMm;
        const y = mid - s[k] * toMv * gain * pxPerMm;
        if (k) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.stroke();
    });
    return { width: canvas.width, height: canvas.height, seconds };
  }

  function waveform(host, bytes, ctx) {
    const { t, esc } = ctx;
    const doc = DD().readWaveform(bytes);
    const groups = doc.groups || [];
    if (!groups.length) { host.innerHTML = head(ctx, doc.title || t('doc.waveform'), '', []) + `<p class="doc-meta">${esc(t('doc.noWaveform'))}</p>`; return; }
    let gi = 0, speed = 25, gain = 10, cols = 1;
    host.innerHTML = head(ctx, doc.title || t('doc.waveform'), common(doc.meta || {}), [['png', t('doc.savePng')], ['csv', t('doc.saveCsv')]])
      + `<div class="doc-controls">
        <label>${esc(t('doc.group'))} <select data-ctl="group">${groups.map((g, i) => `<option value="${i}">${esc(g.label || `#${i + 1}`)} — ${g.channels.length} ch · ${n(g.samplingFrequency, 0)} Hz · ${n(g.duration || g.nSamples / g.samplingFrequency, 2)} s</option>`).join('')}</select></label>
        <label>${esc(t('doc.speed'))} <select data-ctl="speed"><option>12.5</option><option selected>25</option><option>50</option></select> mm/s</label>
        <label>${esc(t('doc.gain'))} <select data-ctl="gain"><option>5</option><option selected>10</option><option>20</option></select> mm/mV</label>
        <label>${esc(t('doc.columns'))} <select data-ctl="cols"><option>1</option><option>2</option><option>4</option></select></label>
      </div><canvas class="doc-canvas"></canvas><div class="doc-annot"></div>`;
    const canvas = host.querySelector('canvas');
    const draw = () => {
      drawWaveform(canvas, groups[gi], { speed, gain, cols });
      const ann = (doc.annotations || []).filter((a) => a.group == null || a.group === gi);
      host.querySelector('.doc-annot').innerHTML = ann.length ? table(ctx, ann.map((a) => [a.label || a.concept || '', [a.value, a.units].filter((x) => x != null && x !== '').join(' ')]), [t('doc.annotation'), t('doc.value')]) : '';
    };
    host.querySelectorAll('[data-ctl]').forEach((s) => s.addEventListener('change', () => {
      gi = +host.querySelector('[data-ctl="group"]').value; speed = +host.querySelector('[data-ctl="speed"]').value;
      gain = +host.querySelector('[data-ctl="gain"]').value; cols = +host.querySelector('[data-ctl="cols"]').value; draw();
    }));
    host.querySelector('[data-doc="png"]').onclick = async () => {
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      ctx.save({ name: `${ctx.stem}_waveform.png`, bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/png', filters: [{ name: 'PNG', extensions: ['png'] }] });
    };
    host.querySelector('[data-doc="csv"]').onclick = () => ctx.save({ name: `${ctx.stem}_waveform.csv`, bytes: enc(DD().waveformToCsv(groups[gi])), mime: 'text/csv', filters: [{ name: 'CSV', extensions: ['csv'] }] });
    draw();
  }

  /* ── Encapsulated documents: PDF shown in the page, CDA as text, STL / OBJ saved ── */
  function encapsulated(host, bytes, ctx) {
    const { t, esc } = ctx;
    const doc = DD().readEncapsulatedDocument(bytes);
    const ext = doc.ext || (doc.mime === 'application/pdf' ? 'pdf' : doc.mime && doc.mime.includes('xml') ? 'xml' : 'bin');
    host.innerHTML = head(ctx, doc.title || t('doc.encapsulated'), [doc.mime, `${(doc.bytes.length / 1024).toFixed(1)} KB`, common(doc)].filter(Boolean).join(' · '), [['save', t('doc.saveDocument')]]);
    if (doc.mime === 'application/pdf') {
      const url = URL.createObjectURL(new Blob([doc.bytes], { type: 'application/pdf' }));
      const frame = document.createElement('iframe');
      frame.className = 'doc-frame'; frame.src = url; frame.title = doc.title || 'PDF';
      host.append(frame);
    } else if (/xml|text/.test(doc.mime || '')) {
      const pre = document.createElement('pre');
      pre.textContent = new TextDecoder().decode(doc.bytes).slice(0, 400000);
      pre.style.whiteSpace = 'pre-wrap';
      host.append(pre);
    } else {
      host.insertAdjacentHTML('beforeend', `<p class="doc-meta">${esc(t('doc.binaryDocument'))}</p>`);
    }
    host.querySelector('[data-doc="save"]').onclick = () => ctx.save({ name: `${ctx.stem}.${ext}`, bytes: doc.bytes, mime: doc.mime || 'application/octet-stream', filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
  }

  /* ── RT structure set: ROI list + contours of one slice ── */
  function rtstruct(host, bytes, ctx) {
    const { t, esc } = ctx;
    const doc = DD().readRtStruct(bytes);
    const rois = doc.rois || [];
    const zs = [...new Set(rois.flatMap((r) => r.contours.map((c) => (c.points[0] ? +c.points[0][2].toFixed(2) : null)).filter((z) => z != null)))].sort((a, b) => a - b);
    host.innerHTML = head(ctx, doc.label || doc.name || t('doc.rtstruct'), common(doc), [['csv', t('doc.saveCsv')]])
      + table(ctx, rois.map((r) => [{ html: `<span class="doc-swatch" style="background:rgb(${(r.color || [200, 200, 200]).join(',')})"></span>${esc(r.name || '')}` }, r.number, r.interpretedType || '', r.contours.length, r.contours.reduce((s, c) => s + c.points.length, 0)]), [t('doc.roi'), '#', t('doc.type'), t('doc.contours'), t('doc.points')])
      + (zs.length ? `<div class="doc-controls"><label>${esc(t('doc.slice'))} <input type="range" min="0" max="${zs.length - 1}" value="${zs.length >> 1}" data-ctl="z" data-spin-format="index"></label><span data-z></span></div><canvas class="doc-canvas" width="512" height="512"></canvas>` : '');
    const canvas = host.querySelector('canvas');
    const draw = () => {
      const z = zs[+host.querySelector('[data-ctl="z"]').value];
      host.querySelector('[data-z]').textContent = `z = ${z} mm`;
      const all = rois.flatMap((r) => r.contours.flatMap((c) => c.points));
      const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const s = 480 / Math.max(1, x1 - x0, y1 - y0);
      const c = canvas.getContext('2d');
      c.fillStyle = '#000'; c.fillRect(0, 0, 512, 512);
      for (const r of rois) {
        c.strokeStyle = `rgb(${(r.color || [255, 255, 0]).join(',')})`; c.lineWidth = 1.5;
        for (const ct of r.contours) {
          if (!ct.points.length || Math.abs(ct.points[0][2] - z) > 0.01) continue;
          c.beginPath();
          ct.points.forEach((p, i) => { const X = 16 + (p[0] - x0) * s, Y = 16 + (p[1] - y0) * s; if (i) c.lineTo(X, Y); else c.moveTo(X, Y); });
          if (ct.type !== 'OPEN_PLANAR') c.closePath();
          c.stroke();
        }
      }
    };
    if (canvas) { host.querySelector('[data-ctl="z"]').addEventListener('input', draw); draw(); }
    host.querySelector('[data-doc="csv"]').onclick = () => {
      const lines = ['roi,name,contour,type,x,y,z'];
      rois.forEach((r) => r.contours.forEach((c, ci) => c.points.forEach((p) => lines.push([r.number, `"${String(r.name || '').replace(/"/g, '""')}"`, ci + 1, c.type, p[0], p[1], p[2]].join(',')))));
      ctx.save({ name: `${ctx.stem}_contours.csv`, bytes: enc(lines.join('\r\n')), mime: 'text/csv', filters: [{ name: 'CSV', extensions: ['csv'] }] });
    };
  }

  /* ── RT plan: plan, fraction groups, beams, prescriptions ── */
  function rtplan(host, bytes, ctx) {
    const { t } = ctx;
    const d = DD().readRtPlan(bytes);
    const beams = d.beams || [];
    host.innerHTML = head(ctx, d.label || d.name || t('doc.rtplan'), common(d), [['txt', t('doc.saveText')]])
      + table(ctx, [[t('doc.planName'), d.name || ''], [t('doc.planDate'), [d.date, d.time].filter(Boolean).join(' ')], [t('doc.intent'), d.intent || ''], [t('doc.geometry'), d.geometry || ''], [t('doc.approval'), d.approval || '']])
      + `<h3>${ctx.esc(t('doc.fractions'))}</h3>` + table(ctx, (d.fractionGroups || []).map((g) => [g.number, g.fractions, g.numberOfBeams, (g.beams || []).map((b) => `#${b.number}: ${n(b.meterset, 2)} MU${b.dose ? ` / ${n(b.dose, 3)} Gy` : ''}`).join(', ')]), ['#', t('doc.fractionCount'), t('doc.beams'), t('doc.meterset')])
      + `<h3>${ctx.esc(t('doc.beams'))}</h3>` + table(ctx, beams.map((b) => [b.number, b.name || '', b.type || '', b.radiationType || '', b.machine || '', n(b.energy, 1), n(b.gantry, 1), n(b.collimator, 1), n(b.couch, 1), (b.isocenter || []).map((v) => n(v, 1)).join(' \\ '), b.numberOfControlPoints || (b.controlPoints || []).length]), ['#', t('doc.beamName'), t('doc.type'), t('doc.radiation'), t('doc.machine'), 'MeV/MV', t('doc.gantry'), t('doc.collimator'), t('doc.couch'), t('doc.isocenter'), t('doc.controlPoints')])
      + ((d.prescriptions || []).length ? `<h3>${ctx.esc(t('doc.prescriptions'))}</h3>` + table(ctx, d.prescriptions.map((p) => [p.number, p.structureType || '', p.type || '', n(p.targetPrescriptionDose, 3), p.description || '']), ['#', t('doc.structure'), t('doc.type'), 'Gy', t('doc.description')]) : '');
    host.querySelector('[data-doc="txt"]').onclick = () => ctx.save({ name: `${ctx.stem}_plan.txt`, bytes: enc(host.innerText), mime: 'text/plain', filters: [{ name: 'Text', extensions: ['txt'] }] });
  }

  /* ── DICOMDIR opened as a file: the hierarchy, and a button to load it as series ── */
  function dicomdir(host, bytes, ctx) {
    const { t, esc } = ctx;
    const d = DD().readDicomDir(bytes);
    const li = [];
    for (const p of d.patients || []) {
      li.push(`<li><b>${esc(p.name || '?')}</b> ${esc(p.id || '')}<ul>`);
      for (const st of p.studies || []) {
        li.push(`<li>${esc([st.date, st.description].filter(Boolean).join(' · ') || st.uid || '')}<ul>`);
        for (const se of st.series || []) li.push(`<li>${esc(se.modality || '')} #${esc(se.number == null ? '' : se.number)} ${esc(se.description || '')} — ${(se.images || []).length}</li>`);
        li.push('</ul></li>');
      }
      li.push('</ul></li>');
    }
    host.innerHTML = head(ctx, `DICOMDIR ${d.fileSetId || ''}`, t('doc.dicomdirFiles', { n: (d.files || []).length }), ctx.openDicomdir ? [['load', t('doc.loadSeries')]] : []) + `<div class="doc-tree"><ul>${li.join('')}</ul></div>`;
    const b = host.querySelector('[data-doc="load"]');
    if (b) b.onclick = () => ctx.openDicomdir();
  }

  return { render, drawWaveform };
})();
