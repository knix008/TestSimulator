/*
 * Editor.jsx - 편집 영역
 *
 * 원본은 Win32 EDIT 컨트롤을 서브클래싱해서 썼다. 여기서는 캐럿 위치를
 * 엔진이 온전히 쥐고 있어야 하므로 직접 그린다.
 *
 *   [확정된 글] [조합 중인 글자] |캐럿| [뒤쪽 글]
 *
 * 조합 중인 글자에는 밑줄을 그어 "아직 바뀔 수 있음"을 보여 준다.
 */
import { useLayoutEffect, useRef } from 'react';

/* 클릭한 화면 좌표가 텍스트의 몇 번째 글자인지 알아낸다. */
function offsetFromPoint(container, x, y) {
  let node = null;
  let offset = 0;

  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y);
    if (!pos) return null;
    node = pos.offsetNode;
    offset = pos.offset;
  } else if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(x, y);
    if (!range) return null;
    node = range.startContainer;
    offset = range.startOffset;
  } else {
    return null;
  }

  if (!container.contains(node)) return null;

  /* 컨테이너 안의 텍스트 노드를 차례로 세어 절대 위치를 만든다 */
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let total = 0;
  let cur = walker.nextNode();

  while (cur) {
    if (cur === node) return total + offset;
    total += cur.nodeValue.length;
    cur = walker.nextNode();
  }

  /* 텍스트가 아닌 곳(캐럿 span 등)을 짚었으면 그 앞까지의 길이 */
  return total;
}

export default function Editor({
  text, cursorPos, composeLen, fontSize, onSetCursor, containerRef,
}) {
  const caretRef = useRef(null);

  /* 글자를 넣을 때마다 캐럿이 화면 안에 남아 있게 한다 */
  useLayoutEffect(() => {
    caretRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [text, cursorPos]);

  const composeStart = Math.max(0, cursorPos - composeLen);
  const head = text.slice(0, composeStart);
  const composing = text.slice(composeStart, cursorPos);
  const tail = text.slice(cursorPos);

  const handlePointerDown = (e) => {
    const box = containerRef.current;
    if (!box) return;
    const at = offsetFromPoint(box, e.clientX, e.clientY);
    if (at !== null) onSetCursor(at);
    box.focus();
  };

  return (
    <div
      className="editor"
      ref={containerRef}
      tabIndex={0}
      role="textbox"
      aria-multiline="true"
      aria-label="편집 영역"
      style={{ fontSize: `${fontSize}px`, lineHeight: 1.55 }}
      onMouseDown={handlePointerDown}
    >
      <div className="editor-text">
        {head}
        {composing && <span className="composing">{composing}</span>}
        <span className="caret" ref={caretRef} />
        {tail}
        {/* 마지막 줄이 빈 줄이어도 높이를 갖도록 */}
        {'​'}
      </div>
    </div>
  );
}
