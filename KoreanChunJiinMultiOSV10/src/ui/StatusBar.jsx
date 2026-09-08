/*
 * StatusBar.jsx - 상태줄
 *
 * 메뉴 막대를 없앴으므로, 프로그램이 지금 어떤 상태인지는 모두 여기서 본다.
 *
 *   ┌────────────────────────────────────────────┐
 *   │ 한글        조합 ㄱ + ㅏ + -      저장했습니다 │  1줄: 지금 치고 있는 것
 *   │ 라이트 · 21px   연타 0.8초 ●   커서 5 · 12자  │  2줄: 설정과 위치
 *   └────────────────────────────────────────────┘
 *
 * `조합` 칸은 만들고 있는 글자의 초성 · 중성 · 종성이고 `-` 는 아직 비었다는 뜻이다.
 * `연타` 옆의 ● 는 지금 같은 키를 누르면 순환이 이어진다는 표시다.
 */
export default function StatusBar({
  modeName, composition, cursorPos, length, themeName, fontSize,
  multitapMs, multitapLive, note, noteKind, onNoteClick,
}) {
  return (
    <div className="statusbar" role="status" aria-live="polite">
      <div className="st-row">
        <span className="st-mode" data-tip="입력 모드 (F2 로 바꿉니다)">{modeName}</span>

        <span className="st-comp" data-tip="조합 중인 낱자 (초성 + 중성 + 종성)">
          {composition ? `조합 ${composition}` : ''}
        </span>

        {note && (
          <button
            type="button"
            className={`st-note st-note-${noteKind}`}
            data-tip={noteKind === 'error' ? '눌러서 자세히 보기' : note}
            onClick={onNoteClick}
            onMouseDown={(e) => e.preventDefault()}
            tabIndex={-1}
          >
            {note}
          </button>
        )}
      </div>

      <div className="st-row st-row-dim">
        <span data-tip="테마 (F3) · 글꼴 크기 (F4 에서 바꿉니다)">
          {themeName} · {fontSize}px
        </span>

        <span
          className={multitapLive ? 'st-tap st-tap-live' : 'st-tap'}
          data-tip={multitapLive
            ? '지금 같은 키를 누르면 순환이 이어집니다'
            : '순환이 끊겼습니다. 같은 키를 누르면 새 글자로 들어갑니다'}
        >
          연타 {(multitapMs / 1000).toFixed(1)}초
          <span className="st-dot" aria-hidden="true">●</span>
        </span>

        <span className="st-pos" data-tip="커서 위치 · 전체 글자 수">
          커서 {cursorPos} · {length}자
        </span>
      </div>
    </div>
  );
}
