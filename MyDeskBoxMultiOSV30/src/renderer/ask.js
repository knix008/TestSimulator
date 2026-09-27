'use strict';

const params = new URLSearchParams(location.search);
const ask = JSON.parse(params.get('ask') || '{}');

const panel = document.getElementById('panel');
const mark = document.getElementById('mark');
const confirmBtn = document.getElementById('confirm');
const cancelBtn = document.getElementById('cancel');

document.getElementById('title').textContent = ask.title || '';
document.getElementById('detail').textContent = ask.detail || '';
confirmBtn.textContent = ask.confirm || 'OK';
cancelBtn.textContent = ask.cancel || 'Cancel';
if (ask.icon) mark.src = ask.icon;
if (ask.danger) panel.classList.add('danger');
// 고를 것이 없는 알림은 단추를 하나만 둔다.
if (ask.lone) cancelBtn.hidden = true;

function answer(ok) {
  desk.answer(ask.id, ok);
}

confirmBtn.addEventListener('click', () => answer(true));
cancelBtn.addEventListener('click', () => answer(false));

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') answer(false);
  if (event.key === 'Enter') answer(true);
});

// 위험한 일은 확인 단추에 먼저 손이 가지 않게 한다.
(ask.danger ? cancelBtn : confirmBtn).focus();

// 글 길이에 맞춰 창을 줄인다. 빈 자리가 남지 않게 한다.
// 판은 창 높이에 맞춰 늘어나 있으므로 판이 아니라 안의 것들을 재야 한다.
requestAnimationFrame(() => {
  const style = getComputedStyle(panel);
  const num = (value) => Number.parseFloat(value) || 0;
  const height = document.getElementById('row').offsetHeight
    + num(style.rowGap)
    + document.getElementById('buttons').offsetHeight
    + num(style.paddingTop) + num(style.paddingBottom)
    + num(style.borderTopWidth) + num(style.borderBottomWidth);
  desk.askSize(ask.id, Math.ceil(height));
});
