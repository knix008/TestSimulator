/*
 * ErrorDialog.jsx - 오류를 구체적으로 보여 주는 창
 *
 * 무엇을 하다가 어디서 어떻게 틀어졌는지를 그대로 보여 주고,
 * 그 내용을 통째로 클립보드에 복사할 수 있게 한다.
 * 본문은 드래그해서 일부만 골라 복사해도 된다(`user-select: text`).
 */
import { useState } from 'react';
import Modal from './Modal.jsx';
import { copyToClipboard } from '../platform.js';

/*
 * 화면에 보이는 그대로가 복사되는 글이 되도록 한 곳에서 만든다.
 * 붙여넣어 보고할 때 앞뒤 사정이 남아 있어야 쓸모가 있다.
 */
export function formatError(err) {
  const lines = [
    `무엇을 하다가   ${err.what}`,
    `언제            ${err.when}`,
    `어디서          ${err.where}`,
    '',
    `오류            ${err.message}`,
  ];
  if (err.detail) lines.push('', '자세한 내용', err.detail);
  return lines.join('\n');
}

export default function ErrorDialog({ error, onClose }) {
  const [copied, setCopied] = useState(false);
  const text = formatError(error);

  const copy = async () => {
    setCopied(await copyToClipboard(text));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      title="오류"
      onClose={onClose}
      wide
      footer={(
        <>
          <button type="button" className="btn dlg-btn" onClick={copy}>
            {copied ? '복사했습니다' : '전체 복사'}
          </button>
          <button type="button" className="btn dlg-btn dlg-primary" onClick={onClose}>닫기</button>
        </>
      )}
    >
      <p className="err-lead">{error.what} 중에 문제가 생겼습니다.</p>
      <p className="err-msg">{error.message}</p>
      <pre className="err-detail">{text}</pre>
      <p className="err-hint">
        아래 글을 그대로 복사해 두면 무엇이 잘못됐는지 알아보기 쉽습니다.
        본문을 드래그해서 일부만 복사해도 됩니다.
      </p>
    </Modal>
  );
}
