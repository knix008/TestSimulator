// Drives a page the way a person does: real mouse and keyboard events through the DevTools
// protocol. A synthetic el.click() passes even when something covers the button.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, listTargets } from '../../scripts/cdp.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Everything goes under here, so a test can never reach anybody's real files.
export function scratch(name) {
  let dir = path.join(root, 'test-results', name);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Something from an interrupted run still holds it. Not worth failing over.
    dir = `${dir}-${process.pid}`;
  }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const by = (id) => `[data-testid="${id}"]`;

export async function page(target) {
  const c = await connect(target);
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  await c.send('DOM.enable');

  const js = (s) => JSON.stringify(s);

  const ui = {
    c,
    js: (expr, timeout) => c.evaluate(expr, timeout),
    until: (expr, ms = 20000) => c.until(expr, ms),
    sleep,
    shot: async (file) => fs.writeFileSync(file, await c.screenshot()),

    async waitFor(sel, ms = 20000) {
      await c.until(`document.querySelector(${js(sel)})`, ms);
    },
    async waitGone(sel, ms = 60000) {
      await c.until(`!document.querySelector(${js(sel)})`, ms);
    },
    exists: (sel) => c.evaluate(`!!document.querySelector(${js(sel)})`),
    text: (sel) => c.evaluate(`document.querySelector(${js(sel)})?.textContent ?? null`),
    value: (sel) => c.evaluate(`document.querySelector(${js(sel)})?.value ?? null`),
    attr: (sel, name) => c.evaluate(`document.querySelector(${js(sel)})?.getAttribute(${js(name)}) ?? null`),
    count: (sel) => c.evaluate(`document.querySelectorAll(${js(sel)}).length`),
    disabled: (sel) => c.evaluate(`!!document.querySelector(${js(sel)})?.disabled`),
    texts: (sel) => c.evaluate(`[...document.querySelectorAll(${js(sel)})].map((e) => e.textContent)`),
    attrs: (sel, name) => c.evaluate(`[...document.querySelectorAll(${js(sel)})].map((e) => e.getAttribute(${js(name)}))`),

    async center(sel) {
      await ui.waitFor(sel);
      const r = await c.evaluate(`(() => {
        const el = document.querySelector(${js(sel)});
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const b = el.getBoundingClientRect();
        const x = b.left + b.width / 2, y = b.top + b.height / 2;
        const hit = document.elementFromPoint(x, y);
        return { x, y, covered: !(hit && (hit === el || el.contains(hit) || hit.contains(el))), what: hit ? hit.tagName + '.' + hit.className : 'nothing' };
      })()`);
      if (r.covered) throw new Error(`${sel} is covered by ${r.what}`);
      return r;
    },
    async click(sel, { clickCount = 1, button = 'left', modifiers = 0 } = {}) {
      const { x, y } = await ui.center(sel);
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, modifiers });
      for (let i = 1; i <= clickCount; i += 1) {
        await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: i, modifiers, buttons: button === 'left' ? 1 : 2 });
        await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: i, modifiers });
      }
      await sleep(20);
    },
    dblclick: (sel) => ui.click(sel, { clickCount: 2 }),
    rightClick: (sel) => ui.click(sel, { button: 'right' }),

    // A controlled React input only hears the prototype's setter followed by an event.
    async fill(sel, value) {
      await ui.waitFor(sel);
      await c.evaluate(`(() => {
        const el = document.querySelector(${js(sel)});
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${js(String(value))});
        el.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
    },
    async choose(sel, value) {
      await ui.waitFor(sel);
      await c.evaluate(`(() => {
        const el = document.querySelector(${js(sel)});
        if (![...el.options].some((o) => o.value === ${js(String(value))})) throw new Error('no option ' + ${js(String(value))} + ' in ' + ${js(sel)});
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${js(String(value))});
        el.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
    },
    async press(key, { modifiers = 0, code, keyCode } = {}) {
      const text = key.length === 1 && !modifiers ? key : undefined;
      const vk = keyCode ?? { Enter: 13, Escape: 27, Delete: 46, Backspace: 8, F2: 113, F5: 116, ArrowDown: 40, ArrowUp: 38 }[key] ?? key.toUpperCase().charCodeAt(0);
      await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: code ?? key, modifiers, text, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: code ?? key, modifiers, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      await sleep(20);
    },
    async setFiles(sel, files) {
      const { root: doc } = await c.send('DOM.getDocument', { depth: 0 });
      const { nodeId } = await c.send('DOM.querySelector', { nodeId: doc.nodeId, selector: sel });
      await c.send('DOM.setFileInputFiles', { nodeId, files });
    },
    rowSel: (name) => `tr[data-row=${js(name)}]`,
    async rows() {
      return c.evaluate(`[...document.querySelectorAll('tr[data-row]')].map((e) => e.dataset.row)`);
    },
  };
  return ui;
}

export const CTRL = 2;
export const SHIFT = 8;
export const ALT = 1;

export async function waitTarget(port, match, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const list = await listTargets(port).catch(() => []);
    const hit = list.find(match);
    if (hit) return hit;
    await sleep(150);
  }
  throw new Error(`no window matched after ${ms} ms`);
}

// ── 7-Zip, as the outside witness ─────────────────────────────────────────────────────────────

export function sevenZipPath() {
  for (const p of ['C:\\Program Files\\7-Zip\\7z.exe', 'C:\\Program Files (x86)\\7-Zip\\7z.exe', '/usr/bin/7z', '/usr/bin/7zz', '/opt/homebrew/bin/7zz']) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('7-Zip is required for these tests');
}

export function sevenZip(args) {
  const r = spawnSync(sevenZipPath(), args, { encoding: 'utf8', maxBuffer: 1 << 26 });
  return { ok: r.status === 0, out: `${r.stdout}${r.stderr}` };
}

export function assert7zOk(file, password) {
  const r = sevenZip(['t', ...(password ? [`-p${password}`] : []), file]);
  if (!r.ok) throw new Error(`7-Zip rejects ${file}:\n${r.out}`);
  return r.out;
}

// A tree of files whose contents are known. Returns name -> Buffer.
export function makeTree(dir) {
  const files = {
    'set/readme.txt': Buffer.from('MyZipMaster test file\n'.repeat(4000)),
    'set/noise.bin': noise(600000, 7),
    'set/한글 폴더/보고서.txt': Buffer.from('안녕하세요\n'.repeat(3000)),
    'set/empty.dat': Buffer.alloc(0),
    'set/deep/er/note.log': Buffer.from('deep note\n'.repeat(500)),
    'photo.png': Buffer.from(TINY_PNG, 'base64'),
  };
  for (const [name, data] of Object.entries(files)) {
    const p = path.join(dir, name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, data);
  }
  fs.mkdirSync(path.join(dir, 'set', 'empty-folder'), { recursive: true });
  return files;
}

export function noise(len, seed) {
  const out = Buffer.alloc(len);
  let x = (seed * 2654435761) >>> 0 || 1;
  for (let i = 0; i < len; i += 1) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    out[i] = x & 255;
  }
  return out;
}

export function readTree(dir) {
  const out = {};
  const walk = (d, prefix) => {
    for (const item of fs.readdirSync(d, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.isDirectory()) walk(path.join(d, item.name), rel);
      else out[rel] = fs.readFileSync(path.join(d, item.name));
    }
  };
  walk(dir, '');
  return out;
}

export function assertSameTree(got, want, what = '') {
  const a = Object.keys(got).sort();
  const b = Object.keys(want).sort();
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: different files\n  got  ${a.join(', ')}\n  want ${b.join(', ')}`);
  for (const k of b) {
    if (!got[k].equals(want[k])) throw new Error(`${what}: ${k} differs (${got[k].length} vs ${want[k].length} bytes)`);
  }
}

const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNkYPhfz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC';
