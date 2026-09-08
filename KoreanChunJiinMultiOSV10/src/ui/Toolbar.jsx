/*
 * Toolbar.jsx - 자주 쓰는 것들
 *
 * 메뉴 막대를 두지 않으므로 모든 명령이 여기와 단축키에 있다.
 * 버튼은 절대 접히거나 잘리지 않는다(`flex-wrap: nowrap`, 창 최소 폭 420px).
 * `프로그램 정보` 는 `right: true` 로 언제나 맨 오른쪽에 붙는다.
 * 사용법은 버튼을 두지 않는다 - F1 과 프로그램 정보 창에서 연다.
 */
import Icon from './Icons.jsx';

const TOOLS = [
  { id: 'new', icon: 'new', tip: '새로 만들기' },
  { id: 'open', icon: 'open', tip: '열기' },
  { id: 'save', icon: 'save', tip: '저장' },
  { id: 'copy', icon: 'copy', tip: '복사', gap: true },
  { id: 'paste', icon: 'paste', tip: '붙여넣기' },
  { id: 'clear', icon: 'trash', tip: '전체 지우기' },
  { id: 'mode', icon: 'keyboard', tip: '입력 모드 전환 (F2)', gap: true },
  { id: 'theme', icon: 'palette', tip: '테마 전환 (F3)' },
  { id: 'settings', icon: 'gear', tip: '설정... (F4)' },
  { id: 'about', icon: 'info', tip: '프로그램 정보', right: true },
];

export default function Toolbar({ onCommand, accel }) {
  return (
    <div className="toolbar" role="toolbar" aria-label="도구 모음">
      {TOOLS.map((t) => (
        <span key={t.id} className={`tool-slot${t.right ? ' tool-right' : ''}`}>
          {t.gap && <span className="tool-sep" />}
          <button
            type="button"
            className="btn tool"
            onClick={() => onCommand(t.id)}
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            data-tip={accel[t.id] ? `${t.tip} (${accel[t.id]})` : t.tip}
            aria-label={t.tip}
          >
            <Icon name={t.icon} size={17} />
          </button>
        </span>
      ))}
    </div>
  );
}
