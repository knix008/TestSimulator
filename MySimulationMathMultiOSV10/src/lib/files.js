// File kinds by extension: which icon, and what double-click does.
import { extOf } from './backend.js';

export const SCRIPT_EXTS = ['.m'];
export const DEFAULT_MODEL_EXTS = ['.smdl', '.msim'];
export const DATA_EXTS = ['.mat'];
export const TABLE_EXTS = ['.csv', '.tsv', '.xlsx', '.xls', '.json'];
export const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tif', '.tiff', '.webp'];
export const AUDIO_EXTS = ['.wav', '.mp3', '.ogg', '.flac'];
export const TEXT_EXTS = ['.txt', '.md', '.log', '.ini', '.cfg', '.xml', '.html', '.css', '.js', '.json', '.csv', '.tsv', '.dat'];

let modelExts = DEFAULT_MODEL_EXTS;
/** The simulation area tells which extensions its models use (MODEL_EXT). */
export function setModelExts(ext) {
  const list = (Array.isArray(ext) ? ext : [ext]).filter(Boolean).map((e) => (String(e).startsWith('.') ? String(e) : `.${e}`).toLowerCase());
  modelExts = [...new Set([...list, ...DEFAULT_MODEL_EXTS])];
}
export const getModelExts = () => modelExts;

/** 'script' | 'model' | 'data' | 'table' | 'image' | 'audio' | 'text' | 'other' */
export function fileKind(name) {
  const e = extOf(name);
  if (SCRIPT_EXTS.includes(e)) return 'script';
  if (modelExts.includes(e)) return 'model';
  if (DATA_EXTS.includes(e)) return 'data';
  if (TABLE_EXTS.includes(e)) return 'table';
  if (IMAGE_EXTS.includes(e)) return 'image';
  if (AUDIO_EXTS.includes(e)) return 'audio';
  if (TEXT_EXTS.includes(e)) return 'text';
  return 'other';
}

const ICON = { script: 'script', model: 'model', data: 'database', table: 'table', image: 'image', audio: 'waves', text: 'file', other: 'file' };
export const fileIcon = (name) => ICON[fileKind(name)] || 'file';

/** M string literal for a path ('it''s' doubling). */
export const mQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** A valid M variable name made from a file name ("my data-1.csv" → my_data_1). */
export function varNameOf(fileName) {
  let n = String(fileName || '').replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9_]/g, '_');
  if (!/^[A-Za-z]/.test(n)) n = `x${n}`;
  return n.slice(0, 63) || 'data';
}

/** The command that loads a data file into the workspace (Import Data, double-click). */
export function importCommand(path, varName) {
  const kind = fileKind(path);
  const v = varName || varNameOf(path.split('/').pop());
  if (kind === 'data') return `load(${mQuote(path)})`;
  if (kind === 'image') return `${v} = imread(${mQuote(path)});`;
  if (kind === 'audio') return `[${v}, ${v}_fs] = audioread(${mQuote(path)});`;
  if (kind === 'table') return `${v} = readmatrix(${mQuote(path)});`;
  return `${v} = importdata(${mQuote(path)});`;
}

/** File-name pattern (* and ?, several separated by ; or ,) → case-insensitive RegExp. */
export function globToRegExp(pattern) {
  const p = String(pattern || '*').trim() || '*';
  const parts = p.split(/[;,]\s*/).filter(Boolean).map((x) => x.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.'));
  return new RegExp(`^(?:${parts.join('|')})$`, 'i');
}
