// desktop — the real Tauri program (debug build; --release: target/release with its bundled
// Node only) driven over CDP. Isolated: TTS_CONFIG_DIR is a scratch folder holding a copy of
// the installed models, its logs and the WebView storage. Playback is muted (volume 0).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launchDesktop, exePath } from '../scripts/lib/desktop.mjs';
import { Page, sleep, waitForTarget } from '../scripts/lib/cdp.mjs';
import { scratch } from '../scripts/lib/testdata.mjs';

export const meta = { name: 'desktop', description: 'the Tauri program over CDP: synthesis, speakers, tabs, files, window, guide, host' };

export function cases(ctx) {
  const list = [];
  const add = (name, run, options = {}) => list.push({ name, run, ...options });
  const data = ctx.testData;
  let app = null;
  let page = null;
  let config = null;
  const port = 9471 + Math.floor(Math.random() * 20);
  ctx.defer(async () => {
    if (app && !app.exited) { await page.eval(`(document.querySelector('[data-window=close]')?.click(), true)`).catch(() => {}); await app.waitExit(5000); await app.close(); }
    if (config) fs.rmSync(config, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  });
  const ev = (expr, ms) => page.eval(expr, ms);
  const q = (s) => JSON.stringify(s);
  const domClick = (s) => ev(`(document.querySelector(${q(s)}).click(), true)`);
  const model = () => (data.models.includes('ko-supertonic-int8') ? 'ko-supertonic-int8' : data.models[0]);
  const needModels = data.dir ? false : 'no installed voice model to copy (install one, or set TTS_TEST_APPDATA)';
  const setValue = (id, v, type = 'input') => ev(`(() => { const e = document.querySelector('#${id}'); e.value = ${q(v)}; e.dispatchEvent(new Event(${q(type)}, { bubbles: true })); return true; })()`);

  add(ctx.buildCase.name, ctx.buildCase.run, { critical: true, timeout: ctx.buildCase.timeout });
  add(`Start the ${ctx.release ? 'release program (bundled Node only)' : 'debug program'} isolated`, async () => {
    config = scratch('tts-desktop-');
    if (data.dir) {
      fs.mkdirSync(path.join(config, 'TTSMultiOSV10'), { recursive: true });
      fs.cpSync(path.join(data.dir, 'TTSMultiOSV10', 'models'), path.join(config, 'TTSMultiOSV10', 'models'), { recursive: true });
    }
    app = await launchDesktop({ profile: ctx.release ? 'release' : 'debug', configDir: config, port, hideNodeFromPath: ctx.release });
    page = app.page;
    await page.waitFor(`!!window.ttsBridge && document.querySelectorAll('#toolbar .tool-button').length > 10`, 20000);
  }, { critical: true, timeout: 90000 });
  add('Window: frameless, with its own minimize / maximize / close buttons', async () => {
    assert.equal(await ev(`document.querySelectorAll('#menubar [data-window]').length`), 3);
    assert.deepEqual(await ev(`[...document.querySelectorAll('#menubar [data-window] svg')].map((s) => s.dataset.icon)`), ['winMinimize', 'winMaximize', 'winClose']);
    assert.deepEqual(await ev(`[innerWidth, innerHeight]`), [1520, 910]);
  });
  add('Host: the models of the scratch folder are listed as installed', async () => {
    const installed = await ev(`window.ttsBridge.getCachedModels().then((l) => l.filter((m) => m.downloaded).map((m) => m.id))`);
    assert.deepEqual(installed.sort(), [...data.models].sort());
    await page.waitFor(`document.querySelectorAll('#modelSelect option').length === 6`);
    assert.equal(await ev(`window.ttsBridge.getModelCatalog().then((c) => c.length)`), 6);
  });
  add('Start screen: models card marks installed models', async () => {
    await page.waitFor(`document.querySelectorAll('[data-start="model"]').length === 6`);
    const marked = await ev(`[...document.querySelectorAll('[data-start="model"].installed')].map((b) => b.dataset.value).sort()`);
    assert.deepEqual(marked, [...data.models].sort());
  }, { skip: needModels });

  // ── synthesis ──
  add('Read: synthesis draws the real waveform and plays (muted)', async () => {
    await domClick('[data-start="sample"][data-value="korean_greeting"]');
    await setValue('modelSelect', model(), 'change');
    await setValue('volumeRange', 0);
    await page.waitFor(`!document.querySelector('#speakText').disabled && document.querySelectorAll('#voiceSelect option').length > 1`, 30000);
    await domClick('#speakText');
    await page.waitFor(`document.querySelector('#waveformCanvas').classList.contains('has-audio')`, 120000, 'the waveform');
    await page.waitFor(`!document.querySelector('#pausePlayback').disabled`, 10000, 'playback');
    assert.notEqual(await ev(`document.querySelector('#waveformDuration').textContent`), '-:--');
  }, { skip: needModels, timeout: 150000 });
  add('Pause, resume from the same place, stop', async () => {
    await sleep(600);
    await domClick('#pausePlayback');
    const at = await ev(`document.querySelector('#waveformCurrent').textContent`);
    assert.ok(await ev(`!document.querySelector('#speakText').disabled`));
    await domClick('#speakText');
    await page.waitFor(`!document.querySelector('#pausePlayback').disabled`, 5000);
    await domClick('#stopPlayback');
    assert.equal(await ev(`document.querySelector('#waveformCurrent').textContent`), '0:00');
    assert.match(at, /^0:0\d$/);
  }, { skip: needModels });
  add('Reading the same text again does not synthesize again', async () => {
    const t = Date.now();
    await domClick('#speakText');
    await page.waitFor(`!document.querySelector('#pausePlayback').disabled`, 3000);
    await domClick('#stopPlayback');
    assert.ok(Date.now() - t < 2500, `${Date.now() - t} ms`);
  }, { skip: needModels });
  add('Every installed model synthesizes; WAV and MP3 files are written', async () => {
    for (const id of data.models) {
      const wav = path.join(config, `${id}.wav`);
      const mp3 = path.join(config, `${id}.mp3`);
      const n = await ev(`(async () => { const r = await window.ttsBridge.speak({ text: '안녕하세요.', modelId: ${q(id)}, language: 'ko-KR', speed: 1, normalize: true, normalizeLevel: 0.9 }); await window.ttsBridge.exportWav({ filePath: ${q(wav)}, audioBuffer: r.audioBuffer, sampleRate: r.sampleRate }); await window.ttsBridge.exportMp3({ filePath: ${q(mp3)}, audioBuffer: r.audioBuffer, sampleRate: r.sampleRate, bitrateKbps: 128 }); return r.audioBuffer.length; })()`, 120000);
      assert.ok(n > 4000, `${id}: ${n} samples`);
      assert.equal(fs.statSync(wav).size, 44 + n * 2, `${id} wav`);
      assert.ok(fs.statSync(mp3).size > 1000, `${id} mp3`);
    }
  }, { skip: needModels, timeout: 240000 });

  // ── speakers ──
  add('All speakers: every speaker is generated and listed below the waveform', async () => {
    await setValue('modelSelect', model(), 'change');
    await page.waitFor(`!document.querySelector('#speakAllVoices').disabled`, 30000);
    const ids = await ev(`[...document.querySelectorAll('#voiceSelect option')].filter((o) => o.value).map((o) => o.value)`);
    assert.equal(new Set(ids).size, ids.length, 'no duplicate speakers');
    await page.key('F5', { shift: true });
    await page.waitFor(`document.querySelectorAll('.speaker-row').length === ${ids.length}`, 5000);
    await page.waitFor(`document.querySelectorAll('.speaker-row.done').length === ${ids.length} && !document.querySelector('#speakAllVoices').disabled`, 300000, 'all speakers');
    assert.equal(await ev(`document.querySelectorAll('.speaker-row canvas').length`), ids.length);
    ctx.speakerCount = ids.length;
  }, { skip: needModels, timeout: 320000 });
  add('All speakers: ▶ loads that speaker into the waveform and the voice list', async () => {
    await ev(`(document.querySelectorAll('.speaker-row [data-speaker-action="play"]')[2].click(), true)`);
    const s = await ev(`({ active: document.querySelectorAll('.speaker-row')[2].classList.contains('active'), voice: document.querySelector('#voiceSelect').selectedIndex, label: document.querySelector('#waveformVoiceLabel').textContent, audio: document.querySelector('#waveformCanvas').classList.contains('has-audio') })`);
    assert.deepEqual([s.active, s.voice, s.audio], [true, 3, true]);
    await domClick('#stopPlayback');
  }, { skip: needModels });
  add('All speakers: stop generating skips the rest; × closes the results', async () => {
    await domClick('#speakAllVoices');
    await page.waitFor(`document.querySelectorAll('.speaker-row.done').length >= 1`, 60000);
    await domClick('[data-speaker-action="stop"]');
    await page.waitFor(`!document.querySelector('#speakAllVoices').disabled`, 60000);
    const skipped = await ev(`document.querySelectorAll('.speaker-row.skip').length`);
    assert.ok(skipped >= 1 && skipped < ctx.speakerCount, `skipped ${skipped}`);
    await domClick('[data-speaker-action="close"]');
    assert.equal(await ev(`document.querySelector('#speakerPanel').hidden`), true);
  }, { skip: needModels, timeout: 120000 });

  // ── tabs ──
  add('Tabs: a new tab starts without audio; the tab left keeps its waveform', async () => {
    const left = await ev(`document.querySelector('#docTabs .tab.active').dataset.docTab`);
    await domClick('#toolbar [data-cmd="newText"]');
    assert.equal(await ev(`document.querySelector('#waveformCanvas').classList.contains('has-audio')`), false);
    assert.equal(await ev(`document.querySelector('#textInput').value`), '');
    await domClick(`#docTabs .tab[data-doc-tab="${left}"]`);
    assert.equal(await ev(`document.querySelector('#waveformCanvas').classList.contains('has-audio')`), true);
  }, { skip: needModels });
  add('Tabs: switching is refused while synthesizing', async () => {
    await domClick('#speakAllVoices');
    await sleep(150);
    const before = await ev(`document.querySelector('#docTabs .tab.active').dataset.docTab`);
    await domClick('#docTabs .tab:not(.active)');
    assert.equal(await ev(`document.querySelector('#docTabs .tab.active').dataset.docTab`), before);
    assert.match(await ev(`document.querySelector('#statusBarMessage').textContent`), /합성 중에는 탭을/);
    await domClick('[data-speaker-action="stop"]');
    await page.waitFor(`!document.querySelector('#speakAllVoices').disabled`, 60000);
    await domClick('[data-speaker-action="close"]');
  }, { skip: needModels, timeout: 90000 });

  // ── files and clipboard ──
  add('Files: a text file is read; other files are refused', async () => {
    const file = path.join(config, '연습.txt');
    fs.writeFileSync(file, '파일에서 읽은 문장입니다.\n');
    assert.equal(await ev(`window.ttsBridge.readTextFile(${q(file)}).then((r) => r.content)`), '파일에서 읽은 문장입니다.\n');
    assert.ok(await ev(`window.ttsBridge.readTextFile(${q(exePath(ctx.release ? 'release' : 'debug'))}).then(() => false, () => true)`));
  });
  // The system clipboard is shared with the user: their text is put back afterwards, and when
  // another program holds the clipboard open the checks are skipped (not the program's fault).
  let savedClipboard = null;
  const HELD = /held by another|클립보드를 사용할 수 없습니다/;
  const copy = async (value) => {
    try { await ev(`window.ttsBridge.copyText(${q(value)})`, 10000); return null; } catch (error) {
      if (HELD.test(error.message)) return { skip: 'the system clipboard is held open by another program' };
      throw error;
    }
  };
  ctx.defer(async () => { if (savedClipboard && app && !app.exited) await ev(`window.ttsBridge.copyText(${q(savedClipboard)})`).catch(() => {}); });
  add('Clipboard: copy and paste through the program (the user\'s text is restored)', async () => {
    savedClipboard = await ev(`window.ttsBridge.readClipboard()`);
    const held = await copy(`클립보드 시험 ${Date.now() % 1000}`);
    if (held) return held;
    assert.match(await ev(`window.ttsBridge.readClipboard()`), /^클립보드 시험 \d+$/);
    return undefined;
  });
  add('Editor: "paste" in the context menu inserts the clipboard text', async () => {
    const held = await copy('붙여넣은 글');
    if (held) return held;
    await domClick('#toolbar [data-cmd="newText"]');
    const box = await page.center('#textInput');
    await page.click('#textInput');
    await page.mouse('mousePressed', box.x, box.y, { button: 'right' });
    await page.mouse('mouseReleased', box.x, box.y, { button: 'right' });
    await page.waitFor(`document.querySelector('.context-menu')`);
    await ev(`([...document.querySelectorAll('.context-menu .menu-item')].find((b) => b.textContent.includes('붙여넣기')).click(), true)`);
    await page.waitFor(`document.querySelector('#textInput').value === '붙여넣은 글'`, 3000);
    if (savedClipboard) await ev(`window.ttsBridge.copyText(${q(savedClipboard)})`).catch(() => {});
    return undefined;
  });

  // ── window ──
  add('Window: maximize and restore from the menu bar buttons', async () => {
    await domClick('[data-window="maximize"]');
    await page.waitFor(`document.querySelector('[data-window="maximize"] svg')?.dataset.icon === 'winRestore'`, 5000);
    const max = await ev(`innerWidth`);
    await domClick('[data-window="maximize"]');
    await page.waitFor(`document.querySelector('[data-window="maximize"] svg')?.dataset.icon === 'winMaximize' && innerWidth === 1520`, 5000);
    assert.ok(max > 1520);
  });
  add('Window: the resize grip is live (system sizing) and hidden when maximized', async () => {
    assert.equal(await ev(`document.querySelector('#resizeGrip').classList.contains('static')`), false);
    assert.equal(await ev(`getComputedStyle(document.querySelector('#resizeGrip')).cursor`), 'nwse-resize');
    await domClick('[data-window="maximize"]');
    await page.waitFor(`getComputedStyle(document.querySelector('#resizeGrip')).display === 'none'`, 5000);
    await domClick('[data-window="maximize"]');
    await page.waitFor(`getComputedStyle(document.querySelector('#resizeGrip')).display !== 'none' && innerWidth === 1520`, 5000);
  });
  add('Window: an OS resize below the minimum is undone (1180×720)', async () => {
    execFileSync('powershell', ['-NoProfile', '-Command', `
      Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetWindowPos(System.IntPtr h, System.IntPtr a, int x, int y, int cx, int cy, uint f);'
      $h = (Get-Process -Id ${app.child.pid}).MainWindowHandle
      [W.U]::SetWindowPos($h, [System.IntPtr]::Zero, 0, 0, 700, 500, 0x0016) | Out-Null`]);
    await sleep(800);
    const size = await ev(`[innerWidth, innerHeight]`);
    assert.ok(size[0] >= 1179 && size[1] >= 719, size.join('×'));
    const clipped = await ev(`(() => { const last = [...document.querySelectorAll('#toolbar .tool-button')].at(-1).getBoundingClientRect(); return last.right > innerWidth; })()`);
    assert.equal(clipped, false, 'toolbar cut off');
  }, { skip: process.platform !== 'win32' ? 'Windows only' : false });

  // ── guide window ──
  let guide = null;
  add('Guide: F1 opens the user guide in its own window', async () => {
    await page.key('F1');
    guide = await Page.connect(await waitForTarget(port, (t) => t.url.includes('guide.html'), 15000));
    await guide.waitFor(`document.querySelectorAll('#guideToc a').length >= 15 && document.querySelectorAll('#guideContent img').length >= 10`, 15000);
    assert.equal(await guide.eval(`document.querySelector('#guideContent h1').textContent`), 'TTS Multi OS 0.1 — 사용 설명서');
  });
  add('Guide: every image of the installed documents loads', async () => {
    await guide.waitFor(`[...document.querySelectorAll('#guideContent img')].every((i) => i.complete)`, 15000);
    assert.equal(await guide.eval(`[...document.querySelectorAll('#guideContent img')].filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src')).join()`), '');
  });
  add('Guide: Help › 튜토리얼 reuses the open guide window', async () => {
    await domClick('#menubar [data-menu="help"]');
    await domClick('.menu-layer [data-cmd="tutorial"]');
    await guide.waitFor(`document.querySelector('#guideContent h1')?.textContent.includes('튜토리얼')`, 10000);
    const windows = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    assert.equal(windows.filter((t) => t.type === 'page' && t.url.includes('guide.html')).length, 1);
  });

  // ── the host ──
  add('Host: when it dies the page is told and a new host serves', async () => {
    const before = app.hostPids();
    assert.ok(before.length >= 1, 'host process');
    await ev(`(window.__testErrors = [], window.ttsBridge.onAppError((e) => window.__testErrors.push(e.title)), true)`);
    for (const pid of before) process.kill(pid);
    await page.waitFor(`window.__testErrors.length > 0`, 15000, 'the error event');
    await page.waitFor(`window.ttsBridge.getModelCatalog().then((c) => c.length === 6, () => false)`, 30000, 'the new host');
    const after = app.hostPids();
    assert.ok(after.length >= 1 && !after.some((p) => before.includes(p)), `${before} → ${after}`);
    await ev(`(document.querySelector('#errorDialog').open && document.querySelector('#errorDialog').close(), true)`);
  }, { skip: process.platform !== 'win32' ? 'Windows only' : false, timeout: 60000 });
  add('Host: synthesis works again after the restart', async () => {
    const n = await ev(`window.ttsBridge.speak({ text: '다시 시작했습니다.', modelId: ${q(model())}, language: 'ko-KR', speed: 1, normalize: true, normalizeLevel: 0.9 }).then((r) => r.audioBuffer.length)`, 90000);
    assert.ok(n > 4000);
  }, { skip: needModels, timeout: 100000 });

  // ── quitting ──
  add('Quit: the close button ends the program, the guide window and the Node host', async () => {
    const hosts = app.hostPids();
    ev(`document.querySelector('[data-window=close]').click()`).catch(() => {});
    assert.ok(await app.waitExit(10000), 'program exited');
    await sleep(1000);
    const alive = hosts.filter((pid) => { try { process.kill(pid, 0); return true; } catch { return false; } });
    assert.deepEqual(alive, []);
    guide?.close();
  }, { timeout: 30000 });
  add('Isolation: the program logged into the scratch folder, not %APPDATA%', () => {
    const log = path.join(config, 'TTSMultiOSV10', 'logs', 'main.log');
    assert.ok(fs.existsSync(log), 'the scratch log exists');
    assert.match(fs.readFileSync(log, 'utf8'), /합성|Download|TTS|프로그램 시작/);
  });
  return list;
}
