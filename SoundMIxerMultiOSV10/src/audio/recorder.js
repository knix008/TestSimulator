export class AudioRecorder {
  constructor(engine) {
    this.engine = engine;
    this.mediaRecorder = null;
    this.chunks = [];
    this.stream = null;
    this.isRecording = false;
    this.micSource = null;
    this.dest = null;
  }

  async start() {
    await this.engine.ensureContext();
    const ctx = this.engine.ctx;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    this.micSource = ctx.createMediaStreamSource(this.stream);
    this.dest = ctx.createMediaStreamDestination();

    // Mic → effect chain → destination (monitor) + recorder
    this.micSource.connect(this.engine.chain.input);
    this.engine.chain.output.connect(this.dest);

    this.chunks = [];
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    this.mediaRecorder = new MediaRecorder(this.dest.stream, { mimeType: mime });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.mediaRecorder.start(100);
    this.isRecording = true;
  }

  async stop() {
    if (!this.mediaRecorder || !this.isRecording) return null;

    const blob = await new Promise((resolve) => {
      this.mediaRecorder.onstop = () => {
        resolve(new Blob(this.chunks, { type: this.mediaRecorder.mimeType || 'audio/webm' }));
      };
      this.mediaRecorder.stop();
    });

    this.cleanup();
    this.isRecording = false;
    return blob;
  }

  cancel() {
    if (this.mediaRecorder && this.isRecording) {
      try {
        this.mediaRecorder.stop();
      } catch (_) {
        /* ignore */
      }
    }
    this.cleanup();
    this.isRecording = false;
  }

  cleanup() {
    try {
      this.micSource?.disconnect();
    } catch (_) {
      /* ignore */
    }
    try {
      this.engine.chain?.output?.disconnect(this.dest);
    } catch (_) {
      /* ignore */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.micSource = null;
    this.dest = null;
    this.mediaRecorder = null;
    this.chunks = [];
  }
}
