// The controls of a memo's look, used by the properties panel and the settings window.
import { useTranslation } from 'react-i18next'
import { useSystemFonts } from '../hooks/useSystemFonts'
import { MEMO_FONT_MAX, MEMO_FONT_MIN, MEMO_LINE_MAX, MEMO_LINE_MIN, MEMO_LINE_PATTERNS, MEMO_MAX_SIZE, MEMO_MIN_SIZE } from '../memo'
import type { MemoStyle } from '../types'
import { ColorField, IconSelect, Stepper } from './controls'

const PRESET_FONTS = ['notoSansKr', 'outfit', 'serif', 'mono']

export function MemoStyleFields({ style, onChange, idPrefix }: { style: MemoStyle; onChange: (patch: Partial<MemoStyle>) => void; idPrefix: string }) {
  const { t } = useTranslation()
  const { fonts, load } = useSystemFonts()
  const fontOptions = [
    ...PRESET_FONTS.map((value) => ({ value, label: t(`font.${value}`), icon: 'fontFile' })),
    ...fonts.filter((name) => !PRESET_FONTS.includes(name)).map((value) => ({ value, label: value, icon: 'fontFile' })),
  ]
  if (!fontOptions.some((item) => item.value === style.fontFamily)) fontOptions.push({ value: style.fontFamily, label: style.fontFamily, icon: 'fontFile' })
  const toggle = (key: 'bold' | 'italic' | 'underline' | 'strike', letter: string, label: string, extra: string) => (
    <button type="button" key={key} data-memo-style={key} className={`style-toggle ${extra} ${style[key] ? 'active' : ''}`} title={label} aria-label={label} aria-pressed={style[key]} onClick={() => onChange({ [key]: !style[key] })}>{letter}</button>
  )
  return (
    <div className="memo-fields" onPointerEnter={() => void load()}>
      <span>{t('memo.color')}</span>
      <ColorField id={`${idPrefix}Color`} value={style.color} onChange={(color) => onChange({ color })} />
      <span>{t('memo.textColor')}</span>
      <ColorField id={`${idPrefix}TextColor`} value={style.textColor} onChange={(textColor) => onChange({ textColor })} />
      <span>{t('memo.width')}</span>
      <Stepper id={`${idPrefix}Width`} unit="px" step={10} min={MEMO_MIN_SIZE} max={MEMO_MAX_SIZE} value={style.width} onChange={(width) => onChange({ width })} />
      <span>{t('memo.height')}</span>
      <Stepper id={`${idPrefix}Height`} unit="px" step={10} min={MEMO_MIN_SIZE} max={MEMO_MAX_SIZE} value={style.height} onChange={(height) => onChange({ height })} />
      <span>{t('panel.font')}</span>
      <IconSelect id={`${idPrefix}Font`} value={style.fontFamily} options={fontOptions} onChange={(fontFamily) => onChange({ fontFamily })} />
      <span>{t('panel.fontSize')}</span>
      <Stepper id={`${idPrefix}FontSize`} unit="px" min={MEMO_FONT_MIN} max={MEMO_FONT_MAX} value={style.fontSize} onChange={(fontSize) => onChange({ fontSize })} />
      <span>{t('memo.lineColor')}</span>
      <ColorField id={`${idPrefix}LineColor`} value={style.lineColor} onChange={(lineColor) => onChange({ lineColor })} />
      <span>{t('memo.lineWidth')}</span>
      <Stepper id={`${idPrefix}LineWidth`} unit="px" min={MEMO_LINE_MIN} max={MEMO_LINE_MAX} value={style.lineWidth} onChange={(lineWidth) => onChange({ lineWidth })} />
      <span>{t('memo.linePattern')}</span>
      <IconSelect id={`${idPrefix}LinePattern`} value={style.linePattern} options={MEMO_LINE_PATTERNS.map((value) => ({ value, label: value === 'none' ? t('memo.lineNone') : t(`linePattern.${value}`), icon: 'line' }))} onChange={(linePattern) => onChange({ linePattern })} />
      <span>{t('panel.textStyle')}</span>
      <div className="text-style-row">
        {toggle('bold', 'B', t('style.bold'), '')}
        {toggle('italic', 'I', t('style.italic'), 'italic')}
        {toggle('underline', 'U', t('style.underline'), 'underline')}
        {toggle('strike', 'S', t('style.strike'), 'strike')}
      </div>
    </div>
  )
}
