// Moving backgrounds for the start page. Twenty-one of them, one for each part of the
// work: the board, a sprint, the backlog, the roadmap, the calendar, knowledge pages,
// notes, a queue, the flow, links, people, working hours, checks, milestones, lanes,
// priority, comments, the archive, a burndown, focus, and the live pulse.
// Colours follow the theme. The animation pauses while the window is hidden.

export const BACKGROUNDS = [
  { id: 'board', ko: '보드', en: 'Board', icon: 'board' },
  { id: 'sprint', ko: '스프린트', en: 'Sprint', icon: 'play' },
  { id: 'backlog', ko: '백로그', en: 'Backlog', icon: 'backlog' },
  { id: 'roadmap', ko: '로드맵', en: 'Roadmap', icon: 'roadmap' },
  { id: 'calendar', ko: '달력', en: 'Calendar', icon: 'calendar' },
  { id: 'pages', ko: '지식', en: 'Knowledge', icon: 'book' },
  { id: 'notes', ko: '메모', en: 'Notes', icon: 'file' },
  { id: 'queue', ko: '대기열', en: 'Queue', icon: 'list' },
  { id: 'flow', ko: '흐름', en: 'Flow', icon: 'workflow' },
  { id: 'links', ko: '연결', en: 'Links', icon: 'link' },
  { id: 'people', ko: '사람', en: 'People', icon: 'people' },
  { id: 'hours', ko: '근무', en: 'Working hours', icon: 'clock' },
  { id: 'checks', ko: '완료', en: 'Done', icon: 'check' },
  { id: 'milestones', ko: '이정표', en: 'Milestones', icon: 'flag' },
  { id: 'lanes', ko: '레인', en: 'Lanes', icon: 'columns' },
  { id: 'priority', ko: '우선순위', en: 'Priority', icon: 'alert' },
  { id: 'comments', ko: '의견', en: 'Comments', icon: 'comment' },
  { id: 'archive', ko: '보관', en: 'Archive', icon: 'box' },
  { id: 'burndown', ko: '번다운', en: 'Burndown', icon: 'chart' },
  { id: 'focus', ko: '집중', en: 'Focus', icon: 'spark' },
  { id: 'pulse', ko: '현황', en: 'Pulse', icon: 'dashboard' },
];

export const BACKGROUND_IDS = BACKGROUNDS.map((item) => item.id);
export const BACKGROUND_INTERVALS = [0, 15, 30, 60, 120, 300];

export function knownBackground(id) {
  return BACKGROUND_IDS.includes(id) ? id : 'board';
}

export function nextBackground(current, random = Math.random) {
  const others = BACKGROUND_IDS.filter((id) => id !== knownBackground(current));
  return others[Math.floor(random() * others.length) % others.length];
}

const FRAME_MS = 1000 / 30;

const rand = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const rgbCache = new Map();
function hexToRgb(hex) {
  let rgb = rgbCache.get(hex);
  if (!rgb) {
    const match = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    rgb = match ? [0, 2, 4].map((index) => parseInt(match[1].slice(index, index + 2), 16)) : [90, 110, 150];
    rgbCache.set(hex, rgb);
  }
  return rgb;
}

const rgba = (hex, alpha) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${Math.min(1, alpha)})`;
};

export class WorkBackground {
  constructor(canvas, { colors, speed = () => 1, kind = 'board' } = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.colors = colors ?? (() => ({ bg: '#eef2f8', accent: '#3a6cf0', text: '#1d2433', chart: '#7c9cff', dark: false }));
    this.speed = speed;
    this.kind = knownBackground(kind);
    this.frames = 0;
    this.time = 0;
    this.running = false;
    this.wanted = false;
    this.last = 0;
    this.seed();
    this.loop = this.loop.bind(this);
    this.onVisibility = () => { if (document.hidden) this.pause(); else if (this.wanted) this.start(); };
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
  }

  setKind(kind) {
    const next = knownBackground(kind);
    if (next === this.kind) return;
    this.kind = next;
    this.seed();
  }

  seed() {
    const random = rand(this.kind.length * 9973 + 11);
    const count = { links: 26, people: 8, notes: 14, comments: 16, queue: 18, archive: 12, checks: 18 }[this.kind] ?? 24;
    this.items = Array.from({ length: count }, () => ({ x: random(), y: random(), z: random(), s: random(), v: random(), h: random() }));
  }

  resize() {
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * ratio));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      if (!this.running) this.draw();
    }
  }

  start() {
    this.wanted = true;
    if (this.running || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  pause() { this.running = false; }

  stop() { this.wanted = false; this.running = false; }

  destroy() {
    this.stop();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.resizeObserver.disconnect();
  }

  loop(now) {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    if (now - this.last < FRAME_MS - 4) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt * Math.max(0, Number(this.speed()) || 0);
    this.draw();
  }

  draw() {
    const { context: c, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return;
    const colors = this.colors();
    this.frames += 1;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = colors.bg;
    c.fillRect(0, 0, w, h);
    this[this.kind]?.(c, w, h, this.time, colors);
  }

  board(c, w, h, time, colors) {
    const cols = 4;
    const gap = w * 0.04;
    const colW = (w - gap * (cols + 1)) / cols;
    for (let col = 0; col < cols; col += 1) {
      const x = gap + col * (colW + gap);
      c.fillStyle = rgba(colors.text, 0.05);
      round(c, x, h * 0.08, colW, h * 0.84, 16);
      c.fill();
      for (let card = 0; card < 4; card += 1) {
        const y = ((card * 0.22 + time * (0.04 + col * 0.01) + col * 0.15) % 1) * h * 0.7 + h * 0.12;
        c.fillStyle = rgba(card % 2 ? colors.accent : colors.chart, 0.55);
        round(c, x + colW * 0.1, y, colW * 0.8, h * 0.1, 8);
        c.fill();
      }
    }
  }

  sprint(c, w, h, time, colors) {
    const cx = w * 0.5;
    const cy = h * 0.5;
    const rx = w * 0.28;
    const ry = h * 0.28;
    c.strokeStyle = rgba(colors.accent, 0.35);
    c.lineWidth = Math.max(2, w / 400);
    c.beginPath();
    c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < 6; i += 1) {
      const a = time * 0.6 + i * (Math.PI / 3);
      c.fillStyle = rgba(i === 0 ? colors.accent : colors.text, 0.35 + (i === 0 ? 0.4 : 0));
      c.beginPath();
      c.arc(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 6 + (i === 0 ? 5 : 0), 0, Math.PI * 2);
      c.fill();
    }
  }

  backlog(c, w, h, time, colors) {
    for (let row = 0; row < 9; row += 1) {
      const y = ((row * 0.12 + time * 0.05) % 1) * h;
      const width = w * (0.45 + ((row * 17) % 5) * 0.08);
      c.fillStyle = rgba(row % 3 === 0 ? colors.accent : colors.text, 0.16);
      round(c, w * 0.12, y, width, h * 0.06, 8);
      c.fill();
    }
  }

  roadmap(c, w, h, time, colors) {
    c.strokeStyle = rgba(colors.text, 0.2);
    c.beginPath();
    c.moveTo(w * 0.08, h * 0.82);
    c.lineTo(w * 0.92, h * 0.82);
    c.stroke();
    for (let i = 0; i < 5; i += 1) {
      const grow = (Math.sin(time * 0.7 + i) + 1) / 2;
      const x = w * (0.1 + i * 0.16);
      const bh = h * (0.15 + grow * 0.45);
      c.fillStyle = rgba(i % 2 ? colors.accent : colors.chart, 0.55);
      round(c, x, h * 0.8 - bh, w * 0.1, bh, 8);
      c.fill();
    }
  }

  calendar(c, w, h, time, colors) {
    const cols = 7;
    const rows = 5;
    const cellW = w * 0.1;
    const cellH = h * 0.12;
    const ox = (w - cols * cellW) / 2;
    const oy = (h - rows * cellH) / 2;
    const mark = Math.floor(time * 0.8) % (cols * rows);
    for (let i = 0; i < cols * rows; i += 1) {
      const x = ox + (i % cols) * cellW;
      const y = oy + Math.floor(i / cols) * cellH;
      c.strokeStyle = rgba(colors.text, 0.18);
      c.strokeRect(x + 4, y + 4, cellW - 8, cellH - 8);
      if (i === mark || i % 9 === 3) {
        c.fillStyle = rgba(colors.accent, i === mark ? 0.7 : 0.28);
        c.beginPath();
        c.arc(x + cellW / 2, y + cellH / 2, 5, 0, Math.PI * 2);
        c.fill();
      }
    }
  }

  pages(c, w, h, time, colors) {
    for (let i = 0; i < 6; i += 1) {
      const turn = (Math.sin(time * 0.8 + i) + 1) / 2;
      const x = w * (0.12 + i * 0.12);
      const pw = w * (0.08 + turn * 0.06);
      c.fillStyle = rgba(i % 2 ? colors.accent : colors.text, 0.18);
      round(c, x, h * 0.18, pw, h * 0.64, 6);
      c.fill();
      c.fillStyle = rgba(colors.bg, 0.35);
      c.fillRect(x + 8, h * 0.28, pw * 0.6, 3);
      c.fillRect(x + 8, h * 0.34, pw * 0.45, 3);
    }
  }

  notes(c, w, h, time, colors) {
    this.items.forEach((note, index) => {
      const x = ((note.x + time * 0.02 * (0.4 + note.v)) % 1) * w;
      const y = ((note.y + Math.sin(time * 0.4 + index) * 0.03 + 1) % 1) * h;
      c.save();
      c.translate(x, y);
      c.rotate((note.h - 0.5) * 0.4);
      c.fillStyle = rgba(index % 2 ? colors.chart : colors.accent, 0.45);
      round(c, -28, -18, 56, 36, 4);
      c.fill();
      c.restore();
    });
  }

  queue(c, w, h, time, colors) {
    c.fillStyle = rgba(colors.text, 0.06);
    round(c, w * 0.06, h * 0.38, w * 0.88, h * 0.24, 20);
    c.fill();
    this.items.forEach((item, index) => {
      const x = ((item.x + time * (0.05 + item.v * 0.05)) % 1) * w * 0.8 + w * 0.08;
      c.fillStyle = rgba(index % 3 === 0 ? colors.accent : colors.text, 0.45);
      c.beginPath();
      c.arc(x, h * (0.42 + (index % 3) * 0.06), 7 + item.s * 4, 0, Math.PI * 2);
      c.fill();
    });
  }

  flow(c, w, h, time, colors) {
    for (let gate = 0; gate < 3; gate += 1) {
      c.strokeStyle = rgba(colors.accent, 0.35);
      c.strokeRect(w * (0.18 + gate * 0.26), h * 0.3, w * 0.12, h * 0.4);
    }
    for (let i = 0; i < 10; i += 1) {
      const x = ((time * 0.12 + i * 0.1) % 1) * w;
      c.fillStyle = rgba(colors.accent, 0.6);
      c.beginPath();
      c.arc(x, h * (0.42 + (i % 3) * 0.08), 5, 0, Math.PI * 2);
      c.fill();
    }
  }

  links(c, w, h, time, colors) {
    const points = this.items.map((item) => [
      (0.1 + item.x * 0.8 + Math.sin(time * 0.2 + item.h * 6) * 0.02) * w,
      (0.1 + item.y * 0.8 + Math.cos(time * 0.16 + item.v * 6) * 0.02) * h,
    ]);
    c.lineWidth = 1;
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const d = Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]);
        if (d > Math.min(w, h) * 0.18) continue;
        c.strokeStyle = rgba(colors.accent, 0.22);
        c.beginPath();
        c.moveTo(points[i][0], points[i][1]);
        c.lineTo(points[j][0], points[j][1]);
        c.stroke();
      }
      c.fillStyle = rgba(colors.text, 0.55);
      c.beginPath();
      c.arc(points[i][0], points[i][1], 3.5, 0, Math.PI * 2);
      c.fill();
    }
  }

  people(c, w, h, time, colors) {
    const cx = w * 0.5;
    const cy = h * 0.5;
    c.fillStyle = rgba(colors.accent, 0.7);
    c.beginPath();
    c.arc(cx, cy, 16, 0, Math.PI * 2);
    c.fill();
    this.items.forEach((person, index) => {
      const a = time * 0.4 + index * (Math.PI * 2 / this.items.length);
      const ring = 0.16 + (index % 2) * 0.12;
      c.fillStyle = rgba(index % 2 ? colors.chart : colors.text, 0.6);
      c.beginPath();
      c.arc(cx + Math.cos(a) * w * ring, cy + Math.sin(a) * h * ring, 8, 0, Math.PI * 2);
      c.fill();
    });
  }

  hours(c, w, h, time, colors) {
    const cx = w * 0.5;
    const cy = h * 0.5;
    const r = Math.min(w, h) * 0.28;
    c.strokeStyle = rgba(colors.text, 0.35);
    c.lineWidth = 3;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.stroke();
    const hour = time * 0.15;
    c.strokeStyle = rgba(colors.accent, 0.8);
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.sin(hour) * r * 0.55, cy - Math.cos(hour) * r * 0.55);
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.sin(hour * 12) * r * 0.75, cy - Math.cos(hour * 12) * r * 0.75);
    c.stroke();
  }

  checks(c, w, h, time, colors) {
    const shown = Math.floor((time * 2) % 12) + 1;
    for (let i = 0; i < 12; i += 1) {
      const x = w * (0.18 + (i % 4) * 0.18);
      const y = h * (0.25 + Math.floor(i / 4) * 0.2);
      c.strokeStyle = rgba(colors.text, 0.25);
      c.strokeRect(x, y, 22, 22);
      if (i < shown) {
        c.strokeStyle = rgba(colors.accent, 0.9);
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x + 4, y + 12);
        c.lineTo(x + 9, y + 17);
        c.lineTo(x + 18, y + 6);
        c.stroke();
      }
    }
  }

  milestones(c, w, h, time, colors) {
    c.strokeStyle = rgba(colors.text, 0.3);
    c.beginPath();
    c.moveTo(w * 0.08, h * 0.62);
    c.lineTo(w * 0.92, h * 0.62);
    c.stroke();
    for (let i = 0; i < 5; i += 1) {
      const x = w * (0.15 + ((i * 0.16 + time * 0.03) % 0.75));
      c.strokeStyle = rgba(colors.accent, 0.8);
      c.beginPath();
      c.moveTo(x, h * 0.62);
      c.lineTo(x, h * 0.38);
      c.stroke();
      c.fillStyle = rgba(i % 2 ? colors.chart : colors.accent, 0.7);
      c.beginPath();
      c.moveTo(x, h * 0.38);
      c.lineTo(x + 22, h * 0.44);
      c.lineTo(x, h * 0.5);
      c.fill();
    }
  }

  lanes(c, w, h, time, colors) {
    for (let lane = 0; lane < 3; lane += 1) {
      const y = h * (0.16 + lane * 0.26);
      c.fillStyle = rgba(colors.text, 0.05);
      round(c, w * 0.06, y, w * 0.88, h * 0.2, 14);
      c.fill();
      for (let card = 0; card < 4; card += 1) {
        const x = ((card * 0.22 + time * (0.04 + lane * 0.015)) % 1) * w * 0.75 + w * 0.1;
        c.fillStyle = rgba(lane === 1 ? colors.accent : colors.chart, 0.5);
        round(c, x, y + h * 0.04, w * 0.12, h * 0.12, 8);
        c.fill();
      }
    }
  }

  priority(c, w, h, time, colors) {
    const tones = [colors.accent, colors.chart, colors.text];
    for (let i = 0; i < 6; i += 1) {
      const pulse = (Math.sin(time * 1.4 + i) + 1) / 2;
      const bh = h * (0.12 + (5 - i) * 0.08 + pulse * 0.08);
      c.fillStyle = rgba(tones[i % 3], 0.45 + pulse * 0.25);
      round(c, w * (0.12 + i * 0.13), h * 0.78 - bh, w * 0.08, bh, 6);
      c.fill();
    }
  }

  comments(c, w, h, time, colors) {
    this.items.forEach((item, index) => {
      const y = h - ((item.y + time * (0.04 + item.v * 0.04)) % 1) * h;
      const x = item.x * w * 0.8 + w * 0.08;
      c.fillStyle = rgba(index % 2 ? colors.accent : colors.text, 0.28);
      round(c, x, y, 70 + item.s * 40, 28, 14);
      c.fill();
    });
  }

  archive(c, w, h, time, colors) {
    for (let i = 0; i < 8; i += 1) {
      const drop = (time * 0.08 + i * 0.12) % 1;
      const x = w * (0.15 + (i % 4) * 0.18);
      const y = h * (0.15 + drop * 0.55 + Math.floor(i / 4) * 0.02);
      c.fillStyle = rgba(i % 2 ? colors.chart : colors.accent, 0.4);
      round(c, x, y, w * 0.12, h * 0.1, 4);
      c.fill();
      c.fillStyle = rgba(colors.bg, 0.35);
      c.fillRect(x, y + h * 0.025, w * 0.12, 4);
    }
  }

  burndown(c, w, h, time, colors) {
    c.strokeStyle = rgba(colors.text, 0.2);
    c.beginPath();
    c.moveTo(w * 0.1, h * 0.2);
    c.lineTo(w * 0.1, h * 0.82);
    c.lineTo(w * 0.9, h * 0.82);
    c.stroke();
    c.strokeStyle = rgba(colors.accent, 0.75);
    c.lineWidth = 2;
    c.beginPath();
    const phase = time * 0.35;
    for (let step = 0; step <= 16; step += 1) {
      const t = step / 16;
      const drop = t * 0.55 + Math.sin(phase + t * 5) * 0.03;
      const x = w * (0.1 + t * 0.78);
      const y = h * (0.22 + drop);
      if (step === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  }

  focus(c, w, h, time, colors) {
    const x = w * (0.5 + 0.22 * Math.sin(time * 0.2));
    const y = h * (0.48 + 0.16 * Math.cos(time * 0.17));
    const glow = c.createRadialGradient(x, y, 0, x, y, Math.max(w, h) * 0.42);
    glow.addColorStop(0, rgba(colors.accent, colors.dark ? 0.45 : 0.28));
    glow.addColorStop(1, rgba(colors.accent, 0));
    c.fillStyle = glow;
    c.fillRect(0, 0, w, h);
  }

  pulse(c, w, h, time, colors) {
    for (let i = 0; i < 12; i += 1) {
      const level = (Math.sin(time * 1.6 + i * 0.7) + 1) / 2;
      const bh = h * (0.08 + level * 0.55);
      c.fillStyle = rgba(i % 2 ? colors.accent : colors.chart, 0.4 + level * 0.35);
      round(c, w * (0.06 + i * 0.075), h * 0.8 - bh, w * 0.05, bh, 4);
      c.fill();
    }
  }
}

function round(c, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + radius, y);
  c.arcTo(x + w, y, x + w, y + h, radius);
  c.arcTo(x + w, y + h, x, y + h, radius);
  c.arcTo(x, y + h, x, y, radius);
  c.arcTo(x, y, x + w, y, radius);
  c.closePath();
}

export function backgroundColors() {
  const style = getComputedStyle(document.documentElement);
  const pick = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  const bg = pick('--bg', '#eef2f8');
  const [r, g, b] = hexToRgb(bg);
  return {
    bg,
    accent: pick('--accent', '#3a6cf0'),
    text: pick('--text', '#1d2433'),
    chart: pick('--chart', '#7c9cff'),
    dark: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.45,
  };
}
