'use strict';

/**
 * 컨텍스트 메뉴 창.
 *
 * 시계 창 안에 메뉴를 그리면 창 크기에 잘리기 때문에 별도 창으로 띄운다.
 * 내용을 그린 뒤 실제 크기를 재서 메인 프로세스에 알리고, 그때 창이 보인다.
 */

const api = window.myclock;
const menuEl = document.getElementById('menu');

api.menu.onItems((payload) => {
  setCustomTheme(payload.customThemeColor, payload.customThemeLight);
  applyTheme(payload.theme);
  menuEl.innerHTML = '';

  for (const item of payload.items) {
    if (item.separator) {
      const line = document.createElement('div');
      line.className = 'menu-separator';
      menuEl.appendChild(line);
      continue;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-item';
    button.dataset.id = item.id;

    const icon = document.createElement('span');
    icon.className = 'menu-icon';
    icon.textContent = item.icon || '';

    const label = document.createElement('span');
    label.className = 'menu-label';
    label.textContent = item.label;

    button.append(icon, label);
    button.addEventListener('click', () => api.menu.choose(item.id));
    menuEl.appendChild(button);
  }

  // 레이아웃이 끝난 뒤 실제 크기를 재서 창 크기를 맞춘다.
  requestAnimationFrame(() => {
    const rect = menuEl.getBoundingClientRect();
    api.menu.ready({
      width: Math.ceil(rect.width + 12),
      height: Math.ceil(rect.height + 12)
    });
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') api.menu.close();
});
