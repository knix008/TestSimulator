// Renders the icons into everything the build needs:
//   assets/icon.svg  → assets/icon.png (1024²), src-tauri/icons/* (via `tauri icon`),
//                      public/icon.png (web favicon), assets/icon.ico / icon.icns
//   assets/project.svg  → src-tauri/icons/project.png (256²), project.ico, project.icns
//                      (the .myheat model document icon)
//   installer images → src-tauri/windows/installerHeader.bmp (150×57), installerSidebar.bmp (164×314)
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
const projectSvg = fs.readFileSync(path.join(root, 'assets', 'project.svg'), 'utf8');

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
  console.error('Edge or Chrome is needed (to rasterise the icons).');
  process.exit(1);
}

const port = 9400 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'myheatmanager-icons-'));
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

const b64 = (text) => Buffer.from(text).toString('base64');
// Draws in the page and returns PNG data URLs (and raw RGBA for the BMPs).
const images = await evaluate(`(async () => {
  const load = async (data) => { const image = new Image(); image.src = 'data:image/svg+xml;base64,' + data; await image.decode(); return image; };
  const image = await load('${b64(svg)}');
  const project = await load('${b64(projectSvg)}');
  const make = (width, height, draw, raw = false) => {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';
    draw(context);
    return { width, height, png: canvas.toDataURL('image/png'), rgba: raw ? Array.from(context.getImageData(0, 0, width, height).data) : null };
  };
  const icon = make(1024, 1024, (context) => context.drawImage(image, 0, 0, 1024, 1024));
  const projectIcon = make(1024, 1024, (context) => context.drawImage(project, 0, 0, 1024, 1024));
  const projectSmall = make(256, 256, (context) => context.drawImage(project, 0, 0, 256, 256));
  const header = make(150, 57, (context) => {
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, 150, 57);
    context.drawImage(image, 100, 5, 47, 47);
  }, true);
  const sidebar = make(164, 314, (context) => {
    const fill = context.createLinearGradient(0, 0, 164, 314);
    fill.addColorStop(0, '#ffb36b'); fill.addColorStop(1, '#9c2a2a');
    context.fillStyle = fill; context.fillRect(0, 0, 164, 314);
    context.drawImage(image, 22, 34, 120, 120);
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.font = 'bold 19px Segoe UI, sans-serif';
    context.fillText('MyHeatManager', 82, 186);
    context.font = '12px Segoe UI, sans-serif';
    context.fillStyle = 'rgba(255,255,255,0.85)';
    context.fillText('Thermal simulation', 82, 208);
    context.fillText('SHKWON', 82, 290);
  }, true);
  return { icon: icon.png, projectIcon: projectIcon.png, projectSmall: projectSmall.png, header, sidebar };
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

const png = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64');
const icons = path.join(root, 'src-tauri', 'icons');
const tauri = (args) => {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'icon', ...args], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const pngPath = path.join(root, 'assets', 'icon.png');
fs.writeFileSync(pngPath, png(images.icon));
fs.mkdirSync(path.join(root, 'public'), { recursive: true });
fs.copyFileSync(pngPath, path.join(root, 'public', 'icon.png'));
fs.mkdirSync(path.join(root, 'src-tauri', 'windows'), { recursive: true });
fs.writeFileSync(path.join(root, 'src-tauri', 'windows', 'installerHeader.bmp'), bmp(images.header));
fs.writeFileSync(path.join(root, 'src-tauri', 'windows', 'installerSidebar.bmp'), bmp(images.sidebar));

tauri([pngPath]);
// Desktop app: the mobile icon sets tauri icon also writes are not needed.
for (const mobile of ['android', 'ios']) fs.rmSync(path.join(icons, mobile), { recursive: true, force: true });
fs.copyFileSync(path.join(icons, 'icon.ico'), path.join(root, 'assets', 'icon.ico'));
fs.copyFileSync(path.join(icons, 'icon.icns'), path.join(root, 'assets', 'icon.icns'));
fs.copyFileSync(path.join(icons, '128x128@2x.png'), path.join(root, 'assets', 'icon-256.png'));

// File-type icons: tauri icon into a scratch folder, then keep .ico / .icns / 256 px PNG.
for (const [name, large, small] of [['project', images.projectIcon, images.projectSmall]]) {
  const source = path.join(root, 'assets', `${name}.png`);
  fs.writeFileSync(source, png(large));
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `myheatmanager-${name}-icon-`));
  tauri([source, '--output', scratch]);
  fs.copyFileSync(path.join(scratch, 'icon.ico'), path.join(icons, `${name}.ico`));
  fs.copyFileSync(path.join(scratch, 'icon.icns'), path.join(icons, `${name}.icns`));
  fs.writeFileSync(path.join(icons, `${name}.png`), png(small));
  fs.rmSync(scratch, { recursive: true, force: true });
}
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* the browser may still hold its profile for a moment */ }
console.log('Written: assets/icon.png and project.png, icon.ico and .icns, src-tauri/icons/* (project.* too), public/icon.png, installer BMPs');
