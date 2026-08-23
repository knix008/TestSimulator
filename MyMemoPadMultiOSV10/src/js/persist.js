import { DEFAULT_SETTINGS, lookFromSettings } from './shared.js';

const KEYS = {
  memos: 'mymemopad.memos',
  settings: 'mymemopad.settings',
  looks: 'mymemopad.looks'
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function webLoadMemos() {
  const raw = read(KEYS.memos, []);
  return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : [];
}

export function webSaveMemos(items) {
  const list = Array.isArray(items) ? items.filter((x) => typeof x === 'string') : [];
  write(KEYS.memos, list);
  return list;
}

export function webLoadSettings() {
  return { ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) };
}

export function webSaveSettings(data) {
  const next = { ...webLoadSettings(), ...data };
  write(KEYS.settings, next);
  return next;
}

export function webGetLook(index) {
  const looks = read(KEYS.looks, []);
  if (index >= 0 && looks[index]) return { ...looks[index] };
  return lookFromSettings(webLoadSettings());
}

export function webSetLook(index, look) {
  if (index < 0) return;
  const looks = read(KEYS.looks, []);
  while (looks.length <= index) looks.push(null);
  looks[index] = look;
  write(KEYS.looks, looks);
}

export function webRemoveLook(index) {
  const looks = read(KEYS.looks, []);
  if (index >= 0 && index < looks.length) {
    looks.splice(index, 1);
    write(KEYS.looks, looks);
  }
}

export function webApplyBackColorToAllLooks(color) {
  const memos = webLoadMemos();
  const looks = read(KEYS.looks, []);
  while (looks.length < memos.length) looks.push(null);
  for (let i = 0; i < memos.length; i++) {
    const look = looks[i] || lookFromSettings(webLoadSettings());
    looks[i] = { ...look, editorBackColor: color, formBackColor: color };
  }
  write(KEYS.looks, looks);
}
