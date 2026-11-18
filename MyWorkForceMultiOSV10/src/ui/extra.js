import { FORMS, visibleDocuments } from '../domain/documents.js';
import { canEditPage, expandPage, pagesIn, trashedPages } from '../domain/wiki.js';
import { visibleSpaces } from '../domain/teams.js';
import { CREATE_FIELDS, MODULES, WEEK_DAYS, calendarOf, moduleOn, planItems } from '../domain/services.js';
import { renderMarkdown } from '../domain/markdown.js';
import { avatar, badge, button, empty, esc, formatWhen, icon, L, nameOf, options, pageHead, person } from './bits.js';
import { isWorkspaceAdmin } from '../domain/permissions.js';
import { markMentions } from './mentions.js';
import { expandIssueMacros } from './issue-macros.js';
import { diffLines, diffStats } from '../domain/diff.js';
import { finderBar, issueFacets, issueVisible, keepBlock, matchesText, screenFind } from './finder.js';

const DAY = { mon: ['월', 'Mon'], tue: ['화', 'Tue'], wed: ['수', 'Wed'], thu: ['목', 'Thu'], fri: ['금', 'Fri'], sat: ['토', 'Sat'], sun: ['일', 'Sun'] };

function pageAncestor(pages, page, ancestorId) {
  let current = page;
  const seen = new Set();
  while (current?.parentId && !seen.has(current.id)) {
    if (current.parentId === ancestorId) return true;
    seen.add(current.id);
    current = pages.find((item) => item.id === current.parentId);
  }
  return false;
}

const SCOPE = {
  company: ['회사 공용', 'Company', 'globe'],
  team: ['팀', 'Teams', 'team'],
  project: ['과제', 'Projects', 'folder'],
};

const KIND_GLYPH = { page: 'book', blog: 'spark', board: 'board', table: 'columns' };

/** The workspace's badge: the first letter of its name. */
function spaceMark(space) {
  return ([...String(space.name || space.key || '?').trim()][0] || '?').toUpperCase();
}

function fileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fileGlyph(file) {
  return /^image\//i.test(file.mime || '') ? 'image' : 'file';
}

/** Is this workspace unfolded in the left tree? The one in use is, unless it was folded by hand. */
export function spaceOpen(ctx, space, currentId) {
  const marks = ctx.ui.wsOpen || {};
  return marks[space.id] ?? space.id === currentId;
}

/** The left tree's pages under one parent, each with a fold arrow when it has children and a + for a child page. */
function sideTree(ctx, space, pages, parentId, openId, depth) {
  const folds = ctx.ui.pageFold || {};
  return pages.filter((page) => page.kind !== 'blog' && (page.parentId || '') === parentId).map((page) => {
    const kids = pages.some((item) => item.kind !== 'blog' && item.parentId === page.id);
    const folded = Boolean(kids && folds[page.id]);
    const canEdit = canEditPage(page, ctx.user?.id);
    const caret = kids
      ? `<button type="button" class="ws-caret" data-action="toggle-page" data-id="${esc(page.id)}" aria-expanded="${folded ? 'false' : 'true'}" title="${esc(folded ? L('펼치기', 'Expand') : L('접기', 'Collapse'))}">${icon(folded ? 'chevronRight' : 'chevronDown')}</button>`
      : '<span class="ws-caret-gap"></span>';
    const add = canEdit && page.kind === 'page' ? `<button type="button" class="ws-add" data-action="add-child" data-id="${esc(page.id)}" title="${esc(L('하위 페이지 추가', 'Add a child page'))}" aria-label="${esc(L('하위 페이지 추가', 'Add a child page'))}">${icon('plus')}</button>` : '';
    const row = `<div class="ws-row ws-page${page.id === openId ? ' active' : ''}" style="--depth:${depth + 1}">${caret}<button type="button" class="ws-name" data-action="open-article" data-id="${esc(page.id)}" data-space="${esc(space.id)}">${icon(KIND_GLYPH[page.kind] || 'book')}<span>${esc(page.title)}</span>${page.status === 'draft' ? `<small class="ws-tag">${L('초안', 'Draft')}</small>` : ''}</button>${add}</div>`;
    return row + (folded ? '' : sideTree(ctx, space, pages, page.id, openId, depth + 1));
  }).join('');
}

/** One workspace's pages as a tree (and its news), for the left navigation under that workspace. */
export function workspacePageTree(ctx, space, openId = '') {
  const pages = pagesIn(ctx.ws, space.id, ctx.user?.id);
  const tree = sideTree(ctx, space, pages, '', openId, 0);
  const news = pages.filter((page) => page.kind === 'blog').map((page) => `<div class="ws-row ws-page${page.id === openId ? ' active' : ''}" style="--depth:1"><span class="ws-caret-gap"></span><button type="button" class="ws-name" data-action="open-article" data-id="${esc(page.id)}" data-space="${esc(space.id)}">${icon('spark')}<span>${esc(page.title)}</span></button></div>`).join('');
  const none = !tree && !news ? `<div class="ws-row ws-empty" style="--depth:1"><span class="ws-caret-gap"></span><button type="button" class="ws-name muted" data-action="add-page" data-space="${esc(space.id)}">${icon('plus')}<span>${L('첫 페이지 만들기', 'Create the first page')}</span></button></div>` : '';
  return tree + news + none;
}

/** A workspace with no page chosen: its name, what it is for, and its top pages and latest changes. */
function workspaceHome(ctx, space, pages) {
  const find = screenFind(ctx);
  const words = find.q.trim().toLowerCase();
  const filtering = Boolean(words || find.kind);
  const found = filtering ? pages.filter((page) => (!find.kind || (page.kind || 'page') === find.kind) && (!words || `${page.title} ${page.body} ${(page.labels || []).join(' ')}`.toLowerCase().includes(words))) : [];
  const scope = SCOPE[space.scope || 'company'] || SCOPE.company;
  const top = pages.filter((page) => page.kind !== 'blog' && !page.parentId);
  const recent = [...pages].sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || ''))).slice(0, 8);
  const card = (page) => `<button type="button" class="doc-child" data-action="open-article" data-id="${esc(page.id)}">${icon(KIND_GLYPH[page.kind] || 'book')}<b>${esc(page.title)}</b><small>${esc(person(ctx.ws, page.authorId)?.name || '')} · ${esc(formatWhen(page.updated))}</small></button>`;
  return `<article class="panel-card doc-page ws-home">
    <nav class="doc-crumbs">${icon(scope[2])}<span>${esc(L(scope[0], scope[1]))}</span><span class="crumb-sep">›</span><span>${esc(space.key)}</span></nav>
    <header class="doc-head"><h1 class="doc-title"><span class="ws-badge big">${esc(spaceMark(space))}</span>${esc(space.name)}</h1><span class="grow"></span>
      <button type="button" class="small-button primary" data-action="add-page" data-space="${esc(space.id)}">${icon('plus')}<span>${L('새 페이지', 'New page')}</span></button>
      <button type="button" class="small-button" data-action="add-blog" data-space="${esc(space.id)}">${icon('spark')}<span>${L('소식', 'News')}</span></button>
      <button type="button" class="small-button" data-action="add-board" data-space="${esc(space.id)}">${icon('board')}<span>${L('칠판', 'Board')}</span></button>
      <button type="button" class="small-button" data-action="add-table" data-space="${esc(space.id)}">${icon('columns')}<span>${L('표', 'Table')}</span></button>
    </header>
    ${space.description ? `<div class="md doc-body">${renderMarkdown(space.description)}</div>` : `<p class="muted">${L('이 작업 공간에 팀의 문서를 페이지로 모읍니다. 페이지 아래에 하위 페이지를 만들어 장과 절처럼 나눌 수 있습니다.', 'Gather documents here as pages. Pages can hold child pages, like chapters and sections.')}</p>`}
    ${finderBar(ctx, [{ id: 'kind', label: L('종류', 'Kind'), options: [{ id: 'page', label: L('페이지', 'Page') }, { id: 'blog', label: L('소식', 'News') }, { id: 'board', label: L('칠판', 'Board') }, { id: 'table', label: L('표', 'Table') }] }])}
    ${filtering ? `<section class="doc-children"><h2>${icon('search')}<span>${L('찾은 페이지', 'Pages found')}</span><span class="chip">${found.length}</span></h2>${found.length ? `<div class="doc-child-grid">${found.map(card).join('')}</div>` : `<p class="muted">${L('맞는 페이지가 없습니다.', 'No page matches.')}</p>`}</section>` : ''}
    <section class="doc-children"><h2>${icon('book')}<span>${L('페이지', 'Pages')}</span><span class="chip">${top.length}</span></h2>
      ${top.length ? `<div class="doc-child-grid">${top.map(card).join('')}</div>` : `<p class="muted">${L('아직 페이지가 없습니다.', 'No pages yet.')}</p>`}
    </section>
    ${recent.length ? `<section class="doc-children"><h2>${icon('clock')}<span>${L('최근 바뀐 페이지', 'Recently updated')}</span></h2>${recent.map((page) => `<button type="button" class="link-row" data-action="open-article" data-id="${esc(page.id)}">${icon(KIND_GLYPH[page.kind] || 'book')}<b>${esc(page.title)}</b><small>${esc(person(ctx.ws, page.versions?.[0]?.authorId || page.authorId)?.name || '')} · ${esc(formatWhen(page.updated))}</small></button>`).join('')}</section>` : ''}
  </article>`;
}

/** The page's files: a card per file, a drop area, and buttons to add more. */
function pageFiles(ctx, page, canEdit) {
  const list = (page.attachments || []).map((file) => `<div class="file-card">
      <span class="file-glyph">${/^image\//i.test(file.mime || '') && file.data ? `<img src="${esc(file.data)}" alt="">` : icon(fileGlyph(file))}</span>
      <span class="file-text"><a class="file-link" href="${esc(file.data || '')}" data-file="${esc(file.id)}" data-name="${esc(file.name)}" download="${esc(file.name)}">${esc(file.name)}</a><small>${esc(fileSize(file.size))}${file.authorId ? ` · ${esc(person(ctx.ws, file.authorId)?.name || '')}` : ''}${file.created ? ` · ${esc(formatWhen(file.created))}` : ''}</small></span>
      <a class="icon-button" href="${esc(file.data || '')}" download="${esc(file.name)}" title="${esc(L('내려받기', 'Download'))}" aria-label="${esc(L('내려받기', 'Download'))}">${icon('download')}</a>
      ${canEdit ? `<button type="button" class="icon-button" data-action="remove-page-file" data-id="${esc(page.id)}" data-file="${esc(file.id)}" title="${esc(L('파일 삭제', 'Remove the file'))}" aria-label="${esc(L('파일 삭제', 'Remove the file'))}">${icon('trash')}</button>` : ''}
    </div>`).join('');
  const drop = canEdit ? `<div class="file-drop" data-page-drop="${esc(page.id)}">${icon('paperclip')}<span>${L('파일을 여기로 끌어 놓거나', 'Drop files here or')}</span><button type="button" class="small-button" data-action="pick-page-file" data-id="${esc(page.id)}" data-kind="file" data-embed="0">${icon('plus')}<span>${L('파일 추가', 'Add files')}</span></button><small class="muted">${L('파일 하나에 700KB까지', 'Up to 700KB a file')}</small></div>` : '';
  return `<section class="doc-section" id="page-files"><h2>${icon('paperclip')}<span>${L('파일', 'Files')}</span><span class="chip">${(page.attachments || []).length}</span></h2>
    ${list ? `<div class="file-grid">${list}</div>` : (canEdit ? '' : empty(L('파일이 없습니다.', 'There are no files.')))}
    ${drop}
  </section>`;
}

/**
 * The page's comments as threads: each comment with its replies under it. An inline comment shows the
 * passage it is about, leads back to it in the text, and can be resolved (then its highlight goes away).
 */
function pageComments(ctx, page) {
  const editing = ctx.ui.commentEdit || '';
  const replying = ctx.ui.replyTo || '';
  const canEdit = canEditPage(page, ctx.user?.id);
  const all = page.comments || [];
  const one = (comment, reply) => {
    const who = person(ctx.ws, comment.authorId);
    const mine = comment.authorId === ctx.user?.id;
    const canDelete = mine || page.authorId === ctx.user?.id;
    if (editing === comment.id && mine) {
      return `<article class="comment editing${reply ? ' reply' : ''}" data-comment-id="${esc(comment.id)}"><header>${avatar(who)}<b>${esc(who?.name || '')}</b></header>
        <textarea id="comment-edit" rows="3">${esc(comment.body || '')}</textarea>
        <div class="inline"><span class="grow"></span><button type="button" class="small-button" data-action="cancel-page-comment">${icon('close')}<span>${L('취소', 'Cancel')}</span></button><button type="button" class="small-button primary" data-action="save-page-comment" data-id="${esc(page.id)}" data-comment="${esc(comment.id)}">${icon('save')}<span>${L('저장', 'Save')}</span></button></div></article>`;
    }
    const inline = comment.inline && !reply;
    const state = inline ? (comment.resolved
      ? `<span class="chip resolved">${icon('check')}${L('해결됨', 'Resolved')}</span>`
      : `<span class="chip inline-chip">${icon('quote')}${L('본문 댓글', 'Inline')}</span>`) : '';
    const resolve = inline && (mine || canEdit)
      ? `<button type="button" class="small-button" data-action="resolve-page-comment" data-id="${esc(page.id)}" data-comment="${esc(comment.id)}" data-on="${comment.resolved ? '0' : '1'}">${icon(comment.resolved ? 'restore' : 'check')}<span>${comment.resolved ? L('다시 열기', 'Reopen') : L('해결', 'Resolve')}</span></button>`
      : '';
    const quote = comment.quote
      ? (inline && !comment.resolved
        ? `<button type="button" class="comment-quote" data-action="jump-inline" data-comment="${esc(comment.id)}" title="${esc(L('본문에서 보기', 'Show it in the page'))}">${esc(comment.quote)}</button>`
        : `<blockquote>${esc(comment.quote)}</blockquote>`)
      : '';
    return `<article class="comment${reply ? ' reply' : ''}${comment.resolved ? ' is-resolved' : ''}${ctx.ui.inlineActive === comment.id ? ' flash' : ''}" data-comment-id="${esc(comment.id)}"><header>${avatar(who)}<b>${esc(who?.name || '')}</b><small>${esc(formatWhen(comment.created))}${comment.edited ? ` · ${L('고침', 'edited')}` : ''}</small>${state}<span class="grow"></span>
      ${resolve}
      ${!reply ? `<button type="button" class="icon-button" data-action="reply-page-comment" data-comment="${esc(comment.id)}" title="${esc(L('답글', 'Reply'))}" aria-label="${esc(L('답글', 'Reply'))}">${icon('comment')}</button>` : ''}
      ${mine ? `<button type="button" class="icon-button" data-action="edit-page-comment" data-comment="${esc(comment.id)}" title="${esc(L('고치기', 'Edit'))}" aria-label="${esc(L('고치기', 'Edit'))}">${icon('pencil')}</button>` : ''}
      ${canDelete ? `<button type="button" class="icon-button" data-action="delete-page-comment" data-id="${esc(page.id)}" data-comment="${esc(comment.id)}" title="${esc(L('삭제', 'Delete'))}" aria-label="${esc(L('삭제', 'Delete'))}">${icon('trash')}</button>` : ''}</header>
      ${quote}<div class="md">${markMentions(renderMarkdown(comment.body || ''), ctx.ws.users)}</div></article>`;
  };
  const threads = all.filter((comment) => !comment.replyTo).map((comment) => {
    const replies = all.filter((item) => item.replyTo === comment.id).map((item) => one(item, true)).join('');
    const box = replying === comment.id
      ? `<div class="reply-box"><textarea id="reply-text" rows="2" placeholder="${esc(L('답글. @이름으로 사람을 부릅니다.', 'Reply. @name mentions someone.'))}"></textarea><div class="inline"><span class="grow"></span><button type="button" class="small-button" data-action="cancel-reply">${icon('close')}<span>${L('취소', 'Cancel')}</span></button><button type="button" class="small-button primary" data-action="send-reply" data-id="${esc(page.id)}" data-comment="${esc(comment.id)}">${icon('comment')}<span>${L('답글 남기기', 'Reply')}</span></button></div></div>`
      : '';
    return `<div class="comment-thread">${one(comment, false)}${replies || box ? `<div class="comment-replies">${replies}${box}</div>` : ''}</div>`;
  }).join('');
  const open = all.filter((comment) => comment.inline && !comment.resolved && !comment.replyTo).length;
  return `<section class="doc-section" id="page-comments"><h2>${icon('comment')}<span>${L('댓글', 'Comments')}</span><span class="chip">${all.length}</span>${open ? `<span class="chip inline-chip">${icon('quote')}${L(`본문 댓글 ${open}`, `${open} inline`)}</span>` : ''}</h2>
    <p class="muted comment-hint">${L('본문에서 글을 골라 그 부분에 댓글을 달 수 있습니다.', 'Select text in the page to comment on that passage.')}</p>
    ${threads || `<p class="muted">${L('첫 댓글을 남기세요.', 'Be the first to comment.')}</p>`}
    <div class="comment-box">${avatar(ctx.user)}<div class="comment-input">
      <textarea id="page-comment" rows="3" placeholder="${esc(L('댓글을 쓰세요. @이름으로 사람을 부르고, Ctrl+Enter로 남깁니다.', 'Write a comment. @name mentions someone; Ctrl+Enter posts it.'))}"></textarea>
      <div class="inline"><input id="page-quote" placeholder="${esc(L('인용할 문장 (선택)', 'Quote (optional)'))}"><button type="button" class="button primary" data-action="comment-page" data-id="${esc(page.id)}">${icon('comment')}<span>${L('댓글 남기기', 'Comment')}</span></button></div>
    </div></div>
  </section>`;
}

/** Two versions of a page side by side as one list: removed lines red, added lines green. */
function versionCompare(ctx, page) {
  const pick = ctx.ui.pageCompare;
  const all = [{ id: 'current', title: page.title, body: page.body, at: page.updated, authorId: page.authorId }, ...(page.versions || [])];
  const label = (item, at) => (item.id === 'current' ? L('지금', 'Now') : `v${all.length - at} · ${formatWhen(item.at)}`);
  const from = all.find((item) => item.id === pick.from) || all[1] || all[0];
  const to = all.find((item) => item.id === pick.to) || all[0];
  const choose = (field, chosen) => `<select data-choose="compare-${field}" data-id="${esc(page.id)}">${all.map((item, at) => `<option value="${esc(item.id)}"${item.id === chosen.id ? ' selected' : ''}>${esc(label(item, at))}</option>`).join('')}</select>`;
  const titleLine = from.title !== to.title ? `<p class="diff-title"><del>${esc(from.title)}</del> → <ins>${esc(to.title)}</ins></p>` : '';
  const parts = diffLines(from.body, to.body);
  const stats = diffStats(parts);
  // Long runs of unchanged lines fold to three lines of context on each side.
  const rows = [];
  parts.forEach((part, at) => {
    if (part.type === 'same') {
      const near = parts.slice(Math.max(0, at - 3), at + 4).some((other) => other.type !== 'same');
      if (!near) { if (rows.at(-1) !== '…') rows.push('…'); return; }
    }
    rows.push(part);
  });
  const body = rows.map((row) => (row === '…'
    ? '<div class="diff-line fold">⋯</div>'
    : `<div class="diff-line ${row.type}"><span class="diff-mark">${row.type === 'add' ? '+' : row.type === 'del' ? '−' : ''}</span><span>${esc(row.text) || '&nbsp;'}</span></div>`)).join('');
  return `<section class="version-compare">
    <header><b>${icon('columns')}<span>${L('판 비교', 'Compare versions')}</span></b>${choose('from', from)}<span>→</span>${choose('to', to)}
      <span class="diff-stats"><ins>+${stats.added}</ins> <del>−${stats.removed}</del></span><span class="grow"></span>
      <button type="button" class="icon-button" data-action="compare-close" title="${esc(L('닫기', 'Close'))}" aria-label="${esc(L('닫기', 'Close'))}">${icon('close')}</button></header>
    ${titleLine}
    <div class="diff-body">${stats.added || stats.removed ? body : `<p class="muted">${L('본문이 같습니다.', 'The text is the same.')}</p>`}</div>
  </section>`;
}

export function knowledgeView(ctx) {
  // Pages live in workspaces (spaces): the company's (everyone), each team's (its members), each project's (its people)
  // and any number made by hand. The left navigation lists them with their pages; this screen shows one, and
  // the right panel holds the workspace's or the page's properties.
  const spaces = visibleSpaces(ctx.ws, ctx.user?.id);
  const space = spaces.find((item) => item.id === ctx.ui.spaceId) || spaces.find((item) => item.projectId && item.projectId === ctx.project?.id) || spaces[0];
  if (space && ctx.ui.spaceId !== space.id) ctx.ui.spaceId = space.id;
  const pages = space ? pagesIn(ctx.ws, space.id, ctx.user?.id) : [];
  const shared = ctx.ui.shareToken ? (ctx.ws.articles || []).find((page) => page.shareToken === ctx.ui.shareToken && !page.trashed) : null;
  const open = pages.find((page) => page.id === ctx.ui.articleId) || shared || null;
  if (!space) {
    return `<div class="ws-layout solo"><div class="ws-main"><div class="center-empty">${icon('layers')}<p>${L('작업 공간을 만들어 페이지를 모으세요.', 'Create a workspace to gather pages.')}</p><button type="button" class="button primary" data-action="ws-create-start">${icon('plus')}<span>${L('새 작업 공간', 'New workspace')}</span></button></div></div></div>`;
  }
  if (!open) return `<div class="ws-layout solo"><div class="ws-main">${workspaceHome(ctx, space, pages)}</div></div>`;
  const canEdit = canEditPage(open, ctx.user?.id);
  // A page opens ready to write for anyone who may edit it; "Preview" shows it as readers see it
  // (with live issue lists and highlighted mentions).
  const reading = !canEdit || ctx.ui.pageView === 'read';
  const editor = reading ? '' : docEditor(ctx, open);
  const freshEdit = open.editorId && open.editorId !== ctx.user?.id && Date.now() - Date.parse(open.editorAt || 0) < 120000;
  const compare = ctx.ui.pageCompare?.pageId === open.id ? versionCompare(ctx, open) : '';
  const board = open.kind === 'board' ? `<div class="card-grid">${(open.shapes || []).map((shape) => `<div class="panel-card"><b>${esc(shape.text)}</b>${canEdit ? `<button type="button" class="icon-button" data-action="remove-shape" data-id="${esc(open.id)}" data-shape="${esc(shape.id)}">${icon('trash')}</button>` : ''}</div>`).join('')}</div>${canEdit ? `<div class="inline"><input id="shape-text" placeholder="${esc(L('상자', 'Box'))}"><button type="button" class="button" data-action="add-shape" data-id="${esc(open.id)}">${icon('plus')}<span>${L('상자', 'Box')}</span></button></div>` : ''}` : '';
  const table = open.kind === 'table' ? `<table class="data"><thead><tr>${(open.columns || []).map((column) => `<th>${esc(column)}</th>`).join('')}</tr></thead><tbody>${(open.rows || []).map((row) => `<tr>${(open.columns || []).map((column) => `<td>${esc(row[column] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table>${canEdit ? `<div class="inline"><input id="column-name" placeholder="${esc(L('열', 'Column'))}"><button type="button" class="button" data-action="add-column" data-id="${esc(open.id)}">${icon('plus')}<span>${L('열', 'Column')}</span></button></div><div class="inline"><input id="row-cells" placeholder="${esc(L('칸을 쉼표로', 'Cells, separated by commas'))}"><button type="button" class="button" data-action="add-row" data-id="${esc(open.id)}">${icon('plus')}<span>${L('행', 'Row')}</span></button></div>` : ''}` : '';
  const crumbs = [`<button type="button" class="crumb" data-action="open-workspace" data-id="${esc(space.id)}">${esc(space.name)}</button>`, ...pageTrail(pages, open).map((page) => `<button type="button" class="crumb" data-action="open-article" data-id="${esc(page.id)}">${esc(page.title)}</button>`)];
  const children = pages.filter((page) => page.parentId === open.id && page.kind !== 'blog');
  const childList = open.kind !== 'blog' ? `<section class="doc-children"><h2>${icon('layers')}<span>${L('하위 페이지', 'Child pages')}</span><span class="chip">${children.length}</span></h2>
      ${children.length ? `<div class="doc-child-grid">${children.map((page) => `<button type="button" class="doc-child" data-action="open-article" data-id="${esc(page.id)}">${icon(KIND_GLYPH[page.kind] || 'book')}<b>${esc(page.title)}</b><small>${esc(person(ctx.ws, page.authorId)?.name || '')} · ${esc(formatWhen(page.updated))}</small></button>`).join('')}</div>` : `<p class="muted">${L('하위 페이지가 없습니다. 이 페이지 아래에 장, 절처럼 나눠 쓸 페이지를 만들 수 있습니다.', 'No child pages yet. Add pages under this one, like chapters and sections.')}</p>`}
      ${canEdit && open.kind === 'page' ? `<button type="button" class="button" data-action="add-child" data-id="${esc(open.id)}">${icon('plus')}<span>${L('하위 페이지 추가', 'Add a child page')}</span></button>` : ''}
    </section>` : '';
  const mode = canEdit ? `<div class="seg doc-mode" role="group" aria-label="${esc(L('보기', 'View'))}">
      <button type="button" class="small-button${reading ? '' : ' primary'}" data-action="page-mode" data-id="edit">${icon('pencil')}<span>${L('편집', 'Edit')}</span></button>
      <button type="button" class="small-button${reading ? ' primary' : ''}" data-action="page-mode" data-id="read">${icon('eye')}<span>${L('미리 보기', 'Preview')}</span></button>
    </div>` : '';
  const article = `<article class="panel-card doc-page">
    <nav class="doc-crumbs" aria-label="${esc(L('위치', 'Location'))}">${icon('layers')}${crumbs.map((item, at) => (at ? `<span class="crumb-sep">›</span>${item}` : item)).join('')}<span class="grow"></span><span id="live-people" class="live-people" hidden></span>${mode}</nav>
    ${editor ? '' : `<h1 class="doc-title">${esc(open.title)}</h1>`}
    ${freshEdit ? `<p class="banner">${esc(L(`${person(ctx.ws, open.editorId)?.name || ''} 님도 이 페이지를 쓰고 있습니다.`, `${person(ctx.ws, open.editorId)?.name || 'Someone'} is also writing this page.`))}</p>` : ''}
    ${compare}
    ${editor || `<div class="md doc-body reading" data-page="${esc(open.id)}">${expandIssueMacros(markMentions(renderMarkdown(expandPage(ctx.ws, open), open.attachments || []), ctx.ws.users), ctx, open)}</div>`}
    ${board}${table}
    ${childList}
    ${pageFiles(ctx, open, canEdit)}
    ${pageComments(ctx, open)}</article>`;
  return `<div class="ws-layout solo"><div class="ws-main">${article}</div></div>`;
}

const WHERE = (space) => (space.scope === 'team' && space.teamId ? `team:${space.teamId}` : space.scope === 'project' && space.projectId ? `project:${space.projectId}` : '');

/** The workspace shown on the Pages screen (when no page is open), if the signed-in person may see it. */
export function openSpaceOf(ctx) {
  if (ctx.ui.view !== 'knowledge') return null;
  const spaces = visibleSpaces(ctx.ws, ctx.user?.id);
  return spaces.find((item) => item.id === ctx.ui.spaceId) || null;
}

/** The right panel beside a workspace: its name, description, who sees it, its trash, and deleting it. */
export function spaceInfoPanel(ctx) {
  const space = openSpaceOf(ctx);
  if (!space) return '';
  const manage = isWorkspaceAdmin(ctx.user) || space.authorId === ctx.user?.id;
  const pages = pagesIn(ctx.ws, space.id, ctx.user?.id);
  const all = (ctx.ws.articles || []).filter((page) => page.spaceId === space.id);
  const trash = trashedPages(ctx.ws, space.id, ctx.user?.id);
  const teams = (ctx.ws.teams || []);
  const projects = (ctx.ws.projects || []).filter((item) => !item.archived);
  const where = WHERE(space);
  const scopeName = { company: L('회사 전체', 'Whole company'), team: L('팀', 'Team'), project: L('과제', 'Project') }[space.scope || 'company'];
  const whereText = space.scope === 'team' ? (teams.find((team) => team.id === space.teamId)?.name || '') : space.scope === 'project' ? (projects.find((item) => item.id === space.projectId)?.name || '') : L('모두 봅니다', 'Everyone');
  const row = (glyph, label, value) => `<div class="info-row">${icon(glyph)}<span>${esc(label)}</span><b>${value}</b></div>`;
  const latest = [...pages].sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')))[0];
  const whereSelect = `<select data-space-field="where" data-id="${esc(space.id)}" aria-label="${esc(L('보는 사람', 'Who sees it'))}">
      <option value=""${where ? '' : ' selected'}>${esc(L('회사 전체 — 모두', 'Whole company — everyone'))}</option>
      ${teams.length ? `<optgroup label="${esc(L('팀 — 팀원만', 'A team — its members'))}">${teams.map((team) => `<option value="team:${esc(team.id)}"${where === `team:${team.id}` ? ' selected' : ''}>${esc(team.name)}</option>`).join('')}</optgroup>` : ''}
      ${projects.length ? `<optgroup label="${esc(L('과제 — 과제 사람만', 'A project — its people'))}">${projects.map((item) => `<option value="project:${esc(item.id)}"${where === `project:${item.id}` ? ' selected' : ''}>${esc(item.key)} · ${esc(item.name)}</option>`).join('')}</optgroup>` : ''}
    </select>`;
  return `<div class="page-info space-info">
    <section><h3>${icon('layers')}<span>${L('작업 공간', 'Workspace')}</span></h3>
      ${manage ? `<label class="prop"><span>${L('이름', 'Name')}</span><input data-space-field="name" data-id="${esc(space.id)}" value="${esc(space.name)}" aria-label="${esc(L('이름', 'Name'))}"></label>
      <label class="prop prop-top"><span>${L('설명', 'Description')}</span><textarea data-space-field="description" data-id="${esc(space.id)}" rows="4" placeholder="${esc(L('이 작업 공간에 무엇을 모으는지', 'What this workspace gathers'))}">${esc(space.description || '')}</textarea></label>
      <label class="prop"><span>${L('보는 사람', 'Who sees it')}</span>${whereSelect}</label>` : `${row('tag', L('이름', 'Name'), esc(space.name))}${row('eye', L('보는 사람', 'Who sees it'), esc(`${scopeName} · ${whereText}`))}`}
    </section>
    <section><h3>${icon('info')}<span>${L('정보', 'Details')}</span></h3>
      ${row('idCard', L('키', 'Key'), esc(space.key))}
      ${row('user', L('만든 사람', 'Created by'), esc(person(ctx.ws, space.authorId)?.name || L('없음', 'None')))}
      ${row('book', L('페이지', 'Pages'), String(pages.length))}
      ${row('clock', L('마지막 변경', 'Last change'), latest ? `${esc(formatWhen(latest.updated))}<small>${esc(latest.title)}</small>` : esc(L('없음', 'None')))}
    </section>
    <section><h3>${icon('plus')}<span>${L('만들기', 'Create')}</span></h3>
      <div class="info-actions">
        <button type="button" class="small-button primary" data-action="add-page" data-space="${esc(space.id)}">${icon('book')}<span>${L('새 페이지', 'New page')}</span></button>
        <button type="button" class="small-button" data-action="add-blog" data-space="${esc(space.id)}">${icon('spark')}<span>${L('소식', 'News')}</span></button>
        <button type="button" class="small-button" data-action="add-board" data-space="${esc(space.id)}">${icon('board')}<span>${L('칠판', 'Board')}</span></button>
        <button type="button" class="small-button" data-action="add-table" data-space="${esc(space.id)}">${icon('columns')}<span>${L('표', 'Table')}</span></button>
      </div>
    </section>
    <section><h3>${icon('trash')}<span>${L('휴지통', 'Trash')}</span><span class="chip">${trash.length}</span></h3>
      ${trash.length ? trash.map((page) => `<div class="version-row"><span class="version-text"><b>${esc(page.title)}</b><small>${esc(formatWhen(page.updated))}</small></span><button type="button" class="icon-button" data-action="restore-trashed" data-id="${esc(page.id)}" title="${esc(L('되돌리기', 'Restore'))}" aria-label="${esc(L('되돌리기', 'Restore'))}">${icon('restore')}</button><button type="button" class="icon-button" data-action="purge-page" data-id="${esc(page.id)}" title="${esc(L('영구 삭제', 'Delete for good'))}" aria-label="${esc(L('영구 삭제', 'Delete for good'))}">${icon('trash')}</button></div>`).join('') : `<p class="muted">${L('휴지통이 비어 있습니다.', 'The trash is empty.')}</p>`}
    </section>
    ${manage ? `<section><button type="button" class="small-button danger" data-action="delete-workspace" data-id="${esc(space.id)}" ${all.length ? `title="${esc(L('페이지를 모두 지우고 휴지통을 비워야 지울 수 있습니다', 'Delete every page and empty the trash first'))}"` : ''}>${icon('trash')}<span>${L('작업 공간 삭제', 'Delete the workspace')}</span></button></section>` : ''}
  </div>`;
}

/** The open page, if the Pages screen shows one the signed-in person may read. */
export function openPageOf(ctx) {
  if (ctx.ui.view !== 'knowledge' || !ctx.ui.articleId) return null;
  const page = (ctx.ws.articles || []).find((item) => item.id === ctx.ui.articleId);
  if (!page || page.trashed) return null;
  if (ctx.ui.shareToken && page.shareToken === ctx.ui.shareToken) return page;
  const space = visibleSpaces(ctx.ws, ctx.user?.id).find((item) => item.id === page.spaceId);
  return space && pagesIn(ctx.ws, space.id, ctx.user?.id).some((item) => item.id === page.id) ? page : null;
}

/** The right panel beside an open page: where it sits, who made it, its state, sharing, exports and versions. */
export function pageInfoPanel(ctx) {
  const open = openPageOf(ctx);
  if (!open) return '';
  const canEdit = canEditPage(open, ctx.user?.id);
  const owner = open.authorId === ctx.user?.id;
  const pages = pagesIn(ctx.ws, open.spaceId, ctx.user?.id);
  const space = (ctx.ws.spaces || []).find((item) => item.id === open.spaceId);
  const statusName = { draft: L('초안', 'Draft'), review: L('검토', 'Review'), current: L('게시', 'Published') };
  const kindName = { blog: L('소식', 'News'), board: L('칠판', 'Board'), table: L('표', 'Table'), page: L('페이지', 'Page') }[open.kind] || L('페이지', 'Page');
  const liked = (open.likes || []).includes(ctx.user?.id);
  const watching = (open.watchers || []).includes(ctx.user?.id);
  const lastBy = open.versions?.[0]?.authorId || open.authorId;
  const row = (glyph, label, value) => `<div class="info-row">${icon(glyph)}<span>${esc(label)}</span><b>${value}</b></div>`;
  const people = (ctx.ws.users || []).filter((user) => user.active !== false && user.id !== open.authorId).map((user) => `<option value="${esc(user.id)}">${esc(user.name)}</option>`).join('');
  const named = (ids) => (ids || []).map((id) => person(ctx.ws, id)?.name).filter(Boolean).map(esc).join(', ') || esc(L('없음', 'None'));
  const versions = (open.versions || []).map((version, at) => `<div class="version-row"><span class="version-no">v${(open.versions || []).length - at}</span><span class="version-text"><b>${esc(version.title)}</b><small>${esc(person(ctx.ws, version.authorId)?.name || '')} · ${esc(formatWhen(version.at))}</small></span><button type="button" class="icon-button" data-action="compare-page" data-id="${esc(open.id)}" data-from="${esc(version.id)}" data-to="current" title="${esc(L('지금과 비교', 'Compare with now'))}" aria-label="${esc(L('지금과 비교', 'Compare with now'))}">${icon('columns')}</button>${canEdit ? `<button type="button" class="icon-button" data-action="restore-page" data-id="${esc(open.id)}" data-version="${esc(version.id)}" title="${esc(L('이 판으로 되돌리기', 'Restore this version'))}" aria-label="${esc(L('되돌리기', 'Restore'))}">${icon('restore')}</button>` : ''}</div>`).join('');
  const openInline = (open.comments || []).filter((comment) => comment.inline && !comment.resolved && !comment.replyTo).length;
  return `<div class="page-info">
    <section><h3>${icon('info')}<span>${L('페이지 정보', 'Page details')}</span></h3>
      ${row('layers', L('작업 공간', 'Workspace'), esc(space?.name || ''))}
      ${row('book', L('종류', 'Kind'), esc(kindName))}
      ${row('user', L('만든 사람', 'Created by'), esc(person(ctx.ws, open.authorId)?.name || ''))}
      ${row('clock', L('마지막 수정', 'Last updated'), `${esc(formatWhen(open.updated))}<small>${esc(person(ctx.ws, lastBy)?.name || '')}</small>`)}
      ${row('eye', L('조회', 'Views'), String(open.views || 0))}
      ${row('restore', L('판', 'Versions'), String((open.versions || []).length + 1))}
      <div class="info-row">${icon('tag')}<span>${L('라벨', 'Labels')}</span><b>${(open.labels || []).map((label) => badge(label, '#0f9f6e')).join(' ') || esc(L('없음', 'None'))}</b></div>
    </section>
    ${canEdit ? `<section><h3>${icon('settings')}<span>${L('상태와 위치', 'State and place')}</span></h3>
      <label class="prop"><span>${L('상태', 'Status')}</span><select data-choose="page-status" data-id="${esc(open.id)}">${['draft', 'review', 'current'].map((id) => `<option value="${id}"${open.status === id ? ' selected' : ''}>${statusName[id]}</option>`).join('')}</select></label>
      ${open.kind !== 'blog' ? `<label class="prop"><span>${L('상위 페이지', 'Parent')}</span><select data-choose="page-parent" data-id="${esc(open.id)}"><option value="">${L('최상위', 'Top')}</option>${pages.filter((page) => page.kind !== 'blog' && page.id !== open.id && !pageAncestor(pages, page, open.id)).map((page) => `<option value="${esc(page.id)}"${page.id === open.parentId ? ' selected' : ''}>${esc(page.title)}</option>`).join('')}</select></label>` : ''}
    </section>` : `<section>${row('flag', L('상태', 'Status'), esc(statusName[open.status] || statusName.current))}</section>`}
    <section><h3>${icon('bolt')}<span>${L('함께하기', 'Together')}</span></h3>
      <div class="info-actions">
        <button type="button" class="small-button${liked ? ' primary' : ''}" data-action="like-page" data-id="${esc(open.id)}">${icon('flag')}<span>${L('좋아요', 'Like')} ${(open.likes || []).length}</span></button>
        <button type="button" class="small-button${watching ? ' primary' : ''}" data-action="watch-page" data-id="${esc(open.id)}">${icon('bell')}<span>${watching ? L('관찰 중', 'Watching') : L('관찰', 'Watch')}</span></button>
        <button type="button" class="small-button" data-action="jump" data-target="page-comments">${icon('comment')}<span>${L('댓글', 'Comments')} ${(open.comments || []).length}${openInline ? ` · ${L('본문', 'inline')} ${openInline}` : ''}</span></button>
        <button type="button" class="small-button" data-action="jump" data-target="page-files">${icon('paperclip')}<span>${L('파일', 'Files')} ${(open.attachments || []).length}</span></button>
      </div>
    </section>
    <section><h3>${icon('lock')}<span>${L('권한과 공유', 'Access & sharing')}</span></h3>
      ${row('lock', L('제한', 'Restricted'), open.restricted ? esc(L('켜짐', 'On')) : esc(L('꺼짐', 'Off')))}
      ${row('pencil', L('편집자', 'Editors'), named(open.editors))}
      ${row('eye', L('읽는 사람', 'Readers'), named(open.readers))}
      ${owner ? `<div class="info-actions">
        <button type="button" class="small-button${open.restricted ? ' primary' : ''}" data-action="restrict-page" data-id="${esc(open.id)}">${icon('lock')}<span>${open.restricted ? L('제한 풀기', 'Unrestrict') : L('제한', 'Restrict')}</span></button>
        <button type="button" class="small-button" data-action="share-link" data-id="${esc(open.id)}" data-on="${open.shareToken ? '0' : '1'}">${icon('link')}<span>${open.shareToken ? L('공개 링크 끄기', 'Turn off the link') : L('공개 링크', 'Public link')}</span></button>
      </div>
      ${open.shareToken ? `<p class="muted info-token">${esc(open.shareToken)}</p>` : ''}
      <div class="info-grant"><select id="page-editor" aria-label="${esc(L('편집자', 'Editor'))}">${people}</select><button type="button" class="small-button" data-action="grant-edit" data-id="${esc(open.id)}">${icon('pencil')}<span>${L('편집자로', 'As editor')}</span></button></div>
      <div class="info-grant"><select id="page-reader" aria-label="${esc(L('읽는 사람', 'Reader'))}">${people}</select><button type="button" class="small-button" data-action="grant-read" data-id="${esc(open.id)}">${icon('eye')}<span>${L('읽는 사람으로', 'As reader')}</span></button></div>` : ''}
    </section>
    <section><h3>${icon('download')}<span>${L('내보내기', 'Export')}</span></h3>
      <div class="info-actions">
        <button type="button" class="small-button" data-action="export-page" data-id="${esc(open.id)}" data-format="html">${icon('download')}<span>HTML</span></button>
        <button type="button" class="small-button" data-action="export-page" data-id="${esc(open.id)}" data-format="doc">${icon('file')}<span>${L('워드', 'Word')}</span></button>
        <button type="button" class="small-button" data-action="export-page" data-id="${esc(open.id)}" data-format="pdf">${icon('printer')}<span>PDF</span></button>
        <button type="button" class="small-button" data-action="export-page" data-id="${esc(open.id)}" data-format="md">${icon('codeBlock')}<span>Markdown</span></button>
        <button type="button" class="small-button" data-action="copy-page" data-id="${esc(open.id)}">${icon('copy')}<span>${L('복사본', 'Copy')}</span></button>
        ${canEdit ? `<button type="button" class="small-button danger" data-action="delete-article" data-id="${esc(open.id)}">${icon('trash')}<span>${L('휴지통으로', 'To trash')}</span></button>` : ''}
      </div>
    </section>
    <section id="page-versions"><h3>${icon('restore')}<span>${L('이전 판', 'Earlier versions')}</span><span class="chip">${(open.versions || []).length}</span></h3>
      ${versions || `<p class="muted">${L('아직 이전 판이 없습니다.', 'No earlier versions yet.')}</p>`}
    </section>
  </div>`;
}

const SHARE = {
  private: ['나만', 'Only me'],
  project: ['과제', 'Project'],
  workspace: ['모두', 'Everyone'],
};

export function documentsView(ctx) {
  const tab = ctx.ui.docTab || 'forms';
  const tabs = [['shared', 'globe', L('공유', 'Shared')], ['mine', 'user', L('내 문서', 'Mine')], ['forms', 'file', L('양식', 'Forms')]].map(([id, glyph, label]) => `<button type="button" class="tab${tab === id ? ' active' : ''}" data-action="doc-tab" data-id="${id}">${icon(glyph)}<span>${label}</span></button>`).join('');
  const find = screenFind(ctx);
  const mine = (ctx.ws.documents || []).filter((doc) => doc.authorId === ctx.user?.id);
  const shared = visibleDocuments(ctx.ws, ctx.user?.id, ctx.project?.id).filter((doc) => doc.visibility !== 'private');
  const rows = (tab === 'mine' ? mine : shared).filter((doc) => {
    const form = FORMS.find((item) => item.id === doc.templateId);
    const author = person(ctx.ws, doc.authorId)?.name || '';
    if (!matchesText(find.q, doc.title, nameOf(form), author, doc.issueKey)) return false;
    if (find.template && doc.templateId !== find.template) return false;
    if (find.share && doc.visibility !== find.share) return false;
    return true;
  });
  const list = rows.map((doc) => {
    const form = FORMS.find((item) => item.id === doc.templateId);
    const share = SHARE[doc.visibility] || SHARE.private;
    return `<button type="button" class="link-row${doc.id === ctx.ui.docId ? ' active' : ''}" data-action="open-doc" data-id="${esc(doc.id)}">${icon('file')}<b>${esc(doc.title)}</b><small>${esc(nameOf(form) || '')} · ${esc(person(ctx.ws, doc.authorId)?.name || '')} · ${esc(L(share[0], share[1]))}</small></button>`;
  }).join('');
  const open = rows.find((doc) => doc.id === ctx.ui.docId) || null;
  const owner = open && open.authorId === ctx.user?.id;
  const gallery = FORMS.filter((item) => matchesText(find.q, nameOf(item), item.id) && (!find.template || item.id === find.template)).map((item) => `<button type="button" class="panel-card" data-action="use-form" data-id="${esc(item.id)}">${icon(item.id === 'deliverable' ? 'spark' : 'file')}<b>${esc(nameOf(item))}</b><small class="muted">${item.id === 'deliverable' ? esc(L('결과물을 등록하고 공유합니다.', 'Register a deliverable and share it.')) : esc(L('이 양식으로 문서 만들기', 'Start a document from this form'))}</small></button>`).join('');
  const shareButtons = owner ? ['private', 'project', 'workspace'].map((id) => {
    const pair = SHARE[id];
    const glyph = id === 'private' ? 'lock' : id === 'project' ? 'people' : 'globe';
    const disabled = id === 'project' && !open.projectId ? 'disabled' : '';
    return `<button type="button" class="small-button${open.visibility === id ? ' primary' : ''}" data-action="share-doc" data-id="${esc(open.id)}" data-visibility="${id}" ${disabled}>${icon(glyph)}<span>${esc(L(pair[0], pair[1]))}</span></button>`;
  }).join('') : '';
  const docFiles = (open?.attachments || []).map((file) => `<div class="link-row">${icon('paperclip')}<a class="file-link" href="${esc(file.data || '')}" data-file="${esc(file.id)}" data-name="${esc(file.name)}" download="${esc(file.name)}">${esc(file.name)}</a>${owner ? `<button type="button" class="icon-button" data-action="remove-doc-file" data-id="${esc(open.id)}" data-file="${esc(file.id)}">${icon('trash')}</button>` : ''}</div>`).join('');
  const editor = open ? `<article class="panel-card"><header><b>${esc(open.title)}</b>
      <button type="button" class="small-button" data-action="export-doc" data-id="${esc(open.id)}" data-format="html">${icon('download')}<span>HTML</span></button>
      <button type="button" class="small-button" data-action="export-doc" data-id="${esc(open.id)}" data-format="doc">${icon('file')}<span>${L('워드', 'Word')}</span></button>
      <button type="button" class="small-button" data-action="export-doc" data-id="${esc(open.id)}" data-format="pdf">${icon('printer')}<span>PDF</span></button>
      <button type="button" class="small-button" data-action="export-doc" data-id="${esc(open.id)}" data-format="md">${icon('file')}<span>Markdown</span></button>
      ${owner ? `<button type="button" class="icon-button" data-action="delete-doc" data-id="${esc(open.id)}">${icon('trash')}</button>` : ''}</header>
      <p class="muted">${esc(nameOf(FORMS.find((item) => item.id === open.templateId)) || '')} · ${esc(person(ctx.ws, open.authorId)?.name || '')}</p>
      ${owner ? `<div class="inline">${shareButtons}</div>
        <input id="doc-title" data-doc="title" value="${esc(open.title)}" placeholder="${esc(L('제목', 'Title'))}">
        <input id="doc-issue" data-doc="issueKey" value="${esc(open.issueKey || '')}" placeholder="${esc(L('이슈 키', 'Issue key'))}">
        <textarea id="doc-body" data-doc="body" rows="12">${esc(open.body || '')}</textarea>` : ''}
      <div class="md">${renderMarkdown(open.body || '', open.attachments || [])}</div>
      <h2>${L('첨부', 'Attachments')}</h2>${docFiles || empty(L('첨부가 없습니다.', 'There are no attachments.'))}
      ${owner ? `<div class="inline"><button type="button" class="button" data-action="pick-doc-file" data-id="${esc(open.id)}" data-kind="image">${icon('image')}<span>${L('이미지', 'Image')}</span></button><button type="button" class="button" data-action="pick-doc-file" data-id="${esc(open.id)}" data-kind="file">${icon('paperclip')}<span>${L('파일', 'File')}</span></button></div>` : ''}</article>` : '';
  const body = tab === 'forms'
    ? `<p class="muted">${L('양식을 고르면 내 문서로 만들어집니다. 공유하기 전에는 만든 사람만 봅니다.', 'A form becomes your document. Until you share it, only you can see it.')}</p><div class="card-grid">${gallery}</div>`
    : `<div class="split-page"><div>${list || empty(tab === 'mine' ? L('만든 문서가 없습니다.', 'You have no documents.') : L('공유된 문서가 없습니다.', 'Nothing is shared.'))}</div>${editor}</div>`;
  const docFacets = [
    { id: 'template', label: L('양식', 'Form'), options: FORMS.map((item) => ({ id: item.id, label: nameOf(item) })) },
    { id: 'share', label: L('공유', 'Share'), options: [{ id: 'private', label: L('나만', 'Only me') }, { id: 'project', label: L('과제', 'Project') }, { id: 'workspace', label: L('모두', 'Everyone') }] },
  ];
  return `<div class="page">${pageHead(L('문서', 'Documents'), '', 'documents')}<div class="tabs">${tabs}</div>${finderBar(ctx, docFacets)}${body}</div>`;
}

export function calendarView(ctx) {
  const find = screenFind(ctx);
  const current = (ctx.ws.calendars || []).find((calendar) => calendar.id === (find.calendar || ctx.ws.calendarId)) || calendarOf(ctx.ws) || ctx.ws.calendars?.[0];
  const cards = (ctx.ws.calendars || []).filter((calendar) => matchesText(find.q, calendar.name, calendar.timezone, ...(calendar.holidays || []))).map((calendar) => `<button type="button" class="panel-card${calendar.id === ctx.ws.calendarId ? ' active' : ''}" data-action="use-calendar" data-id="${esc(calendar.id)}"><b>${icon('calendar')}${esc(calendar.name)}</b><small>${esc(calendar.timezone)}</small><small>${calendar.id === ctx.ws.calendarId ? L('기한에 사용 중', 'Used for time limits') : L('선택하면 기한이 근무 시간을 따릅니다', 'Choose it to count time limits in working hours')}</small></button>`).join('');
  const grid = current ? WEEK_DAYS.map((day) => {
    const window = current.week?.[day];
    return `<div class="cal-day${window ? '' : ' off'}"><b>${L(DAY[day][0], DAY[day][1])}</b><span>${window ? `${esc(window[0])}–${esc(window[1])}` : L('쉼', 'Off')}</span></div>`;
  }).join('') : '';
  const holidays = (current?.holidays || []).filter((day) => matchesText(find.q, day, current?.name)).map((day) => `<li>${esc(day)}</li>`).join('');
  return `<div class="page">${pageHead(L('근무 달력', 'Work calendar'), '', 'calendar')}${finderBar(ctx, [{ id: 'calendar', label: L('달력', 'Calendar'), options: (ctx.ws.calendars || []).map((calendar) => ({ id: calendar.id, label: calendar.name })) }])}
    <p class="muted">${L('장애와 요청의 기한은 고른 달력의 근무 시간으로 셉니다. 달력을 고르지 않으면 24시간을 셉니다.', 'Time limits for incidents and requests follow the selected calendar. With no calendar, they use 24-hour time.')}</p>
    <div class="card-grid">${cards || empty(L('달력이 없습니다.', 'There is no calendar.'))}</div>
    ${current ? `<div class="cal-grid">${grid}</div><h2>${L('휴일', 'Holidays')}</h2><ul class="plain">${holidays || `<li>${L('없습니다.', 'None.')}</li>`}</ul>` : ''}
    <div class="form-cards"><section class="panel-card"><header><b>${icon('plus')}<span>${L('새 달력', 'New calendar')}</span></b></header><div class="inline"><input id="calendar-name" placeholder="${esc(L('이름', 'Name'))}"><input id="calendar-zone" value="Asia/Seoul" placeholder="${esc(L('시간대', 'Time zone'))}"><button type="button" class="button" data-action="add-calendar">${icon('calendar')}<span>${L('달력 추가', 'Add a calendar')}</span></button></div></section>
    <section class="panel-card"><header><b>${icon('calendar')}<span>${L('휴일 추가', 'Add a holiday')}</span></b></header><div class="inline"><input id="holiday" type="date"><button type="button" class="button" data-action="add-holiday" ${current ? '' : 'disabled'}>${icon('plus')}<span>${L('추가', 'Add')}</span></button></div></section></div></div>`;
}

export function portalView(ctx) {
  const project = ctx.project;
  if (!project) return `<div class="page">${pageHead(L('고객 포털', 'Customer portal'), '', 'portal')}${empty(L('과제를 여세요.', 'Open a project.'))}</div>`;
  const requests = project.issues.filter((issue) => (issue.typeId === 'request' || issue.typeId === 'incident') && issueVisible(ctx, issue));
  const rows = requests.map((issue) => `<button type="button" class="link-row" data-action="open-issue" data-id="${esc(issue.id)}">${icon('request')}<span class="key">${esc(issue.key)}</span><span>${esc(issue.summary)}</span>${badge(nameOf(project.statuses.find((status) => status.id === issue.statusId)), project.statuses.find((status) => status.id === issue.statusId)?.color)}</button>`).join('');
  return `<div class="page">${pageHead(L('고객 포털', 'Customer portal'), '', 'portal')}${finderBar(ctx, issueFacets(ctx, ['type', 'status', 'assignee']))}
    <p class="muted">${L('요청과 장애를 등록하고 진행을 봅니다.', 'Register a request or an incident and follow it.')}</p>
    <div class="inline"><input id="portal-summary" placeholder="${esc(L('무슨 일이 필요합니까?', 'What do you need?'))}"><select id="portal-type"><option value="request">${L('요청', 'Request')}</option><option value="incident">${L('장애', 'Incident')}</option></select><button type="button" class="button primary" data-action="portal-create">${icon('plus')}<span>${L('등록', 'Register')}</span></button></div>
    ${rows || empty(L('등록된 요청이 없습니다.', 'There are no requests.'))}</div>`;
}

export function plansView(ctx) {
  const find = screenFind(ctx);
  const projects = [...new Set(planItems(ctx.ws).map((item) => item.project))];
  const items = planItems(ctx.ws).filter((item) => {
    if (!matchesText(find.q, item.project, item.label, item.kind)) return false;
    if (find.kind && item.kind !== find.kind) return false;
    if (find.project && item.project !== find.project) return false;
    return true;
  });
  const rows = items.map((item) => `<div class="link-row"><span>${esc(item.project)}</span>${badge(item.kind === 'version' ? L('버전', 'Version') : L('에픽', 'Epic'), item.kind === 'version' ? '#3a6cf0' : '#7c3aed')}<b>${esc(item.label)}</b><small>${esc(formatWhen(item.at))}</small></div>`).join('');
  return `<div class="page">${pageHead(L('교차 계획', 'Cross-project plan'), '', 'plans')}${finderBar(ctx, [
    { id: 'kind', label: L('종류', 'Kind'), options: [{ id: 'version', label: L('버전', 'Version') }, { id: 'epic', label: L('에픽', 'Epic') }] },
    { id: 'project', label: L('과제', 'Project'), options: projects.map((key) => ({ id: key, label: key })) },
  ])}
    <p class="muted">${L('과제의 버전과 기한이 있는 에픽을 한 줄로 봅니다.', 'Versions and epics that have a due date, across projects.')}</p>
    ${rows || empty(L('날짜가 있는 계획이 없습니다.', 'Nothing has a date yet.'))}</div>`;
}

export function mailSettings(ctx) {
  const mail = ctx.ws.mail || {};
  const security = mail.security || (mail.secure ? 'ssl' : 'starttls');
  const modes = [
    { id: 'starttls', name: 'STARTTLS (587)' },
    { id: 'ssl', name: 'SSL (465)' },
    { id: 'none', name: L('없음', 'None') },
  ];
  const queued = (ctx.ws.mailOutbox || []).slice(0, 8).map((message) => `<div class="link-row"><span>${esc(message.to)}</span><span>${esc(message.subject)}</span><small>${esc(message.state)}</small>${message.error ? `<small>${esc(message.error)}</small>` : ''}</div>`).join('');
  const failed = (ctx.ws.mailOutbox || []).some((message) => message.state === 'error');
  return `<section><h2>${icon('globe')}<span>${L('메일', 'Mail')}</span></h2>
    <p class="muted">${L('회사 밖의 메일 서버로 보냅니다. 호스트에는 smtp.example.com 같은 외부 주소를 넣으세요. 587은 STARTTLS, 465는 SSL입니다.', 'Messages leave through a mail server outside this company. Put an external host such as smtp.example.com. Port 587 is STARTTLS and port 465 is SSL.')}</p>
    <label class="form-row"><span>${L('호스트', 'Host')}</span><input data-mail="host" value="${esc(mail.host || '')}" placeholder="smtp.example.com"></label>
    <label class="form-row"><span>${L('포트', 'Port')}</span><input data-mail="port" inputmode="numeric" value="${esc(mail.port || (security === 'ssl' ? 465 : 587))}"></label>
    <label class="form-row"><span>${L('보안', 'Security')}</span><select data-mail="security">${options(modes, security)}</select></label>
    <label class="form-row"><span>${L('보내는 주소', 'From')}</span><input data-mail="from" value="${esc(mail.from || '')}" placeholder="workforce@example.com"></label>
    <label class="form-row"><span>${L('계정', 'Account')}</span><input data-mail="user" value="${esc(mail.user || '')}" autocomplete="off"></label>
    <label class="form-row"><span>${L('암호', 'Password')}</span><input data-mail="password" type="password" value="" autocomplete="new-password" placeholder="${esc(mail.hasPassword ? L('저장됨', 'Saved') : '')}"></label>
    ${mail.hasPassword ? `<p class="muted">${L('암호는 이 서버에만 남습니다. 바꾸려면 새 암호를 입력하세요.', 'The password stays on this server. Type a new one to replace it.')}</p>` : ''}
    <div class="inline"><input id="mail-test-to" type="email" placeholder="${esc(L('시험으로 받을 주소', 'Address for a test message'))}"><button type="button" class="button" data-action="mail-test">${icon('globe')}<span>${L('시험 발송', 'Send a test')}</span></button></div>
    ${failed ? `<button type="button" class="button" data-action="mail-retry">${icon('undo')}<span>${L('실패한 메일 다시 보내기', 'Send the failed messages again')}</span></button>` : ''}
    ${queued || empty(L('보낼 메일이 없습니다. 호스트를 저장하면 알림이 그 서버로 나갑니다.', 'Nothing is waiting. After a host is saved, notices go out through that server.'))}
  </section>`;
}

export function extensionsView(ctx) {
  const find = screenFind(ctx);
  const modules = MODULES.filter((item) => {
    if (!matchesText(find.q, nameOf(item), item.id)) return false;
    if (find.state === 'on') return moduleOn(ctx.ws, item.id);
    if (find.state === 'off') return !moduleOn(ctx.ws, item.id);
    return true;
  }).map((item) => `<label class="check"><input type="checkbox" data-module="${esc(item.id)}" ${moduleOn(ctx.ws, item.id) ? 'checked' : ''}>${esc(nameOf(item))}</label>`).join('');
  const hooks = (ctx.ws.webhooks || []).filter((hook) => matchesText(find.q, hook.url, ...(hook.events || [])) && (!find.area || find.area === 'hooks')).map((hook) => `<div class="link-row"><span>${esc(hook.url)}</span><small>${esc((hook.events || []).join(', ') || L('모든 사건', 'Every event'))}</small><button type="button" class="icon-button" data-action="delete-webhook" data-id="${esc(hook.id)}">${icon('trash')}</button></div>`).join('');
  const tokens = (ctx.ws.apiTokens || []).filter((token) => matchesText(find.q, token.name, token.token) && (!find.area || find.area === 'tokens')).map((token) => `<div class="link-row"><b>${esc(token.name)}</b><code>${esc(token.token)}</code><button type="button" class="icon-button" data-action="delete-token" data-id="${esc(token.id)}">${icon('trash')}</button></div>`).join('');
  const sso = ctx.ws.sso || {};
  const area = find.area || '';
  const show = (id) => !area || area === id;
  const moduleBlock = `<section><h2>${icon('layers')}<span>${L('모듈', 'Modules')}</span></h2><p class="muted">${L('관리 프로그램이 나중에 패키지를 이 목록에 올립니다. 지금은 기본 모듈을 켜고 끕니다.', 'The administration app will publish packages into this list later. For now, turn the built-in modules on or off.')}</p><div class="checks">${modules}</div></section>`;
  const hookBlock = `<section><h2>${icon('link')}<span>${L('웹훅', 'Webhooks')}</span></h2><p class="muted">${L('이슈 활동이 생기면 데이터 서비스가 이 주소로 JSON을 보냅니다.', 'When an issue changes, the data service posts JSON to this address.')}</p>${hooks}<div class="inline"><input id="hook-url" placeholder="https://example.com/hook"><input id="hook-events" placeholder="created,transition"><button type="button" class="button" data-action="add-webhook">${icon('bolt')}<span>${L('추가', 'Add')}</span></button></div></section>`;
  const tokenBlock = `<section><h2>${icon('key')}<span>${L('외부 API', 'External API')}</span></h2><p class="muted">GET /api/rest/issues · GET /api/rest/articles · GET /api/rest/documents · Authorization: Bearer</p>${tokens}<div class="inline"><input id="token-name" placeholder="${esc(L('이름', 'Name'))}"><button type="button" class="button" data-action="add-token">${icon('lock')}<span>${L('토큰', 'Token')}</span></button></div></section>`;
  const ssoBlock = `<section><h2>${icon('login')}<span>${L('로그인 공급자', 'Sign-in provider')}</span></h2><p class="muted">${L('발급자 주소가 있으면 그 공급자로 들어갑니다. 비어 있으면 이 작업 공간의 사람을 씁니다.', 'When an issuer is set, sign-in goes to that provider. Otherwise this workspace uses its own people.')}</p>
      <label class="form-row"><span>${L('발급자', 'Issuer')}</span><input data-sso="issuer" value="${esc(sso.issuer || '')}" placeholder="https://idp.example.com"></label>
      <label class="form-row"><span>${L('클라이언트', 'Client')}</span><input data-sso="clientId" value="${esc(sso.clientId || '')}"></label>
      <label class="form-row"><span>${L('비밀', 'Secret')}</span><input data-sso="clientSecret" type="password" value="${esc(sso.clientSecret || '')}"></label>
      <button type="button" class="button" data-action="start-sso">${icon('globe')}<span>${L('공급자로 이동', 'Continue to the provider')}</span></button>
    </section>`;
  return `<div class="page settings">${pageHead(L('확장', 'Extensions'), '', 'extensions')}
    ${finderBar(ctx, [
      { id: 'area', label: L('분류', 'Section'), options: [{ id: 'modules', label: L('모듈', 'Modules') }, { id: 'hooks', label: L('웹훅', 'Webhooks') }, { id: 'tokens', label: L('토큰', 'Tokens') }, { id: 'mail', label: L('메일', 'Mail') }, { id: 'sso', label: L('로그인', 'Sign-in') }] },
      { id: 'state', label: L('모듈', 'Module'), options: [{ id: 'on', label: L('켜짐', 'On') }, { id: 'off', label: L('꺼짐', 'Off') }] },
    ])}
    ${extensionGroup('features', 'layers', L('기능', 'Features'), [show('modules') ? keepBlock(find.q, moduleBlock) : ''])}
    ${extensionGroup('connect', 'link', L('연동', 'Connections'), [show('hooks') ? keepBlock(find.q, hookBlock) : '', show('tokens') ? keepBlock(find.q, tokenBlock) : '', show('sso') ? keepBlock(find.q, ssoBlock) : ''])}
    ${extensionGroup('notify', 'bell', L('알림', 'Notifications'), [show('mail') ? keepBlock(find.q, mailSettings(ctx)) : ''])}
  </div>`;
}

function extensionGroup(id, glyph, title, parts) {
  const body = parts.join('');
  return body.trim() ? `<div class="settings-group" data-group="${id}"><h2 class="settings-group-title">${icon(glyph)}<span>${title}</span></h2><div class="settings-grid">${body}</div></div>` : '';
}

export function approvalBlock(ctx, issue) {
  const rows = (ctx.ws.approvals || []).filter((item) => item.issueId === issue.id);
  if (!rows.length) return '';
  return `<h3>${L('승인', 'Approvals')}</h3>${rows.map((item) => `<div class="link-row"><span>${esc(nameOf(ctx.project.statuses.find((status) => status.id === item.statusId)) || item.statusId)}</span><b>${esc(item.state)}</b>${item.state === 'pending' ? `<button type="button" class="small-button" data-action="decide-approval" data-id="${esc(item.id)}" data-state="approved">${icon('check')}<span>${L('승인', 'Approve')}</span></button><button type="button" class="small-button" data-action="decide-approval" data-id="${esc(item.id)}" data-state="rejected">${icon('close')}<span>${L('거절', 'Reject')}</span></button>` : `<small>${esc(person(ctx.ws, item.decidedBy)?.name || '')}</small>`}</div>`).join('')}`;
}

export function screenSection(project) {
  const chosen = project.screen?.create;
  const boxes = CREATE_FIELDS.filter((field) => field[0] !== 'summary').map(([id, ko, en]) => `<label class="check"><input type="checkbox" data-screen="${esc(id)}" ${!chosen?.length || chosen.includes(id) ? 'checked' : ''}>${L(ko, en)}</label>`).join('');
  return `<section><h2>${L('만들기 화면', 'Create screen')}</h2><p class="muted">${L('새 이슈 창에 둘 칸입니다. 요약은 항상 있습니다.', 'Fields on the new-issue dialog. Summary is always there.')}</p><div class="checks">${boxes}</div></section>`;
}

export function laneLabel(ctx, mode, id) {
  if (id === 'all') return '';
  if (id === 'none') return L('없음', 'None');
  if (mode === 'assignee') return person(ctx.ws, id)?.name || id;
  if (mode === 'epic') return ctx.project.issues.find((issue) => issue.id === id)?.summary || id;
  return nameOf(ctx.project.priorities.find((item) => item.id === id)) || id;
}

export function swimlaneOptions(current) {
  const modes = [['none', L('없음', 'None')], ['assignee', L('담당', 'Assignee')], ['epic', L('에픽', 'Epic')], ['priority', L('우선순위', 'Priority')]];
  return `<select data-choose="swimlane">${options(modes.map(([id, name]) => ({ id, name })), current || 'none')}</select>`;
}


/** The pages above this one, from the top. */
function pageTrail(pages, page) {
  const trail = [];
  const seen = new Set([page.id]);
  let current = pages.find((item) => item.id === page.parentId);
  while (current && !seen.has(current.id)) {
    trail.unshift(current);
    seen.add(current.id);
    current = pages.find((item) => item.id === current.parentId);
  }
  return [...trail, page];
}

/** Formatting buttons: [format, icon, Korean, English, shortcut]. A '|' starts a new group. */
const DOC_TOOLS = [
  ['undo', 'undo', '실행 취소', 'Undo', 'Ctrl+Z'], ['redo', 'redo', '다시 실행', 'Redo', 'Ctrl+Y'], '|',
  ['p', 'paragraph', '본문', 'Body text', ''], ['h1', 'h1', '제목 1', 'Heading 1', ''], ['h2', 'h2', '제목 2', 'Heading 2', ''], ['h3', 'h3', '제목 3', 'Heading 3', ''], '|',
  ['bold', 'bold', '굵게', 'Bold', 'Ctrl+B'], ['italic', 'italic', '기울임', 'Italic', 'Ctrl+I'], ['strike', 'strike', '취소선', 'Strikethrough', ''], ['code', 'code', '코드', 'Inline code', ''], '|',
  ['ul', 'list', '글머리 목록', 'Bulleted list', ''], ['ol', 'listNumber', '번호 목록', 'Numbered list', ''], ['quote', 'quote', '인용', 'Quote', ''], ['pre', 'codeBlock', '코드 블록', 'Code block', ''], ['hr', 'divider', '구분선', 'Divider', ''], '|',
  ['link', 'link', '링크', 'Link', ''], ['table', 'table', '표', 'Table', ''], ['toc', 'toc', '목차 넣기', 'Insert a table of contents', ''], ['children', 'layers', '하위 페이지 목록 넣기', 'Insert the child page list', ''], ['issue', 'issues', '이슈 넣기 (한 이슈 또는 질의 목록)', 'Insert issues (one issue or a query list)', ''],
];

/** A page in edit mode: title, formatting bar, the document itself, and Markdown source on request. */
function docEditor(ctx, page) {
  const draft = ctx.ui.pageDraft?.id === page.id ? ctx.ui.pageDraft : null;
  const source = Boolean(ctx.ui.pageSource);
  const html = draft?.html ?? renderMarkdown(page.body || '', page.attachments || []);
  const tools = DOC_TOOLS.map((tool) => (tool === '|'
    ? '<span class="doc-tool-sep"></span>'
    : `<button type="button" class="doc-tool" data-format="${tool[0]}" title="${esc(L(tool[2], tool[3]))}${tool[4] ? ` · ${tool[4]}` : ''}" aria-label="${esc(L(tool[2], tool[3]))}" ${source ? 'disabled' : ''}>${icon(tool[1])}</button>`)).join('');
  return `<div class="doc-editor" data-page="${esc(page.id)}">
    <input id="page-title" class="doc-title-input" value="${esc(draft?.title ?? page.title)}" placeholder="${esc(L('제목', 'Title'))}" aria-label="${esc(L('제목', 'Title'))}">
    <div class="doc-toolbar" role="toolbar" aria-label="${esc(L('서식', 'Formatting'))}">${tools}
      <span class="doc-tool-sep"></span>
      <button type="button" class="doc-tool" data-action="insert-mention" title="${esc(L('사람 언급 (@)', 'Mention someone (@)'))}" aria-label="${esc(L('사람 언급', 'Mention someone'))}">${icon('user')}</button>
      <button type="button" class="doc-tool" data-action="pick-page-file" data-id="${esc(page.id)}" data-kind="image" title="${esc(L('이미지 넣기', 'Insert an image'))}" aria-label="${esc(L('이미지', 'Image'))}">${icon('image')}</button>
      <button type="button" class="doc-tool" data-action="pick-page-file" data-id="${esc(page.id)}" data-kind="file" title="${esc(L('파일 첨부', 'Attach a file'))}" aria-label="${esc(L('파일', 'File'))}">${icon('paperclip')}</button>
      <span class="grow"></span>
      <button type="button" class="doc-tool${source ? ' active' : ''}" data-action="page-source" title="${esc(source ? L('문서로 쓰기', 'Write as a document') : L('Markdown 원본 보기', 'Show the Markdown source'))}" aria-pressed="${source ? 'true' : 'false'}">${icon('codeBlock')}</button>
    </div>
    <div class="doc-issue-bar" hidden>
      <select id="doc-issue-mode" aria-label="${esc(L('넣을 것', 'What to insert'))}"><option value="one">${L('이슈 하나', 'One issue')}</option><option value="list">${L('질의 목록', 'Query list')}</option></select>
      <select id="doc-issue-project" aria-label="${esc(L('과제', 'Project'))}">${(ctx.ws.projects || []).filter((item) => !item.archived).map((item) => `<option value="${esc(item.key)}"${item.id === ctx.project?.id ? ' selected' : ''}>${esc(item.key)} · ${esc(item.name)}</option>`).join('')}</select>
      <input id="doc-issue-text" placeholder="${esc(L('이슈 키 (예: PAY-12) 또는 WQL (예: status != done)', 'Issue key (e.g. PAY-12) or WQL (e.g. status != done)'))}" aria-label="${esc(L('이슈 키 또는 질의', 'Issue key or query'))}">
      <button type="button" class="small-button" data-format="issue-apply">${icon('check')}<span>${L('넣기', 'Insert')}</span></button>
    </div>
    <div class="doc-link-bar" hidden><input id="doc-link-url" placeholder="https://" aria-label="${esc(L('링크 주소', 'Link address'))}"><button type="button" class="small-button" data-format="link-apply">${icon('check')}<span>${L('넣기', 'Insert')}</span></button></div>
    <div id="page-doc" class="md doc-body doc-writing" contenteditable="true" spellcheck="true" data-page="${esc(page.id)}" ${source ? 'hidden' : ''}>${html}</div>
    <textarea id="page-body" class="doc-source" rows="18" ${source ? '' : 'hidden'} spellcheck="false">${esc(draft?.markdown ?? page.body ?? '')}</textarea>
    <div class="doc-edit-foot">
      <label class="form-row"><span>${icon('tag')}${L('라벨', 'Labels')}</span><input id="page-labels" value="${esc((page.labels || []).join(' '))}" placeholder="${esc(L('띄어쓰기로 나눕니다', 'Separated by spaces'))}"></label>
      <span class="grow"></span>
      <span id="page-save-state" class="save-state" aria-live="polite">${esc(L('바뀐 내용은 저절로 저장됩니다', 'Changes save by themselves'))}</span>
      <button type="button" class="button primary" data-action="save-page" data-id="${esc(page.id)}" title="Ctrl+S">${icon('save')}<span>${L('저장', 'Save')}</span></button>
    </div>
  </div>`;
}
