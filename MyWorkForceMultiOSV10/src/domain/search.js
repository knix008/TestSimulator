// Searching the whole company at once: projects, issues, pages, documents, comments, files, people and teams.
// Only what the signed-in person may see comes back, grouped by kind.
import { isWorkspaceAdmin, participatesIn } from './permissions.js';
import { moduleOn } from './services.js';
import { visibleSpaces } from './teams.js';
import { visiblePage } from './wiki.js';

/** The kinds in the order the search screen shows them. */
export const SEARCH_KINDS = ['projects', 'issues', 'spaces', 'pages', 'documents', 'comments', 'files', 'people', 'teams'];

/** Words of the query, lowercase; every word must appear somewhere in an item. */
export function searchTerms(text) {
  return String(text || '').toLowerCase().split(/\s+/).map((word) => word.trim()).filter(Boolean);
}

function matches(terms, ...fields) {
  const hay = fields.filter((field) => field != null && field !== '').join('\n').toLowerCase();
  return terms.every((term) => hay.includes(term));
}

/** A short piece of text around the first word found, so a result shows why it matched. */
export function snippet(text, terms, width = 120) {
  const source = String(text || '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(?:[-*]|\d+\.)\s+(?:☐\s*)?/gm, '')
    .replace(/(?:^|\s)[-:|\s]{3,}(?=\s|$)/g, ' ')
    .replace(/[#>*_`~|…]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
  if (!source) return '';
  const lower = source.toLowerCase();
  const at = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0).sort((a, b) => a - b)[0];
  if (at == null || source.length <= width) return source.length <= width ? source : `${source.slice(0, width)}…`;
  const start = Math.max(0, at - Math.floor(width / 3));
  const piece = source.slice(start, start + width);
  return `${start > 0 ? '…' : ''}${piece}${start + width < source.length ? '…' : ''}`;
}

function newest(a, b) {
  return String(b.at || '').localeCompare(String(a.at || ''));
}

/**
 * Every match for `text`, grouped by kind: { projects: [...], issues: [...], ... }.
 * Each hit is { kind, id, title, text, at, ...where } — `where` carries what opening it needs.
 */
export function searchAll(ws, text, userId) {
  const groups = Object.fromEntries(SEARCH_KINDS.map((kind) => [kind, []]));
  const terms = searchTerms(text);
  const me = (ws.users || []).find((user) => user.id === userId);
  if (!terms.length || !me || me.active === false) return groups;
  const admin = isWorkspaceAdmin(me);
  const userName = (id) => (ws.users || []).find((user) => user.id === id)?.name || '';
  const projects = (ws.projects || []).filter((project) => participatesIn(ws, project, userId));
  const projectIds = new Set(projects.map((project) => project.id));

  for (const project of projects) {
    if (matches(terms, project.key, project.name, project.description)) {
      groups.projects.push({ kind: 'projects', id: project.id, title: `${project.key} · ${project.name}`, text: snippet(project.description, terms), at: project.updated || project.created || '', archived: Boolean(project.archived) });
    }
    for (const issue of project.issues || []) {
      const labels = (issue.labels || []).join(' ');
      if (matches(terms, issue.key, issue.summary, issue.description, labels)) {
        groups.issues.push({ kind: 'issues', id: issue.id, projectId: project.id, title: `${issue.key} ${issue.summary}`, text: snippet(issue.description || labels, terms), at: issue.updated || issue.created || '', statusId: issue.statusId, typeId: issue.typeId });
      }
      for (const comment of issue.comments || []) {
        if (matches(terms, comment.body)) {
          groups.comments.push({ kind: 'comments', id: comment.id, on: 'issue', projectId: project.id, issueId: issue.id, title: `${issue.key} ${issue.summary}`, text: snippet(comment.body, terms), by: userName(comment.authorId), at: comment.created || '' });
        }
      }
      for (const file of issue.attachments || []) {
        if (matches(terms, file.name)) {
          groups.files.push({ kind: 'files', id: file.id, on: 'issue', projectId: project.id, issueId: issue.id, title: file.name, text: `${issue.key} ${issue.summary}`, size: file.size || 0, mime: file.mime || '', data: file.data || '', at: file.created || '' });
        }
      }
    }
  }

  if (moduleOn(ws, 'knowledge')) {
    const spaces = new Map(visibleSpaces(ws, userId).map((space) => [space.id, space]));
    for (const space of spaces.values()) {
      if (matches(terms, space.name, space.key, space.description)) {
        groups.spaces.push({ kind: 'spaces', id: space.id, title: space.name, text: snippet(space.description, terms), at: space.updated || '' });
      }
    }
    for (const page of ws.articles || []) {
      const space = spaces.get(page.spaceId);
      if (!space || !visiblePage(page, userId)) continue;
      if (matches(terms, page.title, page.body, (page.labels || []).join(' '))) {
        groups.pages.push({ kind: 'pages', id: page.id, spaceId: space.id, title: page.title, text: snippet(page.body, terms), place: space.name, pageKind: page.kind || 'page', at: page.updated || '' });
      }
      for (const comment of page.comments || []) {
        if (matches(terms, comment.body, comment.quote)) {
          groups.comments.push({ kind: 'comments', id: comment.id, on: 'page', pageId: page.id, spaceId: space.id, title: page.title, text: snippet(comment.body, terms), by: userName(comment.authorId), at: comment.created || '' });
        }
      }
      for (const file of page.attachments || []) {
        if (matches(terms, file.name)) {
          groups.files.push({ kind: 'files', id: file.id, on: 'page', pageId: page.id, spaceId: space.id, title: file.name, text: `${space.name} › ${page.title}`, size: file.size || 0, mime: file.mime || '', data: file.data || '', at: file.created || '' });
        }
      }
    }
  }

  if (moduleOn(ws, 'documents')) {
    for (const doc of ws.documents || []) {
      const mine = doc.authorId === userId;
      const shared = doc.visibility === 'workspace' || (doc.visibility === 'project' && projectIds.has(doc.projectId));
      if (!mine && !shared) continue;
      if (matches(terms, doc.title, doc.body, doc.issueKey)) {
        groups.documents.push({ kind: 'documents', id: doc.id, projectId: doc.projectId || '', mine, title: doc.title, text: snippet(doc.body, terms), by: userName(doc.authorId), at: doc.updated || doc.created || '' });
      }
      for (const file of doc.attachments || []) {
        if (matches(terms, file.name)) {
          groups.files.push({ kind: 'files', id: file.id, on: 'document', docId: doc.id, projectId: doc.projectId || '', mine, title: file.name, text: doc.title, size: file.size || 0, mime: file.mime || '', data: file.data || '', at: file.created || '' });
        }
      }
    }
  }

  for (const user of ws.users || []) {
    if (user.active === false && !admin) continue;
    if (matches(terms, user.name, user.jobTitle, user.team, user.email, user.login)) {
      groups.people.push({ kind: 'people', id: user.id, title: user.name, text: [user.jobTitle, user.team, user.email].filter(Boolean).join(' · '), at: '' });
    }
  }
  for (const team of ws.teams || []) {
    if (matches(terms, team.name, team.key, team.description)) {
      groups.teams.push({ kind: 'teams', id: team.id, title: team.name, text: snippet(team.description, terms), at: '' });
    }
  }

  for (const kind of SEARCH_KINDS) if (!['people', 'teams'].includes(kind)) groups[kind].sort(newest);
  return groups;
}
