'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULT_LOOK = {
  fontName: 'Malgun Gothic',
  fontSize: 12,
  fontStyle: 'Regular',
  foreColor: '#000000',
  editorBackColor: '#F8E18C',
  formBackColor: '#F8E18C',
  transparencyPercent: 0
};

const DEFAULT_SETTINGS = {
  ...DEFAULT_LOOK,
  language: 'ko',
  windowTransparencyPercent: 0
};

function colorFromStored(value, fallback) {
  if (typeof value === 'string' && /^#([0-9a-f]{6})$/i.test(value)) {
    return value.toUpperCase();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const n = value >>> 0;
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  }
  return fallback;
}

function clampTransparency(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function normalizeLook(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    fontName: typeof src.fontName === 'string' && src.fontName.trim() ? src.fontName : DEFAULT_LOOK.fontName,
    fontSize: Number.isFinite(Number(src.fontSize)) ? Number(src.fontSize) : DEFAULT_LOOK.fontSize,
    fontStyle: typeof src.fontStyle === 'string' ? src.fontStyle : DEFAULT_LOOK.fontStyle,
    foreColor: colorFromStored(src.foreColor ?? src.ForeColorArgb, DEFAULT_LOOK.foreColor),
    editorBackColor: colorFromStored(
      src.editorBackColor ?? src.EditorBackColorArgb,
      DEFAULT_LOOK.editorBackColor
    ),
    formBackColor: colorFromStored(src.formBackColor ?? src.FormBackColorArgb, DEFAULT_LOOK.formBackColor),
    transparencyPercent: clampTransparency(src.transparencyPercent ?? src.TransparencyPercent)
  };
}

function normalizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const look = normalizeLook({
    ...src,
    transparencyPercent: src.windowTransparencyPercent ?? src.WindowTransparencyPercent ?? src.transparencyPercent
  });
  return {
    ...look,
    language: src.language === 'en' || src.Language === 'en' ? 'en' : 'ko',
    windowTransparencyPercent: clampTransparency(
      src.windowTransparencyPercent ?? src.WindowTransparencyPercent ?? look.transparencyPercent
    )
  };
}

function dataDir() {
  return app.getPath('userData');
}

function filePath(name) {
  return path.join(dataDir(), name);
}

function readJson(name, fallback) {
  try {
    const file = filePath(name);
    if (!fs.existsSync(file)) return fallback;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function writeJson(name, value) {
  const file = filePath(name);
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function loadMemos() {
  const raw = readJson('memos.json', []);
  if (!Array.isArray(raw)) return [];
  return raw.filter((item) => typeof item === 'string' && item.trim());
}

function saveMemos(items) {
  const list = Array.isArray(items) ? items.filter((item) => typeof item === 'string') : [];
  writeJson('memos.json', list);
  return list;
}

function loadSettings() {
  return normalizeSettings(readJson('editor_settings.json', null));
}

function saveSettings(data) {
  const next = normalizeSettings({ ...loadSettings(), ...data });
  writeJson('editor_settings.json', next);
  return next;
}

function loadLooksRaw() {
  const raw = readJson('memo_settings.json', []);
  return Array.isArray(raw) ? raw : [];
}

function alignLooks(count) {
  const values = loadLooksRaw().map((item) => (item ? normalizeLook(item) : null));
  while (values.length < count) values.push(null);
  if (values.length > count) values.length = count;
  return values;
}

function getLook(index, memoCount) {
  if (index < 0) {
    const settings = loadSettings();
    return normalizeLook({
      ...settings,
      transparencyPercent: settings.windowTransparencyPercent
    });
  }
  const values = alignLooks(Math.max(memoCount, index + 1));
  return values[index] ? { ...values[index] } : getLook(-1, memoCount);
}

function setLook(index, look, memoCount) {
  if (index < 0 || !look) return;
  const count = Math.max(memoCount, index + 1);
  const values = alignLooks(count);
  values[index] = normalizeLook(look);
  writeJson('memo_settings.json', values);
}

function applyBackColorToAllLooks(color) {
  const hex = colorFromStored(color, DEFAULT_LOOK.editorBackColor);
  const memos = loadMemos();
  const values = alignLooks(memos.length);
  for (let i = 0; i < values.length; i++) {
    const look = values[i] || getLook(-1, memos.length);
    values[i] = normalizeLook({ ...look, editorBackColor: hex, formBackColor: hex });
  }
  writeJson('memo_settings.json', values);
  return hex;
}

function upsertMemo(sourceIndex, sourceMemo, html) {
  if (typeof html !== 'string') return { items: loadMemos(), sourceIndex, sourceMemo, updated: false };
  const plain = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  if (!plain) return { items: loadMemos(), sourceIndex, sourceMemo, updated: false };

  const items = loadMemos();
  let index = Number(sourceIndex);
  let source = sourceMemo;
  let updated = false;
  if (index >= 0 && index < items.length) {
    items[index] = html;
    source = html;
    updated = true;
  } else if (source != null) {
    const found = items.findIndex((m) => m === source);
    if (found >= 0) {
      items[found] = html;
      index = found;
      source = html;
      updated = true;
    } else {
      items.push(html);
      index = items.length - 1;
      source = html;
    }
  } else {
    items.push(html);
    index = items.length - 1;
    source = html;
  }
  saveMemos(items);
  return { items, sourceIndex: index, sourceMemo: source, updated };
}

function removeLookAt(index) {
  if (index < 0) return;
  const values = loadLooksRaw();
  if (index < values.length) {
    values.splice(index, 1);
    writeJson('memo_settings.json', values);
  }
}

module.exports = {
  DEFAULT_LOOK,
  DEFAULT_SETTINGS,
  clampTransparency,
  normalizeLook,
  normalizeSettings,
  loadMemos,
  saveMemos,
  loadSettings,
  saveSettings,
  getLook,
  setLook,
  applyBackColorToAllLooks,
  removeLookAt,
  alignLooks,
  upsertMemo
};
