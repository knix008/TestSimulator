import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// jsdom is missing a handful of browser APIs the app uses. They are filled in
// here rather than guarded in the app, so the production code stays free of
// "if this exists" noise.

if (typeof URL.createObjectURL !== 'function') {
  let seq = 0;
  const store = new Map();
  URL.createObjectURL = vi.fn((blob) => {
    const url = `blob:test/${++seq}`;
    store.set(url, blob);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url) => store.delete(url));
}

// pdf.js (legacy) sees Node and tries to load the `canvas` / `path2d` packages.
if (typeof globalThis.DOMMatrix !== 'function') {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor() {
      this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
      this.is2D = true;
      this.isIdentity = true;
    }
    multiply() { return new DOMMatrix(); }
    inverse() { return new DOMMatrix(); }
    translate() { return new DOMMatrix(); }
    scale() { return new DOMMatrix(); }
    transformPoint(p) { return p || { x: 0, y: 0, z: 0, w: 1 }; }
  };
}

if (typeof globalThis.Path2D !== 'function') {
  globalThis.Path2D = class Path2D {
    addPath() {} closePath() {} moveTo() {} lineTo() {}
    bezierCurveTo() {} quadraticCurveTo() {} arc() {} arcTo() {}
    ellipse() {} rect() {}
  };
}

// jsdom's PointerEvent (when it has one at all) drops button and clientX, which
// the panel resizers and the status-bar grip read. A MouseEvent subclass keeps
// those fields, so a drag can be simulated exactly as the browser reports it.
if (typeof window.PointerEvent !== 'function'
  || !('clientX' in new window.PointerEvent('pointerdown', { clientX: 5 }))
  || new window.PointerEvent('pointerdown', { clientX: 5 }).clientX !== 5) {
  window.PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type, init = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'mouse';
      this.isPrimary = init.isPrimary ?? true;
    }
  };
  globalThis.PointerEvent = window.PointerEvent;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function setPointerCapture() {};
  Element.prototype.releasePointerCapture = function releasePointerCapture() {};
}

if (typeof globalThis.ResizeObserver !== 'function') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {} unobserve() {} disconnect() {}
  };
}

// jsdom has no layout, so a scroller reports zeroes; the reading pane asks for
// these when it decides how many columns a chapter has.
if (!Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')) {
  HTMLElement.prototype.scrollTo = function scrollTo(options) {
    if (typeof options === 'object' && options) {
      if (options.left != null) this.scrollLeft = options.left;
      if (options.top != null) this.scrollTop = options.top;
    }
  };
}
if (!HTMLElement.prototype.scrollBy) {
  HTMLElement.prototype.scrollBy = function scrollBy() {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
if (typeof HTMLCanvasElement.prototype.getContext !== 'function') {
  HTMLCanvasElement.prototype.getContext = () => null;
}

if (typeof globalThis.ImageData !== 'function') {
  globalThis.ImageData = class ImageData {
    constructor(data, width, height) {
      this.data = data;
      this.width = width;
      this.height = height ?? Math.floor(data.length / 4 / width);
    }
  };
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  try { localStorage.clear(); } catch { /* jsdom always has it */ }
  document.documentElement.removeAttribute('data-theme');
});
