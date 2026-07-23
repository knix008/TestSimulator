/**
 * 순수 Node.js (외부 패키지 없음)로 샘플 평면도 PNG 생성
 * 실행: node create_png_sample.js
 */
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

const W = 800, H = 600;

// ── CRC32 (PNG 청크용) ──────────────────────────────────
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t   = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

// ── 픽셀 버퍼 (RGB) ────────────────────────────────────
const pixels = new Uint8Array(W * H * 3).fill(255); // 흰 배경

function setPixel(x, y, r, g, b) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  pixels[i] = r; pixels[i+1] = g; pixels[i+2] = b;
}

function drawLine(x1, y1, x2, y2, thick, r, g, b) {
  const dx = x2 - x1, dy = y2 - y1;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(x1 + dx * s / steps);
    const y = Math.round(y1 + dy * s / steps);
    for (let tx = -thick; tx <= thick; tx++)
      for (let ty = -thick; ty <= thick; ty++)
        setPixel(x + tx, y + ty, r, g, b);
  }
}

function drawRect(x, y, w, h, thick, r, g, b) {
  drawLine(x,     y,     x+w, y,   thick, r, g, b);
  drawLine(x+w,   y,     x+w, y+h, thick, r, g, b);
  drawLine(x+w,   y+h,   x,   y+h, thick, r, g, b);
  drawLine(x,     y+h,   x,   y,   thick, r, g, b);
}

// ── 평면도 그리기 ───────────────────────────────────────
// 단위: 픽셀 (800×600 → 1:100 → 8000mm × 6000mm)
const W1 = 6, W2 = 4; // 외벽/내벽 두께

// 외벽
drawRect(60, 40, 680, 520, W1, 0, 0, 0);

// 내벽 - 좌/우 거실-침실 세로 구분
drawLine(310, 40, 310, 360, W2, 0, 0, 0);

// 내벽 - 주방/거실 가로 구분
drawLine(310, 360, 740, 360, W2, 0, 0, 0);

// 내벽 - 침실1/2 가로 구분
drawLine(60, 270, 310, 270, W2, 0, 0, 0);

// 욕실 세로 벽
drawLine(540, 360, 540, 560, W2, 0, 0, 0);

// 현관 벽
drawLine(60, 460, 190, 460, W2, 0, 0, 0);
drawLine(190, 460, 190, 560, W2, 0, 0, 0);

// 문 표시 (얇은 선으로 간략히)
function drawDoor(x1, y1, x2, y2) {
  drawLine(x1, y1, x2, y2, 1, 80, 80, 80);
}
drawDoor(80, 40, 140, 40);   // 현관문
drawDoor(310, 150, 310, 210); // 침실1 문
drawDoor(310, 390, 310, 450); // 침실2 문
drawDoor(540, 440, 540, 500); // 욕실 문
drawDoor(130, 460, 190, 460); // 내부 문

// 창문 (이중 평행선)
function drawWindow(x1, y1, x2, y2) {
  drawLine(x1, y1, x2, y2, 3, 0, 100, 200);
  const ox = (y2 - y1 !== 0) ? 5 : 0;
  const oy = (x2 - x1 !== 0) ? 5 : 0;
  drawLine(x1+ox, y1+oy, x2+ox, y2+oy, 1, 0, 100, 200);
}
drawWindow(350, 560, 530, 560);  // 거실 하단
drawWindow(60, 70, 60, 210);     // 침실1 좌측
drawWindow(60, 290, 60, 440);    // 침실2 좌측
drawWindow(480, 40, 650, 40);    // 주방 상단
drawWindow(740, 70, 740, 280);   // 거실 우측

// ── PNG 인코딩 ──────────────────────────────────────────
// 각 행 앞에 필터 바이트 0 추가
const rawRows = Buffer.alloc(H * (W * 3 + 1));
for (let y = 0; y < H; y++) {
  rawRows[y * (W * 3 + 1)] = 0;
  for (let x = 0; x < W; x++) {
    const src = (y * W + x) * 3;
    const dst = y * (W * 3 + 1) + 1 + x * 3;
    rawRows[dst]     = pixels[src];
    rawRows[dst + 1] = pixels[src + 1];
    rawRows[dst + 2] = pixels[src + 2];
  }
}

const ihdrData = Buffer.alloc(13);
ihdrData.writeUInt32BE(W, 0);
ihdrData.writeUInt32BE(H, 4);
ihdrData[8] = 8;  // 비트 깊이
ihdrData[9] = 2;  // RGB

const compressed = zlib.deflateSync(rawRows, { level: 6 });

const png = Buffer.concat([
  Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]), // PNG 시그니처
  chunk('IHDR', ihdrData),
  chunk('IDAT', compressed),
  chunk('IEND', Buffer.alloc(0)),
]);

const outPath = path.join(__dirname, 'apartment_floorplan.png');
fs.writeFileSync(outPath, png);
console.log(`PNG 평면도 생성 완료: ${outPath}  (${W}×${H}px)`);
