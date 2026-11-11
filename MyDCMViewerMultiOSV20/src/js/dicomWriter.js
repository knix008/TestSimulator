/* DICOM writer — editable data set model, Part 10 output, decompression, de-identification, Secondary Capture.
 * Pure JS (no DOM); works in Node (CommonJS) and in the browser (window.DicomWriter, after dicomDecoder.js).
 *
 *   DicomWriter.parse(bytes)                     → model { meta: [el], elements: [el], transferSyntax, layout }
 *       el: { tag: 'GGGGEEEE', vr, value: Uint8Array } | { tag, vr: 'SQ', items: [{ elements: [el] }] }
 *           | { tag, vr, fragments: [Uint8Array], offsetTable: Uint8Array }     (encapsulated pixel data)
 *       Values are always stored little endian (big endian input is byte-swapped by VR).
 *   get(model, tag) / set(model, tag, value, vr?) / remove(model, tag)
 *       tag: 'GGGGEEEE', '(GGGG,EEEE)', 'xggggeeee' or a path 'GGGGEEEE/0/GGGGEEEE' (sequence, item index, tag)
 *   write(model, { transferSyntax, sopClassUid, sopInstanceUid }) → Uint8Array (Part 10)
 *   decompress(bytes)                            → Promise<Uint8Array> Explicit VR LE, native pixel data
 *   anonymize(bytes, { tags, removePrivate, replacement, newUids, method }) → Uint8Array
 *   secondaryCapture({ width, height, rgba | gray, bits, frames, meta }) → Uint8Array
 *   makeDicomDir([{ path: ['DIR', 'FILE'], bytes }], { fileSetId }) → Uint8Array (DICOMDIR)
 *   newUid() → '2.25.<128-bit decimal>'
 *   editableTags(model) → [{ tag, label, name, vr, value, editable, depth }]
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./dicomDecoder'));
  } else {
    root.DicomWriter = factory(root.DicomDecoder);
  }
})(typeof self !== 'undefined' ? self : this, function (D) {
  const IS_NODE = typeof process === 'object' && process !== null
    && typeof process.versions === 'object' && !!process.versions.node
    && typeof window === 'undefined';

  const TS = D.TS;
  const IMPLEMENTATION_CLASS_UID = '2.25.311738136939861930366473938201406186417';
  const IMPLEMENTATION_VERSION = 'MYDCMVIEWER_1';
  const NATIVE_TS = new Set([TS.IMPLICIT_LE, TS.EXPLICIT_LE, TS.EXPLICIT_BE, TS.DEFLATED_LE]);
  const UNDEF = 0xFFFFFFFF;

  /* ── VRs ── */
  const TEXT_VR = new Set(['AE', 'AS', 'CS', 'DA', 'DS', 'DT', 'IS', 'LO', 'LT', 'PN', 'SH', 'ST', 'TM', 'UC', 'UI', 'UR', 'UT']);
  const NUM_VR = { US: 2, SS: 2, UL: 4, SL: 4, FL: 4, FD: 8, SV: 8, UV: 8 };
  const LONG_VR = new Set(['OB', 'OD', 'OF', 'OL', 'OV', 'OW', 'SQ', 'UC', 'UN', 'UR', 'UT', 'SV', 'UV']);
  const SWAP = { US: 2, SS: 2, OW: 2, AT: 2, UL: 4, SL: 4, FL: 4, OF: 4, OL: 4, FD: 8, OD: 8, SV: 8, UV: 8, OV: 8 };
  const ALL_VR = new Set([...TEXT_VR, ...Object.keys(NUM_VR), 'AT', 'OB', 'OD', 'OF', 'OL', 'OV', 'OW', 'SQ', 'UN']);

  /* VR dictionary for common tags (implicit VR files, new elements); the decoder's table is merged in. */
  const VR_DICT = Object.assign({}, D.IMPLICIT_VR, {
    '00020000': 'UL', '00020001': 'OB', '00020002': 'UI', '00020003': 'UI', '00020010': 'UI', '00020012': 'UI', '00020013': 'SH', '00020016': 'AE',
    '00041130': 'CS', '00041141': 'CS', '00041142': 'CS', '00041200': 'UL', '00041202': 'UL', '00041212': 'US', '00041220': 'SQ', '00041400': 'UL',
    '00041410': 'US', '00041420': 'UL', '00041430': 'CS', '00041432': 'UI', '00041500': 'CS', '00041504': 'UL', '00041510': 'UI', '00041511': 'UI',
    '00041512': 'UI', '0004151A': 'UI',
    '00080012': 'DA', '00080013': 'TM', '00080014': 'UI', '0008002A': 'DT', '00080081': 'ST', '00080100': 'SH', '00080102': 'SH', '00080103': 'SH',
    '00080104': 'LO', '00080105': 'CS', '0008010B': 'CS', '0008010C': 'UI', '0008010D': 'UI', '0008010F': 'CS', '00080117': 'UI', '00080118': 'UI', '00080119': 'UC', '00080201': 'SH',
    '00081032': 'SQ', '00081048': 'PN', '00081060': 'PN', '00081080': 'LO', '00081110': 'SQ', '00081111': 'SQ', '00081115': 'SQ', '00081120': 'SQ',
    '00081140': 'SQ', '00081150': 'UI', '00081155': 'UI', '00081160': 'IS', '00081199': 'SQ', '00081250': 'SQ', '00082112': 'SQ', '00082218': 'SQ',
    '00089215': 'SQ', '00089007': 'CS', '00082144': 'IS',
    '00100021': 'LO', '00100032': 'TM', '00101000': 'LO', '00101001': 'PN', '00102180': 'SH', '001021B0': 'LT', '00101040': 'LO', '00102154': 'SH',
    '00120062': 'CS', '00120063': 'LO', '00120064': 'SQ',
    '00181019': 'LO', '00181040': 'LO', '00181010': 'LO', '00182002': 'SH', '00181063': 'DS', '00181065': 'DS', '00180072': 'DS', '00181242': 'IS',
    '00189004': 'CS', '00189073': 'FD',
    '00209056': 'SH', '00209057': 'UL', '00209111': 'SQ', '00209113': 'SQ', '00209116': 'SQ', '00209128': 'UL', '00209156': 'US', '00209157': 'UL',
    '00209164': 'UI', '00209165': 'AT', '00209167': 'AT', '00209221': 'SQ', '00209222': 'SQ', '00209071': 'SQ', '00200100': 'IS',
    '00280009': 'AT', '00280014': 'US', '00280300': 'CS', '00280301': 'CS', '00280302': 'CS', '00280303': 'CS', '00281040': 'CS', '00281041': 'SS',
    '00281199': 'UI', '00281201': 'OW', '00281202': 'OW', '00281203': 'OW', '00281221': 'OW', '00281222': 'OW', '00281223': 'OW',
    '00282112': 'DS', '00282114': 'CS', '00283000': 'SQ', '00283006': 'US', '00283010': 'SQ', '00289110': 'SQ', '00289132': 'SQ', '00289145': 'SQ',
    '00286010': 'US', '00286020': 'US', '00289001': 'UL', '00289002': 'UL',
    '00321032': 'PN', '00321060': 'LO', '00321064': 'SQ', '00324000': 'LT', '00380010': 'LO', '00380050': 'LO', '00380300': 'LO', '00380500': 'LO',
    '00400002': 'DA', '00400244': 'DA', '00400245': 'TM', '00400253': 'SH', '00400254': 'LO', '00400260': 'SQ', '00400275': 'SQ', '00401001': 'SH',
    '00402016': 'LO', '00402017': 'LO', '004008EA': 'SQ', '00400555': 'SQ',
    '0040A010': 'CS', '0040A027': 'LO', '0040A030': 'DT', '0040A032': 'DT', '0040A040': 'CS', '0040A043': 'SQ', '0040A050': 'CS', '0040A073': 'SQ',
    '0040A075': 'PN', '0040A078': 'SQ', '0040A07A': 'SQ', '0040A07C': 'SQ', '0040A088': 'SQ', '0040A120': 'DT', '0040A121': 'DA', '0040A122': 'TM',
    '0040A123': 'PN', '0040A124': 'UI', '0040A130': 'CS', '0040A132': 'UL', '0040A138': 'DS', '0040A13A': 'DT', '0040A160': 'UT', '0040A168': 'SQ',
    '0040A170': 'SQ', '0040A300': 'SQ', '0040A30A': 'DS', '0040A360': 'SQ', '0040A370': 'SQ', '0040A372': 'SQ', '0040A375': 'SQ', '0040A385': 'SQ',
    '0040A491': 'CS', '0040A492': 'LO', '0040A493': 'CS', '0040A504': 'SQ', '0040A525': 'SQ', '0040A730': 'SQ', '0040DB00': 'CS', '0040DB06': 'DT',
    '0040DB07': 'DT', '0040DB0B': 'CS', '0040DB0C': 'UI', '0040DB0D': 'UI', '0040A801': 'SQ', '0040A0B0': 'US', '0040A180': 'US', '0040A195': 'SQ',
    '00420010': 'ST', '00420011': 'OB', '00420012': 'LO', '00420013': 'SQ', '00420014': 'LO', '00420015': 'UL',
    '00540016': 'SQ', '00880140': 'UI', '00880200': 'SQ',
    '00620001': 'CS', '00620002': 'SQ', '00620003': 'SQ', '00620004': 'US', '00620005': 'LO', '00620006': 'ST', '00620008': 'CS', '00620009': 'LO',
    '0062000A': 'SQ', '0062000B': 'US', '0062000C': 'US', '0062000D': 'US', '0062000E': 'US', '0062000F': 'SQ', '00620010': 'CS', '00620013': 'CS',
    '00620020': 'UT',
    '00700022': 'FL', '00700023': 'CS', '00700080': 'CS', '00700081': 'LO', '00700082': 'DA', '00700083': 'TM', '00700084': 'PN',
    '30060002': 'SH', '30060004': 'LO', '30060006': 'ST', '30060008': 'DA', '30060009': 'TM', '30060010': 'SQ', '30060012': 'SQ', '30060014': 'SQ',
    '30060016': 'SQ', '30060020': 'SQ', '30060022': 'IS', '30060024': 'UI', '30060026': 'LO', '30060028': 'ST', '3006002A': 'IS', '30060036': 'CS',
    '30060039': 'SQ', '30060040': 'SQ', '30060042': 'CS', '30060044': 'DS', '30060046': 'IS', '30060048': 'IS', '30060050': 'DS', '30060080': 'SQ',
    '30060082': 'IS', '30060084': 'IS', '30060085': 'SH', '30060088': 'ST', '300600A4': 'CS', '300600A6': 'PN', '300600C0': 'SQ',
    '300A0002': 'SH', '300A0003': 'LO', '300A0004': 'ST', '300A0006': 'DA', '300A0007': 'TM', '300A000A': 'CS', '300A000C': 'CS', '300A0010': 'SQ',
    '300A0012': 'IS', '300A0013': 'UI', '300A0014': 'CS', '300A0016': 'LO', '300A0018': 'DS', '300A0020': 'CS', '300A0023': 'DS', '300A0026': 'DS',
    '300A0070': 'SQ', '300A0071': 'IS', '300A0078': 'IS', '300A0080': 'IS', '300A0084': 'DS', '300A0086': 'DS', '300A00A0': 'IS', '300A00B0': 'SQ',
    '300A00B2': 'SH', '300A00B3': 'CS', '300A00B4': 'DS', '300A00B6': 'SQ', '300A00B8': 'CS', '300A00BC': 'IS', '300A00BE': 'DS', '300A00C0': 'IS',
    '300A00C2': 'LO', '300A00C3': 'ST', '300A00C4': 'CS', '300A00C6': 'CS', '300A00CE': 'CS', '300A00D0': 'IS', '300A00E0': 'IS', '300A00ED': 'IS',
    '300A00F0': 'IS', '300A010E': 'DS', '300A0110': 'IS', '300A0111': 'SQ', '300A0112': 'IS', '300A0114': 'DS', '300A0115': 'DS', '300A011A': 'SQ',
    '300A011C': 'DS', '300A011E': 'DS', '300A011F': 'CS', '300A0120': 'DS', '300A0121': 'CS', '300A0122': 'DS', '300A0123': 'CS', '300A0125': 'DS',
    '300A0126': 'CS', '300A012C': 'DS', '300A0130': 'DS', '300A0134': 'DS', '300A0180': 'SQ', '300A0182': 'IS', '300A0178': 'CS',
    '300C0002': 'SQ', '300C0004': 'SQ', '300C0006': 'IS', '300C0022': 'IS', '300C0060': 'SQ', '300C006A': 'IS', '300E0002': 'CS', '300E0004': 'DA',
    '300E0005': 'TM', '300E0008': 'PN',
    '003A0004': 'CS', '003A0005': 'US', '003A0010': 'UL', '003A001A': 'DS', '003A0020': 'SH', '003A0200': 'SQ', '003A0202': 'IS', '003A0203': 'SH',
    '003A0205': 'CS', '003A0208': 'SQ', '003A0209': 'SQ', '003A020A': 'SQ', '003A020C': 'LO', '003A0210': 'DS', '003A0211': 'SQ', '003A0212': 'DS',
    '003A0213': 'DS', '003A0214': 'DS', '003A0215': 'DS', '003A0218': 'DS', '003A021A': 'US', '003A0220': 'DS', '003A0221': 'DS', '003A0222': 'DS',
    '003A0223': 'DS', '003A0300': 'SQ', '003A0301': 'IS', '003A0302': 'CS',
    '54000100': 'SQ', '54001004': 'US', '54001006': 'CS', '5400100A': 'OW', '54001010': 'OW',
    '7FE00008': 'OF', '7FE00009': 'OD', '7FE00010': 'OW', 'FFFCFFFC': 'OB',
    '52009229': 'SQ', '52009230': 'SQ',
  });

  // Dictionary VR of a tag (repeating groups and group lengths included); '' when unknown.
  function vrOf(tag) {
    tag = normTag(tag);
    if (VR_DICT[tag]) return VR_DICT[tag];
    const g = parseInt(tag.slice(0, 4), 16), e = parseInt(tag.slice(4), 16);
    if (e === 0) return 'UL';
    if (g % 2 === 1 && e >= 0x10 && e <= 0xFF) return 'LO';   // private creator
    if (g >= 0x6000 && g <= 0x601E && g % 2 === 0) {
      return { 0x0010: 'US', 0x0011: 'US', 0x0015: 'IS', 0x0022: 'LO', 0x0040: 'CS', 0x0045: 'LO', 0x0050: 'SS', 0x0051: 'US', 0x0100: 'US', 0x0102: 'US', 0x1500: 'LO', 0x3000: 'OW' }[e] || '';
    }
    return '';
  }

  function normTag(t) {
    let s = String(t).replace(/[(),\s]/g, '');
    if (/^x/i.test(s)) s = s.slice(1);
    return s.toUpperCase();
  }

  /* ── Bytes ── */
  const toU8 = D.toU8;
  function concat(chunks, total) {
    if (total === undefined) { total = 0; for (const c of chunks) total += c.length; }
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }
  function swapped(bytes, size) {
    const out = new Uint8Array(bytes.length);
    const m = bytes.length - (bytes.length % size);
    for (let i = 0; i < m; i += size) for (let k = 0; k < size; k++) out[i + k] = bytes[i + size - 1 - k];
    out.set(bytes.subarray(m), m);
    return out;
  }
  const latin1 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return s; };
  function decodeText(u8, utf8) {
    if (utf8 && typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(u8);
    return latin1(u8);
  }
  function encodeText(s, utf8) {
    if (utf8 && typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xFF;
    return out;
  }

  function inflateSync(bytes) {
    if (IS_NODE) {
      try {
        const zlib = require('zlib');
        const out = zlib.inflateRawSync(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
        return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
      } catch { /* fall back */ }
    }
    return D.inflateRawSync(bytes);
  }

  /* ── Parse ── */
  function parse(input) {
    const framed = D.framePart10(toU8(input));
    let b = framed.bytes;
    if (!(b.length >= 132 && b[128] === 0x44 && b[129] === 0x49 && b[130] === 0x43 && b[131] === 0x4D)) throw new Error('Not a DICOM file');
    // File meta: always explicit VR little endian, group 0002 only.
    const metaCtx = { b, explicit: true, little: true };
    const metaRes = readElements(metaCtx, 132, b.length, { groupOnly: 2 });
    const meta = metaRes.elements;
    const tsEl = meta.find((e) => e.tag === '00020010');
    let ts = tsEl ? textOf(tsEl.value).replace(/[\0\s]+$/g, '') : (framed.ts || TS.EXPLICIT_LE);
    let pos = metaRes.pos;
    if (ts === TS.DEFLATED_LE) {
      const inflated = inflateSync(b.subarray(pos));
      b = concat([b.subarray(0, pos), inflated]);
    }
    const ctx = { b, explicit: ts !== TS.IMPLICIT_LE, little: ts !== TS.EXPLICIT_BE };
    const body = readElements(ctx, pos, b.length, {});
    const model = { meta, elements: body.elements, transferSyntax: ts, layout: framed.layout };
    if (body.error) model.warning = body.error;
    return model;
  }

  const textOf = (u8) => latin1(u8);

  function readElements(ctx, pos, end, { groupOnly, untilItemEnd }) {
    const { b } = ctx;
    const out = [];
    const u16 = (p) => (ctx.little ? b[p] | (b[p + 1] << 8) : (b[p] << 8) | b[p + 1]);
    const u32 = (p) => (ctx.little ? (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0 : ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0);
    while (pos + 8 <= end) {
      const g = u16(pos), e = u16(pos + 2);
      if (groupOnly !== undefined && g !== groupOnly) break;
      if (g === 0xFFFE) {
        if (e === 0xE00D) return { elements: out, pos: pos + 8 };   // item delimitation
        pos += 8;   // stray delimiter
        continue;
      }
      const tag = hex4(g) + hex4(e);
      let vr = '', len, head;
      if (ctx.explicit) {
        vr = String.fromCharCode(b[pos + 4], b[pos + 5]);
        if (!ALL_VR.has(vr)) {
          // Not a VR: an implicit element inside an explicit file (seen in the wild) — read it as implicit.
          vr = vrOf(tag) || 'UN'; len = (b[pos + 4] | (b[pos + 5] << 8) | (b[pos + 6] << 16) | (b[pos + 7] << 24)) >>> 0; head = 8;
          if (!ctx.little) len = u32(pos + 4);
        } else if (LONG_VR.has(vr)) { if (pos + 12 > end) break; len = u32(pos + 8); head = 12; }
        else { len = u16(pos + 6); head = 8; }
      } else {
        vr = vrOf(tag) || 'UN';
        len = u32(pos + 4); head = 8;
      }
      const start = pos + head;
      // Pixel data with undefined length: encapsulated fragments.
      if (len === UNDEF && (tag === '7FE00010' || tag === '7FE00008' || tag === '7FE00009' || (vr !== 'SQ' && vr !== 'UN' && ctx.explicit))) {
        const r = readFragments(ctx, start, end);
        out.push({ tag, vr: vr === 'UN' || !vr || !ctx.explicit ? 'OB' : vr, fragments: r.fragments, offsetTable: r.offsetTable });
        pos = r.pos;
        continue;
      }
      // Sequences: SQ, undefined-length UN / implicit, or implicit data that starts with an item tag.
      const looksSeq = vr === 'SQ' || len === UNDEF
        || (!ctx.explicit && vr === 'UN' && len >= 8 && start + 4 <= end && u16(start) === 0xFFFE && u16(start + 2) === 0xE000);
      if (looksSeq) {
        // An explicit UN sequence is encoded implicit VR little endian.
        const sctx = vr === 'UN' && ctx.explicit ? { b, explicit: false, little: true } : ctx;
        const r = readItems(sctx, start, len === UNDEF ? end : Math.min(end, start + len), len === UNDEF);
        out.push({ tag, vr: 'SQ', items: r.items });
        pos = r.pos;
        continue;
      }
      if (start + len > end) {
        // Truncated file: keep what is there.
        out.push({ tag, vr, value: b.slice(start, end) });
        return { elements: out, pos: end, error: `Element (${tag.slice(0, 4)},${tag.slice(4)}) runs past the end of the file` };
      }
      let value = b.subarray(start, start + len);
      if (!ctx.little && SWAP[vr]) value = swapped(value, SWAP[vr]);
      out.push({ tag, vr, value });
      pos = start + len;
    }
    void untilItemEnd;
    return { elements: out, pos };
  }

  function readItems(ctx, pos, end, undefinedLength) {
    const { b } = ctx;
    const u16 = (p) => (ctx.little ? b[p] | (b[p + 1] << 8) : (b[p] << 8) | b[p + 1]);
    const u32 = (p) => (ctx.little ? (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0 : ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0);
    const items = [];
    while (pos + 8 <= end) {
      const g = u16(pos), e = u16(pos + 2), len = u32(pos + 4);
      if (g === 0xFFFE && e === 0xE0DD) return { items, pos: pos + 8 };
      if (g !== 0xFFFE || e !== 0xE000) break;   // not an item: corrupt sequence, stop here
      const start = pos + 8;
      // offset: file position of the item tag (DICOMDIR records are linked by it)
      if (len === UNDEF) {
        const r = readElements(ctx, start, end, { untilItemEnd: true });
        items.push({ elements: r.elements, offset: pos });
        pos = r.pos;
      } else {
        const r = readElements(ctx, start, Math.min(end, start + len), {});
        items.push({ elements: r.elements, offset: pos });
        pos = start + len;
      }
    }
    return { items, pos: undefinedLength ? pos : end };
  }

  function readFragments(ctx, pos, end) {
    const { b } = ctx;
    const u16 = (p) => b[p] | (b[p + 1] << 8);   // encapsulated items are little endian
    const u32 = (p) => (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
    const frags = [];
    let offsetTable = null;
    while (pos + 8 <= end) {
      const g = u16(pos), e = u16(pos + 2), len = u32(pos + 4);
      if (g === 0xFFFE && e === 0xE0DD) { pos += 8; break; }
      if (g !== 0xFFFE || e !== 0xE000) break;
      const data = b.subarray(pos + 8, Math.min(end, pos + 8 + len));
      if (offsetTable === null) offsetTable = data; else frags.push(data);
      pos += 8 + len;
    }
    return { fragments: frags, offsetTable: offsetTable || new Uint8Array(0), pos };
  }

  const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, '0');

  /* ── Access ── */
  function isUtf8(model) {
    const cs = model.elements.find((e) => e.tag === '00080005');
    return !!(cs && cs.value && /ISO_IR 192/.test(latin1(cs.value)));
  }

  // [container elements array, tag] for a tag or path
  function resolve(model, tag, create) {
    const parts = String(tag).split('/');
    let list = null;
    const first = normTag(parts[0]);
    list = first.startsWith('0002') ? model.meta : model.elements;
    for (let i = 0; i + 2 < parts.length; i += 2) {
      const t = normTag(parts[i]), idx = parseInt(parts[i + 1], 10);
      let sq = list.find((e) => e.tag === t);
      if (!sq) {
        if (!create) return null;
        sq = { tag: t, vr: 'SQ', items: [] };
        insertSorted(list, sq);
      }
      if (!sq.items) return null;
      while (create && sq.items.length <= idx) sq.items.push({ elements: [] });
      if (!sq.items[idx]) return null;
      list = sq.items[idx].elements;
    }
    return { list, tag: normTag(parts[parts.length - 1]) };
  }

  function insertSorted(list, el) {
    let i = list.findIndex((e) => e.tag > el.tag);
    if (i < 0) i = list.length;
    list.splice(i, 0, el);
  }

  function findElement(model, tag) {
    const r = resolve(model, tag, false);
    return r ? r.list.find((e) => e.tag === r.tag) || null : null;
  }

  // Value of an element: string (text VRs), number / number[] (binary numbers), 'GGGGEEEE' (AT), Uint8Array, items, or undefined.
  function valueOf(el, utf8) {
    if (!el) return undefined;
    if (el.items) return el.items;
    if (el.fragments) return el.fragments;
    const v = el.value || new Uint8Array(0);
    if (TEXT_VR.has(el.vr)) {
      let s = decodeText(v, utf8 && !['UI', 'DA', 'TM', 'DT', 'AS', 'CS', 'DS', 'IS', 'AE'].includes(el.vr));
      s = el.vr === 'UI' ? s.replace(/[\0 ]+$/g, '') : s.replace(/[\0 ]+$/g, '');
      if (el.vr !== 'LT' && el.vr !== 'ST' && el.vr !== 'UT') s = s.replace(/^ +/, '');
      return s;
    }
    if (NUM_VR[el.vr]) {
      const size = NUM_VR[el.vr];
      const dv = new DataView(v.buffer, v.byteOffset, v.byteLength);
      const vals = [];
      for (let i = 0; i + size <= v.length; i += size) {
        switch (el.vr) {
          case 'US': vals.push(dv.getUint16(i, true)); break;
          case 'SS': vals.push(dv.getInt16(i, true)); break;
          case 'UL': vals.push(dv.getUint32(i, true)); break;
          case 'SL': vals.push(dv.getInt32(i, true)); break;
          case 'FL': vals.push(dv.getFloat32(i, true)); break;
          case 'FD': vals.push(dv.getFloat64(i, true)); break;
          case 'SV': vals.push(Number(dv.getBigInt64(i, true))); break;
          case 'UV': vals.push(Number(dv.getBigUint64(i, true))); break;
          default: break;
        }
      }
      return vals.length === 1 ? vals[0] : vals;
    }
    if (el.vr === 'AT') {
      const vals = [];
      for (let i = 0; i + 4 <= v.length; i += 4) vals.push(hex4(v[i] | (v[i + 1] << 8)) + hex4(v[i + 2] | (v[i + 3] << 8)));
      return vals.length === 1 ? vals[0] : vals;
    }
    return v;
  }

  function get(model, tag) { return valueOf(findElement(model, tag), isUtf8(model)); }

  function fmtDS(n) {
    if (!Number.isFinite(n)) return '0';
    let s = String(n);
    for (let p = 15; s.length > 16 && p > 1; p--) s = String(+n.toPrecision(p));
    if (s.length > 16) s = n.toExponential(8);
    return s;
  }

  // Encode a JS value for a VR → Uint8Array (padded to even length).
  function encodeValue(value, vr, utf8) {
    if (value instanceof Uint8Array) {
      return value.length % 2 ? concat([value, new Uint8Array(1)]) : value;
    }
    if (TEXT_VR.has(vr)) {
      let s;
      if (Array.isArray(value)) s = value.map((x) => (typeof x === 'number' ? (vr === 'IS' ? String(Math.round(x)) : fmtDS(x)) : String(x))).join('\\');
      else if (typeof value === 'number') s = vr === 'IS' ? String(Math.round(value)) : fmtDS(value);
      else s = String(value == null ? '' : value);
      let u8 = encodeText(s, utf8 && !['UI', 'DA', 'TM', 'DT', 'AS', 'CS', 'DS', 'IS', 'AE'].includes(vr));
      if (u8.length % 2) u8 = concat([u8, new Uint8Array([vr === 'UI' ? 0 : 0x20])]);
      return u8;
    }
    if (NUM_VR[vr]) {
      const vals = Array.isArray(value) ? value : (value === '' || value == null ? [] : typeof value === 'string' ? value.split('\\').map(Number) : [value]);
      const size = NUM_VR[vr];
      const out = new Uint8Array(vals.length * size);
      const dv = new DataView(out.buffer);
      vals.forEach((x, i) => {
        const o = i * size;
        switch (vr) {
          case 'US': dv.setUint16(o, x, true); break;
          case 'SS': dv.setInt16(o, x, true); break;
          case 'UL': dv.setUint32(o, x, true); break;
          case 'SL': dv.setInt32(o, x, true); break;
          case 'FL': dv.setFloat32(o, x, true); break;
          case 'FD': dv.setFloat64(o, x, true); break;
          case 'SV': dv.setBigInt64(o, BigInt(Math.round(x)), true); break;
          case 'UV': dv.setBigUint64(o, BigInt(Math.round(x)), true); break;
          default: break;
        }
      });
      return out;
    }
    if (vr === 'AT') {
      const vals = Array.isArray(value) ? value : [value];
      const out = new Uint8Array(vals.length * 4);
      vals.forEach((t, i) => {
        const h = normTag(t), g = parseInt(h.slice(0, 4), 16), e = parseInt(h.slice(4), 16);
        out[i * 4] = g & 0xFF; out[i * 4 + 1] = g >> 8; out[i * 4 + 2] = e & 0xFF; out[i * 4 + 3] = e >> 8;
      });
      return out;
    }
    if (typeof value === 'string') return encodeValue(encodeText(value, utf8), vr);
    if (value && value.buffer) return encodeValue(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), vr);
    throw new Error(`Cannot encode a ${typeof value} as ${vr}`);
  }

  // Set (or create) an element. Sequences: value = [{ elements }] items.
  function set(model, tag, value, vr) {
    const r = resolve(model, tag, true);
    let el = r.list.find((e) => e.tag === r.tag);
    const useVr = vr || (el && el.vr !== 'UN' ? el.vr : '') || vrOf(r.tag) || (typeof value === 'string' ? 'LO' : value instanceof Uint8Array ? 'OB' : typeof value === 'number' ? 'DS' : 'UN');
    if (!el) { el = { tag: r.tag, vr: useVr }; insertSorted(r.list, el); }
    el.vr = useVr;
    delete el.items; delete el.fragments; delete el.offsetTable; delete el.value;
    if (useVr === 'SQ') { el.items = (value || []).map((it) => (it && it.elements ? it : { elements: [] })); return el; }
    let utf8 = isUtf8(model);
    if (!utf8 && typeof value === 'string' && /[^\x00-\xFF]/.test(value) && TEXT_VR.has(useVr)) { toUtf8(model); utf8 = true; }
    el.value = encodeValue(value, useVr, utf8);
    return el;
  }

  function remove(model, tag) {
    const r = resolve(model, tag, false);
    if (!r) return false;
    const i = r.list.findIndex((e) => e.tag === r.tag);
    if (i < 0) return false;
    r.list.splice(i, 1);
    return true;
  }

  // Re-encode every text element as UTF-8 and declare ISO_IR 192 (for values outside Latin-1).
  function toUtf8(model) {
    if (isUtf8(model)) return;
    const visit = (list) => {
      for (const el of list) {
        if (el.items) { el.items.forEach((it) => visit(it.elements)); continue; }
        if (el.value && TEXT_VR.has(el.vr) && !['UI', 'DA', 'TM', 'DT', 'AS', 'CS', 'DS', 'IS', 'AE'].includes(el.vr)) {
          el.value = encodeValue(latin1(el.value).replace(/[\0 ]+$/g, ''), el.vr, true);
        }
      }
    };
    visit(model.elements);
    const cs = model.elements.find((e) => e.tag === '00080005');
    if (cs) cs.value = encodeValue('ISO_IR 192', 'CS'); else insertSorted(model.elements, { tag: '00080005', vr: 'CS', value: encodeValue('ISO_IR 192', 'CS') });
  }

  /* ── Write ── */
  function header(tag, vr, len, explicit) {
    const g = parseInt(tag.slice(0, 4), 16), e = parseInt(tag.slice(4), 16);
    const long = !explicit || LONG_VR.has(vr) || vr === 'SQ';
    const h = new Uint8Array(explicit ? (long ? 12 : 8) : 8);
    h[0] = g & 0xFF; h[1] = g >> 8; h[2] = e & 0xFF; h[3] = e >> 8;
    if (!explicit) { new DataView(h.buffer).setUint32(4, len >>> 0, true); return h; }
    h[4] = vr.charCodeAt(0); h[5] = vr.charCodeAt(1);
    if (long) new DataView(h.buffer).setUint32(8, len >>> 0, true);
    else { h[6] = len & 0xFF; h[7] = (len >> 8) & 0xFF; }
    return h;
  }

  function itemHeader(e, len) {
    const h = new Uint8Array(8);
    h[0] = 0xFE; h[1] = 0xFF; h[2] = e & 0xFF; h[3] = e >> 8;
    new DataView(h.buffer).setUint32(4, len >>> 0, true);
    return h;
  }

  // Encode a list of elements (sorted; group lengths recomputed) → array of chunks + total length.
  function encodeList(list, explicit) {
    const sorted = list.slice().sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
    const parts = sorted.map((el) => encodeElement(el, explicit));
    // group lengths (gggg,0000): bytes of the rest of the group
    sorted.forEach((el, i) => {
      if (el.tag.slice(4) !== '0000') return;
      let n = 0;
      for (let k = i + 1; k < sorted.length && sorted[k].tag.slice(0, 4) === el.tag.slice(0, 4); k++) n += parts[k].length;
      const v = new Uint8Array(4); new DataView(v.buffer).setUint32(0, n, true);
      parts[i] = encodeElement({ tag: el.tag, vr: 'UL', value: v }, explicit);
    });
    const chunks = [];
    let length = 0;
    for (const p of parts) { chunks.push(...p.chunks); length += p.length; }
    return { chunks, length };
  }

  function encodeElement(el, explicit) {
    let vr = el.vr || vrOf(el.tag) || 'UN';
    if (el.fragments) {
      const chunks = [header(el.tag, vr === 'OW' ? 'OW' : 'OB', UNDEF, explicit)];
      let length = chunks[0].length;
      const bot = el.offsetTable || new Uint8Array(0);
      chunks.push(itemHeader(0xE000, bot.length), bot); length += 8 + bot.length;
      for (const f of el.fragments) {
        const data = f.length % 2 ? concat([f, new Uint8Array(1)]) : f;
        chunks.push(itemHeader(0xE000, data.length), data); length += 8 + data.length;
      }
      chunks.push(itemHeader(0xE0DD, 0)); length += 8;
      return { chunks, length };
    }
    if (el.items) {
      const inner = [];
      let len = 0;
      for (const it of el.items) {
        const enc = encodeList(it.elements, explicit);
        inner.push(itemHeader(0xE000, enc.length), ...enc.chunks);
        len += 8 + enc.length;
      }
      const h = header(el.tag, 'SQ', len, explicit);
      return { chunks: [h, ...inner], length: h.length + len };
    }
    let value = el.value || new Uint8Array(0);
    if (value.length % 2) value = concat([value, new Uint8Array([TEXT_VR.has(vr) && vr !== 'UI' ? 0x20 : 0])]);
    if (explicit && !LONG_VR.has(vr) && value.length > 0xFFFF) vr = 'UN';   // too long for a 16-bit length
    const h = header(el.tag, vr, value.length, explicit);
    return { chunks: [h, value], length: h.length + value.length };
  }

  function buildMeta(model, opts, ts) {
    const find = (list, tag) => list.find((e) => e.tag === tag);
    const text = (list, tag) => { const e = find(list, tag); return e && e.value ? latin1(e.value).replace(/[\0 ]+$/g, '').trim() : ''; };
    const sopClass = opts.sopClassUid || text(model.elements, '00080016') || text(model.meta, '00020002');
    const sopInst = opts.sopInstanceUid || text(model.elements, '00080018') || text(model.meta, '00020003');
    const meta = [
      { tag: '00020001', vr: 'OB', value: new Uint8Array([0, 1]) },
      { tag: '00020002', vr: 'UI', value: encodeValue(sopClass, 'UI') },
      { tag: '00020003', vr: 'UI', value: encodeValue(sopInst, 'UI') },
      { tag: '00020010', vr: 'UI', value: encodeValue(ts, 'UI') },
      { tag: '00020012', vr: 'UI', value: encodeValue(IMPLEMENTATION_CLASS_UID, 'UI') },
      { tag: '00020013', vr: 'SH', value: encodeValue(IMPLEMENTATION_VERSION, 'SH') },
    ];
    for (const keep of ['00020016', '00020017', '00020018', '00020100', '00020102']) {
      const e = find(model.meta || [], keep);
      if (e && e.value) meta.push({ tag: e.tag, vr: e.vr, value: e.value });
    }
    const enc = encodeList(meta, true);
    const gl = new Uint8Array(4); new DataView(gl.buffer).setUint32(0, enc.length, true);
    const glEl = encodeElement({ tag: '00020000', vr: 'UL', value: gl }, true);
    return { chunks: [...glEl.chunks, ...enc.chunks], length: glEl.length + enc.length };
  }

  const hasEncapsulated = (model) => model.elements.some((e) => e.fragments);

  /** Model → Part 10 bytes. transferSyntax: Explicit VR LE (default) or Implicit VR LE for native pixel data;
   *  a model with encapsulated pixel data keeps its own (compressed) transfer syntax. */
  function write(model, opts = {}) {
    const encapsulated = hasEncapsulated(model);
    let ts = opts.transferSyntax || (encapsulated ? model.transferSyntax : TS.EXPLICIT_LE);
    if (encapsulated && ts !== model.transferSyntax) {
      throw new Error(`Encapsulated pixel data cannot be rewritten as ${ts} — use decompress() first`);
    }
    if (!encapsulated && ts !== TS.EXPLICIT_LE && ts !== TS.IMPLICIT_LE) throw new Error(`Writing ${ts} is not supported (Explicit or Implicit VR Little Endian)`);
    const explicit = ts !== TS.IMPLICIT_LE;
    // Media Storage SOP Class / Instance must not be empty: fill in a missing SOP Instance UID (and, for an
    // image without any SOP Class, Secondary Capture) in the data set as well, so both agree.
    let elements = model.elements;
    const filled = (list, tag) => (list || []).some((e) => e.tag === tag && e.value && /[^\0 ]/.test(latin1(e.value)));
    if (!opts.sopInstanceUid && !filled(elements, '00080018') && !filled(model.meta, '00020003')) {
      elements = elements.filter((e) => e.tag !== '00080018').concat({ tag: '00080018', vr: 'UI', value: encodeValue(newUid(), 'UI') });
    }
    if (!opts.sopClassUid && !filled(elements, '00080016') && !filled(model.meta, '00020002') && elements.some((e) => e.tag === '7FE00010')) {
      elements = elements.filter((e) => e.tag !== '00080016').concat({ tag: '00080016', vr: 'UI', value: encodeValue(SC.SINGLE, 'UI') });
    }
    const meta = buildMeta({ meta: model.meta, elements }, opts, ts);
    const body = encodeList(elements.filter((e) => !e.tag.startsWith('0002')), explicit);
    const pre = new Uint8Array(132);
    pre.set([0x44, 0x49, 0x43, 0x4D], 128);
    return concat([pre, ...meta.chunks, ...body.chunks], 132 + meta.length + body.length);
  }

  /* ── UIDs ── */
  function randomBytes(n) {
    const out = new Uint8Array(n);
    const c = (typeof globalThis !== 'undefined' && globalThis.crypto) || (IS_NODE ? require('crypto').webcrypto : null);
    if (c && c.getRandomValues) c.getRandomValues(out);
    else for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
    return out;
  }
  function newUid() {
    const b = randomBytes(16);
    b[6] = (b[6] & 0x0F) | 0x40; b[8] = (b[8] & 0x3F) | 0x80;   // UUID v4 bits (ITU-T X.667 2.25 form)
    let n = 0n;
    for (const x of b) n = (n << 8n) | BigInt(x);
    return `2.25.${n.toString()}`;
  }

  /* ── Decompress ── */
  async function decompress(input) {
    const bytes = toU8(input);
    const img = await D.load(bytes);
    const model = parse(bytes);
    const rows = img.height, cols = img.width, n = rows * cols, frames = img.frames;
    const gray = img.gray;
    let bitsAllocated = img.bitsAllocated;
    if (bitsAllocated === 12) bitsAllocated = 16;
    const parts = [];
    let spp = gray ? 1 : 3;
    for (let f = 0; f < frames; f++) {
      const rf = await img.rawFrame(f);
      const s = rf.samples;
      if (gray) { parts.push(s.length > n ? s.subarray(0, n) : s); continue; }
      const k = rf.spp || 3;
      const pl = rf.planar;
      const max = bitsAllocated > 8 ? (2 ** Math.min(32, img.bitsStored)) - 1 : 255;
      const out = bitsAllocated <= 8 ? new Uint8ClampedArray(n * 3) : bitsAllocated <= 16 ? new Uint16Array(n * 3) : new Float64Array(n * 3);
      const half = bitsAllocated <= 8 ? 128 : 2 ** (img.bitsStored - 1);
      for (let p = 0; p < n; p++) {
        let r = s[pl ? p : p * k], g = s[pl ? n + p : p * k + 1], b = s[pl ? 2 * n + p : p * k + 2];
        if (rf.ybr) {
          const y = r, cb = g - half, cr = b - half;
          r = y + 1.402 * cr; g = y - 0.344136 * cb - 0.714136 * cr; b = y + 1.772 * cb;
          if (bitsAllocated > 8) { r = Math.max(0, Math.min(max, Math.round(r))); g = Math.max(0, Math.min(max, Math.round(g))); b = Math.max(0, Math.min(max, Math.round(b))); }
        }
        out[p * 3] = r; out[p * 3 + 1] = g; out[p * 3 + 2] = b;
      }
      parts.push(out);
    }
    const pixel = packSamples(parts, { bitsAllocated, spp, isFloat: img.isFloat, n: n * spp });
    // Pixel module
    for (const t of ['7FE00010', '7FE00008', '7FE00009']) remove(model, t);
    if (img.isFloat) model.elements.push({ tag: bitsAllocated === 64 ? '7FE00009' : '7FE00008', vr: bitsAllocated === 64 ? 'OD' : 'OF', value: pixel });
    else model.elements.push({ tag: '7FE00010', vr: bitsAllocated > 8 ? 'OW' : 'OB', value: pixel });
    model.elements.sort((a, b) => (a.tag < b.tag ? -1 : 1));
    set(model, '00280002', spp, 'US');
    if (!gray) { set(model, '00280004', 'RGB'); set(model, '00280006', 0, 'US'); } else remove(model, '00280006');
    if (!img.isFloat) set(model, '00280100', bitsAllocated, 'US');
    if (img.bitsAllocated === 12) { set(model, '00280101', Math.min(12, img.bitsStored), 'US'); }
    if (img.lossy) {
      set(model, '00282110', '01');
      const method = { [TS.J2K]: 'ISO_15444_1', [TS.HTJ2K]: 'ISO_15444_15', [TS.JPEG_LS]: 'ISO_14495_1' }[img.transferSyntax] || (D.JPEG_FAMILY.has(img.transferSyntax) ? 'ISO_10918_1' : '');
      if (method && get(model, '00282114') === undefined) set(model, '00282114', method);
    }
    model.transferSyntax = TS.EXPLICIT_LE;
    img.release();
    return write(model, { transferSyntax: TS.EXPLICIT_LE });
  }

  // Frames of samples → native pixel bytes (little endian; 1-bit packed continuously across frames).
  function packSamples(frames, { bitsAllocated, isFloat, n }) {
    const count = frames.length * n;
    if (isFloat) {
      const size = bitsAllocated === 64 ? 8 : 4;
      const out = new Uint8Array(count * size);
      const dv = new DataView(out.buffer);
      let o = 0;
      for (const fr of frames) for (let i = 0; i < n; i++, o += size) { if (size === 8) dv.setFloat64(o, fr[i], true); else dv.setFloat32(o, fr[i], true); }
      return out;
    }
    if (bitsAllocated === 1) {
      const out = new Uint8Array(Math.ceil(count / 8) + (Math.ceil(count / 8) % 2));
      let bit = 0;
      for (const fr of frames) for (let i = 0; i < n; i++, bit++) if (fr[i] & 1) out[bit >> 3] |= 1 << (bit & 7);
      return out;
    }
    if (bitsAllocated === 8) {
      const out = new Uint8Array(count + (count % 2));
      let o = 0;
      for (const fr of frames) for (let i = 0; i < n; i++) out[o++] = fr[i] & 0xFF;
      return out;
    }
    if (bitsAllocated === 16) {
      const out = new Uint8Array(count * 2);
      let o = 0;
      for (const fr of frames) for (let i = 0; i < n; i++) { const v = fr[i] & 0xFFFF; out[o++] = v & 0xFF; out[o++] = v >> 8; }
      return out;
    }
    if (bitsAllocated === 32) {
      const out = new Uint8Array(count * 4);
      const dv = new DataView(out.buffer);
      let o = 0;
      for (const fr of frames) for (let i = 0; i < n; i++, o += 4) dv.setUint32(o, fr[i] >>> 0, true);
      return out;
    }
    throw new Error(`${bitsAllocated} bits allocated cannot be written`);
  }

  /* ── De-identification ── */
  // Same list as the Anonymise dialog (Dialogs.PHI_TAGS)
  const DEFAULT_PHI_TAGS = [
    '00100010', '00100020', '00100030', '00100040', '00101010',
    '00101000', '00101001', '00101020', '00101030', '00102160', '00104000',
    '00080050', '00080080', '00080081', '00080090', '00081010',
    '00081040', '00081048', '00081050', '00081060', '00081070',
    '00200010', '00080020', '00080021', '00080022', '00080023',
    '00080030', '00080031', '00080032', '00080033', '00081030', '0008103E',
    '00181000', '00321032', '00380010', '00400244', '00400245', '00400253',
  ];
  // Instance UIDs that are replaced (consistently, everywhere in the file, sequences included)
  const UID_TAGS = new Set(['0020000D', '0020000E', '00080018', '00200052', '00081155', '00209164', '30060024', '00080014', '00880140', '0040A124',
    '00041511', '00020003', '0040DB0D', '00080058', '00209161', '0020000E', '300A0013']);

  function anonymize(input, opts = {}) {
    const tags = new Set((opts.tags || DEFAULT_PHI_TAGS).map(normTag));
    const removePrivate = opts.removePrivate !== false;
    const replacement = opts.replacement == null ? 'ANONYMOUS' : String(opts.replacement);
    const newUids = opts.newUids !== false;
    const model = parse(input);
    const utf8 = isUtf8(model);
    const uidMap = new Map();
    const mapUid = (u) => { if (!u) return u; if (!uidMap.has(u)) uidMap.set(u, newUid()); return uidMap.get(u); };
    let count = 0;
    const visit = (list) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const el = list[i];
        const g = parseInt(el.tag.slice(0, 4), 16);
        if (removePrivate && g % 2 === 1) { list.splice(i, 1); count++; continue; }
        if (tags.has(el.tag)) {
          count++;
          if (el.items || el.fragments || !TEXT_VR.has(el.vr)) { list.splice(i, 1); continue; }
          const keep = el.tag === '00100010' || el.tag === '00100020';
          el.value = encodeValue(keep ? replacement : '', el.vr, utf8);
          continue;
        }
        if (el.items) { el.items.forEach((it) => visit(it.elements)); continue; }
        if (newUids && el.vr === 'UI' && UID_TAGS.has(el.tag) && el.value) {
          const vals = latin1(el.value).replace(/[\0 ]+$/g, '').split('\\');
          el.value = encodeValue(vals.map((u) => mapUid(u.trim())).join('\\'), 'UI');
        }
      }
    };
    visit(model.elements);
    if (newUids) {
      const mi = model.meta.find((e) => e.tag === '00020003');
      if (mi && mi.value) mi.value = encodeValue(mapUid(latin1(mi.value).replace(/[\0 ]+$/g, '')), 'UI');
    }
    set(model, '00120062', 'YES');
    set(model, '00120063', opts.method || `MYDCMVIEWER basic profile${removePrivate ? ', private removed' : ''}${newUids ? ', new UIDs' : ''}`.slice(0, 64));
    const ts = model.transferSyntax;
    const out = write(model, { transferSyntax: hasEncapsulated(model) ? ts : (ts === TS.IMPLICIT_LE ? TS.IMPLICIT_LE : TS.EXPLICIT_LE) });
    out.count = count;
    return out;
  }

  /* ── Secondary Capture ── */
  const SC = {
    SINGLE: '1.2.840.10008.5.1.4.1.1.7',
    MF_BYTE: '1.2.840.10008.5.1.4.1.1.7.2',
    MF_WORD: '1.2.840.10008.5.1.4.1.1.7.3',
    MF_RGB: '1.2.840.10008.5.1.4.1.1.7.4',
  };

  function secondaryCapture(opts) {
    const { width, height } = opts;
    if (!(width > 0 && height > 0)) throw new Error('secondaryCapture needs width and height');
    const meta = opts.meta || {};
    const n = width * height;
    const frames = opts.frames && opts.frames.length ? opts.frames : [opts.rgba || opts.gray];
    if (!frames[0]) throw new Error('secondaryCapture needs rgba or gray pixels');
    const isGray = opts.gray ? true : opts.rgba ? false : frames[0].length === n;
    const word = isGray && (frames[0] instanceof Uint16Array || (opts.bits || 8) > 8);
    const bits = isGray ? (word ? Math.min(16, opts.bits || 16) : 8) : 8;
    let sop;
    if (!isGray) sop = frames.length > 1 ? SC.MF_RGB : SC.SINGLE;
    else if (word) sop = SC.MF_WORD;
    else sop = frames.length > 1 ? SC.MF_BYTE : SC.SINGLE;
    const now = new Date();
    const pad = (x, k = 2) => String(x).padStart(k, '0');
    const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const studyUid = meta.studyUid || newUid(), seriesUid = meta.seriesUid || newUid(), sopUid = meta.sopInstanceUid || newUid();
    const model = { meta: [], elements: [], transferSyntax: TS.EXPLICIT_LE };
    const S = (tag, v, vr) => set(model, tag, v, vr);
    S('00080005', 'ISO_IR 192');
    S('00080008', ['DERIVED', 'SECONDARY']);
    S('00080016', sop); S('00080018', sopUid);
    S('00080020', meta.studyDate || date); S('00080030', meta.studyTime || time);
    S('00080023', date); S('00080033', time);
    S('00080050', meta.accessionNumber || ''); S('00080060', meta.modality || 'OT'); S('00080064', 'WSD');
    S('00080090', ''); S('00081030', meta.studyDescription || ''); S('0008103E', meta.seriesDescription || '');
    S('00100010', meta.patientName || ''); S('00100020', meta.patientId || ''); S('00100030', ''); S('00100040', '');
    S('00181016', 'MyDCMViewer'); S('00181018', 'MyDCMViewer');
    S('0020000D', studyUid); S('0020000E', seriesUid); S('00200010', meta.studyId || '');
    S('00200011', meta.seriesNumber || 999); S('00200013', meta.instanceNumber || 1);
    S('00200020', '');
    S('00280002', isGray ? 1 : 3, 'US');
    S('00280004', isGray ? 'MONOCHROME2' : 'RGB');
    if (!isGray) S('00280006', 0, 'US');
    if (frames.length > 1 || sop !== SC.SINGLE) {
      S('00280008', frames.length, 'IS');
      S('00280009', '00181063', 'AT');
      S('00181063', meta.frameTime || 100, 'DS');
    }
    S('00280010', height, 'US'); S('00280011', width, 'US');
    S('00280100', bits, 'US'); S('00280101', bits, 'US'); S('00280102', bits - 1, 'US'); S('00280103', 0, 'US');
    if (isGray) {
      const full = 2 ** bits;
      S('00281050', full / 2, 'DS'); S('00281051', full, 'DS');   // identity window: stored value = display value (8-bit)
      if (word) { S('00281052', 0, 'DS'); S('00281053', 1, 'DS'); S('00281054', 'US'); }
    }
    S('00280301', meta.burnedInAnnotation || 'NO');
    // pixels
    let pixel;
    if (isGray) pixel = packSamples(frames, { bitsAllocated: bits > 8 ? 16 : 8, n });
    else {
      const rgb = frames.map((fr) => {
        const out = new Uint8Array(n * 3);
        const k = fr.length >= n * 4 ? 4 : 3;
        for (let p = 0; p < n; p++) { out[p * 3] = fr[p * k]; out[p * 3 + 1] = fr[p * k + 1]; out[p * 3 + 2] = fr[p * k + 2]; }
        return out;
      });
      pixel = packSamples(rgb, { bitsAllocated: 8, n: n * 3 });
    }
    model.elements.push({ tag: '7FE00010', vr: bits > 8 ? 'OW' : 'OB', value: pixel });
    return write(model, { transferSyntax: TS.EXPLICIT_LE });
  }

  /* ── DICOMDIR ── */
  const RECORD_TYPE = { sr: 'SR DOCUMENT', waveform: 'WAVEFORM', rtplan: 'RT PLAN', rtstruct: 'RT STRUCTURE SET', rtdose: 'RT DOSE',
    pdf: 'ENCAP DOC', cda: 'ENCAP DOC', stl: 'ENCAP DOC', presentation: 'PRESENTATION', image: 'IMAGE', seg: 'IMAGE' };
  /** files: [{ path: ['DIR1', 'FILE1'], bytes }] → DICOMDIR bytes with Patient / Study / Series / Image records. */
  function makeDicomDir(files, opts = {}) {
    const ref = (m, tag) => { const v = get(m, tag); return v === undefined ? '' : v; };
    const patients = new Map();
    for (const f of files) {
      const m = parse(f.bytes);
      const pid = ref(m, '00100020') || '', pname = ref(m, '00100010') || '';
      const pk = `${pid}|${pname}`;
      if (!patients.has(pk)) patients.set(pk, { m, studies: new Map() });
      const p = patients.get(pk);
      const stUid = ref(m, '0020000D');
      if (!p.studies.has(stUid)) p.studies.set(stUid, { m, series: new Map() });
      const st = p.studies.get(stUid);
      const seUid = ref(m, '0020000E');
      if (!st.series.has(seUid)) st.series.set(seUid, { m, images: [] });
      st.series.get(seUid).images.push({ m, path: f.path.map((s) => String(s).toUpperCase()) });
    }
    const T = (tag, v, vr) => ({ tag, vr: vr || vrOf(tag), value: encodeValue(v, vr || vrOf(tag)) });
    const records = [];   // { type, elements, children: [] } in tree order
    const tree = [];
    for (const p of patients.values()) {
      const pr = { type: 'PATIENT', elements: [T('00100010', ref(p.m, '00100010')), T('00100020', ref(p.m, '00100020'))], children: [] };
      tree.push(pr);
      for (const [uid, st] of p.studies) {
        const sr = { type: 'STUDY', elements: [T('00080020', ref(st.m, '00080020')), T('00080030', ref(st.m, '00080030')), T('00080050', ref(st.m, '00080050')),
          T('00081030', ref(st.m, '00081030')), T('0020000D', uid), T('00200010', ref(st.m, '00200010'))], children: [] };
        pr.children.push(sr);
        for (const [suid, se] of st.series) {
          const ser = { type: 'SERIES', elements: [T('00080060', ref(se.m, '00080060') || 'OT'), T('0008103E', ref(se.m, '0008103E')), T('0020000E', suid),
            T('00200011', String(ref(se.m, '00200011') || '1'))], children: [] };
          sr.children.push(ser);
          for (const im of se.images) {
            const sopClass = ref(im.m, '00080016') || ref(im.m, '00020002');
            const kind = D.kindOfSop(sopClass, { hasPixels: im.m.elements.some((e) => e.tag === '7FE00010' || e.tag === '7FE00008' || e.tag === '7FE00009') });
            ser.children.push({ type: RECORD_TYPE[kind] || 'IMAGE', elements: [T('00041500', im.path.join('\\'), 'CS'), T('00041510', sopClass, 'UI'), T('00041511', ref(im.m, '00080018'), 'UI'),
              T('00041512', im.m.transferSyntax, 'UI'), T('00200013', String(ref(im.m, '00200013') || '1'))], children: [] });
          }
        }
      }
    }
    const flatten = (list) => { for (const r of list) { records.push(r); flatten(r.children); } };
    flatten(tree);
    const sopInstance = opts.sopInstanceUid || newUid();
    const build = (offsets) => {
      const items = records.map((r, i) => {
        const o = offsets[i] || {};
        const u32 = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); return b; };
        return { elements: [
          { tag: '00041400', vr: 'UL', value: u32(o.next || 0) },
          { tag: '00041410', vr: 'US', value: new Uint8Array([0xFF, 0xFF]) },
          { tag: '00041420', vr: 'UL', value: u32(o.lower || 0) },
          T('00041430', r.type, 'CS'),
          ...r.elements,
        ] };
      });
      const model = { meta: [], transferSyntax: TS.EXPLICIT_LE, elements: [
        T('00041130', opts.fileSetId || 'MYDCMVIEWER', 'CS'),
        { tag: '00041200', vr: 'UL', value: new Uint8Array(4) },
        { tag: '00041202', vr: 'UL', value: new Uint8Array(4) },
        { tag: '00041212', vr: 'US', value: new Uint8Array(2) },
        { tag: '00041220', vr: 'SQ', items },
      ] };
      if (offsets.root) {
        new DataView(model.elements[1].value.buffer).setUint32(0, offsets.root.first, true);
        new DataView(model.elements[2].value.buffer).setUint32(0, offsets.root.last, true);
      }
      return { model, items };
    };
    // Pass 1: positions of every record item (lengths do not depend on the offset values).
    const first = build([]);
    const bytes1 = write(first.model, { sopClassUid: '1.2.840.10008.1.3.10', sopInstanceUid: sopInstance });
    const metaLen = (() => { const dv = new DataView(bytes1.buffer, bytes1.byteOffset); return 132 + 12 + dv.getUint32(140, true); })();
    let pos = metaLen;
    const pre = encodeList(first.model.elements.slice(0, 4), true);
    pos += pre.length + 12;   // SQ header
    const itemPos = first.items.map((it) => { const p = pos; pos += 8 + encodeList(it.elements, true).length; return p; });
    const offsets = records.map(() => ({}));
    const link = (list) => {
      list.forEach((r, i) => {
        const idx = records.indexOf(r);
        if (i + 1 < list.length) offsets[idx].next = itemPos[records.indexOf(list[i + 1])];
        if (r.children.length) { offsets[idx].lower = itemPos[records.indexOf(r.children[0])]; link(r.children); }
      });
    };
    link(tree);
    offsets.root = { first: tree.length ? itemPos[0] : 0, last: tree.length ? itemPos[records.indexOf(tree[tree.length - 1])] : 0 };
    return write(build(offsets).model, { sopClassUid: '1.2.840.10008.1.3.10', sopInstanceUid: sopInstance });
  }

  /* ── Tag editor listing ── */
  function previewBinary(u8) {
    const head = Array.from(u8.subarray(0, 16), (x) => x.toString(16).padStart(2, '0')).join(' ').toUpperCase();
    return u8.length > 16 ? `${head} … (${u8.length} bytes)` : head;
  }

  function editableTags(model) {
    const out = [];
    const utf8 = isUtf8(model);
    const walk = (list, depth, prefix) => {
      for (const el of list) {
        const path = prefix ? `${prefix}/${el.tag}` : el.tag;
        const label = `(${el.tag.slice(0, 4)},${el.tag.slice(4)})`;
        const name = D.tagName(el.tag);
        const group = el.tag.slice(0, 4);
        if (el.items) {
          out.push({ tag: path, label, name, vr: 'SQ', value: `[sequence: ${el.items.length} item${el.items.length === 1 ? '' : 's'}]`, editable: false, depth });
          el.items.forEach((it, i) => {
            out.push({ tag: `${path}/${i}`, label: '', name: `Item ${i + 1}`, vr: '', value: '', editable: false, depth: depth + 1, item: true });
            walk(it.elements, depth + 1, `${path}/${i}`);
          });
          continue;
        }
        if (el.fragments) {
          out.push({ tag: path, label, name, vr: el.vr, value: `[encapsulated: ${el.fragments.length} fragments]`, editable: false, depth });
          continue;
        }
        const v = valueOf(el, utf8);
        let value, editable;
        if (TEXT_VR.has(el.vr)) { value = v; editable = true; }
        else if (NUM_VR[el.vr] || el.vr === 'AT') {
          const arr = Array.isArray(v) ? v : [v];
          value = arr.map((x) => (typeof x === 'number' && !Number.isInteger(x) ? String(+x.toPrecision(8)) : String(x))).join('\\');
          editable = arr.length <= 64 && el.vr !== 'AT';
        } else { value = el.tag === '7FE00010' ? `[pixel data: ${el.value.length} bytes]` : previewBinary(el.value || new Uint8Array(0)); editable = false; }
        if (group === '0002') editable = false;
        out.push({ tag: path, label, name, vr: el.vr, value, editable, depth });
      }
    };
    walk(model.meta || [], 0, '');
    walk(model.elements, 0, '');
    return out;
  }

  return {
    parse, get, set, remove, write, decompress, anonymize, secondaryCapture, makeDicomDir, newUid, editableTags,
    valueOf, vrOf, encodeValue, packSamples,
    VR_DICT, DEFAULT_PHI_TAGS, IMPLEMENTATION_CLASS_UID, IMPLEMENTATION_VERSION, SC_SOP: SC,
  };
});
