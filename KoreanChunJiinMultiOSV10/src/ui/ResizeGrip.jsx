/*
 * ResizeGrip.jsx - 창 오른쪽 아래 크기 조절 손잡이
 *
 * 창을 좁게 잡아 두었으므로 크기를 바꿀 수 있다는 표시가 눈에 보여야 한다.
 * 운영체제가 그려 주는 테두리는 얇아서 잘 안 보이므로 직접 그린다.
 *
 * 그린 것만으로는 잡아끌 수 없다(그 자리는 창 안쪽이라 OS 의 조절 테두리가
 * 아니다). 그래서 끌기를 받아 Electron 쪽에 창 크기를 직접 알려 준다.
 * 브라우저에서는 창 크기를 건드릴 수 없으므로 아예 그리지 않는다.
 */
import { useRef } from 'react';
import { beginWindowResize, endWindowResize, isElectron, resizeWindowBy } from '../platform.js';

export default function ResizeGrip() {
  const from = useRef(null);

  if (!isElectron) return null;

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    from.current = { x: e.screenX, y: e.screenY };
    beginWindowResize();
  };

  const onPointerMove = (e) => {
    if (!from.current) return;
    /* 화면 기준 좌표라야 창이 커지는 동안에도 어긋나지 않는다 */
    resizeWindowBy(e.screenX - from.current.x, e.screenY - from.current.y);
  };

  const stop = (e) => {
    if (!from.current) return;
    from.current = null;
    endWindowResize();
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* 이미 놓임 */ }
  };

  return (
    <div
      className="resize-grip"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      data-tip="끌어서 창 크기 바꾸기"
      role="separator"
      aria-label="창 크기 조절"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
        <g fill="currentColor">
          <circle cx="12" cy="12" r="1.35" />
          <circle cx="8" cy="12" r="1.35" />
          <circle cx="12" cy="8" r="1.35" />
          <circle cx="4" cy="12" r="1.35" />
          <circle cx="12" cy="4" r="1.35" />
          <circle cx="8" cy="8" r="1.35" />
        </g>
      </svg>
    </div>
  );
}
