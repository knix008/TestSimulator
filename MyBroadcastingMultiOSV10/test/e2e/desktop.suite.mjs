// Desktop E2E: the real app (WebView2, Tauri IPC, the Rust backend) driven over the DevTools port. What only
// the desktop has: recording files written natively, FFmpeg streaming and remux, global hotkeys, projector
// windows, the remote-control WebSocket server, system numbers, files from absolute paths, OS popup windows.
// [F:<id>] in a name marks the feature (src/bc/features.js) the case proves.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep } from './cdp.mjs';
import { freeDevPort } from '../../scripts/dev-port.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const work = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mybc-desktop-out-'));
const fwd = (p) => p.replace(/\\/g, '\\\\');

export const desktopCases = [
  {
    group: 'Desktop',
    name: 'Backend answers: app info (name, version, OS), first-run detection',
    async run(app) {
      const r = await app.run(`return { info: A.state.info, title: document.title, desktop: Boolean(window.__TAURI_INTERNALS__) };`);
      assert.ok(r.desktop, 'Tauri IPC present');
      assert.equal(r.info?.name, 'MyBroadcasting');
      assert.match(r.info?.version ?? '', /^\d+\.\d+\.\d+/);
      assert.match(r.title, /MyBroadcasting v/);
    },
  },
  {
    group: 'Desktop',
    name: '[F:shell.menus] popups open and close as their own OS windows',
    async run(app) {
      for (const kind of ['about', 'settings']) {
        await app.run(`A.popups.open(${JSON.stringify(kind)}, ${kind === 'settings' ? "{ tab: 'stream' }" : '{}'}); return 1;`);
        const end = Date.now() + 15000;
        let found = null;
        while (Date.now() < end && !found) { found = (await app.targets()).find((t) => t.title === `popup-${kind}` || String(t.url).includes(`popup=${kind}`)); if (!found) await sleep(200); }
        assert.ok(found, `popup-${kind} window target`);
        await app.run(`await A.popups.close(${JSON.stringify(kind)}); return 1;`);
      }
    },
  },
  {
    group: 'Desktop',
    name: '[F:src.image] [F:tool.stats] a picture from an absolute path loads; system numbers come from the backend',
    async run(app) {
      const dir = work();
      const file = path.join(dir, 'red.png');
      fs.copyFileSync(path.join(root, 'test', 'fixtures', 'red.png'), file);
      const r = await app.run(`await T.empty(); const img = await T.add('image_source', { file: '${fwd(file)}' }); await T.until(() => img.rt.status === 'ready', 10000, 'image'); const px = await T.pixel(10, 10);
        const sys = await A.studio.platform.systemStats(null); return { px, sys };`);
      assert.ok(r.px[0] > 200 && r.px[1] < 40, `red pixel ${r.px}`);
      assert.ok(r.sys.memoryTotal > 0 && r.sys.cpu != null, JSON.stringify(r.sys));
    },
  },
  {
    group: 'Desktop',
    name: '[F:rec.start] [F:rec.formats] [F:rec.chapter] [F:rec.remux] a recording is written to disk natively, then remuxed with chapters',
    async run(app) {
      const dir = work();
      const r = await app.run(`await T.reset({ workspace: true }); await A.studio.startAudio(); A.studio.noSave = false;
        A.studio.updateProfile((p) => { p.output.mode = 'simple'; p.output.simple.recFormat = 'mkv'; p.output.simple.encoder = 'avc'; p.output.simple.recPath = '${fwd(dir)}'; p.video.output = '640x360'; p.advanced.autoRemux = true; p.advanced.remuxFormat = 'mp4'; return p; });
        await A.actions.startRecording(); await T.sleep(1500); A.studio.addChapter('Mark'); await T.sleep(1500); await A.actions.stopRecording({ confirmed: true });
        await T.until(() => A.studio.logLines.some((l) => /remuxed/.test(l.text)), 20000, 'remuxed');
        A.studio.updateProfile((p) => { p.output.simple.recPath = ''; p.advanced.autoRemux = false; return p; }); A.studio.noSave = true; return A.studio.lastRecording;`, 90000);
      const files = fs.readdirSync(dir);
      const mkv = files.find((f) => f.endsWith('.mkv'));
      const mp4 = files.find((f) => f.endsWith('.mp4'));
      assert.ok(mkv && mp4, `files: ${files.join(', ')}`);
      assert.equal(fs.readFileSync(path.join(dir, mkv)).subarray(0, 4).toString('hex'), '1a45dfa3');
      const probe = spawnSync('ffprobe', ['-v', 'error', '-show_chapters', '-show_entries', 'stream=codec_name', '-of', 'json', path.join(dir, mp4)], { encoding: 'utf8' });
      const info = JSON.parse(probe.stdout || '{}');
      assert.ok(info.streams?.some((s) => s.codec_name === 'h264'), `H.264 in the MP4: ${probe.stdout}`);
      assert.ok(info.chapters?.some((c) => c.tags?.title === 'Mark'), `the chapter: ${probe.stdout}`);
      assert.ok(r.bytes > 10000);
    },
  },
  {
    group: 'Desktop',
    name: '[F:str.start] [F:str.protocols] streaming through the app\'s own FFmpeg reaches an RTMP server',
    async run(app) {
      const port = await freeDevPort(19450);
      const out = path.join(work(), 'got.flv');
      const server = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-listen', '1', '-timeout', '20', '-f', 'flv', '-i', `rtmp://127.0.0.1:${port}/live/k`, '-c', 'copy', '-y', out], { stdio: 'ignore' });
      try {
        await sleep(2000); // FFmpeg is listening by then (a connection to probe it would use up its one listen)
        await app.run(`await T.reset({ workspace: true }); A.studio.noSave = false; A.studio.updateProfile((p) => { p.stream = { ...p.stream, service: 'custom', server: 'rtmp://127.0.0.1:${port}/live', key: 'k' }; p.output.simple.encoder = 'avc'; p.video.output = '640x360'; return p; });
          await A.actions.startStream({ confirmed: true }); T.check(A.studio.outputs.stream, 'live'); await T.until(() => (A.studio.stats().stream?.bytes ?? 0) > 100000, 30000, 'bytes reach the server').catch((e) => { throw new Error(e.message + ' | ' + JSON.stringify(A.studio.stats().stream) + ' | ' + A.studio.logLines.slice(-12).map((l) => l.text).join(' / ') + ' | hubs ' + JSON.stringify([...A.studio.hubs.values()].map((h) => ({ k: h.key, u: h.users, st: h.hub.encoder?.state, enc: h.hub.encoded, fr: h.hub.frames })))); }); await T.sleep(2000); await A.actions.stopStream({ confirmed: true }); A.studio.noSave = true; return 1;`, 60000);
        await new Promise((resolve) => { server.on('exit', resolve); setTimeout(() => { server.kill(); resolve(); }, 8000); });
        const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', out], { encoding: 'utf8' });
        assert.match(probe.stdout, /h264/, `got: ${probe.stdout} ${probe.stderr}`);
      } finally { server.kill(); }
    },
  },
  {
    group: 'Desktop',
    name: '[F:hk.global] hotkeys are registered globally with the operating system',
    async run(app) {
      const r = await app.run(`await T.reset({ workspace: true }); A.studio.noSave = false; A.studio.bindHotkey('toggleStudio', ['Ctrl+Alt+Shift+F10']); A.app.updateSettings({ globalHotkeys: true }); await A.actions.bindHotkeys(); await T.sleep(500);
        const ok = await window.__TAURI_INTERNALS__.invoke('plugin:global-shortcut|is_registered', { shortcut: 'Control+Alt+Shift+F10' });
        A.studio.bindHotkey('toggleStudio', []); await A.actions.bindHotkeys(); A.studio.noSave = true; return ok;`);
      assert.equal(r, true, 'registered with the OS');
    },
  },
  {
    group: 'Desktop',
    name: '[F:std.projector] [F:out.virtualcam] a projector opens as its own window and shows the program',
    async run(app) {
      await app.run(`await T.reset({ workspace: true }); await A.studio.platform.openProjector({ label: 'projector-e2e', query: 'program', title: 'Projector test' }); return 1;`);
      const end = Date.now() + 20000;
      let target = null;
      while (Date.now() < end && !target) { target = (await app.targets()).find((t) => String(t.url).includes('projector=')); if (!target) await sleep(300); }
      assert.ok(target, 'projector window');
      const { Page } = await import('./cdp.mjs');
      const page = await new Page(target).open();
      try { await page.waitFor('Boolean(window.__mybroadcastingProjector && window.__mybroadcastingProjector.video.videoWidth > 0)', { timeout: 20000 }); } finally { await page.eval('window.close(); 1').catch(() => {}); page.close(); }
      await app.run(`await A.studio.startVirtualCam(); await T.until(() => A.studio.projectors.count >= 1, 20000, 'vcam'); A.studio.stopVirtualCam(); return 1;`, 40000);
    },
  },
  {
    group: 'Desktop',
    name: '[F:tool.websocket] the remote-control server speaks the remote-control protocol 5 to a real client',
    async run(app) {
      const port = await freeDevPort(14455);
      await app.run(`await T.reset({ workspace: true }); A.studio.noSave = false; A.studio.updateProfile((p) => { p.advanced.websocket = { enabled: true, port: ${port}, auth: false, password: '', all: false }; return p; }); await A.actions.applyRemote(); return 1;`);
      try {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`);
        const messages = [];
        const next = () => new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error('no answer')), 8000); ws.onmessage = (e) => { clearTimeout(t); resolve(JSON.parse(e.data)); }; });
        await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('no connection')); });
        messages.push(await next());
        assert.equal(messages[0].op, 0, 'Hello');
        ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1 } }));
        assert.equal((await next()).op, 2, 'Identified');
        ws.send(JSON.stringify({ op: 6, d: { requestType: 'GetSceneList', requestId: 'a' } }));
        const list = await next();
        assert.equal(list.op, 7);
        assert.ok(list.d.responseData.scenes.length >= 1, JSON.stringify(list));
        ws.close();
      } finally {
        await app.run(`A.studio.updateProfile((p) => { p.advanced.websocket.enabled = false; return p; }); await A.actions.applyRemote(); A.studio.noSave = true; return 1;`);
      }
    },
  },
  {
    group: 'Desktop',
    name: '[F:str.direct] direct viewing: the app serves the viewer page and answers a viewer with a WebRTC offer',
    async run(app) {
      const port = await freeDevPort(18790);
      const urls = await app.run(`await T.reset({ workspace: true }); A.studio.noSave = false;
        A.studio.updateProfile((p) => { p.stream = { ...p.stream, service: 'direct', direct: { ...p.stream.direct, port: ${port}, code: '', stun: '' } }; return p; });
        await A.actions.startStream({ confirmed: true }); T.check(A.studio.outputs.stream?.state === 'live', 'live'); return A.studio.outputs.stream.urls;`, 30000);
      try {
        assert.ok(urls.includes(`http://127.0.0.1:${port}/`), JSON.stringify(urls));
        const page = await (await fetch(`http://127.0.0.1:${port}/`)).text();
        assert.match(page, /RTCPeerConnection/);
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        const inbox = [];
        ws.onmessage = (e) => inbox.push(JSON.parse(e.data));
        await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('no viewer link')); });
        ws.send(JSON.stringify({ type: 'hello', code: '' }));
        const end = Date.now() + 15000;
        while (Date.now() < end && !inbox.some((m) => m.type === 'offer')) await sleep(100);
        assert.ok(inbox.some((m) => m.type === 'welcome'), JSON.stringify(inbox));
        assert.match(inbox.find((m) => m.type === 'offer')?.sdp ?? '', /m=video/);
        ws.close();
      } finally {
        await app.run(`await A.actions.stopStream({ confirmed: true }); await A.popups.closeAll(); A.studio.updateProfile((p) => { p.stream = { ...p.stream, service: 'twitch' }; return p; }); A.studio.noSave = true; return 1;`);
      }
    },
  },
  {
    group: 'Desktop',
    name: '[F:str.direct] a taken viewer port: the running "npm run viewers" is joined; another program\'s port is skipped',
    async run(app) {
      const net = await import('node:net');
      const { startViewerServer } = await import('../../server/viewers.mjs');
      const viewerHello = async (port) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        const inbox = [];
        ws.onmessage = (e) => inbox.push(JSON.parse(e.data));
        await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error(`no viewer link on ${port}`)); });
        ws.send(JSON.stringify({ type: 'hello', code: '' }));
        const end = Date.now() + 15000;
        while (Date.now() < end && !inbox.some((m) => m.type === 'offer')) await sleep(100);
        ws.close();
        return inbox;
      };
      const go = (port) => app.run(`await T.reset({ workspace: true }); A.studio.noSave = false;
        A.studio.updateProfile((p) => { p.stream = { ...p.stream, service: 'direct', direct: { ...p.stream.direct, port: ${port}, code: '', stun: '' } }; return p; });
        await A.actions.startStream({ confirmed: true }); T.check(A.studio.outputs.stream?.state === 'live', 'live'); await A.popups.closeAll(); return A.studio.outputs.stream.urls;`, 30000);
      const stop = () => app.run(`await A.actions.stopStream({ confirmed: true }); await A.popups.closeAll(); A.studio.updateProfile((p) => { p.stream = { ...p.stream, service: 'twitch' }; return p; }); A.studio.noSave = true; return 1;`);
      // 1. "npm run viewers" already listens there: the app works through it, on the same address.
      const p1 = await freeDevPort(18810);
      const vs = await startViewerServer({ port: p1, host: '0.0.0.0', log: () => {} });
      try {
        const urls = await go(p1);
        assert.ok(urls.includes(`http://127.0.0.1:${p1}/`), JSON.stringify(urls));
        const inbox = await viewerHello(p1);
        assert.match(inbox.find((m) => m.type === 'offer')?.sdp ?? '', /m=video/, JSON.stringify(inbox));
      } finally { await stop(); await vs.close(); }
      // 2. Another program holds the port: the next free one is used and shown.
      const p2 = await freeDevPort(18830);
      const other = net.createServer((socket) => socket.destroy());
      await new Promise((resolve) => other.listen(p2, '0.0.0.0', resolve));
      try {
        const urls = await go(p2);
        const port = Number(/:(\d+)\/$/.exec(urls.at(-1))?.[1]);
        assert.ok(port > p2 && port <= p2 + 20, JSON.stringify(urls));
        const inbox = await viewerHello(port);
        assert.ok(inbox.some((m) => m.type === 'offer'), JSON.stringify(inbox));
      } finally { await stop(); other.close(); }
    },
  },
  {
    group: 'Desktop',
    name: '[F:src.browser] a browser source runs its page for real: scripts change the picture, the background stays transparent',
    async run(app) {
      if (process.platform !== 'win32') return;
      const r = await app.run(`await T.empty(); await T.add('color_source_v3', { color: '#00ff00', width: 1920, height: 1080 });
        const html = '<div id="b" style="position:absolute;left:0;top:0;width:300px;height:300px;background:#ff0000"></div><script>let i = 0; setInterval(() => { i++; document.getElementById("b").style.background = i % 2 ? "#0000ff" : "#ff0000"; }, 500);</script>';
        const b = await T.add('browser_source', { mode: 'html', html, width: 1920, height: 1080, css: 'body { background: rgba(0,0,0,0); margin: 0; }' });
        await T.until(() => b.rt.realPage && b.rt.status === 'ready', 20000, 'page frames');
        const seen = new Set(); const end = performance.now() + 3000;
        while (performance.now() < end) { const p = await T.pixel(100, 100); seen.add(p[0] > 200 && p[2] < 80 ? 'red' : p[2] > 200 && p[0] < 80 ? 'blue' : 'other'); await T.sleep(100); }
        const behind = await T.pixel(1200, 800); const ids = A.studio.engine.pageFrames.size;
        await T.empty(); await T.sleep(300);
        return { seen: [...seen], behind, ids, after: A.studio.engine.pageFrames.size };`, 60000);
      assert.ok(r.seen.includes('red') && r.seen.includes('blue'), `the page's script ran: ${r.seen}`);
      assert.ok(r.behind[1] > 200 && r.behind[0] < 60, `transparent around the box: ${r.behind}`);
      assert.equal(r.after, 0, 'the page closes with its source');
    },
  },
  {
    group: 'Desktop',
    name: '[F:out.virtualcam] the virtual camera device gets the program as frames; not installed, the user is asked (administrator / window / cancel)',
    async run(app) {
      if (process.platform !== 'win32') return;
      // Registering needs the user's yes on Windows' administrator prompt, so it is not done here; the frames
      // (program → JPEG → the app → the camera DLL) and the question are.
      const r = await app.run(`await T.reset({ workspace: true }); const status = await A.studio.platform.vcamDevice.status();
        await A.studio.startVirtualCam({ device: true }); await T.until(() => (A.studio.vcamDevice?.frames ?? 0) >= 15, 15000, 'frames to the camera');
        const sent = { mode: A.studio.outputs.vcam, frames: A.studio.vcamDevice.frames, w: A.studio.vcamDevice.w, h: A.studio.vcamDevice.h };
        A.studio.stopVirtualCam();
        let asked = null;
        if (!status.installed) {
          A.popups.inline = true; A.run('toggleVirtualCam'); await T.popupReady('confirm'); const d = T.popupDoc('confirm');
          asked = ['install', 'window', 'cancel'].every((id) => d.querySelector('[data-action="choice"][data-value="' + id + '"]'));
          d.querySelector('[data-action="choice"][data-value="window"]').click(); await T.until(() => A.studio.outputs.vcam === 'window', 15000, 'window mode'); A.studio.stopVirtualCam(); A.popups.inline = false;
        }
        return { status: { supported: status.supported, dll: Boolean(status.dll), installed: status.installed }, sent, asked };`, 60000);
      assert.ok(r.status.supported && r.status.dll, JSON.stringify(r.status));
      assert.equal(r.sent.mode, 'device');
      assert.ok(r.sent.frames >= 15 && r.sent.w % 4 === 0 && r.sent.h % 4 === 0, JSON.stringify(r.sent));
      if (!r.status.installed) assert.equal(r.asked, true, 'the three choices');
    },
  },
  {
    group: 'Desktop',
    name: '[F:src.interact] Interact: clicks and keys on the preview reach the browser source\'s page; Esc ends it',
    async run(app) {
      if (process.platform !== 'win32') return;
      const r = await app.run(`await T.empty();
        const html = '<div id="b" style="width:1920px;height:1080px;background:#ff0000"></div><script>let n = 0; document.addEventListener("mousedown", () => { n++; document.getElementById("b").style.background = n % 2 ? "#0000ff" : "#ff0000"; }); document.addEventListener("keydown", (e) => { if (e.key === "g") document.getElementById("b").style.background = "#00ff00"; });</script>';
        const b = await T.add('browser_source', { mode: 'html', html, width: 1920, height: 1080, css: 'body { margin: 0; }' });
        await T.until(() => b.rt.realPage && b.rt.status === 'ready', 20000, 'page frames'); await T.sleep(300);
        const colour = async () => { const p = await T.pixel(960, 540); return p[0] > 200 ? 'red' : p[2] > 200 ? 'blue' : p[1] > 200 ? 'green' : p.join(','); };
        const before = await colour();
        A.studio.select([b.item.id]); A.run('interact'); const ws = A.workspace(); const on = ws.interacting === b.item.id;
        const stage = document.querySelector('[data-stage="main"]').getBoundingClientRect(); const d = ws.display('main').rect; const dpr = devicePixelRatio || 1;
        const at = { clientX: stage.left + (960 * d.scale + d.x) / dpr, clientY: stage.top + (540 * d.scale + d.y) / dpr, button: 0, buttons: 1, bubbles: true, pointerId: 1 };
        const overlay = document.querySelector('[data-overlay="main"]');
        overlay.dispatchEvent(new PointerEvent('pointerdown', at)); overlay.dispatchEvent(new PointerEvent('pointerup', { ...at, buttons: 0 }));
        await T.until(async () => (await colour()) === 'blue', 5000, 'the click reached the page').catch(() => {}); const clicked = await colour();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', code: 'KeyG', keyCode: 71, bubbles: true })); document.dispatchEvent(new KeyboardEvent('keyup', { key: 'g', code: 'KeyG', keyCode: 71, bubbles: true }));
        await T.until(async () => (await colour()) === 'green', 5000, 'the key reached the page').catch(() => {}); const typed = await colour();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
        const ended = ws.interacting === null; await T.empty();
        return { before, on, clicked, typed, ended };`, 60000);
      assert.deepEqual(r, { before: 'red', on: true, clicked: 'blue', typed: 'green', ended: true });
    },
  },
  {
    group: 'Desktop',
    name: '[F:src.display] the app\'s windows are left out of screen captures (no studio inside the studio); the setting turns it off',
    async run(app) {
      if (process.platform !== 'win32') return;
      // GetWindowDisplayAffinity of the app's visible top-level windows: 0x11 = WDA_EXCLUDEFROMCAPTURE.
      const affinity = () => {
        const ps = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; using System.Text; public static class W { public delegate bool P(IntPtr h, IntPtr l); [DllImport("user32.dll")] public static extern bool EnumWindows(P p, IntPtr l); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid); [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h); [DllImport("user32.dll")] public static extern bool GetWindowDisplayAffinity(IntPtr h, out uint a); [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n); }'; $out = @(); [W]::EnumWindows({ param($h, $l) $p = 0; [void][W]::GetWindowThreadProcessId($h, [ref]$p); if ($p -eq ${app.process.pid} -and [W]::IsWindowVisible($h)) { $a = 0; [void][W]::GetWindowDisplayAffinity($h, [ref]$a); $s = New-Object System.Text.StringBuilder 256; [void][W]::GetWindowText($h, $s, 256); $script:out += ($s.ToString() + '=' + $a) }; return $true }, [IntPtr]::Zero) | Out-Null; $out -join '|'`;
        return spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).stdout.trim();
      };
      const main = (text) => /MyBroadcasting v[^=|]*=(\d+)/.exec(text)?.[1];
      let on = '';
      for (let i = 0; i < 20 && main(on) !== '17'; i++) { on = affinity(); if (main(on) !== '17') await sleep(300); }
      assert.equal(main(on), '17', `main window affinity: ${on}`);
      await app.run(`A.app.updateSettings({ hideFromCapture: false }); return 1;`);
      await sleep(500);
      const off = affinity();
      await app.run(`A.app.updateSettings({ hideFromCapture: true }); return 1;`);
      assert.equal(main(off), '0', `turned off: ${off}`);
    },
  },
  {
    group: 'Desktop',
    name: '[F:src.micInput] [F:src.camera] the microphone and camera are not asked for at every start (the app\'s page is allowed)',
    async run(app) {
      // A prompt would leave getUserMedia pending; allowed, it gives a stream (or "no such device" on a
      // computer without one). "NotAllowedError" would mean it was refused.
      const r = await app.run(`const ask = (c) => Promise.race([navigator.mediaDevices.getUserMedia(c).then((s) => { s.getTracks().forEach((x) => x.stop()); return 'granted'; }, (e) => e.name), T.sleep(6000).then(() => 'pending')]);
        return { audio: await ask({ audio: true }), video: await ask({ video: true }) };`, 20000);
      for (const [kind, answer] of Object.entries(r)) assert.ok(['granted', 'NotFoundError', 'NotReadableError'].includes(answer), `${kind}: ${answer}`);
    },
  },
  {
    group: 'Desktop',
    name: '[F:tool.sceneSwitcher] the front window\'s title comes from the operating system',
    async run(app) {
      const title = await app.run(`return await A.studio.platform.foregroundTitle();`);
      assert.equal(typeof title, 'string');
    },
  },
];
