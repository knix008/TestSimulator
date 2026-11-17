// Full-screen region picker shown on every monitor over a frozen screenshot.
// Drag to select, click for the whole monitor, Esc or right-click to cancel.
import './overlay.css';
import { clampRect, rectFromPoints } from './domain/geometry.js';
import { t } from './i18n.js';
import { finishRegionSelect, overlayFrame, overlayReady } from './platform/native.js';

const root = document.querySelector('#app');
root.innerHTML = `
  <canvas class="overlay-canvas"></canvas>
  <div class="overlay-hint">${t('overlay.hint')}</div>
  <div class="overlay-size" hidden></div>`;
const canvas = root.querySelector('canvas');
const hint = root.querySelector('.overlay-hint');
const sizeLabel = root.querySelector('.overlay-size');
const context = canvas.getContext('2d', { alpha: false });

let base = null; // canvas holding the frozen screenshot
let image = { width: 1, height: 1 };
let anchor = null;
let pointer = null;
let finished = false;
let frameQueued = false;

const toImagePoint = (event) => ({ x: (event.clientX * image.width) / window.innerWidth, y: (event.clientY * image.height) / window.innerHeight });

function selection() {
  if (!anchor || !pointer) return null;
  return clampRect(rectFromPoints(anchor, pointer), image.width, image.height);
}

function draw() {
  frameQueued = false;
  if (!base) return;
  context.drawImage(base, 0, 0);
  context.fillStyle = 'rgba(6, 9, 14, 0.48)';
  context.fillRect(0, 0, image.width, image.height);
  const scale = image.width / window.innerWidth;
  const rect = selection();
  if (rect && rect.width > 0 && rect.height > 0) {
    context.drawImage(base, rect.x, rect.y, rect.width, rect.height, rect.x, rect.y, rect.width, rect.height);
    context.strokeStyle = '#4cc2ff';
    context.lineWidth = Math.max(1, Math.round(1.5 * scale));
    context.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
    sizeLabel.hidden = false;
    sizeLabel.textContent = `${rect.width} × ${rect.height}`;
    const left = (rect.x / scale);
    const top = (rect.y / scale);
    sizeLabel.style.left = `${Math.min(left, window.innerWidth - 120)}px`;
    sizeLabel.style.top = `${top > 34 ? top - 30 : top + 8}px`;
  } else {
    sizeLabel.hidden = true;
    if (pointer) {
      // Crosshair guides help to start the drag exactly on a pixel edge.
      context.strokeStyle = 'rgba(76, 194, 255, 0.75)';
      context.lineWidth = Math.max(1, Math.round(scale));
      context.beginPath();
      context.moveTo(Math.round(pointer.x) + 0.5, 0);
      context.lineTo(Math.round(pointer.x) + 0.5, image.height);
      context.moveTo(0, Math.round(pointer.y) + 0.5);
      context.lineTo(image.width, Math.round(pointer.y) + 0.5);
      context.stroke();
    }
  }
}

function queueDraw() {
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(draw);
}

async function finish(rect) {
  if (finished) return;
  finished = true;
  try {
    await finishRegionSelect(rect);
  } catch {
    // The main window reports errors; an overlay must never stay stuck on screen.
    window.close();
  }
}

canvas.addEventListener('pointerdown', (event) => {
  if (event.button === 2) return finish(null);
  if (event.button !== 0) return;
  canvas.setPointerCapture(event.pointerId);
  anchor = toImagePoint(event);
  pointer = anchor;
  hint.classList.add('faded');
  queueDraw();
});

canvas.addEventListener('pointermove', (event) => {
  pointer = toImagePoint(event);
  queueDraw();
});

canvas.addEventListener('pointerup', (event) => {
  if (event.button !== 0 || !anchor) return;
  pointer = toImagePoint(event);
  const rect = selection();
  const tiny = !rect || rect.width < 4 || rect.height < 4;
  finish(tiny ? { x: 0, y: 0, width: image.width, height: image.height } : rect);
});

canvas.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') finish(null);
});
window.addEventListener('resize', queueDraw);

async function initialize() {
  try {
    const frame = await overlayFrame();
    image = { width: frame.width, height: frame.height };
    base = document.createElement('canvas');
    base.width = frame.width;
    base.height = frame.height;
    base.getContext('2d').putImageData(new ImageData(frame.pixels, frame.width, frame.height), 0, 0);
    canvas.width = frame.width;
    canvas.height = frame.height;
    draw();
    await overlayReady();
  } catch {
    finish(null);
  }
}

initialize();
