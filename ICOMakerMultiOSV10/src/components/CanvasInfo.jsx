import React from 'react';
import { useTranslation } from 'react-i18next';
import { CANVAS } from '../lib/iconCanvas.js';

// Top-of-canvas strip summarising the ICO being built.
export default function CanvasInfo({ count, sizes, background, bgPad, opacity, perSize }) {
  const { t } = useTranslation();
  const sorted = [...sizes].sort((a, b) => a - b);
  const bgText = background === 'transparent'
    ? t('info.transparent')
    : `${background}${bgPad > 0 ? ` · ${t('info.margin')} ${bgPad}%` : ''}`;

  const Item = ({ label, value }) => (
    <span className="ci-item"><em>{label}</em> {value}</span>
  );

  return (
    <div className="canvas-info">
      <span className="ci-badge">ICO</span>
      <Item label={t('info.canvas')} value={`${CANVAS}×${CANVAS}`} />
      <Item label={t('info.objects')} value={count} />
      <Item label={t('info.sizes')} value={sorted.length ? `${sorted.join(', ')} px` : '—'} />
      <Item label={t('info.bg')} value={bgText} />
      <Item label={t('info.opacity')} value={`${opacity}%`} />
      <span className="ci-item ci-mode">{perSize ? t('info.each') : t('info.combined')}</span>
    </div>
  );
}
