// Spelling: an English and a Korean word list (public/dict, built by scripts/build-dict.mjs), the
// words the program itself uses (spell-extra.js) and the user's own dictionary (Settings ›
// Dictionary). Text is cut into words; a Latin word is looked up in English, a Hangul word
// (eojeol) is taken apart first — particles (조사) and endings (어미) come off, conjugated forms are
// traced back to the dictionary form ("만듭니다" → 만들다, "새로운" → 새롭다, "했어요" → 하다),
// and compound nouns are tried as two words ("홈페이지제작" → 홈페이지 + 제작).
// Addresses, e-mail, code, numbers and names written like "MyHomeMaker" are not checked.

// ───────────────────────── word lists: sorted, front-coded (one char = shared prefix length, base 36)

export function encodeWordList(words) {
  let previous = '';
  const lines = [];
  for (const word of words) {
    let same = 0;
    const max = Math.min(35, previous.length, word.length);
    while (same < max && previous[same] === word[same]) same += 1;
    lines.push(same.toString(36) + word.slice(same));
    previous = word;
  }
  return lines.join('\n');
}

export function decodeWordList(text) {
  const words = [];
  let previous = '';
  for (const line of String(text ?? '').split('\n')) {
    if (!line) continue;
    const same = parseInt(line[0], 36);
    previous = previous.slice(0, same) + line.slice(1);
    words.push(previous);
  }
  return words;
}

// ───────────────────────── Hangul jamo (NFD: leading consonant, vowel, final consonant)

const J = { n: 'ᆫ', l: 'ᆯ', m: 'ᆷ', b: 'ᆸ', ss: 'ᆻ', h: 'ᇂ', d: 'ᆮ' };
const isVowelJamo = (c) => c >= 'ᅡ' && c <= 'ᅵ';
const isFinalJamo = (c) => c >= 'ᆨ' && c <= 'ᇂ';
const nfd = (s) => s.normalize('NFD');
const nfc = (s) => s.normalize('NFC');
const D = (list) => list.map(nfd);

/** Particles (and the copula) that follow a noun, longest first. */
const JOSA = [...new Set([
  '이에요', '예요', '입니다', '입니까', '이었다', '였다', '이었습니다', '였습니다', '이라는', '라는', '이라고', '라고', '이라면', '라면', '이지만', '지만', '이므로', '이고', '이며', '이다', '이야', '이죠', '이란', '란', '인', '일', '임',
  '에서는', '에서도', '에서의', '에서', '에게서', '에게는', '에게', '께서는', '께서', '께', '한테', '에는', '에도', '에의', '에', '으로는', '으로도', '으로써', '으로서', '으로', '로는', '로도', '로써', '로서', '로',
  '이나', '나', '이랑', '랑', '하고', '와는', '과는', '와의', '과의', '와도', '과도', '와', '과', '까지도', '까지는', '까지', '부터는', '부터', '마저', '조차', '처럼', '같이', '보다는', '보다', '마다', '만큼', '끼리', '끼리는', '끼리도', '만을', '만의', '만이', '만은', '만',
  '에서나', '서나', '서', '이든지', '든지', '이든', '든', '이라도', '라도', '밖에', '뿐', '대로', '씩', '쯤', '들이', '들은', '들을', '들의', '들과', '들도', '들에게', '들', '의', '도', '은', '는', '이', '가', '을', '를', '요', '이요', '고', '며',
])].sort((a, b) => b.length - a.length);
const JOSA_SET = new Set(JOSA);

/** Endings that attach straight to a verb or adjective stem (NFD; ᆫ ᆯ ᆷ ᆸ… join the stem's last syllable). */
const DIRECT = D([...new Set([
  '다', '습니다', '습니까', `${J.b}니다`, `${J.b}니까`, `${J.b}시다`, '읍시다', '는', J.n, '은', J.l, '을', '는다', `${J.n}다`, '고', '고요', '고서', '고자', '곤',
  '지', '지요', '죠', '지만', '지도', '게', '게요', '기', '기에', '기로', '기도', '기는', '기가', '기를', '기만', '기와', '기의', '기엔', '도록', '면', '으면', '며', '으며', '면서', '으면서', '니', '으니', '니까', '으니까',
  '세요', '으세요', '셔요', '십시오', '으십시오', '시고', '으시고', '시는', '으시는', `시${J.n}`, `으시${J.n}`, '신', '으신', '실', '으실', '시며', '으시며', '시면', '으시면', '셔서', '으셔서', '셨다', '으셨다', '셨습니다', '으셨습니다', '셨어요', '으셨어요', '십니다', '으십니다', '시죠', '으시죠', '시기', '으시기',
  '자', '자고', '던', '든지', '거나', '거든', '네', '네요', '는군요', '군요', '는데', '은데', `${J.n}데`, '는데요', '은데요', `${J.n}데요`, '려고', '으려고', '러', '으러', '려면', '으려면', J.m, '음', '다가', '다면', '다고', '다는', '자는',
  '겠다', '겠습니다', '겠어요', '겠지만', '겠네요', '겠고', '겠죠', '겠는데', `${J.n}지`, '는지', '은지', `${J.l}까`, '을까', `${J.l}까요`, '을까요', `${J.l}게`, '을게', `${J.l}게요`, '을게요', `${J.l}래요`, '을래요', `${J.n}가요`, '은가요', '는가', '나요', '는지요',
  '듯', '듯이', '더라도', '더니', '거든요', `${J.l}수록`, '을수록', `${J.l}지`, '을지', `${J.l}지라도`, `${J.l}때`, '을때', `${J.l}만큼`, '을만큼', `${J.n}다면`, '는다면', `${J.n}다고`, '는다고', `${J.n}다는`, '는다는',
])]).sort((a, b) => b.length - a.length);

/** What follows the 아/어/여 of a stem ("먹어요", "했습니다", "해서" …). */
const A_TAILS = D(['', '요', '서', '서요', '도', '야', '야지', '라', '줘', '다', '다가', '보세요', '보기', '본', '봐요', '주세요', '줍니다', '드립니다', '드려요', `${J.ss}다`, `${J.ss}습니다`, `${J.ss}어요`, `${J.ss}고`, `${J.ss}던`, `${J.ss}는데`, `${J.ss}지만`, `${J.ss}으며`, `${J.ss}으면`, `${J.ss}을`,
  `${J.ss}기`, `${J.ss}죠`, `${J.ss}지요`, `${J.ss}다가`, `${J.ss}네요`, `${J.ss}어`, `${J.ss}으니`, `${J.ss}는지`, `${J.ss}다면`, `${J.ss}다고`, `${J.ss}다는`, `${J.ss}겠다`, `${J.ss}겠어요`, `${J.ss}을까요`, `${J.ss}습니까`]).sort((a, b) => b.length - a.length);

/** A contracted 아/어 vowel → the stem vowels it can come from (해 ← 하, 봐 ← 보, 줘 ← 주, 써 ← 쓰, 마셔 ← 마시, 돼 ← 되 …). */
const CONTRACT = { 'ᅢ': ['ᅡ', 'ᅢ'], 'ᅪ': ['ᅩ'], 'ᅯ': ['ᅮ'], 'ᅥ': ['ᅥ', 'ᅳ'], 'ᅡ': ['ᅡ', 'ᅳ'], 'ᅧ': ['ᅵ'], 'ᅫ': ['ᅬ'], 'ᅦ': ['ᅦ'], 'ᅤ': ['ᅢ'] };
const A_VOWELS = D(['어', '아', '여']);

/** Possible dictionary forms (…다) of a conjugated word, NFD in, NFC out. */
function baseForms(word) {
  const s = nfd(word);
  const out = new Set();
  const add = (stem) => { if (stem && !isFinalJamo(stem[0]) && !isVowelJamo(stem[0])) out.add(`${nfc(stem)}다`); };
  for (const ending of DIRECT) {
    if (!s.endsWith(ending) || s.length <= ending.length) continue;
    const stem = s.slice(0, -ending.length);
    const last = stem.at(-1);
    const startsWithFinal = isFinalJamo(ending[0]);
    if (startsWithFinal && !isVowelJamo(last)) continue;
    if (!startsWithFinal && isVowelJamo(ending[0])) continue;
    add(stem);
    if (isVowelJamo(last)) {
      add(stem + J.l); // ㄹ drops: 만드 + ㅂ니다 ← 만들다, 사는 ← 살다
      add(stem + J.h); // ㅎ drops: 그런 ← 그렇다
      if (stem.endsWith(nfd('우'))) add(stem.slice(0, -nfd('우').length) + J.b); // ㅂ → 우: 새로운 ← 새롭다
    }
    if (last === J.l) add(stem.slice(0, -1) + J.d); // ㄷ → ㄹ: 들으면 ← 듣다
  }
  for (const tail of A_TAILS) {
    if (!s.endsWith(tail)) continue;
    const r = s.slice(0, s.length - tail.length);
    if (!r) continue;
    for (const v of A_VOWELS) if (r.endsWith(v) && r.length > v.length) {
      const stem = r.slice(0, -v.length);
      add(stem);
      if (stem.at(-1) === J.l) add(stem.slice(0, -1) + J.d); // 들어 ← 듣다
    }
    const last = r.at(-1);
    if (isVowelJamo(last)) {
      const head = r.slice(0, -1);
      for (const vowel of CONTRACT[last] ?? []) add(head + vowel);
      if (last === 'ᅢ') { add(`${head}ᅥ${J.h}`); add(`${head}ᅡ${J.h}`); } // 그래 ← 그렇다, 빨개 ← 빨갛다
      if (last === 'ᅯ' || last === 'ᅪ') { // 고마워 ← 고맙다, 도와 ← 돕다
        const before = head.slice(0, -1);
        const prev = before.at(-1);
        if (isVowelJamo(prev)) add(before + J.b);
      }
      // 르 irregular: 불러 ← 부르다, 몰라 ← 모르다
      const lr = nfd('러'); const la = nfd('라');
      if ((r.endsWith(lr) || r.endsWith(la)) && r.at(-3) === J.l) add(`${r.slice(0, -3)}${nfd('르')}`);
    }
  }
  return [...out];
}

// ───────────────────────── the checker

const CONTRACTIONS = new Set(["don't", "doesn't", "didn't", "isn't", "aren't", "wasn't", "weren't", "can't", "couldn't", "won't", "wouldn't", "shouldn't", "haven't", "hasn't", "hadn't", "mustn't", "needn't", "let's", "ain't", "shan't", "o'clock", "y'all"]);
const APOSTROPHE_TAILS = ['s', 're', 'll', 've', 'd', 'm'];

export class SpellChecker {
  /** `en`, `ko`: word arrays or Sets; `user`: the user's own words. */
  constructor({ en = [], ko = [], user = [], extra = { en: [], ko: [] } } = {}) {
    this.en = en instanceof Set ? en : new Set(en);
    this.ko = ko instanceof Set ? ko : new Set(ko);
    for (const w of extra.en ?? []) this.en.add(w.toLowerCase());
    for (const w of extra.ko ?? []) this.ko.add(w);
    this.setUserWords(user);
    this.syllables = null;
  }

  setUserWords(words = []) {
    this.user = new Set(words.map((w) => normalizeWord(w)));
    this.cache = new Map();
  }

  /** Is the word (as it stands in the text) spelt right? */
  check(word) {
    const key = word;
    if (this.cache.has(key)) return this.cache.get(key);
    const ok = /[가-힣]/.test(word) ? this.korean(word) : this.english(word);
    if (this.cache.size > 50_000) this.cache.clear();
    this.cache.set(key, ok);
    return ok;
  }

  english(word) {
    const w = word.replace(/’/g, "'");
    if (w.length < 2 || this.user.has(w.toLowerCase())) return true;
    if (/^[A-Z]+$/.test(w) && w.length <= 6) return true; // an acronym (FAQ, SNS, HTML)
    if (/[a-z][A-Z]/.test(w)) return true; // a name written like MyHomeMaker, iPhone, YouTube
    const lower = w.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    if (this.en.has(lower) || CONTRACTIONS.has(lower) || this.user.has(lower)) return true;
    const apostrophe = lower.lastIndexOf("'");
    if (apostrophe > 0) {
      const base = lower.slice(0, apostrophe);
      const tail = lower.slice(apostrophe + 1);
      if ((tail === '' || APOSTROPHE_TAILS.includes(tail)) && (this.en.has(base) || this.user.has(base))) return true;
    }
    return false;
  }

  knownKo(word) { return this.ko.has(word) || this.user.has(word); }

  /** A noun (or, unless `strict`, a noun phrase written as one word). */
  noun(word, depth = 0, strict = false) {
    if (this.knownKo(word)) return true;
    if (word.length > 1 && (word.endsWith('들') || word.endsWith('님')) && this.knownKo(word.slice(0, -1))) return true;
    if (word.length > 2 && word.endsWith('님들') && this.knownKo(word.slice(0, -2))) return true;
    if (strict || depth > 1 || word.length < 4) return false;
    for (let i = 2; i <= word.length - 2; i++) if (this.knownKo(word.slice(0, i)) && this.noun(word.slice(i), depth + 1)) return true;
    return false;
  }

  predicate(word) {
    for (const base of baseForms(word)) {
      if (this.knownKo(base)) return true;
      // noun + 하다 / 되다 / 시키다 / 드리다 / 받다 (제작하다, 예약되다, 안내드립니다)
      for (const light of ['하다', '되다', '시키다', '드리다', '받다', '스럽다', '롭다', '답다', '없다', '있다']) {
        if (base.endsWith(light) && base.length > light.length && this.noun(base.slice(0, -light.length))) return true;
      }
    }
    return false;
  }

  korean(word, strict = false) {
    if (this.knownKo(word) || this.noun(word, 0, strict) || this.predicate(word)) return true;
    for (const josa of JOSA) {
      if (word.length > josa.length && word.endsWith(josa)) {
        const stem = word.slice(0, -josa.length);
        if (this.noun(stem, 0, strict) || this.predicate(stem)) return true;
      }
    }
    return false;
  }

  /** Up to `max` corrections for a word the checker does not know. */
  suggest(word, max = 5) {
    return /[가-힣]/.test(word) ? this.suggestKorean(word, max) : this.suggestEnglish(word, max);
  }

  suggestEnglish(word, max) {
    const lower = word.toLowerCase();
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const vowel = (c) => 'aeiou'.includes(c);
    // One-letter edits with what they cost: the usual typos (a doubled or missing double letter,
    // two letters swapped, one vowel for another) cost less than any other change.
    const edits = (w) => {
      const out = [];
      for (let i = 0; i <= w.length; i++) {
        const a = w.slice(0, i);
        const b = w.slice(i);
        if (b) out.push([a + b.slice(1), b[0] === a.at(-1) || b[0] === b[1] ? 0.5 : 1]);
        if (b.length > 1) out.push([a + b[1] + b[0] + b.slice(2), 0.7]);
        for (const c of letters) {
          if (b && c !== b[0]) out.push([a + c + b.slice(1), vowel(c) && vowel(b[0]) ? 0.9 : 1]);
          out.push([a + c + b, c === a.at(-1) || c === b[0] ? 0.7 : 1]);
        }
      }
      return out;
    };
    const found = new Map();
    const take = (candidates, base) => {
      for (const [c, cost] of candidates) {
        if (c === lower || !this.en.has(c)) continue;
        const score = base + cost + (c[0] === lower[0] ? 0 : 0.5);
        if (!found.has(c) || found.get(c) > score) found.set(c, score);
      }
    };
    const first = edits(lower);
    take(first, 0);
    if (found.size < max && lower.length <= 12) for (const [e, cost] of first) take(edits(e), cost);
    const ranked = [...found.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).slice(0, max).map(([w]) => w);
    const capital = word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase();
    const upper = word === word.toUpperCase();
    return ranked.map((w) => (upper ? w.toUpperCase() : capital ? w[0].toUpperCase() + w.slice(1) : w));
  }

  suggestKorean(word, max) {
    if (!this.syllables) {
      const counts = new Map();
      for (const w of this.ko) for (const ch of w) counts.set(ch, (counts.get(ch) ?? 0) + 1);
      this.syllables = [...counts.entries()].filter(([, n]) => n >= 3).map(([ch]) => ch);
    }
    const chars = [...word];
    const found = new Map();
    // A correction made of one dictionary word (with its particle or ending) beats one that is only two words joined.
    const consider = (candidate, score) => { if (candidate && candidate !== word && !found.has(candidate) && this.korean(candidate)) found.set(candidate, score + (this.korean(candidate, true) ? 0 : 1.5)); };
    for (let i = 0; i < chars.length; i++) {
      for (const s of this.syllables) {
        if (s === chars[i]) continue;
        const c = [...chars]; c[i] = s;
        consider(c.join(''), jamoDistance(chars[i], s));
      }
      consider([...chars.slice(0, i), ...chars.slice(i + 1)].join(''), 2.5);
      if (i < chars.length - 1) { const c = [...chars]; [c[i], c[i + 1]] = [c[i + 1], c[i]]; consider(c.join(''), 2); }
    }
    return [...found.entries()].sort((a, b) => a[1] - b[1] || a[0].length - b[0].length).slice(0, max).map(([w]) => w);
  }
}

/** How different two syllables look, by their jamo (패 ↔ 페 = 1). */
function jamoDistance(a, b) {
  const x = [...nfd(a)];
  const y = [...nfd(b)];
  let d = Math.abs(x.length - y.length);
  // A vowel slip (ㅐ/ㅔ, ㅓ/ㅗ) is the most common Korean typo: it costs less than a consonant.
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) d += isVowelJamo(x[i]) && isVowelJamo(y[i]) ? 0.6 : 1;
  return d;
}

export const normalizeWord = (word) => {
  const w = String(word ?? '').trim().normalize('NFC').replace(/’/g, "'");
  return /[가-힣]/.test(w) ? w : w.toLowerCase();
};

/** A word the user may add: letters only (Hangul or Latin, an apostrophe or hyphen inside), at most 40 characters. */
export const validUserWord = (word) => /^(?:[가-힣]+|[A-Za-z]+(?:['’-][A-Za-z]+)*)$/.test(String(word ?? '').trim()) && String(word).trim().length <= 40;

// ───────────────────────── words of a text

/** Parts that are not words: addresses, e-mail, domains, code, Markdown link targets, hashtags. */
const MASKS = [
  /`[^`]*`/g,
  /\]\([^)]*\)/g,
  /\b(?:https?:\/\/|www\.)\S+/gi,
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
  /\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|io|kr|co|dev|app|html?|css|js|json|png|jpe?g|gif|svg|webp|pdf|zip|myhome|mhomt)\b/gi,
  /#[\w가-힣-]+/g,
  /&[a-z]+;/gi,
];

/** The words of a text that should be checked: { word, start, end } (offsets into the text). */
export function words(text) {
  let s = String(text ?? '');
  for (const mask of MASKS) s = s.replace(mask, (m) => ' '.repeat(m.length));
  const out = [];
  const re = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’][A-Za-zÀ-ÖØ-öø-ÿ]+)*['’]?|[가-힣]+/g;
  let m;
  while ((m = re.exec(s))) {
    let word = m[0];
    if (/['’]$/.test(word)) word = word.slice(0, -1);
    const start = m.index;
    const end = start + word.length;
    const before = s[start - 1] ?? ' ';
    const after = s[end] ?? ' ';
    // Next to a number or underscore ("3D", "24h", "v2", "file_name"): not a word to check.
    if (/[0-9_]/.test(before) || /[0-9_]/.test(after)) {
      if (!/[가-힣]/.test(word)) continue;
      if (/[0-9]/.test(before) && JOSA_SET.has(word)) continue;
    }
    // A particle right after a Latin name or a closing quote ("MyHomeMaker로", "‘홈’은").
    if (/[가-힣]/.test(word) && /[A-Za-z)\]"'’”%]/.test(before) && (JOSA_SET.has(word) || JOSA.some((j) => word === j))) continue;
    out.push({ word, start, end });
  }
  return out;
}
