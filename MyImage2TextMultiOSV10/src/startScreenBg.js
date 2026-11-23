// The start screen's moving background and its controls, as in the other apps (MyUMLMaker):
// 20 backgrounds, another one at random, movement speed, card opacity, a random background at
// every start and an automatic change every so many seconds. The same controls appear on the
// start screen's Background card and in the Start screen tab of the settings window; both
// stay in step.
import { ANIMATION_INTERVALS, ANIMATION_KINDS, AnimatedBackground, randomAnimation } from './startBackground.js';
import { t } from './i18n.js';

export const BG_DEFAULTS = { startBg: 'aurora', startBgSpeed: 100, startCardOpacity: 80, startBgRandom: true, startBgInterval: 0 };
export const SPEED = { min: 0, max: 300, step: 10 };
export const OPACITY = { min: 20, max: 100, step: 5 };

const clamp = (value, low, high, fallback) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(high, Math.max(low, n)) : fallback;
};

export function normalizeBg(raw = {}) {
  return {
    startBg: ANIMATION_KINDS.includes(raw.startBg) ? raw.startBg : BG_DEFAULTS.startBg,
    startBgSpeed: clamp(raw.startBgSpeed, SPEED.min, SPEED.max, BG_DEFAULTS.startBgSpeed),
    startCardOpacity: clamp(raw.startCardOpacity, OPACITY.min, OPACITY.max, BG_DEFAULTS.startCardOpacity),
    startBgRandom: raw.startBgRandom !== false,
    startBgInterval: ANIMATION_INTERVALS.includes(Number(raw.startBgInterval)) ? Number(raw.startBgInterval) : BG_DEFAULTS.startBgInterval,
  };
}

// A tone for every background's chip, so the twenty are told apart at a glance.
const TONES = ['blue', 'cyan', 'violet', 'indigo', 'sky', 'teal', 'amber', 'blue', 'sky', 'cyan', 'lime', 'teal', 'green', 'violet', 'orange', 'red', 'pink', 'amber', 'indigo', 'pink'];
const MINUS = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9"/></svg>';
const PLUS = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9"/></svg>';
const SPARK = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 9.4 6.6 14.2 8 9.4 9.4 8 14.2 6.6 9.4 1.8 8 6.6 6.6z"/></svg>';

function stepper(field, label) {
  return `<div class="bg-row"><span class="bg-label">${label}</span><div class="stepper" data-bg-step="${field}">
    <button type="button" class="nudge" data-step="-1" aria-label="${t('decrease')}">${MINUS}</button><output></output>
    <button type="button" class="nudge" data-step="1" aria-label="${t('increase')}">${PLUS}</button></div></div>`;
}

export function bgControlsHtml() {
  const chips = ANIMATION_KINDS.map((kind, i) => `<button type="button" class="bg-chip" role="radio" data-bg-kind="${kind}" style="--tone: var(--t-${TONES[i]})">${SPARK}<span>${t(`bg_${kind}`)}</span></button>`).join('');
  return `<div class="bg-grid" role="radiogroup" aria-label="${t('startBackground')}">${chips}</div>
    <div class="bg-controls">
      <button type="button" class="act bg-shuffle" data-bg-shuffle><svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2.4"/><circle cx="5.4" cy="5.4" r=".9"/><circle cx="10.6" cy="10.6" r=".9"/><circle cx="8" cy="8" r=".9"/><circle cx="10.6" cy="5.4" r=".9"/><circle cx="5.4" cy="10.6" r=".9"/></svg><span>${t('bgShuffle')}</span></button>
      <label class="option-check"><input type="checkbox" data-bg-random /><span>${t('bgRandom')}</span></label>
      ${stepper('startBgSpeed', t('bgSpeed'))}
      ${stepper('startCardOpacity', t('bgOpacity'))}
      ${stepper('startBgInterval', t('bgInterval'))}
    </div>`;
}

export function createStartBackground({ canvas, screen, hosts, get, set }) {
  const colors = () => {
    const css = getComputedStyle(document.documentElement);
    const read = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    return {
      bg: read('--bg', '#12161c'),
      accent: read('--accent', '#4cc9f0'),
      text: read('--text', '#e4e9f0'),
      dark: document.documentElement.dataset.mode !== 'light',
      danger: '#e5484d',
    };
  };
  const background = new AnimatedBackground(canvas, { colors, speed: () => get().startBgSpeed / 100, kind: get().startBg, vivid: true });
  let changedAt = Date.now();

  const STEPS = {
    startBgSpeed: { ...SPEED, unit: '%', next: (v, d) => v + d * SPEED.step },
    startCardOpacity: { ...OPACITY, unit: '%', next: (v, d) => v + d * OPACITY.step },
    startBgInterval: {
      min: ANIMATION_INTERVALS[0],
      max: ANIMATION_INTERVALS.at(-1),
      unit: '',
      next: (v, d) => ANIMATION_INTERVALS[Math.min(ANIMATION_INTERVALS.length - 1, Math.max(0, ANIMATION_INTERVALS.indexOf(v) + d))],
    },
  };
  const intervalText = (seconds) => (seconds === 0 ? t('bgIntervalOff') : seconds < 60 ? t('bgSeconds', { n: seconds }) : t('bgMinutes', { n: seconds / 60 }));

  function render() {
    for (const host of hosts) host.innerHTML = bgControlsHtml();
    sync();
  }

  function sync() {
    const s = get();
    screen.style.setProperty('--start-card-alpha', `${s.startCardOpacity}%`);
    background.setKind(s.startBg);
    for (const host of hosts) {
      if (!host.querySelector('[data-bg-random]')) continue;
      for (const chip of host.querySelectorAll('[data-bg-kind]')) {
        const on = chip.dataset.bgKind === s.startBg;
        chip.classList.toggle('on', on);
        chip.setAttribute('aria-checked', String(on));
      }
      host.querySelector('[data-bg-random]').checked = s.startBgRandom;
      for (const box of host.querySelectorAll('[data-bg-step]')) {
        const field = box.dataset.bgStep;
        const spec = STEPS[field];
        const value = s[field];
        box.querySelector('output').textContent = field === 'startBgInterval' ? intervalText(value) : `${value}${spec.unit}`;
        box.querySelector('[data-step="-1"]').disabled = value <= spec.min;
        box.querySelector('[data-step="1"]').disabled = value >= spec.max;
      }
    }
  }

  function change(patch) {
    if ('startBg' in patch) changedAt = Date.now();
    set(normalizeBg({ ...get(), ...patch }));
    sync();
  }

  for (const host of hosts) {
    host.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-bg-kind]');
      if (chip) return change({ startBg: chip.dataset.bgKind });
      if (event.target.closest('[data-bg-shuffle]')) return change({ startBg: randomAnimation(get().startBg) });
      const button = event.target.closest('[data-bg-step] [data-step]');
      if (button && !button.disabled) {
        const field = button.closest('[data-bg-step]').dataset.bgStep;
        const spec = STEPS[field];
        const next = spec.next(get()[field], Number(button.dataset.step));
        return change({ [field]: Math.min(spec.max, Math.max(spec.min, next)) });
      }
      return undefined;
    });
    host.addEventListener('change', (event) => {
      if (event.target.matches('[data-bg-random]')) change({ startBgRandom: event.target.checked });
    });
  }

  // Automatic change while the start screen shows.
  setInterval(() => {
    const s = get();
    if (screen.hidden || document.hidden || !s.startBgInterval) {
      changedAt = Date.now();
      return;
    }
    if (Date.now() - changedAt >= s.startBgInterval * 1000) change({ startBg: randomAnimation(s.startBg) });
  }, 1000);

  return {
    render,
    sync,
    /** At program start: another background when "random at every start" is on. */
    atLaunch() {
      if (get().startBgRandom) change({ startBg: randomAnimation(get().startBg) });
    },
    show(visible) {
      if (visible) {
        background.resize();
        background.start();
      } else background.stop();
    },
    redraw() {
      background.draw();
    },
    get frames() {
      return background.frames;
    },
  };
}
