// @vitest-environment node
// The program's name, its documents and its bundled examples stay in step:
// the rename to My3DObjects, every model named wherever models are listed,
// both user's guides with the same chapters, and every example picture
// present, listed and credited.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PHOTOS, PHOTO_SIZE, PHOTO_SOURCES, photoPath } from '../scripts/make-samples.mjs';

// Width and height from a PNG or WebP header.
function imageSize(b) {
  if (b.subarray(1, 4).toString() === 'PNG') return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') {
    const kind = b.subarray(12, 16).toString();
    if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (kind === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
  }
  throw new Error('not a PNG or WebP picture');
}

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const MODELS = ['Stable Fast 3D', 'SPAR3D', 'TripoSR', 'TRELLIS', 'Hunyuan3D'];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__pycache__') walk(p, out); } else out.push(p);
  }
  return out;
}

describe('the name is My3DObjects', () => {
  it('in the package, the desktop bundle and the crate', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.name).toBe('my3dobjects');
    expect(pkg.productName).toBe('My3DObjects');
    const conf = JSON.parse(read('src-tauri/tauri.conf.json'));
    expect(conf.productName).toBe('My3DObjects');
    expect(conf.mainBinaryName).toBe('My3DObjects');
    expect(conf.identifier).toBe('com.shkwon.my3dobjects');
    expect(read('src-tauri/Cargo.toml')).toMatch(/name = "my3dobjects"/);
    expect(read('src-tauri/src/main.rs')).toContain('my3dobjects_lib::run()');
  });

  it('does not share ports with MyStableFast3D', () => {
    const conf = JSON.parse(read('src-tauri/tauri.conf.json'));
    expect(conf.build.devUrl).toBe('http://localhost:5196');
    expect(JSON.parse(read('package.json')).scripts.dev).toContain('--port 5196');
    expect(read('scripts/engine.mjs')).toContain('DEFAULT_PORT = 57660');
    expect(read('src/lib/settings.js')).toContain("'http://127.0.0.1:57660'");
  });

  it('leaves no trace of the old name in code, engine or guides', () => {
    const files = [
      ...walk(path.join(root, 'src')), ...walk(path.join(root, 'engine')), ...walk(path.join(root, 'scripts')),
      ...walk(path.join(root, 'src-tauri', 'src')), path.join(root, 'doc', 'Guide.html'), path.join(root, 'doc', 'Guide.en.html'),
      path.join(root, 'index.html'), path.join(root, 'UsersGuide.md'),
    ].filter((f) => /\.(js|jsx|mjs|py|rs|html|md|json|css)$/.test(f));
    const hits = files.filter((f) => /MyStableFast3D|mystablefast3d|mysf3d|MYSF3D/.test(fs.readFileSync(f, 'utf8')));
    expect(hits.map((f) => path.relative(root, f))).toEqual([]);
    expect(fs.existsSync(path.join(root, 'engine', 'my3dobjects', '__init__.py'))).toBe(true);
  });
});

describe('documents', () => {
  it('name every model where the models are listed', () => {
    for (const rel of ['README.md', 'UsersGuide.md', 'LICENSE-MODELS.md', 'NOTICE.md', 'Architecture.md', 'doc/Guide.html', 'doc/Guide.en.html', 'src/components/AboutDialog.jsx']) {
      const text = read(rel);
      for (const m of MODELS) {
        expect(text.includes(m), `${rel} does not mention ${m}`).toBe(true);
      }
    }
  });

  it('both user\'s guides have the same chapters, all in the table of contents', () => {
    const chapters = (html) => [...html.matchAll(/<h2 id="([a-z0-9]+)">(\d+)\. /g)].map((m) => `${m[2]}:${m[1]}`);
    const toc = (html) => [...html.matchAll(/<li><a href="#([a-z0-9]+)">(\d+)\. /g)].map((m) => `${m[2]}:${m[1]}`);
    const ko = read('doc/Guide.html');
    const en = read('doc/Guide.en.html');
    expect(chapters(ko)).toEqual(chapters(en));
    expect(toc(ko)).toEqual(chapters(ko));
    expect(toc(en)).toEqual(chapters(en));
    expect(chapters(ko)).toContain('15:print3d');
    // Numbered 1 … n without gaps.
    expect(chapters(ko).map((c) => Number(c.split(':')[0]))).toEqual(chapters(ko).map((_, i) => i + 1));
  });

  it('describe saving for a 3D printer and its shortcut', () => {
    for (const rel of ['README.md', 'UsersGuide.md', 'doc/Guide.html', 'doc/Guide.en.html']) {
      const text = read(rel);
      expect(text, rel).toMatch(/3MF/);
      expect(text, rel).toMatch(/Shift\s*(<\/kbd>)?\+\s*(<kbd>)?P/);
    }
  });
});

describe('example pictures', () => {
  const index = JSON.parse(read('samples/index.json'));

  it('every photo is there, listed with its source, and credited', () => {
    const notice = read('NOTICE.md');
    const readme = read('samples/README.md');
    expect(PHOTOS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(PHOTOS.map((p) => p.name)).size).toBe(PHOTOS.length);
    for (const p of PHOTOS) {
      const file = photoPath(p);
      expect(fs.existsSync(path.join(root, 'samples', file)), file).toBe(true);
      const entry = index.images.find((e) => e.file === file);
      expect(entry, file).toBeTruthy();
      expect(entry.source).toBe(p.source);
      expect(entry.ko && entry.en).toBeTruthy();
      expect(notice).toContain(`\`${p.name}\``);
      expect(readme).toContain(`\`${file.split('/').pop()}\``);
      expect(Object.keys(PHOTO_SOURCES)).toContain(p.source);
    }
    // Nothing else of the old lists is left over.
    const files = fs.readdirSync(path.join(root, 'samples', 'images')).map((n) => `images/${n}`);
    expect(files.sort()).toEqual(index.images.map((e) => e.file).sort());
  });

  it('every picture to convert is natively at least PHOTO_SIZE square and small enough to ship', () => {
    expect(PHOTO_SIZE).toBeGreaterThanOrEqual(1024);
    let total = 0;
    for (const e of index.images) {
      const bytes = fs.readFileSync(path.join(root, 'samples', e.file));
      const [w, h] = imageSize(bytes);
      expect(w, `${e.file} width`).toBeGreaterThanOrEqual(PHOTO_SIZE);
      expect(h, `${e.file} height`).toBeGreaterThanOrEqual(PHOTO_SIZE);
      expect(bytes.length, e.file).toBeLessThan(2 * 1024 * 1024);
      total += bytes.length;
    }
    expect(total).toBeLessThan(40 * 1024 * 1024);
  });

  it('every picture has a small transparent preview for the start screen, and no preview is left over', () => {
    for (const e of index.images) {
      expect(e.thumb, e.file).toMatch(/^thumbs\/.+\.webp$/);
      const bytes = fs.readFileSync(path.join(root, 'samples', e.thumb));
      expect(bytes.subarray(12, 16).toString(), e.thumb).toBe('VP8X'); // WebP with alpha
      expect(bytes.length, e.thumb).toBeLessThan(40 * 1024);
    }
    const thumbs = fs.readdirSync(path.join(root, 'samples', 'thumbs')).map((n) => `thumbs/${n}`);
    expect(thumbs.sort()).toEqual(index.images.map((e) => e.thumb).sort());
  });

  it('every photo names its original file in the repository it is credited to', () => {
    for (const p of PHOTOS) {
      expect(PHOTO_SOURCES[p.source], p.name).toMatch(/^https:\/\/raw\.githubusercontent\.com\/.+\/[0-9a-f]{40}\//);
      expect(p.file, p.name).toMatch(/\.(png|webp)$/);
    }
  });

  it('the OBJ example is kept despite the root .gitignore', () => {
    expect(read('.gitignore')).toContain('!/samples/models/*.obj');
    expect(read('samples/models/mug.obj').startsWith('mtllib mug.mtl')).toBe(true);
  });
});
