// Playback and export (Web Audio). A mixer — one bus per track (volume, pan, reverb send) into a
// master with a compressor — is built the same way for the speakers (AudioContext) and for files
// (OfflineAudioContext). The player schedules notes a little ahead of time from a timer, follows a
// loop region, plays a metronome, and reports the play position; edits while playing are picked up.
import { audible, songBeats } from '../music/song.js';
import { beatsPerBar } from '../music/theory.js';
import { noiseBuffer, playDrum, playNote, releaseOf } from './voices.js';

/** Swing: off-beat eighths (and sixteenths) are played late by the song's swing amount (0–0.5). */
export function swingBeat(t, swing) {
  if (!swing) return t;
  const frac = t - Math.floor(t);
  if (Math.abs(frac - 0.5) < 1e-3) return t + swing * 0.5;
  if (Math.abs(frac - 0.25) < 1e-3 || Math.abs(frac - 0.75) < 1e-3) return t + swing * 0.25;
  return t;
}

/** A reverb impulse: stereo noise fading over `seconds`. */
function impulse(ac, seconds = 2.2) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buffer = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let seed = 7 + ch * 101;
    for (let i = 0; i < len; i++) { seed = (seed * 16807) % 2147483647; data[i] = ((seed / 2147483647) * 2 - 1) * (1 - i / len) ** 2.6; }
  }
  return buffer;
}

/** The mixer for a song in a context: { input(trackId), master, setTrack(track, song), setMix(song) }. */
export function buildMixer(ac, song, destination = ac.destination) {
  const master = ac.createGain();
  const compressor = ac.createDynamicsCompressor();
  compressor.threshold.value = -14; compressor.knee.value = 8; compressor.ratio.value = 3.5; compressor.attack.value = 0.004; compressor.release.value = 0.2;
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -1.5; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.08;
  const reverb = ac.createConvolver();
  reverb.buffer = impulse(ac);
  const reverbReturn = ac.createGain();
  reverb.connect(reverbReturn).connect(master);
  const bypass = ac.createGain();
  master.connect(compressor).connect(limiter).connect(destination);
  const buses = new Map();
  const mixer = {
    master, compressor, reverb, analyser: null,
    input(trackId) { return buses.get(trackId)?.input ?? master; },
    setTrack(track) {
      let bus = buses.get(track.id);
      if (!bus) {
        const input = ac.createGain();
        const gain = ac.createGain();
        const pan = ac.createStereoPanner ? ac.createStereoPanner() : ac.createGain();
        const send = ac.createGain();
        input.connect(gain).connect(pan).connect(master);
        gain.connect(send).connect(reverb);
        bus = { input, gain, pan, send };
        buses.set(track.id, bus);
      }
      const on = audible(song, track);
      bus.gain.gain.setTargetAtTime(on ? track.volume : 0, ac.currentTime, 0.015);
      if (bus.pan.pan) bus.pan.pan.setTargetAtTime(track.pan, ac.currentTime, 0.015);
      bus.send.gain.setTargetAtTime(track.reverb, ac.currentTime, 0.015);
      return bus;
    },
    setMix(next = song) {
      song = next;
      master.gain.setTargetAtTime(song.mix.master, ac.currentTime, 0.02);
      reverbReturn.gain.setTargetAtTime(song.mix.reverb * 1.4, ac.currentTime, 0.02);
      compressor.ratio.value = song.mix.compressor ? 3.5 : 1;
      for (const track of song.tracks) mixer.setTrack(track);
    },
    dispose() { try { master.disconnect(); limiter.disconnect(); } catch { /* gone */ } },
  };
  void bypass;
  mixer.setMix(song);
  return mixer;
}

/** Every note of the song as an event list sorted by time: [{ beat, track, note }]. */
export function eventsOf(song, { start = 0, end = Infinity, tracks = null } = {}) {
  const out = [];
  for (const track of song.tracks) {
    if (tracks && !tracks.includes(track.id)) continue;
    for (const n of track.notes) if (n.t >= start - 1e-9 && n.t < end - 1e-9) out.push({ beat: swingBeat(n.t, song.swing), track, note: n });
  }
  out.sort((a, b) => a.beat - b.beat);
  return out;
}

/** The previous note of the same vocal track (for the guide voice's legato scoop). */
const previousPitch = (track, n) => { const i = track.notes.indexOf(n); const p = i > 0 ? track.notes[i - 1] : null; return p && n.t - (p.t + p.d) < 0.3 ? p.p : null; };

// ───────────────────────── live playback

export class Player {
  constructor() {
    this.ac = null;
    this.mixer = null;
    this.song = null;
    this.playing = false;
    this.anchor = { time: 0, beat: 0 };
    this.cursor = 0;
    this.events = [];
    this.next = 0;
    this.timer = 0;
    this.sources = new Set();
    this.metronome = false;
    this.lastMetro = -1;
    this.onPosition = null;
    this.onEnd = null;
    this.latency = 0.08;
    this.volume = 1;
  }

  /** The AudioContext (made on first use: browsers allow sound only after a click or key). */
  context() {
    if (!this.ac) {
      const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!AC) throw new Error('Web Audio is not available');
      this.ac = new AC({ latencyHint: 'interactive' });
      this.out = this.ac.createGain();
      this.out.gain.value = this.volume;
      this.analyser = this.ac.createAnalyser();
      this.analyser.fftSize = 1024;
      this.out.connect(this.analyser);
      this.out.connect(this.ac.destination);
    }
    if (this.ac.state === 'suspended') this.ac.resume().catch(() => {});
    return this.ac;
  }

  setVolume(volume) { this.volume = volume; if (this.out) this.out.gain.setTargetAtTime(volume, this.ac.currentTime, 0.02); }

  /** The song changed (notes, mix): the mixer follows and the events are taken again from the cursor. */
  update(song) {
    this.song = song;
    if (this.mixer && this.mixerSong === song) this.mixer.setMix(song);
    else if (this.ac) { this.mixer?.dispose(); this.mixer = buildMixer(this.ac, song, this.out); this.mixerSong = song; }
    if (this.playing) this.reload();
  }

  reload() {
    const from = this.cursor;
    this.events = eventsOf(this.song, { start: 0, end: this.loopEnd() });
    this.next = this.events.findIndex((e) => e.beat >= from - 1e-9);
    if (this.next < 0) this.next = this.events.length;
  }

  loopEnd() {
    const l = this.song?.loop;
    return l?.on && l.end > l.start ? l.end : songBeats(this.song) + 0.001;
  }

  spb() { return 60 / this.song.bpm; }

  /** Starts playing from `beat`. */
  play(song, beat = 0) {
    const ac = this.context();
    this.stop({ silent: true });
    this.song = song;
    this.mixer?.dispose();
    this.mixer = buildMixer(ac, song, this.out);
    this.mixerSong = song;
    const l = song.loop;
    if (l?.on && l.end > l.start && (beat < l.start || beat >= l.end)) beat = l.start;
    this.anchor = { time: ac.currentTime + this.latency, beat };
    this.cursor = beat;
    this.playing = true;
    this.lastMetro = Math.ceil(beat) - 1;
    this.reload();
    this.tick();
    this.timer = setInterval(() => this.tick(), 25);
    this.frame();
  }

  /** The play position in beats (now, as heard). */
  position() {
    if (!this.playing || !this.ac) return this.cursor;
    const at = this.anchor.beat + (this.ac.currentTime - this.anchor.time) / this.spb();
    return Math.max(this.anchor.beat - 0.001, at);
  }

  tick() {
    if (!this.playing) return;
    const ac = this.ac;
    const ahead = ac.currentTime + 0.2;
    const spb = this.spb();
    const loopEnd = this.loopEnd();
    const l = this.song.loop;
    // Schedule until `ahead`, wrapping at the loop end.
    for (let guard = 0; guard < 8; guard++) {
      const untilBeat = Math.min(loopEnd, this.anchor.beat + (ahead - this.anchor.time) / spb);
      while (this.next < this.events.length && this.events[this.next].beat < untilBeat) {
        const e = this.events[this.next++];
        const when = this.anchor.time + (e.beat - this.anchor.beat) * spb;
        if (when < ac.currentTime - 0.05) continue;
        this.voice(e, Math.max(ac.currentTime, when), spb);
      }
      if (this.metronome) this.clicks(untilBeat, spb);
      this.cursor = untilBeat;
      if (untilBeat < loopEnd - 1e-9) break;
      if (l?.on && l.end > l.start) {
        this.anchor = { time: this.anchor.time + (loopEnd - this.anchor.beat) * spb, beat: l.start };
        this.cursor = l.start;
        this.next = this.events.findIndex((e) => e.beat >= l.start - 1e-9);
        if (this.next < 0) this.next = this.events.length;
        this.lastMetro = Math.ceil(l.start) - 1;
      } else {
        // The end: stop once the last notes have rung.
        const endTime = this.anchor.time + (loopEnd - this.anchor.beat) * spb;
        clearInterval(this.timer);
        this.timer = 0;
        setTimeout(() => { if (this.playing && !this.timer) { this.stop(); this.onEnd?.(); } }, Math.max(0, (endTime - ac.currentTime) * 1000 + 200));
        break;
      }
    }
  }

  voice(e, when, spb) {
    const { track, note } = e;
    if (!audible(this.song, track)) return;
    const dest = this.mixer.input(track.id);
    this.mixer.setTrack(track);
    const sources = playNote(this.ac, dest, track.instrument, when, note.d * spb, note.p, note.v, { syllable: note.syl, previous: track.role === 'vocal' ? previousPitch(track, note) : null });
    for (const s of sources) { this.sources.add(s); s.onended = () => this.sources.delete(s); }
  }

  clicks(untilBeat, spb) {
    const per = beatsPerBar(this.song.timeSignature);
    while (this.lastMetro + 1 < untilBeat) {
      this.lastMetro += 1;
      const beat = this.lastMetro;
      if (beat < this.anchor.beat - 1e-9) continue;
      const when = this.anchor.time + (beat - this.anchor.beat) * spb;
      const osc = this.ac.createOscillator();
      const g = this.ac.createGain();
      osc.frequency.value = beat % per === 0 ? 1760 : 1175;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(0.25, when + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
      osc.connect(g).connect(this.out);
      osc.start(when); osc.stop(when + 0.06);
    }
  }

  frame() {
    if (!this.playing) return;
    this.onPosition?.(this.position());
    requestAnimationFrame(() => this.frame());
  }

  /** Stops; the position stays where it was (or `at`). */
  stop({ silent = false, at = null } = {}) {
    const pos = this.position();
    this.playing = false;
    clearInterval(this.timer);
    this.timer = 0;
    const now = this.ac?.currentTime ?? 0;
    for (const s of this.sources) { try { s.stop(now + 0.02); } catch { /* done */ } }
    this.sources.clear();
    if (this.mixer && this.ac) {
      const fade = this.mixer.master.gain;
      fade.cancelScheduledValues(now);
      fade.setTargetAtTime(0, now, 0.01);
      const old = this.mixer;
      setTimeout(() => old.dispose(), 120);
      this.mixer = null;
    }
    this.cursor = at ?? pos;
    if (!silent) this.onPosition?.(this.cursor);
    return this.cursor;
  }

  /** One note now (piano roll clicks, the instrument library). */
  preview(instrumentId, midi, { vel = 0.8, dur = 0.45, syllable = 'a' } = {}) {
    const ac = this.context();
    const dest = this.out;
    const g = ac.createGain();
    g.gain.value = 0.8;
    g.connect(dest);
    playNote(ac, g, instrumentId, ac.currentTime + 0.01, dur, midi, vel, { syllable });
    setTimeout(() => g.disconnect(), (dur + releaseOf(instrumentId) + 0.5) * 1000);
  }

  /** A short phrase of an instrument (the library's ▶): a chord or a drum groove. */
  previewPhrase(instrumentId, kind = 'melodic') {
    const ac = this.context();
    const t0 = ac.currentTime + 0.05;
    const g = ac.createGain();
    g.gain.value = 0.8;
    g.connect(this.out);
    if (kind === 'drums') {
      const kit = instrumentId;
      const hits = [[0, 36], [0, 42], [0.25, 42], [0.5, 38], [0.5, 42], [0.75, 42], [1, 36], [1.125, 36], [1, 42], [1.25, 42], [1.5, 38], [1.5, 42], [1.75, 46]];
      for (const [t, n] of hits) playNote(ac, g, kit, t0 + t, 0.1, n, 0.85);
    } else {
      const notes = kind === 'bass' ? [[0, 36], [0.5, 43], [1, 48], [1.5, 43]] : kind === 'vocal' ? [[0, 64, 'la'], [0.4, 67, 'la'], [0.8, 69, 'la'], [1.2, 72, 'a']] : [[0, 60], [0.3, 64], [0.6, 67], [0.9, 72], [1.3, 60], [1.3, 64], [1.3, 67]];
      for (const [t, n, syl] of notes) playNote(ac, g, instrumentId, t0 + t, kind === 'vocal' ? 0.38 : 0.6, n, 0.8, { syllable: syl });
    }
    setTimeout(() => g.disconnect(), 4000);
  }

  /** Levels for the meter: peak (0–1) of what is playing. */
  level() {
    if (!this.analyser) return 0;
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v));
    return peak;
  }
}

// ───────────────────────── export

/**
 * Renders a song (or a part, or some tracks) to an AudioBuffer. options: { sampleRate, start, end (beats),
 * tracks ([ids] or null), tail (s), onProgress(fraction), signal ({ cancelled }) }.
 */
export async function renderSong(song, { sampleRate = 44100, start = 0, end = null, tracks = null, tail = 2.5, onProgress = null, signal = null } = {}) {
  const OAC = globalThis.OfflineAudioContext ?? globalThis.webkitOfflineAudioContext;
  if (!OAC) throw new Error('OfflineAudioContext is not available');
  const last = end ?? songBeats(song);
  const spb = 60 / song.bpm;
  const seconds = (last - start) * spb + tail;
  const length = Math.max(1, Math.ceil(seconds * sampleRate));
  const ac = new OAC(2, length, sampleRate);
  noiseBuffer(ac);
  const view = tracks ? { ...song, tracks: song.tracks.map((t) => (tracks.includes(t.id) ? { ...t, mute: false, solo: false } : { ...t, mute: true, solo: false })) } : song;
  const mixer = buildMixer(ac, view, ac.destination);
  const events = eventsOf(view, { start, end: last });
  // Notes are scheduled in slices, the rendering suspended at each one: thousands of notes do not have to
  // exist at once, and the progress window moves.
  const slice = 4;
  let index = 0;
  const scheduleUntil = (time) => {
    while (index < events.length && (events[index].beat - start) * spb < time) {
      const e = events[index++];
      if (!audible(view, e.track)) continue;
      const when = (e.beat - start) * spb;
      playNote(ac, mixer.input(e.track.id), e.track.instrument, when, e.note.d * spb, e.note.p, e.note.v, { syllable: e.note.syl, previous: e.track.role === 'vocal' ? previousPitch(e.track, e.note) : null });
    }
  };
  scheduleUntil(slice + 0.5);
  if (typeof ac.suspend === 'function') {
    for (let t = slice; t < seconds; t += slice) {
      ac.suspend(t).then(() => {
        if (signal?.cancelled) return;
        scheduleUntil(t + slice + 0.5);
        onProgress?.(Math.min(0.99, t / seconds));
        ac.resume();
      });
    }
  } else scheduleUntil(Infinity);
  const buffer = await ac.startRendering();
  if (signal?.cancelled) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
  onProgress?.(1);
  return buffer;
}

/** A drum hit straight to the speakers (the piano roll's drum lanes). */
export function previewDrum(player, kit, n) {
  const ac = player.context();
  playDrum(ac, player.out, kit, n, ac.currentTime + 0.01, 0.85);
}
