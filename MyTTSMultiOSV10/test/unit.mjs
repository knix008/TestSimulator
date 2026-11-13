// unit — Node only: the TTS host over its line protocol (with real synthesis when models are
// available), audio transport, themes, start-board layout, icons, Markdown, samples, documents
// and the build configuration.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeAudio, encodeAudio } from '../src/host/audio.mjs';
import { scratch } from '../scripts/lib/testdata.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

export const meta = { name: 'unit', description: 'Node host protocol, audio, themes, layout, icons, docs, config' };

/** The Node host with a data folder; every stdout line must be a protocol message. */
function startHost(appData, { onCall } = {}) {
  const env = { ...process.env, APPDATA: appData, HOME: appData };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(process.execPath, [path.join(root, 'src/host/host.mjs')], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '';
  let next = 1;
  const waiting = new Map();
  const events = [];
  const calls = [];
  const badLines = [];
  let readyResolve;
  const ready = new Promise((resolve) => { readyResolve = resolve; });
  child.stderr.on('data', () => {});
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let at;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 1);
      let msg;
      try { msg = JSON.parse(line); } catch { badLines.push(line); continue; }
      if (msg.t === 'res') waiting.get(msg.id)?.(msg);
      else if (msg.t === 'call' && msg.m === 'ready') readyResolve();
      else if (msg.t === 'call') {
        calls.push(msg);
        Promise.resolve(onCall ? onCall(msg) : null).then((v) => child.stdin.write(`${JSON.stringify({ t: 'ret', id: msg.id, ok: true, v: v ?? null })}\n`));
      } else if (msg.t === 'emit') events.push(msg);
    }
  });
  const exit = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  return {
    ready, events, calls, badLines, exit,
    request(m, a = null) {
      return new Promise((resolve) => {
        const id = next++;
        waiting.set(id, resolve);
        child.stdin.write(`${JSON.stringify({ t: 'req', id, m, a })}\n`);
      });
    },
    async value(m, a = null) {
      const r = await this.request(m, a);
      if (!r.ok) throw new Error(r.e);
      return r.v;
    },
    stop() { child.stdin.end(); return exit; },
    kill() { child.kill(); },
  };
}

const withTimeout = (promise, ms, what) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${what}: no answer in ${ms} ms`)), ms))]);

export function cases(ctx) {
  const list = [];
  const add = (name, run, options = {}) => list.push({ name, run, ...options });
  let host = null;
  const empty = scratch('tts-unit-');
  ctx.defer(() => { host?.kill(); fs.rmSync(empty, { recursive: true, force: true }); });

  // ── audio over the wire ──
  add('Audio: Float32 PCM survives base64 both ways', () => {
    const samples = Float32Array.from([0, 0.5, -0.25, 1, -1, 0.123456, 1e-7]);
    assert.deepEqual([...decodeAudio({ audioBase64: encodeAudio(samples) })], [...samples]);
  });
  add('Audio: an unaligned decoded buffer still gives whole samples', () => {
    const bytes = Buffer.concat([Buffer.from([1]), Buffer.from(Float32Array.from([0.25, -0.75]).buffer)]).subarray(1);
    assert.deepEqual([...decodeAudio({ audioBase64: bytes.toString('base64') })], [0.25, -0.75]);
  });
  add('Audio: number arrays and empty payloads are accepted', () => {
    assert.deepEqual([...decodeAudio({ audioBuffer: [0.5, -0.5] })], [0.5, -0.5]);
    assert.equal(decodeAudio({}).length, 0);
    assert.equal(encodeAudio(new Float32Array(0)), '');
  });

  // ── the host ──
  add('Host: starts and reports ready', async () => {
    host = startHost(empty);
    await withTimeout(host.ready, 20000, 'ready');
  }, { critical: true });
  add('Host: model catalog lists all six models', async () => {
    const catalog = await host.value('app:getModelCatalog');
    assert.deepEqual(catalog.map((m) => m.id).sort(), ['en-kokoro', 'ko-en-kokoro', 'ko-en-melotts', 'ko-mms-tts', 'ko-piper-kss', 'ko-supertonic-int8']);
    for (const m of catalog) assert.ok(m.label && /^(ko-KR|en-US)$/.test(m.language) && m.sizeHint, m.id);
  });
  add('Host: an empty data folder has no installed models', async () => {
    const cached = await host.value('app:getCachedModels');
    assert.ok(cached.length >= 6 && cached.every((m) => m.downloaded === false));
  });
  add('Host: cache directory is <APPDATA>/TTSMultiOSV10/models', async () => {
    const dir = await host.value('app:getCacheDirectory');
    assert.equal(path.resolve(dir), path.resolve(empty, 'TTSMultiOSV10', 'models'));
  });
  add('Host: unknown channels are refused with a message', async () => {
    const r = await host.request('app:doesNotExist');
    assert.equal(r.ok, false);
    assert.match(r.e, /unknown channel/);
  });
  // (A catalog model that is not installed would be downloaded: tests stay off the network.)
  add('Host: synthesis with an unknown model fails readably', async () => {
    const r = await host.request('app:speak', { text: '안녕', modelId: 'no-such-model', language: 'ko-KR' });
    assert.equal(r.ok, false);
    assert.ok(r.e.length > 5 && r.e.includes('[상세 정보]'), r.e.slice(0, 200));
  });
  add('Host: exportWav writes a valid 16-bit mono WAV', async () => {
    const file = path.join(empty, 'tone.wav');
    const samples = Float32Array.from({ length: 2205 }, (_, i) => Math.sin(i / 10) * 0.5);
    await host.value('app:exportWav', { filePath: file, audioBase64: encodeAudio(samples), sampleRate: 22050 });
    const wav = fs.readFileSync(file);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.equal(wav.readUInt32LE(24), 22050);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.length, 44 + samples.length * 2);
  });
  add('Host: exportMp3 writes MPEG audio frames at the chosen bit rate', async () => {
    const file = path.join(empty, 'tone.mp3');
    const samples = Float32Array.from({ length: 22050 }, (_, i) => Math.sin(i / 8) * 0.4);
    const r = await host.value('app:exportMp3', { filePath: file, audioBase64: encodeAudio(samples), sampleRate: 22050, bitrateKbps: 96 });
    const mp3 = fs.readFileSync(file);
    assert.equal(r.bitrateKbps, 96);
    assert.ok(mp3.length > 1000);
    assert.ok(mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0, 'MPEG frame sync');
  });
  add('Host: no crash marker → nothing to download again', async () => {
    assert.equal(await host.value('app:takeRedownload'), null);
  });
  add('Host: renderer errors are logged and the log path returned', async () => {
    const r = await host.value('app:reportRendererError', { title: 'unit test', detail: 'detail' });
    assert.ok(r.ok && r.logPath.endsWith('main.log'));
    assert.match(fs.readFileSync(r.logPath, 'utf8'), /unit test/);
  });
  add('Host: stdout carries nothing but protocol lines', () => {
    assert.deepEqual(host.badLines, []);
  });
  add('Host: exits when its stdin closes (program quit)', async () => {
    const code = await withTimeout(host.stop(), 10000, 'exit');
    assert.equal(code, 0);
    host = null;
  });
  add('Host: a crash marker offers to delete and download the model again', async () => {
    const dir = scratch('tts-unit-crash-');
    try {
      const modelDir = path.join(dir, 'TTSMultiOSV10', 'models', 'ko-piper-kss');
      fs.mkdirSync(modelDir, { recursive: true });
      fs.writeFileSync(path.join(modelDir, 'broken.onnx'), 'x');
      fs.mkdirSync(path.join(dir, 'TTSMultiOSV10', 'logs'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'TTSMultiOSV10', 'logs', 'native-op.json'), JSON.stringify({ op: 'speak', modelId: 'ko-piper-kss', modelDir }));
      const crashed = startHost(dir, { onCall: (msg) => msg.m === 'dialog.ask' });
      await withTimeout(crashed.ready, 20000, 'ready');
      const end = Date.now() + 10000;
      while (!crashed.events.some((e) => e.ch === 'app:redownloadModel') && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
      assert.equal(crashed.calls[0]?.m, 'dialog.ask', 'asked the user');
      assert.match(crashed.calls[0].a.message, /ko-piper-kss/);
      assert.ok(!fs.existsSync(modelDir), 'model folder deleted');
      assert.equal(await crashed.value('app:takeRedownload'), 'ko-piper-kss');
      assert.equal(await crashed.value('app:takeRedownload'), null, 'only once');
      assert.ok(!fs.existsSync(path.join(dir, 'TTSMultiOSV10', 'logs', 'native-op.json')), 'marker consumed');
      await crashed.stop();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  // ── real synthesis (a copy of the installed models) ──
  const data = ctx.testData;
  if (!data.dir) {
    add('Real synthesis with installed models', () => {}, { skip: 'no installed voice model to copy (install one, or set TTS_TEST_APPDATA)' });
  } else {
    let real = null;
    add(`Real data: host on the model copy (${data.models.length} models)`, async () => {
      real = startHost(data.dir);
      ctx.defer(() => real?.kill());
      await withTimeout(real.ready, 20000, 'ready');
      const cached = (await real.value('app:getCachedModels')).filter((m) => m.downloaded).map((m) => m.id);
      assert.deepEqual(cached.sort(), [...data.models].sort());
    }, { critical: true });
    for (const id of data.models) {
      add(`Real data: ${id} lists its voices`, async () => {
        const voices = await real.value('app:listModelVoices', id);
        assert.ok(Array.isArray(voices) && voices.length >= 1 && voices.every((v) => v.id !== undefined && v.label));
        ctx.voices = { ...(ctx.voices || {}), [id]: voices };
      });
      add(`Real data: ${id} warms up`, async () => { await real.value('app:warmModel', id); }, { timeout: 120000 });
      add(`Real data: ${id} speaks Korean (non-silent PCM)`, async () => {
        const r = await real.value('app:speak', { text: '안녕하세요. 시험 문장입니다.', modelId: id, language: 'ko-KR', speed: 1, normalize: true, normalizeLevel: 0.9 });
        const pcm = decodeAudio(r);
        assert.equal(pcm.length, r.sampleCount);
        assert.ok(pcm.length > r.sampleRate * 0.5, `too short: ${pcm.length}`);
        const peak = pcm.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
        assert.ok(peak > 0.5 && peak <= 0.91, `normalized peak ${peak}`);
      }, { timeout: 120000 });
      add(`Real data: ${id} — each voice gives different audio`, async () => {
        const voices = (ctx.voices?.[id] || []).slice(0, 2);
        if (voices.length < 2) return { skip: 'single-speaker model' };
        const runs = await Promise.all(voices.map((v) => real.value('app:speak', { text: '목소리 비교.', modelId: id, voiceId: v.id, language: 'ko-KR', speed: 1, normalize: true, normalizeLevel: 0.9 })));
        assert.notEqual(runs[0].audioBase64, runs[1].audioBase64);
        return undefined;
      }, { timeout: 120000 });
    }
    add('Real data: speed 1.5 gives shorter audio than 0.75', async () => {
      const id = data.models[0];
      const say = (speed) => real.value('app:speak', { text: '속도를 바꾸면 길이가 달라집니다.', modelId: id, language: 'ko-KR', speed, normalize: false });
      const [fast, slow] = [await say(1.5), await say(0.75)];
      assert.ok(fast.sampleCount < slow.sampleCount * 0.8, `${fast.sampleCount} vs ${slow.sampleCount}`);
    }, { timeout: 120000 });
    add('Real data: host exits cleanly with the ORT worker', async () => {
      assert.equal(await withTimeout(real.stop(), 15000, 'exit'), 0);
      real = null;
    });
  }

  // ── themes ──
  add('Themes: 20 light + 20 dark, unique ids, Korean and English names', async () => {
    const t = await import('../src/web/ui/themes.js');
    assert.equal(t.LIGHT_THEMES.length, 20);
    assert.equal(t.DARK_THEMES.length, 20);
    assert.ok(t.LIGHT_THEMES.every((x) => !x.dark) && t.DARK_THEMES.every((x) => x.dark));
    const ids = t.THEMES.map((x) => x.id);
    assert.equal(new Set(ids).size, 40);
    assert.equal(t.THEME_IDS.length, 42);
    assert.ok(t.THEMES.every((x) => x.name.ko && x.name.en && x.swatch.length === 3));
  });
  add('Themes: every theme defines every colour as #rrggbb', async () => {
    const t = await import('../src/web/ui/themes.js');
    for (const theme of t.THEMES) for (const key of t.COLOR_KEYS.filter((k) => k !== 'shadow')) assert.match(theme.colors[key], /^#[0-9a-f]{6}$/i, `${theme.id}.${key}`);
  });
  add('Themes: text on accent and body text are readable (contrast ≥ 3 / ≥ 4.5)', async () => {
    const t = await import('../src/web/ui/themes.js');
    for (const theme of t.THEMES) {
      assert.ok(t.contrast(theme.colors.accentText, theme.colors.accent) >= 3, `${theme.id} accent text ${t.contrast(theme.colors.accentText, theme.colors.accent).toFixed(2)}`);
      assert.ok(t.contrast(theme.colors.text, theme.colors.surface) >= 4.5, `${theme.id} text`);
    }
  });
  add('Themes: system follows the OS, custom is normalized, random never repeats', async () => {
    const t = await import('../src/web/ui/themes.js');
    assert.equal(t.resolveTheme('system', true).id, 'dark');
    assert.equal(t.resolveTheme('system', false).id, 'light');
    assert.equal(t.resolveTheme('nope').id, 'light');
    const custom = t.customTheme({ bg: 'red', accent: '#123456', dark: true });
    assert.equal(custom.dark, true);
    assert.equal(custom.colors.accent, '#123456');
    assert.match(custom.colors.bg, /^#[0-9a-f]{6}$/);
    for (let i = 0; i < 200; i += 1) assert.notEqual(t.randomThemeId('ocean'), 'ocean');
    assert.equal(t.themeName('custom', 'ko'), '사용자 정의');
  });

  // ── start board layout ──
  add('Start board: default arrangement has no overlapping cards', async () => {
    const { autoArrange, overlaps } = await import('../src/web/ui/startlayout.js');
    const { START_CARD_SPAN } = await import('../src/web/ui/startboard.js');
    const ids = Object.keys(START_CARD_SPAN);
    const cards = autoArrange(ids, START_CARD_SPAN, { actions: 8, recent: 6, models: 5, samples: 9, theme: 12, background: 9 });
    for (const a of ids) for (const b of ids) if (a < b) assert.ok(!overlaps(cards[a], cards[b]), `${a} × ${b}`);
  });
  add('Start board: the title card is not on the board (fixed)', async () => {
    const { START_CARD_SPAN } = await import('../src/web/ui/startboard.js');
    assert.ok(!('hero' in START_CARD_SPAN));
    assert.deepEqual(Object.keys(START_CARD_SPAN), ['actions', 'recent', 'models', 'samples', 'theme', 'background']);
  });
  add('Start board: moving and resizing keep cards apart and inside 3 columns', async () => {
    const { autoArrange, place, overlaps, layoutValue, cardsOf, COLS } = await import('../src/web/ui/startlayout.js');
    const { START_CARD_SPAN } = await import('../src/web/ui/startboard.js');
    const ids = Object.keys(START_CARD_SPAN);
    let cards = autoArrange(ids, START_CARD_SPAN, {});
    cards = place(cards, 'theme', { col: 0, row: 0 });
    cards = place(cards, 'recent', { w: COLS - cards.recent.col, h: 30, fit: false });
    for (const a of ids) {
      assert.ok(cards[a].col >= 0 && cards[a].col + cards[a].w <= COLS, a);
      for (const b of ids) if (a < b) assert.ok(!overlaps(cards[a], cards[b]), `${a} × ${b}`);
    }
    const restored = cardsOf(layoutValue(cards), ids, START_CARD_SPAN, {});
    assert.equal(restored.theme.row, 0);
  });

  // ── icons ──
  add('Icons: every icon named in the UI exists (no fallback dot)', async () => {
    const { hasIcon } = await import('../src/web/ui/icons.js');
    const sources = ['index.html', 'guide.html', ...fs.readdirSync(path.join(root, 'src/web/ui')).map((f) => `src/web/ui/${f}`), 'src/web/guide.js'];
    const names = new Set();
    for (const rel of sources) {
      const text = read(rel);
      for (const m of text.matchAll(/data-i="([A-Za-z0-9]+)"/g)) names.add(m[1]);
      for (const m of text.matchAll(/\bicon\('([A-Za-z0-9]+)'/g)) names.add(m[1]);
      for (const m of text.matchAll(/\bicon: '([A-Za-z0-9]+)'/g)) names.add(m[1]);
      for (const m of text.matchAll(/\['[a-zA-Z-]+', '([A-Za-z0-9]+)', '[^']*[가-힣]/g)) names.add(m[1]); // start-screen tiles
    }
    const missing = [...names].filter((n) => !hasIcon(n));
    assert.ok(names.size > 60, `found only ${names.size}`);
    assert.deepEqual(missing, []);
  });
  add('Icons: every icon is coloured (has a tone)', async () => {
    const { icon, ICON_NAMES } = await import('../src/web/ui/icons.js');
    const { ICON_TONES } = await import('../src/web/ui/icon-tones.js');
    for (const name of ICON_NAMES) {
      const tone = /data-tone="([a-z]+)"/.exec(icon(name))?.[1];
      assert.ok(ICON_TONES.includes(tone), `${name}: ${tone}`);
    }
  });
  add('Icons: program icon set is complete (svg, png 256, ico, Tauri sizes)', () => {
    for (const rel of ['assets/icon.svg', 'assets/icon.png', 'assets/icon.ico', 'src-tauri/icons/32x32.png', 'src-tauri/icons/128x128.png', 'src-tauri/icons/128x128@2x.png', 'src-tauri/icons/icon.ico', 'src-tauri/icons/icon.icns']) {
      assert.ok(fs.statSync(path.join(root, rel)).size > 500, rel);
    }
    const png = fs.readFileSync(path.join(root, 'assets/icon.png'));
    assert.equal(png.readUInt32BE(16), 256);
    assert.equal(png.readUInt32BE(20), 256);
  });

  // ── markdown renderer ──
  add('Markdown: headings get GitHub-style ids', async () => {
    const { render, slug } = await import('../src/web/ui/markdown.js');
    assert.equal(slug('9. 저장 (WAV · MP3)'), '9-저장-wav--mp3');
    assert.equal(slug('1. Getting started'), '1-getting-started');
    const { headings } = render('# A\n## 1. 시작하기\n## 1. 시작하기');
    assert.deepEqual(headings.map((h) => h.id), ['a', '1-시작하기', '1-시작하기-1']);
  });
  add('Markdown: tables, lists, code, quotes, images and links', async () => {
    const { render } = await import('../src/web/ui/markdown.js');
    const { html } = render('| a | b |\n|---|---|\n| **x** | `y` |\n\n- one\n  - two\n1. first\n\n```\n<raw>\n```\n\n> note\n\n![pic](images/a.png) [doc](Tutorial.md#t) [web](https://x.y)', { base: './doc/' });
    assert.match(html, /<table>.*<strong>x<\/strong>.*<code>y<\/code>/s);
    assert.match(html, /<ul><li>one<ul><li>two<\/li><\/ul><\/li><\/ul>/);
    assert.match(html, /<ol><li>first<\/li><\/ol>/);
    assert.match(html, /<pre class="md-code"><code>&lt;raw&gt;<\/code><\/pre>/);
    assert.match(html, /<blockquote><p>note<\/p><\/blockquote>/);
    assert.match(html, /<img src="\.\/doc\/images\/a\.png"/);
    assert.match(html, /data-doc-link="Tutorial\.md#t"/);
    assert.match(html, /href="https:\/\/x\.y" target="_blank"/);
  });
  add('Markdown: raw HTML in text is escaped', async () => {
    const { render } = await import('../src/web/ui/markdown.js');
    assert.ok(!render('<script>alert(1)</script> & <b>').html.includes('<script>'));
  });

  // ── documents ──
  const DOCS = ['doc/UsersGuide.md', 'doc/UsersGuide.en.md', 'doc/Tutorial.md', 'doc/Tutorial.en.md'];
  add('Docs: user guide and tutorial exist in Korean and English', () => {
    for (const rel of DOCS) assert.ok(read(rel).length > 3000, rel);
  });
  add('Docs: every image a document shows exists', () => {
    for (const rel of DOCS) for (const m of read(rel).matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) assert.ok(fs.existsSync(path.join(root, 'doc', m[1])), `${rel}: ${m[1]}`);
  });
  add('Docs: every link inside the documents leads to a real heading', async () => {
    const { render } = await import('../src/web/ui/markdown.js');
    const ids = Object.fromEntries(DOCS.map((rel) => [path.basename(rel), new Set(render(read(rel)).headings.map((h) => h.id))]));
    const broken = [];
    for (const rel of DOCS) {
      for (const m of read(rel).matchAll(/\]\(([^)]+)\)/g)) {
        const href = m[1];
        if (/^(https?:|images\/)/.test(href)) continue;
        const [file, hash] = href.split('#');
        const target = file ? path.basename(file) : path.basename(rel);
        if (file && !fs.existsSync(path.join(root, 'doc', file))) { broken.push(`${rel}: ${href}`); continue; }
        if (hash && ids[target] && !ids[target].has(decodeURIComponent(hash))) broken.push(`${rel}: ${href}`);
      }
    }
    assert.deepEqual(broken, []);
  });
  add('Docs: the guides name every menu item the program has', () => {
    const shell = read('src/web/ui/shell.js');
    const labels = [...shell.matchAll(/^\s{2}[a-zA-Z]+: \{ label: '([^']+)'/gm)].map((m) => m[1].replace(/…$/, ''));
    const guide = read('doc/UsersGuide.md');
    const missing = labels.filter((l) => !guide.includes(l));
    assert.deepEqual(missing, []);
  });
  add('Docs: README and Architecture point at doc/, not the old root guide', () => {
    assert.ok(!fs.existsSync(path.join(root, 'UsersGuide.md')));
    assert.match(read('README.md'), /doc\/UsersGuide\.md/);
    assert.ok(!/\]\(\.\/UsersGuide\.md\)/.test(read('Architecture.md')));
  });

  // ── samples ──
  add('Samples: ten samples, five per language, same text as samples/*.txt', async () => {
    const { SAMPLES, SAMPLE_GROUPS } = await import('../src/web/ui/samples.js');
    assert.equal(SAMPLES.length, 10);
    assert.equal(new Set(SAMPLES.map((s) => s.id)).size, 10);
    for (const g of SAMPLE_GROUPS) assert.equal(SAMPLES.filter((s) => s.group === g.id).length, 5);
    for (const s of SAMPLES) assert.equal(s.text.trim(), read(`samples/${s.id}.txt`).replace(/\r\n/g, '\n').trim(), s.id);
  });

  // ── speakers per model ──
  add('Speakers: Kokoro English downloads its 28 English voices, KO/EN its 4', async () => {
    const { getModelCatalog } = await import('../src/core/modelCatalog.js');
    const { selectDownloadFiles } = await import('../src/core/modelStore.js');
    // The voice files of onnx-community/Kokoro-82M-v1.0-ONNX (55), as HuggingFace lists them.
    const prefixes = { af: ['alloy', 'aoede', 'bella', 'heart', 'jessica', 'kore', 'nicole', 'nova', 'river', 'sarah', 'sky'], am: ['adam', 'echo', 'eric', 'fenrir', 'liam', 'michael', 'onyx', 'puck', 'santa'], bf: ['alice', 'emma', 'isabella', 'lily'], bm: ['daniel', 'fable', 'george', 'lewis'], ef: ['dora'], em: ['alex', 'santa'], ff: ['siwis'], hf: ['alpha', 'beta'], hm: ['omega', 'psi'], if: ['sara'], im: ['nicola'], jf: ['alpha', 'gongitsune', 'nezumi', 'tebukuro'], jm: ['kumo'], pf: ['dora'], pm: ['alex', 'santa'], zf: ['xiaobei', 'xiaoni', 'xiaoxiao', 'xiaoyi'], zm: ['yunjian', 'yunxi', 'yunxia', 'yunyang'] };
    const files = ['config.json', 'tokenizer.json', 'onnx/model.onnx', 'onnx/model_q8f16.onnx', ...Object.entries(prefixes).flatMap(([p, names]) => names.map((n) => `voices/${p}_${n}.bin`)), 'voices/af.bin'];
    assert.equal(files.filter((f) => f.startsWith('voices/')).length, 55);
    const catalog = getModelCatalog();
    const voices = (id) => selectDownloadFiles(catalog.find((m) => m.id === id), files).filter((f) => f.startsWith('voices/'));
    assert.equal(voices('en-kokoro').length, 28);
    assert.ok(voices('en-kokoro').every((f) => /voices\/(af|am|bf|bm)_/.test(f)));
    assert.deepEqual(voices('ko-en-kokoro').sort(), ['voices/af_bella.bin', 'voices/af_heart.bin', 'voices/am_adam.bin', 'voices/am_michael.bin']);
    assert.deepEqual(selectDownloadFiles(catalog.find((m) => m.id === 'en-kokoro'), files).filter((f) => f.endsWith('.onnx')), ['onnx/model_q8f16.onnx']);
  });
  add('Speakers: single-speaker models list one voice (Piper KSS, MMS, MeloTTS)', () => {
    const service = read('src/core/ttsService.js');
    assert.match(service, /runtime === 'melotts'\) \{\s*return \[\{ id: '0', label: 'KR' \}\]/);
    assert.match(service, /return \[\{ id: 'default', label: model\.label \}\]/);
  });

  // ── configuration ──
  add('Config: version is the same in package.json, Cargo.toml and the About box', () => {
    const version = JSON.parse(read('package.json')).version;
    assert.match(read('src-tauri/Cargo.toml'), new RegExp(`^version = "${version}"`, 'm'));
    assert.equal(JSON.parse(read('src-tauri/tauri.conf.json')).version, '../package.json');
    assert.ok(read('index.html').includes(`v${version}`));
    assert.ok(read('src/web/ui/shell.js').includes(`VERSION = '${version}'`));
  });
  add('Config: Tauri bundles the page, guide, docs and the Node sidecar', () => {
    const conf = JSON.parse(read('src-tauri/tauri.conf.json'));
    assert.equal(conf.identifier, 'com.shkwon.tts-multios');
    assert.equal(conf.build.frontendDist, '../dist/web');
    assert.equal(conf.bundle.resources['../dist/sidecar/'], 'sidecar/');
    assert.equal(conf.bundle.windows.nsis.installMode, 'currentUser');
    const build = read('scripts/build-tauri-web.mjs');
    for (const part of ["'guide.html'", "'doc'", "'src/host'", "'src/core'", 'node.exe']) assert.ok(build.includes(part), part);
  });
  add('Config: NSIS hooks are UTF-8 with BOM and remove the Electron copy', () => {
    const raw = fs.readFileSync(path.join(root, 'src-tauri/windows/hooks.nsh'));
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const text = raw.toString('utf8');
    assert.ok(text.includes('165339ef-a635-5930-bf7c-6fb52652c027') && text.includes('NSIS_HOOK_POSTUNINSTALL'));
  });
  add('Config: the bridge offers every method the page calls', () => {
    const bridge = read('src/web/tauri-bridge.js');
    const offered = new Set([...bridge.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]));
    const used = new Set();
    for (const rel of ['src/web/main.js', 'src/web/ui/shell.js']) for (const m of read(rel).matchAll(/(?<![-\w])(?:bridge|ttsBridge)\??\.(\w+)\??\.?\(?/g)) used.add(m[1]);
    const missing = [...used].filter((name) => !offered.has(name));
    assert.deepEqual(missing, []);
  });
  add('Config: every Rust channel the bridge uses is handled (or forwarded to the host)', () => {
    const bridge = read('src/web/tauri-bridge.js');
    const lib = read('src-tauri/src/lib.rs');
    const host = read('src/host/host.mjs');
    const channels = new Set([...bridge.matchAll(/invoke\('([a-zA-Z]+:[a-zA-Z]+)'/g)].map((m) => m[1]));
    const missing = [...channels].filter((ch) => !lib.includes(`"${ch}"`) && !host.includes(`'${ch}'`));
    assert.deepEqual(missing, []);
  });
  add('Config: debug build of the page copies everything and no node_modules', () => {
    const r = spawnSyncNode(['scripts/build-tauri-web.mjs']);
    assert.equal(r.status, 0, r.stderr);
    for (const rel of ['index.html', 'guide.html', 'src/web/main.js', 'src/web/tauri-bridge.js', 'doc/UsersGuide.md', 'doc/images/ko/main.png', 'assets/icon.svg']) assert.ok(fs.existsSync(path.join(root, 'dist/web', rel)), rel);
    assert.ok(!fs.existsSync(path.join(root, 'dist/web/node_modules')));
  });

  return list;
}

function spawnSyncNode(args) {
  return spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
}
