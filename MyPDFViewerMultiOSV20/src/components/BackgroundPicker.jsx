import React from 'react';
import { useTranslation } from 'react-i18next';
import { BG_ICONS, IconDice, IconSpeed, IconOpacity, IconClock } from './Icons.jsx';
import {
  START_BG_IDS, START_INTERVALS, START_OPACITY_MIN, START_OPACITY_MAX, START_SPEED_MIN, START_SPEED_MAX,
  nextStartBg,
} from '../lib/startbg.js';

// A short slider with a decrease button on its left and an increase button on
// its right; each button moves one step and stops at the ends.
function StepSlider({ id, icon, label, min, max, step, value, onValue }) {
  const { t } = useTranslation();
  const clamp = (v) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const tidy = (v) => Number(clamp(v).toFixed(2));
  const by = (n) => onValue(tidy(Number(value) + n * step));
  return (
    <div className="bg-slider" data-bg-slider={id}>
      {icon}
      <span>{label}</span>
      <button
        type="button"
        className="bg-step"
        onClick={() => by(-1)}
        disabled={value <= min + 1e-9}
        title={t('startbg.decrease', { name: label })}
        aria-label={t('startbg.decrease', { name: label })}
        data-bg-step={`${id}-down`}
      >−</button>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onValue(Number(e.target.value))}
      />
      <button
        type="button"
        className="bg-step"
        onClick={() => by(1)}
        disabled={value >= max - 1e-9}
        title={t('startbg.increase', { name: label })}
        aria-label={t('startbg.increase', { name: label })}
        data-bg-step={`${id}-up`}
      >+</button>
      <output>{Math.round(value * 100)}%</output>
    </div>
  );
}

// Choosing the start-screen background: 21 buttons with a picture each, a
// shuffle button, transparency and speed, and automatic changes. The same
// control sits on the start screen and in Settings.
export default function BackgroundPicker({ settings, onChange, compact = false }) {
  const { t } = useTranslation();
  const set = (patch) => onChange?.(patch);
  const intervalLabel = (n) => (!n
    ? t('startbg.never')
    : n < 60 ? t('startbg.everySeconds', { n }) : t('startbg.everyMinutes', { n: n / 60 }));

  return (
    <div className={`bg-picker${compact ? ' compact' : ''}`} data-bg-picker>
      <div className="bg-chips" role="radiogroup" aria-label={t('startbg.title')}>
        {START_BG_IDS.map((id) => {
          const Icon = BG_ICONS[id];
          const on = settings.startBg === id;
          return (
            <button
              key={id}
              type="button"
              className={`bg-chip${on ? ' active' : ''}`}
              role="radio"
              aria-checked={on}
              title={t(`startbg.desc.${id}`)}
              onClick={() => set({ startBg: id })}
              data-bg={id}
            >
              <Icon size={15} /><span>{t(`startbg.names.${id}`)}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="btn small bg-shuffle"
        onClick={() => set({ startBg: nextStartBg(settings.startBg, { random: true }) })}
        title={t('startbg.shuffleTip')}
      >
        <IconDice size={15} /> {t('startbg.shuffle')}
      </button>

      {/* Transparency and speed share one short line. */}
      <div className="bg-sliders">
        <StepSlider
          id="opacity"
          icon={<IconOpacity size={15} />}
          label={t('startbg.opacity')}
          min={START_OPACITY_MIN}
          max={START_OPACITY_MAX}
          step={0.05}
          value={settings.startBgOpacity}
          onValue={(v) => set({ startBgOpacity: v })}
        />
        <StepSlider
          id="speed"
          icon={<IconSpeed size={15} />}
          label={t('startbg.speed')}
          min={START_SPEED_MIN}
          max={START_SPEED_MAX}
          step={0.1}
          value={settings.startBgSpeed}
          onValue={(v) => set({ startBgSpeed: v })}
        />
      </div>

      <div className="bg-auto">
        <label className="bg-check">
          <input
            type="checkbox"
            checked={!!settings.startBgRandom}
            onChange={(e) => set({ startBgRandom: e.target.checked })}
          />
          <span>{t('startbg.random')}</span>
        </label>
        <label className="bg-interval" title={t('startbg.intervalTip')}>
          <IconClock size={15} />
          <select
            className="input"
            value={settings.startBgInterval}
            aria-label={t('startbg.interval')}
            onChange={(e) => set({ startBgInterval: Number(e.target.value) })}
          >
            {START_INTERVALS.map((n) => <option key={n} value={n}>{intervalLabel(n)}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}
