/* DICOM video (MPEG-2 / MPEG-4 AVC (H.264) / HEVC transfer syntaxes): the encapsulated pixel data is one
 * video elementary stream. H.264 and HEVC are wrapped into an MP4 file here so the browser's own video
 * engine (Chromium / WebView2) plays them; MPEG-2 cannot be decoded by a browser and is offered for
 * extraction only.
 *
 * Pure (Node + browser):
 *   DicomVideo.codecOf(transferSyntax)      → 'h264' | 'hevc' | 'mpeg2' | null
 *   DicomVideo.nalUnits(annexB)             → [Uint8Array] (start codes removed)
 *   DicomVideo.analyze(stream, codec)       → { width, height, fps?, samples: [{ data, key, poc }], config }
 *   DicomVideo.toMp4(stream, { codec, fps, width, height }) → Uint8Array (MP4, moov first)
 *   DicomVideo.mimeCodec(codec, analysis)  → 'avc1.64001f' / 'hvc1.1.6.L93.B0' (for canPlayType)
 * Browser:
 *   DicomVideo.player(mp4, { fps, frames, width, height }) → Promise<Player>
 *     player.frame(i) → Promise<Uint8Array RGB (width × height × 3)>   (seeks unless it is the frame on screen)
 *     player.play(onFrame(i)) / pause() / stop() / playing / destroy()
 *   DicomVideo.canPlay(codec, analysis) → boolean
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DicomVideo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TS_CODEC = {
    '1.2.840.10008.1.2.4.100': 'mpeg2', '1.2.840.10008.1.2.4.100.1': 'mpeg2', '1.2.840.10008.1.2.4.101': 'mpeg2', '1.2.840.10008.1.2.4.101.1': 'mpeg2',
    '1.2.840.10008.1.2.4.102': 'h264', '1.2.840.10008.1.2.4.102.1': 'h264', '1.2.840.10008.1.2.4.103': 'h264', '1.2.840.10008.1.2.4.103.1': 'h264',
    '1.2.840.10008.1.2.4.104': 'h264', '1.2.840.10008.1.2.4.104.1': 'h264', '1.2.840.10008.1.2.4.105': 'h264', '1.2.840.10008.1.2.4.105.1': 'h264',
    '1.2.840.10008.1.2.4.106': 'h264', '1.2.840.10008.1.2.4.106.1': 'h264',
    '1.2.840.10008.1.2.4.107': 'hevc', '1.2.840.10008.1.2.4.108': 'hevc',
  };
  const codecOf = (ts) => TS_CODEC[String(ts || '').trim()] || null;

  /* ── Annex B → NAL units ── */
  function nalUnits(b) {
    const out = [];
    let i = 0, start = -1;
    const n = b.length;
    while (i + 2 < n) {
      if (b[i] === 0 && b[i + 1] === 0 && (b[i + 2] === 1 || (b[i + 2] === 0 && i + 3 < n && b[i + 3] === 1))) {
        const sc = b[i + 2] === 1 ? 3 : 4;
        if (start >= 0) { let end = i; while (end > start && b[end - 1] === 0) end--; if (end > start) out.push(b.subarray(start, end)); }
        i += sc; start = i;
      } else i++;
    }
    if (start >= 0 && start < n) out.push(b.subarray(start, n));
    return out;
  }
  // emulation prevention bytes (00 00 03) removed, for parsing headers
  function rbsp(nal, from) {
    const o = [];
    let zeros = 0;
    for (let i = from; i < nal.length; i++) {
      const v = nal[i];
      if (zeros >= 2 && v === 3) { zeros = 0; continue; }
      o.push(v);
      zeros = v === 0 ? zeros + 1 : 0;
    }
    return Uint8Array.from(o);
  }
  class Bits {
    constructor(b) { this.b = b; this.p = 0; }
    u(n) { let v = 0; for (let i = 0; i < n; i++) { const byte = this.b[this.p >> 3] || 0; v = v * 2 + ((byte >> (7 - (this.p & 7))) & 1); this.p++; } return v; }
    ue() { let z = 0; while (this.u(1) === 0 && z < 32) z++; return z ? (2 ** z - 1) + this.u(z) : 0; }
    se() { const k = this.ue(); return k & 1 ? (k + 1) / 2 : -k / 2; }
    skip(n) { this.p += n; }
  }

  /* ── H.264 ── */
  function h264Sps(nal) {
    const r = new Bits(rbsp(nal, 1));
    const profile = r.u(8), compat = r.u(8), level = r.u(8);
    r.ue();   // seq_parameter_set_id
    let chroma = 1, sepPlane = 0;
    if ([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135].includes(profile)) {
      chroma = r.ue();
      if (chroma === 3) sepPlane = r.u(1);
      r.ue(); r.ue(); r.u(1);   // bit depths, qpprime bypass
      if (r.u(1)) for (let i = 0; i < (chroma !== 3 ? 8 : 12); i++) if (r.u(1)) { let last = 8, next = 8; for (let j = 0; j < (i < 6 ? 16 : 64); j++) { if (next) next = (last + r.se() + 256) % 256; last = next || last; } }
    }
    const log2MaxFrameNum = r.ue() + 4;
    const pocType = r.ue();
    let log2MaxPocLsb = 0;
    if (pocType === 0) log2MaxPocLsb = r.ue() + 4;
    else if (pocType === 1) { r.u(1); r.se(); r.se(); const n = r.ue(); for (let i = 0; i < n; i++) r.se(); }
    r.ue(); r.u(1);   // max_num_ref_frames, gaps
    const wMbs = r.ue() + 1, hMapUnits = r.ue() + 1;
    const frameMbsOnly = r.u(1);
    if (!frameMbsOnly) r.u(1);
    r.u(1);   // direct_8x8
    let crop = [0, 0, 0, 0];
    if (r.u(1)) crop = [r.ue(), r.ue(), r.ue(), r.ue()];
    let fps = null;
    if (r.u(1)) {   // VUI
      if (r.u(1)) { const idc = r.u(8); if (idc === 255) r.skip(32); }
      if (r.u(1)) r.u(1);
      if (r.u(1)) { r.skip(4); if (r.u(1)) r.skip(24); }
      if (r.u(1)) { r.ue(); r.ue(); }
      if (r.u(1)) { const units = r.u(32), scale = r.u(32); if (units) fps = scale / (2 * units); }
    }
    const cropX = chroma === 0 || sepPlane ? 1 : chroma === 3 ? 1 : 2, cropY = (chroma === 1 ? 2 : 1) * (2 - frameMbsOnly);
    return {
      profile, compat, level, log2MaxFrameNum, pocType, log2MaxPocLsb, frameMbsOnly, sepPlane,
      width: wMbs * 16 - (crop[0] + crop[1]) * cropX, height: (2 - frameMbsOnly) * hMapUnits * 16 - (crop[2] + crop[3]) * cropY, fps,
    };
  }
  function h264Pps(nal) {
    const r = new Bits(rbsp(nal, 1));
    const id = r.ue(); r.ue();
    r.u(1);   // entropy_coding_mode
    const bottomFieldPicOrder = r.u(1);
    return { id, bottomFieldPicOrder };
  }
  function analyzeH264(nals) {
    let sps = null, spsNal = null, ppsNal = null;
    const samples = [];
    let au = null, prevPocMsb = 0, prevPocLsb = 0;
    const flush = () => { if (au && au.vcl) samples.push(au); au = null; };
    for (const nal of nals) {
      const type = nal[0] & 31;
      if (type === 7) { if (!spsNal) { spsNal = nal; sps = h264Sps(nal); } flush(); continue; }
      if (type === 8) { if (!ppsNal) ppsNal = nal; flush(); continue; }
      if (type === 9) { flush(); continue; }   // access unit delimiter
      if (type === 6 || (type >= 14 && type <= 18)) { if (au && au.vcl) flush(); if (!au) au = { nals: [], vcl: false, key: false, poc: 0 }; au.nals.push(nal); continue; }
      if (type === 1 || type === 5) {
        const r = new Bits(rbsp(nal, 1));
        const firstMb = r.ue();
        if (firstMb === 0 && au && au.vcl) flush();
        if (!au) au = { nals: [], vcl: false, key: false, poc: 0 };
        if (!au.vcl && sps) {   // the first slice gives the picture order count
          r.ue(); r.ue();   // slice_type, pps_id
          if (sps.sepPlane) r.u(2);
          r.u(sps.log2MaxFrameNum);
          if (!sps.frameMbsOnly && r.u(1)) r.u(1);
          if (type === 5) r.ue();   // idr_pic_id
          if (sps.pocType === 0) {
            const lsb = r.u(sps.log2MaxPocLsb), max = 2 ** sps.log2MaxPocLsb;
            if (type === 5) { prevPocMsb = 0; prevPocLsb = 0; }
            let msb = prevPocMsb;
            if (lsb < prevPocLsb && prevPocLsb - lsb >= max / 2) msb += max;
            else if (lsb > prevPocLsb && lsb - prevPocLsb > max / 2) msb -= max;
            au.poc = msb + lsb;
            if ((nal[0] >> 5) & 3) { prevPocMsb = msb; prevPocLsb = lsb; }   // reference picture
          } else au.poc = null;   // types 1 / 2: output order = decoding order
        }
        au.vcl = true;
        if (type === 5) au.key = true;
        au.nals.push(nal);
        continue;
      }
      if (au) au.nals.push(nal);
    }
    flush();
    if (!sps || !ppsNal) throw new Error('The H.264 stream has no SPS / PPS');
    // avcC
    const c = new Bytes();
    c.u8(1).u8(sps.profile).u8(sps.compat).u8(sps.level).u8(0xff).u8(0xe1).u16(spsNal.length).bytes(spsNal).u8(1).u16(ppsNal.length).bytes(ppsNal);
    if ([100, 110, 122, 144].includes(sps.profile)) c.u8(0xfc | 1).u8(0xf8).u8(0xf8).u8(0);
    return { width: sps.width, height: sps.height, fps: sps.fps, samples, config: { type: 'avcC', data: c.done() }, sps };
  }

  /* ── HEVC ── */
  function hevcPtl(r, maxSub) {
    const ptl = { space: r.u(2), tier: r.u(1), idc: r.u(5), compat: r.u(32), constraint: [r.u(16), r.u(16), r.u(16)], level: r.u(8) };
    const subProfile = [], subLevel = [];
    for (let i = 0; i < maxSub; i++) { subProfile.push(r.u(1)); subLevel.push(r.u(1)); }
    if (maxSub > 0) for (let i = maxSub; i < 8; i++) r.u(2);
    for (let i = 0; i < maxSub; i++) { if (subProfile[i]) r.skip(88); if (subLevel[i]) r.skip(8); }
    return ptl;
  }
  function hevcSps(nal) {
    const r = new Bits(rbsp(nal, 2));
    r.u(4);
    const maxSub = r.u(3);
    r.u(1);
    const ptl = hevcPtl(r, maxSub);
    r.ue();   // sps id
    const chroma = r.ue();
    let sepPlane = 0;
    if (chroma === 3) sepPlane = r.u(1);
    let width = r.ue(), height = r.ue();
    if (r.u(1)) { const sx = chroma === 1 || chroma === 2 ? 2 : 1, sy = chroma === 1 ? 2 : 1; const l = r.ue(), rr = r.ue(), t = r.ue(), b = r.ue(); width -= (l + rr) * sx; height -= (t + b) * sy; }
    const bitDepthLuma = r.ue() + 8, bitDepthChroma = r.ue() + 8;
    const log2MaxPocLsb = r.ue() + 4;
    return { ptl, chroma, sepPlane, width, height, bitDepthLuma, bitDepthChroma, log2MaxPocLsb, maxSub };
  }
  function hevcPps(nal) {
    const r = new Bits(rbsp(nal, 2));
    r.ue(); r.ue();
    const dependentSlices = r.u(1), outputFlag = r.u(1), extraBits = r.u(3);
    return { dependentSlices, outputFlag, extraBits };
  }
  function analyzeHevc(nals) {
    let sps = null, pps = null;
    const params = { 32: null, 33: null, 34: null };
    const samples = [];
    let au = null, prevPocMsb = 0, prevPocLsb = 0;
    const flush = () => { if (au && au.vcl) samples.push(au); au = null; };
    for (const nal of nals) {
      const type = (nal[0] >> 1) & 63;
      if (type === 32 || type === 33 || type === 34) {
        if (!params[type]) params[type] = nal;
        if (type === 33 && !sps) sps = hevcSps(nal);
        if (type === 34 && !pps) pps = hevcPps(nal);
        flush(); continue;
      }
      if (type === 35) { flush(); continue; }   // AUD
      if (type === 39) { if (au && au.vcl) flush(); if (!au) au = { nals: [], vcl: false, key: false, poc: 0 }; au.nals.push(nal); continue; }
      if (type < 32) {
        const first = (nal[2] >> 7) & 1;
        if (first && au && au.vcl) flush();
        if (!au) au = { nals: [], vcl: false, key: false, poc: 0 };
        if (first && sps && pps) {
          const r = new Bits(rbsp(nal, 2));
          r.u(1);
          if (type >= 16 && type <= 23) r.u(1);   // no_output_of_prior_pics
          r.ue();   // pps id
          r.skip(pps.extraBits);
          r.ue();   // slice_type
          if (pps.outputFlag) r.u(1);
          if (sps.sepPlane) r.u(2);
          const idr = type === 19 || type === 20;
          const max = 2 ** sps.log2MaxPocLsb;
          if (idr) { au.poc = 0; prevPocMsb = 0; prevPocLsb = 0; }
          else {
            const lsb = r.u(sps.log2MaxPocLsb);
            let msb = prevPocMsb;
            if (type >= 16 && type <= 18) msb = 0;   // BLA
            else if (lsb < prevPocLsb && prevPocLsb - lsb >= max / 2) msb += max;
            else if (lsb > prevPocLsb && lsb - prevPocLsb > max / 2) msb -= max;
            au.poc = msb + lsb;
            // TemporalId 0 and not a sub-layer non-reference / RASL / RADL picture
            const tid = (nal[1] & 7) - 1;
            if (tid === 0 && !(type <= 14 && type % 2 === 0) && !(type >= 6 && type <= 9)) { prevPocMsb = msb; prevPocLsb = lsb; }
          }
        }
        au.vcl = true;
        if (type >= 16 && type <= 23) au.key = true;
        au.nals.push(nal);
        continue;
      }
      if (au) au.nals.push(nal);
    }
    flush();
    if (!sps || !params[33] || !params[34] || !params[32]) throw new Error('The HEVC stream has no VPS / SPS / PPS');
    const p = sps.ptl, c = new Bytes();
    c.u8(1).u8((p.space << 6) | (p.tier << 5) | p.idc).u32(p.compat).u16(p.constraint[0]).u16(p.constraint[1]).u16(p.constraint[2]).u8(p.level);
    c.u16(0xf000).u8(0xfc).u8(0xfc | sps.chroma).u8(0xf8 | (sps.bitDepthLuma - 8)).u8(0xf8 | (sps.bitDepthChroma - 8)).u16(0);
    c.u8((0 << 6) | ((sps.maxSub + 1) << 3) | (1 << 2) | 3);
    c.u8(3);
    for (const type of [32, 33, 34]) c.u8(0x80 | type).u16(1).u16(params[type].length).bytes(params[type]);
    return { width: sps.width, height: sps.height, fps: null, samples, config: { type: 'hvcC', data: c.done() }, sps };
  }

  function analyze(stream, codec) {
    const nals = nalUnits(stream);
    if (codec === 'h264') return analyzeH264(nals);
    if (codec === 'hevc') return analyzeHevc(nals);
    throw new Error(`${codec} video cannot be wrapped into MP4 here`);
  }

  /* ── MP4 writer ── */
  class Bytes {
    constructor(n = 1024) { this.buf = new Uint8Array(n); this.length = 0; this.dv = new DataView(this.buf.buffer); }
    ensure(n) { if (this.length + n <= this.buf.length) return; let m = this.buf.length * 2; while (m < this.length + n) m *= 2; const b = new Uint8Array(m); b.set(this.buf.subarray(0, this.length)); this.buf = b; this.dv = new DataView(b.buffer); }
    u8(v) { this.ensure(1); this.buf[this.length++] = v & 255; return this; }
    u16(v) { this.ensure(2); this.dv.setUint16(this.length, v); this.length += 2; return this; }
    u32(v) { this.ensure(4); this.dv.setUint32(this.length, v >>> 0); this.length += 4; return this; }
    i32(v) { this.ensure(4); this.dv.setInt32(this.length, v); this.length += 4; return this; }
    str(s) { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i)); return this; }
    bytes(a) { this.ensure(a.length); this.buf.set(a, this.length); this.length += a.length; return this; }
    zeros(n) { this.ensure(n); this.buf.fill(0, this.length, this.length + n); this.length += n; return this; }
    done() { return this.buf.slice(0, this.length); }
  }
  const box = (type, ...parts) => { let n = 8; for (const p of parts) n += p.length; const b = new Bytes(n); b.u32(n).str(type); for (const p of parts) b.bytes(p); return b.done(); };
  const full = (type, version, flags, body) => { const h = new Bytes(4 + body.length); h.u8(version).u8(flags >> 16).u8(flags >> 8).u8(flags).bytes(body); return box(type, h.done()); };
  const MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000];

  function toMp4(stream, opts = {}) {
    const codec = opts.codec;
    const a = analyze(stream, codec);
    const fps = opts.fps > 0 ? opts.fps : a.fps > 0 ? a.fps : 30;
    const timescale = 90000, dur = Math.max(1, Math.round(timescale / fps));
    const width = opts.width || a.width, height = opts.height || a.height;
    const s = a.samples;
    if (!s.length) throw new Error('The video stream holds no pictures');
    // display order from the picture order count, per coded video sequence (each key frame restarts it)
    const display = new Array(s.length);
    if (s.every((x) => x.poc != null)) {
      let start = 0;
      for (let i = 1; i <= s.length; i++) {
        if (i === s.length || (s[i].key && s[i].poc === 0)) {
          const idx = []; for (let k = start; k < i; k++) idx.push(k);
          idx.sort((p, q) => s[p].poc - s[q].poc || p - q).forEach((k, rank) => { display[k] = start + rank; });
          start = i;
        }
      }
    } else for (let i = 0; i < s.length; i++) display[i] = i;
    let shift = 0;
    for (let i = 0; i < s.length; i++) shift = Math.max(shift, i - display[i]);
    const offsets = s.map((_, i) => (display[i] + shift - i) * dur);
    const reorder = offsets.some((o) => o !== 0);
    // sample data: 4-byte length + NAL, parameter sets and delimiters left out (they live in the config)
    const data = s.map((x) => { const n = x.nals.reduce((t, nal) => t + 4 + nal.length, 0); const b = new Bytes(n); for (const nal of x.nals) b.u32(nal.length).bytes(nal); return b.done(); });
    const total = data.reduce((t, d) => t + d.length, 0);
    const mediaDur = s.length * dur;
    const build = (chunkOffset) => {
      const se = new Bytes(); se.zeros(6).u16(1).zeros(16).u16(width).u16(height).u32(0x00480000).u32(0x00480000).u32(0).u16(1).zeros(32).u16(0x18).u16(0xffff);
      const entry = box(codec === 'hevc' ? 'hvc1' : 'avc1', se.done(), box(a.config.type, a.config.data));
      const stsd = full('stsd', 0, 0, (() => { const b = new Bytes(); b.u32(1).bytes(entry); return b.done(); })());
      const stts = full('stts', 0, 0, (() => { const b = new Bytes(); b.u32(1).u32(s.length).u32(dur); return b.done(); })());
      const stss = s.every((x) => x.key) ? null : full('stss', 0, 0, (() => { const keys = s.map((x, i) => (x.key ? i + 1 : 0)).filter(Boolean); const b = new Bytes(); b.u32(keys.length); keys.forEach((k) => b.u32(k)); return b.done(); })());
      const ctts = reorder ? full('ctts', 0, 0, (() => { const b = new Bytes(); b.u32(s.length); offsets.forEach((o) => b.u32(1).u32(o)); return b.done(); })()) : null;
      const stsc = full('stsc', 0, 0, (() => { const b = new Bytes(); b.u32(1).u32(1).u32(s.length).u32(1); return b.done(); })());
      const stsz = full('stsz', 0, 0, (() => { const b = new Bytes(); b.u32(0).u32(s.length); data.forEach((d) => b.u32(d.length)); return b.done(); })());
      const stco = full('stco', 0, 0, (() => { const b = new Bytes(); b.u32(1).u32(chunkOffset); return b.done(); })());
      const stbl = box('stbl', ...[stsd, stts, ctts, stss, stsc, stsz, stco].filter(Boolean));
      const dinf = box('dinf', full('dref', 0, 0, (() => { const b = new Bytes(); b.u32(1).bytes(full('url ', 0, 1, new Uint8Array(0))); return b.done(); })()));
      const minf = box('minf', full('vmhd', 0, 1, new Uint8Array(8)), dinf, stbl);
      const hdlr = full('hdlr', 0, 0, (() => { const b = new Bytes(); b.u32(0).str('vide').zeros(12).str('MyDCMViewer video\0'); return b.done(); })());
      const mdhd = full('mdhd', 0, 0, (() => { const b = new Bytes(); b.u32(0).u32(0).u32(timescale).u32(mediaDur).u16(0x55c4).u16(0); return b.done(); })());
      const mdia = box('mdia', mdhd, hdlr, minf);
      const movieTs = 1000, movieDur = Math.round(mediaDur / timescale * movieTs);
      const tkhd = full('tkhd', 0, 3, (() => { const b = new Bytes(); b.u32(0).u32(0).u32(1).u32(0).u32(movieDur).zeros(8).u16(0).u16(0).u16(0).u16(0); MATRIX.forEach((m) => b.u32(m)); b.u32(width * 65536).u32(height * 65536); return b.done(); })());
      // the reorder delay (shift frames) is cut off the start, so the first picture shows at time 0
      const edts = reorder ? box('edts', full('elst', 0, 0, (() => { const b = new Bytes(); b.u32(1).u32(movieDur).i32(shift * dur).u16(1).u16(0); return b.done(); })())) : null;
      const trak = box('trak', ...[tkhd, edts, mdia].filter(Boolean));
      const mvhd = full('mvhd', 0, 0, (() => { const b = new Bytes(); b.u32(0).u32(0).u32(movieTs).u32(movieDur).u32(0x00010000).u16(0x0100).zeros(10); MATRIX.forEach((m) => b.u32(m)); b.zeros(24).u32(2); return b.done(); })());
      return box('moov', mvhd, trak);
    };
    const ftyp = box('ftyp', (() => { const b = new Bytes(); b.str('isom').u32(0x200).str('isom').str('iso2').str(codec === 'hevc' ? 'hvc1' : 'avc1').str('mp41'); return b.done(); })());
    const moov0 = build(0);
    const offset = ftyp.length + moov0.length + 8;
    const moov = build(offset);
    const out = new Bytes(offset + total);
    out.bytes(ftyp).bytes(moov).u32(8 + total).str('mdat');
    data.forEach((d) => out.bytes(d));
    return out.done();
  }

  function mimeCodec(codec, a) {
    if (codec === 'h264' && a && a.sps) { const h = (v) => v.toString(16).padStart(2, '0'); return `avc1.${h(a.sps.profile)}${h(a.sps.compat)}${h(a.sps.level)}`; }
    if (codec === 'hevc' && a && a.sps) { const p = a.sps.ptl; return `hvc1.${p.idc}.6.${p.tier ? 'H' : 'L'}${p.level}.B0`; }
    return codec === 'hevc' ? 'hvc1.1.6.L93.B0' : 'avc1.640028';
  }
  function canPlay(codec, a) {
    if (typeof document === 'undefined' || (codec !== 'h264' && codec !== 'hevc')) return false;
    const v = document.createElement('video');
    return !!v.canPlayType(`video/mp4; codecs="${mimeCodec(codec, a)}"`);
  }

  /* ── Browser player: a hidden <video>; frames are drawn into a canvas and read back as RGB ── */
  async function player(mp4, { fps, frames, width, height }) {
    const url = URL.createObjectURL(new Blob([mp4], { type: 'video/mp4' }));
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    await new Promise((res, rej) => {
      v.addEventListener('loadeddata', res, { once: true });
      v.addEventListener('error', () => rej(new Error(`The video engine cannot play this stream (${(v.error && v.error.message) || 'unsupported'})`)), { once: true });
    });
    const W = width || v.videoWidth, H = height || v.videoHeight;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    const n = Math.max(1, frames || Math.round(v.duration * fps));
    const frameAt = (t) => Math.max(0, Math.min(n - 1, Math.floor(t * fps + 1e-3)));
    let onFrame = null, playing = false, shown = -1;
    const grab = () => {
      g.drawImage(v, 0, 0, W, H);
      const px = g.getImageData(0, 0, W, H).data, rgb = new Uint8Array(W * H * 3);
      for (let i = 0, j = 0; i < px.length; i += 4, j += 3) { rgb[j] = px[i]; rgb[j + 1] = px[i + 1]; rgb[j + 2] = px[i + 2]; }
      return rgb;
    };
    let queue = Promise.resolve();
    const seek = (i) => new Promise((res) => {
      const target = (i + 0.5) / fps;
      if (Math.abs(v.currentTime - target) < 0.25 / fps && v.readyState >= 2) { res(); return; }
      v.addEventListener('seeked', () => res(), { once: true });
      v.currentTime = target;
    });
    const tick = (now, meta) => {
      if (!playing) return;
      shown = frameAt(meta.mediaTime);
      if (onFrame) onFrame(shown);
      v.requestVideoFrameCallback(tick);
    };
    v.addEventListener('ended', () => { if (playing && onFrame) { playing = false; onFrame(n - 1, true); } });
    const p = {
      width: W, height: H, frames: n, fps, video: v,
      get playing() { return playing; },
      // the RGB samples of frame i: the picture on screen while playing, else seek there first
      frame(i) {
        if (playing && Math.abs(i - shown) <= 1) return Promise.resolve(grab());
        queue = queue.then(async () => { await seek(i); shown = i; return grab(); });
        return queue;
      },
      async play(cb, from) {
        onFrame = cb;
        if (from != null) await seek(from);
        playing = true;
        v.playbackRate = 1;
        v.requestVideoFrameCallback(tick);
        await v.play();
      },
      pause() { playing = false; v.pause(); return frameAt(v.currentTime); },
      async stop() { playing = false; v.pause(); await seek(0); shown = 0; },
      destroy() { playing = false; v.pause(); v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); },
    };
    return p;
  }

  return { codecOf, nalUnits, analyze, toMp4, mimeCodec, canPlay, player, TS_CODEC };
});
