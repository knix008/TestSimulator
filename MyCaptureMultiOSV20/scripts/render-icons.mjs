// Renders assets/icon.svg into everything the build needs:
//   assets/icon.png (1024²), assets/icon.ico, src-tauri/icons/* (via `tauri icon`)
//   src-tauri/windows/installerHeader.bmp (150×57) and installerSidebar.bmp (164×314)
//
// Rasterizing uses headless Microsoft Edge / Chrome (no image libraries needed):
//   npm run build:icons
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = fs.readFileSync(path.join(root, 'assets', 'icon.svg'), 'utf8');

const browsers = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
];
const browser = browsers.find((candidate) => fs.existsSync(candidate));
if (!browser) {
  console.error('Edge 또는 Chrome 이 필요합니다 (아이콘 래스터화용).');
  process.exit(1);
}

const port = 9400 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mycapture-icons-'));
const child = spawn(browser, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

async function page() {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const target = list.find((item) => item.type === 'page');
      if (target) return target;
    } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('headless browser did not start');
}

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
  pending.set(n, (data) => (data.result?.exceptionDetails ? reject(new Error(JSON.stringify(data.result.exceptionDetails))) : resolve(data.result.result.value)));
  ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
});

// Draws in the page and returns raw RGBA for each requested image.
const images = await evaluate(`(async () => {
  const image = new Image();
  image.src = 'data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}';
  await image.decode();
  const make = (width, height, draw) => {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    draw(context);
    return { width, height, png: canvas.toDataURL('image/png'), rgba: Array.from(context.getImageData(0, 0, width, height).data) };
  };
  const gradient = (context, width, height) => {
    const fill = context.createLinearGradient(0, 0, width, height);
    fill.addColorStop(0, '#2fa3f2'); fill.addColorStop(1, '#0a5cb0');
    return fill;
  };
  const icon = make(1024, 1024, (context) => context.drawImage(image, 0, 0, 1024, 1024));
  const header = make(150, 57, (context) => {
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, 150, 57);
    context.drawImage(image, 100, 6, 45, 45);
  });
  const sidebar = make(164, 314, (context) => {
    context.fillStyle = gradient(context, 164, 314); context.fillRect(0, 0, 164, 314);
    context.drawImage(image, 30, 40, 104, 104);
    context.fillStyle = '#ffffff';
    context.font = 'bold 22px Segoe UI, sans-serif';
    context.textAlign = 'center';
    context.fillText('MyCapture', 82, 182);
    context.font = '12px Segoe UI, sans-serif';
    context.fillStyle = 'rgba(255,255,255,0.85)';
    context.fillText('Screen capture', 82, 204);
    context.fillText('& recording', 82, 220);
  });
  return { icon: { png: icon.png }, header, sidebar };
})()`);
ws.close();
child.kill();

/** 24-bit bottom-up BMP, the format NSIS expects. */
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
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const source = (y * width + x) * 4;
      const target = 54 + (height - 1 - y) * rowSize + x * 3;
      buffer[target] = rgba[source + 2];
      buffer[target + 1] = rgba[source + 1];
      buffer[target + 2] = rgba[source];
    }
  }
  return buffer;
}

const pngPath = path.join(root, 'assets', 'icon.png');
fs.writeFileSync(pngPath, Buffer.from(images.icon.png.split(',')[1], 'base64'));
fs.mkdirSync(path.join(root, 'src-tauri', 'windows'), { recursive: true });
fs.writeFileSync(path.join(root, 'src-tauri', 'windows', 'installerHeader.bmp'), bmp(images.header));
fs.writeFileSync(path.join(root, 'src-tauri', 'windows', 'installerSidebar.bmp'), bmp(images.sidebar));

const result = spawnSync(process.execPath, [path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'icon', pngPath], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
// Desktop app: the mobile icon sets tauri icon also writes are not needed.
for (const mobile of ['android', 'ios']) fs.rmSync(path.join(root, 'src-tauri', 'icons', mobile), { recursive: true, force: true });
fs.copyFileSync(path.join(root, 'src-tauri', 'icons', 'icon.ico'), path.join(root, 'assets', 'icon.ico'));
fs.copyFileSync(path.join(root, 'src-tauri', 'icons', 'icon.icns'), path.join(root, 'assets', 'icon.icns'));
fs.rmSync(profile, { recursive: true, force: true });
console.log('assets/icon.png, icon.ico, icon.icns, src-tauri/icons/*, installer BMPs 생성 완료');
