import { writingEmbed, writingExport } from './markdown.js';
import { deliver, inboxPush, setNotice } from './notices.js';
import { canSeeSpace } from './teams.js';
import { nowIso, uid } from './util.js';

function projectOf(ws, projectId) {
  return (ws.projects || []).find((item) => item.id === projectId) || null;
}

function spaceKey(ws, projectId) {
  const base = projectOf(ws, projectId)?.key || 'COMPANY';
  if (!(ws.spaces || []).some((item) => item.key === base)) return base;
  let n = 2;
  while (ws.spaces.some((item) => item.key === `${base}${n}`)) n += 1;
  return `${base}${n}`.slice(0, 10);
}

function makeSpace(ws, projectId, actorId = '') {
  const project = projectOf(ws, projectId);
  const space = {
    id: uid('sp'),
    key: spaceKey(ws, projectId),
    name: project?.name || '회사 공용',
    projectId: projectId || '',
    scope: projectId ? 'project' : 'company',
    description: '',
    authorId: actorId || '',
    updated: nowIso(),
  };
  ws.spaces.push(space);
  return space;
}

function normalize(page) {
  page.parentId = page.parentId || '';
  page.spaceId = page.spaceId || '';
  page.labels = Array.isArray(page.labels) ? page.labels : [];
  page.comments = Array.isArray(page.comments) ? page.comments : [];
  page.watchers = Array.isArray(page.watchers) ? page.watchers : [];
  page.versions = Array.isArray(page.versions) ? page.versions : [];
  page.kind = ['blog', 'board', 'table'].includes(page.kind) ? page.kind : 'page';
  page.restricted = Boolean(page.restricted);
  page.status = ['draft', 'review', 'current'].includes(page.status) ? page.status : 'current';
  page.trashed = Boolean(page.trashed);
  page.likes = Array.isArray(page.likes) ? page.likes : [];
  page.attachments = Array.isArray(page.attachments) ? page.attachments : [];
  page.editors = Array.isArray(page.editors) ? page.editors : [];
  page.readers = Array.isArray(page.readers) ? page.readers : [];
  page.views = Number(page.views) || 0;
  page.shareToken = page.shareToken || '';
  page.editorId = page.editorId || '';
  page.editorAt = page.editorAt || '';
  page.shapes = Array.isArray(page.shapes) ? page.shapes : [];
  page.columns = Array.isArray(page.columns) ? page.columns : [];
  page.rows = Array.isArray(page.rows) ? page.rows : [];
  return page;
}

export function ensureWiki(ws) {
  ws.articles = Array.isArray(ws.articles) ? ws.articles : [];
  ws.spaces = Array.isArray(ws.spaces) ? ws.spaces : [];
  for (const page of ws.articles) normalize(page);
  const loose = new Map();
  for (const page of ws.articles) {
    if (page.spaceId && ws.spaces.some((space) => space.id === page.spaceId)) continue;
    const projectId = page.projectId || '';
    if (!loose.has(projectId)) loose.set(projectId, []);
    loose.get(projectId).push(page);
  }
  for (const [projectId, pages] of loose) {
    const space = ws.spaces.find((item) => (item.projectId || '') === projectId) || makeSpace(ws, projectId);
    for (const page of pages) page.spaceId = space.id;
  }
  if (!ws.spaces.length) makeSpace(ws, ws.activeProjectId || ws.projects?.[0]?.id || '');
  return ws;
}

export function visiblePage(page, userId) {
  if (!page || page.trashed) return false;
  const editor = page.authorId === userId || (page.editors || []).includes(userId);
  if (page.status === 'draft' && !editor) return false;
  if (!page.restricted) return true;
  return editor || (page.readers || []).includes(userId);
}

export function canEditPage(page, userId) {
  if (!page || page.trashed) return false;
  if (page.authorId === userId) return true;
  if (page.restricted || (page.editors || []).length) return (page.editors || []).includes(userId);
  return visiblePage(page, userId);
}

/** A free workspace key made from the name's Latin letters, or WS, WS2, WS3 … when it has none. */
export function suggestSpaceKey(ws, name) {
  const letters = String(name || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^[0-9]+/, '');
  const base = (letters.length >= 2 ? letters : 'WS').slice(0, 8);
  const taken = new Set((ws.spaces || []).map((item) => item.key));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const key = `${base}${n}`.slice(0, 10);
    if (!taken.has(key)) return key;
  }
  return uid('WS').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
}

export function addSpace(ws, input, actorId) {
  ensureWiki(ws);
  const name = String(input.name || '').trim();
  if (!name) throw new Error('name-required');
  const key = String(input.key || '').trim().toUpperCase() || suggestSpaceKey(ws, name);
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(key)) throw new Error('key-invalid');
  if (ws.spaces.some((item) => item.key === key)) throw new Error('duplicate-key');
  const space = {
    id: uid('sp'), key, name, projectId: input.projectId || '', teamId: input.teamId || '',
    scope: input.teamId ? 'team' : (input.projectId ? 'project' : 'company'),
    description: String(input.description || ''), authorId: actorId || '', updated: nowIso(),
  };
  ws.spaces.push(space);
  return space;
}

function mustSpace(ws, spaceId) {
  ensureWiki(ws);
  const space = ws.spaces.find((item) => item.id === spaceId);
  if (!space) throw new Error('not-found');
  return space;
}

/** Renames a workspace or changes its description: its maker or an administrator. */
export function updateSpace(ws, spaceId, patch, actorId, admin = false) {
  const space = mustSpace(ws, spaceId);
  if (!admin && space.authorId !== actorId) throw new Error('permission');
  if (patch.name != null) {
    const name = String(patch.name).trim();
    if (!name) throw new Error('name-required');
    space.name = name;
  }
  if (patch.description != null) space.description = String(patch.description);
  if (patch.where != null) {
    const where = String(patch.where);
    const [kind, id] = where.includes(':') ? where.split(':') : ['company', ''];
    if (kind === 'team') {
      if (!(ws.teams || []).some((team) => team.id === id)) throw new Error('not-found');
      Object.assign(space, { scope: 'team', teamId: id, projectId: '' });
    } else if (kind === 'project') {
      if (!(ws.projects || []).some((project) => project.id === id)) throw new Error('not-found');
      Object.assign(space, { scope: 'project', projectId: id, teamId: '' });
    } else Object.assign(space, { scope: 'company', teamId: '', projectId: '' });
    for (const page of ws.articles) if (page.spaceId === space.id) page.projectId = space.projectId || '';
  }
  space.updated = nowIso();
  return space;
}

/** Removes a workspace that holds no pages (pages in the trash count until they are deleted). */
export function deleteSpace(ws, spaceId, actorId, admin = false) {
  const space = mustSpace(ws, spaceId);
  if (!admin && space.authorId !== actorId) throw new Error('permission');
  if (ws.articles.some((page) => page.spaceId === space.id)) throw new Error('space-not-empty');
  ws.spaces = ws.spaces.filter((item) => item.id !== space.id);
}

function spaceFor(ws, input) {
  if (input.spaceId) {
    const chosen = ws.spaces.find((item) => item.id === input.spaceId);
    if (!chosen) throw new Error('not-found');
    return chosen;
  }
  const projectId = input.projectId || '';
  if (projectId) return ws.spaces.find((item) => item.projectId === projectId) || makeSpace(ws, projectId, input.authorId);
  return ws.spaces[0] || makeSpace(ws, '');
}

function cleanLabel(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '-').slice(0, 32);
}

export function addPage(ws, input, actorId) {
  ensureWiki(ws);
  const title = String(input.title || '').trim();
  if (!title) throw new Error('name-required');
  const space = spaceFor(ws, input);
  const parentId = input.parentId || '';
  if (input.kind === 'blog' && parentId) throw new Error('parent-required');
  if (parentId) {
    const parent = ws.articles.find((item) => item.id === parentId);
    if (!parent || parent.spaceId !== space.id || parent.kind === 'blog') throw new Error('parent-required');
  }
  const page = normalize({
    id: uid('kb'),
    spaceId: space.id,
    projectId: space.projectId || input.projectId || '',
    parentId,
    title,
    body: String(input.body || ''),
    published: input.published !== false,
    authorId: actorId || '',
    updated: nowIso(),
    kind: ['blog', 'board', 'table'].includes(input.kind) ? input.kind : 'page',
    status: ['draft', 'review', 'current'].includes(input.status) ? input.status : 'current',
    labels: Array.isArray(input.labels) ? input.labels.map(cleanLabel).filter(Boolean) : [],
    restricted: Boolean(input.restricted),
    comments: [],
    watchers: actorId ? [actorId] : [],
    versions: [],
  });
  ws.articles.unshift(page);
  return page;
}

function mustPage(ws, pageId) {
  ensureWiki(ws);
  const page = ws.articles.find((item) => item.id === pageId);
  if (!page) throw new Error('not-found');
  return page;
}

function descendants(ws, pageId) {
  const out = [];
  const walk = (id) => {
    for (const child of ws.articles.filter((item) => item.parentId === id)) {
      out.push(child);
      walk(child.id);
    }
  };
  walk(pageId);
  return out;
}

function tell(ws, page, actorId, event) {
  const space = ws.spaces.find((item) => item.id === page.spaceId);
  const project = projectOf(ws, space?.projectId);
  const kind = event === 'comment' ? 'page-comment' : 'page';
  if (project) {
    deliver(ws, project, page.watchers, { actorId, issueId: '', issueKey: page.title, kind }, { pageId: page.id, event });
    return;
  }
  // A company or team page has no project, so its watchers hear about it in the company inbox.
  const readers = (page.watchers || []).filter((userId) => canSeeSpace(ws, space, userId) && visiblePage(page, userId));
  inboxPush(ws, readers, { actorId, issueId: '', issueKey: page.title, kind, pageId: page.id, spaceId: page.spaceId });
}

/** The people named as @Name in a text (the longest names first, so "Kim Ann" wins over "Kim"). */
export function mentionsIn(ws, text) {
  const source = String(text || '');
  if (!source.includes('@')) return [];
  const users = (ws.users || []).filter((user) => user.active !== false && user.name).sort((a, b) => b.name.length - a.name.length);
  const found = [];
  let rest = source;
  for (const user of users) {
    const tag = `@${user.name}`;
    if (rest.includes(tag)) {
      found.push(user.id);
      rest = rest.split(tag).join(' ');
    }
  }
  return found;
}

/** Tells the people mentioned on a page who can see it; returns their ids. */
function tellMentioned(ws, page, ids, actorId, where) {
  const space = ws.spaces.find((item) => item.id === page.spaceId);
  const readers = ids.filter((userId) => userId !== actorId && canSeeSpace(ws, space, userId) && visiblePage(page, userId));
  inboxPush(ws, readers, { actorId, issueId: '', issueKey: page.title, kind: 'mention', where, pageId: page.id, spaceId: page.spaceId });
  return readers;
}

/**
 * Changes a page. Each change keeps the text before it as a version — except that with `coalesce`
 * (the editor saving by itself) one person's saves within ten minutes stay one version, and the
 * watchers hear about that run of edits once.
 */
export function updatePage(ws, pageId, patch, actorId, { coalesce = false } = {}) {
  const page = mustPage(ws, pageId);
  if (!canEditPage(page, actorId)) throw new Error('permission');
  const title = patch.title != null ? String(patch.title).trim() : page.title;
  if (!title) throw new Error('name-required');
  const body = patch.body != null ? String(patch.body) : page.body;
  if (title !== page.title || body !== page.body) {
    const before = new Set(mentionsIn(ws, page.body));
    const sameRun = coalesce && page.lastEditBy === actorId && Date.now() - Date.parse(page.lastEditAt || 0) < 600_000;
    if (!sameRun) {
      page.versions.unshift({ id: uid('pv'), title: page.title, body: page.body, authorId: actorId || '', at: nowIso() });
      if (page.versions.length > 30) page.versions.length = 30;
    }
    page.lastEditBy = actorId || '';
    page.lastEditAt = nowIso();
    page.title = title;
    page.body = body;
    if (!sameRun) tell(ws, page, actorId, 'edit');
    tellMentioned(ws, page, mentionsIn(ws, body).filter((id) => !before.has(id)), actorId, 'page');
  }
  if (patch.published != null) page.published = Boolean(patch.published);
  if (patch.restricted != null) {
    if (page.authorId !== actorId) throw new Error('permission');
    page.restricted = Boolean(patch.restricted);
  }
  if (patch.labels != null) {
    const raw = Array.isArray(patch.labels) ? patch.labels : String(patch.labels).split(/[,\s]+/);
    page.labels = raw.map(cleanLabel).filter(Boolean);
  }
  page.updated = nowIso();
  return page;
}

export function movePage(ws, pageId, parentId, actorId) {
  const page = mustPage(ws, pageId);
  if (page.kind === 'blog') throw new Error('parent-required');
  if (!canEditPage(page, actorId)) throw new Error('permission');
  if (!parentId) {
    page.parentId = '';
    page.updated = nowIso();
    return page;
  }
  if (parentId === pageId) throw new Error('parent-required');
  const parent = mustPage(ws, parentId);
  if (parent.spaceId !== page.spaceId || parent.kind === 'blog') throw new Error('parent-required');
  if (descendants(ws, pageId).some((item) => item.id === parentId)) throw new Error('parent-required');
  page.parentId = parentId;
  page.updated = nowIso();
  return page;
}

export function deletePage(ws, pageId, actorId) {
  const page = mustPage(ws, pageId);
  if (!canEditPage(page, actorId)) throw new Error('permission');
  page.trashed = true;
  page.updated = nowIso();
  return page;
}

export function restoreTrashed(ws, pageId, actorId) {
  const page = mustPage(ws, pageId);
  if (!page.trashed) throw new Error('not-found');
  if (page.authorId !== actorId && !(page.editors || []).includes(actorId)) throw new Error('permission');
  page.trashed = false;
  page.updated = nowIso();
  return page;
}

export function purgePage(ws, pageId, actorId) {
  const page = mustPage(ws, pageId);
  if (!page.trashed || (page.authorId !== actorId && !(page.editors || []).includes(actorId))) throw new Error('permission');
  ws.articles = ws.articles.filter((item) => item.id !== pageId);
}

/**
 * Adds a comment. `quote` is a passage of the page; with `inline` the comment is tied to that passage
 * in the text (shown highlighted there) until someone resolves it.
 */
export function commentPage(ws, pageId, body, actorId, quote = '', { inline = false, replyTo = '' } = {}) {
  const page = mustPage(ws, pageId);
  if (!visiblePage(page, actorId)) throw new Error('permission');
  const text = String(body || '').trim();
  if (!text) throw new Error('summary-required');
  const passage = String(quote || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (inline && !passage) throw new Error('summary-required');
  const parent = replyTo ? page.comments.find((item) => item.id === replyTo) : null;
  if (replyTo && !parent) throw new Error('not-found');
  const comment = { id: uid('pc'), authorId: actorId || '', body: text, quote: parent ? '' : passage, created: nowIso() };
  if (inline && !parent) { comment.inline = true; comment.resolved = false; }
  if (parent) comment.replyTo = parent.id;
  page.comments.push(comment);
  page.updated = nowIso();
  tell(ws, page, actorId, 'comment');
  tellMentioned(ws, page, mentionsIn(ws, text), actorId, 'comment');
  return comment;
}

/** Marks an inline comment resolved (its highlight goes away) or opens it again. Anyone who can edit the page, or its writer. */
export function resolvePageComment(ws, pageId, commentId, resolved, actorId) {
  const page = mustPage(ws, pageId);
  const comment = (page.comments || []).find((item) => item.id === commentId);
  if (!comment || !comment.inline) throw new Error('not-found');
  if (comment.authorId !== actorId && !canEditPage(page, actorId)) throw new Error('permission');
  comment.resolved = Boolean(resolved);
  comment.resolvedBy = resolved ? actorId : '';
  comment.resolvedAt = resolved ? nowIso() : '';
  return comment;
}

export function editPageComment(ws, pageId, commentId, body, actorId) {
  const page = mustPage(ws, pageId);
  const comment = (page.comments || []).find((item) => item.id === commentId);
  if (!comment) throw new Error('not-found');
  if (comment.authorId !== actorId) throw new Error('permission');
  const text = String(body || '').trim();
  if (!text) throw new Error('summary-required');
  comment.body = text;
  comment.edited = nowIso();
  return comment;
}

export function deletePageComment(ws, pageId, commentId, actorId) {
  const page = mustPage(ws, pageId);
  const comment = (page.comments || []).find((item) => item.id === commentId);
  if (!comment) throw new Error('not-found');
  if (comment.authorId !== actorId && page.authorId !== actorId) throw new Error('permission');
  page.comments = page.comments.filter((item) => item.id !== commentId && item.replyTo !== commentId);
}

export function watchPage(ws, pageId, actorId) {
  const page = mustPage(ws, pageId);
  if (!actorId || !visiblePage(page, actorId)) throw new Error('permission');
  const index = page.watchers.indexOf(actorId);
  if (index >= 0) page.watchers.splice(index, 1);
  else page.watchers.push(actorId);
  const watching = page.watchers.includes(actorId);
  setNotice(ws, actorId, 'page', pageId, { edit: watching, comment: watching });
  return watching;
}

export function restorePage(ws, pageId, versionId, actorId) {
  const page = mustPage(ws, pageId);
  const version = (page.versions || []).find((item) => item.id === versionId);
  if (!version) throw new Error('not-found');
  return updatePage(ws, pageId, { title: version.title, body: version.body }, actorId);
}

export function pagesIn(ws, spaceId, userId) {
  return (ws.articles || []).filter((page) => page.spaceId === spaceId && visiblePage(page, userId));
}

export function trashedPages(ws, spaceId, userId) {
  return (ws.articles || []).filter((page) => page.spaceId === spaceId && page.trashed && (page.authorId === userId || (page.editors || []).includes(userId)));
}

export function copyPage(ws, pageId, actorId) {
  const page = mustPage(ws, pageId);
  if (!visiblePage(page, actorId)) throw new Error('permission');
  return addPage(ws, {
    spaceId: page.spaceId,
    parentId: page.kind === 'blog' ? '' : page.parentId,
    title: `${page.title} copy`,
    body: page.body,
    kind: page.kind,
    labels: [...(page.labels || [])],
    status: 'draft',
  }, actorId);
}

export function likePage(ws, pageId, actorId) {
  const page = mustPage(ws, pageId);
  if (!actorId || !visiblePage(page, actorId)) throw new Error('permission');
  const index = page.likes.indexOf(actorId);
  if (index >= 0) page.likes.splice(index, 1);
  else page.likes.push(actorId);
  return page.likes.includes(actorId);
}

export function setPageStatus(ws, pageId, status, actorId) {
  const page = mustPage(ws, pageId);
  if (!canEditPage(page, actorId)) throw new Error('permission');
  if (!['draft', 'review', 'current'].includes(status)) throw new Error('name-required');
  page.status = status;
  page.updated = nowIso();
  return page;
}

export function setPageAccess(ws, pageId, patch, actorId) {
  const page = mustPage(ws, pageId);
  if (page.authorId !== actorId) throw new Error('permission');
  if (patch.restricted != null) page.restricted = Boolean(patch.restricted);
  if (patch.readers) page.readers = [...new Set(patch.readers.filter(Boolean))];
  if (patch.editors) page.editors = [...new Set(patch.editors.filter(Boolean))];
  page.updated = nowIso();
  return page;
}

export function shareLink(ws, pageId, actorId, on) {
  const page = mustPage(ws, pageId);
  if (page.authorId !== actorId) throw new Error('permission');
  page.shareToken = on ? (page.shareToken || uid('sh')) : '';
  return page.shareToken;
}

export function pageByShare(ws, token) {
  const key = String(token || '').trim();
  if (!key) return null;
  return (ws.articles || []).find((page) => page.shareToken && page.shareToken === key && !page.trashed) || null;
}

/**
 * Adds a file to a page. From the editor (embed on, the default) it also goes into the text;
 * from the page's file list (embed: false) it only joins the list.
 */
export function attachPage(ws, pageId, file, actorId, { embed = true } = {}) {
  const page = mustPage(ws, pageId);
  if (!canEditPage(page, actorId)) throw new Error('permission');
  if ((file.size || 0) > 700_000 || String(file.data || '').length > 1_200_000) throw new Error('attachment-big');
  const item = { id: uid('f'), name: file.name || 'file', mime: file.mime || '', size: file.size || 0, data: file.data || '', created: nowIso(), authorId: actorId || '' };
  page.attachments.push(item);
  if (embed) page.body = `${page.body || ''}\n\n${writingEmbed(item)}\n`;
  page.updated = nowIso();
  return item;
}

export function removePageFile(ws, pageId, fileId, actorId) {
  const page = mustPage(ws, pageId);
  if (!canEditPage(page, actorId)) throw new Error('permission');
  page.attachments = page.attachments.filter((item) => item.id !== fileId);
}

export function addShape(ws, pageId, text, actorId) {
  const page = mustPage(ws, pageId);
  if (page.kind !== 'board' || !canEditPage(page, actorId)) throw new Error('permission');
  const label = String(text || '').trim();
  if (!label) throw new Error('name-required');
  page.shapes.push({ id: uid('sh'), text: label.slice(0, 80) });
  page.updated = nowIso();
  return page;
}

export function removeShape(ws, pageId, shapeId, actorId) {
  const page = mustPage(ws, pageId);
  if (!canEditPage(page, actorId)) throw new Error('permission');
  page.shapes = page.shapes.filter((item) => item.id !== shapeId);
}

export function addColumn(ws, pageId, name, actorId) {
  const page = mustPage(ws, pageId);
  if (page.kind !== 'table' || !canEditPage(page, actorId)) throw new Error('permission');
  const label = String(name || '').trim();
  if (!label) throw new Error('name-required');
  if (page.columns.includes(label)) throw new Error('duplicate-key');
  page.columns.push(label);
  page.updated = nowIso();
  return page;
}

export function addRow(ws, pageId, cells, actorId) {
  const page = mustPage(ws, pageId);
  if (page.kind !== 'table' || !canEditPage(page, actorId)) throw new Error('permission');
  const row = {};
  page.columns.forEach((column, index) => { row[column] = String(cells[index] ?? cells[column] ?? '').trim(); });
  page.rows.push(row);
  page.updated = nowIso();
  return page;
}

export function markEditing(ws, pageId, actorId, editing) {
  const page = mustPage(ws, pageId);
  page.editorId = editing ? (actorId || '') : '';
  page.editorAt = editing ? nowIso() : '';
  return page;
}

export function expandPage(ws, page) {
  const source = String(page.body || '');
  const pages = (ws.articles || []).filter((item) => item.spaceId === page.spaceId && !item.trashed);
  const heads = source.split('\n').filter((line) => /^#{1,3}\s+/.test(line)).map((line) => `- ${line.replace(/^#+\s+/, '')}`);
  let body = source.replace(/\[\[toc\]\]/gi, heads.join('\n'));
  body = body.replace(/\[\[children\]\]/gi, () => pages.filter((item) => item.parentId === page.id).map((item) => `- ${item.title}`).join('\n'));
  body = body.replace(/\[\[include:([^\]]+)\]\]/gi, (_match, title) => {
    const other = pages.find((item) => item.title === title.trim() && item.id !== page.id);
    return other ? String(other.body || '').replace(/\[\[include:[^\]]+\]\]/gi, '') : '';
  });
  body = body.replace(/:::(note|info|warning)\n([\s\S]*?):::/gi, (_match, kind, text) => text.split('\n').map((line) => `> **${kind}** ${line}`).join('\n'));
  return body;
}

export function pageDocument(page, body) {
  const doc = writingExport(page.title || 'Page', body, page.attachments || []);
  return { filename: `${doc.filename}.html`, html: doc.html, markdown: doc.markdown };
}

export function searchPages(ws, text, userId) {
  const query = String(text || '').trim().toLowerCase();
  if (!query) return [];
  return (ws.articles || []).filter((page) => visiblePage(page, userId) && `${page.title}\n${page.body}\n${(page.labels || []).join(' ')}`.toLowerCase().includes(query));
}
