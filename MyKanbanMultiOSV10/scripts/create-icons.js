/**
 * create-icons.js — 순수 Node.js 아이콘 생성기 (의존성 없음)
 *
 * 16x16, 32x32, 48x48 세 가지 크기를 담은 멀티사이즈 ICO 파일을 생성합니다.
 * 실제 제품 아이콘으로 교체하려면 assets/ 내의 .ico 파일을 덮어쓰세요.
 *
 * 사용법: node scripts/create-icons.js
 */

const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');

if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

// ── ICO 파일 생성 헬퍼 ──────────────────────────────────────────────────────

/**
 * 단일 크기의 BMP 데이터를 생성합니다 (24-bit, 색상은 BGR).
 * @param {number} size  픽셀 크기 (정사각형)
 * @param {number} r     Red (0-255)
 * @param {number} g     Green (0-255)
 * @param {number} b     Blue (0-255)
 * @param {function} pixelFn (row, col, r, g, b) => [B,G,R] — 픽셀 색상 결정
 * @returns {Buffer} BMP 데이터 (파일 헤더 제외, ICO 내 삽입용)
 */
function makeBmpData(size, pixelFn) {
  const rowBytes = size * 3;
  const rowPadded = Math.ceil(rowBytes / 4) * 4;
  const pixelDataSize = rowPadded * size;

  // AND 마스크: 픽셀당 1비트, 행 단위 DWORD 정렬
  const andRowBytes = Math.ceil(size / 8);
  const andRowPadded = Math.ceil(andRowBytes / 4) * 4;
  const andMaskSize = andRowPadded * size;

  const totalSize = 40 + pixelDataSize + andMaskSize;
  const buf = Buffer.alloc(totalSize, 0);
  let i = 0;

  // BITMAPINFOHEADER (40 bytes)
  buf.writeUInt32LE(40, i); i += 4;         // biSize
  buf.writeInt32LE(size, i); i += 4;         // biWidth
  buf.writeInt32LE(size * 2, i); i += 4;     // biHeight (*2 = XOR + AND)
  buf.writeUInt16LE(1, i); i += 2;           // biPlanes
  buf.writeUInt16LE(24, i); i += 2;          // biBitCount
  i += 24;                                    // 나머지 헤더 필드 (0)

  // XOR 픽셀 데이터 (BMP는 아래→위 순서)
  for (let row = size - 1; row >= 0; row--) {
    const rowStart = i;
    for (let col = 0; col < size; col++) {
      const [B, G, R] = pixelFn(row, col, size);
      buf[i++] = B;
      buf[i++] = G;
      buf[i++] = R;
    }
    i = rowStart + rowPadded; // 패딩 건너뛰기
  }

  // AND 마스크: 모두 0 = 불투명 (Buffer.alloc 초기값이 0)
  return buf;
}

/**
 * 여러 크기를 포함하는 ICO 파일을 생성합니다.
 * @param {Array<{size: number, bmpData: Buffer}>} images
 * @returns {Buffer}
 */
function buildIco(images) {
  const ICO_HEADER = 6;
  const DIR_ENTRY = 16;
  const headerSize = ICO_HEADER + DIR_ENTRY * images.length;

  // 각 이미지의 오프셋 계산
  const offsets = [];
  let offset = headerSize;
  for (const img of images) {
    offsets.push(offset);
    offset += img.bmpData.length;
  }

  const total = offset;
  const buf = Buffer.alloc(total, 0);
  let i = 0;

  // ICO 파일 헤더
  buf.writeUInt16LE(0, i); i += 2;                    // Reserved
  buf.writeUInt16LE(1, i); i += 2;                    // Type: 1 = ICO
  buf.writeUInt16LE(images.length, i); i += 2;        // Count

  // 이미지 디렉터리 엔트리
  for (let idx = 0; idx < images.length; idx++) {
    const { size, bmpData } = images[idx];
    buf[i++] = size >= 256 ? 0 : size;                // Width (0 = 256)
    buf[i++] = size >= 256 ? 0 : size;                // Height
    buf[i++] = 0;                                      // Color count
    buf[i++] = 0;                                      // Reserved
    buf.writeUInt16LE(1, i); i += 2;                  // Planes
    buf.writeUInt16LE(24, i); i += 2;                 // Bit count
    buf.writeUInt32LE(bmpData.length, i); i += 4;     // Data size
    buf.writeUInt32LE(offsets[idx], i); i += 4;       // Data offset
  }

  // 이미지 데이터
  for (const { bmpData } of images) {
    bmpData.copy(buf, i);
    i += bmpData.length;
  }

  return buf;
}

// ── 아이콘 디자인 함수 ─────────────────────────────────────────────────────

/**
 * 앱 아이콘: 인디고 배경 + 흰색 "K" 모양 (단순 십자형)
 */
function appIconPixel(row, col, size) {
  const cx = size / 2;
  const cy = size / 2;
  const r = row, c = col;
  const margin = Math.floor(size * 0.1);
  const thickness = Math.max(2, Math.floor(size * 0.12));

  // 배경: 인디고 #6366F1
  const BG = [0xF1, 0x66, 0x63];  // BGR
  const FG = [0xFF, 0xFF, 0xFF];  // 흰색

  // 둥근 사각형 배경
  const pad = Math.floor(size * 0.05);
  if (r < pad || r >= size - pad || c < pad || c >= size - pad) {
    return [0xF1, 0x66, 0x63]; // 인디고 테두리
  }

  // "K" 모양 픽셀 (세로 막대 + 두 대각선)
  const left = Math.floor(size * 0.28);
  const mid = Math.floor(size * 0.52);
  const top = Math.floor(size * 0.2);
  const bot = Math.floor(size * 0.8);

  // 세로 막대
  if (c >= left && c < left + thickness && r >= top && r < bot) {
    return FG;
  }
  // 위쪽 대각선 (왼쪽 중앙에서 오른쪽 위로)
  const diagRatio = (r - Math.floor(size * 0.2)) / (Math.floor(size * 0.5) - Math.floor(size * 0.2));
  const diagColUp = Math.floor(left + thickness + diagRatio * (Math.floor(size * 0.7) - left - thickness));
  if (r >= top && r < Math.floor(size * 0.52) &&
      c >= diagColUp - 1 && c < diagColUp + thickness) {
    return FG;
  }
  // 아래쪽 대각선
  const diagRatioDown = (r - Math.floor(size * 0.5)) / (Math.floor(size * 0.8) - Math.floor(size * 0.5));
  const diagColDown = Math.floor(mid + diagRatioDown * (Math.floor(size * 0.7) - mid));
  if (r >= Math.floor(size * 0.5) && r < bot &&
      c >= diagColDown - 1 && c < diagColDown + thickness) {
    return FG;
  }

  return BG;
}

/**
 * 프로젝트 파일 아이콘: 초록 배경 + 흰색 문서 모양
 */
function kprjIconPixel(row, col, size) {
  const BG = [0x5E, 0xC5, 0x22];  // BGR for #22C55E
  const FG = [0xFF, 0xFF, 0xFF];
  const DARK = [0x1A, 0x86, 0x0E]; // 어두운 초록

  const pad = Math.floor(size * 0.15);
  const right = size - pad;
  const bot = size - pad;
  const foldSize = Math.floor(size * 0.22);
  const r = row;
  const c = col;

  // 문서 영역 바깥
  if (r < pad || r >= bot || c < pad || c >= right) {
    return BG;
  }

  // 접힌 모서리 (오른쪽 위)
  if (r < pad + foldSize && c >= right - foldSize) {
    const dx = c - (right - foldSize);
    const dy = r - pad;
    if (dx > foldSize - dy) return BG; // 잘린 삼각형
    if (dx === foldSize - dy || dx === foldSize - dy - 1) return DARK; // 접힘선
    return FG;
  }

  // 문서 테두리 (2픽셀)
  if (r < pad + 2 || r >= bot - 2 || c < pad + 2 || c >= right - 2) {
    return DARK;
  }

  // 줄 표현
  const lineThickness = Math.max(1, Math.floor(size * 0.06));
  const lineSpacing = Math.floor(size * 0.14);
  const lineStart = Math.floor(size * 0.35);
  const lineLeft = pad + Math.floor(size * 0.1);
  const lineRight = right - Math.floor(size * 0.1);

  for (let li = 0; li < 4; li++) {
    const lineRow = lineStart + li * lineSpacing;
    if (r >= lineRow && r < lineRow + lineThickness &&
        c >= lineLeft && c < (li === 3 ? lineLeft + (lineRight - lineLeft) * 0.6 : lineRight)) {
      return DARK;
    }
  }

  return FG;
}

// ── ICO 파일 생성 ─────────────────────────────────────────────────────────

const SIZES = [16, 32, 48];

console.log('아이콘 생성 중...');

// 앱 아이콘 (icon.ico)
const appImages = SIZES.map(size => ({
  size,
  bmpData: makeBmpData(size, appIconPixel)
}));
const appIco = buildIco(appImages);
fs.writeFileSync(path.join(ASSETS_DIR, 'icon.ico'), appIco);
console.log(`  ✓ assets/icon.ico (${SIZES.join(', ')}px)`);

// 프로젝트 파일 아이콘 (kprj.ico)
const kprjImages = SIZES.map(size => ({
  size,
  bmpData: makeBmpData(size, kprjIconPixel)
}));
const kprjIco = buildIco(kprjImages);
fs.writeFileSync(path.join(ASSETS_DIR, 'kprj.ico'), kprjIco);
console.log(`  ✓ assets/kprj.ico (${SIZES.join(', ')}px)`);

console.log('\n아이콘 생성 완료!');
console.log('실제 제품용 아이콘으로 교체하려면 assets/*.ico 파일을 덮어쓰세요.');
console.log('추천 툴: https://www.favicon.cc 또는 https://convertio.co/png-ico/');
