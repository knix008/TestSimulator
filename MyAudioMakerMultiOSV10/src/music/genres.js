// Genres, moods and song structures (CONTRACT: pure data). The composer (music/composer.js) reads a
// genre for its tempo, chord progressions, drum grooves, bass and accompaniment styles and the band it
// plays with; a mood bends the key (major / minor), tempo and how busy the melody is.
//
// Drum patterns: one string per drum, 16 steps a bar (4/4) or 12 (3/4); 'X' accent, 'x' normal,
// 'o' ghost, '.' rest. Progressions are roman numerals per bar ("vi-IV" = two chords in a bar).

export const SECTION_TYPES = ['intro', 'verse', 'prechorus', 'chorus', 'bridge', 'interlude', 'build', 'drop', 'outro'];
/** Default bars and sung lines of each section type. */
export const SECTION_DEFAULTS = {
  intro: { bars: 4, lines: 0 }, verse: { bars: 8, lines: 4 }, prechorus: { bars: 4, lines: 2 }, chorus: { bars: 8, lines: 4 },
  bridge: { bars: 8, lines: 4 }, interlude: { bars: 4, lines: 0 }, build: { bars: 8, lines: 2 }, drop: { bars: 8, lines: 0 }, outro: { bars: 4, lines: 1 },
};
export const SECTION_ICONS = { intro: 'secIntro', verse: 'secVerse', prechorus: 'secPrechorus', chorus: 'secChorus', bridge: 'secBridge', interlude: 'secInterlude', build: 'secBuild', drop: 'secDrop', outro: 'secOutro' };
/** Section colours in the arrangement (soft, readable on light and dark themes). */
export const SECTION_COLORS = { intro: '#7c8ea6', verse: '#4c8bf5', prechorus: '#9b6cf0', chorus: '#f0567a', bridge: '#f5a524', interlude: '#20b8a6', build: '#e07b39', drop: '#e5484d', outro: '#6d7b8f' };

/** Song forms. */
export const STRUCTURES = [
  { id: 'standard', ko: '표준 (인트로-벌스-프리-코러스 ×2-브리지-코러스-아웃트로)', en: 'Standard (intro, verse, pre, chorus ×2, bridge, chorus, outro)', sections: ['intro', 'verse', 'prechorus', 'chorus', 'verse', 'prechorus', 'chorus', 'bridge', 'chorus', 'outro'] },
  { id: 'short', ko: '짧게 (벌스-코러스 ×2)', en: 'Short (verse, chorus ×2)', sections: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'outro'] },
  { id: 'simple', ko: '간단히 (벌스-코러스)', en: 'Simple (verse, chorus)', sections: ['verse', 'chorus'] },
  { id: 'ballad', ko: '발라드 (벌스 ×2-코러스-브리지-코러스 ×2)', en: 'Ballad (verse ×2, chorus, bridge, chorus ×2)', sections: ['intro', 'verse', 'verse', 'chorus', 'interlude', 'verse', 'chorus', 'bridge', 'chorus', 'chorus', 'outro'] },
  { id: 'kpop', ko: 'K-팝 (훅 강조)', en: 'K-pop (hook heavy)', sections: ['intro', 'chorus', 'verse', 'prechorus', 'chorus', 'verse', 'prechorus', 'chorus', 'bridge', 'build', 'chorus', 'outro'] },
  { id: 'edm', ko: 'EDM (빌드업-드롭)', en: 'EDM (build, drop)', sections: ['intro', 'verse', 'build', 'drop', 'interlude', 'verse', 'build', 'drop', 'outro'] },
  { id: 'aaba', ko: 'AABA (재즈 스탠더드)', en: 'AABA (jazz standard)', sections: ['verse', 'verse', 'bridge', 'verse'] },
  { id: 'loop', ko: '루프 (가사 없는 연주곡)', en: 'Loop (instrumental)', sections: ['intro', 'interlude', 'interlude', 'interlude', 'outro'] },
];
export const structureOf = (id) => STRUCTURES.find((s) => s.id === id) ?? STRUCTURES[0];

export const MOODS = [
  { id: 'happy', ko: '밝은', en: 'Happy', icon: 'moodHappy', mode: 'major', tempo: 1.06, density: 0.65, lift: 2 },
  { id: 'sad', ko: '슬픈', en: 'Sad', icon: 'moodSad', mode: 'minor', tempo: 0.86, density: 0.45, lift: -2 },
  { id: 'calm', ko: '잔잔한', en: 'Calm', icon: 'moodCalm', mode: 'major', tempo: 0.88, density: 0.4, lift: -1 },
  { id: 'energetic', ko: '신나는', en: 'Energetic', icon: 'moodEnergetic', mode: 'major', tempo: 1.12, density: 0.8, lift: 3 },
  { id: 'romantic', ko: '로맨틱한', en: 'Romantic', icon: 'moodRomantic', mode: 'major', tempo: 0.94, density: 0.5, lift: 0 },
  { id: 'dark', ko: '어두운', en: 'Dark', icon: 'moodDark', mode: 'minor', tempo: 0.98, density: 0.55, lift: -3 },
  { id: 'dreamy', ko: '몽환적인', en: 'Dreamy', icon: 'moodDreamy', mode: 'major', tempo: 0.9, density: 0.42, lift: 1 },
  { id: 'epic', ko: '웅장한', en: 'Epic', icon: 'moodEpic', mode: 'minor', tempo: 1, density: 0.6, lift: 2 },
  { id: 'nostalgic', ko: '그리운', en: 'Nostalgic', icon: 'moodNostalgic', mode: 'major', tempo: 0.92, density: 0.5, lift: -1 },
  { id: 'hopeful', ko: '희망찬', en: 'Hopeful', icon: 'moodHopeful', mode: 'major', tempo: 1.02, density: 0.6, lift: 2 },
];
export const moodOf = (id) => MOODS.find((m) => m.id === id) ?? MOODS[0];

const P = (kick, snare, hat, extra = {}) => ({ 36: kick, 38: snare, 42: hat, ...extra });

const MAJOR_POP = {
  verse: [['I', 'V', 'vi', 'IV'], ['I', 'vi', 'IV', 'V'], ['vi', 'IV', 'I', 'V'], ['I', 'iii', 'vi', 'IV'], ['IV', 'I', 'V', 'vi']],
  prechorus: [['ii', 'IV', 'V', 'V'], ['IV', 'V', 'iii', 'vi'], ['vi', 'V', 'IV', 'V']],
  chorus: [['I', 'V', 'vi', 'IV'], ['IV', 'V', 'iii', 'vi'], ['vi', 'IV', 'I', 'V'], ['I', 'V', 'IV', 'IV']],
  bridge: [['vi', 'IV', 'I', 'V'], ['IV', 'iii', 'ii', 'V'], ['ii', 'V', 'iii', 'vi']],
  intro: [['I', 'IV', 'I', 'V'], ['vi', 'IV', 'I', 'V']],
};
const MINOR_POP = {
  verse: [['i', 'bVI', 'bIII', 'bVII'], ['i', 'iv', 'bVII', 'bIII'], ['i', 'bVII', 'bVI', 'V'], ['i', 'bVI', 'iv', 'V']],
  prechorus: [['iv', 'bVII', 'bIII', 'bVI'], ['bVI', 'bVII', 'V', 'V']],
  chorus: [['bVI', 'bVII', 'i', 'i'], ['i', 'bVI', 'bIII', 'bVII'], ['bVI', 'bIII', 'bVII', 'i'], ['iv', 'bVII', 'bIII', 'bVI']],
  bridge: [['bVI', 'bVII', 'bIII', 'V'], ['iv', 'i', 'bVI', 'V']],
  intro: [['i', 'bVI', 'bVII', 'i']],
};

/**
 * Genres. progressions: { major: {section: [[…]]}, minor: {…} }; drums: { verse, chorus, intro?, … }
 * per section type (missing types use verse / chorus); styles: bass, chords; band: the instruments.
 */
export const GENRES = [
  {
    id: 'pop', ko: '팝', en: 'Pop', icon: 'genrePop', bpm: [96, 124], swing: 0, harmony: 1,
    progressions: { major: MAJOR_POP, minor: MINOR_POP },
    drums: { verse: P('x.......x.x.....', '....x.......x...', 'x.x.x.x.x.x.x.x.'), chorus: P('x.......x.x.....', '....X.......X...', 'x.x.x.x.x.x.x.x.', { 39: '....x.......x...', 49: 'x...............' }), intro: P('x.......x.......', '................', 'x...x...x...x...') },
    bass: 'root8', chords: 'pop', band: { chords: 'piano', bass: 'fingerBass', lead: 'pluckSynth', pad: 'warmPad', kit: 'kitPop', vocal: 'voiceFemale' }, melody: { density: 0.6, sync: 0.35 },
  },
  {
    id: 'kpop', ko: 'K-팝 댄스', en: 'K-pop dance', icon: 'genreKpop', bpm: [112, 128], swing: 0, harmony: 1,
    progressions: { major: { ...MAJOR_POP, chorus: [['IV', 'V', 'iii', 'vi'], ['vi', 'IV', 'V', 'I'], ['IV', 'V', 'vi', 'vi']] }, minor: { ...MINOR_POP, chorus: [['bVI', 'bVII', 'i', 'i'], ['iv', 'v', 'bVI', 'bVII']] } },
    drums: { verse: P('x..x..x...x.....', '....x.......x...', 'x.xxx.x.x.xxx.x.'), chorus: P('X...x...X...x...', '....X.......X..o', 'x.x.x.x.x.x.x.x.', { 39: '....x.......x...', 46: '..x...x...x...x.', 49: 'x...............' }), build: P('x...x...x...x...', 'x.x.x.x.xxxxxxxx', 'xxxxxxxxxxxxxxxx') },
    bass: 'synco', chords: 'stab', band: { chords: 'supersaw', bass: 'synthBass', lead: 'sawLead', pad: 'airPad', kit: 'kitElectro', vocal: 'voiceFemale', arp: 'arpSynth' }, melody: { density: 0.72, sync: 0.6 },
  },
  {
    id: 'ballad', ko: '발라드', en: 'Ballad', icon: 'genreBallad', bpm: [64, 80], swing: 0, harmony: 1,
    progressions: { major: { verse: [['I', 'V', 'vi', 'IV'], ['I', 'iii', 'IV', 'V'], ['IV', 'V', 'iii', 'vi']], prechorus: [['ii', 'iii', 'IV', 'V']], chorus: [['IV', 'V', 'iii', 'vi'], ['I', 'V', 'vi', 'iii', 'IV', 'I', 'ii', 'V']], bridge: [['vi', 'iii', 'IV', 'V'], ['ii', 'V', 'I', 'vi']], intro: [['I', 'IV', 'I', 'V']] }, minor: MINOR_POP },
    drums: { verse: P('x.........x.....', '....x.......x...', 'x...x...x...x...'), chorus: P('x.........x.x...', '....x.......x...', 'x.x.x.x.x.x.x.x.', { 49: 'x...............' }), intro: P('................', '................', '................') },
    bass: 'whole', chords: 'arp', band: { chords: 'piano', bass: 'fingerBass', lead: 'strings', pad: 'strings', kit: 'kitAcoustic', vocal: 'voiceFemale' }, melody: { density: 0.45, sync: 0.25 },
  },
  {
    id: 'rock', ko: '록', en: 'Rock', icon: 'genreRock', bpm: [110, 150], swing: 0, harmony: 1,
    progressions: { major: { verse: [['I', 'bVII', 'IV', 'I'], ['I', 'IV', 'V', 'IV'], ['I', 'V', 'IV', 'IV']], prechorus: [['IV', 'V', 'IV', 'V']], chorus: [['I', 'V', 'vi', 'IV'], ['IV', 'I', 'V', 'V'], ['I', 'bVII', 'IV', 'I']], bridge: [['vi', 'V', 'IV', 'V']], intro: [['I', 'bVII', 'IV', 'I']] }, minor: { ...MINOR_POP, verse: [['i', 'bVII', 'bVI', 'bVII'], ['i', 'iv', 'i', 'bVII']] } },
    drums: { verse: P('x.....x.x.......', '....x.......x...', 'x.x.x.x.x.x.x.x.'), chorus: P('x.x...x.x.x.....', '....X.......X...', 'x.x.x.x.x.x.x.x.', { 49: 'x.......x.......' }) },
    bass: 'root8', chords: 'power', band: { chords: 'overdriveGuitar', bass: 'pickBass', lead: 'overdriveGuitar', pad: 'organ', kit: 'kitRock', vocal: 'voiceMale' }, melody: { density: 0.6, sync: 0.4 },
  },
  {
    id: 'hiphop', ko: '힙합', en: 'Hip-hop', icon: 'genreHiphop', bpm: [82, 96], swing: 0.12, harmony: 1,
    progressions: { major: { verse: [['vi', 'IV', 'I', 'V'], ['ii', 'V', 'I', 'vi']], chorus: [['IV', 'V', 'vi', 'vi'], ['vi', 'IV', 'V', 'I']], intro: [['vi', 'IV', 'I', 'V']] }, minor: { verse: [['i', 'bVI', 'i', 'bVI'], ['i', 'iv', 'bVI', 'V']], chorus: [['bVI', 'bVII', 'i', 'i'], ['i', 'bVI', 'bIII', 'bVII']], intro: [['i', 'bVI', 'i', 'bVI']] } },
    drums: { verse: P('x.....x...x.....', '....x.......x...', 'x.x.x.x.x.x.x.x.'), chorus: P('x.....x.x.x.....', '....X.......X...', 'x.xxx.x.x.xxx.x.', { 39: '....x.......x...' }) },
    bass: 'sub808', chords: 'pad', band: { chords: 'epiano', bass: 'subBass', lead: 'bell', pad: 'warmPad', kit: 'kit808', vocal: 'voiceMale' }, melody: { density: 0.78, sync: 0.55 },
  },
  {
    id: 'rnb', ko: 'R&B', en: 'R&B', icon: 'genreRnb', bpm: [70, 96], swing: 0.18, harmony: 1, sevenths: true,
    progressions: { major: { verse: [['IVmaj7', 'iii7', 'ii7', 'Imaj7'], ['ii7', 'V7', 'Imaj7', 'vi7']], chorus: [['IVmaj7', 'V7', 'iii7', 'vi7'], ['ii7', 'iii7', 'IVmaj7', 'V7']], bridge: [['vi7', 'ii7', 'V7', 'Imaj7']], intro: [['Imaj7', 'IVmaj7', 'Imaj7', 'IVmaj7']] }, minor: { verse: [['i7', 'iv7', 'bVIImaj7', 'bIIImaj7'], ['i7', 'bVImaj7', 'iv7', 'V7']], chorus: [['bVImaj7', 'bVII7', 'i7', 'i7']], intro: [['i7', 'iv7', 'i7', 'iv7']] } },
    drums: { verse: P('x......x..x.....', '....x.......x...', 'x.x.x.x.x.x.x.x.'), chorus: P('x......x..x..x..', '....X.......X...', 'x.x.x.x.x.x.x.x.', { 37: '..............x.' }) },
    bass: 'synco', chords: 'comp', band: { chords: 'epiano', bass: 'fingerBass', lead: 'squareLead', pad: 'warmPad', kit: 'kitLofi', vocal: 'voiceFemale' }, melody: { density: 0.65, sync: 0.6 },
  },
  {
    id: 'edm', ko: 'EDM', en: 'EDM', icon: 'genreEdm', bpm: [124, 130], swing: 0, harmony: 1,
    progressions: { major: { ...MAJOR_POP, drop: [['vi', 'IV', 'I', 'V'], ['IV', 'V', 'vi', 'vi']], build: [['IV', 'V', 'IV', 'V']] }, minor: { ...MINOR_POP, drop: [['i', 'bVI', 'bIII', 'bVII']], build: [['bVI', 'bVII', 'bVI', 'bVII']] } },
    drums: { verse: P('x...x...x...x...', '................', '..x...x...x...x.', { 39: '....x.......x...' }), drop: P('X...x...X...x...', '....X.......X...', '..x...x...x...x.', { 46: '..x...x...x...x.', 39: '....x.......x...', 49: 'x...............' }), build: P('x...x...x...x...', 'x...x...x.x.xxxx', '................'), chorus: P('X...x...X...x...', '....X.......X...', '..x...x...x...x.', { 39: '....x.......x...' }) },
    bass: 'offbeat', chords: 'stab', band: { chords: 'supersaw', bass: 'synthBass', lead: 'supersaw', pad: 'airPad', kit: 'kitElectro', vocal: 'voiceFemale', arp: 'pluckSynth' }, melody: { density: 0.65, sync: 0.5 },
  },
  {
    id: 'house', ko: '하우스', en: 'House', icon: 'genreHouse', bpm: [118, 126], swing: 0.06, harmony: 1, sevenths: true,
    progressions: { major: { verse: [['ii7', 'V7', 'Imaj7', 'vi7']], chorus: [['IVmaj7', 'iii7', 'vi7', 'V7']], intro: [['ii7', 'V7', 'Imaj7', 'Imaj7']] }, minor: { verse: [['i7', 'iv7', 'i7', 'iv7']], chorus: [['bVImaj7', 'bVII7', 'i7', 'i7']], intro: [['i7', 'iv7', 'i7', 'iv7']] } },
    drums: { verse: P('x...x...x...x...', '....x.......x...', '..x...x...x...x.', { 46: '..x...x...x...x.' }), chorus: P('x...x...x...x...', '....x.......x...', 'xxxxxxxxxxxxxxxx', { 46: '..x...x...x...x.', 39: '....x.......x...' }) },
    bass: 'offbeat', chords: 'offbeat', band: { chords: 'organ', bass: 'synthBass', lead: 'pluckSynth', pad: 'warmPad', kit: 'kitElectro', vocal: 'voiceFemale' }, melody: { density: 0.55, sync: 0.5 },
  },
  {
    id: 'lofi', ko: '로파이', en: 'Lo-fi', icon: 'genreLofi', bpm: [70, 88], swing: 0.22, harmony: 1, sevenths: true,
    progressions: { major: { verse: [['IVmaj7', 'iii7', 'ii7', 'Imaj7'], ['ii7', 'V7', 'Imaj7', 'IVmaj7']], chorus: [['IVmaj7', 'V7', 'iii7', 'vi7']], intro: [['Imaj7', 'vi7', 'ii7', 'V7']] }, minor: { verse: [['i7', 'iv7', 'bVIImaj7', 'bIIImaj7']], chorus: [['bVImaj7', 'v7', 'i7', 'i7']], intro: [['i7', 'iv7', 'i7', 'v7']] } },
    drums: { verse: P('x.....x...x.....', '....x.......x...', 'x.x.x.x.x.x.x.x.'), chorus: P('x.....x..xx.....', '....x.......x..o', 'x.x.x.x.x.x.x.x.', { 70: 'x.x.x.x.x.x.x.x.' }) },
    bass: 'whole', chords: 'comp', band: { chords: 'epiano', bass: 'uprightBass', lead: 'vibraphone', pad: 'airPad', kit: 'kitLofi', vocal: 'voiceFemale' }, melody: { density: 0.45, sync: 0.45 },
  },
  {
    id: 'jazz', ko: '재즈', en: 'Jazz', icon: 'genreJazz', bpm: [100, 150], swing: 0.33, harmony: 2, sevenths: true,
    progressions: { major: { verse: [['ii7', 'V7', 'Imaj7', 'vi7'], ['Imaj7', 'vi7', 'ii7', 'V7'], ['iii7', 'vi7', 'ii7', 'V7']], chorus: [['ii7', 'V7', 'Imaj7', 'Imaj7'], ['IVmaj7', 'iv7', 'iii7', 'vi7']], bridge: [['ii7/IV', 'V7/IV', 'IVmaj7', 'IVmaj7']], intro: [['Imaj7', 'vi7', 'ii7', 'V7']] }, minor: { verse: [['iim7b5', 'V7', 'i7', 'i7'], ['i7', 'iv7', 'bVII7', 'bIIImaj7']], chorus: [['iv7', 'bVII7', 'bIIImaj7', 'bVImaj7']], intro: [['i7', 'iv7', 'iim7b5', 'V7']] } },
    drums: { verse: P('x.........x.....', '...o.......o....', '................', { 51: 'x..x.xx..x.xx..x', 44: '....x.......x...' }), chorus: P('x.......x.......', '...o.o.....o..o.', '................', { 51: 'x..x.xx..x.xx..x', 44: '....x.......x...' }) },
    bass: 'walking', chords: 'comp', band: { chords: 'piano', bass: 'uprightBass', lead: 'sax', pad: 'vibraphone', kit: 'kitBrush', vocal: 'voiceFemale' }, melody: { density: 0.62, sync: 0.55 },
  },
  {
    id: 'bossa', ko: '보사노바', en: 'Bossa nova', icon: 'genreBossa', bpm: [116, 140], swing: 0, harmony: 1, sevenths: true,
    progressions: { major: { verse: [['Imaj7', 'ii7', 'iii7', 'V7'], ['Imaj7', 'II7', 'ii7', 'V7']], chorus: [['IVmaj7', 'iv7', 'iii7', 'vi7']], intro: [['Imaj7', 'ii7', 'Imaj7', 'ii7']] }, minor: { verse: [['i7', 'iv7', 'iim7b5', 'V7']], chorus: [['bVImaj7', 'iim7b5', 'V7', 'i7']], intro: [['i7', 'iv7', 'i7', 'V7']] } },
    drums: { verse: P('x..x....x..x....', '................', 'x.x.x.x.x.x.x.x.', { 37: 'x..x..x...x..x..' }), chorus: P('x..x....x..x....', '................', 'x.x.x.x.x.x.x.x.', { 37: 'x..x..x...x..x..', 70: 'xxxxxxxxxxxxxxxx' }) },
    bass: 'bossa', chords: 'bossa', band: { chords: 'nylonGuitar', bass: 'uprightBass', lead: 'flute', pad: 'strings', kit: 'kitBrush', vocal: 'voiceFemale' }, melody: { density: 0.55, sync: 0.6 },
  },
  {
    id: 'funk', ko: '펑크', en: 'Funk', icon: 'genreFunk', bpm: [96, 116], swing: 0.08, harmony: 1, sevenths: true,
    progressions: { major: { verse: [['I7', 'I7', 'IV7', 'I7'], ['I7', 'bVII7', 'IV7', 'I7']], chorus: [['IV7', 'V7', 'I7', 'I7']], intro: [['I7', 'I7', 'I7', 'I7']] }, minor: { verse: [['i7', 'i7', 'iv7', 'i7']], chorus: [['bVI7', 'bVII7', 'i7', 'i7']], intro: [['i7', 'i7', 'i7', 'i7']] } },
    drums: { verse: P('x.x...x...x..x..', '....x..o.o..x..o', 'xxxxxxxxxxxxxxxx'), chorus: P('x.x...x.x.x..x..', '....X..o.o..X..o', 'xxxxxxxxxxxxxxxx', { 46: '..............x.' }) },
    bass: 'funk', chords: 'stab', band: { chords: 'cleanGuitar', bass: 'fingerBass', lead: 'brass', pad: 'organ', kit: 'kitAcoustic', vocal: 'voiceMale' }, melody: { density: 0.7, sync: 0.7 },
  },
  {
    id: 'reggae', ko: '레게', en: 'Reggae', icon: 'genreReggae', bpm: [70, 90], swing: 0.1, harmony: 1,
    progressions: { major: { verse: [['I', 'IV', 'I', 'V'], ['I', 'V', 'IV', 'IV']], chorus: [['IV', 'I', 'V', 'I']], intro: [['I', 'IV', 'I', 'V']] }, minor: { verse: [['i', 'iv', 'i', 'bVII']], chorus: [['bVI', 'bVII', 'i', 'i']], intro: [['i', 'iv', 'i', 'bVII']] } },
    drums: { verse: P('........x.......', '........x.......', '..x...x...x...x.', { 37: '........x.......' }), chorus: P('x.......x.......', '........X.......', 'x.x.x.x.x.x.x.x.') },
    bass: 'reggae', chords: 'skank', band: { chords: 'organ', bass: 'fingerBass', lead: 'squareLead', pad: 'cleanGuitar', kit: 'kitAcoustic', vocal: 'voiceMale' }, melody: { density: 0.55, sync: 0.5 },
  },
  {
    id: 'folk', ko: '포크 / 어쿠스틱', en: 'Folk / acoustic', icon: 'genreFolk', bpm: [84, 112], swing: 0.05, harmony: 1,
    progressions: { major: { verse: [['I', 'IV', 'I', 'V'], ['I', 'V', 'vi', 'IV'], ['I', 'IV', 'vi', 'V']], chorus: [['IV', 'I', 'V', 'vi'], ['IV', 'V', 'I', 'I']], bridge: [['vi', 'IV', 'I', 'V']], intro: [['I', 'IV', 'I', 'V']] }, minor: MINOR_POP },
    drums: { verse: P('x.......x.......', '....x.......x...', '................', { 70: 'x.x.x.x.x.x.x.x.' }), chorus: P('x.....x.x.......', '....x.......x...', 'x.x.x.x.x.x.x.x.', { 54: '....x.......x...' }) },
    bass: 'rootFifth', chords: 'strum', band: { chords: 'acousticGuitar', bass: 'uprightBass', lead: 'flute', pad: 'strings', kit: 'kitAcoustic', vocal: 'voiceMale' }, melody: { density: 0.55, sync: 0.3 },
  },
  {
    id: 'trot', ko: '트로트', en: 'Trot', icon: 'genreTrot', bpm: [120, 138], swing: 0.12, harmony: 1,
    progressions: { major: { verse: [['I', 'I', 'V', 'V', 'V', 'V', 'I', 'I']], chorus: [['IV', 'IV', 'I', 'I', 'V', 'V', 'I', 'I']], intro: [['I', 'V', 'I', 'V']] }, minor: { verse: [['i', 'i', 'iv', 'iv', 'V', 'V', 'i', 'i']], chorus: [['iv', 'iv', 'i', 'i', 'V', 'V', 'i', 'i']], intro: [['i', 'V', 'i', 'V']] } },
    drums: { verse: P('x...x...x...x...', '....x.......x...', 'x.x.x.x.x.x.x.x.'), chorus: P('x...x...x...x...', '....X.......X...', 'x.x.x.x.x.x.x.x.', { 54: '..x...x...x...x.' }) },
    bass: 'rootFifth', chords: 'offbeat', band: { chords: 'organ', bass: 'fingerBass', lead: 'sax', pad: 'strings', kit: 'kitPop', vocal: 'voiceFemale' }, melody: { density: 0.6, sync: 0.25 },
  },
  {
    id: 'citypop', ko: '시티팝', en: 'City pop', icon: 'genreCitypop', bpm: [100, 118], swing: 0.04, harmony: 1, sevenths: true,
    progressions: { major: { verse: [['IVmaj7', 'iii7', 'vi7', 'Imaj7'], ['ii7', 'V7', 'iii7', 'vi7']], chorus: [['IVmaj7', 'V7', 'iii7', 'vi7'], ['ii7', 'iii7', 'IVmaj7', 'V7']], bridge: [['ii7', 'V7', 'Imaj7', 'vi7']], intro: [['IVmaj7', 'iii7', 'vi7', 'V7']] }, minor: { verse: [['bVImaj7', 'bVII7', 'i7', 'i7']], chorus: [['iv7', 'v7', 'bVImaj7', 'bVII7']], intro: [['i7', 'iv7', 'bVImaj7', 'bVII7']] } },
    drums: { verse: P('x.....x.x.......', '....x.......x...', 'x.x.x.x.x.x.x.x.'), chorus: P('x.....x.x.x.....', '....X.......X...', 'x.x.x.x.x.x.x.x.', { 46: '..............x.' }) },
    bass: 'synco', chords: 'comp', band: { chords: 'epiano', bass: 'fingerBass', lead: 'brass', pad: 'strings', kit: 'kitPop', vocal: 'voiceFemale' }, melody: { density: 0.62, sync: 0.55 },
  },
  {
    id: 'cinematic', ko: '시네마틱', en: 'Cinematic', icon: 'genreCinematic', bpm: [70, 100], swing: 0, harmony: 1,
    progressions: { major: { verse: [['I', 'iii', 'IV', 'I'], ['vi', 'IV', 'I', 'V']], chorus: [['IV', 'I', 'V', 'vi'], ['vi', 'IV', 'I', 'V']], bridge: [['IV', 'V', 'iii', 'vi']], intro: [['I', 'IV', 'vi', 'V']] }, minor: { verse: [['i', 'bVI', 'bIII', 'bVII'], ['i', 'v', 'bVI', 'bIII']], chorus: [['bVI', 'bIII', 'bVII', 'i'], ['i', 'bVII', 'bVI', 'V']], bridge: [['bVI', 'bVII', 'V', 'V']], intro: [['i', 'bVI', 'bVII', 'i']] } },
    drums: { verse: P('x...............', '................', '................', { 45: '........x.......' }), chorus: P('x.......x.x.....', '....x.......x...', '................', { 45: 'x...x...x.x.x.xx', 49: 'x...............' }) },
    bass: 'whole', chords: 'pad', band: { chords: 'strings', bass: 'cello', lead: 'violin', pad: 'choirPad', kit: 'kitAcoustic', vocal: 'voiceChoir' }, melody: { density: 0.42, sync: 0.15 },
  },
  {
    id: 'waltz', ko: '왈츠 (3/4)', en: 'Waltz (3/4)', icon: 'genreWaltz', bpm: [84, 132], swing: 0, harmony: 1, timeSignature: [3, 4],
    progressions: { major: { verse: [['I', 'IV', 'V', 'I'], ['I', 'vi', 'ii', 'V']], chorus: [['IV', 'I', 'V', 'I'], ['vi', 'ii', 'V', 'I']], intro: [['I', 'V', 'I', 'V']] }, minor: { verse: [['i', 'iv', 'V', 'i']], chorus: [['bVI', 'iv', 'V', 'i']], intro: [['i', 'V', 'i', 'V']] } },
    drums: { verse: { 36: 'x...........', 42: '....x...x...' }, chorus: { 36: 'x...........', 38: '....x...x...', 49: 'x...........' } },
    bass: 'waltz', chords: 'waltz', band: { chords: 'piano', bass: 'uprightBass', lead: 'violin', pad: 'strings', kit: 'kitBrush', vocal: 'voiceFemale' }, melody: { density: 0.5, sync: 0.15 },
  },
];
export const genreOf = (id) => GENRES.find((g) => g.id === id) ?? GENRES[0];

/** Language-independent song languages for lyrics. */
export const LYRIC_LANGUAGES = ['ko', 'en'];
/** Vocal choices: who sings the guide melody. */
export const VOCALS = ['voiceFemale', 'voiceMale', 'voiceChoir', 'none'];
