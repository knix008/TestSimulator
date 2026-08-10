const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const STORE_FILE = 'persist.json';

/** @type {Record<string, string> | null} */
let cache = null;

function storePath() {
  return path.join(app.getPath('userData'), STORE_FILE);
}

function readStore() {
  if (cache) return cache;
  try {
    const file = storePath();
    if (!fs.existsSync(file)) {
      cache = {};
      return cache;
    }
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    cache = {};
  }
  return cache;
}

function writeStore() {
  const file = storePath();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache || {}, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function getItem(key) {
  if (typeof key !== 'string' || !key) return null;
  const store = readStore();
  const value = store[key];
  return typeof value === 'string' ? value : value == null ? null : String(value);
}

function setItem(key, value) {
  if (typeof key !== 'string' || !key) return false;
  const store = readStore();
  store[key] = String(value);
  try {
    writeStore();
    return true;
  } catch {
    return false;
  }
}

function removeItem(key) {
  if (typeof key !== 'string' || !key) return false;
  const store = readStore();
  if (!(key in store)) return true;
  delete store[key];
  try {
    writeStore();
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  getItem,
  setItem,
  removeItem
};
