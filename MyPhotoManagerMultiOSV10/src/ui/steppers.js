// Number fields get − / + buttons on either side and a centred value. Any
// <input type=number> added to the page or a dialog window is wrapped as it
// appears; the input element itself stays, so code reading .value or listening
// for input/change keeps working.
import { h } from './dom.js';

function step(input, direction) {
  if (input.disabled || input.readOnly) return;
  const before = input.value;
  if (input.value === '') input.value = input.min !== '' ? input.min : '0';
  else if (direction > 0) input.stepUp(); else input.stepDown();
  if (input.value !== before) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

/** Holding a button repeats (after a short pause, faster over time). */
function repeatButton(label, title, input, direction) {
  const button = h('button.stepper-button', { type: 'button', tabIndex: -1, title, 'aria-label': title }, label);
  let timer = null;
  const stop = () => { clearTimeout(timer); timer = null; };
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    step(input, direction);
    let delay = 380;
    const again = () => { step(input, direction); delay = Math.max(40, delay * 0.8); timer = setTimeout(again, delay); };
    timer = setTimeout(again, delay);
  });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) button.addEventListener(type, stop);
  button.addEventListener('click', (event) => { if (event.detail === 0) step(input, direction); }); // keyboard / programmatic click
  return button;
}

export function wrapNumber(input) {
  if (input.closest('.stepper') || input.dataset.noStepper != null) return;
  const wrapper = h('span.stepper');
  input.replaceWith(wrapper);
  wrapper.append(repeatButton('−', '−', input, -1), input, repeatButton('+', '+', input, 1));
  input.classList.add('stepper-value');
}

function scan(root) {
  if (root.matches?.('input[type=number]')) wrapNumber(root);
  for (const input of root.querySelectorAll?.('input[type=number]') ?? []) wrapNumber(input);
}

/** Watches a document (the page, then each dialog window) for number fields. */
export function watchNumbers(doc = document) {
  scan(doc.body);
  new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) scan(node);
  }).observe(doc.body, { childList: true, subtree: true });
}
