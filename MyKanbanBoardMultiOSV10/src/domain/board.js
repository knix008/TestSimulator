import { sanitize, toPlain } from './markup.js';

// Board model: columns holding cards. Every operation here mutates the board
// it is given; the document layer (domain/document.js) snapshots the board
// before each operation, which is what undo/redo restores.

export const CARD_COLORS = ['none', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'gray'];
export const COLOR_HEX = {
  none: 'transparent', red: '#e5484d', orange: '#f76b15', yellow: '#f5c518', green: '#30a46c',
  teal: '#12a594', blue: '#3e63dd', purple: '#8e4ec6', pink: '#d6409f', gray: '#8b8d98',
};
export const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'];

/** Pastel background colours for columns (plus "none" and a custom colour). */
export const PASTELS = [
  { hex: '#ffd6d6', ko: '파스텔 빨강', en: 'Pastel red' }, { hex: '#ffe0cc', ko: '살구', en: 'Apricot' },
  { hex: '#ffeec2', ko: '파스텔 주황', en: 'Pastel orange' }, { hex: '#fff7c2', ko: '레몬', en: 'Lemon' },
  { hex: '#eef7c8', ko: '연두', en: 'Light lime' }, { hex: '#d7f4d2', ko: '파스텔 초록', en: 'Pastel green' },
  { hex: '#c9f0e1', ko: '민트', en: 'Mint' }, { hex: '#c8eff2', ko: '아쿠아', en: 'Aqua' },
  { hex: '#cfe8ff', ko: '하늘', en: 'Sky' }, { hex: '#d6e0ff', ko: '파스텔 파랑', en: 'Pastel blue' },
  { hex: '#e0d9ff', ko: '라벤더', en: 'Lavender' }, { hex: '#ecdcff', ko: '라일락', en: 'Lilac' },
  { hex: '#f6d8f2', ko: '오키드', en: 'Orchid' }, { hex: '#ffd9e8', ko: '파스텔 분홍', en: 'Pastel pink' },
  { hex: '#f6e3d3', ko: '베이지', en: 'Beige' }, { hex: '#ebe4d6', ko: '샌드', en: 'Sand' },
  { hex: '#e4e7eb', ko: '파스텔 회색', en: 'Pastel grey' }, { hex: '#dbe6ee', ko: '안개', en: 'Mist' },
  { hex: '#e2f0d0', ko: '세이지', en: 'Sage' }, { hex: '#fde4c8', ko: '피치', en: 'Peach' },
];

const HEX = /^#[0-9a-f]{6}$/i;

/** Card templates offered in the left tool panel. */
export const TEMPLATES = {
  task: { color: 'blue', priority: 'medium', tags: ['task'] },
  bug: { color: 'red', priority: 'high', tags: ['bug'] },
  feature: { color: 'green', priority: 'medium', tags: ['feature'] },
  idea: { color: 'yellow', priority: 'low', tags: ['idea'] },
};

let sequence = 0;
export function newId(prefix) {
  sequence = (sequence + 1) % 1679616;
  return `${prefix}-${Date.now().toString(36)}${sequence.toString(36).padStart(4, '0')}${Math.random().toString(36).slice(2, 6)}`;
}

const now = () => new Date().toISOString();

export function createCard(data = {}) {
  const stamp = now();
  return {
    id: data.id ?? newId('card'),
    title: String(data.title ?? '').slice(0, 500),
    description: String(data.description ?? (data.descriptionHtml ? toPlain(data.descriptionHtml) : '')),
    descriptionHtml: data.descriptionHtml ? sanitize(data.descriptionHtml) : '',
    color: CARD_COLORS.includes(data.color) ? data.color : 'none',
    priority: PRIORITIES.includes(data.priority) ? data.priority : 'none',
    tags: normalizeTags(data.tags),
    assignee: String(data.assignee ?? ''),
    due: /^\d{4}-\d{2}-\d{2}$/.test(data.due ?? '') ? data.due : '',
    attachments: Array.isArray(data.attachments) ? data.attachments.filter((item) => item && typeof item.id === 'string').map(normalizeAttachment) : [],
    checklist: Array.isArray(data.checklist)
      ? data.checklist.map((item) => ({ id: item.id ?? newId('chk'), text: String(item.text ?? ''), done: Boolean(item.done) }))
      : [],
    created: data.created ?? stamp,
    updated: data.updated ?? stamp,
  };
}

/** Attachment metadata on a card (the contents are kept by id, see attachments.js). */
export function normalizeAttachment(item) {
  return {
    id: item.id,
    name: String(item.name ?? 'file').slice(0, 260),
    size: Math.max(0, Number(item.size) || 0),
    type: String(item.type ?? 'application/octet-stream'),
    thumb: typeof item.thumb === 'string' && item.thumb.startsWith('data:image/') ? item.thumb : '',
    width: Number(item.width) || 0,
    height: Number(item.height) || 0,
    added: item.added ?? new Date().toISOString(),
  };
}

export const isImageAttachment = (item) => /^image\//.test(item.type);

export function createColumn(data = {}) {
  return {
    id: data.id ?? newId('col'),
    title: String(data.title ?? '').slice(0, 200),
    color: CARD_COLORS.includes(data.color) ? data.color : 'none',
    wip: Number.isInteger(data.wip) && data.wip > 0 ? data.wip : 0,
    background: HEX.test(data.background ?? '') ? data.background.toLowerCase() : '',
    bgOpacity: Number.isFinite(Number(data.bgOpacity)) && data.bgOpacity !== null && data.bgOpacity !== '' ? Math.min(100, Math.max(0, Math.round(Number(data.bgOpacity)))) : 100,
    cards: Array.isArray(data.cards) ? data.cards.map(createCard) : [],
  };
}

export function createBoard({ title = 'Board', columns = ['To do', 'Doing', 'Done'], description = '' } = {}) {
  const stamp = now();
  return {
    id: newId('board'),
    title,
    description,
    created: stamp,
    updated: stamp,
    columns: columns.map((column) => createColumn(typeof column === 'string' ? { title: column } : column)),
  };
}

export function normalizeTags(tags) {
  const list = Array.isArray(tags) ? tags : String(tags ?? '').split(',');
  const seen = new Set();
  return list.map((tag) => String(tag).trim()).filter((tag) => tag && !seen.has(tag.toLowerCase()) && seen.add(tag.toLowerCase()));
}

// ───────────────────────── queries

export const findColumn = (board, columnId) => board.columns.find((column) => column.id === columnId) ?? null;

export function findCard(board, cardId) {
  for (const column of board.columns) {
    const index = column.cards.findIndex((card) => card.id === cardId);
    if (index >= 0) return { column, card: column.cards[index], index };
  }
  return null;
}

export const allCards = (board) => board.columns.flatMap((column) => column.cards);

export function isOverdue(card, today = new Date().toISOString().slice(0, 10)) {
  return Boolean(card.due) && card.due < today;
}

export function stats(board, today) {
  const cards = allCards(board);
  const lastColumn = board.columns.at(-1);
  return {
    columns: board.columns.length,
    cards: cards.length,
    done: lastColumn ? lastColumn.cards.length : 0,
    overdue: cards.filter((card) => isOverdue(card, today)).length,
    overWip: board.columns.filter((column) => column.wip > 0 && column.cards.length > column.wip).length,
  };
}

export const allTags = (board) => [...new Set(allCards(board).flatMap((card) => card.tags))].sort((a, b) => a.localeCompare(b));

/** Does the card pass the left panel's filter? */
export function matchesFilter(card, filter = {}, today) {
  const text = (filter.text ?? '').trim().toLowerCase();
  if (text) {
    const haystack = [card.title, card.description, card.assignee, ...card.tags, ...card.checklist.map((item) => item.text), ...(card.attachments ?? []).map((item) => item.name)].join('\n').toLowerCase();
    if (!haystack.includes(text)) return false;
  }
  if (filter.priority && filter.priority !== 'all' && card.priority !== filter.priority) return false;
  if (filter.color && filter.color !== 'all' && card.color !== filter.color) return false;
  if (filter.tag && filter.tag !== 'all' && !card.tags.includes(filter.tag)) return false;
  if (filter.overdue && !isOverdue(card, today)) return false;
  return true;
}

export const filterActive = (filter = {}) =>
  Boolean((filter.text ?? '').trim() || (filter.priority && filter.priority !== 'all') || (filter.color && filter.color !== 'all') || (filter.tag && filter.tag !== 'all') || filter.overdue);

// ───────────────────────── operations (mutating)

const touch = (board) => { board.updated = now(); };
const clampIndex = (index, length) => (Number.isInteger(index) ? Math.max(0, Math.min(index, length)) : length);

export function addColumn(board, data = {}, index) {
  const column = createColumn(data);
  board.columns.splice(clampIndex(index, board.columns.length), 0, column);
  touch(board);
  return column;
}

export function updateColumn(board, columnId, patch) {
  const column = findColumn(board, columnId);
  if (!column) throw new Error(`column ${columnId} not found`);
  if ('title' in patch) column.title = String(patch.title).slice(0, 200);
  if ('color' in patch && CARD_COLORS.includes(patch.color)) column.color = patch.color;
  if ('wip' in patch) column.wip = Math.max(0, Math.floor(Number(patch.wip) || 0));
  if ('background' in patch) column.background = HEX.test(patch.background ?? '') ? patch.background.toLowerCase() : '';
  if ('bgOpacity' in patch) column.bgOpacity = Math.min(100, Math.max(0, Math.round(Number(patch.bgOpacity) || 0)));
  touch(board);
  return column;
}

export function removeColumn(board, columnId) {
  const index = board.columns.findIndex((column) => column.id === columnId);
  if (index < 0) return null;
  const [removed] = board.columns.splice(index, 1);
  touch(board);
  return removed;
}

export function moveColumn(board, columnId, toIndex) {
  const from = board.columns.findIndex((column) => column.id === columnId);
  if (from < 0) return false;
  const [column] = board.columns.splice(from, 1);
  board.columns.splice(clampIndex(toIndex, board.columns.length), 0, column);
  touch(board);
  return from !== board.columns.indexOf(column);
}

export function addCard(board, columnId, data = {}, index) {
  const column = findColumn(board, columnId) ?? board.columns[0];
  if (!column) throw new Error('the board has no column');
  const card = createCard(data);
  column.cards.splice(clampIndex(index, column.cards.length), 0, card);
  touch(board);
  return card;
}

export function updateCard(board, cardId, patch) {
  const found = findCard(board, cardId);
  if (!found) throw new Error(`card ${cardId} not found`);
  const { card } = found;
  for (const key of ['title', 'description', 'assignee']) if (key in patch) card[key] = String(patch[key] ?? '');
  if ('descriptionHtml' in patch) {
    card.descriptionHtml = patch.descriptionHtml ? sanitize(patch.descriptionHtml) : '';
    if (!('description' in patch)) card.description = toPlain(card.descriptionHtml);
  } else if ('description' in patch) card.descriptionHtml = '';
  if ('color' in patch && CARD_COLORS.includes(patch.color)) card.color = patch.color;
  if ('priority' in patch && PRIORITIES.includes(patch.priority)) card.priority = patch.priority;
  if ('tags' in patch) card.tags = normalizeTags(patch.tags);
  if ('due' in patch) card.due = /^\d{4}-\d{2}-\d{2}$/.test(patch.due ?? '') ? patch.due : '';
  if ('checklist' in patch) card.checklist = createCard({ checklist: patch.checklist }).checklist;
  if ('attachments' in patch) card.attachments = createCard({ attachments: patch.attachments }).attachments;
  card.updated = now();
  touch(board);
  return card;
}

export function removeCards(board, cardIds) {
  const ids = new Set(cardIds);
  let removed = 0;
  for (const column of board.columns) {
    const before = column.cards.length;
    column.cards = column.cards.filter((card) => !ids.has(card.id));
    removed += before - column.cards.length;
  }
  if (removed) touch(board);
  return removed;
}

/** Moves a card to `toIndex` of the target column (index counted without the card itself). */
export function moveCard(board, cardId, toColumnId, toIndex) {
  const found = findCard(board, cardId);
  const target = findColumn(board, toColumnId);
  if (!found || !target) return false;
  found.column.cards.splice(found.index, 1);
  const index = clampIndex(toIndex, target.cards.length);
  target.cards.splice(index, 0, found.card);
  touch(board);
  return found.column !== target || found.index !== index;
}

/** Inserts copies of `cards` (fresh ids) into a column; returns the new cards. */
export function insertCards(board, columnId, cards, index) {
  const column = findColumn(board, columnId) ?? board.columns[0];
  if (!column) throw new Error('the board has no column');
  const stamp = now();
  // Attachment ids stay: contents are immutable and shared by copies.
  const copies = cards.map((card) => createCard({ ...card, id: undefined, created: stamp, updated: stamp, checklist: (card.checklist ?? []).map((item) => ({ ...item, id: undefined })) }));
  column.cards.splice(clampIndex(index, column.cards.length), 0, ...copies);
  touch(board);
  return copies;
}

export function duplicateCards(board, cardIds) {
  const copies = [];
  for (const id of cardIds) {
    const found = findCard(board, id);
    if (found) copies.push(...insertCards(board, found.column.id, [found.card], found.index + 1));
  }
  return copies;
}

/** Moves the card one column left (-1) or right (+1). */
export function shiftCard(board, cardId, direction) {
  const found = findCard(board, cardId);
  if (!found) return false;
  const index = board.columns.indexOf(found.column) + direction;
  if (index < 0 || index >= board.columns.length) return false;
  return moveCard(board, cardId, board.columns[index].id, board.columns[index].cards.length);
}

export function clearColumn(board, columnId) {
  const column = findColumn(board, columnId);
  if (!column) return 0;
  const count = column.cards.length;
  column.cards = [];
  if (count) touch(board);
  return count;
}

export function sortColumn(board, columnId, key) {
  const column = findColumn(board, columnId);
  if (!column) return;
  const rank = (card) => {
    if (key === 'priority') return -PRIORITIES.indexOf(card.priority);
    if (key === 'due') return card.due || '9999-99-99';
    return card.title.toLowerCase();
  };
  column.cards.sort((a, b) => {
    const left = rank(a);
    const right = rank(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  touch(board);
}
