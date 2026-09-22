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
    expect(pkg.main).toBe('electron/main.js');
  });

  it('pins pdfjs-dist to 4.8.69 so Electron 31 can open PDFs', () => {
    expect(pkg.devDependencies['pdfjs-dist']).toBe('^4.8.69');
    expect(pkg.devDependencies.electron).toMatch(/^\^31/);
  });

  it('registers the .pdfvw workspace file type', () => {
    const assoc = pkg.build.fileAssociations;
    expect(assoc.some((a) => a.ext === 'pdfvw')).toBe(true);
    expect(assoc[0].mimeType).toBe('application/x-mypdfviewer-workspace');
  });

  it('exposes web, electron and test scripts', () => {
    for (const name of ['start', 'web', 'build', 'build:win', 'test', 'test:watch', 'prepare:assets']) {
      expect(pkg.scripts[name], name).toBeTruthy();
    }
  });

  it('does not ship node_modules inside the asar', () => {
    expect(pkg.build.files).toContain('!node_modules/**/*');
    expect(pkg.build.asar).toBe(true);
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
    expect(fs.existsSync(path.join(root, 'build', 'installer.nsh'))).toBe(true);
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
