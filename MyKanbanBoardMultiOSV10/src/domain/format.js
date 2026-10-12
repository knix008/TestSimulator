// The .mkanban file format: UTF-8 JSON
//   { "format": "mykanbanboard", "version": 1, "board": { …board… },
//     "attachments"?: { "<attachment id>": "data:<mime>;base64,…" } }
// Cards list their attachments (name, size, type, thumbnail); the file
// contents sit once in "attachments". Plain board objects are accepted too.
import { createBoard, createColumn, newId } from './board.js';

export const FORMAT = 'mykanbanboard';
export const FORMAT_VERSION = 1;
export const EXTENSION = 'mkanban';

export class FormatError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'FormatError';
    this.code = code;
    this.detail = detail;
  }
}

export function serialize(board, attachments = {}) {
  const data = { format: FORMAT, version: FORMAT_VERSION, savedAt: new Date().toISOString(), board };
  if (Object.keys(attachments).length) data.attachments = attachments;
  return `${JSON.stringify(data, null, 2)}\n`;
}

/** Parses and repairs a board file. Throws FormatError with a code the UI translates. */
export function parse(text) {
  return parseFile(text).board;
}

/** Board file → { board, attachments }. */
export function parseFile(text) {
  let data;
  try {
    data = JSON.parse(String(text).replace(/^﻿/, ''));
  } catch (error) {
    throw new FormatError('format.invalidJson', error.message);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new FormatError('format.notBoard');
  if (data.format !== undefined && data.format !== FORMAT) throw new FormatError('format.otherFormat', String(data.format));
  if (Number(data.version) > FORMAT_VERSION) throw new FormatError('format.newerVersion', String(data.version));
  const raw = data.board ?? data;
  const attachments = data.attachments && typeof data.attachments === 'object' && !Array.isArray(data.attachments) ? data.attachments : {};
  return { board: parseBoardObject(raw), attachments };
}

/** A board object (from a file, a project or a database row), repaired. */
export function parseBoardObject(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.columns)) throw new FormatError('format.notBoard');
  const board = createBoard({ title: String(raw.title ?? '').trim() || 'Board', description: String(raw.description ?? ''), columns: [] });
  if (typeof raw.id === 'string' && raw.id) board.id = raw.id;
  if (raw.created) board.created = String(raw.created);
  if (raw.updated) board.updated = String(raw.updated);
  // Ids must be unique; duplicates (hand-edited files) get fresh ones.
  const seen = new Set();
  const unique = (id, prefix) => {
    if (typeof id === 'string' && id && !seen.has(id)) {
      seen.add(id);
      return id;
    }
    const fresh = newId(prefix);
    seen.add(fresh);
    return fresh;
  };
  for (const column of raw.columns) {
    if (!column || typeof column !== 'object') continue;
    const cards = (Array.isArray(column.cards) ? column.cards : [])
      .filter((card) => card && typeof card === 'object')
      .map((card) => ({ ...card, id: unique(card.id, 'card') }));
    board.columns.push(createColumn({ ...column, id: unique(column.id, 'col'), cards }));
  }
  return board;
}

export const baseName = (path) => String(path ?? '').split(/[\\/]/).pop() ?? '';
export const stripExtension = (name) => name.replace(/\.(mkanban|json)$/i, '');
export const isBoardFileName = (name) => /\.(mkanban|json)$/i.test(name ?? '');
export const isImageFileName = (name) => /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/i.test(name ?? '');
export const isTextFileName = (name) => /\.(txt|md|markdown|csv|tsv|log)$/i.test(name ?? '');
export const withExtension = (path) => (/\.(mkanban|json)$/i.test(path) ? path : `${path}.${EXTENSION}`);
export const directoryOf = (path) => {
  const index = Math.max(String(path).lastIndexOf('/'), String(path).lastIndexOf('\\'));
  return index > 0 ? String(path).slice(0, index) : '';
};
