import React from 'react';
import { useTranslation } from 'react-i18next';
import { BG_ICONS, IconDice, IconSpeed, IconOpacity, IconClock } from './Icons.jsx';
import {
  START_BG_IDS, START_INTERVALS, START_OPACITY_MIN, START_OPACITY_MAX, START_SPEED_MIN, START_SPEED_MAX,
  nextStartBg,
} from '../lib/startbg.js';

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

      <label className="bg-slider">
        <IconOpacity size={15} />
        <span>{t('startbg.opacity')}</span>
        <input
          type="range"
          min={START_OPACITY_MIN}
          max={START_OPACITY_MAX}
          step={0.05}
          value={settings.startBgOpacity}
          aria-label={t('startbg.opacity')}
          onChange={(e) => set({ startBgOpacity: Number(e.target.value) })}
        />
        <output>{Math.round(settings.startBgOpacity * 100)}%</output>
      </label>

      <label className="bg-slider">
        <IconSpeed size={15} />
        <span>{t('startbg.speed')}</span>
        <input
          type="range"
          min={START_SPEED_MIN}
          max={START_SPEED_MAX}
          step={0.1}
          value={settings.startBgSpeed}
          aria-label={t('startbg.speed')}
          onChange={(e) => set({ startBgSpeed: Number(e.target.value) })}
        />
        <output>{Math.round(settings.startBgSpeed * 100)}%</output>
      </label>

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
