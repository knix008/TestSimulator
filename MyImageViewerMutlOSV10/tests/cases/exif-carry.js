'use strict';

/** Saving keeps the photo information (exifCarry.js) and lays JPEG / BMP on white. */
const path = require('path');

module.exports = {
  name: 'Photo information on save',
  run({ test, src, h }) {
    const { app, editor, html, ko, en } = src;
    const { assert, assertIncludes } = h;
    const X = require(path.join(__dirname, '..', '..', 'src', 'js', 'exifCarry.js'));

    // Little-endian TIFF: IFD0 {Make "Cam1", Orientation 6, ExifIFD, GPS}, ExifIFD {4000 × 3000}, GPS {LatRef, Lat}
    function tiff() {
      const b = new Uint8Array(200);
      const dv = new DataView(b.buffer);
      b.set([0x49, 0x49, 0x2a, 0]);
      dv.setUint32(4, 8, true);
      let o = 8;
      const ent = (tag, type, count, val) => { dv.setUint16(o, tag, true); dv.setUint16(o + 2, type, true); dv.setUint32(o + 4, count, true); dv.setUint32(o + 8, val, true); o += 12; };
      dv.setUint16(o, 4, true); o += 2;
      ent(0x010f, 2, 5, 120); ent(0x0112, 3, 1, 6); ent(0x8769, 4, 1, 70); ent(0x8825, 4, 1, 140);
      b.set([0x43, 0x61, 0x6d, 0x31, 0], 120);
      o = 70; dv.setUint16(o, 2, true); o += 2;
      ent(0xa002, 4, 1, 4000); ent(0xa003, 4, 1, 3000);
      o = 140; dv.setUint16(o, 2, true); o += 2;
      ent(0x0001, 2, 2, 0x4e); ent(0x0002, 5, 3, 172);
      return b;
    }
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
    const png = (() => {
      const b = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
      return Uint8Array.from(b);
    })();
    const u16 = (t, o) => t[o] | (t[o + 1] << 8);
    const u32 = (t, o) => (t[o] | (t[o + 1] << 8) | (t[o + 2] << 16) | (t[o + 3] << 24)) >>> 0;

    test('EXIF is fixed for the saved pixels: upright, new size, optionally no GPS', () => {
      const t = X.fixTiff(tiff(), { width: 30, height: 20 });
      assert(u16(t, 8 + 2 + 12 + 8) === 1, 'orientation 6 → 1 (pixels are already upright)');
      assert(u32(t, 72 + 8) === 30 && u32(t, 72 + 12 + 8) === 20, 'pixel size 4000×3000 → 30×20');
      assert(u16(t, 140) === 2, 'GPS kept by default');
      assert(u16(X.fixTiff(tiff(), { stripGps: true }), 140) === 0, 'GPS emptied when asked');
      assert(String.fromCharCode(...t.slice(120, 124)) === 'Cam1', 'camera kept');
      assert(u16(tiff(), 8 + 2 + 12 + 8) === 6, 'the source block is not changed');
    });

    test('Carried into JPEG (APP1 after SOI) and PNG (eXIf after IHDR); readable back', () => {
      const src = X.jpegWithExif(jpeg, tiff());
      assert(src[2] === 0xff && src[3] === 0xe1 && X.jpegTiff(src).length === 200, 'APP1 first, JFIF dropped');
      const out = X.carry(jpeg, src, { width: 30, height: 20 });
      assert(out[out.length - 2] === 0xff && out[out.length - 1] === 0xd9, 'rest of the JPEG intact');
      assert(u16(X.jpegTiff(out), 8 + 2 + 12 + 8) === 1, 'fixed block in the JPEG');
      const p = X.carry(png, src, { width: 1, height: 1 });
      const at = 8 + 12 + 13;
      assert(String.fromCharCode(p[at + 4], p[at + 5], p[at + 6], p[at + 7]) === 'eXIf', 'eXIf right after IHDR');
      const crc = X.crc32(p.subarray(at + 4, at + 8 + 200));
      assert(u32(Uint8Array.from([p[at + 211], p[at + 210], p[at + 209], p[at + 208]]), 0) === crc, 'chunk CRC');
      assert(X.pngTiff(p).length === 200, 'readable back');
      assert(X.carry(jpeg, jpeg) === jpeg, 'no EXIF in the source → bytes untouched');
      assert(X.crc32(Uint8Array.from([0x49, 0x45, 0x4e, 0x44])) === 0xae426082, 'CRC-32 (IEND)');
    });

    test('Every save path keeps it (Settings can turn it off or drop GPS)', () => {
      const helper = app.slice(app.indexOf('async function _withPhotoInfo('), app.indexOf('async function _saveAs('));
      assertIncludes(helper, "if (!_prefOn('keepExif') || !window.ExifCarry || !srcPath) return dataUrl;", 'setting');
      assertIncludes(helper, "stripGps: _pref('stripGps') === '1'", 'GPS setting');
      const uses = app.split('await _withPhotoInfo(exported,').length - 1;
      assert(uses === 4, `save, save as, save selection, resized copy (got ${uses})`);
      assertIncludes(app, "keepExif: '1',", 'on by default');
      assertIncludes(html, 'id="settings-keep-exif"', 'settings row');
      assertIncludes(html, 'id="settings-strip-gps"', 'settings row');
      assert(html.indexOf('js/exifCarry.js') > 0 && html.indexOf('js/exifCarry.js') < html.indexOf('js/app.js'), 'loaded before app.js');
      for (const k of ['settings.keepExif', 'settings.keepExifHint', 'settings.stripGps', 'settings.stripGpsHint']) assert(ko[k] && en[k], k);
    });

    test('JPEG / BMP have no transparency: erased or cut areas are saved on white, not black', () => {
      const enc = editor.slice(editor.indexOf('function _encode('), editor.indexOf('function _applySmoothing('));
      assertIncludes(enc, "fc.fillStyle = '#ffffff';", 'white background');
      assertIncludes(editor, 'return displayCanvas ? _encode(displayCanvas, format, quality) : null;', 'save / save as');
      assertIncludes(editor, 'return _encode(scaled, format, fileQuality);', 'resized copy');
      assertIncludes(editor, 'return _encode(c, format, quality);', 'selection');
    });
  },
};
