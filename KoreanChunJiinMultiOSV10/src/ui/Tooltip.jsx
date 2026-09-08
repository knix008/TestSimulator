/*
 * Tooltip.jsx - 빠르게 뜨는 설명 풍선
 *
 * 브라우저가 기본으로 보여 주는 title 풍선은 1초 가까이 기다려야 나오고,
 * 그 시간을 바꿀 수 없다. 그래서 직접 그린다.
 *
 * 쓰는 쪽은 버튼에 `data-tip="설명"` 만 달아 두면 된다.
 * 이 부품 하나가 문서 전체의 마우스를 지켜보다가 알맞은 자리에 띄운다.
 * (버튼마다 상태를 두지 않으므로 키를 아무리 눌러도 다시 그려지지 않는다.)
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/* 마우스를 올리고 이만큼 지나면 뜬다. 기본 풍선보다 한참 빠르다. */
const DELAY_MS = 130;

export default function Tooltip() {
  const [tip, setTip] = useState(null);   /* { text, x, y, below } */
  const timer = useRef(null);
  const box = useRef(null);

  useEffect(() => {
    const hide = () => { clearTimeout(timer.current); setTip(null); };

    const show = (el) => {
      const text = el.getAttribute('data-tip');
      if (!text) return;

      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const r = el.getBoundingClientRect();
        /* 화면 위쪽 가까이면 아래로 내려 단다 */
        const below = r.top < 52;
        setTip({
          text,
          x: Math.round(r.left + r.width / 2),
          y: Math.round(below ? r.bottom + 7 : r.top - 7),
          below,
        });
      }, DELAY_MS);
    };

    const onOver = (e) => {
      const el = e.target.closest?.('[data-tip]');
      if (el) show(el); else hide();
    };

    /* 키보드로 옮겨 다닐 때도 보이게 한다 */
    const onFocus = (e) => {
      const el = e.target.closest?.('[data-tip]');
      if (el) show(el);
    };

    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerdown', hide);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', hide);
    window.addEventListener('blur', hide);
    window.addEventListener('scroll', hide, true);

    return () => {
      clearTimeout(timer.current);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerdown', hide);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', hide);
      window.removeEventListener('blur', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, []);

  /*
   * 가장자리 버튼(툴바 맨 왼쪽·맨 오른쪽) 위에서는 풍선이 화면 밖으로 나간다.
   * 그려 놓고 실제 너비를 재서 안쪽으로 밀어 넣는다.
   */
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !tip) return;

    el.style.marginLeft = '0px';
    const r = el.getBoundingClientRect();
    const pad = 6;
    let shift = 0;
    if (r.left < pad) shift = pad - r.left;
    else if (r.right > window.innerWidth - pad) shift = window.innerWidth - pad - r.right;
    if (shift) el.style.marginLeft = `${Math.round(shift)}px`;
  }, [tip]);

  if (!tip) return null;

  return (
    <div
      className={`tip${tip.below ? ' tip-below' : ''}`}
      style={{ left: `${tip.x}px`, top: `${tip.y}px` }}
      ref={box}
      role="tooltip"
    >
      {tip.text}
    </div>
  );
}
