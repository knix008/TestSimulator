// The tutorial card. It floats over the program, which stays fully usable under it: the steps are
// done with the real controls, and each one sees for itself when it is done.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { inlinePieces } from '../markdown'
import { TUTORIALS, applyStep, tutorialById } from '../tutorials'
import type { DiagramDocument, Locale } from '../types'
import { Dialog } from './dialogs'
import { Icon } from './Icons'

/** Which tutorial to take. */
export function TutorialChooser({ language, onPick, onClose }: { language: Locale; onPick: (id: string) => void; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Dialog id="tutorial-choose" title={t('tutorial.choose')} icon="tutorial" onClose={onClose} width={520}>
      <div className="tutorial-choices">
        {TUTORIALS.map((item) => (
          <button type="button" key={item.id} className="tutorial-choice" data-tutorial={item.id} onClick={() => onPick(item.id)}>
            <Icon name={item.mode === 'fishbone' ? 'fish' : 'mind'} size={28} />
            <b>{item.title[language]}</b>
            <small>{item.goal[language]}</small>
            <small>{t('tutorial.stepCount', { count: item.steps.length })}</small>
          </button>
        ))}
      </div>
    </Dialog>
  )
}

function Rich({ text }: { text: string }) {
  return inlinePieces(text).map((piece, index) => ('bold' in piece ? <strong key={index}>{piece.bold}</strong> : <span key={index}>{'text' in piece ? piece.text : ''}</span>))
}

type Props = {
  id: string
  doc: DiagramDocument
  language: Locale
  onApply: (update: (doc: DiagramDocument) => DiagramDocument) => void
  onClose: () => void
}

export function TutorialCard({ id, doc, language, onApply, onClose }: Props) {
  const { t } = useTranslation()
  const tutorial = tutorialById(id)
  const [index, setIndex] = useState(0)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const step = tutorial.steps[index]
  const last = index === tutorial.steps.length - 1
  const done = !step.done || step.done(doc, language)
  const canDoIt = !!step.apply && !done
  const card = useRef<HTMLDivElement>(null)

  // What the step is about glows on the screen.
  useEffect(() => {
    if (!step.highlight) return undefined
    const element = document.querySelector(step.highlight)
    element?.classList.add('tutorial-target')
    return () => element?.classList.remove('tutorial-target')
  }, [step, doc.selectedId])

  const beginDrag = (event: React.PointerEvent) => {
    if (event.button !== 0 || (event.target as Element).closest('button')) return
    event.preventDefault()
    const from = { x: event.clientX - offset.x, y: event.clientY - offset.y }
    const move = (moved: PointerEvent) => setOffset({ x: moved.clientX - from.x, y: moved.clientY - from.y })
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="tutorial-card" ref={card} data-tutorial-card={id} data-step={step.id} data-step-done={done} style={{ transform: `translate(${offset.x}px, ${offset.y}px)` } as CSSProperties}>
      <header onPointerDown={beginDrag} title={t('tutorial.moveCard')}>
        <Icon name="tutorial" />
        <strong>{tutorial.title[language]}</strong>
        <span className="tutorial-count" data-tutorial-count="">{index + 1} / {tutorial.steps.length}</span>
        <button type="button" className="panel-fold" aria-label={t('tutorial.close')} title={t('tutorial.close')} data-command="tutorial-close" onClick={onClose}><Icon name="close" size={14} /></button>
      </header>
      <div className="tutorial-progress"><i style={{ width: `${((index + (done ? 1 : 0)) / tutorial.steps.length) * 100}%` }} /></div>
      <h3>{done && step.done ? <Icon name="check" size={16} /> : null}{step.title[language]}</h3>
      <p><Rich text={step.text[language]} /></p>
      <footer>
        <button type="button" className="start-btn" data-command="tutorial-prev" disabled={index === 0} onClick={() => setIndex(index - 1)}><Icon name="collapseLeft" size={14} /><span>{t('tutorial.prev')}</span></button>
        <button type="button" className="start-btn" data-command="tutorial-do" disabled={!canDoIt} title={t('tutorial.doItTip')} onClick={() => onApply((current) => applyStep(step, current, language, Math.max(800, window.innerWidth), Math.max(500, window.innerHeight - 120)))}><Icon name="sync" size={14} /><span>{t('tutorial.doIt')}</span></button>
        {last ? (
          <button type="button" className="start-btn primary" data-command="tutorial-finish" onClick={onClose}><Icon name="check" size={14} /><span>{t('tutorial.finish')}</span></button>
        ) : (
          <button type="button" className="start-btn primary" data-command="tutorial-next" disabled={!done} onClick={() => setIndex(index + 1)}><span>{t('tutorial.next')}</span><Icon name="collapseRight" size={14} /></button>
        )}
      </footer>
    </div>
  )
}
