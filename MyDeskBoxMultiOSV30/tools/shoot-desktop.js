'use strict';

// 바탕화면 층만 찍는다. 다른 창이 덮고 있어도 된다.
// PrintWindow(PW_RENDERFULLCONTENT) 로 Progman 을 그려 내면
// 그 자식(아이콘 층과, 우리가 뒤에 붙인 창)이 함께 나온다.
//
//   node tools/shoot-desktop.js <나갈 파일.png> [x y w h]

const fs = require('fs');
const path = require('path');
const koffi = require('koffi');

const user32 = koffi.load('user32.dll');
const gdi32 = koffi.load('gdi32.dll');

const FindWindowW = user32.func('void * __stdcall FindWindowW(str16 c, str16 w)');
const GetWindowDC = user32.func('void * __stdcall GetWindowDC(void *h)');
const ReleaseDC = user32.func('int __stdcall ReleaseDC(void *h, void *dc)');
const PrintWindow = user32.func('int __stdcall PrintWindow(void *h, void *dc, uint32 flags)');
const DeskRect = koffi.struct('DeskRect', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
const GetWindowRect = user32.func('int __stdcall GetWindowRect(void *h, _Out_ DeskRect *r)');

const CreateCompatibleDC = gdi32.func('void * __stdcall CreateCompatibleDC(void *dc)');
const CreateCompatibleBitmap = gdi32.func('void * __stdcall CreateCompatibleBitmap(void *dc, int w, int h)');
const SelectObject = gdi32.func('void * __stdcall SelectObject(void *dc, void *obj)');
const DeleteObject = gdi32.func('int __stdcall DeleteObject(void *obj)');
const DeleteDC = gdi32.func('int __stdcall DeleteDC(void *dc)');
const GetDIBits = gdi32.func('int __stdcall GetDIBits(void *dc, void *bmp, uint32 start, uint32 lines, _Out_ uint8_t *bits, uint8_t *info, uint32 usage)');

const PW_RENDERFULLCONTENT = 0x00000002;

const out = process.argv[2] || path.join(require('os').tmpdir(), 'desktop.png');
const crop = process.argv.slice(3).map(Number);

const progman = FindWindowW('Progman', null);
if (!progman) {
  console.error('Progman 을 찾지 못했습니다.');
  process.exit(1);
}

const r = {};
GetWindowRect(progman, r);
const width = r.right - r.left;
const height = r.bottom - r.top;

const screenDC = GetWindowDC(progman);
const memDC = CreateCompatibleDC(screenDC);
const bmp = CreateCompatibleBitmap(screenDC, width, height);
const old = SelectObject(memDC, bmp);

const ok = PrintWindow(progman, memDC, PW_RENDERFULLCONTENT);

const header = Buffer.alloc(40);
header.writeUInt32LE(40, 0);
header.writeInt32LE(width, 4);
header.writeInt32LE(-height, 8);
header.writeUInt16LE(1, 12);
header.writeUInt16LE(32, 14);
const data = Buffer.alloc(width * height * 4);
SelectObject(memDC, old);
GetDIBits(screenDC, bmp, 0, height, data, header, 0);

DeleteObject(bmp);
DeleteDC(memDC);
ReleaseDC(progman, screenDC);

// BGRA -> RGBA, 그리고 PNG 로 쓴다. 외부 꾸러미를 쓰지 않으려고 직접 엮는다.
const zlib = require('zlib');

function png(w, h, bgra, cropRect) {
  let x0 = 0;
  let y0 = 0;
  let cw = w;
  let ch = h;
  if (cropRect && cropRect.length === 4 && cropRect.every((n) => Number.isFinite(n))) {
    [x0, y0, cw, ch] = cropRect;
    cw = Math.min(cw, w - x0);
    ch = Math.min(ch, h - y0);
  }
  const raw = Buffer.alloc(ch * (cw * 4 + 1));
  for (let y = 0; y < ch; y += 1) {
    raw[y * (cw * 4 + 1)] = 0;
    for (let x = 0; x < cw; x += 1) {
      const src = ((y0 + y) * w + (x0 + x)) * 4;
      const dst = y * (cw * 4 + 1) + 1 + x * 4;
      raw[dst] = bgra[src + 2];
      raw[dst + 1] = bgra[src + 1];
      raw[dst + 2] = bgra[src];
      raw[dst + 3] = 255;
    }
  }
  const chunks = [];
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunk = (type, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length, 0);
    const name = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.concat([name, body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcBuf) >>> 0, 0);
    return Buffer.concat([len, name, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cw, 0);
  ihdr.writeUInt32BE(ch, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  chunks.push(sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

let table = null;
function crc32(buf) {
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

fs.writeFileSync(out, png(width, height, data, crop));
console.log(`PrintWindow=${ok} ${width}x${height} -> ${out}`);
