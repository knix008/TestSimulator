// The project settings' sidebar (the lower part of the left panel, views/registry.js `sidebar`): the section
// list, grouped, with the open section highlighted. Clicking opens that section in the centre (view.go);
// the view redraws this whenever it renders (onSideChange).
import { icon } from '../../icons.js';
import { t } from '../../i18n.js';
import { linkSidebar, sideHeadHtml, sideItemHtml } from '../shared/sidebar.js';

const tr = (key, params) => t(`ps.${key}`, params);
const GROUP_GLYPHS = { project: 'folder', issues: 'layers', flow: 'routeCurved', board: 'columns', data: 'database' };

function render(v) {
  const sections = v.visibleSections();
  let group = null;
  let html = '';
  for (const s of sections) {
    if (s.group !== group) {
      if (group !== null) html += '</div>';
      group = s.group;
      html += `${sideHeadHtml(icon(GROUP_GLYPHS[group] ?? 'gear'), tr(`group.${group}`))}<div class="vs-list" data-vs-list="${group}">`;
    }
    html += sideItemHtml({ act: 'section', value: s.id, glyph: icon(s.glyph), label: tr(`section.${s.id}`), tip: `${tr(`section.${s.id}`)} — ${tr(`desc.${s.id}`)}`, active: s.id === v.section });
  }
  return group !== null ? `${html}</div>` : html;
}

const title = (v) => tr(`section.${v.section}`);

function act(v, el) {
  if (el.dataset.vsAct === 'section') v.go(el.dataset.vsValue);
}

export function createSettingsSidebar(getView) {
  return linkSidebar(getView, { id: 'projectSettings', icon: 'gear', render, title, act });
}
