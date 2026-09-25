'use strict';

// 박스의 판만 그린다. 이 창은 바탕화면 아이콘 층 뒤에 있어서
// 마우스를 받지 못하고, 받을 필요도 없다. 아이콘은 탐색기가 그 위에 그린다.

const id = new URLSearchParams(location.search).get('id');
const panel = document.getElementById('panel');

function rgba(hex, alpha) {
  const value = Number.parseInt(String(hex).replace('#', ''), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function paint(payload) {
  const fence = payload.fence;
  const look = payload.theme || { bg: '#2563eb', bar: '#1e3a8a', text: '#ffffff' };
  const corner = payload.corner || { radius: 20 };
  const alpha = fence.opacity || 0.52;

  panel.style.borderRadius = `${corner.radius}px`;
  // 색 위에 빛과 그늘을 겹쳐 두께가 있는 판처럼 보이게 한다.
  panel.style.background = [
    'linear-gradient(168deg,',
    'rgba(255,255,255,0.22) 0%,',
    'rgba(255,255,255,0.05) 30%,',
    'rgba(0,0,0,0.06) 62%,',
    'rgba(0,0,0,0.20) 100%),',
    rgba(look.bg, alpha),
  ].join(' ');
  // 제목 줄은 바탕보다 진하고 위쪽이 밝아 튀어나와 보인다.
  panel.style.setProperty('--bar', [
    'linear-gradient(180deg,',
    'rgba(255,255,255,0.26) 0%,',
    'rgba(255,255,255,0.05) 48%,',
    'rgba(0,0,0,0.16) 100%),',
    rgba(look.bar, Math.min(0.96, alpha + 0.34)),
  ].join(' '));
  // 접으면 제목 줄만 남는다. 판 전체가 제목 줄 색이 된다.
  panel.style.setProperty('--bar-h', fence.collapsed ? '100%' : '36px');
  panel.classList.toggle('shadow', !!payload.shadow);
}

desk.onState((payload) => {
  if (!payload || !payload.fence || payload.fence.id !== id) return;
  paint(payload);
});

desk.ready(id);
