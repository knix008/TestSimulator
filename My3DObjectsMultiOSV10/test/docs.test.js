// @vitest-environment node
// The program's name, its documents and its bundled examples stay in step:
// the rename to My3DObjects, every model named wherever models are listed,
// both user's guides with the same chapters, and every example picture
// present, listed and credited.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PHOTOS } from '../scripts/make-samples.mjs';

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
    expect(PHOTOS.length).toBeGreaterThanOrEqual(10);
    for (const p of PHOTOS) {
      const file = `images/${p.name}.png`;
      expect(fs.existsSync(path.join(root, 'samples', file)), file).toBe(true);
      const entry = index.images.find((e) => e.file === file);
      expect(entry, file).toBeTruthy();
      expect(entry.source).toBe(p.source);
      expect(entry.ko && entry.en).toBeTruthy();
      expect(notice).toContain(`\`${p.name}\``);
      expect(readme).toContain(`\`${p.name}.png\``);
      expect(['TRELLIS', 'TripoSR']).toContain(p.source);
    }
  });

  it('are small enough to ship (512 px PNG, under 500 KB)', () => {
    for (const p of PHOTOS) {
      const bytes = fs.readFileSync(path.join(root, 'samples', 'images', `${p.name}.png`));
      expect(bytes.subarray(1, 4).toString()).toBe('PNG');
      expect(bytes.readUInt32BE(16)).toBeLessThanOrEqual(512); // width
      expect(bytes.readUInt32BE(20)).toBeLessThanOrEqual(512); // height
      expect(bytes.length).toBeLessThan(500 * 1024);
    }
  });

  it('the OBJ example is kept despite the root .gitignore', () => {
    expect(read('.gitignore')).toContain('!/samples/models/*.obj');
    expect(read('samples/models/mug.obj').startsWith('mtllib mug.mtl')).toBe(true);
  });
});
