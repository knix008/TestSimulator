// AudioWorklet processors (loaded from a Blob): the dynamics filters (compressor with side-chain,
// limiter, expander, noise gate, upward compressor), spectral noise suppression, and the tap that hands
// the mixed tracks to the encoders. The DSP is also exported as plain functions for the node tests.

/** One-pole envelope coefficient for a time constant in ms. */
export const coef = (ms, rate) => (ms <= 0 ? 0 : Math.exp(-1 / ((ms / 1000) * rate)));
export const dbToMul = (db) => 10 ** (db / 20);
export const mulToDb = (m) => (m <= 0 ? -Infinity : 20 * Math.log10(m));

/**
 * Gain reduction (dB, ≤ 0 or ≥ 0 for upward) of one envelope level (dB) for each dynamics mode.
 * Kept identical in the worklet below (DYNAMICS_SOURCE) — test/unit/audio.test.js checks this function.
 */
export function dynamicsGain(mode, env, p) {
  switch (mode) {
    case 'compressor': return env > p.threshold ? (p.threshold + (env - p.threshold) / p.ratio) - env : 0;
    case 'limiter': return env > p.threshold ? p.threshold - env : 0;
    case 'expander': return env < p.threshold ? Math.max(-90, (env - p.threshold) * (p.ratio - 1)) : 0;
    case 'gate': return 0; // the gate is a state machine (see GATE in the worklet)
    case 'upward': {
      if (env >= p.threshold || env < -90) return 0;
      const knee = p.knee ?? 0;
      const below = p.threshold - env;
      const k = below < knee ? below / Math.max(1e-6, knee) : 1;
      return Math.min(30, below * (1 - p.ratio) * k);
    }
    default: return 0;
  }
}

export const WORKLET_SOURCE = String.raw`
const coef = (ms, rate) => (ms <= 0 ? 0 : Math.exp(-1 / ((ms / 1000) * rate)));
const toDb = (m) => (m <= 1e-9 ? -180 : 20 * Math.log10(m));
const fromDb = (db) => Math.pow(10, db / 20);
${dynamicsGain.toString()}

class Dynamics extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.p = options.processorOptions || {};
    this.mode = this.p.mode || 'compressor';
    this.env = -180; this.gain = 0; this.gateOpen = false; this.held = 0; this.gateGain = 0;
    this.port.onmessage = (e) => { this.p = { ...this.p, ...e.data }; this.mode = this.p.mode || this.mode; };
    this.reduction = 0; this.frames = 0;
  }
  process(inputs, outputs) {
    const input = inputs[0]; const out = outputs[0];
    if (!input || !input.length) return true;
    const side = inputs[1] && inputs[1].length ? inputs[1] : input;
    const p = this.p; const rate = sampleRate;
    const atk = coef(p.attack ?? 6, rate); const rel = coef(p.release ?? 60, rate);
    const n = input[0].length;
    for (let i = 0; i < n; i++) {
      let peak = 0;
      for (let c = 0; c < side.length; c++) { const v = Math.abs(side[c][i]); if (v > peak) peak = v; }
      const level = toDb(p.detector === 'peak' || this.mode !== 'expander' ? peak : peak * 0.7071);
      const k = level > this.env ? atk : rel;
      this.env = level + k * (this.env - level);
      let g = 0;
      if (this.mode === 'gate') {
        if (!this.gateOpen && this.env >= p.open) { this.gateOpen = true; this.held = 0; }
        else if (this.gateOpen && this.env < p.close) { this.held += 1000 / rate; if (this.held >= (p.hold ?? 200)) this.gateOpen = false; }
        else if (this.gateOpen) this.held = 0;
        const target = this.gateOpen ? 1 : 0;
        const gk = target > this.gateGain ? coef(p.attack ?? 25, rate) : coef(p.release ?? 150, rate);
        this.gateGain = target + gk * (this.gateGain - target);
        for (let c = 0; c < out.length; c++) out[c][i] = (input[c] || input[0])[i] * this.gateGain;
        continue;
      }
      g = dynamicsGain(this.mode, this.env, p) + (p.output ?? 0);
      const m = fromDb(g);
      this.reduction = Math.min(this.reduction, g);
      for (let c = 0; c < out.length; c++) out[c][i] = (input[c] || input[0])[i] * m;
    }
    if (++this.frames % 16 === 0) { this.port.postMessage({ reduction: this.reduction }); this.reduction = 0; }
    return true;
  }
}
registerProcessor('mybc-dynamics', Dynamics);

// Spectral noise suppression: 512-point frames, 50 % overlap, the noise floor of each bin follows its
// minimum; bins near the floor are pulled down to the suppression level.
class Denoise extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.N = 512; this.H = 256;
    this.level = fromDb(options.processorOptions?.level ?? -30);
    this.port.onmessage = (e) => { if (e.data.level != null) this.level = fromDb(e.data.level); };
    this.win = new Float32Array(this.N).map((_, i) => Math.sin(Math.PI * (i + 0.5) / this.N) ** 2);
    this.ch = [];
    this.re = new Float32Array(this.N); this.im = new Float32Array(this.N);
  }
  state(c) {
    if (!this.ch[c]) this.ch[c] = { inBuf: new Float32Array(this.N), outBuf: new Float32Array(this.N + this.H), fill: 0, noise: new Float32Array(this.N / 2 + 1).fill(1e-3), q: [] };
    return this.ch[c];
  }
  fft(re, im, inv) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (2 * Math.PI / len) * (inv ? 1 : -1); const wr = Math.cos(ang); const wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) { let cr = 1; let ci = 0;
        for (let k = 0; k < len / 2; k++) { const a = i + k; const b = a + len / 2; const tr = re[b] * cr - im[b] * ci; const ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } }
    if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
  frame(st) {
    const { N } = this; const re = this.re; const im = this.im;
    for (let i = 0; i < N; i++) { re[i] = st.inBuf[i] * this.win[i]; im[i] = 0; }
    this.fft(re, im, false);
    for (let k = 0; k <= N / 2; k++) {
      const mag = Math.hypot(re[k], im[k]);
      st.noise[k] = mag < st.noise[k] ? mag * 0.2 + st.noise[k] * 0.8 : st.noise[k] * 1.002 + 1e-7;
      const snr = mag / (st.noise[k] * 2.5 + 1e-9);
      const g = Math.max(this.level, Math.min(1, (snr - 1) / 2));
      re[k] *= g; im[k] *= g;
      if (k > 0 && k < N / 2) { re[N - k] = re[k]; im[N - k] = -im[k]; }
    }
    this.fft(re, im, true);
    for (let i = 0; i < N; i++) st.outBuf[i] += re[i] * this.win[i];
  }
  process(inputs, outputs) {
    const input = inputs[0]; const out = outputs[0];
    if (!input || !input.length) return true;
    for (let c = 0; c < out.length; c++) {
      const x = input[c] || input[0]; const y = out[c]; const st = this.state(c);
      for (let i = 0; i < x.length; i++) {
        st.inBuf[st.fill + this.H] = x[i];
        y[i] = st.outBuf[st.fill];
        st.fill++;
        if (st.fill === this.H) {
          this.frame(st);
          st.inBuf.copyWithin(0, this.H); st.outBuf.copyWithin(0, this.H); st.outBuf.fill(0, this.N); st.fill = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('mybc-denoise', Denoise);

// The encoders' tap: interleaves the channels and posts blocks of about 20 ms.
class Tap extends AudioWorkletProcessor {
  constructor(options) { super(); this.channels = options.processorOptions?.channels ?? 2; this.block = Math.round(sampleRate / 50); this.buf = new Float32Array(this.block * this.channels); this.fill = 0; this.on = false; this.port.onmessage = (e) => { this.on = Boolean(e.data.on); }; }
  process(inputs) {
    const input = inputs[0];
    if (!this.on) return true;
    const n = input?.[0]?.length ?? 128;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < this.channels; c++) this.buf[this.fill * this.channels + c] = input?.[c]?.[i] ?? input?.[0]?.[i] ?? 0;
      if (++this.fill === this.block) { this.port.postMessage({ data: this.buf, frames: this.block, time: currentTime }, [this.buf.buffer]); this.buf = new Float32Array(this.block * this.channels); this.fill = 0; }
    }
    return true;
  }
}
registerProcessor('mybc-tap', Tap);
`;
