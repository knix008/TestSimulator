// Quick tooltips. The browser shows a `title` only after about a second (and
// WebView2 cannot be told otherwise), so while the pointer rests on an element
// with a title, its title moves aside (no native tooltip) and this one shows
// after a short pause; moving on to a neighbour shows the next one at once.
// The title is put back when the pointer leaves, so code and tests still read it.

const DELAY = 250;
const WARM = 600; // after a tip closes, the next one within this time shows at once

export function installTooltips(doc = document) {
  if (doc.__myphotoTips) return;
  doc.__myphotoTips = true;
  const tip = doc.createElement('div');
  tip.className = 'quick-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  let owner = null;
  let text = '';
  let timer = null;
  let closedAt = 0;

  const restore = () => {
    if (owner && !owner.hasAttribute('title') && text) owner.setAttribute('title', text);
  };
  const hide = () => {
    clearTimeout(timer);
    timer = null;
    if (!tip.hidden) closedAt = performance.now();
    tip.hidden = true;
    restore();
    owner = null;
    text = '';
  };
  const place = () => {
    if (!owner?.isConnected) { hide(); return; }
    if (!tip.isConnected) doc.body.append(tip);
    tip.textContent = text;
    tip.hidden = false;
    const view = doc.defaultView;
    const r = owner.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    let x = r.left + r.width / 2 - t.width / 2;
    let y = r.bottom + 6;
    if (y + t.height > view.innerHeight - 4) y = r.top - t.height - 6;
    x = Math.max(4, Math.min(view.innerWidth - t.width - 4, x));
    tip.style.left = `${Math.round(x)}px`;
    tip.style.top = `${Math.round(Math.max(4, y))}px`;
  };

  doc.addEventListener('pointerover', (event) => {
    if (event.pointerType === 'touch') return;
    const el = event.target?.closest?.('[title]');
    if (el === owner) return;
    hide();
    if (!el) return;
    const value = el.getAttribute('title');
    if (!value?.trim()) return;
    owner = el;
    text = value;
    el.removeAttribute('title');
    const soon = performance.now() - closedAt < WARM;
    timer = setTimeout(place, soon ? 0 : DELAY);
  }, true);
  doc.addEventListener('pointerout', (event) => {
    if (!owner) return;
    const to = event.relatedTarget;
    if (to && owner.contains(to)) return;
    hide();
  }, true);
  for (const type of ['pointerdown', 'wheel', 'keydown', 'blur']) doc.addEventListener(type, hide, true);
  doc.defaultView.addEventListener('blur', hide);
}
