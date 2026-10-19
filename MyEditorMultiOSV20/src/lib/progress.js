// A single progress popup for work that can stall the UI (print preview,
// opening a large file, formatting, a large save). Fast jobs finish before
// `delay` and never flash the dialog. report() only updates the label — it
// does not pop the window early (that would cover the image / hex view).
let state = null;
let depth = 0;
const listeners = new Set();

function emit(next) {
  state = next;
  listeners.forEach((fn) => fn(state));
}

export function getProgress() { return state; }
export function subscribeProgress(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function yieldToUi() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

// opts: { title, message, detail, delay, cancellable }
// work({ report, isCancelled, yield: yieldToUi })
export async function withProgress(opts, work) {
  const delay = opts.delay == null ? 180 : opts.delay;
  const root = depth === 0;
  depth++;
  let shown = !!(state && !root);
  let cancelled = false;
  let pending = {};
  const show = (patch = {}) => {
    shown = true;
    emit({
      title: (state && state.title) || opts.title || '',
      message: opts.message || '',
      detail: opts.detail || '',
      value: null,
      cancellable: !!opts.cancellable,
      onCancel: opts.cancellable ? () => { cancelled = true; } : null,
      ...pending,
      ...patch,
    });
  };
  const report = (patch) => {
    if (!shown) pending = { ...pending, ...patch };
    else emit({ ...state, ...patch });
  };
  let timer = null;
  if (root) {
    if (delay <= 0) show();
    else timer = setTimeout(() => show(), delay);
  }
  try {
    if (root && delay <= 0) await yieldToUi();
    return await work({ report, isCancelled: () => cancelled, yield: yieldToUi });
  } finally {
    if (timer) clearTimeout(timer);
    depth--;
    if (root) emit(null);
  }
}
