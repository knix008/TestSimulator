/*
 * Modal.jsx - 설정 · 사용법 · 프로그램 정보 창의 껍데기
 */
import { useEffect, useRef } from 'react';

export default function Modal({ title, onClose, children, footer, wide }) {
  const boxRef = useRef(null);

  useEffect(() => {
    boxRef.current?.focus();
  }, []);

  const onKeyDown = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className={`modal${wide ? ' modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={boxRef}
        onKeyDown={onKeyDown}
      >
        <div className="modal-title">
          <span>{title}</span>
          <button type="button" className="btn modal-x" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
