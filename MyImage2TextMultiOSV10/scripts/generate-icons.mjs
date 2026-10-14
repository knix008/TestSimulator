// Rasterizes public/icon.svg into the icons the installers, the executable,
// and the shortcuts share.
//   src-tauri/icons/*              Tauri bundle (ico, icns, png)
//   src-tauri/windows/*.bmp        NSIS header and sidebar, same artwork
//
//   npm run build:icons
//   node scripts/generate-icons.mjs --if-needed
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = path.join(root, 'public', 'icon.svg');
const iconsDir = path.join(root, 'src-tauri', 'icons');
const icoPath = path.join(iconsDir, 'icon.ico');
const needed = process.argv.includes('--if-needed');

if (needed && fs.existsSync(icoPath) && fs.existsSync(path.join(iconsDir, '32x32.png')) && fs.existsSync(path.join(iconsDir, 'icon.icns'))) {
  const svgTime = fs.statSync(svgPath).mtimeMs;
  const icoTime = fs.statSync(icoPath).mtimeMs;
  if (icoTime >= svgTime) {
    console.log('아이콘이 최신입니다.');
    process.exit(0);
  }
}

const svg = fs.readFileSync(svgPath, 'utf8');
const browsers = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
];
const browser = browsers.find((candidate) => fs.existsSync(candidate));
if (!browser) {
  console.error('아이콘을 만들려면 Edge 또는 Chrome이 필요합니다.');
  process.exit(1);
}

const port = 9400 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'image2text-icons-'));
const child = spawn(browser, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--disable-gpu',
  'about:blank',
], { stdio: 'ignore' });

async function page() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const target = list.find((item) => item.type === 'page');
      if (target) return target;
    } catch {
      // The browser is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('headless browser did not start');
}

function bmp({ width, height, rgba }) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const buffer = Buffer.alloc(54 + rowSize * height);
  buffer.write('BM', 0);
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(rowSize * height, 34);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      const target = 54 + (height - 1 - y) * rowSize + x * 3;
      buffer[target] = rgba[source + 2];
      buffer[target + 1] = rgba[source + 1];
      buffer[target + 2] = rgba[source];
    }
  }
  return buffer;
}

let exitCode = 0;
try {
  const target = await page();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => { ws.onopen = resolve; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (message) => {
    const data = JSON.parse(message.data);
    pending.get(data.id)?.(data);
  };
  const evaluate = (expression) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, (data) => (data.result?.exceptionDetails
      ? reject(new Error(JSON.stringify(data.result.exceptionDetails)))
      : resolve(data.result.result.value)));
    ws.send(JSON.stringify({
      id: n,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true },
    }));
  });

  const b64 = Buffer.from(svg).toString('base64');
  const images = await evaluate(`(async () => {
    const image = new Image();
    image.src = 'data:image/svg+xml;base64,${b64}';
    await image.decode();
    const make = (width, height, draw, raw = false) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.imageSmoothingQuality = 'high';
      draw(context);
      return {
        png: canvas.toDataURL('image/png'),
        rgba: raw ? Array.from(context.getImageData(0, 0, width, height).data) : null,
        width,
        height,
      };
    };
    const icon = make(1024, 1024, (context) => context.drawImage(image, 0, 0, 1024, 1024));
    const header = make(150, 57, (context) => {
      context.fillStyle = '#f4fbfc';
      context.fillRect(0, 0, 150, 57);
      context.drawImage(image, 96, 5, 47, 47);
    }, true);
    const sidebar = make(164, 314, (context) => {
      const fill = context.createLinearGradient(0, 0, 0, 314);
      fill.addColorStop(0, '#134e4a');
      fill.addColorStop(1, '#042f2e');
      context.fillStyle = fill;
      context.fillRect(0, 0, 164, 314);
      context.drawImage(image, 22, 36, 120, 120);
      context.fillStyle = '#ecfeff';
      context.textAlign = 'center';
      context.font = 'bold 16px Segoe UI, sans-serif';
      context.fillText('Image2Text', 82, 190);
      context.font = '12px Segoe UI, sans-serif';
      context.fillStyle = 'rgba(236,254,255,0.82)';
      context.fillText('SHKWON', 82, 276);
    }, true);
    return { icon: icon.png, header, sidebar };
  })()`);
  ws.close();

  const png = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64');
  const source = path.join(iconsDir, 'source-1024.png');
  fs.mkdirSync(iconsDir, { recursive: true });
  fs.mkdirSync(path.join(root, 'src-tauri', 'windows'), { recursive: true });
  fs.writeFileSync(source, png(images.icon));
  fs.writeFileSync(path.join(root, 'src-tauri', 'windows', 'installerHeader.bmp'), bmp(images.header));
  fs.writeFileSync(path.join(root, 'src-tauri', 'windows', 'installerSidebar.bmp'), bmp(images.sidebar));

  const tauri = spawnSync(process.execPath, [
    path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
    'icon',
    source,
    '--output',
    iconsDir,
  ], { cwd: root, stdio: 'inherit' });
  if (tauri.status !== 0) exitCode = tauri.status ?? 1;
  else {
    fs.rmSync(source, { force: true });
    console.log('설치 파일, 실행 파일, 바로가기가 같은 아이콘을 쓰도록 src-tauri/icons 를 만들었습니다.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  child.kill();
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  }
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch {
    // Edge can keep the temporary profile open for a moment after it exits.
  }
}
process.exit(exitCode);
