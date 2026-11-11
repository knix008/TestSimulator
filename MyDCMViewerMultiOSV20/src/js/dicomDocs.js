/* DICOM documents — the non-image IODs: Structured Reports, waveforms (ECG …), encapsulated PDF / CDA / STL,
 * RT Structure Sets, RT Plans, DICOMDIR and Segmentations. Works in Node (CommonJS) and in the browser
 * (window.DicomDocs; load dicomDecoder.js and dicomWriter.js first — the data set is read with DicomWriter.parse).
 *
 *   DicomDocs.kindOf(bytes)                    'image' | 'sr' | 'waveform' | 'rtplan' | 'rtstruct' | 'rtdose' | 'pdf' | 'cda'
 *                                              | 'stl' | 'dicomdir' | 'presentation' | 'seg' | 'other'
 *   readSR(bytes) / srToText(sr) / srToHtml(sr)
 *   readWaveform(bytes) / waveformToCsv(group)
 *   readEncapsulatedDocument(bytes)
 *   readRtStruct(bytes) / readRtPlan(bytes)
 *   readDicomDir(bytes)
 *   segmentationInfo(bytes)
 *   read(bytes)                                { kind, doc } — the reader that fits the file
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./dicomDecoder'), require('./dicomWriter'));
  } else {
    root.DicomDocs = factory(root.DicomDecoder, root.DicomWriter);
  }
})(typeof self !== 'undefined' ? self : this, function (D, W) {
  /* ── Data set access ── */
  const model = (input) => (input && input.elements && input.meta ? input : W.parse(input));
  const utf8Of = (m) => { const v = find(m.elements, '00080005'); return !!(v && v.value && /ISO_IR 192/.test(String.fromCharCode.apply(null, v.value))); };
  const find = (list, tag) => (list ? list.find((e) => e.tag === tag) : null) || null;

  // A reader over one element list (a data set or a sequence item)
  function reader(list, utf8) {
    const r = {
      list,
      has: (tag) => !!find(list, tag),
      raw: (tag) => W.valueOf(find(list, tag), utf8),
      str: (tag) => { const v = r.raw(tag); return v === undefined ? '' : Array.isArray(v) ? v.join('\\') : v instanceof Uint8Array ? '' : String(v); },
      num: (tag) => { const v = r.raw(tag); if (typeof v === 'number') return v; if (Array.isArray(v)) return typeof v[0] === 'number' ? v[0] : undefined; const n = parseFloat(v); return Number.isFinite(n) ? n : undefined; },
      nums: (tag) => {
        const v = r.raw(tag);
        if (v === undefined || v instanceof Uint8Array) return [];
        if (typeof v === 'number') return [v];
        if (Array.isArray(v)) return v.filter((x) => typeof x === 'number');
        return String(v).split('\\').map((s) => parseFloat(s)).filter((x) => Number.isFinite(x));
      },
      bytes: (tag) => { const e = find(list, tag); return e && e.value ? e.value : null; },
      seq: (tag) => { const e = find(list, tag); return e && e.items ? e.items.map((it) => reader(it.elements, utf8)) : []; },
      first: (tag) => r.seq(tag)[0] || null,
      code: (tag) => { const it = r.first(tag); return it ? codeOf(it) : null; },
    };
    return r;
  }
  const codeOf = (it) => ({ value: it.str('00080100') || it.str('00080119') || it.str('00080120'), scheme: it.str('00080102'), meaning: it.str('00080104') });
  const top = (input) => { const m = model(input); return reader(m.elements, utf8Of(m)); };
  const person = (s) => String(s || '').replace(/\^+/g, ' ').replace(/\s+/g, ' ').trim();

  function common(ds) {
    return {
      patientName: person(ds.str('00100010')), patientId: ds.str('00100020'), studyDate: ds.str('00080020'), studyDescription: ds.str('00081030'),
      seriesDescription: ds.str('0008103E'), modality: ds.str('00080060'), sopClassUid: ds.str('00080016'), sopInstanceUid: ds.str('00080018'),
      contentDate: ds.str('00080023'), contentTime: ds.str('00080033'), manufacturer: ds.str('00080070'),
    };
  }

  /* ── Kind ── */
  function kindOf(input) {
    const m = model(input);
    const ds = reader(m.elements, false);
    const meta = reader(m.meta, false);
    const sop = ds.str('00080016') || meta.str('00020002');
    return D.kindOfSop(sop, { hasPixels: ds.has('7FE00010') || ds.has('7FE00008') || ds.has('7FE00009'), isDir: ds.has('00041220') });
  }

  /* ── Structured Report ── */
  function readContentItem(it) {
    const node = {
      relationship: it.str('0040A010'),
      valueType: it.str('0040A040'),
      conceptName: '',
      concept: it.code('0040A043'),
      value: '',
      units: '',
      children: [],
    };
    if (node.concept) node.conceptName = node.concept.meaning || node.concept.value;
    const vt = node.valueType;
    if (vt === 'CONTAINER') {
      node.continuity = it.str('0040A050');
      const tpl = it.first('0040A504');
      if (tpl) node.template = tpl.str('0040DB00');
    } else if (vt === 'TEXT') node.value = it.str('0040A160');
    else if (vt === 'CODE') { node.code = it.code('0040A168'); node.value = node.code ? node.code.meaning || node.code.value : ''; }
    else if (vt === 'NUM') {
      const mv = it.first('0040A300');
      if (mv) {
        node.numeric = mv.num('0040A30A');
        node.value = mv.str('0040A30A');
        const u = mv.code('004008EA');
        if (u) { node.units = u.value || u.meaning; node.unitsMeaning = u.meaning; }
      }
      const q = it.code('0040A301');
      if (q) node.qualifier = q.meaning;
    } else if (vt === 'DATETIME') node.value = it.str('0040A120');
    else if (vt === 'DATE') node.value = it.str('0040A121');
    else if (vt === 'TIME') node.value = it.str('0040A122');
    else if (vt === 'UIDREF') node.value = it.str('0040A124');
    else if (vt === 'PNAME') node.value = person(it.str('0040A123'));
    else if (vt === 'IMAGE' || vt === 'COMPOSITE' || vt === 'WAVEFORM') {
      const ref = it.first('00081199');
      if (ref) {
        node.reference = { sopClassUid: ref.str('00081150'), sopInstanceUid: ref.str('00081155'), frames: ref.nums('00081160'), channels: ref.nums('0040A0B0') };
        const cls = D.SOP_CLASS[node.reference.sopClassUid];
        node.value = `${cls ? cls + ' ' : ''}${node.reference.sopInstanceUid}${node.reference.frames.length ? ` (frames ${node.reference.frames.join(', ')})` : ''}`;
      }
    } else if (vt === 'SCOORD' || vt === 'SCOORD3D') {
      node.graphicType = it.str('00700023');
      const data = it.nums('00700022');
      const dim = vt === 'SCOORD3D' ? 3 : 2;
      node.points = [];
      for (let i = 0; i + dim <= data.length; i += dim) node.points.push(data.slice(i, i + dim));
      if (vt === 'SCOORD3D') node.frameOfReference = it.str('30060024');
      node.value = `${node.graphicType} ${node.points.map((p) => `(${p.map((x) => +x.toFixed(3)).join(', ')})`).join(' ')}`;
    } else if (vt === 'TCOORD') {
      node.temporalRangeType = it.str('0040A130');
      node.samplePositions = it.nums('0040A132');
      node.timeOffsets = it.nums('0040A138');
      node.dateTimes = it.str('0040A13A') ? it.str('0040A13A').split('\\') : [];
      const vals = node.samplePositions.length ? node.samplePositions : node.timeOffsets.length ? node.timeOffsets : node.dateTimes;
      node.value = `${node.temporalRangeType} ${vals.join(', ')}`;
    } else if (!vt && it.has('0040DB73')) {
      node.valueType = 'REFERENCE';
      node.value = `→ ${it.nums('0040DB73').join('.')}`;
    }
    node.children = it.seq('0040A730').map(readContentItem);
    return node;
  }

  function readSR(input) {
    const ds = top(input);
    const root = readContentItem(ds);
    root.relationship = '';
    return {
      title: root.conceptName || ds.str('0008103E') || 'Structured Report',
      completion: ds.str('0040A491'), verification: ds.str('0040A493'),
      observers: ds.seq('0040A073').map((o) => ({ name: person(o.str('0040A075')), organization: o.str('0040A027'), dateTime: o.str('0040A030') })),
      ...common(ds),
      root,
    };
  }

  const lineOf = (n) => {
    const head = `${n.relationship ? n.relationship + ' ' : ''}${n.conceptName || '(no concept)'}`;
    const val = n.value !== '' && n.value != null ? `${n.value}${n.units ? ' ' + n.units : ''}` : '';
    return { head, type: n.valueType, val };
  };

  function srToText(sr) {
    const out = [];
    out.push(`${sr.title}${sr.completion ? ` — ${sr.completion}` : ''}${sr.verification ? ` / ${sr.verification}` : ''}`);
    const walk = (n, d) => {
      const l = lineOf(n);
      out.push(`${'  '.repeat(d)}${l.head} [${l.type || '?'}]${l.val ? ': ' + l.val : ''}`);
      n.children.forEach((c) => walk(c, d + 1));
    };
    walk(sr.root, 0);
    return out.join('\n');
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function srToHtml(sr) {
    const item = (n) => {
      const l = lineOf(n);
      const label = `<span style="opacity:.65">${esc(n.relationship)}</span> <b>${esc(n.conceptName || '(no concept)')}</b> <small style="opacity:.6">${esc(l.type)}</small>${l.val ? `: <span>${esc(l.val)}</span>` : ''}`;
      if (!n.children.length) return `<li>${label}</li>`;
      return `<li><details open><summary>${label}</summary><ul style="margin:0;padding-left:1.4em">${n.children.map(item).join('')}</ul></details></li>`;
    };
    const status = [sr.completion, sr.verification].filter(Boolean).map(esc).join(' · ');
    return `<div class="sr-doc"><h3 style="margin:.2em 0">${esc(sr.title)}</h3>${status ? `<div style="opacity:.7">${status}</div>` : ''}<ul style="list-style:none;padding-left:0">${item(sr.root)}</ul></div>`;
  }

  /* ── Waveform ── */
  // G.711 decoders (MB: mu-law, AB: A-law) → 16-bit linear
  function ulaw(u) {
    u = ~u & 0xFF;
    const t = (((u & 0x0F) << 3) + 0x84) << ((u & 0x70) >> 4);
    return u & 0x80 ? 0x84 - t : t - 0x84;
  }
  function alaw(a) {
    a ^= 0x55;
    let t = (a & 0x0F) << 4;
    const seg = (a & 0x70) >> 4;
    if (seg === 0) t += 8; else if (seg === 1) t += 0x108; else t = (t + 0x108) << (seg - 1);
    return a & 0x80 ? t : -t;
  }

  function readWaveform(input) {
    const ds = top(input);
    const groups = ds.seq('54000100').map((g, gi) => {
      const nCh = g.num('003A0005') || 0, nSamples = g.num('003A0010') || 0;
      const freq = g.num('003A001A') || 0;
      const bits = g.num('54001004') || 16;
      const interp = g.str('54001006') || (bits === 8 ? 'SB' : 'SS');
      const data = g.bytes('54001010') || new Uint8Array(0);
      const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const rawAt = (i) => {
        if (bits === 8) {
          if (i >= data.length) return 0;
          const b = data[i];
          if (interp === 'MB') return ulaw(b);
          if (interp === 'AB') return alaw(b);
          return interp === 'UB' ? b : (b << 24) >> 24;
        }
        if (bits === 16) {
          if (i * 2 + 2 > data.length) return 0;
          return interp === 'US' ? dv.getUint16(i * 2, true) : dv.getInt16(i * 2, true);
        }
        if (bits === 32) { if (i * 4 + 4 > data.length) return 0; return interp === 'UL' ? dv.getUint32(i * 4, true) : dv.getInt32(i * 4, true); }
        return 0;
      };
      const defs = g.seq('003A0200');
      const channels = [];
      for (let c = 0; c < nCh; c++) {
        const d = defs[c] || reader([], false);
        const src = d.code('003A0208');
        const units = d.code('003A0211');
        const sensitivity = d.has('003A0210') ? d.num('003A0210') : 1;
        const correction = d.has('003A0212') ? d.num('003A0212') : 1;
        const baseline = d.has('003A0213') ? d.num('003A0213') : 0;
        const samples = new Float64Array(nSamples);
        const k = (sensitivity ?? 1) * (correction ?? 1);
        for (let s = 0; s < nSamples; s++) samples[s] = (rawAt(s * nCh + c) + (baseline || 0)) * k;
        channels.push({
          number: d.num('003A0202'), label: d.str('003A0203') || (src ? src.meaning || src.value : `Channel ${c + 1}`),
          source: src, units: units ? units.value || units.meaning : '', unitsMeaning: units ? units.meaning : '',
          sensitivity, correction, baseline, skew: d.num('003A0214') || 0, bitsStored: d.num('003A021A'),
          filterLow: d.num('003A0220'), filterHigh: d.num('003A0221'), notch: d.num('003A0222'), status: d.str('003A0205'),
          samples,
        });
      }
      return {
        index: gi, label: g.str('003A0020'), originality: g.str('003A0004'), samplingFrequency: freq, nSamples, bitsAllocated: bits,
        sampleInterpretation: interp, duration: freq ? nSamples / freq : 0, channels,
      };
    });
    const meta = common(ds);
    return { title: meta.seriesDescription || D.SOP_CLASS[meta.sopClassUid] || 'Waveform', meta, groups, annotations: ds.seq('00400B20').map((a) => ({ text: a.str('00700006'), code: a.code('0040A043') })) };
  }

  function waveformToCsv(group) {
    const q = (s) => (/[",\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : s);
    const head = ['time_ms', ...group.channels.map((c) => q(`${c.label}${c.units ? ` (${c.units})` : ''}`))].join(',');
    const lines = [head];
    const f = group.samplingFrequency || 1;
    for (let s = 0; s < group.nSamples; s++) {
      const row = [String(+(s * 1000 / f).toFixed(6))];
      for (const c of group.channels) row.push(String(+c.samples[s].toFixed(6)));
      lines.push(row.join(','));
    }
    return lines.join('\n') + '\n';
  }

  /* ── Encapsulated documents (PDF, CDA, STL / OBJ / MTL) ── */
  function readEncapsulatedDocument(input) {
    const ds = top(input);
    let bytes = ds.bytes('00420011') || new Uint8Array(0);
    const mime = ds.str('00420012');
    const declared = ds.num('00420015');
    if (Number.isFinite(declared) && declared > 0 && declared <= bytes.length) bytes = bytes.subarray(0, declared);
    else if (bytes.length) {
      // the pad byte that made the value even: drop it when the document says it ends before it
      const last = bytes[bytes.length - 1];
      const tail = String.fromCharCode.apply(null, bytes.subarray(Math.max(0, bytes.length - 8)));
      const isBinaryStl = bytes.length >= 84 && !/^solid\s/.test(String.fromCharCode.apply(null, bytes.subarray(0, 6))) && /stl/i.test(mime);
      if (/pdf/i.test(mime) || /^%PDF/.test(String.fromCharCode.apply(null, bytes.subarray(0, 4)))) {
        if (/%%EOF\r?\n?[\0 ]$/.test(tail)) bytes = bytes.subarray(0, bytes.length - 1);
      } else if (isBinaryStl) {
        const n = new DataView(bytes.buffer, bytes.byteOffset + 80, 4).getUint32(0, true);
        if (bytes.length === 84 + 50 * n + 1) bytes = bytes.subarray(0, bytes.length - 1);
      } else if (last === 0) bytes = bytes.subarray(0, bytes.length - 1);   // text documents (CDA XML, OBJ, MTL, ASCII STL)
    }
    const ext = { 'application/pdf': 'pdf', 'text/xml': 'xml', 'application/xml': 'xml', 'model/stl': 'stl', 'model/x.stl-binary': 'stl', 'model/obj': 'obj', 'model/mtl': 'mtl' }[mime.toLowerCase()] || '';
    return { mime, title: ds.str('00420010'), bytes, ext, ...common(ds) };
  }

  /* ── RT Structure Set ── */
  function readRtStruct(input) {
    const ds = top(input);
    const forItem = ds.first('30060010');
    const contours = new Map();
    for (const rc of ds.seq('30060039')) {
      const color = rc.nums('3006002A');
      contours.set(rc.num('30060084'), {
        color: color.length === 3 ? color : null,
        contours: rc.seq('30060040').map((c) => {
          const data = c.nums('30060050');
          const points = [];
          for (let i = 0; i + 3 <= data.length; i += 3) points.push([data[i], data[i + 1], data[i + 2]]);
          const img = c.first('30060016');
          return { type: c.str('30060042'), number: c.num('30060048'), nPoints: c.num('30060046') ?? points.length, points, referencedSopInstance: img ? img.str('00081155') : '' };
        }),
      });
    }
    const obs = new Map();
    for (const o of ds.seq('30060080')) obs.set(o.num('30060084'), { interpretedType: o.str('300600A4'), label: o.str('30060085') });
    const rois = ds.seq('30060020').map((r) => {
      const n = r.num('30060022');
      const c = contours.get(n) || { color: null, contours: [] };
      const o = obs.get(n) || {};
      return { number: n, name: r.str('30060026'), description: r.str('30060028'), frameOfReference: r.str('30060024'), generationAlgorithm: r.str('30060036'),
        color: c.color, interpretedType: o.interpretedType || '', observationLabel: o.label || '', contours: c.contours };
    });
    return {
      label: ds.str('30060002'), name: ds.str('30060004'), description: ds.str('30060006'), date: ds.str('30060008'), time: ds.str('30060009'),
      frameOfReference: forItem ? forItem.str('00200052') : '', ...common(ds), rois,
    };
  }

  /* ── RT Plan ── */
  function readRtPlan(input) {
    const ds = top(input);
    const fractionGroups = ds.seq('300A0070').map((f) => ({
      number: f.num('300A0071'), fractions: f.num('300A0078'), numberOfBeams: f.num('300A0080'), numberOfBrachy: f.num('300A00A0'),
      beams: f.seq('300C0004').map((b) => ({ number: b.num('300C0006'), meterset: b.num('300A0086'), dose: b.num('300A0084') })),
    }));
    const beams = ds.seq('300A00B0').map((b) => {
      const cps = b.seq('300A0111').map((c) => ({
        index: c.num('300A0112'), energy: c.num('300A0114'), doseRate: c.num('300A0115'), gantry: c.num('300A011E'), gantryDirection: c.str('300A011F'),
        collimator: c.num('300A0120'), couch: c.num('300A0122'), isocenter: c.nums('300A012C'), ssd: c.num('300A0130'), cumulativeMetersetWeight: c.num('300A0134'),
        devices: c.seq('300A011A').map((d) => ({ type: d.str('300A00B8'), positions: d.nums('300A011C') })),
      }));
      // later control points inherit what the first one set
      const firstOf = (k) => { for (const c of cps) if (c[k] !== undefined && !(Array.isArray(c[k]) && !c[k].length)) return c[k]; return undefined; };
      return {
        number: b.num('300A00C0'), name: b.str('300A00C2'), description: b.str('300A00C3'), type: b.str('300A00C4'), radiationType: b.str('300A00C6'),
        machine: b.str('300A00B2'), dosimeterUnit: b.str('300A00B3'), sad: b.num('300A00B4'), deliveryType: b.str('300A00CE'),
        energy: firstOf('energy'), gantry: firstOf('gantry'), collimator: firstOf('collimator'), couch: firstOf('couch'), isocenter: firstOf('isocenter') || [],
        finalMetersetWeight: b.num('300A010E'), numberOfControlPoints: b.num('300A0110') ?? cps.length, controlPoints: cps,
        wedges: b.num('300A00D0') || 0, blocks: b.num('300A00F0') || 0,
      };
    });
    const prescriptions = ds.seq('300A0010').map((p) => ({
      number: p.num('300A0012'), structureType: p.str('300A0014'), description: p.str('300A0016'), type: p.str('300A0020'),
      point: p.nums('300A0018'), targetPrescriptionDose: p.num('300A0026'), deliveryMaximumDose: p.num('300A0023'), referencedRoi: p.num('30060084'),
    }));
    const approval = ds.str('300E0002');
    return {
      label: ds.str('300A0002'), name: ds.str('300A0003'), description: ds.str('300A0004'), date: ds.str('300A0006'), time: ds.str('300A0007'),
      intent: ds.str('300A000A'), geometry: ds.str('300A000C'), approval, ...common(ds), fractionGroups, beams, prescriptions,
      patientSetups: ds.seq('300A0180').map((s) => ({ number: s.num('300A0182'), position: s.str('00185100') })),
    };
  }

  /* ── DICOMDIR ── */
  const LEAF_TYPES = new Set(['IMAGE', 'RT DOSE', 'RT STRUCTURE SET', 'RT PLAN', 'RT TREAT RECORD', 'PRESENTATION', 'WAVEFORM', 'SR DOCUMENT',
    'KEY OBJECT DOC', 'SPECTROSCOPY', 'RAW DATA', 'REGISTRATION', 'FIDUCIAL', 'ENCAP DOC', 'HL7 STRUC DOC', 'VALUE MAP', 'STEREOMETRIC',
    'PALETTE', 'IMPLANT', 'MEASUREMENT', 'SURFACE', 'TRACT', 'ASSESSMENT', 'RADIOTHERAPY', 'ANNOTATION', 'INVENTORY', 'PLAN', 'PRIVATE']);

  function readDicomDir(input) {
    const m = model(input);
    const ds = reader(m.elements, utf8Of(m));
    const recSeq = find(m.elements, '00041220');
    const items = recSeq && recSeq.items ? recSeq.items : [];
    const recs = items.map((it) => ({ r: reader(it.elements, utf8Of(m)), offset: it.offset, type: '', children: [] }));
    recs.forEach((x) => { x.type = x.r.str('00041430').toUpperCase(); x.inUse = !x.r.has('00041410') || x.r.num('00041410') !== 0; });
    const byOffset = new Map(recs.map((x) => [x.offset, x]));
    const firstRoot = ds.num('00041200');
    const linked = (() => {
      // Follow the offsets: root list, each record's lower level, siblings via "next".
      if (!firstRoot || !byOffset.has(firstRoot)) return null;
      const seen = new Set();
      const chain = (off) => {
        const out = [];
        while (off && byOffset.has(off) && !seen.has(off)) {
          const x = byOffset.get(off);
          seen.add(off);
          out.push(x);
          const lower = x.r.num('00041420');
          x.children = lower ? chain(lower) : [];
          off = x.r.num('00041400');
        }
        return out;
      };
      const roots = chain(firstRoot);
      return seen.size ? roots : null;
    })();
    let roots = linked;
    if (!roots) {
      // Fallback: sequence order with the usual hierarchy (PATIENT > STUDY > SERIES > leaf records)
      roots = [];
      let p = null, st = null, se = null;
      for (const x of recs) {
        x.children = [];
        if (x.type === 'PATIENT') { roots.push(x); p = x; st = se = null; }
        else if (x.type === 'STUDY') { if (!p) { p = { type: 'PATIENT', r: reader([], false), children: [] }; roots.push(p); } p.children.push(x); st = x; se = null; }
        else if (x.type === 'SERIES') { if (!st) { st = { type: 'STUDY', r: reader([], false), children: [] }; (p || (p = { type: 'PATIENT', r: reader([], false), children: [] }, roots.push(p), p)).children.push(st); } st.children.push(x); se = x; }
        else if (se) se.children.push(x);
      }
    }
    const live = (list) => list.filter((x) => x.inUse !== false);
    const files = [];
    const leaf = (x) => {
      const id = x.r.str('00041500');
      const path = id ? id.split('\\').map((s) => s.trim()).filter(Boolean) : [];
      if (path.length) files.push(path);
      return {
        type: x.type, path, instance: x.r.num('00200013'), sopInstanceUid: x.r.str('00041511'), sopClassUid: x.r.str('00041510'),
        transferSyntax: x.r.str('00041512'), rows: x.r.num('00280010'), columns: x.r.num('00280011'),
      };
    };
    const patients = live(roots).filter((x) => x.type === 'PATIENT' || !LEAF_TYPES.has(x.type)).map((p) => ({
      name: person(p.r.str('00100010')), id: p.r.str('00100020'), birthDate: p.r.str('00100030'), sex: p.r.str('00100040'),
      studies: live(p.children).filter((x) => x.type === 'STUDY').map((s) => ({
        uid: s.r.str('0020000D'), date: s.r.str('00080020'), time: s.r.str('00080030'), description: s.r.str('00081030'), id: s.r.str('00200010'),
        accession: s.r.str('00080050'),
        series: live(s.children).filter((x) => x.type === 'SERIES').map((se) => ({
          uid: se.r.str('0020000E'), modality: se.r.str('00080060'), number: se.r.num('00200011'), description: se.r.str('0008103E'),
          images: live(se.children).map(leaf),
        })),
      })),
    }));
    return { fileSetId: ds.str('00041130'), linked: !!linked, patients, files, records: recs.length };
  }

  /* ── Segmentation ── */
  function labToRgb(v) {
    if (!v || v.length !== 3) return null;
    const L = v[0] * 100 / 65535, a = v[1] * 255 / 65535 - 128, b = v[2] * 255 / 65535 - 128;
    const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    const inv = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
    const X = 0.95047 * inv(fx), Y = 1.0 * inv(fy), Z = 1.08883 * inv(fz);
    const lin = [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.2040 * Y + 1.0570 * Z];
    return lin.map((c) => { const s = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(s * 255))); });
  }

  function segmentationInfo(input) {
    const ds = top(input);
    const segs = ds.seq('00620002').map((s) => {
      const lab = s.nums('0062000D');
      const gray = s.num('0062000C');
      const cat = s.code('00620003'), type = s.code('0062000F');
      return {
        number: s.num('00620004'), label: s.str('00620005'), description: s.str('00620006'), algorithmType: s.str('00620008'), algorithmName: s.str('00620009'),
        color: lab.length === 3 ? labToRgb(lab) : (Number.isFinite(gray) ? [gray >> 8, gray >> 8, gray >> 8] : null), cielab: lab,
        category: cat ? cat.meaning : '', propertyType: type ? type.meaning : '', frames: [],
      };
    });
    const byNum = new Map(segs.map((s) => [s.number, s]));
    const shared = ds.first('52009229');
    const sharedSeg = shared && shared.first('0062000A');
    const per = ds.seq('52009230');
    const nFrames = parseInt(ds.str('00280008'), 10) || per.length || 1;
    for (let f = 0; f < nFrames; f++) {
      const it = per[f] && per[f].first('0062000A');
      const n = (it || sharedSeg) ? (it || sharedSeg).num('0062000B') : undefined;
      if (byNum.has(n)) byNum.get(n).frames.push(f);
    }
    return {
      type: ds.str('00620001'), fractionalType: ds.str('00620010'), maxFractionalValue: ds.num('0062000E'), overlap: ds.str('00620013'),
      rows: ds.num('00280010'), columns: ds.num('00280011'), frames: nFrames, ...common(ds), segments: segs,
    };
  }

  /* ── Any document ── */
  function read(input) {
    const m = model(input);
    const kind = kindOf(m);
    const doc = kind === 'sr' ? readSR(m) : kind === 'waveform' ? readWaveform(m) : (kind === 'pdf' || kind === 'cda' || kind === 'stl') ? readEncapsulatedDocument(m)
      : kind === 'rtstruct' ? readRtStruct(m) : kind === 'rtplan' ? readRtPlan(m) : kind === 'dicomdir' ? readDicomDir(m) : kind === 'seg' ? segmentationInfo(m) : null;
    return { kind, doc };
  }

  return { kindOf, readSR, srToText, srToHtml, readWaveform, waveformToCsv, readEncapsulatedDocument, readRtStruct, readRtPlan, readDicomDir, segmentationInfo, read };
});
