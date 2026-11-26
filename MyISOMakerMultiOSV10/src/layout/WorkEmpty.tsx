/**
 * The main window with no image open: the program icon, what it does and the
 * buttons to start working (the start screen is a separate screen).
 */
import type { ReactNode } from 'react'
import type { MessageKey } from '../i18n/messages'
import { Icons } from '../Toolbar'

type T = (key: MessageKey, ...args: string[]) => string

export function WorkEmpty({
  t,
  version,
  busy,
  onOpen,
  onGo,
  onPackages,
  onHelp,
}: {
  t: T
  version: string
  busy: boolean
  onOpen: () => void
  onGo: (tab: 'create' | 'bootable' | 'mount') => void
  onPackages: () => void
  onHelp: () => void
}) {
  const btn = (id: string, icon: ReactNode, title: string, sub: string, onClick: () => void, primary = false, disabled = false) => (
    <button key={id} type="button" className={`work-empty-btn${primary ? ' primary' : ''}`} data-empty-action={id} onClick={onClick} disabled={disabled}>
      <span className="work-empty-btn-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="work-empty-btn-text">
        <b>{title}</b>
        <small>{sub}</small>
      </span>
    </button>
  )
  return (
    <div className="work-empty" data-work-empty="">
      <img className="work-empty-icon" src="/icon-256.png" alt="" draggable={false} />
      <h2 className="work-empty-title">
        {t('brand')} <small>V{version}</small>
      </h2>
      <p className="work-empty-lead">{t('homeLead')}</p>
      <div className="work-empty-actions">
        {btn('open', Icons.openIso, t('homeActOpen'), t('homeActOpenSub'), onOpen, true, busy)}
        {btn('create', Icons.create, t('homeActCreate'), t('homeActCreateSub'), () => onGo('create'))}
        {btn('bootable', Icons.bootable, t('homeActBootable'), t('homeActBootableSub'), () => onGo('bootable'))}
        {btn('mount', Icons.mount, t('homeActMount'), t('homeActMountSub'), () => onGo('mount'))}
        {btn('packages', Icons.download, t('settingsTabPackages'), t('workEmptyPackagesSub'), onPackages)}
        {btn('help', Icons.help, t('help'), t('tipHelp'), onHelp)}
      </div>
      <ul className="work-empty-tips">
        <li>{t('workEmptyTip1')}</li>
        <li>{t('workEmptyTip2')}</li>
        <li>{t('workEmptyTip3')}</li>
      </ul>
    </div>
  )
}
