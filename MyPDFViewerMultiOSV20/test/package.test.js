import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

describe('package.json product metadata', () => {
  it('identifies MyPDFViewer 1.0.0', () => {
    expect(pkg.name).toBe('mypdfviewer');
    expect(pkg.version).toBe('1.0.0');
    expect(pkg.author.name).toBe('SHKWON');
    expect(pkg.license).toBe('MIT');
    expect(pkg.productName).toBe('MyPDFViewer');
  });

  it('is a Tauri app with no Electron left in it', () => {
    expect(pkg.main).toBeUndefined();
    expect(pkg.build).toBeUndefined();
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const gone of ['electron', 'electron-builder', 'concurrently', 'cross-env', 'wait-on']) {
      expect(all[gone], gone).toBeUndefined();
    }
    expect(pkg.dependencies['@tauri-apps/api']).toMatch(/^\^2/);
    expect(pkg.devDependencies['@tauri-apps/cli']).toMatch(/^\^2/);
    expect(fs.existsSync(path.join(root, 'electron'))).toBe(false);
  });

  it('keeps pdfjs-dist on 4.8.69 (the legacy build every webview can run)', () => {
    expect(pkg.devDependencies['pdfjs-dist']).toBe('^4.8.69');
  });

  it('registers the .pdfvw workspace file type', () => {
    const conf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
    const assoc = conf.bundle.fileAssociations;
    expect(assoc.some((a) => a.ext.includes('pdfvw'))).toBe(true);
    expect(assoc[0].mimeType).toBe('application/x-mypdfviewer-workspace');
    expect(assoc[0].name).toBe('MyPDFViewer.Workspace');
  });

  it('exposes web, desktop, build and test scripts', () => {
    for (const name of ['start', 'dev', 'web', 'build', 'build:win', 'build:mac', 'build:linux', 'build:all',
      'test', 'test:js', 'test:rust', 'test:watch', 'prepare:assets']) {
      expect(pkg.scripts[name], name).toBeTruthy();
    }
    expect(pkg.scripts.start).toBe('tauri dev');
    expect(pkg.scripts['build:win']).toMatch(/^tauri build --bundles nsis/);
  });
});

describe('jsdom canvas constructors', () => {
  it('defines DOMMatrix and Path2D so pdf.js does not warn', () => {
    expect(typeof globalThis.DOMMatrix).toBe('function');
    expect(typeof globalThis.Path2D).toBe('function');
  });
});

describe('runtime assets', () => {
  it('keeps icon sources and installer hook', () => {
    expect(fs.existsSync(path.join(root, 'assets', 'icon.svg'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'assets', 'file-icon.svg'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'src-tauri', 'windows', 'hooks.nsh'))).toBe(true);
    for (const icon of ['icon.ico', 'icon.icns', '32x32.png', '128x128.png', '128x128@2x.png', 'file.ico']) {
      expect(fs.existsSync(path.join(root, 'src-tauri', 'icons', icon)), icon).toBe(true);
    }
    expect(fs.existsSync(path.join(root, 'public', 'icon.svg'))).toBe(true);
  });

  it('has pdf.js cmap / font data after prepare:assets (or node_modules)', () => {
    const cmap = path.join(root, 'public', 'pdfjs', 'cmaps');
    const src = path.join(root, 'node_modules', 'pdfjs-dist', 'cmaps');
    expect(fs.existsSync(cmap) || fs.existsSync(src)).toBe(true);
  });
});

describe('Architecture.md claims that tests enforce', () => {
  const arch = fs.readFileSync(path.join(root, 'Architecture.md'), 'utf8');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

  it('documents the 25–800% zoom range and three tools', () => {
    expect(readme).toMatch(/25 %–800 %|25%–800%/);
    expect(readme).toMatch(/Ctrl\+1/);
    expect(readme).toMatch(/Ctrl\+2/);
    expect(readme).toMatch(/Ctrl\+3/);
  });

  it('documents the workspace format name', () => {
    expect(arch).toContain('mypdfviewer-workspace');
    expect(arch).toContain('.pdfvw');
  });
});
