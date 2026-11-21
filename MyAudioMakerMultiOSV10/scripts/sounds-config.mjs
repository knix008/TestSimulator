// What scripts/fetch-sounds.mjs builds: the free sample sources (pinned commits, licences) and, for every
// sample set, which recordings it takes and how they are cut. A sample set is what an instrument in
// src/music/instruments.js names with `samples: '<set id>'`.
//
// Licences allowed in the bundled library: CC0, public domain, MIT, CC-BY (credited). Nothing NC, ND, SA or GPL.

/** Free sources. `commit` pins the exact version downloaded; `licence` is checked against the LICENSE file. */
export const SOURCES = {
  vcsl: {
    name: 'Versilian Community Sample Library (VCSL)', author: 'Versilian Studios LLC and contributors',
    repo: 'sgossner/VCSL', commit: 'c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e', licence: 'CC0-1.0', licenceFile: 'LICENSE',
    url: 'https://github.com/sgossner/VCSL',
  },
  vsco2: {
    name: 'VS Chamber Orchestra 2: Community Edition (VSCO 2 CE)', author: 'Versilian Studios LLC (recorded by Sam Gossner and Simon Dalzell)',
    repo: 'sgossner/VSCO-2-CE', commit: '440300901dfe9275fd84e0b7763af1f8443ae62e', licence: 'CC0-1.0', licenceFile: 'LICENSE',
    url: 'https://github.com/sgossner/VSCO-2-CE',
    note: 'The authors ask that the samples are not sold on their own and that credit is given to Versilian Studios (Readme.txt); the licence itself is CC0.',
  },
  bgg: {
    name: 'Black And Green Guitars', author: 'Karoryfer Lecolds (recorded by Brian Wood)',
    repo: 'sfzinstruments/karoryfer.black-and-green-guitars', commit: 'b3b3249d37dc977a1a297bd2dc053e6d9b6b805c', licence: 'CC0-1.0', licenceFile: 'LICENSE',
    url: 'https://github.com/sfzinstruments/karoryfer.black-and-green-guitars',
  },
  growly: {
    name: 'Growlybass', author: 'Karoryfer Lecolds (D. Smolken)',
    repo: 'sfzinstruments/karoryfer.growlybass', commit: '4f483268fc66b5a6d5781d421c0d11b8d08d3fc6', licence: 'CC0-1.0', licenceFile: 'LICENSE',
    url: 'https://github.com/sfzinstruments/karoryfer.growlybass',
  },
  fashion: {
    name: 'Fashionbass', author: 'Karoryfer Lecolds (D. Smolken)',
    repo: 'sfzinstruments/karoryfer.fashionbass', commit: '0703973b300a6bacb837602be9b588ab64732a72', licence: 'CC0-1.0', licenceFile: 'LICENSE',
    url: 'https://github.com/sfzinstruments/karoryfer.fashionbass',
  },
  meat: {
    name: 'Meatbass', author: 'Karoryfer Lecolds (played by Drogomir Smolken, recorded by Ludwik Zamenhof)',
    repo: 'sfzinstruments/karoryfer.meatbass', commit: 'ac9e859564bda286ab5ec672d00ff1aa2fef2895', licence: 'CC0-1.0', licenceFile: 'LICENSE',
    url: 'https://github.com/sfzinstruments/karoryfer.meatbass',
  },
  weresax: {
    name: 'Weresax', author: 'Karoryfer Lecolds',
    repo: 'sfzinstruments/karoryfer.weresax', commit: 'a4d756b21d2a573aca0d840cce7e71ba5effd4c6', licence: 'CC0-1.0', licenceFile: 'LICENSE',
    url: 'https://github.com/sfzinstruments/karoryfer.weresax',
  },
  bearsax: {
    name: 'Bear Sax', author: 'Karoryfer Lecolds',
    repo: 'sfzinstruments/karoryfer.bear-sax', commit: '7abb3c652525a15dfac80e1b5dfbba9964ee568f', licence: 'CC0-1.0', licenceFile: 'LICENSE',
    url: 'https://github.com/sfzinstruments/karoryfer.bear-sax',
  },
  epianos: {
    name: "Greg Sullivan's E-Pianos (Yamaha CP80, Hohner Pianet T, Wurlitzer EP200)", author: 'Greg Sullivan (http://www.sullivang.net/); SFZ mapping by kinwie',
    repo: 'sfzinstruments/GregSullivan.E-Pianos', commit: '8c3e581acda3594b553948ff0222d4f84a698376', licence: 'CC-BY-3.0', licenceFile: 'LICENSE',
    url: 'https://github.com/sfzinstruments/GregSullivan.E-Pianos',
    attribution: 'Electric piano samples (Yamaha CP80, Hohner Pianet T, Wurlitzer EP200) by Greg Sullivan, http://www.sullivang.net/, '
      + 'from https://github.com/sfzinstruments/GregSullivan.E-Pianos, licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). '
      + 'Changed for MyAudioMaker: a subset of notes, trimmed, mixed to mono, resampled to 48 kHz, level-normalized and encoded to Ogg Opus.',
  },
  virtuosity: {
    name: 'Virtuosity Drums', author: 'Versilian Studios (drummer Austin McMahon, recorded at Virtuosity Musical Instruments, Boston; auxiliary percussion from VSCO 2 Pro)',
    repo: 'sfzinstruments/virtuosity_drums', commit: '9f04cf9a734527edfbb0a4eee1f674e45bbf71bc', licence: 'CC0-1.0', licenceFile: 'LICENSE',
    url: 'https://github.com/sfzinstruments/virtuosity_drums',
  },
  swirly: {
    name: 'Swirly Drums', author: 'Karoryfer Lecolds',
    repo: 'sfzinstruments/karoryfer.swirly-drums', commit: 'c40dafe0011cb2e54c0c220ff0fa308a11fc60f5', licence: 'CC0-1.0', licenceFile: 'license',
    url: 'https://github.com/sfzinstruments/karoryfer.swirly-drums',
  },
  rusty: {
    name: 'Big Rusty Drums', author: 'Karoryfer Lecolds',
    repo: 'sfzinstruments/karoryfer.big-rusty-drums', commit: 'f07ce00df34a46b6b08375be56fe116cf15782bc', licence: 'CC0-1.0', licenceFile: 'LICENSE',
    url: 'https://github.com/sfzinstruments/karoryfer.big-rusty-drums',
  },
};

export const ALLOWED_LICENCES = ['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0', 'MIT', 'public-domain'];

// Note names: n = letter + optional # or b (flat, lower case in Karoryfer names), o = octave (C4 = middle C as written;
// the build checks the real pitch and corrects whole-octave naming differences).
const N = '(?<n>[A-Ga-g](?:#|b)?)(?<o>-?\\d)';
const re = (s) => new RegExp(s);

// Tonal sample sets. parts: where the recordings are (several parts = different instruments over the range,
// min/max limit each part's notes); layers: velocity labels, soft → loud (the build orders them by level);
// step: semitones between chosen notes; maxLen: seconds kept (sustained sets loop instead); sustain: loop it;
// stereo; kbps: Opus bitrate; release: seconds after note-off; ring: struck sounds keep ringing after note-off.
export const TONAL = [
  // ── keys
  { id: 'grandPiano', parts: [{ src: 'vcsl', dir: 'Chordophones/Zithers/Grand Piano, Steinway B/Sus/', re: re(`JHPiano_Sus_Close_${N}_vl(?<v>\\d)_rr1\\.wav$`) }], layers: [['2'], ['4']], step: 4, maxLen: 7, stereo: true, kbps: 128, release: 0.35 },
  { id: 'uprightPiano', parts: [{ src: 'vsco2', dir: 'Keys/Upright Piano/', re: re('Player_dyn(?<v>\\d)_rr1_(?<k>\\d{3})\\.wav$'), midi: (g) => 21 + 2 * Number(g.k) }], layers: [['1'], ['3']], step: 4, maxLen: 6, stereo: true, kbps: 112, release: 0.3 },
  { id: 'cp80', parts: [{ src: 'epianos', dir: 'CP80/Samples/', re: re('(?<k>\\d{3})-[A-G]#?\\d-(?<v>FF|F|MP|PP)\\.flac$'), midi: (g) => Number(g.k) }], layers: [['MP', 'PP'], ['FF', 'F']], step: 3, maxLen: 6, stereo: false, kbps: 96, release: 0.3 },
  { id: 'pianet', parts: [{ src: 'epianos', dir: 'Pianet T/Samples/', re: re('(?<k>\\d+)_[A-G]#?\\d_(?<v>FF|P)\\.flac$'), midi: (g) => Number(g.k) }], layers: [['P'], ['FF']], step: 3, maxLen: 4, stereo: false, kbps: 80, release: 0.15 },
  { id: 'wurlitzer', parts: [{ src: 'epianos', dir: 'Wurlitzer EP200/Samples/', re: re('/(?<n>[a-g]b?)(?<o>\\d)(?<v>pp|mp|ff|f)\\.flac$') }], layers: [['mp', 'pp'], ['f', 'ff']], step: 2, maxLen: 5, stereo: false, kbps: 96, release: 0.25 },
  { id: 'harpsichord', parts: [{ src: 'vcsl', dir: 'Chordophones/Zithers/Harpsichord, French/Sustains/', re: re(`Harpsi2_Normal_${N}_rr1_Main\\.wav$`) }], layers: [[null]], step: 3, maxLen: 5, stereo: true, kbps: 96, release: 0.2 },
  // The organ's names are an octave below how it sounds (8' pitch) — every note measures +12; the probe cannot tell.
  { id: 'churchOrgan', parts: [{ src: 'vcsl', dir: 'Aerophones/Edge-blown Aerophones/Pipe Organ/Loud/', re: re(`Rode_Man3Open_${N}\\.wav$`), octave: 12 }], layers: [[null]], step: 3, maxLen: 6, sustain: true, stereo: true, kbps: 112, release: 0.5 },
  { id: 'harmonica', parts: [{ src: 'vcsl', dir: 'Aerophones/Free Aerophones/Harmonica-Hohner-Super64/Sustains/Normal/', re: re(`_${N}\\.wav$`) }], layers: [[null]], step: 2, maxLen: 4, sustain: true, stereo: false, kbps: 80, release: 0.12 },
  // ── guitars and basses
  { id: 'greenGuitar', parts: [{ src: 'bgg', dir: 'Samples/green/ord/', re: re('twang_(?<n>[a-g]b?)(?<o>\\d)_(?<v>p|mf|f)_rr1\\.wav$') }], layers: [['mf', 'p'], ['f']], step: 3, maxLen: 5, stereo: false, kbps: 96, release: 0.15 },
  { id: 'blackGuitar', parts: [{ src: 'bgg', dir: 'Samples/black/ord/', re: re('twang_(?<n>[a-g]b?)(?<o>\\d)_(?<v>p|mf|f)_rr1\\.wav$') }], layers: [['mf', 'p'], ['f']], step: 3, maxLen: 5, stereo: false, kbps: 96, release: 0.15 },
  { id: 'growlyBass', parts: [{ src: 'growly', dir: 'sustain/', re: re('/(?<n>[a-g]b?)(?<o>\\d)_(?<v>pp|p|ff|f)_rr1\\.wav$') }], layers: [['p'], ['f']], step: 3, maxLen: 4, stereo: false, kbps: 80, release: 0.1 },
  { id: 'fashionBass', parts: [{ src: 'fashion', dir: 'notes/', re: re('/(?<n>[a-g]b?)(?<o>\\d)_(?<v>pp|p|mf|ff|f)_rr1\\.wav$') }], layers: [['mf'], ['ff']], step: 3, maxLen: 4, stereo: false, kbps: 80, release: 0.1 },
  { id: 'meatPizz', parts: [{ src: 'meat', dir: 'Samples/pizz/', re: re('/(?<n>[a-g]b?)(?<o>\\d)_vl(?<v>\\d)_rr1\\.wav$') }], layers: [['2'], ['4']], step: 3, maxLen: 3, stereo: false, kbps: 80, release: 0.12 },
  { id: 'meatArco', parts: [{ src: 'meat', dir: 'Samples/arco_looped/', re: re('/(?<n>[a-g]b?)(?<o>\\d)_vl(?<v>\\d)_down\\.wav$') }], layers: [['1'], ['3']], step: 3, maxLen: 5, sustain: true, stereo: false, kbps: 80, release: 0.25 },
  // ── strings
  {
    id: 'stringEnsemble', step: 3, maxLen: 5, sustain: true, stereo: true, kbps: 112, release: 0.5, attack: 0.06,
    parts: [
      { src: 'vsco2', dir: 'Strings/Cello Section/susvib/', re: re(`susvib_${N}_v(?<v>\\d)_1\\.wav$`), max: 52, layers: [['1'], ['3']] },
      { src: 'vsco2', dir: 'Strings/Viola Section/susvib/', re: re(`ViolaEns_susvib_${N}_v(?<v>\\d)_1\\.wav$`), min: 53, max: 62, layers: [['1'], ['2']] },
      { src: 'vsco2', dir: 'Strings/Violin Section/susVib/', re: re(`VlnEns_susVib_${N}_v(?<v>\\d)\\.wav$`), min: 63, layers: [['1'], ['2']] },
    ],
  },
  { id: 'soloViolin', parts: [{ src: 'vsco2', dir: 'Strings/Solo Violin/Arco Vib/', re: re(`LLVln_ArcoVib_${N}_(?<v>p|f)\\.wav$`) }], layers: [['p'], ['f']], step: 3, maxLen: 5, sustain: true, stereo: false, kbps: 96, release: 0.3, attack: 0.04 },
  { id: 'celloSection', parts: [{ src: 'vsco2', dir: 'Strings/Cello Section/susvib/', re: re(`susvib_${N}_v(?<v>\\d)_1\\.wav$`) }], layers: [['1'], ['3']], step: 3, maxLen: 5, sustain: true, stereo: false, kbps: 96, release: 0.35, attack: 0.05 },
  {
    id: 'pizzStrings', step: 3, maxLen: 2, stereo: true, kbps: 96, release: 0.15,
    parts: [
      { src: 'vsco2', dir: 'Strings/Cello Section/pizzT/', re: re(`pizzT_${N}_v(?<v>\\d)_RR1\\.wav$`), max: 54, layers: [['1'], ['2']] },
      { src: 'vsco2', dir: 'Strings/Violin Section/Pizz/', re: re(`VlnEns_Pizz_${N}_v(?<v>\\d)_rr1\\.wav$`), min: 55, layers: [['1'], ['2']] },
    ],
  },
  {
    id: 'tremoloStrings', step: 3, maxLen: 5, sustain: true, stereo: true, kbps: 112, release: 0.4,
    parts: [
      { src: 'vsco2', dir: 'Strings/Cello Section/trem/', re: re(`trem_${N}_v(?<v>\\d)_1\\.wav$`), max: 54, layers: [['1'], ['2']] },
      { src: 'vsco2', dir: 'Strings/Violin Section/Trem/', re: re(`VlnEns_Trem_${N}_v(?<v>\\d)\\.wav$`), min: 55, layers: [['1'], ['2']] },
    ],
  },
  { id: 'concertHarp', parts: [{ src: 'vcsl', dir: 'Chordophones/Composite Chordophones/Concert Harp/', re: re(`KSHarp_${N}_(?<v>mf|mp|f|p)\\d\\.wav$`) }], layers: [['mf', 'mp', 'p'], ['f']], step: 3, maxLen: 5, stereo: true, kbps: 96, release: 1.2, ring: true },
  // ── brass and winds
  { id: 'trumpet', parts: [{ src: 'vsco2', dir: 'Brass/Trumpet/sus/', re: re(`Sum_SHTrumpet_sus_${N}_v(?<v>\\d)_rr1\\.wav$`) }], layers: [['1'], ['3']], step: 3, maxLen: 4, sustain: true, stereo: false, kbps: 96, release: 0.15, attack: 0.02 },
  { id: 'frenchHorn', parts: [{ src: 'vsco2', dir: 'Brass/F Horn/sus/', re: re(`MOHorn_sus_${N}_v(?<v>\\d)_1\\.wav$`) }], layers: [['1', '2'], ['3', '4']], step: 3, maxLen: 4, sustain: true, stereo: false, kbps: 96, release: 0.25, attack: 0.03 },
  { id: 'trombone', parts: [{ src: 'vsco2', dir: 'Brass/Tenor Trombone/sus/', re: re(`tenortbn_sus_${N}_v(?<v>\\d)_1\\.wav$`) }], layers: [['1'], ['3', '2']], step: 3, maxLen: 4, sustain: true, stereo: false, kbps: 96, release: 0.2, attack: 0.02 },
  { id: 'tuba', parts: [{ src: 'vsco2', dir: 'Brass/Tuba/sus/', re: re(`Tuba3_sus_${N}_v(?<v>\\d)_rr1_Mid\\.wav$`) }], layers: [['1'], ['3', '2']], step: 3, maxLen: 4, sustain: true, stereo: false, kbps: 80, release: 0.2, attack: 0.03 },
  { id: 'altoSax', parts: [{ src: 'weresax', dir: 'Samples/alto/', re: re('/(?<n>[a-g]b?)(?<o>\\d)_(?<v>p|f)_rr1_cnd\\.wav$') }], layers: [['p'], ['f']], step: 3, maxLen: 4, sustain: true, stereo: false, kbps: 96, release: 0.15, attack: 0.015 },
  { id: 'tenorSax', parts: [{ src: 'vcsl', dir: 'Aerophones/Reed Aerophones/Tenor Saxophone/Non-Vibrato/', re: re(`BrettTenor_NV_Main_${N}_vl(?<v>\\d)_rr1\\.wav$`) }], layers: [['2'], ['3']], step: 3, maxLen: 4, sustain: true, stereo: false, kbps: 96, release: 0.15, attack: 0.015 },
  { id: 'bariSax', parts: [{ src: 'bearsax', dir: 'Samples/', re: re('Samples/(?<n>[a-g]b?)(?<o>\\d)_looped_(?<v>p|f)\\.wav$') }], layers: [['p'], ['f']], step: 3, maxLen: 4, sustain: true, stereo: false, kbps: 80, release: 0.15, attack: 0.015 },
  { id: 'flute', parts: [{ src: 'vsco2', dir: 'Woodwinds/Flute/susvib/', re: re(`LDFlute_susvib_${N}_v1_1\\.wav$`) }], layers: [[null]], step: 3, maxLen: 4, sustain: true, stereo: false, kbps: 80, release: 0.2, attack: 0.03 },
  { id: 'clarinet', parts: [{ src: 'vsco2', dir: 'Woodwinds/Clarinet/susLong/', re: re(`DCClar_susLong_${N}_v(?<v>\\d)_rr1_sum\\.wav$`) }], layers: [['1'], ['3']], step: 3, maxLen: 4, sustain: true, stereo: false, kbps: 80, release: 0.15, attack: 0.02 },
  { id: 'oboe', parts: [{ src: 'vsco2', dir: 'Woodwinds/Oboe/Vib/', re: re(`Oboe_Vib_${N}_v(?<v>\\d)_Main\\.wav$`) }], layers: [['1'], ['3']], step: 3, maxLen: 4, sustain: true, stereo: false, kbps: 80, release: 0.15, attack: 0.02 },
  { id: 'bassoon', parts: [{ src: 'vsco2', dir: 'Woodwinds/Bassoon/sus/', re: re(`PSBassoon_${N}_v(?<v>\\d)_1\\.wav$`) }], layers: [['1'], ['2']], step: 3, maxLen: 4, sustain: true, stereo: false, kbps: 80, release: 0.15, attack: 0.02 },
  // ── mallets and bells
  { id: 'marimba', parts: [{ src: 'vcsl', dir: 'Idiophones/Struck Idiophones/Marimba/', re: re(`Marimba_hit_Outrigger_${N}_(?<v>soft|med|loud)_01\\.wav$`) }], layers: [['soft', 'med'], ['loud']], step: 2, maxLen: 2.5, stereo: true, kbps: 96, release: 0.6, ring: true },
  { id: 'vibraphone', parts: [{ src: 'vcsl', dir: 'Idiophones/Struck Idiophones/Vibraphone/Hard Mallets/', re: re(`Vibes_hard_${N}_v(?<v>\\d)_rr1_Main\\.wav$`) }], layers: [['2'], ['3']], step: 2, maxLen: 5, stereo: true, kbps: 96, release: 0.5 },
  { id: 'glockenspiel', parts: [{ src: 'vcsl', dir: 'Idiophones/Struck Idiophones/Glockenspiel/', re: re(`glock_(?<v>soft|medium|loud)_${N}_0\\d\\.wav$`) }], layers: [['medium', 'soft'], ['loud']], step: 3, maxLen: 3.5, stereo: true, kbps: 96, release: 1.5, ring: true },
  { id: 'xylophone', parts: [{ src: 'vcsl', dir: 'Idiophones/Struck Idiophones/Xylophone/Medium Mallets/', re: re(`Xylo_Medium_${N}_(?<v>pp|ff)_01_far\\.wav$`) }], layers: [['pp'], ['ff']], step: 3, maxLen: 2, stereo: true, kbps: 96, release: 0.8, ring: true },
  { id: 'tubularBells', parts: [{ src: 'vcsl', dir: 'Idiophones/Struck Idiophones/Tubular Bells 2/', re: re(`TB_hit_${N}_v(?<v>\\d)_\\d\\.wav$`) }], layers: [['2'], ['4']], step: 2, maxLen: 7, stereo: true, kbps: 96, release: 3, ring: true },
  { id: 'kalimba', parts: [{ src: 'vcsl', dir: 'Idiophones/Plucked Idiophones/Kalimba, Tanzania/', re: re(`MBira3_pluck_Main_${N}_k\\d+_50_100_rr2\\.wav$`) }], layers: [[null]], step: 2, maxLen: 3, stereo: true, kbps: 96, release: 1, ring: true },
  // Timpani: the files name the drum (1A … 5B), not the note; the build measures each drum's pitch.
  { id: 'timpani', parts: [{ src: 'vcsl', dir: 'Membranophones/Struck Membranophones/Timpani 2/Hit/', re: re('Timpani(?<d>\\d[A-D])_hit_v(?<v>\\d)_rr1_main\\.wav$'), detect: [70, 280] }], layers: [['2', '3'], ['5']], step: 1, maxLen: 5, stereo: true, kbps: 96, release: 1.5, ring: true },
];

// ───────────────────────── drums
// A hit mixes one or more microphones: { src, stem, suffix } matches `<stem>_vl<N>[_rr1]<suffix>.(wav|flac)`
// (or `_v<N>`); `files: [soft, hard]` names the files directly. The build takes a soft and a loud velocity.

const virt = (mics, art, extra = {}) => ({ parts: mics.map((m) => ({ src: 'virtuosity', stem: `Samples/${m}/${art.split('_')[0]}/${m}_${art}` })), ...extra });
const rusty = (dir, stem, mics, extra = {}) => ({ parts: mics.map((m) => ({ src: 'rusty', stem: `Samples/${dir}/${m}/${stem}` })), ...extra });
const swirl = (dir, stem, suffixes = [''], extra = {}) => ({ parts: suffixes.map((suffix) => ({ src: 'swirly', stem: `Samples/${dir}/${stem}`, suffix })), ...extra });
const perc = (inst, stem, extra = {}) => ({ parts: [{ src: 'virtuosity', stem: `Samples/perc/mid/${inst}/${stem}`, suffix: '_Mid' }], ...extra });

/** A kit from Virtuosity Drums with the given microphones for kick, snare and the rest. */
function virtuosityKit(kick, snare, rest, cymbalLen = 3.5) {
  return {
    35: virt(kick, 'kick_snoff', { pitch: -2 }), 36: virt(kick, 'kick_snoff'), 37: virt(snare, 'snare_crossstick', { len: 0.5 }), 38: virt(snare, 'snare_center'),
    40: virt(snare, 'snare_rimshot'), 42: virt(rest, 'hh_closed', { len: 0.6, group: 'hh' }), 44: virt(rest, 'hh_pedal', { len: 0.6, group: 'hh' }),
    46: virt(rest, 'hh_open', { len: 2.2, group: 'hh' }), 49: virt(rest, 'crash_crash', { len: cymbalLen }), 57: virt(rest, 'crash_sizzle', { len: cymbalLen }),
    51: virt(rest, 'ride_ride', { len: cymbalLen }), 53: virt(rest, 'ride_bell', { len: cymbalLen }),
    41: virt(rest, 'ltom_center', { pitch: -3 }), 43: virt(rest, 'ltom_center'), 45: virt(rest, 'htom_center', { pitch: -4 }),
    47: virt(rest, 'htom_center', { pitch: -2 }), 48: virt(rest, 'htom_center'), 50: virt(rest, 'htom_center', { pitch: 3 }),
  };
}

export const DRUMS = [
  { id: 'percussion', kbps: 96, len: 1.5, notes: {
    39: { parts: [{ src: 'vcsl', files: ['Idiophones/Struck Idiophones/Claps/Clap_rr1.wav', 'Idiophones/Struck Idiophones/Claps/Clap_rr2.wav'] }] },
    54: perc('tambourine', 'Tamb1_Shake'), 56: perc('cowbell', 'Cowbell1_Normal'), 60: perc('bongoh', 'BongoH_Hit1'), 61: perc('bongol', 'BongoL_Hit1'),
    62: { parts: [{ src: 'virtuosity', files: ['Samples/perc/mid/conga/Conga_17_HitHM1_1_70_rr1_Mid.wav', 'Samples/perc/mid/conga/Conga_17_HitHM1_71_127_rr1_Mid.wav'] }] },
    63: { parts: [{ src: 'virtuosity', files: ['Samples/perc/mid/conga/Conga_22_HitN_51_100_rr1_Mid.wav', 'Samples/perc/mid/conga/Conga_22_HitN_101_127_rr1_Mid.wav'] }] },
    64: { parts: [{ src: 'virtuosity', files: ['Samples/perc/mid/tumba/Tumba_24_HitN_41_70_rr1_Mid.wav', 'Samples/perc/mid/tumba/Tumba_24_HitN_101_127_rr1_Mid.wav'] }] },
    67: perc('agogo', 'Agogo_High'), 68: perc('agogo', 'Agogo_Low'), 69: perc('cabasa', 'Cabasa1_Rub'), 70: perc('shaker', 'LShaker_Shake1D'),
    75: perc('claves', 'Claves1_Hit'), 80: perc('triangle', 'Triangle1_HitM', { len: 0.6 }), 81: perc('triangle', 'Triangle1_Hit', { len: 3 }),
  } },
  { id: 'acousticKit', also: 'percussion', kbps: 112, len: 1.6, notes: virtuosityKit(['kickmic', 'oh', 'room'], ['snaremic', 'oh', 'room'], ['oh', 'room'], 4) },
  { id: 'popKit', also: 'percussion', kbps: 112, len: 1.2, notes: virtuosityKit(['kickmic', 'mid'], ['snaremic', 'mid'], ['mid'], 2.8) },
  { id: 'lofiKit', also: 'percussion', kbps: 80, len: 1.2, notes: virtuosityKit(['lofi'], ['lofi'], ['lofi'], 2.5) },
  { id: 'rockKit', also: 'percussion', kbps: 112, len: 1.6, notes: {
    35: rusty('kick_24/kick', 'k', ['kick', 'oh'], { pitch: -2 }), 36: rusty('kick_24/kick', 'k', ['kick', 'oh']),
    37: rusty('snare_14/sidestick', 'sn_ss', ['top', 'oh'], { len: 0.5 }), 38: rusty('snare_14/center', 'sn_center', ['top', 'btm', 'oh']),
    40: rusty('snare_14/rimshot', 'sn_rims', ['top', 'btm', 'oh']),
    42: rusty('hihat_14/cl', 'ht_cl', ['cl', 'oh'], { len: 0.6, group: 'hh' }), 44: rusty('hihat_14/chik', 'ht_chik', ['cl', 'oh'], { len: 0.6, group: 'hh' }),
    46: rusty('hihat_14/open', 'ht_open', ['cl', 'oh'], { len: 2.2, group: 'hh' }),
    49: rusty('crash_17/cr', 'cr', ['cl', 'oh'], { len: 4 }), 57: rusty('crash_sizzle_17/cr', 'crs', ['cl', 'oh'], { len: 4 }),
    51: rusty('ride_22/rd', 'rd', ['cl', 'oh'], { len: 4 }), 53: rusty('ride_22/bl', 'rd_bl', ['cl', 'oh'], { len: 4 }),
    41: rusty('tom_22/center', 't22', ['cl', 'oh']), 43: rusty('tom_18/center', 't18', ['cl', 'oh']), 45: rusty('tom_18/center', 't18', ['cl', 'oh'], { pitch: 3 }),
    47: rusty('tom_15/center', 't15', ['cl', 'oh']), 48: rusty('tom_14/center', 't14', ['cl', 'oh']), 50: rusty('tom_14/center', 't14', ['cl', 'oh'], { pitch: 3 }),
  } },
  { id: 'brushKit', also: 'percussion', kbps: 112, len: 1.6, notes: {
    35: swirl('kick_buzz', 'buzz_kick_with_snare_buzz', [''], { pitch: -2 }), 36: swirl('kick_buzz', 'buzz_kick_with_snare_buzz'),
    38: swirl('snare_main', 'snare_hit', ['_top', '_btm']), 40: swirl('snare_edge', 'snare_edge', ['_top', '_btm']),
    42: swirl('hat_closed', 'hh_closed', [''], { len: 0.6, group: 'hh' }), 44: swirl('hat_foot', 'hh_foot', [''], { len: 0.6, group: 'hh' }),
    46: swirl('hat_open', 'hh_open', [''], { len: 2.2, group: 'hh' }),
    49: swirl('crash', 'crash', [''], { len: 4 }), 57: swirl('splash', 'splash', [''], { len: 3 }), 51: swirl('ride', 'ride', [''], { len: 4 }),
    41: swirl('tom_floor', 'tom_floor', [''], { pitch: -2 }), 43: swirl('tom_floor', 'tom_floor'), 45: swirl('tom_mlow', 'tom_mlow'),
    47: swirl('tom_xmed', 'tom_xmed'), 48: swirl('tom_mhi', 'tom_mhi'), 50: swirl('tom_vhi', 'tom_vhi'),
  } },
];
