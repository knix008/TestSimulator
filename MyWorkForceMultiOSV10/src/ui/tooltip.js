// Quick tooltips. The browser waits about a second before it shows a `title`; here the same text shows
// after a short pause. The title moves to data-tip while the pointer is on the element so the slow
// native tooltip never appears too, and an aria-label keeps the name for screen readers.
const DELAY = 120;
let tip = null;
let timer = 0;
let current = null;

function box() {
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'quick-tip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    document.body.appendChild(tip);
  }
  return tip;
}

function hide() {
  clearTimeout(timer);
  if (current?.dataset.tip != null && !current.hasAttribute('title')) current.setAttribute('title', current.dataset.tip);
  current = null;
  if (tip) tip.hidden = true;
}

function place(el) {
  const text = el.dataset.tip || '';
  if (!text || !el.isConnected) return;
  const node = box();
  node.textContent = text;
  node.hidden = false;
  const r = el.getBoundingClientRect();
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  let left = Math.round(r.left + r.width / 2 - w / 2);
  left = Math.max(6, Math.min(left, window.innerWidth - w - 6));
  let top = Math.round(r.bottom + 6);
  if (top + h > window.innerHeight - 4) top = Math.round(r.top - h - 6);
  node.style.left = `${left}px`;
  node.style.top = `${top}px`;
}

export function installTooltips(root = document) {
  root.addEventListener('pointerover', (event) => {
    const el = event.target.closest?.('[title], [data-tip]');
    if (!el || el === current) return;
    hide();
    const title = el.getAttribute('title');
    if (title) {
      el.dataset.tip = title;
      if (!el.hasAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label', title);
      el.removeAttribute('title');
    }
    if (!el.dataset.tip) return;
    current = el;
    timer = setTimeout(() => place(el), DELAY);
  });
  root.addEventListener('pointerout', (event) => {
    if (!current) return;
    if (event.relatedTarget && current.contains(event.relatedTarget)) return;
    hide();
  });
  for (const type of ['pointerdown', 'keydown', 'scroll', 'blur']) window.addEventListener(type, hide, true);
}
