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
