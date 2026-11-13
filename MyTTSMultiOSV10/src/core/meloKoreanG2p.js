/**
 * MeloTTS-KR text front-end.
 * Official MeloTTS uses g2pkk → hangul_to_jamo → cleaned_text_to_sequence.
 * We use `korean-pronunciation` (g2pK JS port) + the same jamo / blank layout.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let g2pInstance = null;
let dictionaries = null;

function getG2p() {
  if (!g2pInstance) {
    const mod = require('korean-pronunciation');
    const G2p = mod.G2p || mod.default?.G2p || mod.default;
    g2pInstance = typeof G2p === 'function' ? new G2p() : G2p;
  }
  return g2pInstance;
}

function loadDictionaries(modelDir) {
  if (dictionaries) return dictionaries;
  const dictPath = path.join(modelDir, 'melo', 'text', 'ko_dictionary.py');
  // Fallback inline (same as MeloTTS ko_dictionary.py)
  dictionaries = {
    etc: { '1+1': '원플러스원', '2+1': '투플러스원' },
    english: {
      KOREA: '코리아', IDOL: '아이돌', IT: '아이티', IQ: '아이큐',
      UP: '업', DOWN: '다운', PC: '피씨', CCTV: '씨씨티비', SNS: '에스엔에스',
      AI: '에이아이', CEO: '씨이오',
      A: '에이', B: '비', C: '씨', D: '디', E: '이', F: '에프', G: '지',
      H: '에이치', I: '아이', J: '제이', K: '케이', L: '엘', M: '엠', N: '엔',
      O: '오', P: '피', Q: '큐', R: '알', S: '에스', T: '티', U: '유',
      V: '브이', W: '더블유', X: '엑스', Y: '와이', Z: '제트',
    },
  };
  try {
    if (fs.existsSync(dictPath)) {
      // keep defaults; file is Python — already mirrored above
    }
  } catch {
    /* ignore */
  }
  return dictionaries;
}

/** MeloTTS korean.normalize (minus CJK punctuation scrub). */
export function normalizeMeloKorean(text, modelDir = '') {
  const dicts = loadDictionaries(modelDir);
  let out = String(text || '').trim();
  for (const [k, v] of Object.entries(dicts.etc)) {
    if (out.includes(k)) out = out.split(k).join(v);
  }
  out = out.replace(/[A-Za-z]+/g, (word) => {
    const hit = dicts.english[word.toUpperCase()];
    return hit || word;
  });
  return out.toLowerCase();
}

/** Syllable → choseong/jungseong/jongseong (U+1100 jamo), same as jamo.hangul_to_jamo. */
export function hangulToJamoList(text) {
  const out = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const offset = code - 0xAC00;
      const cho = Math.floor(offset / (21 * 28));
      const jung = Math.floor((offset % (21 * 28)) / 28);
      const jong = offset % 28;
      out.push(String.fromCharCode(0x1100 + cho));
      out.push(String.fromCharCode(0x1161 + jung));
      if (jong > 0) out.push(String.fromCharCode(0x11A7 + jong));
    } else if (ch === ' ' || ch === '\t' || ch === '\n') {
      // spaces are not in MeloTTS symbols — drop
    } else {
      out.push(ch);
    }
  }
  return out;
}

/**
 * Apply g2pK pronunciation rules then jamo-decompose.
 * @returns {string[]} phone symbols (no leading/trailing '_')
 */
export function koreanTextToPhonemes(text, modelDir = '') {
  const normalized = normalizeMeloKorean(text, modelDir);
  if (!normalized) return [];

  const g2p = getG2p();
  const pronounced = typeof g2p.convert === 'function'
    ? g2p.convert(normalized)
    : g2p(normalized);

  return hangulToJamoList(String(pronounced || normalized));
}

/** MeloTTS commons.intersperse */
export function intersperse(list, item) {
  const result = new Array(list.length * 2 + 1).fill(item);
  for (let i = 0; i < list.length; i += 1) result[i * 2 + 1] = list[i];
  return result;
}
