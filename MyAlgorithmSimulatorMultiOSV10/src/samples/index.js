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
import { c as cMore } from './classroom/c.js';
import { cpp as cppMore } from './classroom/cpp.js';
import { java as javaMore } from './classroom/java.js';
import { python as pythonMore } from './classroom/python.js';
import { go as goMore } from './classroom/go.js';
import { rust as rustMore } from './classroom/rust.js';
import { javascript as javascriptMore } from './classroom/javascript.js';

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
const CLASSROOM = { c: cMore, cpp: cppMore, java: javaMore, python: pythonMore, go: goMore, rust: rustMore, javascript: javascriptMore };

/** The sample source for an algorithm in a language, or null when not shipped yet. */
export function sample(algorithmId, language) {
  return SOURCES[language]?.[algorithmId] ?? extra[language]?.[algorithmId] ?? CLASSROOM[language]?.[algorithmId] ?? null;
}

export function extension(language) {
  return CODE_LANGUAGES.find((item) => item.id === language)?.ext ?? 'txt';
}
