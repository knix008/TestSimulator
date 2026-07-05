const ICON_SIZES = [20, 16, 28];
const loadedIconCache = new Map();

function iconCandidates(name) {
  return ICON_SIZES.map((size) => `./assets/icons/s${size}/${name}.png`);
}

export function createIconElement(name, displaySize = 20) {
  const img = document.createElement('img');
  img.width = displaySize;
  img.height = displaySize;
  img.alt = '';
  img.draggable = false;
  loadIconInto(img, name, displaySize, 0);
  return img;
}

function loadIconInto(target, name, displaySize, candidateIndex) {
  const candidates = iconCandidates(name);
  if (candidateIndex >= candidates.length) {
    replaceWithFallback(target, name, displaySize);
    return;
  }

  const src = candidates[candidateIndex];
  if (loadedIconCache.get(src) === false) {
    loadIconInto(target, name, displaySize, candidateIndex + 1);
    return;
  }

  target.src = src;
  target.onerror = () => {
    loadedIconCache.set(src, false);
    loadIconInto(target, name, displaySize, candidateIndex + 1);
  };
}

function replaceWithFallback(target, name, displaySize) {
  const svg = createSvgFallback(name, displaySize);
  if (target.replaceWith) {
    target.replaceWith(svg);
  } else {
    target.parentElement?.replaceChild(svg, target);
  }
}

export function renderIcon(name, size = 16) {
  const wrapper = document.createElement('span');
  wrapper.appendChild(createIconElement(name, size));
  return wrapper.innerHTML;
}

export function setButtonIcon(button, name, size = 24) {
  button.replaceChildren();
  button.appendChild(createIconElement(name, size));
}

function createSvgFallback(name, size) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '10');
  circle.setAttribute('fill', 'none');
  circle.setAttribute('stroke', 'currentColor');
  circle.setAttribute('stroke-width', '1.5');
  svg.appendChild(circle);

  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', '12');
  text.setAttribute('y', '16');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('font-size', '10');
  text.setAttribute('fill', 'currentColor');
  text.textContent = (name || '?').slice(0, 1).toUpperCase();
  svg.appendChild(text);
  return svg;
}

window.createSvgFallback = createSvgFallback;
