// The built-in lyric writer (CONTRACT: pure, works offline, Korean and English). It picks a theme
// from the user's topic, writes each section from the theme's phrase banks — verses tell, the chorus
// repeats its hook, the bridge turns — and prefers line pairs that rhyme. The same seed writes the
// same lyrics. An AI provider (music/ai.js) can write the lyrics instead; both return this shape:
//   { title, language, sections: { [sectionId]: [lines] } }
import { BANK, THEMES, THEME_WORDS, TITLES, VOCALISE, themeOf } from './lyrics-bank.js';
import { josa, rhymeKey, syllableCount } from './syllables.js';
import { rng, seedOf } from './random.js';
import { moodOf } from './genres.js';

/** The theme a topic points to (its words), else the mood's usual theme. */
export function themeForTopic(topic, mood = 'happy') {
  const text = String(topic ?? '').toLowerCase();
  let best = null;
  let score = 0;
  for (const [id, words] of Object.entries(THEME_WORDS)) {
    const s = words.reduce((n, w) => n + (text.includes(w.toLowerCase()) ? w.length : 0), 0);
    if (s > score) { score = s; best = id; }
  }
  if (best) return best;
  return { sad: 'breakup', calm: 'night', energetic: 'summer', romantic: 'love', dark: 'night', dreamy: 'dream', epic: 'hope', nostalgic: 'youth', hopeful: 'hope', happy: 'love' }[mood] ?? 'love';
}

/** The topic's main word for {t} (the longest word, without particles), or the theme's name. */
export function topicWord(topic, theme, language) {
  const words = String(topic ?? '').split(/[\s,./!?]+/).map((w) => w.replace(/(은|는|이|가|을|를|의|에|와|과|도|로|으로)$/u, '')).filter((w) => w.length > 0);
  if (!words.length) return themeOf(theme)[language === 'en' ? 'en' : 'ko'];
  return words.sort((a, b) => b.length - a.length)[0];
}

/** Puts the topic into a line: {t}, {t:을/를}, {t:의}, {t:(으)로}. */
export function fillTopic(line, word) {
  return line.replace(/\{t(?::([^}]+))?\}/g, (m, particle) => {
    if (!particle) return word;
    if (particle === '의') return `${word}의`;
    if (particle === '(으)로') return josa(word, '으로/로');
    return josa(word, particle);
  });
}

/** Picks `count` lines from `pool`, preferring pairs (1-2, 3-4) that rhyme and avoiding repeats. */
function pickLines(pool, count, random, used) {
  const fresh = pool.filter((line) => !used.has(line));
  const source = fresh.length >= count ? fresh : pool;
  const out = [];
  const shuffled = random.shuffle(source);
  for (let i = 0; i < count; i++) {
    let line;
    if (i % 2 === 1 && out[i - 1]) {
      const key = rhymeKey(out[i - 1]);
      line = shuffled.find((l) => !out.includes(l) && rhymeKey(l) === key) ?? shuffled.find((l) => !out.includes(l));
    } else line = shuffled.find((l) => !out.includes(l));
    line ??= random.pick(source);
    out.push(line);
    used.add(line);
  }
  return out;
}

/**
 * Lyrics for a song's sections. spec: { topic, mood, theme?, language: 'ko' | 'en', seed, sections:
 * [{ id, type, lines (how many sung lines), repeatOf? (the id of the first section with the same
 * lyrics, e.g. the second chorus) }] }.
 */
export function writeLyrics(spec) {
  const language = spec.language === 'en' ? 'en' : 'ko';
  const theme = spec.theme && THEMES.some((t) => t.id === spec.theme) ? spec.theme : themeForTopic(spec.topic, spec.mood);
  const bank = BANK[language][theme];
  const random = rng(spec.seed ?? seedOf(`${spec.topic}|${spec.mood}|${language}`));
  const word = topicWord(spec.topic, theme, language);
  const used = new Set();
  const sections = {};
  const hookLines = pickLines(bank.hook, 4, random, new Set());
  // The chorus: the hook, a second hook line, the hook again with an answer — a chorus repeats itself.
  const chorus = [hookLines[0], hookLines[1], hookLines[2], hookLines[0]].map((l) => fillTopic(l, word));
  for (const section of spec.sections ?? []) {
    if (section.repeatOf && sections[section.repeatOf]) { sections[section.id] = [...sections[section.repeatOf]]; continue; }
    const n = Math.max(0, section.lines ?? 0);
    if (!n) { sections[section.id] = []; continue; }
    let lines;
    if (section.type === 'chorus' || section.type === 'drop') lines = Array.from({ length: n }, (_, i) => chorus[i % chorus.length]);
    else if (section.type === 'bridge') lines = pickLines(bank.bridge, n, random, used);
    else if (section.type === 'prechorus' || section.type === 'build') lines = pickLines([...bank.bridge, ...bank.verse], n, random, used);
    else if (section.type === 'intro' || section.type === 'outro' || section.type === 'interlude') lines = section.type === 'outro' ? [chorus[0], ...pickLines(VOCALISE[language], n - 1, random, new Set())].slice(0, n) : pickLines(VOCALISE[language], n, random, new Set());
    else lines = pickLines(bank.verse, n, random, used);
    sections[section.id] = lines.map((l) => fillTopic(l, word));
  }
  const titlePattern = random.pick(TITLES[language]);
  const themeName = themeOf(theme)[language];
  const hookTitle = shortHook(chorus[0], language);
  const title = spec.topic ? titlePattern.replace('{t}', word).replace('{theme}', themeName) : hookTitle;
  return { title: title || hookTitle, language, theme, sections, provider: 'builtin' };
}

/** A short title from a hook line: its first few words. */
export function shortHook(line, language) {
  const words = String(line ?? '').replace(/[,.!?]/g, '').split(/\s+/).filter(Boolean);
  return words.slice(0, language === 'en' ? 4 : 3).join(' ');
}

/** Lyrics as plain text with section headers ("[Verse 1]"). `labels(section)` names a section. */
export function lyricsText(song, labels) {
  const out = [];
  for (const section of song.sections) {
    const lines = section.lyrics ?? [];
    if (!lines.length) continue;
    out.push(`[${labels(section)}]`, ...lines, '');
  }
  return out.join('\n').trim();
}

/**
 * Lyrics typed or pasted as text back into sections. "[Chorus]" style headers pick the section; without
 * headers, the lines fill the sung sections in order, as many as each one has.
 */
export function parseLyricsText(text, sections, labels) {
  const out = {};
  const blocks = [];
  let current = null;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    const header = /^\[(.+)\]$/.exec(line);
    if (header) { current = { name: header[1].trim().toLowerCase(), lines: [] }; blocks.push(current); continue; }
    if (!line) continue;
    if (!current) { current = { name: null, lines: [] }; blocks.push(current); }
    current.lines.push(line);
  }
  if (blocks.some((b) => b.name)) {
    for (const b of blocks) {
      const section = sections.find((s) => labels(s).toLowerCase() === b.name) ?? sections.find((s) => b.name && (s.type === b.name || labels(s).toLowerCase().startsWith(b.name)) && !out[s.id]);
      if (section) out[section.id] = b.lines;
    }
    return out;
  }
  const lines = blocks.flatMap((b) => b.lines);
  let at = 0;
  for (const s of sections) {
    const n = s.lyrics?.length || 0;
    if (!n) continue;
    out[s.id] = lines.slice(at, at + n);
    at += n;
  }
  if (at < lines.length) {
    const last = [...sections].reverse().find((s) => out[s.id]);
    if (last) out[last.id] = [...out[last.id], ...lines.slice(at)];
  }
  return out;
}

/** Counts per line: [{ line, syllables }]. */
export const lineSyllables = (lines) => (lines ?? []).map((line) => ({ line, syllables: syllableCount(line) }));

/** The mood's words for prompts ("밝은" / "Happy"). */
export const moodWord = (mood, language) => moodOf(mood)[language === 'en' ? 'en' : 'ko'];
