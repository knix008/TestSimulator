/**
 * Windows taskbar uses the host electron.exe icon during `npm start`.
 * Patch that binary with our app icon + product metadata.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

if (process.platform !== 'win32') {
  process.exit(0);
}

const iconPath = path.join(root, 'electron', 'assets', 'icon.ico');
const fallbackIcon = path.join(root, 'build', 'icon.ico');
const ico = fs.existsSync(iconPath) ? iconPath : fallbackIcon;

if (!fs.existsSync(ico)) {
  console.warn('[set-electron-win-icon] icon.ico not found. Run npm run icons first.');
  process.exit(0);
}

let electronPath;
try {
  electronPath = require('electron');
  // require('electron') returns string path to binary when not running inside electron
  if (typeof electronPath !== 'string') {
    electronPath = require('electron/package.json');
    const electronDir = path.dirname(require.resolve('electron/package.json'));
    electronPath = path.join(electronDir, 'dist', 'electron.exe');
  }
} catch {
  const electronDir = path.dirname(require.resolve('electron/package.json'));
  electronPath = path.join(electronDir, 'dist', 'electron.exe');
}

if (!electronPath || !fs.existsSync(electronPath)) {
  const electronDir = path.dirname(require.resolve('electron/package.json'));
  electronPath = path.join(electronDir, 'dist', 'electron.exe');
}

if (!fs.existsSync(electronPath)) {
  console.warn('[set-electron-win-icon] electron.exe not found:', electronPath);
  process.exit(0);
}

const { rcedit } = await import('rcedit');

try {
  await rcedit(electronPath, {
    icon: ico,
    'version-string': {
      ProductName: '3D Drawing Tool',
      FileDescription: '3D Drawing Tool',
      CompanyName: 'SHKWON',
      LegalCopyright: 'Copyright © 2026 SHKWON',
      InternalName: '3DDrawingTool',
      OriginalFilename: '3D Drawing Tool.exe',
    },
    'product-version': '1.0.0',
    'file-version': '1.0.0',
  });
  console.log('[set-electron-win-icon] Applied app icon to', electronPath);
} catch (err) {
  console.warn('[set-electron-win-icon] Failed (is Electron running?):', err?.message || err);
}
