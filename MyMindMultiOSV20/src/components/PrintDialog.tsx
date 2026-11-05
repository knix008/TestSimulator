// The print window: page setup on the left, the sheets as they will come out on the right.
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DEFAULT_PAGE_SETUP, MARGIN_MAX, PAGES_MAX, PAPERS, type HeadingLine, type Orientation, type PageSetup } from '../pageSetup'
import type { DiagramNode } from '../types'
import { buildPrintPages, type PrintPages } from '../utils/print'
import { IconSelect, Stepper, Toggle } from './controls'
import { Dialog } from './dialogs'
import { Icon } from './Icons'

const PREVIEW_WIDTH_PX = 470
const PX_PER_MM = 96 / 25.4

type Props = {
  setup: PageSetup
  onChange: (setup: PageSetup) => void
  nodes: DiagramNode[]
  title: string
  onPrint: (pages: PrintPages) => void
  onClose: () => void
}

export function PrintDialog({ setup, onChange, nodes, title, onPrint, onClose }: Props) {
  const { t } = useTranslation()
  const patch = (change: Partial<PageSetup>) => onChange({ ...setup, ...change })
  const pages = useMemo(() => {
    const svg = document.querySelector('.canvas-svg') as SVGSVGElement | null
    return svg ? buildPrintPages(svg, nodes, setup, title) : null
  }, [nodes, setup, title])

  const margin = (key: keyof PageSetup['margins']) => (
    <>
      <span>{t(`print.margin.${key}`)}</span>
      <Stepper id={`printMargin-${key}`} unit="mm" min={0} max={MARGIN_MAX} value={setup.margins[key]} onChange={(value) => patch({ margins: { ...setup.margins, [key]: value } })} />
    </>
  )
  const heading = (kind: 'header' | 'footer') => (['left', 'center', 'right'] as (keyof HeadingLine)[]).map((side) => (
    <input key={side} className="text-input" data-field={`print-${kind}-${side}`} placeholder={t(`print.side.${side}`)} title={t(`print.side.${side}`)} value={setup[kind][side]} onChange={(event) => patch({ [kind]: { ...setup[kind], [side]: event.target.value } })} />
  ))

  return (
    <Dialog
      id="print"
      title={t('print.title')}
      icon="print"
      onClose={onClose}
      width={980}
      footer={(
        <>
          <span className="print-summary" data-print-summary="">{pages ? t('print.sheets', { count: pages.pages }) : ''}</span>
          <button type="button" data-command="print-reset" onClick={() => onChange(DEFAULT_PAGE_SETUP)}><Icon name="undo" size={14} /> {t('start.reset')}</button>
          <button type="button" data-command="print-close" onClick={onClose}><Icon name="close" size={14} /> {t('closePrompt.cancel')}</button>
          <button type="button" className="primary" data-command="print-run" disabled={!pages} onClick={() => pages && onPrint(pages)}><Icon name="print" size={14} /> {t('toolbar.print')}</button>
        </>
      )}
    >
      <div className="print-layout">
        <div className="print-form">
          <h4><Icon name="file" size={14} /> {t('print.page')}</h4>
          <div className="form-grid">
            <span>{t('print.paper')}</span>
            <IconSelect id="printPaper" value={setup.paper} options={Object.keys(PAPERS).map((value) => ({ value, label: value, icon: 'file' }))} onChange={(paper) => patch({ paper })} />
            <span>{t('print.orientation')}</span>
            <IconSelect<Orientation> id="printOrientation" value={setup.orientation} options={(['auto', 'portrait', 'landscape'] as const).map((value) => ({ value, label: t(`print.${value}`), icon: 'file' }))} onChange={(orientation) => patch({ orientation })} />
            <span>{t('print.pagesWide')}</span>
            <Stepper id="printPagesWide" min={1} max={PAGES_MAX} value={setup.pagesWide} onChange={(pagesWide) => patch({ pagesWide })} />
            <span>{t('print.pagesTall')}</span>
            <Stepper id="printPagesTall" min={1} max={PAGES_MAX} value={setup.pagesTall} onChange={(pagesTall) => patch({ pagesTall })} />
            <span>{t('print.centerH')}</span>
            <Toggle id="printCenterH" checked={setup.centerH} onChange={(centerH) => patch({ centerH })} />
            <span>{t('print.centerV')}</span>
            <Toggle id="printCenterV" checked={setup.centerV} onChange={(centerV) => patch({ centerV })} />
          </div>
          <h4><Icon name="align" size={14} /> {t('print.margins')}</h4>
          <div className="form-grid">
            {margin('top')}
            {margin('bottom')}
            {margin('left')}
            {margin('right')}
          </div>
          <h4><Icon name="label" size={14} /> {t('print.headings')}</h4>
          <div className="form-grid">
            <span>{t('print.header')}</span>
            <div className="print-heading-fields">{heading('header')}</div>
            <span>{t('print.footer')}</span>
            <div className="print-heading-fields">{heading('footer')}</div>
            <span>{t('print.headingSize')}</span>
            <Stepper id="printHeadingSize" unit="pt" min={6} max={24} value={setup.headingSize} onChange={(headingSize) => patch({ headingSize })} />
          </div>
          <p className="dialog-note print-tokens">{t('print.tokens')}</p>
        </div>
        <div className="print-preview" data-print-preview="">
          {pages && <div style={{ zoom: Math.min(1, PREVIEW_WIDTH_PX / (pages.width * PX_PER_MM)) }} dangerouslySetInnerHTML={{ __html: pages.html }} />}
        </div>
      </div>
    </Dialog>
  )
}
