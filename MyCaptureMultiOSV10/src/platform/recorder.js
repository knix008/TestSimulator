// Screen recording: a video source plus optional audio, encoded by MediaRecorder
// and streamed chunk by chunk into a file the backend keeps open.
//
// Two engines produce the video:
//   display – the OS/webview screen picker (getDisplayMedia). Smooth, includes the
//             cursor and can carry system audio. A region is cropped from it.
//   native  – frames grabbed by the backend from the monitor, window or region
//             chosen in the app. No picker, works where getDisplayMedia does not.
import { evenSize, fitInside, videoBitrate } from '../domain/geometry.js';
import { t } from '../i18n.js';
import { MicrophoneChain, mediaErrorText } from './microphone.js';
import { grabFrame, recordingWrite } from './native.js';

const MIME_CANDIDATES = {
  mp4: {
    withAudio: ['video/mp4;codecs=avc1.640033,mp4a.40.2', 'video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'],
    videoOnly: ['video/mp4;codecs=avc1.640033', 'video/mp4;codecs=avc1.42E01F', 'video/mp4;codecs=avc1', 'video/mp4'],
  },
  webm: {
    withAudio: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'],
    videoOnly: ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'],
  },
};

const MAX_FRAMES_IN_FLIGHT = 4;
const WARM_UP_TIMEOUT = 15000;

let warmUp = null;

/**
 * Chromium's H.264 encoder takes ~5 s to come up the first time in a process,
 * and an MP4 recording stopped before that comes out empty. Encoding a tiny
 * canvas once at start-up gets this out of the way; MP4 recordings wait for it.
 */
export function warmUpEncoder(format = 'mp4') {
  warmUp ??= runWarmUp(format);
  return warmUp;
}

/** Resolves once the warm-up (if any) has finished. */
export const encoderWarm = () => warmUp ?? Promise.resolve();

async function runWarmUp(format) {
  const mimeType = pickMimeType(format, false);
  if (!mimeType || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const stream = canvas.captureStream(15);
  const recorder = new MediaRecorder(stream, { mimeType });
  const done = new Promise((resolve) => recorder.addEventListener('stop', resolve, { once: true }));
  let frame = 0;
  const timer = setInterval(() => { context.fillStyle = frame++ % 2 ? '#123' : '#456'; context.fillRect(0, 0, 64, 64); }, 66);
  try {
    recorder.start(500);
    await new Promise((resolve) => {
      recorder.addEventListener('dataavailable', (event) => event.data.size && resolve());
      setTimeout(resolve, WARM_UP_TIMEOUT);
    });
    recorder.stop();
    await done;
  } catch {
    // Warm-up is best effort.
  } finally {
    clearInterval(timer);
    stream.getTracks().forEach((track) => track.stop());
  }
}

const defaultIsSupported = (type) => Boolean(globalThis.MediaRecorder?.isTypeSupported?.(type));

/** First MIME type the encoder accepts for `format`, or null. */
export function pickMimeType(format, withAudio, isSupported = defaultIsSupported) {
  const list = MIME_CANDIDATES[format]?.[withAudio ? 'withAudio' : 'videoOnly'] ?? [];
  return list.find((type) => isSupported(type)) ?? null;
}

export function recordingSupport() {
  const media = navigator.mediaDevices;
  return {
    recorder: typeof globalThis.MediaRecorder === 'function',
    display: typeof media?.getDisplayMedia === 'function',
    microphone: typeof media?.getUserMedia === 'function',
    canvas: typeof HTMLCanvasElement.prototype.captureStream === 'function',
    formats: { mp4: Boolean(pickMimeType('mp4', false)), webm: Boolean(pickMimeType('webm', false)) },
  };
}

/** setInterval in a worker: page timers are throttled when the window is hidden. */
function startTicker(fps, onTick) {
  const code = 'let id;onmessage=(e)=>{clearInterval(id);if(e.data>0)id=setInterval(()=>postMessage(0),e.data)};';
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  const worker = new Worker(url);
  worker.onmessage = onTick;
  worker.postMessage(Math.max(5, Math.round(1000 / fps)));
  return () => {
    worker.terminate();
    URL.revokeObjectURL(url);
  };
}

function waitForVideo(video) {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 2 && video.videoWidth > 0) return resolve();
    const timer = setTimeout(() => reject(new Error(t('rec.noVideo'))), 8000);
    video.addEventListener('loadeddata', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

export class ScreenRecorder {
  /**
   * @param {object} options
   * @param {'display'|'native'} options.engine
   * @param {object|null} options.source native source ({kind:'monitor'|'window'|'region',…})
   * @param {object|null} options.crop region crop for the display engine: { x, y, width, height, monitorWidth, monitorHeight }
   * @param {'window'|'monitor'} options.surface display-surface hint for the picker
   * @param {'mp4'|'webm'} options.format
   * @param {number} options.fps
   * @param {boolean} options.systemAudio
   * @param {boolean} options.microphone
   * @param {string|null} options.micDeviceId
   * @param {number} options.micGain input gain in percent
   * @param {(reason: string|null) => void} options.onEnded called when the source stops by itself
   * @param {(message: string) => void} options.onWarning
   */
  constructor(options) {
    this.options = options;
    this.cleanups = [];
    this.writeChain = Promise.resolve();
    this.writeError = null;
    this.activeMs = 0;
    this.segmentStart = null;
    this.ended = false;
  }

  /** Acquires every stream. Call it first in a click handler: the picker needs user activation. */
  async prepare() {
    const { engine, systemAudio, microphone } = this.options;
    try {
      const video = engine === 'display' ? await this.openDisplay() : await this.openNative();
      const audio = [];
      if (systemAudio) {
        const tracks = this.displayStream?.getAudioTracks() ?? [];
        if (tracks.length) audio.push(...tracks);
        else this.options.onWarning?.(t(engine === 'native' ? 'rec.noSystemAudioNative' : 'rec.systemAudioNotShared'));
      }
      if (microphone) await this.openMicrophone();
      const mixed = this.mixAudio(audio);
      this.stream = new MediaStream([video, ...(mixed ? [mixed] : [])]);
      this.mimeType = pickMimeType(this.options.format, Boolean(mixed));
      if (!this.mimeType) throw new Error(t('rec.formatUnsupported', { format: this.options.format.toUpperCase() }));
      const settings = video.getSettings();
      this.size = { width: settings.width ?? this.canvas?.width ?? 0, height: settings.height ?? this.canvas?.height ?? 0 };
      return { width: this.size.width, height: this.size.height, audioTracks: audio.length + (this.mic ? 1 : 0) };
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  async openDisplay() {
    const { crop, surface, fps, systemAudio } = this.options;
    try {
      this.displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: fps, max: fps }, displaySurface: crop ? 'monitor' : surface, cursor: 'always' },
        audio: systemAudio ? { suppressLocalAudioPlayback: false } : false,
        systemAudio: systemAudio ? 'include' : 'exclude',
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'exclude',
        monitorTypeSurfaces: 'include',
      });
    } catch (error) {
      throw new Error(mediaErrorText(error, t('rec.screenShare')));
    }
    const stream = this.displayStream;
    this.cleanups.push(() => stream.getTracks().forEach((track) => track.stop()));
    const [track] = stream.getVideoTracks();
    /** 'monitor' | 'window' | 'browser' — what the user picked. */
    this.surface = track.getSettings().displaySurface ?? null;
    track.addEventListener('ended', () => this.handleEnded(t('rec.shareStopped')));
    if (!crop) return track;

    if (track.getSettings().displaySurface && track.getSettings().displaySurface !== 'monitor') {
      throw new Error(t('rec.regionNeedsScreen'));
    }
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = new MediaStream([track]);
    await video.play();
    await waitForVideo(video);
    const scaleX = video.videoWidth / crop.monitorWidth;
    const scaleY = video.videoHeight / crop.monitorHeight;
    if (Math.abs(scaleX - scaleY) > 0.02) {
      throw new Error(t('rec.regionWrongScreen'));
    }
    const source = { x: crop.x * scaleX, y: crop.y * scaleY, width: crop.width * scaleX, height: crop.height * scaleY };
    const canvas = this.makeCanvas(evenSize(source.width, source.height));
    const context = canvas.getContext('2d', { alpha: false });
    const draw = () => context.drawImage(video, source.x, source.y, source.width, source.height, 0, 0, canvas.width, canvas.height);
    draw();
    this.cleanups.push(startTicker(fps, () => { if (!this.paused) draw(); }));
    this.cleanups.push(() => { video.srcObject = null; });
    return canvas.captureStream(fps).getVideoTracks()[0];
  }

  async openNative() {
    const { source, fps } = this.options;
    const first = await grabFrame(source);
    const size = evenSize(first.width, first.height);
    const canvas = this.makeCanvas(size);
    const context = canvas.getContext('2d', { alpha: false });
    let failures = 0;
    const paint = async (frame) => {
      if (frame.width >= canvas.width && frame.height >= canvas.height && frame.width - canvas.width <= 1 && frame.height - canvas.height <= 1) {
        context.putImageData(new ImageData(frame.pixels, frame.width, frame.height), 0, 0);
        return;
      }
      // The window was resized: letterbox into the fixed recording size.
      const bitmap = await createImageBitmap(new ImageData(frame.pixels, frame.width, frame.height));
      const box = fitInside(frame, canvas);
      context.fillStyle = '#000';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, box.x, box.y, box.width, box.height);
      bitmap.close();
    };
    await paint(first);
    // Moving a full-screen frame across IPC takes longer than one frame interval,
    // so several requests overlap; a frame that arrives after a newer one is dropped.
    let inFlight = 0;
    let requested = 0;
    let painted = 0;
    this.cleanups.push(startTicker(fps, async () => {
      if (inFlight >= MAX_FRAMES_IN_FLIGHT || this.paused || this.ended) return;
      inFlight += 1;
      const sequence = ++requested;
      try {
        const frame = await grabFrame(source);
        if (sequence > painted && !this.ended) {
          painted = sequence;
          await paint(frame);
        }
        failures = 0;
      } catch (error) {
        failures += 1;
        if (failures >= 10) this.handleEnded(t('rec.targetLost', { error: error?.message ?? error }));
      } finally {
        inFlight -= 1;
      }
    }));
    return canvas.captureStream(fps).getVideoTracks()[0];
  }

  makeCanvas({ width, height }) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    this.canvas = canvas;
    return canvas;
  }

  /** Microphone through the same gain chain the settings panel meters. */
  async openMicrophone() {
    this.mic = await MicrophoneChain.open(this.options.micDeviceId, this.options.micGain ?? 100);
    this.cleanups.push(() => this.mic.close());
  }

  /** One audio track: system audio and the microphone are mixed in the mic's graph. */
  mixAudio(systemTracks) {
    if (!this.mic) return systemTracks[0] ?? null;
    for (const track of systemTracks) {
      this.mic.context.createMediaStreamSource(new MediaStream([track])).connect(this.mic.destination);
    }
    return this.mic.track;
  }

  /** Live view of what is being recorded. */
  get previewStream() {
    return this.stream ? new MediaStream(this.stream.getVideoTracks()) : null;
  }

  /** Starts encoding into the open recording file `recordingId`. */
  start(recordingId) {
    const { width, height } = this.size;
    this.recordingId = recordingId;
    this.recorder = new MediaRecorder(this.stream, {
      mimeType: this.mimeType,
      videoBitsPerSecond: videoBitrate(width, height, this.options.fps),
      audioBitsPerSecond: 160_000,
    });
    this.stopped = new Promise((resolve) => this.recorder.addEventListener('stop', resolve, { once: true }));
    this.recorder.addEventListener('dataavailable', (event) => {
      if (this.stopRequested) this.lastChunk?.();
      if (!event.data?.size) return;
      const blob = event.data;
      this.writeChain = this.writeChain.then(async () => {
        if (this.writeError) return;
        try {
          await recordingWrite(this.recordingId, new Uint8Array(await blob.arrayBuffer()));
        } catch (error) {
          this.writeError = error;
          this.handleEnded(t('rec.writeFailed', { error: error?.message ?? error }));
        }
      });
    });
    this.recorder.addEventListener('error', (event) => this.handleEnded(t('rec.encoderError', { error: event.error?.message ?? '?' })));
    // WebM streams to disk every second. Chromium's MP4 muxer writes the file only
    // when stopped anyway, and time slices make its encoder start unreliably.
    this.recorder.start(this.options.format === 'mp4' ? undefined : 1000);
    this.segmentStart = performance.now();
  }

  pause() {
    if (this.recorder?.state !== 'recording') return;
    this.recorder.pause();
    this.paused = true;
    this.activeMs += performance.now() - this.segmentStart;
    this.segmentStart = null;
  }

  resume() {
    if (this.recorder?.state !== 'paused') return;
    this.paused = false;
    this.recorder.resume();
    this.segmentStart = performance.now();
  }

  /** Stops encoding and waits until every chunk is on disk. Returns the recorded duration. */
  async stop() {
    if (this.segmentStart != null) this.activeMs += performance.now() - this.segmentStart;
    this.segmentStart = null;
    if (this.recorder && this.recorder.state !== 'inactive') {
      // The MP4 muxer hands over its whole file only when stopped, and that
      // last chunk can arrive just after the stop event; wait for it.
      const lastChunk = new Promise((resolve) => { this.lastChunk = resolve; });
      this.stopRequested = true;
      this.recorder.stop();
      await this.stopped;
      await Promise.race([lastChunk, new Promise((resolve) => setTimeout(resolve, 3000))]);
    }
    await this.writeChain;
    this.dispose();
    if (this.writeError) throw this.writeError;
    return { durationMs: Math.round(this.activeMs) };
  }

  handleEnded(reason) {
    if (this.ended) return;
    this.ended = true;
    this.options.onEnded?.(reason);
  }

  dispose() {
    this.ended = true;
    while (this.cleanups.length) {
      try {
        this.cleanups.pop()();
      } catch {
        // Cleanup is best effort; a stopped track or closed context may throw.
      }
    }
  }
}
