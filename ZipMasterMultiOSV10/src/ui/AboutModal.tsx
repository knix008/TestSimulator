import { useStore } from './store'

/** 프로그램 정보 모달. */
export function AboutModal() {
  const { aboutOpen, setAboutOpen, appVersion, lang } = useStore()
  if (!aboutOpen) return null

  const ko = lang === 'ko'
  const shortVer = appVersion.split('.').slice(0, 2).join('.')
  return (
    <div className="modal-overlay" onClick={() => setAboutOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <img src="./icon.png" className="modal-icon" alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
        <h2>ZipMaster v{shortVer}</h2>
        <p className="modal-sub">
          {ko
            ? '다양한 압축 파일을 다루는 크로스플랫폼 압축 관리자'
            : 'Cross-platform archive manager for many formats'}
        </p>
        <ul className="modal-list">
          <li>
            {ko
              ? `버전: ${appVersion} (빌드 ${__APP_BUILD__})`
              : `Version: ${appVersion} (Build ${__APP_BUILD__})`}
          </li>
          <li>{ko ? '플랫폼: Web · Windows · macOS · Linux' : 'Platforms: Web · Windows · macOS · Linux'}</li>
          <li>{ko ? '포맷: ZIP(분할) · TAR · GZ · BZ2 · 7z · RAR(해제)' : 'Formats: ZIP(split) · TAR · GZ · BZ2 · 7z · RAR(extract)'}</li>
          <li>{ko ? '제작: SHKWON(knix008@naver.com)' : 'Author: SHKWON(knix008@naver.com)'}</li>
          <li>{ko ? '라이선스: MIT' : 'License: MIT'}</li>
        </ul>
        <button className="primary" onClick={() => setAboutOpen(false)}>
          {ko ? '닫기' : 'Close'}
        </button>
      </div>
    </div>
  )
}
