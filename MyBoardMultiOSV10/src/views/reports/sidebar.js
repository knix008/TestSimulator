// The reports view's sidebar (the lower part of the left panel, views/registry.js `sidebar`): the reports to
// pick from and the dashboards (mine, then shared) with "new dashboard". Drawn from the mounted ReportsView;
// clicking drives it (pickReport / pickDashboard / newDashboard), its changes redraw this (onSideChange).
import { escapeHtml } from '../../ui/dom.js';
import { icon } from '../../icons.js';
import { linkSidebar, sideHeadHtml, sideItemHtml, sideNoteHtml } from '../shared/sidebar.js';
import { REPORT_IDS, REPORTS } from './defs.js';
import { L } from './texts.js';

// The dashboards list while the dashboards page is not open (the Dashboards module keeps its own when it is).
let cached = null;
let loading = false;

function dashboardList(v, refresh) {
  if (v.dashboards?.list) { cached = v.dashboards.list; return cached; }
  if (!cached && !loading && v.live && v.api?.dashboards) {
    loading = true;
    v.api.dashboards().then((list) => { cached = Array.isArray(list) ? list : list?.items ?? []; }).catch(() => { cached = []; }).finally(() => { loading = false; refresh(); });
  }
  return cached ?? [];
}

function render(v, ctx, refresh) {
  if (!v.live) return sideNoteHtml(L(v.doc?.demo ? 'demoTitle' : 'offlineTitle'), icon('info'));
  const onReports = v.prefs.tab === 'reports';
  const reports = REPORT_IDS.map((id) => sideItemHtml({
    act: 'report', value: id, glyph: icon(REPORTS[id].icon), label: L(`r_${id}`), tip: `${L(`r_${id}`)} — ${L(`d_${id}`)}`,
    active: onReports && v.prefs.report === id,
  })).join('');
  const list = dashboardList(v, refresh);
  const currentDash = v.dashboards?.dash?.id ?? v.prefs.dashboardId ?? null;
  const row = (d) => sideItemHtml({
    act: 'dashboard', value: d.id, glyph: icon('grid'), label: d.name, tip: d.name,
    extra: d.shared ? `<i class="vs-tag">${escapeHtml(L('dashShared'))}</i>` : '',
    active: !onReports && d.id === currentDash,
  });
  const mine = list.filter((d) => d.mine);
  const others = list.filter((d) => !d.mine);
  const newButton = `<button type="button" class="icon-button" data-vs-act="newDashboard" data-vs-key="newDashboard:" title="${escapeHtml(L('dashNew'))}" aria-label="${escapeHtml(L('dashNew'))}">${icon('plus')}</button>`;
  return `${sideHeadHtml(icon('viewReports'), L('reports'))}
    <div class="vs-list" data-vs-list="reports">${reports}</div>
    ${sideHeadHtml(icon('grid'), L('dashboards'), newButton)}
    <div class="vs-list" data-vs-list="dashboards">
      ${list.length ? '' : sideNoteHtml(loading ? '…' : L('noDashboard'))}
      ${mine.length && others.length ? `<p class="vs-group">${escapeHtml(L('dashMine'))}</p>` : ''}${mine.map(row).join('')}
      ${others.length ? `<p class="vs-group">${escapeHtml(L('dashSharedGroup'))}</p>${others.map(row).join('')}` : ''}
    </div>`;
}

/** The chosen report, or the open dashboard's name. */
function title(v) {
  if (!v.live) return '';
  if (v.prefs.tab === 'reports') return L(`r_${v.prefs.report}`);
  return v.dashboards?.dash?.name ?? L('dashboards');
}

function act(v, el) {
  const value = el.dataset.vsValue;
  switch (el.dataset.vsAct) {
    case 'report': return v.pickReport(value);
    case 'dashboard': return v.pickDashboard(value);
    case 'newDashboard': cached = null; return v.newDashboard();
    default: return undefined;
  }
}

export function createReportsSidebar(getView) {
  let link = null;
  const refresh = () => link?.refresh();
  link = linkSidebar(getView, { id: 'reports', icon: 'viewReports', render: (v, ctx) => render(v, ctx, refresh), title, act });
  return link;
}
