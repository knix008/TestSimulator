// Writing a page together. While people have a page open, the server keeps its live text: each writer
// sends what they have, with the version they started from, and gets back the merged text. A moment
// after the writing stops the server saves the page into the workspace like any other edit.
import { merge3 } from '../src/domain/diff.js';
import { canSeeSpace } from '../src/domain/teams.js';
import { canEditPage, updatePage, visiblePage } from '../src/domain/wiki.js';

const IDLE = 15_000;
const SAVE_AFTER = 1200;

export function createLive(repository, { saveAfter = SAVE_AFTER } = {}) {
  const docs = new Map();

  function prune(doc) {
    const now = Date.now();
    for (const [userId, at] of doc.editors) if (now - at > IDLE) doc.editors.delete(userId);
  }

  async function persist(pageId) {
    const doc = docs.get(pageId);
    if (!doc) return;
    doc.timer = 0;
    const ws = repository.cached;
    const page = (ws?.articles || []).find((item) => item.id === pageId);
    if (!page || page.trashed) { docs.delete(pageId); return; }
    if (page.body !== doc.text || page.title !== doc.title) {
      try {
        updatePage(ws, pageId, { title: doc.title, body: doc.text }, doc.lastBy, { coalesce: true });
        await repository.writeWorkspace(ws, ws.revision);
      } catch (error) {
        // Someone lost the right to edit, or the database refused: try again with the next change.
        doc.error = error?.message || 'failed';
        return;
      }
    }
    doc.error = '';
    doc.savedRev = doc.rev;
  }

  function saveSoon(pageId) {
    const doc = docs.get(pageId);
    clearTimeout(doc.timer);
    doc.timer = setTimeout(() => { persist(pageId).catch(() => {}); }, saveAfter);
  }

  /**
   * One writer's turn: `{ pageId, rev, base, text, baseTitle, title }` — `base` is the text at `rev` as
   * the writer last had it. Returns the live text, its rev, who else is writing, and whether it is saved.
   */
  function sync(user, input) {
    const ws = repository.cached;
    const page = (ws?.articles || []).find((item) => item.id === input?.pageId);
    if (!page || page.trashed) throw new Error('not-found');
    const space = (ws.spaces || []).find((item) => item.id === page.spaceId);
    if (!canSeeSpace(ws, space, user.id) || !visiblePage(page, user.id)) throw new Error('permission');
    const writer = canEditPage(page, user.id);
    let doc = docs.get(page.id);
    if (doc) prune(doc);
    // Nobody writing and everything saved: start again from the stored page (it may have changed since).
    if (!doc || (!doc.editors.size && doc.savedRev === doc.rev && !doc.timer)) {
      doc = { rev: 1, text: page.body || '', title: page.title || '', savedRev: 1, editors: new Map(), lastBy: '', timer: 0, error: '' };
      docs.set(page.id, doc);
    }
    if (writer && typeof input.text === 'string') {
      const base = typeof input.base === 'string' ? input.base : doc.text;
      const text = Number(input.rev) === doc.rev ? input.text : merge3(base, input.text, doc.text).text;
      const titleChanged = typeof input.title === 'string' && input.title.trim() && input.title !== input.baseTitle;
      if (text !== doc.text || (titleChanged && input.title.trim() !== doc.title)) {
        doc.text = text;
        if (titleChanged) doc.title = input.title.trim();
        doc.rev += 1;
        doc.lastBy = user.id;
        saveSoon(page.id);
      }
    }
    if (writer) doc.editors.set(user.id, Date.now());
    const names = new Map((ws.users || []).map((item) => [item.id, item.name]));
    return {
      rev: doc.rev,
      text: doc.text,
      title: doc.title,
      saved: doc.savedRev === doc.rev,
      error: doc.error,
      revision: repository.cached?.revision || 0,
      editors: [...doc.editors.keys()].map((id) => ({ id, name: names.get(id) || '' })),
    };
  }

  /** A writer closes the page; what they wrote is saved at once. */
  async function leave(user, pageId) {
    const doc = docs.get(pageId);
    if (!doc) return { left: true };
    doc.editors.delete(user.id);
    if (doc.savedRev !== doc.rev) {
      clearTimeout(doc.timer);
      await persist(pageId);
    }
    return { left: true, saved: doc.savedRev === doc.rev };
  }

  /** Saves everything still waiting (when the server stops). */
  async function flush() {
    for (const [pageId, doc] of docs) {
      if (doc.savedRev !== doc.rev) { clearTimeout(doc.timer); await persist(pageId); }
    }
  }

  return { sync, leave, flush, docs };
}
