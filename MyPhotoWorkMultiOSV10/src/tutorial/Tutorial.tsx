import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react'
import { ChevronLeft, ChevronRight, GraduationCap, Play, X } from 'lucide-react'
import { t } from '../i18n'
import type { Language } from '../lib/types'
import { TUTORIAL_STEPS, placeCard, type TutorialStep } from './steps'

/** The popup at launch: run the tutorial or not, and whether to ask again. */
export function TutorialAsk({ language, ask, onRun, onLater }: { language: Language; ask: boolean; onRun: (askAgain: boolean) => void; onLater: (askAgain: boolean) => void }) {
  const tr = (key: string) => t(language, key)
  const [keep, setKeep] = useState(ask)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onLater(keep)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [keep, onLater])
  return (
    <div className="tutorial-ask-back" data-testid="tutorial-ask">
      <div className="tutorial-ask" role="dialog" aria-modal="true" aria-label={tr('tutorialAskTitle')}>
        <div className="tutorial-ask-body">
          <GraduationCap size={34} aria-hidden="true" />
          <div>
            <h3>{tr('tutorialAskTitle')}</h3>
            <p>{tr('tutorialAskBody').replace('{n}', String(TUTORIAL_STEPS.length))}</p>
            <p className="tutorial-ask-hint">{tr('tutorialAskHint')}</p>
          </div>
        </div>
        <div className="tutorial-ask-foot">
          <label><input type="checkbox" data-testid="tutorial-ask-show" checked={keep} onChange={(event) => setKeep(event.target.checked)} /><span>{tr('tutorialAskAgain')}</span></label>
          <span className="grow" />
          <button type="button" data-action="tutorial-later" onClick={() => onLater(keep)}><X size={14} aria-hidden="true" /><span>{tr('tutorialLater')}</span></button>
          <button type="button" className="primary" data-action="tutorial-run" onClick={() => onRun(keep)}><Play size={14} aria-hidden="true" /><span>{tr('tutorialRun')}</span></button>
        </div>
      </div>
    </div>
  )
}

/** The guided tour: an outline round the step's target and a card with its text. */
export function TutorialTour({ language, onShow, onClose }: { language: Language; onShow: (step: TutorialStep) => void; onClose: () => void }) {
  const tr = (key: string) => t(language, key)
  const [index, setIndex] = useState(0)
  const [box, setBox] = useState<DOMRect | null>(null)
  const step = TUTORIAL_STEPS[index]
  const last = index === TUTORIAL_STEPS.length - 1

  useEffect(() => { onShow(step) }, [step, onShow])

  // The target may appear a frame later (the start screen opening), and the window may resize.
  useLayoutEffect(() => {
    let frame = 0
    let previous = ''
    const measure = () => {
      const element = step.target ? document.querySelector(step.target) : null
      if (element) {
        // A card low on the start screen has to be scrolled to before it can be pointed at.
        if (!previous) element.scrollIntoView({ block: 'nearest' })
        const rect = element.getBoundingClientRect()
        const key = `${rect.left},${rect.top},${rect.width},${rect.height}`
        if (key !== previous) { previous = key; setBox(rect) }
      } else if (previous !== 'none') {
        previous = 'none'
        setBox(null)
      }
      frame = requestAnimationFrame(measure)
    }
    measure()
    return () => cancelAnimationFrame(frame)
  }, [step])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowRight' || event.key === ' ') { if (last) onClose(); else setIndex((value) => value + 1) }
      else if (event.key === 'ArrowLeft') setIndex((value) => Math.max(0, value - 1))
      else return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [last, onClose])

  const outline: CSSProperties | null = box ? { left: box.left - 3, top: box.top - 3, width: box.width + 6, height: box.height + 6 } : null
  return (
    <div className="tutorial-layer" data-testid="tutorial-tour" data-step={step.id}>
      {outline && <div className="tutorial-outline" style={outline} />}
      <div className="tutorial-card" style={placeCard(box, window.innerWidth, window.innerHeight)}>
        <div className="tutorial-head">
          <GraduationCap size={15} aria-hidden="true" />
          <b>{step.title[language]}</b>
          <span className="grow" />
          <button type="button" className="tutorial-x" aria-label={tr('close')} onClick={onClose}><X size={14} /></button>
        </div>
        <p>{step.body[language]}</p>
        <div className="tutorial-progress"><span style={{ width: `${((index + 1) / TUTORIAL_STEPS.length) * 100}%` }} /></div>
        <div className="tutorial-foot">
          <span className="tutorial-count">{index + 1} / {TUTORIAL_STEPS.length}</span>
          <span className="grow" />
          <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeft size={14} aria-hidden="true" /><span>{tr('tutorialPrev')}</span></button>
          <button type="button" className="primary" data-action="tutorial-next" onClick={() => { if (last) onClose(); else setIndex(index + 1) }}><span>{last ? tr('tutorialDone') : tr('tutorialNext')}</span><ChevronRight size={14} aria-hidden="true" /></button>
        </div>
      </div>
    </div>
  )
}
