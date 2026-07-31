import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

type AppInfo = {
  name: string
  version: string
  author: string
  email: string
  copyright: string
  platform: string
}

type Props = {
  open: boolean
  onClose: () => void
}

const FALLBACK: AppInfo = {
  name: 'MyMind',
  version: '1.0.0',
  author: 'SHKWON',
  email: 'knix008@naver.com',
  copyright: `Copyright © ${new Date().getFullYear()} SHKWON`,
  platform: 'web',
}

export function AboutDialog({ open, onClose }: Props) {
  const { t } = useTranslation()
  const [info, setInfo] = useState<AppInfo>(FALLBACK)

  useEffect(() => {
    if (!open) return
    void (async () => {
      if (window.mymind) {
        const data = await window.mymind.getAppInfo()
        setInfo(data)
      } else {
        setInfo(FALLBACK)
      }
    })()
  }, [open])

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <img src="./icon.png" width={48} height={48} alt="" />
          <div>
            <h2>{t('about.title')}</h2>
            <p style={{ margin: 0 }}>{info.name}</p>
          </div>
        </div>
        <p>{t('about.description')}</p>
        <dl className="about-grid">
          <dt>{t('about.version')}</dt>
          <dd>{info.version}</dd>
          <dt>{t('about.developer')}</dt>
          <dd>{info.author}</dd>
          <dt>{t('about.email')}</dt>
          <dd>
            <a
              href={`mailto:${info.email}`}
              onClick={(e) => {
                if (window.mymind) {
                  e.preventDefault()
                  void window.mymind.openExternal(`mailto:${info.email}`)
                }
              }}
            >
              {info.email}
            </a>
          </dd>
          <dt>{t('about.copyright')}</dt>
          <dd>{info.copyright}</dd>
          <dt>{t('about.platform')}</dt>
          <dd>{info.platform}</dd>
        </dl>
        <div className="about-actions">
          <button type="button" className="tb-btn" onClick={onClose}>
            {t('about.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
