// The in-app tutorial: a guided tour over the real window. Each step lights up one part (a spotlight cut out of a
// dimmed layer) and explains it in a card next to it; Prev / Next / Skip, ← → and Esc. Some steps prepare the
// window first (open a sample agent, select a node). The steps' texts are in i18n/agents.js (tour.*).

/** The tour's steps: target selector, text key, and what to get ready before showing it. */
export const TOUR_STEPS = [
  { id: 'start', target: '.start-hero-fixed', prepare: (c) => c.showStart() },
  { id: 'templates', target: '.start-card.pipelineTemplates, .start-card.devTemplates', prepare: (c) => c.showStart() },
  { id: 'describe', target: '#toolbar [data-command="describe"]' },
  { id: 'palette', target: '#palette-panel', prepare: (c) => c.openSample() },
  { id: 'canvas', target: '.canvas-host', prepare: (c) => c.openSample() },
  { id: 'inspector', target: '#right-panel', prepare: (c) => { c.openSample(); c.selectSecond(); } },
  { id: 'run', target: '#toolbar [data-command="runAgent"]' },
  { id: 'bottom', target: '#bottom-panel', prepare: (c) => c.showBottom('progress') },
  { id: 'chat', target: '#toolbar [data-command="chat"]' },
  { id: 'models', target: '#toolbar [data-command="view:models"]' },
  { id: 'print', target: '#toolbar [data-command="print"]' },
  { id: 'help', target: '#menubar [data-menu="help"]' },
];

/**
 * ctx: { t, icon, escapeHtml, root, showStart(), openSample(), selectSecond(), showBottom(tab), onEnd(done) }
 * → { next, prev, close, index, element } (also on window.__myagentsTour for tests)
 */
export function startTour(ctx) {
  const { t, icon, escapeHtml } = ctx;
  document.querySelector('.tour')?.remove();
  const el = document.createElement('div');
  el.className = 'tour';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = '<div class="tour-spot"></div><div class="tour-card" tabindex="-1"></div>';
  (ctx.root ?? document.body).append(el);
  const spot = el.querySelector('.tour-spot');
  const card = el.querySelector('.tour-card');
  let index = 0;
  let ended = false;

  const visible = (node) => { if (!node) return false; const r = node.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(node).visibility !== 'hidden'; };
  const targetOf = (step) => [...document.querySelectorAll(step.target)].find(visible) ?? null;

  function place() {
    const step = TOUR_STEPS[index];
    const target = targetOf(step);
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (target) {
      const r = target.getBoundingClientRect();
      const pad = 6;
      const box = { left: Math.max(4, r.left - pad), top: Math.max(4, r.top - pad), right: Math.min(W - 4, r.right + pad), bottom: Math.min(H - 4, r.bottom + pad) };
      Object.assign(spot.style, { display: 'block', left: `${box.left}px`, top: `${box.top}px`, width: `${box.right - box.left}px`, height: `${box.bottom - box.top}px` });
      el.classList.remove('no-target');
      // the card beside the spot where it fits: below, above, right, left, else over its corner
      const cw = card.offsetWidth;
      const ch = card.offsetHeight;
      const gap = 14;
      const spots = [
        [box.left, box.bottom + gap], [box.left, box.top - gap - ch],
        [box.right + gap, box.top], [box.left - gap - cw, box.top],
        [box.left + 16, box.top + 16],
      ];
      const fits = ([x, y]) => x >= 8 && y >= 8 && x + cw <= W - 8 && y + ch <= H - 8;
      let [x, y] = spots.find(fits) ?? spots.at(-1);
      x = Math.min(Math.max(8, x), W - cw - 8);
      y = Math.min(Math.max(8, y), H - ch - 8);
      Object.assign(card.style, { left: `${x}px`, top: `${y}px` });
    } else {
      spot.style.display = 'none';
      el.classList.add('no-target');
      Object.assign(card.style, { left: `${(W - card.offsetWidth) / 2}px`, top: `${(H - card.offsetHeight) / 2}px` });
    }
  }

  function draw() {
    const step = TOUR_STEPS[index];
    const last = index === TOUR_STEPS.length - 1;
    card.innerHTML = `<div class="tour-head">${icon('bulb')}<b>${escapeHtml(t(`tour.${step.id}.title`))}</b><span class="grow"></span><small>${index + 1} / ${TOUR_STEPS.length}</small><button type="button" class="icon-button" data-tour="close" title="${escapeHtml(t('tour.skip'))}" aria-label="${escapeHtml(t('tour.skip'))}">${icon('close')}</button></div>
      <p class="tour-text">${escapeHtml(t(`tour.${step.id}.text`))}</p>
      <div class="tour-dots">${TOUR_STEPS.map((s, i) => `<i class="${i === index ? 'on' : i < index ? 'done' : ''}"></i>`).join('')}</div>
      <div class="tour-foot"><button type="button" class="button" data-tour="skip">${escapeHtml(t('tour.skip'))}</button><span class="grow"></span>
        <button type="button" class="button" data-tour="prev" ${index ? '' : 'disabled'}>${icon('chevronLeft')}<span>${escapeHtml(t('tour.prev'))}</span></button>
        <button type="button" class="button primary" data-tour="next">${escapeHtml(t(last ? 'tour.finish' : 'tour.next'))}${last ? icon('check') : icon('chevronRight')}</button></div>`;
    el.dataset.step = step.id;
    place();
    card.querySelector('[data-tour="next"]').focus();
  }

  async function go(i) {
    if (ended) return;
    index = Math.max(0, Math.min(TOUR_STEPS.length - 1, i));
    const step = TOUR_STEPS[index];
    try { await step.prepare?.(ctx); } catch { /* a step that cannot get ready still shows its text */ }
    // the window may still move after a preparation (a view opens, panels lay out)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    draw();
  }

  function close(done = false) {
    if (ended) return;
    ended = true;
    el.remove();
    window.removeEventListener('resize', place);
    document.removeEventListener('keydown', onKey, true);
    if (window.__myagentsTour === api) delete window.__myagentsTour;
    ctx.onEnd?.(done);
  }
  function onKey(event) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(false); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); api.next(); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); event.stopPropagation(); api.prev(); }
  }
  el.addEventListener('click', (event) => {
    const b = event.target.closest('[data-tour]');
    if (!b || b.disabled) return;
    const a = b.dataset.tour;
    if (a === 'next') api.next(); else if (a === 'prev') api.prev(); else close(false);
  });
  window.addEventListener('resize', place);
  document.addEventListener('keydown', onKey, true);

  const api = {
    next: () => (index === TOUR_STEPS.length - 1 ? close(true) : go(index + 1)),
    prev: () => go(index - 1),
    close: () => close(false),
    get index() { return index; },
    get ended() { return ended; },
    element: el,
  };
  window.__myagentsTour = api;
  go(0);
  return api;
}
