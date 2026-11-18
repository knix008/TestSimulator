import { getLanguage } from '../i18n.js';
import { renderMarkdown } from '../domain/markdown.js';
import { PAGE_TEMPLATES, TEMPLATE_GROUPS, templateBody, templateById } from '../domain/page-templates.js';
import { esc, icon, L } from './bits.js';

/** The window that starts a new page: a blank page or one of the templates, grouped by kind of work, with a preview. */
export function templatePicker(ctx) {
  const modal = ctx.ui.modal || {};
  const group = TEMPLATE_GROUPS.some((item) => item.id === modal.group) ? modal.group : 'all';
  const pick = modal.pick || 'blank';
  const language = getLanguage() === 'en' ? 'en' : 'ko';
  const groups = [{ id: 'all', icon: 'layers', ko: '전체', en: 'All' }, ...TEMPLATE_GROUPS].map((item) => {
    const count = item.id === 'all' ? PAGE_TEMPLATES.length : PAGE_TEMPLATES.filter((tpl) => tpl.group === item.id).length;
    return `<button type="button" class="tpl-group${group === item.id ? ' active' : ''}" data-action="template-group" data-id="${item.id}">${icon(item.icon)}<span>${esc(L(item.ko, item.en))}</span><small>${count}</small></button>`;
  }).join('');
  const shown = PAGE_TEMPLATES.filter((tpl) => group === 'all' || tpl.group === group);
  const card = (tpl) => {
    const groupName = TEMPLATE_GROUPS.find((item) => item.id === tpl.group);
    const text = `${tpl.ko} ${tpl.en} ${tpl.about[0]} ${tpl.about[1]} ${groupName?.ko || ''} ${groupName?.en || ''}`.toLowerCase();
    return `<button type="button" class="tpl-card${pick === tpl.id ? ' active' : ''}" data-action="template-pick" data-id="${esc(tpl.id)}" data-text="${esc(text)}"><span class="tpl-icon">${icon(tpl.icon)}</span><span class="tpl-text"><b>${esc(L(tpl.ko, tpl.en))}</b><small>${esc(L(tpl.about[0], tpl.about[1]))}</small></span></button>`;
  };
  const blank = `<button type="button" class="tpl-card blank${pick === 'blank' ? ' active' : ''}" data-action="template-pick" data-id="blank" data-text="blank 빈 페이지 empty"><span class="tpl-icon">${icon('file')}</span><span class="tpl-text"><b>${L('빈 페이지', 'Blank page')}</b><small>${L('처음부터 씁니다', 'Start from nothing')}</small></span></button>`;
  const chosen = templateById(pick);
  const preview = chosen
    ? `<div class="tpl-preview-head"><b>${esc(L(chosen.ko, chosen.en))}</b><small>${esc(L(chosen.about[0], chosen.about[1]))}</small></div><div class="md doc-body tpl-preview-body">${renderMarkdown(templateBody(chosen, language))}</div>`
    : `<div class="tpl-preview-head"><b>${L('빈 페이지', 'Blank page')}</b><small>${L('제목만 있는 빈 페이지로 시작합니다.', 'Starts with a title and nothing else.')}</small></div><div class="tpl-preview-empty">${icon('file')}</div>`;
  const where = modal.parentId ? L('하위 페이지 만들기', 'New child page') : L('새 페이지 만들기', 'New page');
  return `<div class="modal-back"><div class="modal template-picker" role="dialog" aria-label="${esc(where)}">
    <h2>${icon('plus')}<span class="grow">${esc(where)}</span><button type="button" class="icon-button" data-action="modal-cancel" aria-label="${esc(L('닫기', 'Close'))}">${icon('close')}</button></h2>
    <div class="tpl-body">
      <nav class="tpl-groups" aria-label="${esc(L('분류', 'Categories'))}">${groups}</nav>
      <div class="tpl-list">
        <label class="quick-search">${icon('search')}<input id="template-find" placeholder="${esc(L('샘플 찾기', 'Find a template'))}" autocomplete="off"></label>
        <div class="tpl-cards">${group === 'all' ? blank : ''}${shown.map(card).join('')}</div>
      </div>
      <aside class="tpl-preview">${preview}</aside>
    </div>
    <div class="modal-foot"><span class="muted grow">${esc(L(`샘플 ${PAGE_TEMPLATES.length}개 · 두 번 누르면 바로 만듭니다`, `${PAGE_TEMPLATES.length} templates · double-click to create`))}</span>
      <button type="button" class="button" data-action="modal-cancel">${icon('close')}<span>${L('취소', 'Cancel')}</span></button>
      <button type="button" class="button primary" data-action="template-use" data-id="${esc(pick)}">${icon('check')}<span>${chosen ? L('이 샘플로 만들기', 'Create from this template') : L('빈 페이지 만들기', 'Create a blank page')}</span></button>
    </div>
  </div></div>`;
}
