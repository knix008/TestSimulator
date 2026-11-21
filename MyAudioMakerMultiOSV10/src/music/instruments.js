// The instrument library (CONTRACT: pure data): what each instrument is called, which General MIDI
// program it exports as, its useful range, and how the built-in synthesizer (audio/synth.js) plays it.
//
// Synth voice description (all optional):
//   waves:   [{ type: sine|square|sawtooth|triangle, detune (cents), gain, ratio (frequency multiple) }]
//   env:     { a, d, s, r } seconds / sustain level (0–1)
//   filter:  { type, freq (Hz, or a multiple of the note's frequency when `track` is set), q, env (octaves), decay, track }
//   fm:      { ratio, index, decay }  a sine modulator on the first wave (bells, e-piano)
//   noise:   gain of a short noise burst at the start (breath, pick, hammer)
//   vibrato: { rate, depth (cents), delay }
//   drive:   0–1 soft clipping (guitars)
//   decay:   seconds of a plucked / struck note's natural fade (it never sustains)
//   gain:    level
//
// Recorded instruments (all optional): `samples` names a sample set of the bundled sound library (sounds/manifest.json,
// built by scripts/fetch-sounds.mjs; a list layers several sets, e.g. a brass section), `sampleFx` colours it in the
// sampler (audio/sampler.js): { drive 0–1, cab (guitar speaker), bright / warm (dB shelf), gain }, `sampleGain` its
// level. The synth voice stays as the fallback while the samples load or when the library is missing.
// New instruments may borrow another's synth voice with `like` (voice null).
export const INSTRUMENT_CATEGORIES = [
  { id: 'keys', ko: '건반', en: 'Keys', icon: 'instKeys' },
  { id: 'guitar', ko: '기타', en: 'Guitar', icon: 'instGuitar' },
  { id: 'bass', ko: '베이스', en: 'Bass', icon: 'instBass' },
  { id: 'strings', ko: '현악기', en: 'Strings', icon: 'instStrings' },
  { id: 'winds', ko: '관악기', en: 'Brass & winds', icon: 'instWinds' },
  { id: 'synth', ko: '신시사이저', en: 'Synth', icon: 'instSynth' },
  { id: 'pad', ko: '패드', en: 'Pads', icon: 'instPad' },
  { id: 'mallet', ko: '타악 건반', en: 'Mallets & bells', icon: 'instMallet' },
  { id: 'drums', ko: '드럼', en: 'Drums', icon: 'instDrums' },
  { id: 'vocal', ko: '보컬', en: 'Vocals', icon: 'instVocal' },
];

const I = (id, category, ko, en, program, range, voice, extra = {}) => ({ id, category, ko, en, program, range, voice, ...extra });

export const INSTRUMENTS = [
  // ── keys
  I('piano', 'keys', '그랜드 피아노', 'Grand piano', 0, [21, 108], { waves: [{ type: 'triangle', gain: 0.6 }, { type: 'sine', ratio: 2, gain: 0.25 }, { type: 'sine', ratio: 3, gain: 0.08 }], env: { a: 0.004, d: 1.2, s: 0.18, r: 0.35 }, filter: { type: 'lowpass', freq: 6, track: true, q: 0.5, env: 1.2, decay: 0.6 }, noise: 0.03, decay: 3.2, gain: 0.55 }, { sampleGain: 0.35, samples: 'grandPiano' }),
  I('brightPiano', 'keys', '브라이트 피아노', 'Bright piano', 1, [21, 108], { waves: [{ type: 'triangle', gain: 0.5 }, { type: 'sawtooth', gain: 0.12 }, { type: 'sine', ratio: 2, gain: 0.25 }], env: { a: 0.003, d: 0.9, s: 0.2, r: 0.3 }, filter: { type: 'lowpass', freq: 9, track: true, q: 0.7, env: 1, decay: 0.5 }, noise: 0.04, decay: 2.6, gain: 0.5 }, { sampleGain: 0.31, samples: 'grandPiano', sampleFx: { bright: 6 } }),
  I('uprightPiano', 'keys', '업라이트 피아노', 'Upright piano', 0, [21, 108], null, { like: 'piano', sampleGain: 0.33, samples: 'uprightPiano' }),
  I('epiano', 'keys', '일렉트릭 피아노', 'Electric piano', 4, [28, 103], { waves: [{ type: 'sine', gain: 0.7 }, { type: 'sine', ratio: 2, gain: 0.12 }], fm: { ratio: 1, index: 2.2, decay: 0.9 }, env: { a: 0.003, d: 1.6, s: 0.3, r: 0.4 }, decay: 3, gain: 0.6 }, { sampleGain: 0.62, samples: 'wurlitzer' }),
  I('cp80', 'keys', '일렉트릭 그랜드 (CP80)', 'Electric grand (CP80)', 2, [24, 108], null, { like: 'brightPiano', sampleGain: 0.40, samples: 'cp80' }),
  I('pianet', 'keys', '일렉트릭 피아노 (피아넷)', 'Electric piano (Pianet)', 5, [29, 96], null, { like: 'epiano', sampleGain: 0.65, samples: 'pianet' }),
  I('organ', 'keys', '오르간', 'Organ', 16, [36, 96], { waves: [{ type: 'sine', gain: 0.5 }, { type: 'sine', ratio: 2, gain: 0.35 }, { type: 'sine', ratio: 3, gain: 0.2 }, { type: 'sine', ratio: 4, gain: 0.12 }], env: { a: 0.01, d: 0.05, s: 0.9, r: 0.08 }, vibrato: { rate: 6, depth: 6, delay: 0 }, gain: 0.32 }),
  I('churchOrgan', 'keys', '파이프 오르간', 'Pipe organ', 19, [24, 96], null, { like: 'organ', sampleGain: 0.38, samples: 'churchOrgan' }),
  I('harpsichord', 'keys', '하프시코드', 'Harpsichord', 6, [29, 89], { waves: [{ type: 'sawtooth', gain: 0.4 }, { type: 'square', ratio: 2, gain: 0.12 }], env: { a: 0.002, d: 0.6, s: 0.05, r: 0.15 }, filter: { type: 'lowpass', freq: 8, track: true, q: 1, env: 1, decay: 0.3 }, decay: 1.4, gain: 0.32 }, { sampleGain: 0.15, samples: 'harpsichord' }),
  // ── guitar
  I('acousticGuitar', 'guitar', '어쿠스틱 기타', 'Acoustic guitar', 25, [40, 84], { waves: [{ type: 'sawtooth', gain: 0.4 }, { type: 'triangle', ratio: 2, gain: 0.2 }], env: { a: 0.002, d: 0.8, s: 0.1, r: 0.2 }, filter: { type: 'lowpass', freq: 5, track: true, q: 1.2, env: 2, decay: 0.25 }, noise: 0.05, decay: 1.8, gain: 0.42 }),
  I('nylonGuitar', 'guitar', '나일론 기타', 'Nylon guitar', 24, [40, 84], { waves: [{ type: 'triangle', gain: 0.6 }, { type: 'sine', ratio: 2, gain: 0.2 }], env: { a: 0.003, d: 0.9, s: 0.12, r: 0.25 }, filter: { type: 'lowpass', freq: 4, track: true, q: 0.8, env: 1.4, decay: 0.3 }, noise: 0.03, decay: 2, gain: 0.5 }),
  I('cleanGuitar', 'guitar', '일렉 기타 (클린)', 'Clean electric guitar', 27, [40, 88], { waves: [{ type: 'square', gain: 0.25 }, { type: 'sawtooth', gain: 0.2 }], env: { a: 0.002, d: 0.7, s: 0.25, r: 0.2 }, filter: { type: 'lowpass', freq: 4, track: true, q: 2, env: 1.5, decay: 0.3 }, decay: 2.2, gain: 0.38 }, { sampleGain: 0.30, samples: 'greenGuitar', sampleFx: { cab: true } }),
  I('jazzGuitar', 'guitar', '재즈 기타', 'Jazz guitar', 26, [40, 88], null, { like: 'cleanGuitar', sampleGain: 0.42, samples: 'blackGuitar', sampleFx: { warm: 3 } }),
  I('overdriveGuitar', 'guitar', '일렉 기타 (오버드라이브)', 'Overdrive guitar', 29, [40, 88], { waves: [{ type: 'sawtooth', gain: 0.35 }, { type: 'sawtooth', detune: 9, gain: 0.3 }], env: { a: 0.004, d: 0.4, s: 0.65, r: 0.15 }, filter: { type: 'lowpass', freq: 2800, q: 1.5 }, drive: 0.75, gain: 0.24 }, { sampleGain: 0.39, samples: 'greenGuitar', sampleFx: { drive: 0.7, cab: true } }),
  I('crunchGuitar', 'guitar', '일렉 기타 (크런치)', 'Crunch guitar', 29, [40, 88], null, { like: 'overdriveGuitar', sampleGain: 0.36, samples: 'greenGuitar', sampleFx: { drive: 0.35, cab: true } }),
  I('distortionGuitar', 'guitar', '일렉 기타 (디스토션)', 'Distortion guitar', 30, [40, 88], null, { like: 'overdriveGuitar', sampleGain: 0.42, samples: 'greenGuitar', sampleFx: { drive: 1, cab: true } }),
  // ── bass
  I('fingerBass', 'bass', '핑거 베이스', 'Finger bass', 33, [28, 60], { waves: [{ type: 'triangle', gain: 0.7 }, { type: 'sawtooth', gain: 0.15 }], env: { a: 0.005, d: 0.5, s: 0.55, r: 0.12 }, filter: { type: 'lowpass', freq: 3, track: true, q: 1, env: 1, decay: 0.2 }, gain: 0.75 }, { sampleGain: 0.63, samples: 'growlyBass' }),
  I('pickBass', 'bass', '피크 베이스', 'Picked bass', 34, [28, 60], { waves: [{ type: 'sawtooth', gain: 0.45 }, { type: 'square', gain: 0.15 }], env: { a: 0.002, d: 0.3, s: 0.5, r: 0.1 }, filter: { type: 'lowpass', freq: 5, track: true, q: 2, env: 1.6, decay: 0.15 }, gain: 0.55 }, { sampleGain: 0.47, samples: 'fashionBass', sampleFx: { bright: 3 } }),
  I('synthBass', 'bass', '신스 베이스', 'Synth bass', 38, [24, 60], { waves: [{ type: 'sawtooth', gain: 0.4 }, { type: 'square', detune: -7, gain: 0.3 }], env: { a: 0.003, d: 0.25, s: 0.6, r: 0.08 }, filter: { type: 'lowpass', freq: 2.5, track: true, q: 5, env: 2.5, decay: 0.18 }, gain: 0.5 }),
  I('subBass', 'bass', '808 서브 베이스', '808 sub bass', 38, [21, 55], { waves: [{ type: 'sine', gain: 0.9 }, { type: 'triangle', ratio: 2, gain: 0.08 }], env: { a: 0.004, d: 1.2, s: 0.5, r: 0.25 }, drive: 0.25, gain: 0.85 }),
  I('uprightBass', 'bass', '업라이트 베이스', 'Upright bass', 32, [28, 60], { waves: [{ type: 'triangle', gain: 0.75 }, { type: 'sine', ratio: 2, gain: 0.12 }], env: { a: 0.008, d: 0.7, s: 0.2, r: 0.18 }, filter: { type: 'lowpass', freq: 2.5, track: true, q: 0.8, env: 0.8, decay: 0.25 }, noise: 0.02, decay: 1.5, gain: 0.8 }, { sampleGain: 0.57, samples: 'meatPizz' }),
  // ── strings
  I('strings', 'strings', '현악 합주', 'String ensemble', 48, [28, 96], { waves: [{ type: 'sawtooth', gain: 0.25 }, { type: 'sawtooth', detune: 8, gain: 0.25 }, { type: 'sawtooth', detune: -8, gain: 0.25 }], env: { a: 0.35, d: 0.3, s: 0.85, r: 0.6 }, filter: { type: 'lowpass', freq: 2600, q: 0.6 }, vibrato: { rate: 5.2, depth: 9, delay: 0.3 }, gain: 0.22 }, { sampleGain: 0.20, samples: 'stringEnsemble' }),
  I('tremoloStrings', 'strings', '트레몰로 현악', 'Tremolo strings', 44, [28, 96], null, { like: 'strings', sampleGain: 0.18, samples: 'tremoloStrings' }),
  I('violin', 'strings', '바이올린', 'Violin', 40, [55, 103], { waves: [{ type: 'sawtooth', gain: 0.4 }, { type: 'sawtooth', detune: 4, gain: 0.2 }], env: { a: 0.12, d: 0.2, s: 0.85, r: 0.25 }, filter: { type: 'lowpass', freq: 3800, q: 1.2 }, vibrato: { rate: 5.8, depth: 18, delay: 0.25 }, gain: 0.25 }, { sampleGain: 0.26, samples: 'soloViolin' }),
  I('cello', 'strings', '첼로', 'Cello', 42, [36, 76], { waves: [{ type: 'sawtooth', gain: 0.4 }, { type: 'triangle', gain: 0.25 }], env: { a: 0.15, d: 0.2, s: 0.85, r: 0.3 }, filter: { type: 'lowpass', freq: 1800, q: 1 }, vibrato: { rate: 5, depth: 14, delay: 0.3 }, gain: 0.32 }, { sampleGain: 0.38, samples: 'celloSection' }),
  I('contrabass', 'strings', '콘트라베이스 (아르코)', 'Contrabass (arco)', 43, [24, 60], null, { like: 'cello', sampleGain: 0.41, samples: 'meatArco' }),
  I('pizzicato', 'strings', '피치카토', 'Pizzicato strings', 45, [28, 96], { waves: [{ type: 'triangle', gain: 0.6 }, { type: 'sawtooth', gain: 0.15 }], env: { a: 0.002, d: 0.3, s: 0, r: 0.1 }, filter: { type: 'lowpass', freq: 4, track: true, q: 1, env: 1, decay: 0.12 }, decay: 0.45, gain: 0.55 }, { sampleGain: 0.24, samples: 'pizzStrings' }),
  I('harp', 'strings', '하프', 'Harp', 46, [23, 103], null, { like: 'nylonGuitar', sampleGain: 0.31, samples: 'concertHarp' }),
  // ── brass & winds
  I('brass', 'winds', '브라스 섹션', 'Brass section', 61, [34, 84], { waves: [{ type: 'sawtooth', gain: 0.35 }, { type: 'sawtooth', detune: 6, gain: 0.3 }], env: { a: 0.04, d: 0.2, s: 0.75, r: 0.18 }, filter: { type: 'lowpass', freq: 3, track: true, q: 1.5, env: 1.5, decay: 0.15 }, gain: 0.26 }, { sampleGain: 0.27, samples: ['trumpet', 'trombone', 'frenchHorn'] }),
  I('trumpet', 'winds', '트럼펫', 'Trumpet', 56, [52, 86], { waves: [{ type: 'sawtooth', gain: 0.4 }, { type: 'square', gain: 0.1 }], env: { a: 0.03, d: 0.15, s: 0.8, r: 0.12 }, filter: { type: 'lowpass', freq: 4, track: true, q: 2, env: 1.2, decay: 0.12 }, vibrato: { rate: 5.5, depth: 10, delay: 0.35 }, gain: 0.25 }, { sampleGain: 0.36, samples: 'trumpet' }),
  I('trombone', 'winds', '트롬본', 'Trombone', 57, [34, 77], null, { like: 'brass', sampleGain: 0.37, samples: 'trombone' }),
  I('frenchHorn', 'winds', '호른', 'French horn', 60, [34, 77], null, { like: 'brass', sampleGain: 0.26, samples: 'frenchHorn' }),
  I('tuba', 'winds', '튜바', 'Tuba', 58, [26, 58], null, { like: 'brass', sampleGain: 0.35, samples: 'tuba' }),
  I('sax', 'winds', '알토 색소폰', 'Alto sax', 65, [49, 81], { waves: [{ type: 'sawtooth', gain: 0.3 }, { type: 'square', gain: 0.18 }], env: { a: 0.04, d: 0.2, s: 0.8, r: 0.15 }, filter: { type: 'bandpass', freq: 3, track: true, q: 0.9 }, noise: 0.05, vibrato: { rate: 5, depth: 15, delay: 0.3 }, gain: 0.38 }, { sampleGain: 0.29, samples: 'altoSax' }),
  I('tenorSax', 'winds', '테너 색소폰', 'Tenor sax', 66, [44, 76], null, { like: 'sax', sampleGain: 0.27, samples: 'tenorSax' }),
  I('bariSax', 'winds', '바리톤 색소폰', 'Baritone sax', 67, [36, 69], null, { like: 'sax', sampleGain: 0.28, samples: 'bariSax' }),
  I('flute', 'winds', '플루트', 'Flute', 73, [60, 96], { waves: [{ type: 'sine', gain: 0.7 }, { type: 'triangle', ratio: 2, gain: 0.05 }], env: { a: 0.06, d: 0.1, s: 0.85, r: 0.15 }, noise: 0.08, vibrato: { rate: 5, depth: 10, delay: 0.25 }, gain: 0.4 }, { sampleGain: 0.62, samples: 'flute' }),
  I('clarinet', 'winds', '클라리넷', 'Clarinet', 71, [50, 91], { waves: [{ type: 'square', gain: 0.35 }, { type: 'sine', ratio: 3, gain: 0.1 }], env: { a: 0.04, d: 0.1, s: 0.85, r: 0.12 }, filter: { type: 'lowpass', freq: 3, track: true, q: 0.8 }, vibrato: { rate: 4.6, depth: 6, delay: 0.4 }, gain: 0.32 }, { sampleGain: 0.37, samples: 'clarinet' }),
  I('oboe', 'winds', '오보에', 'Oboe', 68, [58, 91], null, { like: 'clarinet', sampleGain: 0.41, samples: 'oboe' }),
  I('bassoon', 'winds', '바순', 'Bassoon', 70, [34, 72], null, { like: 'clarinet', sampleGain: 0.42, samples: 'bassoon' }),
  I('harmonica', 'winds', '하모니카', 'Harmonica', 22, [48, 96], null, { like: 'sax', sampleGain: 0.33, samples: 'harmonica' }),
  // ── synth
  I('sawLead', 'synth', '쏘 리드', 'Saw lead', 81, [36, 96], { waves: [{ type: 'sawtooth', gain: 0.35 }, { type: 'sawtooth', detune: 12, gain: 0.3 }], env: { a: 0.01, d: 0.2, s: 0.75, r: 0.15 }, filter: { type: 'lowpass', freq: 5, track: true, q: 3, env: 1.2, decay: 0.2 }, vibrato: { rate: 5.5, depth: 8, delay: 0.3 }, gain: 0.22 }),
  I('squareLead', 'synth', '스퀘어 리드', 'Square lead', 80, [36, 96], { waves: [{ type: 'square', gain: 0.35 }], env: { a: 0.005, d: 0.1, s: 0.8, r: 0.1 }, filter: { type: 'lowpass', freq: 6, track: true, q: 1 }, vibrato: { rate: 6, depth: 10, delay: 0.25 }, gain: 0.22 }),
  I('chipLead', 'synth', '8비트 리드', '8-bit chip lead', 80, [36, 96], { waves: [{ type: 'square', gain: 0.4 }], env: { a: 0.001, d: 0.05, s: 0.7, r: 0.03 }, gain: 0.18 }),
  I('supersaw', 'synth', '슈퍼쏘', 'Supersaw', 90, [36, 96], { waves: [-24, -12, -5, 0, 5, 12, 24].map((detune) => ({ type: 'sawtooth', detune, gain: 0.12 })), env: { a: 0.02, d: 0.3, s: 0.8, r: 0.3 }, filter: { type: 'lowpass', freq: 5200, q: 0.7 }, gain: 0.2 }),
  I('pluckSynth', 'synth', '플럭 신스', 'Pluck synth', 84, [36, 96], { waves: [{ type: 'sawtooth', gain: 0.35 }, { type: 'square', detune: 7, gain: 0.2 }], env: { a: 0.002, d: 0.25, s: 0, r: 0.12 }, filter: { type: 'lowpass', freq: 3, track: true, q: 4, env: 2.6, decay: 0.12 }, decay: 0.5, gain: 0.35 }),
  I('arpSynth', 'synth', '아르페지오 신스', 'Arp synth', 81, [36, 96], { waves: [{ type: 'square', gain: 0.3 }, { type: 'sawtooth', ratio: 2, gain: 0.08 }], env: { a: 0.002, d: 0.18, s: 0.2, r: 0.08 }, filter: { type: 'lowpass', freq: 4, track: true, q: 5, env: 2, decay: 0.1 }, gain: 0.28 }),
  // ── pads
  I('warmPad', 'pad', '따뜻한 패드', 'Warm pad', 89, [36, 96], { waves: [{ type: 'sawtooth', gain: 0.2 }, { type: 'sawtooth', detune: 10, gain: 0.2 }, { type: 'triangle', detune: -10, gain: 0.25 }], env: { a: 0.8, d: 0.6, s: 0.8, r: 1.2 }, filter: { type: 'lowpass', freq: 1400, q: 0.6 }, gain: 0.2 }),
  I('airPad', 'pad', '에어 패드', 'Air pad', 91, [36, 96], { waves: [{ type: 'triangle', gain: 0.3 }, { type: 'sine', ratio: 2, detune: 6, gain: 0.2 }, { type: 'sawtooth', detune: -14, gain: 0.08 }], env: { a: 1.2, d: 0.6, s: 0.85, r: 1.6 }, filter: { type: 'lowpass', freq: 3200, q: 0.4 }, vibrato: { rate: 0.4, depth: 6, delay: 0 }, gain: 0.22 }),
  I('choirPad', 'pad', '콰이어 패드', 'Choir pad', 52, [40, 84], { waves: [{ type: 'sawtooth', gain: 0.18 }, { type: 'sawtooth', detune: 7, gain: 0.18 }], env: { a: 0.5, d: 0.4, s: 0.85, r: 0.9 }, formant: 'a', vibrato: { rate: 4.8, depth: 9, delay: 0.3 }, gain: 0.32 }),
  // ── mallets & bells
  I('bell', 'mallet', '벨', 'Bell', 14, [48, 108], { waves: [{ type: 'sine', gain: 0.6 }, { type: 'sine', ratio: 2.76, gain: 0.2 }, { type: 'sine', ratio: 5.4, gain: 0.08 }], fm: { ratio: 3.5, index: 1.5, decay: 1.2 }, env: { a: 0.002, d: 2, s: 0, r: 0.6 }, decay: 3, gain: 0.32 }),
  I('marimba', 'mallet', '마림바', 'Marimba', 12, [45, 96], { waves: [{ type: 'sine', gain: 0.8 }, { type: 'sine', ratio: 4, gain: 0.12 }], env: { a: 0.002, d: 0.5, s: 0, r: 0.1 }, decay: 0.7, gain: 0.55 }, { sampleGain: 0.25, samples: 'marimba' }),
  I('vibraphone', 'mallet', '비브라폰', 'Vibraphone', 11, [53, 89], { waves: [{ type: 'sine', gain: 0.7 }, { type: 'sine', ratio: 4, gain: 0.1 }], env: { a: 0.002, d: 1.8, s: 0.1, r: 0.6 }, tremolo: { rate: 5.5, depth: 0.35 }, decay: 2.8, gain: 0.45 }, { sampleGain: 0.41, samples: 'vibraphone' }),
  I('glockenspiel', 'mallet', '글로켄슈필', 'Glockenspiel', 9, [67, 108], null, { like: 'musicBox', sampleGain: 0.27, samples: 'glockenspiel' }),
  I('xylophone', 'mallet', '실로폰', 'Xylophone', 13, [65, 108], null, { like: 'marimba', sampleGain: 0.47, samples: 'xylophone' }),
  I('tubularBells', 'mallet', '튜뷸러 벨', 'Tubular bells', 14, [57, 84], null, { like: 'bell', sampleGain: 0.34, samples: 'tubularBells' }),
  I('kalimba', 'mallet', '칼림바', 'Kalimba', 108, [41, 86], null, { like: 'musicBox', sampleGain: 0.19, samples: 'kalimba' }),
  I('timpani', 'mallet', '팀파니', 'Timpani', 47, [36, 60], null, { like: 'marimba', sampleGain: 0.31, samples: 'timpani' }),
  I('musicBox', 'mallet', '뮤직 박스', 'Music box', 10, [60, 108], { waves: [{ type: 'sine', gain: 0.6 }, { type: 'sine', ratio: 3, gain: 0.15 }], fm: { ratio: 7, index: 0.8, decay: 0.3 }, env: { a: 0.001, d: 1, s: 0, r: 0.4 }, decay: 1.6, gain: 0.35 }),
  // ── drums (kits play GM drum numbers: 36 kick, 38 snare, 42 closed hat …)
  I('kitPop', 'drums', '팝 드럼', 'Pop kit', 0, [35, 81], { kit: 'pop' }, { drums: true, sampleGain: 0.33, samples: 'popKit' }),
  I('kitAcoustic', 'drums', '어쿠스틱 드럼', 'Acoustic kit', 0, [35, 81], { kit: 'acoustic' }, { drums: true, sampleGain: 0.31, samples: 'acousticKit' }),
  I('kit808', 'drums', '808 드럼', '808 kit', 25, [35, 81], { kit: '808' }, { drums: true }),
  I('kitElectro', 'drums', '일렉트로닉 드럼', 'Electronic kit', 24, [35, 81], { kit: 'electro' }, { drums: true }),
  I('kitLofi', 'drums', '로파이 드럼', 'Lo-fi kit', 0, [35, 81], { kit: 'lofi' }, { drums: true, sampleGain: 0.25, samples: 'lofiKit' }),
  I('kitRock', 'drums', '록 드럼', 'Rock kit', 16, [35, 81], { kit: 'rock' }, { drums: true, sampleGain: 0.57, samples: 'rockKit' }),
  I('kitBrush', 'drums', '브러시 드럼', 'Brush kit', 40, [35, 81], { kit: 'brush' }, { drums: true, sampleGain: 0.22, samples: 'brushKit' }),
  I('kitPercussion', 'drums', '퍼커션 (콩가·봉고·셰이커)', 'Percussion (congas, bongos, shaker)', 0, [35, 81], { kit: 'percussion' }, { drums: true, sampleGain: 0.60, samples: 'percussion' }),
  // ── vocals (the guide voice sings the melody on vowels: audio/vocal.js)
  I('voiceFemale', 'vocal', '여성 보컬 (가이드)', 'Female vocal (guide)', 54, [53, 84], { voice: 'female' }, { vocal: true }),
  I('voiceMale', 'vocal', '남성 보컬 (가이드)', 'Male vocal (guide)', 54, [43, 72], { voice: 'male' }, { vocal: true }),
  I('voiceChoir', 'vocal', '합창 (가이드)', 'Choir (guide)', 52, [45, 81], { voice: 'choir' }, { vocal: true }),
];

const BY_ID = new Map(INSTRUMENTS.map((inst) => [inst.id, inst]));
// Instruments without a synth voice of their own borrow one (`like`): the fallback while samples load.
for (const inst of INSTRUMENTS) if (!inst.voice) inst.voice = BY_ID.get(inst.like)?.voice ?? BY_ID.get('piano').voice;
/** An instrument by id (an unknown id gives the piano). */
export const instrument = (id) => BY_ID.get(id) ?? BY_ID.get('piano');
export const hasInstrument = (id) => BY_ID.has(id);
export const instrumentName = (id, language = 'ko') => (language === 'en' ? instrument(id).en : instrument(id).ko);
export const instrumentsIn = (category) => INSTRUMENTS.filter((inst) => category === 'all' || inst.category === category);
export const categoryOf = (id) => INSTRUMENT_CATEGORIES.find((c) => c.id === instrument(id).category);

/** GM drum notes the kits play, with names. */
export const DRUM_NOTES = {
  35: ['킥 2', 'Kick 2'], 36: ['킥', 'Kick'], 37: ['림샷', 'Side stick'], 38: ['스네어', 'Snare'], 39: ['클랩', 'Clap'], 40: ['스네어 2', 'Snare 2'],
  41: ['로우 탐', 'Low floor tom'], 42: ['클로즈 하이햇', 'Closed hi-hat'], 43: ['플로어 탐', 'Floor tom'], 44: ['페달 하이햇', 'Pedal hi-hat'], 45: ['로우 탐', 'Low tom'],
  46: ['오픈 하이햇', 'Open hi-hat'], 47: ['미드 탐', 'Mid tom'], 48: ['하이 탐', 'High tom'], 49: ['크래시', 'Crash'], 50: ['하이 탐 2', 'High tom 2'],
  51: ['라이드', 'Ride'], 53: ['라이드 벨', 'Ride bell'], 54: ['탬버린', 'Tambourine'], 56: ['카우벨', 'Cowbell'], 57: ['크래시 2', 'Crash 2'],
  60: ['하이 봉고', 'High bongo'], 61: ['로우 봉고', 'Low bongo'], 62: ['뮤트 콩가', 'Mute high conga'], 63: ['오픈 콩가', 'Open high conga'], 64: ['로우 콩가', 'Low conga'],
  67: ['하이 아고고', 'High agogo'], 68: ['로우 아고고', 'Low agogo'], 69: ['카바사', 'Cabasa'], 70: ['셰이커', 'Shaker'], 75: ['클라베스', 'Claves'], 80: ['뮤트 트라이앵글', 'Mute triangle'], 81: ['트라이앵글', 'Triangle'],
};
export const drumName = (note, language = 'ko') => DRUM_NOTES[note]?.[language === 'en' ? 1 : 0] ?? `#${note}`;
/** Drum names for a piano-roll lane: the kit's lanes, top to bottom. */
export const DRUM_LANES = [49, 57, 51, 46, 42, 44, 50, 48, 47, 45, 43, 39, 38, 37, 36, 54, 70, 56];

/** Track roles: what a track does in the arrangement (the composer writes each one). */
export const TRACK_ROLES = ['vocal', 'lead', 'chords', 'bass', 'drums', 'pad', 'arp', 'counter'];
export const ROLE_ICONS = { vocal: 'instVocal', lead: 'instSynth', chords: 'instKeys', bass: 'instBass', drums: 'instDrums', pad: 'instPad', arp: 'arpeggio', counter: 'instStrings' };
