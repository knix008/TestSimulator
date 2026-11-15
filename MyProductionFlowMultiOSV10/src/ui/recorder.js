// Animation recording (Simulation › Record animation): the visible 2D and 3D views are drawn side by side,
// as on screen, into one canvas every frame and recorded with MediaRecorder as a WebM video.
// No timeslice: the whole video comes as one blob when recording stops (Chromium's encoder is steadier so).

/** The shortest recording: the encoder needs this long before it writes any frame. */
const MIN_SECONDS = 4;
const MIME_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

export const recordingSupported = () => typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';

export class AnimationRecorder {
  /**
   * host: the element whose area is recorded; sources(): the visible canvases [{ canvas, before?() }] (before
   * renders a WebGL view just before it is copied, so its drawing buffer is not empty); background: CSS colour.
   */
  constructor({ host, sources, background = '#ffffff', fps = 30 }) {
    this.host = host; this.sources = sources; this.background = background; this.fps = fps;
    this.recorder = null; this.frames = 0; this.started = 0;
  }

  get active() { return Boolean(this.recorder); }
  get seconds() { return this.active ? (performance.now() - this.started) / 1000 : 0; }

  start() {
    if (this.recorder) return;
    const r = this.host.getBoundingClientRect();
    const scale = Math.min(2, window.devicePixelRatio || 1);
    // Even sizes (video encoders want them), at most 2560 wide.
    const f = Math.min(scale, 2560 / Math.max(1, r.width));
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.max(2, Math.round((r.width * f) / 2) * 2);
    this.canvas.height = Math.max(2, Math.round((r.height * f) / 2) * 2);
    this.ctx = this.canvas.getContext('2d');
    this.factor = f;
    this.frame();
    // Frames are pushed by frame() (requestFrame), not taken when the page paints: a hidden or headless
    // page may not paint, and then the video would be empty.
    const stream = this.canvas.captureStream(0);
    this.track = stream.getVideoTracks()[0];
    const mimeType = MIME_TYPES.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
    this.mime = mimeType || 'video/webm';
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, { mimeType: mimeType || undefined, videoBitsPerSecond: 8_000_000 });
    this.recorder.ondataavailable = (e) => { if (e.data?.size) this.chunks.push(e.data); };
    this.recorder.start();
    this.started = performance.now();
    this.frames = 0;
    // About fps frames a second (a timer, so the video keeps its pace even when animation frames stop).
    this.timer = setInterval(() => { if (this.recorder) this.frame(); }, 1000 / this.fps);
  }

  /** Copies the views into the recording canvas (also called by tests, where animation frames may not run). */
  frame() {
    const ctx = this.ctx; if (!ctx) return;
    const base = this.host.getBoundingClientRect(); const f = this.factor;
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for (const s of this.sources()) {
      const r = s.canvas.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      try { s.before?.(); ctx.drawImage(s.canvas, (r.left - base.left) * f, (r.top - base.top) * f, r.width * f, r.height * f); } catch { /* a lost context: skip */ }
    }
    this.track?.requestFrame?.();
    this.frames += 1;
  }

  /** Stops and returns the video as a Blob (null when nothing was recorded). */
  stop() {
    const rec = this.recorder;
    if (!rec) return Promise.resolve(null);
    // Chromium's video encoder needs a few seconds to start: a shorter recording would come out empty,
    // so it keeps recording (and pushing frames) until MIN_SECONDS have passed.
    const wait = Math.max(0, MIN_SECONDS * 1000 - (performance.now() - this.started));
    this.stopping ??= new Promise((r) => setTimeout(r, wait)).then(() => this.finish(rec));
    return this.stopping;
  }

  finish(rec) {
    clearInterval(this.timer);
    this.frame();
    this.recorder = null;
    return new Promise((resolve) => {
      rec.onstop = () => {
        for (const track of rec.stream.getTracks()) track.stop();
        resolve(this.chunks.length ? new Blob(this.chunks, { type: this.mime.split(';')[0] }) : null);
      };
      rec.stop();
    });
  }
}
