// WHIP (WebRTC-HTTP ingestion, RFC 9725): the stream goes straight from the app to the server over WebRTC
// The picture is the output canvas, the sound track 1 of the mixer.
// Also: projectors in other windows get their picture over a local peer connection (BroadcastChannel
// carries the offer and answer), since a MediaStream cannot cross windows by itself.

export class WhipOutput {
  constructor({ canvas, audioStream, fps = 30, url, token = '', videoBitrate = 2500, audioBitrate = 128, codec = 'avc', emit = () => {} }) {
    Object.assign(this, { canvas, audioStream, fps, url, token, videoBitrate, audioBitrate, codec, emit });
    this.state = 'idle';
    this.sent = 0;
  }
  async start() {
    this.state = 'connecting';
    this.emit('connecting');
    const pc = new RTCPeerConnection({ bundlePolicy: 'max-bundle' });
    this.pc = pc;
    const video = this.canvas.captureStream(this.fps).getVideoTracks()[0];
    const tv = pc.addTransceiver(video, { direction: 'sendonly' });
    const audio = this.audioStream?.getAudioTracks()[0];
    if (audio) pc.addTransceiver(audio, { direction: 'sendonly' });
    // Codec preference: the profile's encoder first.
    const mime = { avc: 'video/H264', vp8: 'video/VP8', vp9: 'video/VP9', av1: 'video/AV1', hevc: 'video/H265' }[this.codec] ?? 'video/H264';
    const caps = RTCRtpSender.getCapabilities?.('video')?.codecs ?? [];
    if (tv.setCodecPreferences && caps.length) tv.setCodecPreferences([...caps.filter((c) => c.mimeType === mime), ...caps.filter((c) => c.mimeType !== mime)]);
    const params = tv.sender.getParameters();
    params.encodings = [{ maxBitrate: this.videoBitrate * 1000, maxFramerate: this.fps }];
    await tv.sender.setParameters(params).catch(() => {});
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') { this.state = 'live'; this.emit('started'); }
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') { if (this.state === 'live') this.emit('error', new Error(`WebRTC ${pc.connectionState}`)); }
    };
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise((resolve) => { if (pc.iceGatheringState === 'complete') resolve(); else { const t = setTimeout(resolve, 2000); pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); resolve(); } }; } });
    const headers = { 'Content-Type': 'application/sdp' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const r = await fetch(this.url, { method: 'POST', headers, body: pc.localDescription.sdp });
    if (!r.ok) throw new Error(`WHIP ${r.status} ${r.statusText}`);
    this.resource = r.headers.get('Location') ? new URL(r.headers.get('Location'), this.url).href : null;
    await pc.setRemoteDescription({ type: 'answer', sdp: await r.text() });
    this.timer = setInterval(() => this.poll(), 1000);
  }
  async poll() {
    const stats = await this.pc?.getStats().catch(() => null);
    stats?.forEach((s) => { if (s.type === 'outbound-rtp' && s.kind === 'video') { this.kbps = ((s.bytesSent - (this.lastBytes ?? s.bytesSent)) * 8) / 1000; this.lastBytes = s.bytesSent; this.sent = s.bytesSent; this.dropped = s.framesDropped ?? 0; } });
  }
  async stop() {
    clearInterval(this.timer);
    if (this.resource) await fetch(this.resource, { method: 'DELETE', headers: this.token ? { Authorization: `Bearer ${this.token}` } : {} }).catch(() => {});
    this.pc?.close();
    this.pc = null;
    const was = this.state;
    this.state = 'stopped';
    if (was !== 'idle') this.emit('stopped');
  }
}

export const PROJECTOR_CHANNEL = 'mybroadcasting-projector';

/** Main window side: answers projector windows with a stream of what they show. */
export class ProjectorHost {
  constructor(streamFor) {
    this.streamFor = streamFor; // (which, id) → MediaStream
    this.peers = new Map();
    this.channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(PROJECTOR_CHANNEL) : null;
    if (this.channel) this.channel.onmessage = (e) => this.onMessage(e.data);
  }
  async onMessage(m) {
    if (m?.type === 'hello') {
      this.peers.get(m.id)?.pc.close();
      const pc = new RTCPeerConnection();
      const stream = this.streamFor(m.which, m.id);
      for (const track of stream?.getTracks() ?? []) pc.addTrack(track, stream);
      pc.onicecandidate = (e) => { if (e.candidate) this.channel.postMessage({ type: 'ice', to: m.id, candidate: e.candidate.toJSON() }); };
      this.peers.set(m.id, { pc, which: m.which });
      await pc.setLocalDescription(await pc.createOffer());
      this.channel.postMessage({ type: 'offer', to: m.id, sdp: pc.localDescription.sdp });
    } else if (m?.type === 'answer') {
      await this.peers.get(m.from)?.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }).catch(() => {});
    } else if (m?.type === 'ice' && m.from) {
      await this.peers.get(m.from)?.pc.addIceCandidate(m.candidate).catch(() => {});
    } else if (m?.type === 'bye') {
      this.peers.get(m.id)?.pc.close();
      this.peers.delete(m.id);
      this.onClosed?.(m.id);
    }
  }
  get count() { return this.peers.size; }
  closeAll() { for (const [id, p] of this.peers) { p.pc.close(); this.channel?.postMessage({ type: 'close', to: id }); } this.peers.clear(); }
}

/** Projector window side: asks for `which` and shows it in `video`. */
export function connectProjector(which, video, { onClose } = {}) {
  const id = `p${Math.random().toString(36).slice(2, 9)}`;
  const channel = new BroadcastChannel(PROJECTOR_CHANNEL);
  let pc = null;
  channel.onmessage = async (e) => {
    const m = e.data;
    if (m?.to !== id) return;
    if (m.type === 'offer') {
      pc = new RTCPeerConnection();
      pc.ontrack = (ev) => { video.srcObject = ev.streams[0]; video.play().catch(() => {}); };
      pc.onicecandidate = (ev) => { if (ev.candidate) channel.postMessage({ type: 'ice', from: id, candidate: ev.candidate.toJSON() }); };
      await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      channel.postMessage({ type: 'answer', from: id, sdp: pc.localDescription.sdp });
    } else if (m.type === 'ice') await pc?.addIceCandidate(m.candidate).catch(() => {});
    else if (m.type === 'close') onClose?.();
  };
  channel.postMessage({ type: 'hello', id, which });
  const retry = setInterval(() => { if (!pc) channel.postMessage({ type: 'hello', id, which }); else clearInterval(retry); }, 1500);
  addEventListener('beforeunload', () => channel.postMessage({ type: 'bye', id }));
  return { id, close: () => { clearInterval(retry); channel.postMessage({ type: 'bye', id }); pc?.close(); channel.close(); } };
}
