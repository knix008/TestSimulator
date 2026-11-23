import { useEffect, useState } from 'react'
import { CircleAlert, CircleX, Copy, Info, ListChecks, PanelBottomClose, PanelBottomOpen, ScrollText, SquareTerminal, Trash, TriangleAlert, type LucideIcon } from 'lucide-react'
import { clearLog, logEntries, logText, logTime, problemKey, problemText, subscribeLog, type LogEntry, type Problem } from './lib/appLog'
import { copyText } from './lib/errors'

export type BottomTab = 'problems' | 'errors' | 'log'
const BOTTOM_TABS: BottomTab[] = ['problems', 'errors', 'log']

const TAB_ICONS: Record<BottomTab, LucideIcon> = { problems: ListChecks, errors: CircleX, log: ScrollText }
const LEVEL_ICONS: Record<string, LucideIcon> = { info: Info, warn: TriangleAlert, error: CircleAlert }

/** Follows the app log; the panel re-renders when an entry is added. */
function useLog() {
  const [list, setList] = useState<readonly LogEntry[]>(logEntries())
  useEffect(() => subscribeLog(setList), [])
  return list
}

/**
 * The bottom panel: Problems (what is wrong with the document now), Errors (what failed)
 * and Log (what the app did), each a tab. Its fold button sits in the menu bar.
 */
export function BottomPanel({ tab, problems, tr, onTab, open, onToggle }: { tab: BottomTab; problems: Problem[]; tr: (key: string) => string; onTab: (tab: BottomTab) => void; open: boolean; onToggle: () => void }) {
  const list = useLog()
  const errors = list.filter((entry) => entry.level === 'error')
  // Clearing Problems hides the ones listed now; a problem that is new, or changes, shows again.
  const [dismissed, setDismissed] = useState<string[]>([])
  const openProblems = problems.filter((problem) => !dismissed.includes(problemKey(problem)))
  const counts: Record<BottomTab, number> = { problems: openProblems.length, errors: errors.length, log: list.length }
  const shown = tab === 'errors' ? errors : list
  const [copied, setCopied] = useState(false)
  // Every tab has Copy and Clear.
  const count = tab === 'problems' ? openProblems.length : shown.length
  const copy = () => {
    const text = tab === 'problems' ? problemText(openProblems) : logText(shown)
    void copyText(text).then((ok) => setCopied(ok))
  }
  const clear = () => {
    if (tab === 'problems') setDismissed((current) => [...current, ...openProblems.map(problemKey)])
    else clearLog(tab === 'errors' ? 'error' : undefined)
    setCopied(false)
  }
  return (
    <section className={`bottom-panel${open ? '' : ' collapsed'}`} data-bottom-tab={tab} aria-label={tr('bottomPanel')}>
      {/* The panel's own title bar: its icon and name, the tabs, Copy and Clear, and the fold button at the right. */}
      <header className="bottom-panel-bar">
        <span className="bottom-panel-title" data-tooltip={tr('bottomPanelHint')}>
          <SquareTerminal size={15} aria-hidden="true" />
          <strong>{tr('bottomPanelTitle')}</strong>
        </span>
        {open && (
        <div className="bottom-panel-tabs" role="tablist">
          {BOTTOM_TABS.map((name) => {
            const Icon = TAB_ICONS[name]
            return (
              <button key={name} role="tab" aria-selected={tab === name} data-bottom-tab={name} className={tab === name ? 'active' : ''} onClick={() => { setCopied(false); onTab(name) }}>
                <Icon size={14} aria-hidden="true" />
                <span>{tr(`bottom_${name}`)}</span>
                <span className={`bottom-count${counts[name] && name !== 'log' ? ' alert' : ''}`}>{counts[name]}</span>
              </button>
            )
          })}
        </div>
        )}
        <span className="grow" />
        {open && (
          <>
            <button data-action="bottom-copy" data-tooltip={tr('copyDetails')} disabled={!count} onClick={copy}>
              <Copy size={13} aria-hidden="true" /><span>{copied ? tr('copied') : tr('copyDetails')}</span>
            </button>
            <button data-action="bottom-clear" data-tooltip={tr('bottomClear')} disabled={!count} onClick={clear}>
              <Trash size={13} aria-hidden="true" /><span>{tr('bottomClear')}</span>
            </button>
          </>
        )}
        <button
          className="bottom-panel-fold"
          data-action="bottom-panel-fold"
          data-tooltip={tr(open ? 'bottomPanelCollapse' : 'bottomPanelExpand')}
          aria-label={tr(open ? 'bottomPanelCollapse' : 'bottomPanelExpand')}
          aria-expanded={open}
          onClick={onToggle}
        >
          {open ? <PanelBottomClose size={15} /> : <PanelBottomOpen size={15} />}
        </button>
      </header>
      {open && (
      <div className="bottom-panel-body">
        {tab === 'problems' ? (
          openProblems.length === 0
            ? <p className="bottom-empty"><ListChecks size={14} aria-hidden="true" /><span>{tr('bottomNoProblems')}</span></p>
            : openProblems.map((problem) => {
              const Icon = LEVEL_ICONS[problem.level]
              return <div key={problem.id} className={`bottom-row ${problem.level}`} data-problem={problem.id}><Icon size={14} aria-hidden="true" /><span className="bottom-message">{problem.message}</span></div>
            })
        ) : shown.length === 0 ? (
          <p className="bottom-empty"><Info size={14} aria-hidden="true" /><span>{tr(tab === 'errors' ? 'bottomNoErrors' : 'bottomNoLog')}</span></p>
        ) : (
          [...shown].reverse().map((entry) => {
            const Icon = LEVEL_ICONS[entry.level]
            return (
              <div key={entry.id} className={`bottom-row ${entry.level}`} title={entry.details ?? undefined}>
                <Icon size={14} aria-hidden="true" />
                <span className="bottom-time">{logTime(entry.time)}</span>
                <span className="bottom-source">{entry.source}</span>
                <span className="bottom-message">{entry.message}</span>
              </div>
            )
          })
        )}
      </div>
      )}
    </section>
  )
}
