// Every button has a tooltip. A button that does not set its own title shows its name; the
// symbols that have no words of their own are spelled out here.
let translate: (key: string) => string = (key) => key

const SYMBOLS: Record<string, string> = { '-': 'tip.decrease', '−': 'tip.decrease', '+': 'tip.increase', '×': 'tip.close', resize: 'tip.resize' }
const SELECTOR = 'button, [role=button]'

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

/** The title is set when the pointer arrives, so it always speaks the current language. */
export function refreshTip(element: HTMLElement) {
  if (element.hasAttribute('title') && !element.hasAttribute('data-auto-tip')) return
  element.setAttribute('data-auto-tip', '')
  element.title = tipFor(element)
}

export function installTooltips(doc: Document = document) {
  doc.addEventListener(
    'pointerover',
    (event) => {
      // Not instanceof: an element of a dialog's window belongs to that window's Element.
      const element = (event.target as Element | null)?.closest?.(SELECTOR) as HTMLElement | null | undefined
      if (element) refreshTip(element)
    },
    true,
  )
}
