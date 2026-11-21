// A voice bank's pronunciation dictionary (dsdict*.yaml) (CONTRACT: pure): graphemes → phoneme
// symbols, and each symbol's type (vowel, stop, …). Modelled on OpenUtau's G2pDictionary (MIT).
import { parseYaml } from './yaml.js';

export class Dictionary {
  constructor() {
    this.entries = new Map();
    this.types = new Map();
    this.replacements = new Map();
  }

  /** Adds a parsed dsdict document (later files do not override earlier entries). */
  load(doc) {
    if (!doc || typeof doc !== 'object') return this;
    for (const s of Array.isArray(doc.symbols) ? doc.symbols : []) {
      if (s && s.symbol != null && !this.types.has(String(s.symbol))) this.types.set(String(s.symbol), String(s.type ?? 'vowel'));
    }
    for (const e of Array.isArray(doc.entries) ? doc.entries : []) {
      if (!e || e.grapheme == null || !Array.isArray(e.phonemes)) continue;
      const g = String(e.grapheme);
      if (!this.entries.has(g)) this.entries.set(g, e.phonemes.map(String));
    }
    for (const r of Array.isArray(doc.replacements) ? doc.replacements : []) {
      if (r && r.from != null && r.to != null) this.replacements.set(String(r.from), String(r.to));
    }
    return this;
  }

  /** Parses YAML text and adds it. */
  loadText(text) { return this.load(parseYaml(text)); }

  addSymbol(symbol, vowel) { this.types.set(symbol, vowel ? 'vowel' : 'stop'); return this; }

  /** The phonemes of a grapheme, or null. */
  query(grapheme) {
    const hit = this.entries.get(grapheme) ?? this.entries.get(String(grapheme).toLowerCase());
    return hit ? hit.map((p) => this.replacements.get(p) ?? p) : null;
  }

  isValid(symbol) { return this.types.has(symbol); }
  isVowel(symbol) { return this.types.get(symbol) === 'vowel'; }
  isGlide(symbol) { const t = this.types.get(symbol); return t === 'semivowel' || t === 'liquid'; }
  get size() { return this.entries.size; }
}

/** Builds a dictionary from several YAML texts (first one wins for a grapheme); SP and AP are vowels. */
export function buildDictionary(texts) {
  const dict = new Dictionary();
  for (const text of texts) if (text) dict.loadText(text);
  dict.addSymbol('SP', true).addSymbol('AP', true);
  return dict;
}

/** phonemes.txt (one symbol per line, the line number is the id) or phonemes.json ({ symbol: id }). */
export function parsePhonemes(text, isJson = false) {
  const map = new Map();
  if (isJson) {
    const obj = JSON.parse(text);
    for (const [k, v] of Object.entries(obj)) map.set(k, Number(v));
    return map;
  }
  const lines = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  // A trailing empty line is not a symbol (C# File.ReadAllLines drops it as well).
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  lines.forEach((line, i) => map.set(line, i));
  return map;
}

/** languages.json: { "ko": 1, … }. */
export function parseLanguages(text) {
  const out = new Map();
  if (!text) return out;
  for (const [k, v] of Object.entries(JSON.parse(text))) out.set(k, Number(v));
  return out;
}

/** "ko/a" → "ko"; "a" → "". */
export const phonemeLanguage = (p) => (p.includes('/') ? p.split('/')[0] : '');
