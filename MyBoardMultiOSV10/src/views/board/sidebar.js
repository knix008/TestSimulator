// The board's sidebar (the lower part of the left panel, views/registry.js `sidebar`): the board's choices —
// quick filters and the built-in "only my issues" / "recently updated" as switches, the swimlane mode, and
// the columns (icon, name, count) to jump to. The same state as the board's own bar: both drive the view
// and the view redraws this when it draws (onSideChange).
import { escapeHtml } from '../../ui/dom.js';
import { icon } from '../../icons.js';
import { renderIconRef } from '../../ui/iconref.js';
import { linkSidebar, sideHeadHtml, sideItemHtml, sideCountHtml, sideNoteHtml } from '../shared/sidebar.js';
import { GROUP_ICONS } from './model.js';

function render(v) {
  const t = v.t;
  if (!v.data) return sideNoteHtml(t('board.side.loading'));
  const quick = (v.data.quickFilters ?? []).map((q) => sideItemHtml({
    act: 'quick', value: q.id, glyph: q.icon ? renderIconRef(q.icon, { size: 16 }) : icon('filter'), label: q.name, tip: q.jql ? `${q.name} — ${q.jql}` : q.name,
    pressed: v.prefs.quick.includes(q.id),
  }));
  if (!v.demo) {
    quick.push(sideItemHtml({ act: 'builtin', value: 'mine', glyph: icon('user'), label: t('board.onlyMine'), tip: t('board.onlyMineTip'), pressed: Boolean(v.prefs.mine) }));
    quick.push(sideItemHtml({ act: 'builtin', value: 'recent', glyph: icon('clock'), label: t('board.recent'), tip: t('board.recentTip'), pressed: Boolean(v.prefs.recent) }));
  }
  const mode = v.mode;
  const lanes = v.groupItems().map((item) => sideItemHtml({
    act: 'group', value: item.value, glyph: icon(item.glyph ?? GROUP_ICONS[item.value] ?? 'menu'), label: item.label,
    extra: item.hint ? `<i class="vs-tag">${escapeHtml(item.hint)}</i>` : '', active: item.value === mode,
  })).join('');
  const columns = (v.layout?.columns ?? v.data.columns ?? []).map((c) => sideItemHtml({
    act: 'column', value: c.id, glyph: c.icon ? renderIconRef(c.icon, { size: 16 }) : icon(c.done ? 'check' : c.backlog ? 'list' : 'columns'), label: c.name,
    extra: sideCountHtml(c.total ?? c.count ?? '', c.over ? 'bad' : ''), tip: c.name,
  })).join('');
  return `${sideHeadHtml(icon('filter'), t('board.quickFilters'))}
    <div class="vs-list" data-vs-list="quick">${quick.join('') || sideNoteHtml(t('board.side.noQuick'))}</div>
    ${sideHeadHtml(icon('menu'), t('board.groupBy'))}
    <div class="vs-list" data-vs-list="lanes">${lanes}</div>
    ${sideHeadHtml(icon('columns'), t('board.side.columns'))}
    <div class="vs-list" data-vs-list="columns">${columns}</div>`;
}

const title = (v) => v.data?.board?.name ?? v.ctx?.workspace?.board?.name ?? '';

function act(v, el) {
  const value = el.dataset.vsValue;
  switch (el.dataset.vsAct) {
    case 'quick':
      v.prefs.quick = v.prefs.quick.includes(value) ? v.prefs.quick.filter((q) => q !== value) : [...v.prefs.quick, value];
      v.savePrefs(); v.renderFilters(); return v.load({ quiet: true });
    case 'builtin':
      v.prefs[value] = !v.prefs[value];
      v.savePrefs(); v.renderFilters(); return v.render();
    case 'group': return v.setGroup(value);
    case 'column': {
      const head = v.boardEl?.querySelector(`.bv-col-head[data-col="${CSS.escape(value)}"]`);
      head?.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'smooth' });
      head?.classList.add('bv-flash-head');
      setTimeout(() => head?.classList.remove('bv-flash-head'), 900);
      return undefined;
    }
    default: return undefined;
  }
}

export function createBoardSidebar(getView) {
  return linkSidebar(getView, { id: 'board', icon: 'columns', render, title, act });
}
