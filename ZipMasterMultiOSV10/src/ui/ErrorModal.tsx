import { useState } from 'react'
import { useStore } from './store'
import { useEsc } from './useEsc'

/** 심각한 오류 상세를 팝업으로 표시하고 클립보드 복사를 지원. */
export function ErrorModal() {
  const { errorDetail, clearError, lang } = useStore()
  const [copied, setCopied] = useState(false)
  useEsc(clearError)
  if (!errorDetail) return null

  const ko = lang === 'ko'

  async function copy() {
    try {
      await navigator.clipboard.writeText(errorDetail!)
    } catch {
      // 보안 컨텍스트가 아니거나 권한이 없을 때 폴백
      const ta = document.createElement('textarea')
      ta.value = errorDetail!
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch {}
      document.body.removeChild(ta)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="modal-overlay" onClick={clearError}>
      <div className="modal error-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="error-title">⚠ {ko ? '오류가 발생했습니다' : 'An error occurred'}</h2>
        <textarea className="error-detail" readOnly value={errorDetail} />
        <div className="modal-actions">
          <button onClick={copy}>{copied ? (ko ? '복사됨!' : 'Copied!') : ko ? '내용 복사' : 'Copy details'}</button>
          <button className="primary" onClick={clearError}>
            {ko ? '닫기' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
