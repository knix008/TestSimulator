import { SEARCH_KINDS, searchAll, searchTerms } from '../domain/search.js';
import { isWorkspaceAdmin } from '../domain/permissions.js';
import { avatar, esc, formatWhen, icon, L, pageHead, person } from './bits.js';

const KIND = {
  projects: ['folder', '과제', 'Projects'],
  issues: ['issues', '이슈', 'Issues'],
  spaces: ['layers', '작업 공간', 'Workspaces'],
  pages: ['book', '페이지', 'Pages'],
  documents: ['file', '문서', 'Documents'],
  comments: ['comment', '댓글', 'Comments'],
  files: ['paperclip', '파일', 'Files'],
  people: ['user', '사람', 'People'],
  teams: ['team', '팀', 'Teams'],
};

/** How many hits each kind shows on the All tab before "Show all". */
const PREVIEW = 5;

/** Escapes text and marks every search word in it. */
function marked(text, terms) {
  const safe = esc(text || '');
  if (!terms.length) return safe;
  const pattern = new RegExp(`(${terms.map((term) => esc(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return safe.replace(pattern, '<mark>$1</mark>');
}

function size(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function where(ctx, hit) {
  const project = (ctx.ws.projects || []).find((item) => item.id === hit.projectId);
  if (hit.kind === 'issues' || (hit.kind === 'comments' && hit.on === 'issue') || (hit.kind === 'files' && hit.on === 'issue')) return project ? `${project.key} · ${project.name}` : '';
  if (hit.kind === 'pages') return hit.place || '';
  if (hit.on === 'page') return (ctx.ws.spaces || []).find((space) => space.id === hit.spaceId)?.name || '';
  if (hit.kind === 'documents' || hit.on === 'document') return project ? `${project.key} · ${project.name}` : L('문서', 'Documents');
  return '';
}

/** One result row: a button that opens the thing (people open only for an administrator). */
function hitRow(ctx, hit, terms) {
  const admin = isWorkspaceAdmin(ctx.user);
  const attrs = Object.entries({ kind: hit.kind, id: hit.id, project: hit.projectId, issue: hit.issueId, page: hit.pageId, space: hit.spaceId, doc: hit.docId, on: hit.on, mine: hit.mine ? '1' : '' })
    .filter(([, value]) => value).map(([key, value]) => `data-${key}="${esc(value)}"`).join(' ');
  const place = where(ctx, hit);
  const meta = [place, hit.by, hit.kind === 'files' ? size(hit.size) : '', hit.at ? formatWhen(hit.at) : ''].filter(Boolean).map(esc).join(' · ');
  const lead = hit.kind === 'people' ? avatar(person(ctx.ws, hit.id)) : `<span class="hit-glyph">${icon(hit.kind === 'files' && /^image\//i.test(hit.mime || '') ? 'image' : KIND[hit.kind][0])}</span>`;
  const body = `${lead}<span class="hit-text"><b>${marked(hit.title, terms)}</b>${hit.text ? `<span class="hit-snippet">${marked(hit.text, terms)}</span>` : ''}${meta ? `<small>${meta}</small>` : ''}</span>`;
  if (hit.kind === 'people' && !admin) return `<div class="search-hit static">${body}</div>`;
  const download = hit.kind === 'files' && hit.data ? `<a class="icon-button" href="${esc(hit.data)}" download="${esc(hit.title)}" title="${esc(L('내려받기', 'Download'))}" aria-label="${esc(L('내려받기', 'Download'))}">${icon('download')}</a>` : '';
  return `<div class="search-hit"><button type="button" class="search-open" data-action="open-hit" ${attrs}>${body}</button>${download}</div>`;
}

export function searchView(ctx) {
  const text = ctx.ui.searchText || '';
  const terms = searchTerms(text);
  const groups = searchAll(ctx.ws, text, ctx.user?.id);
  const total = SEARCH_KINDS.reduce((sum, kind) => sum + groups[kind].length, 0);
  const tab = SEARCH_KINDS.includes(ctx.ui.searchTab) ? ctx.ui.searchTab : 'all';
  const tabs = [['all', 'search', L('전체', 'All'), total], ...SEARCH_KINDS.map((kind) => [kind, KIND[kind][0], L(KIND[kind][1], KIND[kind][2]), groups[kind].length])]
    .map(([id, glyph, label, count]) => `<button type="button" class="tab${tab === id ? ' active' : ''}${count || id === 'all' ? '' : ' empty-tab'}" data-action="search-tab" data-id="${id}">${icon(glyph)}<span>${esc(label)}</span><span class="chip">${count}</span></button>`).join('');
  const box = `<form class="search-box" data-search-form><label class="quick-search big">${icon('search')}<input id="global-search" value="${esc(text)}" placeholder="${esc(L('과제, 이슈, 작업 공간, 페이지, 문서, 댓글, 파일, 사람, 팀을 찾습니다', 'Find projects, issues, workspaces, pages, documents, comments, files, people and teams'))}" autocomplete="off"></label><button type="submit" class="button primary">${icon('search')}<span>${L('검색', 'Search')}</span></button></form>`;
  let body;
  if (!terms.length) {
    body = `<p class="muted search-hint">${L('찾을 말을 적고 Enter를 누르세요. 여러 낱말을 적으면 모두 들어 있는 것만 나옵니다.', 'Type what to find and press Enter. Several words find only what contains them all.')}</p>`;
  } else if (!total) {
    body = `<div class="center-empty search-none">${icon('search')}<p>${esc(L(`'${text}'에 맞는 것이 없습니다.`, `Nothing matches '${text}'.`))}</p></div>`;
  } else if (tab === 'all') {
    body = SEARCH_KINDS.filter((kind) => groups[kind].length).map((kind) => {
      const list = groups[kind];
      const more = list.length > PREVIEW ? `<button type="button" class="small-button" data-action="search-tab" data-id="${kind}">${icon('chevronRight')}<span>${esc(L(`${list.length}개 모두 보기`, `Show all ${list.length}`))}</span></button>` : '';
      return `<section class="search-group"><h2>${icon(KIND[kind][0])}<span>${esc(L(KIND[kind][1], KIND[kind][2]))}</span><span class="chip">${list.length}</span><span class="grow"></span>${more}</h2>${list.slice(0, PREVIEW).map((hit) => hitRow(ctx, hit, terms)).join('')}</section>`;
    }).join('');
  } else {
    const list = groups[tab];
    body = `<section class="search-group">${list.length ? list.slice(0, 300).map((hit) => hitRow(ctx, hit, terms)).join('') : `<p class="muted">${L('이 분류에는 없습니다.', 'Nothing in this category.')}</p>`}${list.length > 300 ? `<p class="muted">${L('300개까지 보여 줍니다.', 'Showing the first 300.')}</p>` : ''}</section>`;
  }
  return `<div class="page search-page">${pageHead(L('전체 검색', 'Search everything'), '', 'search')}${box}${terms.length ? `<div class="tabs search-tabs">${tabs}</div>` : ''}${body}</div>`;
}
