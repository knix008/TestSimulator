// Sample programs shown in the code editor. Each language module exports
// `{ [algorithmId]: source }`. A missing entry falls back to a short note.
import { c } from './c.js';
import { cpp } from './cpp.js';
import { java } from './java.js';
import { python } from './python.js';
import { go } from './go.js';
import { rust } from './rust.js';
import { javascript } from './javascript.js';
import { extra } from './extra.js';

export const CODE_LANGUAGES = [
  { id: 'c', name: 'C', ext: 'c' },
  { id: 'cpp', name: 'C++', ext: 'cpp' },
  { id: 'java', name: 'Java', ext: 'java' },
  { id: 'python', name: 'Python', ext: 'py' },
  { id: 'go', name: 'Go', ext: 'go' },
  { id: 'rust', name: 'Rust', ext: 'rs' },
  { id: 'javascript', name: 'JavaScript', ext: 'js' },
];

const SOURCES = { c, cpp, java, python, go, rust, javascript };

/** The sample source for an algorithm in a language, or null when not shipped yet. */
export function sample(algorithmId, language) {
  return SOURCES[language]?.[algorithmId] ?? extra[language]?.[algorithmId] ?? null;
}

export function extension(language) {
  return CODE_LANGUAGES.find((item) => item.id === language)?.ext ?? 'txt';
}
