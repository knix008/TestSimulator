// Turns an installer job (state + log text) into four labelled steps so the
// install dialog can show a checklist instead of only a raw dump.
export const INSTALL_STEPS = [
  { id: 'ready', label: 'inst_step_ready' },
  { id: 'fetch', label: 'inst_step_fetch' },
  { id: 'apply', label: 'inst_step_apply' },
  { id: 'finish', label: 'inst_step_finish' },
];

export const INSTALL_KIND_LABEL = {
  npm: 'inst_kind_npm',
  pip: 'inst_kind_pip',
  cargo: 'inst_kind_cargo',
  go: 'inst_kind_go',
  gem: 'inst_kind_gem',
  rustup: 'inst_kind_rustup',
  psmodule: 'inst_kind_ps',
  runtime: 'inst_kind_runtime',
};

const FETCH_RE = /collecting |downloading |downloaded |fetched |resolv(?:ing|ed) |npm http|GET http/i;
const APPLY_RE = /installing collected|installing |added \d|unpacking |building wheel|compiling |extracting /i;
const FINISH_RE = /successfully installed|\[installed\]|added \d+ packages?|already up to date|up to date/i;

export function installProgress(state, log = '') {
  const text = String(log || '');
  let idx = 0;
  if (FETCH_RE.test(text)) idx = 1;
  if (APPLY_RE.test(text)) idx = 2;
  if (FINISH_RE.test(text)) idx = 3;
  if (state === 'done') idx = 4;
  return INSTALL_STEPS.map((s, i) => {
    if (state === 'done') return { ...s, status: 'done' };
    if (i < idx) return { ...s, status: 'done' };
    if (i === idx) {
      if (state === 'failed') return { ...s, status: 'failed' };
      if (state === 'cancelled') return { ...s, status: 'cancelled' };
      return { ...s, status: 'run' };
    }
    return { ...s, status: 'wait' };
  });
}
