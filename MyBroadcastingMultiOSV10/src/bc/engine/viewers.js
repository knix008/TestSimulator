// Direct viewing: people open http://<this computer>:<port>/ in a browser and watch the program straight
// from here — no streaming service, no stream key. The page they get is server/viewer.html; the server
// (desktop: src-tauri/src/viewers.rs, web: server/viewers.mjs) hands over only the signalling text, and
// every viewer gets its own WebRTC connection from this page with the program picture and track sound.
//
// Signalling (JSON text, one object per message):
//   viewer → here  { type: 'hello', code }            { type: 'answer', sdp }   { type: 'ice', candidate }
//   here → viewer  { type: 'welcome', title, live }    { type: 'denied', reason: 'code' | 'full' }
//                  { type: 'offer', sdp, iceServers }  { type: 'ice', candidate } { type: 'count', viewers }
//                  { type: 'ended' }
//
// transport: { start({ open(id, addr), message(id, text), close(id) }) → { port, addresses },
//              send(id, text), drop(id), stop() }

/** Whether a viewer who said hello may watch: 'ok', or why not ('code' / 'full'). */
export function admit({ code = '', maxViewers = 0, watching = 0 }, hello) {
  if (String(code).trim() && String(hello?.code ?? '').trim() !== String(code).trim()) return 'code';
  if (maxViewers > 0 && watching >= maxViewers) return 'full';
  return 'ok';
}

/** "stun:a:3478, turn:b" (comma, space or new line) → RTCIceServer list. */
export function parseIceServers(text) {
  return String(text ?? '').split(/[\s,]+/).map((x) => x.trim()).filter((x) => /^(stun|turns?):/i.test(x)).map((urls) => ({ urls }));
}

/** The addresses a viewer can open: http://<address>:<port>/ (and ?code=… when there is one). */
export function viewerUrls(addresses, port, code = '') {
  const q = String(code).trim() ? `?code=${encodeURIComponent(String(code).trim())}` : '';
  return [...new Set(addresses)].map((a) => `http://${a.includes(':') ? `[${a}]` : a}:${port}/${q}`);
}

export class ViewerHost {
  constructor({ transport, stream, title = '', code = '', maxViewers = 10, iceServers = [], videoBitrate = 2500, fps = 30, codec = 'avc', emit = () => {} }) {
    Object.assign(this, { transport, stream, title, code, maxViewers, iceServers, videoBitrate, fps, codec, emit });
    this.viewers = new Map(); // id → { pc, admitted, addr }
    this.state = 'idle';
    this.sent = 0;
    this.kbps = 0;
    this.urls = [];
  }
  get watching() { return [...this.viewers.values()].filter((v) => v.admitted).length; }

  async start() {
    this.state = 'connecting';
    const { port, addresses } = await this.transport.start({
      open: (id, addr) => { this.viewers.set(id, { pc: null, admitted: false, addr }); },
      message: (id, text) => { this.onMessage(id, text).catch((error) => this.emit('log', `viewer ${id}: ${error.message}`)); },
      close: (id) => this.leave(id),
    });
    this.port = port;
    this.addresses = addresses;
    this.urls = viewerUrls(addresses, port, this.code);
    this.state = 'live';
    this.timer = setInterval(() => this.poll(), 1000);
    this.emit('started', { port, urls: this.urls });
  }

  send(id, message) { this.transport.send(id, JSON.stringify(message)); }

  async onMessage(id, text) {
    let m;
    try { m = JSON.parse(text); } catch { return; }
    const v = this.viewers.get(id) ?? { pc: null, admitted: false };
    this.viewers.set(id, v);
    if (m.type === 'hello') {
      if (v.admitted && m.again) { await this.offer(id); return; }
      if (v.admitted) return;
      const verdict = admit({ code: this.code, maxViewers: this.maxViewers, watching: this.watching }, m);
      if (verdict !== 'ok') { this.send(id, { type: 'denied', reason: verdict }); return; }
      v.admitted = true;
      this.send(id, { type: 'welcome', title: this.title, live: this.state === 'live' });
      this.emit('viewer', { id, joined: true, watching: this.watching });
      this.count();
      await this.offer(id);
    } else if (m.type === 'answer' && v.pc) {
      await v.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp });
    } else if (m.type === 'ice' && v.pc && m.candidate) {
      await v.pc.addIceCandidate(m.candidate).catch(() => {});
    }
  }

  /** A new peer connection for viewer `id` with the program's tracks. */
  async offer(id) {
    const v = this.viewers.get(id);
    if (!v) return;
    v.pc?.close();
    const pc = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: 'max-bundle' });
    v.pc = pc;
    for (const track of this.stream.getTracks()) {
      const tr = pc.addTransceiver(track, { direction: 'sendonly', streams: [this.stream] });
      if (track.kind === 'video') {
        const mime = { avc: 'video/H264', vp8: 'video/VP8', vp9: 'video/VP9', av1: 'video/AV1' }[this.codec] ?? 'video/H264';
        const caps = RTCRtpSender.getCapabilities?.('video')?.codecs ?? [];
        if (tr.setCodecPreferences && caps.some((c) => c.mimeType === mime)) tr.setCodecPreferences([...caps.filter((c) => c.mimeType === mime), ...caps.filter((c) => c.mimeType !== mime)]);
        const params = tr.sender.getParameters();
        params.encodings = [{ maxBitrate: this.videoBitrate * 1000, maxFramerate: this.fps }];
        await tr.sender.setParameters(params).catch(() => {});
      }
    }
    pc.onicecandidate = (e) => { if (e.candidate) this.send(id, { type: 'ice', candidate: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => this.emit('viewer', { id, state: pc.connectionState, watching: this.watching });
    await pc.setLocalDescription(await pc.createOffer());
    this.send(id, { type: 'offer', sdp: pc.localDescription.sdp, iceServers: this.iceServers });
  }

  leave(id) {
    const v = this.viewers.get(id);
    if (!v) return;
    v.pc?.close();
    this.viewers.delete(id);
    if (v.admitted) { this.emit('viewer', { id, joined: false, watching: this.watching }); this.count(); }
  }

  count() { for (const [id, v] of this.viewers) if (v.admitted) this.send(id, { type: 'count', viewers: this.watching }); }

  async poll() {
    let bytes = 0;
    for (const v of this.viewers.values()) {
      const stats = await v.pc?.getStats().catch(() => null);
      stats?.forEach((s) => { if (s.type === 'outbound-rtp') bytes += s.bytesSent ?? 0; });
    }
    this.kbps = Math.max(0, ((bytes - (this.lastBytes ?? bytes)) * 8) / 1000);
    this.lastBytes = bytes;
    this.sent = bytes;
  }

  async stop() {
    clearInterval(this.timer);
    for (const [id, v] of this.viewers) { if (v.admitted) this.send(id, { type: 'ended' }); v.pc?.close(); }
    this.viewers.clear();
    await new Promise((r) => setTimeout(r, 150)); // let "ended" reach the viewers
    await this.transport.stop();
    const was = this.state;
    this.state = 'stopped';
    if (was !== 'idle') this.emit('stopped');
  }
}
