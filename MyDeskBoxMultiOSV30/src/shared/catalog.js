'use strict';

// 처음 실행할 때 바탕화면 항목을 종류별로 나눈다.
// 빈 종류는 박스를 만들지 않는다.

const ORDER = ['folder', 'shortcut', 'document', 'media', 'system', 'other'];

const THEME = {
  folder: 'teal',
  shortcut: 'ocean',
  document: 'gold',
  media: 'sunset',
  system: 'night',
  other: 'steel',
};

const DOCS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.rtf', '.csv', '.md', '.hwp', '.hwpx', '.odt', '.ods',
]);

const MEDIA = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg',
  '.mp4', '.mov', '.mkv', '.avi', '.mp3', '.wav', '.flac',
]);

function kindOf(file) {
  if (!file) return 'other';
  if (file.shell || String(file.path || '').startsWith('shell:')) return 'system';
  if (file.directory) return 'folder';
  const ext = extOf(file.name || file.path);
  if (ext === '.lnk' || ext === '.url' || ext === '.desktop') return 'shortcut';
  if (DOCS.has(ext)) return 'document';
  if (MEDIA.has(ext)) return 'media';
  return 'other';
}

function extOf(name) {
  const base = String(name || '');
  const dot = base.lastIndexOf('.');
  return dot < 0 ? '' : base.slice(dot).toLowerCase();
}

function groupItems(files, shellItems) {
  const groups = {
    folder: [], shortcut: [], document: [], media: [], system: [], other: [],
  };
  for (const file of files || []) {
    groups[kindOf(file)].push({ name: file.name, path: file.path });
  }
  for (const item of shellItems || []) {
    groups.system.push({ name: item.name, path: item.path });
  }
  return groups;
}

// area 는 작업 표시줄을 뺀 화면. 박스는 오른쪽부터 아래로 쌓고, 넘치면 왼쪽으로 한 칸 간다.
function planFences(files, shellItems, area, titleOf) {
  const groups = groupItems(files, shellItems);
  const width = 280;
  const gap = 16;
  const margin = 24;
  const bounds = area || { x: 0, y: 0, width: 1280, height: 800 };
  let x = bounds.x + bounds.width - width - margin;
  let y = bounds.y + margin;
  const made = [];
  for (const kind of ORDER) {
    const items = groups[kind];
    if (!items.length) continue;
    const cols = 2;
    const rows = Math.ceil(items.length / cols);
    const height = Math.min(560, Math.max(200, 48 + rows * 96));
    if (y + height > bounds.y + bounds.height - margin && made.length) {
      x -= width + gap;
      y = bounds.y + margin;
    }
    made.push({
      id: `start-${kind}`,
      title: titleOf(kind),
      x: Math.round(x),
      y: Math.round(y),
      w: width,
      h: height,
      theme: THEME[kind],
      items,
    });
    y += height + gap;
  }
  return made;
}

const api = { ORDER, kindOf, groupItems, planFences };
const root = typeof globalThis !== 'undefined' ? globalThis : this;
root.DeskCatalog = api;
if (typeof module === 'object' && module.exports) module.exports = api;
