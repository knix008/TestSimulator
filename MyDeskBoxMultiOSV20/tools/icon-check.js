'use strict';

// 바탕화면 아이콘에 그림이 남아 있는지 본다.
// 목록 창을 PrintWindow 로 그려 낸 뒤, 아이콘 칸 안에 배경이 아닌 색이 있는지 센다.
// 그림이 사라지고 이름만 남으면 그 수가 0 에 가깝다.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const koffi = require('koffi');

// 빌드해 둔 실행 파일. MYDESKBOX_EXE 로 다른 것을 줄 수 있다.
function appExe() {
  const target = path.join(__dirname, '..', 'src-tauri', 'target');
  const found = [process.env.MYDESKBOX_EXE, path.join(target, 'release', 'MyDeskBox.exe'), path.join(target, 'debug', 'mydeskbox.exe')]
    .filter(Boolean)
    .find((file) => fs.existsSync(file));
  if (!found) {
    console.error('실행 파일이 없습니다. npm run pack 으로 먼저 빌드해 주세요.');
    process.exit(1);
  }
  return found;
}

function iconList() {
  try {
    return JSON.parse(execFileSync(appExe(), ['--icon-list'], { encoding: 'utf8' }));
  } catch {
    return [];
  }
}

const user32 = koffi.load('user32.dll');
const gdi32 = koffi.load('gdi32.dll');

const FindWindowW = user32.func('void * __stdcall FindWindowW(str16 c, str16 w)');
const FindWindowExW = user32.func('void * __stdcall FindWindowExW(void *p, void *a, str16 c, str16 w)');
const GetWindowDC = user32.func('void * __stdcall GetWindowDC(void *h)');
const ReleaseDC = user32.func('int __stdcall ReleaseDC(void *h, void *dc)');
const PrintWindow = user32.func('int __stdcall PrintWindow(void *h, void *dc, uint32 flags)');
const CheckRect = koffi.struct('CheckRect', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
const GetWindowRect = user32.func('int __stdcall GetWindowRect(void *h, _Out_ CheckRect *r)');
const CreateCompatibleDC = gdi32.func('void * __stdcall CreateCompatibleDC(void *dc)');
const CreateCompatibleBitmap = gdi32.func('void * __stdcall CreateCompatibleBitmap(void *dc, int w, int h)');
const SelectObject = gdi32.func('void * __stdcall SelectObject(void *dc, void *obj)');
const DeleteObject = gdi32.func('int __stdcall DeleteObject(void *obj)');
const DeleteDC = gdi32.func('int __stdcall DeleteDC(void *dc)');
const GetDIBits = gdi32.func('int __stdcall GetDIBits(void *dc, void *bmp, uint32 start, uint32 lines, _Out_ uint8_t *bits, uint8_t *info, uint32 usage)');


const progman = FindWindowW('Progman', null);
const defView = FindWindowExW(progman, null, 'SHELLDLL_DefView', null);
if (!defView) {
  console.error('바탕화면 보기를 찾지 못했습니다.');
  process.exit(1);
}

const r = {};
GetWindowRect(defView, r);
const width = r.right - r.left;
const height = r.bottom - r.top;

const dc = GetWindowDC(defView);
const mem = CreateCompatibleDC(dc);
const bmp = CreateCompatibleBitmap(dc, width, height);
const old = SelectObject(mem, bmp);
PrintWindow(defView, mem, 0x00000002);
const header = Buffer.alloc(40);
header.writeUInt32LE(40, 0);
header.writeInt32LE(width, 4);
header.writeInt32LE(-height, 8);
header.writeUInt16LE(1, 12);
header.writeUInt16LE(32, 14);
const data = Buffer.alloc(width * height * 4);
SelectObject(mem, old);
GetDIBits(dc, bmp, 0, height, data, header, 0);
DeleteObject(bmp);
DeleteDC(mem);
ReleaseDC(defView, dc);

// 아이콘 칸의 위쪽 48x48 이 그림 자리다. 그 안에서 색이 몇 가지나 되는지 센다.
// 그림이 있으면 여러 색이 나오고, 없으면 배경 한 가지뿐이다.
// 아이콘 자리는 앱이 탐색기 목록에서 읽어 준다 (MyDeskBox.exe --icon-list). 창은 띄우지 않는다.
const list = iconList();
let withArt = 0;
for (const icon of list) {
  const x0 = Math.max(0, icon.x - r.left + 14);
  const y0 = Math.max(0, icon.y - r.top + 4);
  const seen = new Set();
  for (let y = y0; y < Math.min(y0 + 48, height); y += 3) {
    for (let x = x0; x < Math.min(x0 + 48, width); x += 3) {
      const at = (y * width + x) * 4;
      seen.add(`${data[at] >> 4},${data[at + 1] >> 4},${data[at + 2] >> 4}`);
    }
  }
  if (seen.size >= 10) withArt += 1;
}
console.log(`아이콘 ${list.length}개 중 그림이 보이는 것 ${withArt}개`);
process.exit(withArt > list.length / 2 ? 0 : 1);
