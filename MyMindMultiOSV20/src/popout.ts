// Dialogs in windows of their own, on the desktop. window.open("about:blank#dialog-<name>") asks
// the host (src-tauri/src/popout.rs) for a frameless window owned by the main one. Its document
// belongs to this page, so React renders into it with a portal and every handler and all state
// stay where they were. This file gives that blank document the page's look and keeps it in step.
import { host, isDesktop } from './host'
import { installTooltips } from './tooltips'

let inline = true
// Each window gets a new label: closing one must never reach the one that replaced it.
let opened = 0

/** Asked once at the start: the web build and the GUI tests keep dialogs inside the page. */
export async function preparePopouts(): Promise<void> {
  inline = !isDesktop || (await host.popoutInline().catch(() => true))
  if (isDesktop) await host.popoutReset().catch(() => {})
}

export const canPopOut = () => !inline

export type Popout = {
  win: Window & typeof globalThis
  root: HTMLElement
  label: string
  standsFree: boolean
  stop: () => void
  fit?: number
}

/** Copies the page's stylesheets and <html> attributes, and keeps copying them as they change. */
function mirrorDocument(doc: Document): () => void {
  const base = doc.createElement('base')
  base.href = document.baseURI
  doc.head.append(base)
  const copyStyles = () => {
    for (const node of [...doc.head.querySelectorAll('[data-mirror]')]) node.remove()
    for (const node of document.querySelectorAll('style, link[rel="stylesheet"]')) {
      const copy = node.cloneNode(true) as HTMLLinkElement
      if (copy.tagName === 'LINK') copy.href = (node as HTMLLinkElement).href
      copy.setAttribute('data-mirror', '')
      doc.head.append(copy)
    }
  }
  const copyRoot = () => {
    const from = document.documentElement
    const to = doc.documentElement
    for (const attribute of [...to.attributes]) if (!from.hasAttribute(attribute.name)) to.removeAttribute(attribute.name)
    for (const attribute of from.attributes) to.setAttribute(attribute.name, attribute.value)
    to.classList.add('popout-dialog')
  }
  copyStyles()
  copyRoot()
  const roots = new MutationObserver(copyRoot)
  roots.observe(document.documentElement, { attributes: true })
  const styles = new MutationObserver(copyStyles)
  styles.observe(document.head, { childList: true, subtree: true, characterData: true })
  return () => {
    roots.disconnect()
    styles.disconnect()
  }
}

/** Open windows that stand free, by dialog name. */
const free = new Map<string, Popout>()

/** Brings a free window forward if it is open. */
export function focusPopout(name: string): boolean {
  const pop = free.get(name)
  if (pop) void host.popoutFocus(pop.label)
  return !!pop
}

/** Opens a dialog's window with a styled, empty document. Null when no window can be had. */
export function openPopout(name: string, title: string, width: number, { standsFree = false } = {}): Popout | null {
  opened += 1
  const fragment = `dialog-${standsFree ? 'free-' : ''}${name}-${opened}`
  let win: Window | null = null
  try {
    win = window.open(`about:blank#${fragment}`, '', `width=${Math.round(width)},height=400`)
  } catch {
    win = null
  }
  if (!win?.document) return null
  const doc = win.document
  doc.open()
  doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>')
  doc.close()
  doc.title = title
  const unmirror = mirrorDocument(doc)
  installTooltips(doc)
  doc.addEventListener('dragstart', (event) => event.preventDefault())
  const root = doc.createElement('div')
  root.className = standsFree ? 'popout-root popout-free' : 'popout-root'
  // The tallest a dialog may be: what the screen has, with a little to spare.
  root.style.setProperty('--popout-max', `${Math.max(320, (win.screen?.availHeight ?? 900) - 60)}px`)
  doc.body.append(root)
  const pop: Popout = {
    win: win as Window & typeof globalThis,
    root,
    label: fragment,
    standsFree,
    stop: () => {
      unmirror()
      free.delete(name)
    },
  }
  if (standsFree) free.set(name, pop)
  return pop
}

/** Resolves once the window has taken a new size, or soon if it had that size already. */
function resized(win: Window): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      win.removeEventListener('resize', done)
      clearTimeout(timer)
      setTimeout(resolve, 30)
    }
    const timer = setTimeout(done, 200)
    win.addEventListener('resize', done)
  })
}

// What a frameless window's viewport comes out short of what was asked. The same for all of a kind.
const pads = { fixed: { w: 0, h: 0 }, free: { w: 0, h: 0 } }

/** Sizes the window to fit the element; see sizePopout. */
export function fitPopout(pop: Popout, element: Element, options?: { resizeOnly?: boolean }) {
  const box = element.getBoundingClientRect()
  return sizePopout(pop, { width: Math.ceil(box.width), height: Math.ceil(box.height) }, options)
}

/**
 * Sizes (and unless resizeOnly, places and shows) the window, then looks at its own viewport and
 * asks again with the difference. A newer call takes over from one still running.
 */
export async function sizePopout(pop: Popout, want: { width: number; height: number }, { resizeOnly = false } = {}) {
  pop.fit = (pop.fit ?? 0) + 1
  const fit = pop.fit
  const pad = pop.standsFree ? pads.free : pads.fixed
  let waiting = resized(pop.win)
  await host.popoutShow({ label: pop.label, width: want.width + pad.w, height: want.height + pad.h, resizeOnly })
  for (let i = 0; i < 3; i++) {
    await waiting
    if (fit !== pop.fit || pop.win.closed) return
    const dw = want.width - pop.win.innerWidth
    const dh = want.height - pop.win.innerHeight
    if (Math.abs(dw) < 1 && Math.abs(dh) < 1) return
    pad.w += dw
    pad.h += dh
    waiting = resized(pop.win)
    await host.popoutShow({ label: pop.label, width: want.width + pad.w, height: want.height + pad.h, resizeOnly: true })
  }
}
