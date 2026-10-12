// Attachment contents, kept apart from the boards.
//
// A card lists its attachments (id, name, size, type, thumbnail); the file
// contents ("data:<mime>;base64,…") are stored here by id. They never change,
// so undo/redo snapshots stay small and duplicated or pasted cards can share
// them. When a board is saved, the contents of the attachments it uses are
// written next to it (board file, project file or database row).
import { allCards, newId } from './board.js';

/** Largest file that can be attached (contents travel inside the board file). */
export const MAX_ATTACHMENT = 50 * 1024 * 1024;

export class AttachmentStore {
  constructor() {
    this.items = new Map();
  }

  add(data) {
    const id = newId('att');
    this.items.set(id, data);
    return id;
  }

  get(id) {
    return this.items.get(id) ?? null;
  }

  has(id) {
    return this.items.has(id);
  }

  /** Takes in the contents read from a file / database. */
  merge(contents = {}) {
    for (const [id, data] of Object.entries(contents)) if (typeof data === 'string' && data.startsWith('data:')) this.items.set(id, data);
  }

  /** Contents of every attachment the boards use (for saving). */
  collect(...boards) {
    const out = {};
    for (const board of boards) {
      for (const card of allCards(board)) {
        for (const item of card.attachments ?? []) {
          const data = this.items.get(item.id);
          if (data) out[item.id] = data;
        }
      }
    }
    return out;
  }
}

export const attachmentIds = (board) => allCards(board).flatMap((card) => (card.attachments ?? []).map((item) => item.id));

/** "data:<mime>;base64,<payload>" → { type, base64 } */
export function splitDataUrl(dataUrl) {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl ?? '');
  if (!match) return null;
  return { type: match[1] || 'application/octet-stream', base64: match[2] ? match[3] : btoa(decodeURIComponent(match[3])) };
}

export const toDataUrl = (type, base64) => `data:${type || 'application/octet-stream'};base64,${base64}`;

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
  avif: 'image/avif', ico: 'image/x-icon', pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json',
  zip: 'application/zip', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  hwp: 'application/x-hwp', mp3: 'audio/mpeg', mp4: 'video/mp4', html: 'text/html',
};

export function mimeFor(name, fallback = '') {
  const extension = String(name).split('.').pop().toLowerCase();
  return MIME[extension] ?? (fallback || 'application/octet-stream');
}

/** Icon name for an attachment type. */
export function attachmentIcon(type) {
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('text/') || type === 'application/json') return 'list';
  if (type === 'application/pdf') return 'file';
  return 'paperclip';
}
