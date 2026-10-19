// Topic markers: the coloured icons in front of a topic's text.
//
//   priority  1‥9      task.priority   (one per topic)
//   progress  0‥100    task.progress   (one per topic: 0, 25, 50, 75, 100)
//   flag · smiley · arrow              (one of each group per topic, in topic.icons)
//   symbol                             (any number, in topic.icons)
//
// Every icon is SVG markup in a 24 × 24 box, drawn the same way on the map,
// in the task pane and in exported pictures (no font, no external file).

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const PRIORITY_COLORS = ['#e53935', '#fb8c00', '#f4b400', '#43a047', '#00897b', '#1e88e5', '#3949ab', '#8e24aa', '#757575'];
export function priorityIcon(n) {
  const c = PRIORITY_COLORS[(Number(n) || 1) - 1] || PRIORITY_COLORS[8];
  return `<circle cx="12" cy="12" r="11" fill="${c}"/><circle cx="12" cy="12" r="11" fill="none" stroke="#000" stroke-opacity=".18"/><text x="12" y="16.6" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="14" fill="#fff">${esc(n)}</text>`;
}

export function progressIcon(p) {
  const v = Math.max(0, Math.min(100, Number(p) || 0));
  if (v >= 100) return '<circle cx="12" cy="12" r="11" fill="#2e7d32"/><path d="M6.5 12.5l3.6 3.6 7.4-7.6" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
  const ring = '<circle cx="12" cy="12" r="10.5" fill="#fff" stroke="#2e7d32" stroke-width="2"/>';
  if (v <= 0) return ring;
  const a = (v / 100) * Math.PI * 2;
  const x = 12 + 8 * Math.sin(a), y = 12 - 8 * Math.cos(a);
  const large = v > 50 ? 1 : 0;
  return `${ring}<path d="M12 12 L12 4 A8 8 0 ${large} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z" fill="#43a047"/>`;
}

const FLAG_COLORS = { red: '#e53935', orange: '#fb8c00', yellow: '#fdd835', green: '#43a047', blue: '#1e88e5', purple: '#8e24aa', gray: '#9e9e9e' };
const flag = (c) => `<path d="M5 2.5v19" stroke="#5d4037" stroke-width="2" stroke-linecap="round"/><path d="M6 3.5h12.5l-3 4.2 3 4.3H6z" fill="${c}" stroke="#000" stroke-opacity=".2"/>`;

const face = (mouth, extra = '', fill = '#ffd54f') => `<circle cx="12" cy="12" r="10.5" fill="${fill}" stroke="#c49000" stroke-width="1"/><circle cx="8.6" cy="9.6" r="1.4" fill="#4e342e"/><circle cx="15.4" cy="9.6" r="1.4" fill="#4e342e"/>${mouth}${extra}`;

const arrow = (rot, c = '#1e88e5') => `<g transform="rotate(${rot} 12 12)"><circle cx="12" cy="12" r="11" fill="${c}"/><path d="M12 5.5v13M6.8 10.6L12 5.5l5.2 5.1" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g>`;

const SYMBOLS = {
  star: '<path d="M12 1.8l3.1 6.4 7 1-5.1 4.9 1.2 7L12 17.8 5.8 21.1l1.2-7-5.1-4.9 7-1z" fill="#fbc02d" stroke="#f57f17" stroke-width="1" stroke-linejoin="round"/>',
  question: '<circle cx="12" cy="12" r="11" fill="#7e57c2"/><path d="M8.8 9.2a3.3 3.3 0 1 1 4.7 3c-1 .5-1.5 1.1-1.5 2.2" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round"/><circle cx="12" cy="18" r="1.4" fill="#fff"/>',
  exclamation: '<circle cx="12" cy="12" r="11" fill="#e53935"/><path d="M12 5.8v7.6" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.5" fill="#fff"/>',
  idea: '<path d="M12 2.2a7 7 0 0 0-4.2 12.6c.8.7 1.2 1.5 1.2 2.4h6c0-.9.4-1.7 1.2-2.4A7 7 0 0 0 12 2.2z" fill="#ffeb3b" stroke="#f9a825" stroke-width="1.2"/><rect x="9" y="17.6" width="6" height="2.2" rx=".8" fill="#90a4ae"/><rect x="9.8" y="20.2" width="4.4" height="1.8" rx=".8" fill="#78909c"/><path d="M10 11.5l2 2 2-2" fill="none" stroke="#f57f17" stroke-width="1.2"/>',
  check: '<rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="#43a047"/><path d="M6.5 12.5l3.7 3.7 7.3-8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  cross: '<rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="#e53935"/><path d="M7.5 7.5l9 9M16.5 7.5l-9 9" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>',
  heart: '<path d="M12 21s-8.6-5.2-9.6-11A5.2 5.2 0 0 1 12 6.6 5.2 5.2 0 0 1 21.6 10c-1 5.8-9.6 11-9.6 11z" fill="#e91e63" stroke="#ad1457" stroke-width="1"/>',
  info: '<circle cx="12" cy="12" r="11" fill="#1e88e5"/><circle cx="12" cy="6.8" r="1.5" fill="#fff"/><path d="M12 10.5v7.4" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>',
  warning: '<path d="M12 2 23 21.5H1z" fill="#ffb300" stroke="#e65100" stroke-width="1" stroke-linejoin="round"/><path d="M12 8.5v6.5" stroke="#3e2723" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="18.2" r="1.3" fill="#3e2723"/>',
  lock: '<path d="M7.2 10V7.4a4.8 4.8 0 0 1 9.6 0V10" fill="none" stroke="#78909c" stroke-width="2.4"/><rect x="4" y="10" width="16" height="12" rx="2.5" fill="#fbc02d" stroke="#f57f17"/><circle cx="12" cy="15.4" r="1.7" fill="#5d4037"/>',
  money: '<circle cx="12" cy="12" r="11" fill="#2e7d32"/><path d="M15.4 8.4c-.6-1-1.9-1.6-3.4-1.6-2 0-3.4 1-3.4 2.4 0 3.4 7 1.6 7 5 0 1.5-1.5 2.6-3.6 2.6-1.6 0-3-.7-3.6-1.8M12 4.8v14.4" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/>',
  clock: '<circle cx="12" cy="12" r="10.5" fill="#fff" stroke="#546e7a" stroke-width="2"/><path d="M12 6.5V12l3.8 2.4" fill="none" stroke="#e53935" stroke-width="2" stroke-linecap="round"/>',
  calendar: '<rect x="2.5" y="4" width="19" height="17.5" rx="2.5" fill="#fff" stroke="#546e7a" stroke-width="1.6"/><path d="M2.5 9h19" stroke="#546e7a" stroke-width="1.6"/><rect x="2.5" y="4" width="19" height="5" rx="2" fill="#e53935"/><path d="M7.5 2v4M16.5 2v4" stroke="#37474f" stroke-width="2" stroke-linecap="round"/><text x="12" y="19" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="8.5" fill="#37474f">31</text>',
  phone: '<rect x="6" y="1.5" width="12" height="21" rx="2.6" fill="#37474f"/><rect x="7.6" y="4" width="8.8" height="13.6" rx="1" fill="#80deea"/><circle cx="12" cy="20" r="1.1" fill="#cfd8dc"/>',
  mail: '<rect x="1.8" y="4.5" width="20.4" height="15" rx="2.2" fill="#fff" stroke="#1e88e5" stroke-width="1.6"/><path d="M2.6 6l9.4 7 9.4-7" fill="none" stroke="#1e88e5" stroke-width="1.6" stroke-linejoin="round"/>',
  home: '<path d="M2.5 11.5 12 3l9.5 8.5" fill="none" stroke="#6d4c41" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 10.4V21h5v-6h4v6h5V10.4" fill="#ffcc80" stroke="#6d4c41" stroke-width="1.4" stroke-linejoin="round"/>',
  person: '<circle cx="12" cy="7.5" r="4.6" fill="#ffb74d" stroke="#e65100" stroke-width="1"/><path d="M3.5 22c.4-5 4-8 8.5-8s8.1 3 8.5 8z" fill="#42a5f5" stroke="#1565c0" stroke-width="1"/>',
  people: '<circle cx="8.2" cy="8" r="3.6" fill="#ffb74d" stroke="#e65100" stroke-width=".9"/><circle cx="16.4" cy="8.6" r="3.2" fill="#ffcc80" stroke="#e65100" stroke-width=".9"/><path d="M11.2 21.5c.4-4 2.4-6.5 5.4-6.5s5 2.5 5.4 6.5z" fill="#66bb6a" stroke="#2e7d32" stroke-width=".9"/><path d="M1.5 22c.4-4.4 3-7 6.7-7s6.3 2.6 6.7 7z" fill="#42a5f5" stroke="#1565c0" stroke-width=".9"/>',
  pin: '<path d="M12 22s-7-7.4-7-12.4a7 7 0 0 1 14 0C19 14.6 12 22 12 22z" fill="#e53935" stroke="#b71c1c" stroke-width="1"/><circle cx="12" cy="9.6" r="2.8" fill="#fff"/>',
  thumbsUp: '<rect x="2" y="10" width="4.6" height="11" rx="1.2" fill="#1565c0"/><path d="M8 20.8h9.2a2.4 2.4 0 0 0 2.4-2l1.2-6.6a2 2 0 0 0-2-2.4h-5.2l.9-4.2A2.2 2.2 0 0 0 12.3 3l-4.3 7.2z" fill="#42a5f5" stroke="#1565c0" stroke-width="1" stroke-linejoin="round"/>',
  thumbsDown: '<g transform="rotate(180 12 12)"><rect x="2" y="10" width="4.6" height="11" rx="1.2" fill="#c62828"/><path d="M8 20.8h9.2a2.4 2.4 0 0 0 2.4-2l1.2-6.6a2 2 0 0 0-2-2.4h-5.2l.9-4.2A2.2 2.2 0 0 0 12.3 3l-4.3 7.2z" fill="#ef5350" stroke="#c62828" stroke-width="1" stroke-linejoin="round"/></g>',
  bookmark: '<path d="M5.5 2.5h13v19L12 16.8l-6.5 4.7z" fill="#8e24aa" stroke="#4a148c" stroke-width="1" stroke-linejoin="round"/>',
  fire: '<path d="M12 22c-4.4 0-7.5-3-7.5-7 0-3.8 2.8-6 3.8-9 .8 1.8 1.8 2.9 3.1 3.4C11.2 6.4 12.6 3.6 15.4 2c-.4 3 1 5 2.4 7 1 1.4 1.7 3.2 1.7 5 0 4.2-3.1 8-7.5 8z" fill="#ff7043" stroke="#d84315" stroke-width="1"/><path d="M12 21c-2 0-3.4-1.4-3.4-3.3 0-2 1.5-3 2.3-4.8.6 1.4 2 1.6 2.6 3 .3-.8.4-1.5.4-2.4 1.2 1 1.6 2.6 1.6 4 0 2-1.5 3.5-3.5 3.5z" fill="#ffca28"/>',
  rocket: '<path d="M14.5 3.2c3-1.4 6-1.6 6.3-1.3.3.3.1 3.3-1.3 6.3L13 15l-4-4z" fill="#eceff1" stroke="#546e7a" stroke-width="1" stroke-linejoin="round"/><circle cx="16" cy="8" r="1.8" fill="#29b6f6" stroke="#0277bd" stroke-width=".8"/><path d="M9 11l-4-.4 3.2-3.4 4.2.6zM13 15l.4 4 3.4-3.2-.6-4.2z" fill="#ef5350"/><path d="M8 16c-2 .4-3.2 2-3.6 4.6 2.6-.4 4.2-1.6 4.6-3.6z" fill="#ffb300"/>',
  target: '<circle cx="12" cy="12" r="10.5" fill="#fff" stroke="#e53935" stroke-width="2"/><circle cx="12" cy="12" r="6.6" fill="#e53935"/><circle cx="12" cy="12" r="3.4" fill="#fff"/><circle cx="12" cy="12" r="1.4" fill="#e53935"/>',
  book: '<path d="M3 4.5c3-.8 6-.6 9 1.2v15c-3-1.8-6-2-9-1.2z" fill="#42a5f5" stroke="#1565c0" stroke-width="1" stroke-linejoin="round"/><path d="M21 4.5c-3-.8-6-.6-9 1.2v15c3-1.8 6-2 9-1.2z" fill="#90caf9" stroke="#1565c0" stroke-width="1" stroke-linejoin="round"/>',
  chart: '<rect x="2" y="2" width="20" height="20" rx="3" fill="#fff" stroke="#546e7a" stroke-width="1.4"/><rect x="5.5" y="12" width="3" height="7" fill="#42a5f5"/><rect x="10.5" y="8" width="3" height="11" fill="#66bb6a"/><rect x="15.5" y="5" width="3" height="14" fill="#ffa726"/>',
  gear: '<path d="M12 7.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8zm9.2 5.6v-2.4l-2.5-.5a7 7 0 0 0-.8-1.9l1.4-2.1-1.7-1.7-2.1 1.4a7 7 0 0 0-1.9-.8L13.1 2.8h-2.4l-.5 2.5a7 7 0 0 0-1.9.8L6.2 4.7 4.5 6.4l1.4 2.1a7 7 0 0 0-.8 1.9l-2.5.5v2.4l2.5.5c.2.7.4 1.3.8 1.9l-1.4 2.1 1.7 1.7 2.1-1.4c.6.4 1.2.6 1.9.8l.5 2.5h2.4l.5-2.5c.7-.2 1.3-.4 1.9-.8l2.1 1.4 1.7-1.7-1.4-2.1c.4-.6.6-1.2.8-1.9z" fill="#78909c" stroke="#37474f" stroke-width=".8" fill-rule="evenodd"/>',
};

const SYMBOL_LABELS = {
  star: ['별', 'Star'], question: ['질문', 'Question'], exclamation: ['중요', 'Important'], idea: ['아이디어', 'Idea'], check: ['확인', 'Check'],
  cross: ['아니오', 'No'], heart: ['좋아함', 'Love'], info: ['정보', 'Info'], warning: ['주의', 'Warning'], lock: ['잠금', 'Locked'],
  money: ['비용', 'Money'], clock: ['시간', 'Time'], calendar: ['일정', 'Calendar'], phone: ['전화', 'Phone'], mail: ['메일', 'Mail'],
  home: ['집', 'Home'], person: ['사람', 'Person'], people: ['팀', 'Team'], pin: ['위치', 'Location'], thumbsUp: ['찬성', 'Pro'],
  thumbsDown: ['반대', 'Con'], bookmark: ['책갈피', 'Bookmark'], fire: ['긴급', 'Hot'], rocket: ['출시', 'Launch'], target: ['목표', 'Goal'],
  book: ['자료', 'Reading'], chart: ['통계', 'Chart'], gear: ['설정', 'Settings'],
};

// id → { id, group, exclusive, label: [ko, en], svg }
export const MARKERS = new Map();
function add(id, group, exclusive, label, svg) { MARKERS.set(id, { id, group, exclusive, label, svg }); }

for (const [name, c] of Object.entries(FLAG_COLORS)) {
  add(`flag-${name}`, 'flag', true, [{ red: '빨간 깃발', orange: '주황 깃발', yellow: '노란 깃발', green: '초록 깃발', blue: '파란 깃발', purple: '보라 깃발', gray: '회색 깃발' }[name], `${name[0].toUpperCase()}${name.slice(1)} flag`], flag(c));
}
add('smiley-happy', 'smiley', true, ['기쁨', 'Happy'], face('<path d="M7.6 13.6c1 2.4 2.6 3.6 4.4 3.6s3.4-1.2 4.4-3.6" fill="none" stroke="#4e342e" stroke-width="1.6" stroke-linecap="round"/>'));
add('smiley-neutral', 'smiley', true, ['보통', 'Neutral'], face('<path d="M8 15.6h8" stroke="#4e342e" stroke-width="1.6" stroke-linecap="round"/>'));
add('smiley-sad', 'smiley', true, ['슬픔', 'Sad'], face('<path d="M7.8 17c1-2.2 2.5-3.2 4.2-3.2s3.2 1 4.2 3.2" fill="none" stroke="#4e342e" stroke-width="1.6" stroke-linecap="round"/>', '', '#90caf9'));
add('smiley-angry', 'smiley', true, ['화남', 'Angry'], face('<path d="M8 16.8c1-1.6 2.4-2.2 4-2.2s3 .6 4 2.2" fill="none" stroke="#4e342e" stroke-width="1.6" stroke-linecap="round"/>', '<path d="M6.6 6.8l3.4 1.6M17.4 6.8 14 8.4" stroke="#4e342e" stroke-width="1.4" stroke-linecap="round"/>', '#ef9a9a'));
add('smiley-surprised', 'smiley', true, ['놀람', 'Surprised'], face('<ellipse cx="12" cy="15.6" rx="2.2" ry="2.6" fill="#4e342e"/>'));
add('arrow-up', 'arrow', true, ['위로', 'Up'], arrow(0, '#43a047'));
add('arrow-down', 'arrow', true, ['아래로', 'Down'], arrow(180, '#e53935'));
add('arrow-left', 'arrow', true, ['왼쪽', 'Left'], arrow(-90));
add('arrow-right', 'arrow', true, ['오른쪽', 'Right'], arrow(90));
add('arrow-refresh', 'arrow', true, ['반복', 'Repeat'], '<circle cx="12" cy="12" r="11" fill="#00897b"/><path d="M17 9.5A5.6 5.6 0 0 0 7 9M7 14.5a5.6 5.6 0 0 0 10 .5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><path d="M17.6 5.6V9.8h-4.2M6.4 18.4v-4.2h4.2" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>');
for (const [name, svg] of Object.entries(SYMBOLS)) add(name, 'symbol', false, SYMBOL_LABELS[name], svg);

export const MARKER_GROUPS = ['flag', 'smiley', 'arrow', 'symbol'];
export const PROGRESS_STEPS = [0, 25, 50, 75, 100];

export function markersOfGroup(group) { return [...MARKERS.values()].filter((m) => m.group === group); }

export function markerLabel(id, lang = 'ko') {
  if (/^priority-\d$/.test(id)) return lang === 'ko' ? `우선순위 ${id.slice(9)}` : `Priority ${id.slice(9)}`;
  if (/^progress-\d+$/.test(id)) return lang === 'ko' ? `진행률 ${id.slice(9)}%` : `Progress ${id.slice(9)}%`;
  const m = MARKERS.get(id);
  return m ? m.label[lang === 'ko' ? 0 : 1] : id;
}

export function markerSvg(id) {
  if (/^priority-\d$/.test(id)) return priorityIcon(Number(id.slice(9)));
  if (/^progress-\d+$/.test(id)) return progressIcon(Number(id.slice(9)));
  const m = MARKERS.get(id);
  return m ? m.svg : '';
}

// The icons a topic shows, in order: priority, progress, then its own icons.
export function topicMarkers(topic) {
  const out = [];
  const task = topic.task || {};
  if (task.priority) out.push(`priority-${task.priority}`);
  if (task.progress != null && task.progress !== '') out.push(`progress-${task.progress}`);
  for (const i of topic.icons || []) if (MARKERS.has(i)) out.push(i);
  return out;
}

// Toggles an icon on a topic: exclusive groups keep one icon.
export function toggleIcon(icons, id) {
  const list = Array.isArray(icons) ? icons.slice() : [];
  const m = MARKERS.get(id);
  if (!m) return list;
  if (list.includes(id)) return list.filter((x) => x !== id);
  const kept = m.exclusive ? list.filter((x) => { const o = MARKERS.get(x); return !o || o.group !== m.group; }) : list;
  return [...kept, id];
}

// Standalone <svg> for UI buttons.
export function markerSvgDoc(id, size = 18) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${markerSvg(id)}</svg>`;
}
