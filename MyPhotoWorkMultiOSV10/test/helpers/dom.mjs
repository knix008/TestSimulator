// A browser-shaped environment for the editor's pixel code, backed by the real
// Skia canvas from @napi-rs/canvas. Everything the app touches at module scope
// (document, window, Image, localStorage) has to exist before src/* is imported,
// so this module is loaded through --import, ahead of any test file.
import { createCanvas, Image, ImageData, Path2D, DOMMatrix } from '@napi-rs/canvas'

class MemoryStorage {
  #map = new Map()
  getItem(key) { return this.#map.has(String(key)) ? this.#map.get(String(key)) : null }
  setItem(key, value) { this.#map.set(String(key), String(value)) }
  removeItem(key) { this.#map.delete(String(key)) }
  clear() { this.#map.clear() }
  get length() { return this.#map.size }
  key(index) { return [...this.#map.keys()][index] ?? null }
}

// Records what downloadDataUrl() would have handed to the browser.
export const downloads = []

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase()
    this.style = { setProperty() {}, removeProperty() {} }
    this.dataset = {}
    this.children = []
  }
  appendChild(child) { this.children.push(child); return child }
  removeChild(child) {
    this.children = this.children.filter((item) => item !== child)
    return child
  }
  setAttribute(name, value) { this[name] = value }
  addEventListener() {}
  removeEventListener() {}
  // The clipboard fallback builds a throwaway textarea and selects it.
  select() {}
  focus() {}
  blur() {}
  click() {
    if (this.tagName === 'A') {
      downloads.push({ href: this.href, download: this.download })
    }
  }
}

function createElement(tag) {
  if (String(tag).toLowerCase() === 'canvas') {
    // Same starting size the DOM uses, so code that only sets one axis behaves alike.
    return createCanvas(300, 150)
  }
  return new FakeElement(tag)
}

const documentShim = {
  createElement,
  documentElement: new FakeElement('html'),
  body: new FakeElement('body'),
  fonts: { ready: Promise.resolve(), load: async () => [], check: () => true },
  addEventListener() {},
  removeEventListener() {},
}

const windowShim = {
  localStorage: new MemoryStorage(),
  devicePixelRatio: 1,
  document: documentShim,
  addEventListener() {},
  removeEventListener() {},
  requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
}

globalThis.document = documentShim
globalThis.window = windowShim
globalThis.localStorage = windowShim.localStorage
globalThis.Image = Image
globalThis.ImageData = ImageData
globalThis.Path2D = Path2D
globalThis.DOMMatrix = DOMMatrix
globalThis.HTMLCanvasElement = createCanvas(1, 1).constructor
