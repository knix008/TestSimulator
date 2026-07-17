import { EQ_BANDS, EQ_Q, defaultEqGains, clampEqGain } from './eq.js';

/**
 * Builds a realtime effect chain and can offline-render the same settings.
 */
export function createEffectChain(ctx, settings) {
  const input = ctx.createGain();
  const gain = ctx.createGain();
  const eqFilters = EQ_BANDS.map((band) => {
    const f = ctx.createBiquadFilter();
    f.type = 'peaking';
    f.frequency.value = band.freq;
    f.Q.value = EQ_Q;
    f.gain.value = 0;
    return f;
  });
  const filter = ctx.createBiquadFilter();
  const delay = ctx.createDelay(2.0);
  const delayGain = ctx.createGain();
  const delayFeedback = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const waveshaper = ctx.createWaveShaper();
  const convolver = ctx.createConvolver();
  const reverbDry = ctx.createGain();
  const reverbWet = ctx.createGain();
  const merger = ctx.createGain();
  const analyser = ctx.createAnalyser();
  const output = ctx.createGain();

  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;

  // input → gain → EQ bands → filter → waveshaper → mix → analyser → out
  input.connect(gain);
  let node = gain;
  for (const eq of eqFilters) {
    node.connect(eq);
    node = eq;
  }
  node.connect(filter);
  filter.connect(waveshaper);

  waveshaper.connect(dry);
  dry.connect(merger);

  waveshaper.connect(delay);
  delay.connect(delayGain);
  delayGain.connect(wet);
  wet.connect(merger);
  delay.connect(delayFeedback);
  delayFeedback.connect(delay);

  waveshaper.connect(reverbDry);
  reverbDry.connect(merger);
  waveshaper.connect(convolver);
  convolver.connect(reverbWet);
  reverbWet.connect(merger);

  merger.connect(analyser);
  analyser.connect(output);

  const api = {
    input,
    output,
    analyser,
    nodes: {
      gain,
      eqFilters,
      filter,
      delay,
      delayGain,
      delayFeedback,
      dry,
      wet,
      waveshaper,
      convolver,
      reverbDry,
      reverbWet
    },
    apply(s) {
      applySettings(api, ctx, s);
    }
  };

  applySettings(api, ctx, settings);
  return api;
}

function applySettings(chain, ctx, s) {
  const {
    gain,
    eqFilters,
    filter,
    delay,
    delayGain,
    delayFeedback,
    dry,
    wet,
    waveshaper,
    convolver,
    reverbDry,
    reverbWet
  } = chain.nodes;
  const now = ctx.currentTime;

  gain.gain.setTargetAtTime(dbToGain(s.gainDb), now, 0.01);

  const eqGains = s.eqGains || defaultEqGains();
  eqFilters.forEach((f, i) => {
    const band = EQ_BANDS[i];
    const db = clampEqGain(eqGains[band.id] ?? 0);
    f.frequency.setTargetAtTime(band.freq, now, 0.01);
    f.Q.setTargetAtTime(EQ_Q, now, 0.01);
    f.gain.setTargetAtTime(db, now, 0.015);
  });

  filter.type = s.filterType || 'lowpass';
  filter.frequency.setTargetAtTime(s.filterFreq, now, 0.01);
  filter.Q.setTargetAtTime(s.filterQ, now, 0.01);

  delay.delayTime.setTargetAtTime(s.delayTime, now, 0.01);
  delayFeedback.gain.setTargetAtTime(s.delayFeedback, now, 0.01);
  const delayMix = clamp(s.delayMix, 0, 1);
  dry.gain.setTargetAtTime(1 - delayMix * 0.5, now, 0.01);
  delayGain.gain.setTargetAtTime(delayMix, now, 0.01);
  wet.gain.setTargetAtTime(1, now, 0.01);

  waveshaper.curve = makeDistortionCurve(s.distortion);
  waveshaper.oversample = '4x';

  const reverbMix = clamp(s.reverbMix, 0, 1);
  reverbDry.gain.setTargetAtTime(1 - reverbMix, now, 0.01);
  reverbWet.gain.setTargetAtTime(reverbMix, now, 0.01);
  convolver.buffer = makeImpulseResponse(ctx, s.reverbDecay || 1.5);
}

export function defaultEffectSettings() {
  return {
    gainDb: 0,
    playbackRate: 1,
    filterType: 'lowpass',
    filterFreq: 18000,
    filterQ: 0.7,
    delayTime: 0.18,
    delayFeedback: 0.25,
    delayMix: 0,
    distortion: 0,
    reverbMix: 0,
    reverbDecay: 1.8,
    eqGains: defaultEqGains()
  };
}

export function dbToGain(db) {
  return Math.pow(10, db / 20);
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function makeDistortionCurve(amount) {
  const k = amount * 100;
  const n = 44100;
  const curve = new Float32Array(n);
  if (k === 0) {
    for (let i = 0; i < n; i++) curve[i] = (i * 2) / n - 1;
    return curve;
  }
  const deg = Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

function makeImpulseResponse(ctx, duration) {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * duration));
  const impulse = ctx.createBuffer(2, length, rate);
  for (let c = 0; c < 2; c++) {
    const data = impulse.getChannelData(c);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
    }
  }
  return impulse;
}
