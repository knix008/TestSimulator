import { FORMS, visibleDocuments } from '../domain/documents.js';
import { canEditPage, expandPage, pagesIn, trashedPages } from '../domain/wiki.js';
import { visibleSpaces } from '../domain/teams.js';
import { CREATE_FIELDS, MODULES, WEEK_DAYS, calendarOf, moduleOn, planItems } from '../domain/services.js';
import { renderMarkdown } from '../domain/markdown.js';
import { badge, button, empty, esc, formatWhen, icon, L, nameOf, options, pageHead, person } from './bits.js';
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

function pageTree(pages, parentId, activeId, depth) {
  return pages.filter((page) => page.kind !== 'blog' && (page.parentId || '') === parentId).map((page) => `<div class="wiki-node" style="padding-left:${depth * 14}px"><button type="button" class="link-row${page.id === activeId ? ' active' : ''}" data-action="open-article" data-id="${esc(page.id)}">${icon('book')}<b>${esc(page.title)}</b></button>${pageTree(pages, page.id, activeId, depth + 1)}</div>`).join('');
}

const SCOPE = {
  company: ['회사 공용', 'Company', 'globe'],
  team: ['팀', 'Teams', 'team'],
  project: ['과제', 'Projects', 'folder'],
};

export function knowledgeView(ctx) {
  // Pages live in spaces: the company's (everyone), each team's (its members) and each project's (its people).
  const spaces = visibleSpaces(ctx.ws, ctx.user?.id);
  const space = spaces.find((item) => item.id === ctx.ui.spaceId) || spaces.find((item) => item.projectId && item.projectId === ctx.project?.id) || spaces[0];
  if (space && ctx.ui.spaceId !== space.id) ctx.ui.spaceId = space.id;
  const pages = space ? pagesIn(ctx.ws, space.id, ctx.user?.id) : [];
  const find = screenFind(ctx);
  const query = find.q.trim().toLowerCase();
  const shown = pages.filter((page) => {
    if (query && !`${page.title} ${page.body} ${(page.labels || []).join(' ')}`.toLowerCase().includes(query)) return false;
    if (find.kind && (page.kind || 'page') !== find.kind) return false;
    if (find.status && (page.status || 'current') !== find.status) return false;
    return true;
  });
  const shared = ctx.ui.shareToken ? (ctx.ws.articles || []).find((page) => page.shareToken === ctx.ui.shareToken && !page.trashed) : null;
  const open = pages.find((page) => page.id === ctx.ui.articleId) || shared || (!query ? pages[0] : null);
  const canEdit = open && canEditPage(open, ctx.user?.id);
  const watching = open && (open.watchers || []).includes(ctx.user?.id);
  const spaceOptions = Object.entries(SCOPE).map(([scope, [ko, en]]) => {
    const list = spaces.filter((item) => (item.scope || 'company') === scope);
    return list.length ? `<optgroup label="${esc(L(ko, en))}">${list.map((item) => `<option value="${esc(item.id)}"${item.id === space?.id ? ' selected' : ''}>${esc(item.key)} · ${esc(item.name)}</option>`).join('')}</optgroup>` : '';
  }).join('');
  const scope = SCOPE[space?.scope || 'company'] || SCOPE.company;
  const blogs = shown.filter((page) => page.kind === 'blog').map((page) => `<button type="button" class="link-row${page.id === open?.id ? ' active' : ''}" data-action="open-article" data-id="${esc(page.id)}">${icon('spark')}<b>${esc(page.title)}</b></button>`).join('');
  const tree = query
    ? shown.filter((page) => page.kind !== 'blog').map((page) => `<button type="button" class="link-row${page.id === open?.id ? ' active' : ''}" data-action="open-article" data-id="${esc(page.id)}">${icon('book')}<b>${esc(page.title)}</b></button>`).join('')
    : pageTree(shown, '', open?.id, 0);
  const labels = (open?.labels || []).map((label) => badge(label, '#0f9f6e')).join(' ');
  const statusName = { draft: L('초안', 'Draft'), review: L('검토', 'Review'), current: L('게시', 'Published') };
  const liked = open && (open.likes || []).includes(ctx.user?.id);
  const freshEdit = open?.editorId && open.editorId !== ctx.user?.id && Date.now() - Date.parse(open.editorAt || 0) < 120000;
  const comments = (open?.comments || []).map((comment) => `<article class="comment"><header><b>${esc(person(ctx.ws, comment.authorId)?.name || '')}</b><small>${esc(formatWhen(comment.created))}</small>${comment.authorId === ctx.user?.id || open.authorId === ctx.user?.id ? `<button type="button" class="icon-button" data-action="delete-page-comment" data-id="${esc(open.id)}" data-comment="${esc(comment.id)}">${icon('trash')}</button>` : ''}</header>${comment.quote ? `<blockquote>${esc(comment.quote)}</blockquote>` : ''}<div class="md">${renderMarkdown(comment.body || '')}</div></article>`).join('');
  const versions = (open?.versions || []).slice(0, 8).map((version) => `<button type="button" class="link-row" data-action="restore-page" data-id="${esc(open.id)}" data-version="${esc(version.id)}">${icon('restore')}<span>${esc(version.title)}</span><small>${esc(formatWhen(version.at))}</small></button>`).join('');
  const files = (open?.attachments || []).map((file) => `<div class="link-row">${icon('paperclip')}<a class="file-link" href="${esc(file.data || '')}" data-file="${esc(file.id)}" data-name="${esc(file.name)}" download="${esc(file.name)}">${esc(file.name)}</a>${canEdit ? `<button type="button" class="icon-button" data-action="remove-page-file" data-id="${esc(open.id)}" data-file="${esc(file.id)}">${icon('trash')}</button>` : ''}</div>`).join('');
  const people = (ctx.ws.users || []).filter((user) => user.active !== false && user.id !== open?.authorId).map((user) => `<option value="${esc(user.id)}">${esc(user.name)}</option>`).join('');
  const editor = open && ctx.ui.wikiEdit && canEdit ? `<input id="page-title" value="${esc(open.title)}"><input id="page-labels" value="${esc((open.labels || []).join(' '))}" placeholder="${esc(L('라벨', 'Labels'))}"><textarea id="page-body" rows="12" placeholder="${esc(L('[[toc]] [[children]] [[include:제목]] 과 :::note 안내 :::', '[[toc]] [[children]] [[include:Title]] and :::note text :::'))}">${esc(open.body || '')}</textarea><div class="inline"><button type="button" class="button primary" data-action="save-page" data-id="${esc(open.id)}">${icon('save')}<span>${L('저장', 'Save')}</span></button><button type="button" class="button" data-action="wiki-edit" data-on="0">${icon('eye')}<span>${L('보기', 'Read')}</span></button></div>` : '';
  const board = open?.kind === 'board' ? `<div class="card-grid">${(open.shapes || []).map((shape) => `<div class="panel-card"><b>${esc(shape.text)}</b>${canEdit ? `<button type="button" class="icon-button" data-action="remove-shape" data-id="${esc(open.id)}" data-shape="${esc(shape.id)}">${icon('trash')}</button>` : ''}</div>`).join('')}</div>${canEdit ? `<div class="inline"><input id="shape-text" placeholder="${esc(L('상자', 'Box'))}"><button type="button" class="button" data-action="add-shape" data-id="${esc(open.id)}">${icon('plus')}<span>${L('상자', 'Box')}</span></button></div>` : ''}` : '';
  const table = open?.kind === 'table' ? `<table class="data"><thead><tr>${(open.columns || []).map((column) => `<th>${esc(column)}</th>`).join('')}</tr></thead><tbody>${(open.rows || []).map((row) => `<tr>${(open.columns || []).map((column) => `<td>${esc(row[column] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table>${canEdit ? `<div class="inline"><input id="column-name" placeholder="${esc(L('열', 'Column'))}"><button type="button" class="button" data-action="add-column" data-id="${esc(open.id)}">${icon('plus')}<span>${L('열', 'Column')}</span></button></div><div class="inline"><input id="row-cells" placeholder="${esc(L('칸을 쉼표로', 'Cells, separated by commas'))}"><button type="button" class="button" data-action="add-row" data-id="${esc(open.id)}">${icon('plus')}<span>${L('행', 'Row')}</span></button></div>` : ''}` : '';
  const reader = open ? `<article class="panel-card"><header><b>${esc(open.title)}</b><span class="grow"></span>
      <button type="button" class="small-button${liked ? ' primary' : ''}" data-action="like-page" data-id="${esc(open.id)}">${icon('flag')}<span>${(open.likes || []).length}</span></button>
      <button type="button" class="small-button${watching ? ' primary' : ''}" data-action="watch-page" data-id="${esc(open.id)}">${icon('bell')}<span>${watching ? L('관찰 중', 'Watching') : L('관찰', 'Watch')}</span></button>
      ${open.authorId === ctx.user?.id ? `<button type="button" class="small-button${open.restricted ? ' primary' : ''}" data-action="restrict-page" data-id="${esc(open.id)}">${icon('lock')}<span>${open.restricted ? L('제한됨', 'Restricted') : L('제한', 'Restrict')}</span></button>` : ''}
      <button type="button" class="small-button" data-action="copy-page" data-id="${esc(open.id)}">${icon('copy')}<span>${L('복사', 'Copy')}</span></button>
      <button type="button" class="small-button" data-action="export-page" data-id="${esc(open.id)}" data-format="html">${icon('download')}<span>HTML</span></button>
      <button type="button" class="small-button" data-action="export-page" data-id="${esc(open.id)}" data-format="doc">${icon('file')}<span>${L('워드', 'Word')}</span></button>
      <button type="button" class="small-button" data-action="export-page" data-id="${esc(open.id)}" data-format="pdf">${icon('printer')}<span>PDF</span></button>
      <button type="button" class="small-button" data-action="export-page" data-id="${esc(open.id)}" data-format="md">${icon('file')}<span>Markdown</span></button>
      ${canEdit ? `<button type="button" class="small-button" data-action="wiki-edit">${icon('pencil')}<span>${L('편집', 'Edit')}</span></button>` : ''}
      ${open.kind !== 'blog' ? `<button type="button" class="small-button" data-action="add-child" data-id="${esc(open.id)}">${icon('plus')}<span>${L('하위 페이지', 'Child page')}</span></button>` : ''}
      ${canEdit ? `<button type="button" class="icon-button" data-action="delete-article" data-id="${esc(open.id)}">${icon('trash')}</button>` : ''}
    </header>
    <p class="muted">${badge(statusName[open.status] || statusName.current, open.status === 'draft' ? '#f5a524' : open.status === 'review' ? '#3a6cf0' : '#30a46c')} ${open.kind === 'blog' ? L('소식', 'News') : open.kind === 'board' ? L('칠판', 'Board') : open.kind === 'table' ? L('표', 'Table') : L('페이지', 'Page')} · ${esc(person(ctx.ws, open.authorId)?.name || '')} · ${L('조회', 'Views')} ${open.views || 0}${labels ? ` · ${labels}` : ''}</p>
    ${freshEdit ? `<p class="banner">${esc(L(`${person(ctx.ws, open.editorId)?.name || ''} 님이 편집 중입니다.`, `${person(ctx.ws, open.editorId)?.name || 'Someone'} is editing this page.`))}</p>` : ''}
    ${canEdit ? `<label class="form-row"><span>${L('상태', 'Status')}</span><select data-choose="page-status" data-id="${esc(open.id)}">${['draft', 'review', 'current'].map((id) => `<option value="${id}"${open.status === id ? ' selected' : ''}>${statusName[id]}</option>`).join('')}</select></label>` : ''}
    ${open.authorId === ctx.user?.id ? `<div class="inline"><select id="page-editor">${people}</select><button type="button" class="small-button" data-action="grant-edit" data-id="${esc(open.id)}">${icon('pencil')}<span>${L('편집자', 'Editor')}</span></button><select id="page-reader">${people}</select><button type="button" class="small-button" data-action="grant-read" data-id="${esc(open.id)}">${icon('eye')}<span>${L('읽는 사람', 'Reader')}</span></button><button type="button" class="small-button" data-action="share-link" data-id="${esc(open.id)}" data-on="${open.shareToken ? '0' : '1'}">${icon('link')}<span>${open.shareToken ? L('링크 끄기', 'Turn off the link') : L('공개 링크', 'Public link')}</span></button></div>${open.shareToken ? `<p class="muted">${esc(open.shareToken)}</p>` : ''}` : ''}
    ${canEdit && open.kind !== 'blog' ? `<label class="form-row"><span>${L('상위', 'Parent')}</span><select data-choose="page-parent" data-id="${esc(open.id)}"><option value="">${L('최상위', 'Top')}</option>${pages.filter((page) => page.kind !== 'blog' && page.id !== open.id && !pageAncestor(pages, page, open.id)).map((page) => `<option value="${esc(page.id)}"${page.id === open.parentId ? ' selected' : ''}>${esc(page.title)}</option>`).join('')}</select></label>` : ''}
    ${editor}
    ${editor ? `<div class="md">${renderMarkdown(open.body || '', open.attachments || [])}</div>` : `<div class="md">${renderMarkdown(expandPage(ctx.ws, open), open.attachments || [])}</div>`}
    ${board}${table}
    <h2>${L('첨부', 'Attachments')}</h2>${files || empty(L('첨부가 없습니다.', 'There are no attachments.'))}
    ${canEdit ? `<div class="inline"><button type="button" class="button" data-action="pick-page-file" data-id="${esc(open.id)}" data-kind="image">${icon('image')}<span>${L('이미지', 'Image')}</span></button><button type="button" class="button" data-action="pick-page-file" data-id="${esc(open.id)}" data-kind="file">${icon('paperclip')}<span>${L('파일', 'File')}</span></button></div>` : ''}
    <h2>${L('의견', 'Comments')}</h2>${comments || empty(L('의견이 없습니다.', 'There are no comments.'))}
    <div class="inline"><input id="page-quote" placeholder="${esc(L('인용할 문장', 'Quote'))}"><input id="page-comment" placeholder="${esc(L('의견', 'Comment'))}"><button type="button" class="button" data-action="comment-page" data-id="${esc(open.id)}">${icon('comment')}<span>${L('남기기', 'Add')}</span></button></div>
    ${versions ? `<h2>${L('이전 판', 'Earlier versions')}</h2>${versions}` : ''}</article>` : '';
  const trash = space ? trashedPages(ctx.ws, space.id, ctx.user?.id).map((page) => `<div class="link-row"><span>${esc(page.title)}</span><button type="button" class="small-button" data-action="restore-trashed" data-id="${esc(page.id)}">${icon('restore')}<span>${L('되돌리기', 'Restore')}</span></button><button type="button" class="small-button" data-action="purge-page" data-id="${esc(page.id)}">${icon('trash')}<span>${L('삭제', 'Delete')}</span></button></div>`).join('') : '';
  return `<div class="page">${pageHead(`${L('페이지', 'Pages')}${space ? ` <small class="muted space-scope">${icon(scope[2])}${esc(L(scope[0], scope[1]))} · ${esc(space.name)}</small>` : ''}`, `<button type="button" class="button" data-action="add-blog">${icon('spark')}<span>${L('소식', 'News')}</span></button><button type="button" class="button" data-action="add-board">${icon('board')}<span>${L('칠판', 'Board')}</span></button><button type="button" class="button" data-action="add-table">${icon('columns')}<span>${L('표', 'Table')}</span></button>${button('add-article', L('페이지', 'Page'))}`, 'knowledge')}
    <div class="inline"><select data-choose="space" title="${esc(L('공간', 'Space'))}">${spaceOptions}</select>${finderBar(ctx, [
      { id: 'kind', label: L('종류', 'Kind'), options: [{ id: 'page', label: L('페이지', 'Page') }, { id: 'blog', label: L('소식', 'News') }, { id: 'board', label: L('칠판', 'Board') }, { id: 'table', label: L('표', 'Table') }] },
      { id: 'status', label: L('상태', 'Status'), options: [{ id: 'draft', label: L('초안', 'Draft') }, { id: 'review', label: L('검토', 'Review') }, { id: 'current', label: L('게시', 'Published') }] },
    ])}<input id="share-open" value="${esc(ctx.ui.shareToken || '')}" placeholder="${esc(L('공개 링크', 'Public link'))}"><button type="button" class="button" data-action="open-share">${icon('link')}<span>${L('열기', 'Open')}</span></button></div>
    <div class="split-page"><div class="wiki-tree"><h2>${L('페이지', 'Pages')}</h2>${tree || empty(L('페이지가 없습니다.', 'There are no pages.'))}<h2>${L('소식', 'News')}</h2>${blogs || empty(L('소식이 없습니다.', 'There is no news.'))}${trash ? `<h2>${L('휴지통', 'Trash')}</h2>${trash}` : ''}</div>${reader}</div>
    <div class="form-cards"><section class="panel-card"><header><b>${icon('plus')}<span>${L('새 페이지', 'New page')}</span></b></header><div class="inline"><input id="article-title" placeholder="${esc(L('새 페이지 제목', 'New page title'))}"><button type="button" class="button" data-action="add-article">${icon('plus')}<span>${L('추가', 'Add')}</span></button></div>
    <textarea id="article-body" rows="4" placeholder="${esc(L('Markdown. [[toc]] [[children]] [[include:제목]]', 'Markdown. [[toc]] [[children]] [[include:Title]]'))}"></textarea>
    </section><section class="panel-card"><header><b>${icon('globe')}<span>${L('새 회사 공간', 'New company space')}</span></b></header><p class="muted">${L('팀과 과제 공간은 팀과 과제를 만들 때 생깁니다.', 'Team and project spaces come with their teams and projects.')}</p><div class="inline"><input id="space-name" placeholder="${esc(L('공간 이름', 'Space name'))}"><input id="space-key" placeholder="KEY"><button type="button" class="button" data-action="add-space">${icon('plus')}<span>${L('만들기', 'Create')}</span></button></div></section></div></div>`;
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

