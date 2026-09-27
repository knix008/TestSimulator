'use strict';

// 큰 오류를 보여 준다. 글상자의 글을 골라 복사할 수 있고, 복사 단추는 글 전체를 보낸다.

const params = new URLSearchParams(location.search);
const report = JSON.parse(params.get('report') || '{}');

document.getElementById('title').textContent = report.title || '';
document.getElementById('detail').textContent = report.detail || '';
document.getElementById('copy').textContent = report.copy || 'Copy';
document.getElementById('close').textContent = report.close || 'Close';

const box = document.getElementById('report');
box.value = report.text || '';
box.focus();
box.select();

document.getElementById('copy').addEventListener('click', () => desk.fatalCopy());
document.getElementById('close').addEventListener('click', () => desk.fatalClose());

desk.onFatalCopied((line) => {
  if (line) document.getElementById('detail').textContent = line;
  box.focus();
  box.select();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') desk.fatalClose();
});
