// The backlog's sidebar (the lower part of the left panel, views/registry.js `sidebar`): saved filters (open,
// star), epics with their issue counts and versions — both filter the list (the chips above the list show
// and remove them). Drawn from the mounted BacklogView; clicking drives it, its changes redraw this.
import { escapeHtml } from '../../ui/dom.js';
import { icon } from '../../icons.js';
import { getLanguage } from '../../i18n.js';
import { linkSidebar, sideHeadHtml, sideItemHtml, sideNoteHtml, sideCountHtml } from '../shared/sidebar.js';
import { L } from './texts.js';

const fmtDate = (value) => {
  if (value == null || value === '') return '';
  const d = typeof value === 'number' ? new Date(value) : new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(getLanguage() === 'en' ? 'en-US' : 'ko-KR', { year: '2-digit', month: 'short', day: 'numeric' });
};

const sortFav = (list) => [...list].sort((a, b) => Number(b.favourite) - Number(a.favourite) || a.name.localeCompare(b.name));

function render(v) {
  if (!v.live) return sideNoteHtml(L(v.doc?.demo ? 'sideDemo' : 'sideOffline'), icon('info'));
  const counts = v.epicCounts;
  const count = (k) => (counts ? sideCountHtml(counts.get(k) ?? 0) : '');
  const filters = sortFav(v.savedFilters.filter((f) => f.mine)).concat(sortFav(v.savedFilters.filter((f) => !f.mine)));
  const filterItems = filters.length
    ? filters.map((f) => sideItemHtml({
      act: 'filter', value: f.id, glyph: icon(f.favourite ? 'star' : 'filter'), label: f.name, tip: `${f.name} — ${f.jql}`,
      extra: f.mine ? (f.shared ? `<i class="vs-tag">${escapeHtml(L('shared'))}</i>` : '') : `<i class="vs-tag">${escapeHtml(L('sideOthers'))}</i>`,
      active: v.filter?.id === f.id,
      mini: f.mine ? { act: 'star', glyph: icon('star'), tip: L(f.favourite ? 'filterUnstar' : 'filterStar'), pressed: f.favourite } : null,
    })).join('')
    : sideNoteHtml(L('sideNoFilters'));
  const epics = v.sideEpics();
  const versions = v.sideVersions();
  return `${sideHeadHtml(icon('save'), L('filters'), `<button type="button" class="icon-button" data-vs-act="saveAs" data-vs-key="saveAs:" title="${escapeHtml(L('filterSaveAs'))}" aria-label="${escapeHtml(L('filterSaveAs'))}">${icon('plus')}</button>`)}
    <div class="vs-list" data-vs-list="filters">${filterItems}</div>
    ${sideHeadHtml(icon('star'), L('epics'))}
    <div class="vs-list" data-vs-list="epics">
      ${sideItemHtml({ act: 'epic', value: '*', glyph: icon('list'), label: L('allIssues'), extra: counts ? sideCountHtml(v.epicTotal ?? '') : '', active: v.side.epic == null })}
      ${epics.map((e) => sideItemHtml({ act: 'epic', value: e.key, glyph: `<i class="vs-dot round" style="--dot:${escapeHtml(e.color || '#7e4fd8')}"></i>`, label: e.summary, tip: `${e.key} ${e.summary}`, extra: count(e.id), active: v.side.epic === e.key })).join('')}
      ${sideItemHtml({ act: 'epic', value: '', glyph: icon('dot'), label: L('noEpic'), extra: count(''), active: v.side.epic === '' })}
    </div>
    ${sideHeadHtml(icon('tag'), L('versions'))}
    <div class="vs-list" data-vs-list="versions">
      ${sideItemHtml({ act: 'version', value: '*', glyph: icon('list'), label: L('allVersions'), active: !v.side.version })}
      ${versions.length ? versions.map((x) => sideItemHtml({
        act: 'version', value: x.name, glyph: icon(x.released ? 'check' : 'calendar'), label: x.name,
        extra: x.released ? `<i class="vs-tag ok">${escapeHtml(L('released'))}</i>` : x.releaseDate ? `<small>${escapeHtml(fmtDate(x.releaseDate))}</small>` : '',
        active: v.side.version === x.name,
      })).join('') : sideNoteHtml(L('noVersions'))}
    </div>`;
}

/** "Epic: …" / "Version: …" / the open filter, else "All issues". */
function title(v) {
  if (!v.live) return '';
  const parts = [];
  if (v.filter) parts.push(v.filter.name);
  if (v.side.epic != null) {
    const epic = [...v.lookups.epics.values()].find((e) => e.key === v.side.epic);
    parts.push(v.side.epic === '' ? L('noEpic') : epic?.summary ?? v.side.epic);
  }
  if (v.side.version) parts.push(v.side.version);
  return parts.join(' · ') || L('allIssues');
}

function act(v, el) {
  const value = el.dataset.vsValue;
  switch (el.dataset.vsAct) {
    case 'epic': return v.onSide('epic', value);
    case 'version': return v.onSide('version', value);
    case 'filter': return v.filterAction(`open:${value}`);
    case 'star': return v.starFilter(value);
    case 'saveAs': return v.filterAction('saveAs');
    default: return undefined;
  }
}

export function createBacklogSidebar(getView) {
  return linkSidebar(getView, { id: 'backlog', icon: 'list', render, title, act });
}
