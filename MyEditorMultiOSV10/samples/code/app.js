// JavaScript — ES modules, classes, template strings, async/await
import { readFile } from 'node:fs/promises';

const GREETING = '안녕하세요, My Editor!';

/**
 * Counts the lines of a text file.
 * @param {string} file
 */
export async function countLines(file) {
  const text = await readFile(file, 'utf-8');
  const lines = text.split(/\r?\n/);
  return { file, lines: lines.length, longest: Math.max(...lines.map((l) => l.length)) };
}

export default class Greeter {
  #name;
  constructor(name = 'world') { this.#name = name; }
  greet() { return `${GREETING} ${this.#name} ${42 * 2}`; }
}
