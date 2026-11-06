// The tutorial card. It floats over the program, which stays fully usable under it: the steps are
// done with the real controls, and each one sees for itself when it is done. A step's screenshot
// shows what to look for.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { stepImage } from '../docImages'
import { inlinePieces } from '../markdown'
import type { Meeting } from '../meeting'
import type { Locale } from '../settings'
import { TUTORIALS, tutorialById, type TutorialApi, type TutorialView } from '../tutorials'
import { Toggle } from './controls'
import { Dialog, ToolWindow, dragPopout, usePopout } from './dialogs'
import { Icon } from './Icons'

export function TutorialChooser({ language, asking, askOnStart, onAskOnStart, onPick, onClose }: { language: Locale; asking: boolean; askOnStart: boolean; onAskOnStart: (ask: boolean) => void; onPick: (id: string) => void; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Dialog
      id="tutorial-choose"
      title={t('tutorial.choose')}
      icon="tutorial"
      onClose={onClose}
      width={620}
      footer={(
        <>
          <span className="tutorial-ask">
            <Toggle id="tutorialAskOnStart" label={t('tutorial.askOnStart')} checked={askOnStart} onChange={onAskOnStart} />
            <span>{t('tutorial.askOnStart')}</span>
          </span>
          <button type="button" data-command="tutorial-later" onClick={onClose}><Icon name="close" size={14} /> {asking ? t('tutorial.later') : t('common.close')}</button>
        </>
      )}
    >
      {asking && <p className="dialog-note" data-tutorial-question="">{t('tutorial.question')}</p>}
      <div className="tutorial-choices">
        {TUTORIALS.map((item) => {
          const picture = stepImage(item.steps.find((step) => step.image)?.image ?? '', language)
          return (
            <button type="button" key={item.id} className="tutorial-choice" data-tutorial={item.id} onClick={() => onPick(item.id)}>
              {picture ? <img src={picture} alt="" /> : <Icon name={item.icon} size={28} />}
              <b><Icon name={item.icon} size={16} /> {item.title[language]}</b>
              <small>{item.goal[language]}</small>
              <small className="muted">{t('tutorial.stepCount', { count: item.steps.length })}</small>
            </button>
          )
        })}
      </div>
    </Dialog>
  )
}

function Rich({ text }: { text: string }) {
  return inlinePieces(text).map((piece, index) => ('bold' in piece ? <strong key={index}>{piece.bold}</strong> : 'code' in piece ? <code key={index}>{piece.code}</code> : <span key={index}>{'text' in piece ? piece.text : ''}</span>))
}

type Props = {
  id: string
  meeting: Meeting
  view: TutorialView
  language: Locale
  api: Omit<TutorialApi, 'meeting' | 'language'>
  onClose: () => void
  initialStep?: number
}

export function TutorialCard(props: Props) {
  const tutorial = tutorialById(props.id)
  return (
    <ToolWindow id="tutorial" title={tutorial.title[props.language]} onClose={props.onClose}>
      <Card {...props} />
    </ToolWindow>
  )
}

function Card({ id, meeting, view, language, api, onClose, initialStep = 0 }: Props) {
  const { t } = useTranslation()
  const pop = usePopout()
  const tutorial = tutorialById(id)
  const [index, setIndex] = useState(initialStep)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [big, setBig] = useState(false)
  const step = tutorial.steps[index]
  const last = index === tutorial.steps.length - 1
  const done = !step.done || step.done(meeting, view)
  const canDoIt = !!step.run && !done
  const picture = step.image ? stepImage(step.image, language) : undefined

  // What the step is about glows on the screen.
  useEffect(() => {
    if (!step.highlight) return undefined
    let element: Element | null = null
    const find = () => {
      element?.classList.remove('tutorial-target')
      element = document.querySelector(step.highlight!)
      element?.classList.add('tutorial-target')
    }
    find()
    const timer = window.setInterval(find, 600)
    return () => {
      window.clearInterval(timer)
      element?.classList.remove('tutorial-target')
    }
  }, [step])

  const beginDrag = (event: React.PointerEvent) => {
    if (pop) {
      dragPopout(pop, event)
      return
    }
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
    <div className={big ? 'tutorial-card big' : 'tutorial-card'} data-tutorial-card={id} data-step={step.id} data-step-done={done} style={pop ? undefined : { transform: `translate(${offset.x}px, ${offset.y}px)` }}>
        <header onPointerDown={beginDrag} data-tip={t('tutorial.moveCard')}>
          <Icon name="tutorial" />
          <strong>{tutorial.title[language]}</strong>
          <span className="tutorial-count" data-tutorial-count="">{index + 1} / {tutorial.steps.length}</span>
          <button type="button" className="mini dialog-close" aria-label={t('tutorial.close')} title={t('tutorial.close')} data-command="tutorial-close" onClick={onClose}><Icon name="close" size={14} /></button>
        </header>
        <div className="tutorial-progress"><i style={{ width: `${((index + (done ? 1 : 0)) / tutorial.steps.length) * 100}%` }} /></div>
        {picture && (
          <button type="button" className="tutorial-shot" data-tip={t(big ? 'common.close' : 'tutorial.enlarge')} onClick={() => setBig(!big)}>
            <img src={picture} alt={step.title[language]} />
          </button>
        )}
        <h3>{done && step.done ? <Icon name="check" size={16} /> : null}{step.title[language]}</h3>
        <p><Rich text={step.text[language]} /></p>
        <footer>
          <button type="button" className="start-btn" data-command="tutorial-prev" disabled={index === 0} onClick={() => setIndex(index - 1)}><Icon name="collapseLeft" size={14} /><span>{t('tutorial.prev')}</span></button>
          <button type="button" className="start-btn" data-command="tutorial-do" disabled={!canDoIt} data-tip={t('tutorial.doItTip')} onClick={() => step.run?.({ ...api, meeting, language })}><Icon name="sync" size={14} /><span>{t('tutorial.doIt')}</span></button>
          {last ? (
            <button type="button" className="start-btn primary" data-command="tutorial-finish" onClick={onClose}><Icon name="check" size={14} /><span>{t('tutorial.finish')}</span></button>
          ) : (
            <button type="button" className="start-btn primary" data-command="tutorial-next" disabled={!done} onClick={() => setIndex(index + 1)}><span>{t('tutorial.next')}</span><Icon name="collapseRight" size={14} /></button>
          )}
        </footer>
    </div>
  )
}
