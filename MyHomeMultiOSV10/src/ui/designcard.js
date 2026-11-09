// A site design drawn as a little page (menu bar, hero with a button, three cards, footer) in its
// colours, fonts and corners — the same card in the design window and in the Blocks panel.
import { FONTS } from '../domain/designs.js';
import { icon } from '../icons.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** d: a design (preset or customAsDesign); attrs: the data attribute(s) that pick it. */
export function designCardHtml(d, { active = false, name = '', mockTitle = 'Aa', attrs = '', cls = '' } = {}) {
  const font = (id) => escapeHtml(FONTS[id]?.css ?? FONTS.sans.css);
  const r = Math.min(Number(d.radius) || 0, 14);
  return `<button class="design-card ${cls} ${active ? 'active' : ''}" ${attrs} title="${escapeHtml(name)}" role="radio" aria-checked="${active}">
    <span class="design-mock" style="background:${d.bg};color:${d.text};border-color:${d.border}">
      <span class="dm-nav" style="background:${d.headerBg};color:${d.headerText}"><b style="font-family:${font(d.headingFont)}">Aa</b><i style="background:${d.primary};border-radius:${r}px"></i></span>
      <span class="dm-hero" style="background:${d.primary};color:${d.primaryText}"><b style="font-family:${font(d.headingFont)}">${escapeHtml(mockTitle)}</b><i style="background:${d.primaryText};border-radius:${r}px"></i></span>
      <span class="dm-cards">${[0, 1, 2].map(() => `<i style="background:${d.surface};border:1px solid ${d.border};border-radius:${r / 2}px"><em style="background:${d.accent}"></em></i>`).join('')}</span>
      <span class="dm-foot" style="background:${d.footerBg}"></span>
    </span>
    <span class="design-name">${escapeHtml(name)}${active ? icon('check', 'icon check') : ''}</span>
  </button>`;
}
