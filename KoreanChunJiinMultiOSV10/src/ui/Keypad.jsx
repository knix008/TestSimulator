/*
 * Keypad.jsx - 천지인 12키 + 기능 버튼 한 줄
 *
 *   ㅣ     ·      ㅡ        0  1  2
 *   ㄱㅋ   ㄴㄹ   ㄷㅌ      3  4  5
 *   ㅂㅍ   ㅅㅎ   ㅈㅊ      6  7  8
 *   . ,    ㅇㅁ   ? !       9  10 11
 *   모드  ◀  스페이스  ▶  ↵  ⌫
 */
import Icon from './Icons.jsx';
import { keyRole } from '../themes.js';

/* 물리 키보드 숫자열 대응 (한글 모드에서만 쓴다). 화면 배치와 같은 순서. */
const HINTS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '0', '='];

const FN = [
  { id: 'mode', label: '모드', role: 'primary', tip: '입력 모드 전환 (F2)' },
  { id: 'left', icon: 'left', role: 'fn', tip: '커서 왼쪽 (←)' },
  { id: 'space', label: '스페이스', role: 'fn', tip: '띄어쓰기 (Space)', grow: 2 },
  { id: 'right', icon: 'right', role: 'fn', tip: '커서 오른쪽 (→) · 연타 순환 끊기' },
  { id: 'enter', icon: 'enter', role: 'fn', tip: '줄바꿈 (Enter)' },
  { id: 'backspace', icon: 'backspace', role: 'fn', tip: '지우기 (Backspace)' },
];

export default function Keypad({ labels, isHangul, showHints, onKey, onFn }) {
  return (
    <div className="keypad">
      <div className="keypad-grid">
        {labels.map((label, key) => (
          <button
            key={key}
            type="button"
            className={`btn key-${keyRole(key, isHangul)}`}
            onClick={() => onKey(key)}
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            data-tip={showHints ? `키보드 ${HINTS[key]}` : undefined}
          >
            <span className="key-label">{label}</span>
            {showHints && <span className="key-hint">{HINTS[key]}</span>}
          </button>
        ))}
      </div>

      <div className="keypad-fn">
        {FN.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`btn key-${f.role}`}
            style={f.grow ? { flexGrow: f.grow } : undefined}
            onClick={() => onFn(f.id)}
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            data-tip={f.tip}
            aria-label={f.tip}
          >
            {f.icon ? <Icon name={f.icon} size={20} /> : <span className="key-label">{f.label}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
