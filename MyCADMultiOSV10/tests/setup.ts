class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() { return this.data.size }
  clear() { this.data.clear() }
  getItem(key: string) { return this.data.get(key) ?? null }
  key(index: number) { return Array.from(this.data.keys())[index] ?? null }
  removeItem(key: string) { this.data.delete(key) }
  setItem(key: string, value: string) { this.data.set(key, value) }
}

HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext

if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== 'function') {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true })
}

Object.defineProperty(window, 'print', { value: () => undefined, configurable: true })

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver
}

// jsdom has no PointerEvent, so a dispatched pointer event arrives without the
// coordinates a browser would carry. A MouseEvent stands in for it.
if (typeof globalThis.PointerEvent === 'undefined') {
  class JsdomPointerEvent extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string
    readonly isPrimary: boolean
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 1
      this.pointerType = init.pointerType ?? 'mouse'
      this.isPrimary = init.isPrimary ?? true
    }
  }
  globalThis.PointerEvent = JsdomPointerEvent as unknown as typeof PointerEvent
}

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => undefined
  Element.prototype.releasePointerCapture = () => undefined
  Element.prototype.hasPointerCapture = () => false
}

