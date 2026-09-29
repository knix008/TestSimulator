'use strict';

// 속성 창. 메인이 정해 준 줄을 그대로 그린다. 여기서 정하는 말은 없다.

const params = new URLSearchParams(location.search);
const props = JSON.parse(params.get('props') || '{}');

const panel = document.getElementById('panel');
const mark = document.getElementById('mark');
const rows = document.getElementById('rows');
const closeBtn = document.getElementById('close');

document.getElementById('title').textContent = props.title || '';
document.getElementById('kind').textContent = props.kind || '';
closeBtn.textContent = props.close || 'Close';
if (props.icon) mark.src = props.icon;
else mark.hidden = true;

for (const row of props.rows || []) {
  const dt = document.createElement('dt');
  dt.textContent = row.label;
  const dd = document.createElement('dd');
  dd.textContent = row.value;
  if (row.wide) dd.classList.add('wide');
  rows.append(dt, dd);
}
if (!rows.children.length) rows.hidden = true;

function done() {
  desk.propsClose(props.key);
}

closeBtn.addEventListener('click', done);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' || event.key === 'Enter') done();
});
closeBtn.focus();

// 줄 수에 맞춰 창을 줄인다. 빈 자리가 남지 않게 한다.
// 판은 창 높이에 맞춰 늘어나 있으므로 판이 아니라 안의 것들을 재야 한다.
requestAnimationFrame(() => {
  const style = getComputedStyle(panel);
  const num = (value) => Number.parseFloat(value) || 0;
  const gap = num(style.rowGap);
  const parts = [document.getElementById('head'), rows.hidden ? null : rows, document.getElementById('buttons')]
    .filter(Boolean);
  const height = parts.reduce((sum, el) => sum + el.offsetHeight, 0)
    + gap * (parts.length - 1)
    + num(style.paddingTop) + num(style.paddingBottom)
    + num(style.borderTopWidth) + num(style.borderBottomWidth);
  desk.propsSize(props.key, Math.ceil(height));
});
