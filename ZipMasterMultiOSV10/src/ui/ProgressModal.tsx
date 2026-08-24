import { useStore } from './store'
import { ProgressBar } from './ProgressBar'

/**
 * 진행률 팝업. 압축·해제·아카이브 열기 등 시간이 걸리는 작업 중 화면 중앙에 표시된다.
 * progress 가 설정되어 있는 동안(=작업 진행 중) 모달로 덮어 사용자에게 상태를 알린다.
 */
export function ProgressModal() {
  const { progress } = useStore()
  if (!progress) return null

  return (
    <div className="modal-overlay progress-overlay">
      <div className="modal progress-modal">
        <div className="spinner" aria-hidden />
        <div className="progress-modal-body">
          <ProgressBar progress={progress} busy={true} />
        </div>
      </div>
    </div>
  )
}
