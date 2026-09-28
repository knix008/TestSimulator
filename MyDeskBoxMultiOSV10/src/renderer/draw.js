'use strict';

const band = document.getElementById('band');
const lang = new URLSearchParams(location.search).get('lang');
document.getElementById('hint').textContent = window.DeskI18n.t(lang, 'draw.hint');
let start = null;

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') desk.cancelDraw();
});

window.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  start = { x: event.clientX, y: event.clientY };
  band.hidden = false;
  band.style.left = `${start.x}px`;
  band.style.top = `${start.y}px`;
  band.style.width = '0px';
  band.style.height = '0px';
});

window.addEventListener('pointermove', (event) => {
  if (!start) return;
  const x = Math.min(start.x, event.clientX);
  const y = Math.min(start.y, event.clientY);
  band.style.left = `${x}px`;
  band.style.top = `${y}px`;
  band.style.width = `${Math.abs(event.clientX - start.x)}px`;
  band.style.height = `${Math.abs(event.clientY - start.y)}px`;
});

window.addEventListener('pointerup', (event) => {
  if (!start) return;
  const x = Math.min(start.x, event.clientX);
  const y = Math.min(start.y, event.clientY);
  const w = Math.abs(event.clientX - start.x);
  const h = Math.abs(event.clientY - start.y);
  start = null;
  desk.finishDraw({
    x: window.screenX + x,
    y: window.screenY + y,
    w,
    h,
  });
});
