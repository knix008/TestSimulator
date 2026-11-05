// Every button has a tooltip, which appears at once: the system's own waits too long for a toolbar
// of icons. A button that sets no title shows its name; symbols are spelled out here.
let translate: (key: string) => string = (key) => key

const SYMBOLS: Record<string, string> = { '-': 'tip.decrease', '−': 'tip.decrease', '+': 'tip.increase', '×': 'tip.close', resize: 'tip.resize' }
const SELECTOR = 'button, [role=button], [title]'
const DELAY_MS = 100
const TIP_ATTRIBUTE = 'data-tip'

export function setTipTranslator(t: (key: string) => string) {
  translate = t
}

export function tipFor(element: Element): string {
  // A switch has no words of its own: it is named by the label beside it.
  const beside = element.previousElementSibling ?? element.parentElement?.previousElementSibling
  const own = element.getAttribute('aria-label') || element.textContent || ''
  const text = (own.trim() ? own : (beside?.textContent ?? '')).replace(/\s+/g, ' ').trim()
  return SYMBOLS[text] ? translate(SYMBOLS[text]) : text
}

/** The title moves aside, or the system would show its own tooltip as well. */
function textOf(element: Element): string {
  const title = element.getAttribute('title')
  if (title !== null) {
    element.removeAttribute('title')
    if (title) element.setAttribute(TIP_ATTRIBUTE, title)
  }
  return element.getAttribute(TIP_ATTRIBUTE) || tipFor(element)
}

export function installTooltips(doc: Document = document) {
  let tip: HTMLElement | null = null
  let timer = 0
  let current: Element | null = null
  const view = doc.defaultView ?? window

  const hide = () => {
    view.clearTimeout(timer)
    tip?.remove()
    tip = null
  }

  const show = (element: Element, text: string) => {
    hide()
    tip = doc.createElement('div')
    tip.className = 'fast-tip'
    tip.setAttribute('role', 'tooltip')
    tip.textContent = text
    doc.body.append(tip)
    const box = element.getBoundingClientRect()
    const size = tip.getBoundingClientRect()
    const below = box.bottom + 6 + size.height <= view.innerHeight
    tip.style.left = `${Math.max(4, Math.min(box.left + box.width / 2 - size.width / 2, view.innerWidth - size.width - 4))}px`
    tip.style.top = `${below ? box.bottom + 6 : box.top - size.height - 6}px`
  }

  // Not pointerover: the browser sends no events to a disabled button, which must explain itself too.
  const follow = (event: MouseEvent) => {
    const under = doc.elementFromPoint(event.clientX, event.clientY)
    // Not instanceof: an element of a dialog's window belongs to that window's Element.
    const element = under?.closest?.(SELECTOR) ?? null
    if (element === current) return
    current = element
    hide()
    if (!element) return
    const text = textOf(element)
    if (text) timer = view.setTimeout(() => show(element, text), DELAY_MS)
  }

  doc.addEventListener('mousemove', follow, true)
  doc.addEventListener('mouseleave', () => {
    current = null
    hide()
  })
  doc.addEventListener('mousedown', hide, true)
  doc.addEventListener('wheel', hide, { capture: true, passive: true })
  doc.addEventListener('keydown', hide, true)
}
