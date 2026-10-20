import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
}

// pdf.js (legacy) sees Node and tries to load the `canvas` / `path2d` packages.
// jsdom has neither, so it prints "Cannot polyfill DOMMatrix / Path2D" unless
// the constructors already exist on globalThis.
if (typeof globalThis.DOMMatrix !== 'function') {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor() {
      this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
      this.m11 = 1; this.m12 = 0; this.m13 = 0; this.m14 = 0;
      this.m21 = 0; this.m22 = 1; this.m23 = 0; this.m24 = 0;
      this.m31 = 0; this.m32 = 0; this.m33 = 1; this.m34 = 0;
      this.m41 = 0; this.m42 = 0; this.m43 = 0; this.m44 = 1;
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
    addPath() {}
    closePath() {}
    moveTo() {}
    lineTo() {}
    bezierCurveTo() {}
    quadraticCurveTo() {}
    arc() {}
    arcTo() {}
    ellipse() {}
    rect() {}
  };
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  try { localStorage.clear(); } catch { /* jsdom always has it */ }
});
