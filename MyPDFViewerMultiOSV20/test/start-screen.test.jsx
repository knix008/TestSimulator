// The start screen: 21 moving 3D backgrounds, their picker (on the start
// screen and in Settings), the library shelf, recent files, the Home and Help
// buttons, and the program guide in doc/.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '../src/i18n.js';
import i18n, { setLanguage } from '../src/i18n.js';
import {
  START_BG_IDS, START_INTERVALS, getScene, makeRandom, normalizeStartBg, clampStartOpacity, clampStartSpeed,
  normalizeStartInterval, nextStartBg, parseColor, project,
} from '../src/lib/startbg.js';
import { BG_ICONS } from '../src/components/Icons.jsx';
import BackgroundPicker from '../src/components/BackgroundPicker.jsx';
import StartScreen from '../src/components/StartScreen.jsx';
import SettingsDialog from '../src/components/SettingsDialog.jsx';
import { DEFAULT_SETTINGS, normalize } from '../src/lib/settings.js';

const root = path.resolve(import.meta.dirname, '..');

// A 2D context that just counts what is drawn.
function fakeContext() {
  const calls = { count: 0 };
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(target, key) {
      if (key === 'calls') return calls;
      if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => grad;
      if (key in target) return target[key];
      return () => { calls.count++; };
    },
    set(target, key, value) { target[key] = value; return true; },
  });
}

describe('21 start-screen backgrounds', () => {
  it('has 21 distinct scenes, each with an icon and a Korean and English name', () => {
    expect(START_BG_IDS).toHaveLength(21);
    expect(new Set(START_BG_IDS).size).toBe(21);
    for (const id of START_BG_IDS) {
      expect(typeof BG_ICONS[id], id).toBe('function');
      for (const lng of ['ko', 'en']) {
        expect(i18n.getResource(lng, 'translation', `startbg.names.${id}`), `${lng} ${id}`).toBeTruthy();
        expect(i18n.getResource(lng, 'translation', `startbg.desc.${id}`), `${lng} ${id}`).toBeTruthy();
      }
    }
  });

  it('draws every scene, frame after frame, without failing', () => {
    const c = { accent: [224, 87, 77], text: [239, 232, 229] };
    for (const id of START_BG_IDS) {
      const scene = getScene(id);
      const state = scene.init(1200, 800, makeRandom(3));
      const ctx = fakeContext();
      let t = 0;
      for (let i = 0; i < 40; i++) {
        t += 0.05;
        scene.draw(ctx, state, { t, dt: 0.05, w: 1200, h: 800, c });
      }
      expect(ctx.calls.count, id).toBeGreaterThan(0);
    }
  });

  it('projects with perspective and hides what is behind the camera', () => {
    const near = project(1, 1, 2, 1000, 800);
    const far = project(1, 1, 8, 1000, 800);
    expect(near.x - 500).toBeGreaterThan(far.x - 500);
    expect(project(1, 1, 0, 1000, 800)).toBeNull();
  });

  it('keeps the settings in range', () => {
    expect(normalizeStartBg('nope')).toBe('books');
    expect(clampStartOpacity(5)).toBe(1);
    expect(clampStartOpacity(0)).toBe(0.1);
    expect(clampStartSpeed(9)).toBe(3);
    expect(clampStartSpeed('x')).toBe(1);
    expect(normalizeStartInterval(17)).toBe(0);
    expect(START_INTERVALS).toContain(60);
    expect(normalize({ startBg: 'ink', startBgOpacity: 2, startBgSpeed: 0, startBgInterval: 30 }))
      .toMatchObject({ startBg: 'ink', startBgOpacity: 1, startBgSpeed: 0.1, startBgInterval: 30 });
    expect(DEFAULT_SETTINGS.showStartPage).toBe(true);
  });

  it('picks the next background in order or at random, never the same one', () => {
    expect(nextStartBg('books')).toBe('pages');
    expect(nextStartBg('ink')).toBe('books');
    for (let i = 0; i < 30; i++) expect(nextStartBg('galaxy', { random: true })).not.toBe('galaxy');
  });

  it('reads theme colours', () => {
    expect(parseColor('#e0574d')).toEqual([224, 87, 77]);
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3]);
    expect(parseColor('junk', [9, 9, 9])).toEqual([9, 9, 9]);
  });
});

describe('BackgroundPicker', () => {
  beforeEach(async () => { await setLanguage('ko'); });

  it('offers 21 buttons with a picture each and reports the choice', () => {
    const onChange = vi.fn();
    const { container } = render(<BackgroundPicker settings={DEFAULT_SETTINGS} onChange={onChange} />);
    const chips = container.querySelectorAll('.bg-chip');
    expect(chips).toHaveLength(21);
    for (const ch of chips) expect(ch.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('.bg-chip.active').dataset.bg).toBe('books');
    fireEvent.click(container.querySelector('[data-bg="galaxy"]'));
    expect(onChange).toHaveBeenLastCalledWith({ startBg: 'galaxy' });
  });

  it('changes opacity, speed, random order and the automatic interval', () => {
    const onChange = vi.fn();
    render(<BackgroundPicker settings={DEFAULT_SETTINGS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('투명도'), { target: { value: '0.35' } });
    expect(onChange).toHaveBeenLastCalledWith({ startBgOpacity: 0.35 });
    fireEvent.change(screen.getByLabelText('움직임 속도'), { target: { value: '2.5' } });
    expect(onChange).toHaveBeenLastCalledWith({ startBgSpeed: 2.5 });
    fireEvent.click(screen.getByText('무작위 순서'));
    expect(onChange).toHaveBeenLastCalledWith({ startBgRandom: true });
    fireEvent.change(screen.getByLabelText('자동 변경 간격'), { target: { value: '60' } });
    expect(onChange).toHaveBeenLastCalledWith({ startBgInterval: 60 });
    fireEvent.click(screen.getByRole('button', { name: /무작위 배경/ }));
    expect(onChange.mock.calls.at(-1)[0].startBg).not.toBe('books');
  });
});

const entries = [
  { path: 'C:\\d\\a.pdf', name: 'a.pdf', dir: 'C:\\d', size: 1, addedAt: 1, openedAt: 30, favorite: true },
  { path: 'C:\\d\\b.pdf', name: 'b.pdf', dir: 'C:\\d', size: 1, addedAt: 2, openedAt: 20 },
];

function renderStart(props = {}) {
  const h = {
    onSettings: vi.fn(), onOpenFile: vi.fn(), onOpenUrl: vi.fn(), onOpenEntry: vi.fn(), onForgetRecent: vi.fn(),
    onShowLibrary: vi.fn(), onShowGallery: vi.fn(), onOpenGuide: vi.fn(), onNeedThumb: vi.fn(),
  };
  const utils = render(<StartScreen settings={DEFAULT_SETTINGS} entries={entries} {...h} {...props} />);
  return { ...utils, ...h };
}

describe('StartScreen', () => {
  beforeEach(async () => { await setLanguage('ko'); });

  it('has the moving background, the title card and the three cards', () => {
    const { container } = renderStart();
    expect(container.querySelector('canvas.start-bg').dataset.scene).toBe('books');
    expect(container.querySelector('canvas.start-bg').style.opacity).toBe('0.6');
    expect(screen.getByText('MyPDFViewer')).toBeTruthy();
    expect(screen.getByText('시작하기')).toBeTruthy();
    expect(screen.getByText('내 서재')).toBeTruthy();
    expect(screen.getByText('시작 화면 배경')).toBeTruthy();
    expect(container.querySelectorAll('.bg-chip')).toHaveLength(21);
  });

  it('shows the library on a shelf and the recently opened files', () => {
    const { container, onOpenEntry, onForgetRecent } = renderStart();
    expect([...container.querySelectorAll('.start-shelf .book-title')].map((e) => e.textContent)).toEqual(['a']);
    const rows = container.querySelectorAll('.start-row');
    expect(rows).toHaveLength(2);
    fireEvent.click(container.querySelector('.start-shelf .book'));
    expect(onOpenEntry).toHaveBeenCalledWith(expect.objectContaining({ name: 'a.pdf' }));
    fireEvent.click(within(rows[1]).getByLabelText(/기록에서 지우기/));
    expect(onForgetRecent).toHaveBeenCalledWith('C:\\d\\b.pdf');
  });

  it('opens files, the gallery, the library and the program guide', () => {
    const { onOpenFile, onOpenUrl, onShowGallery, onShowLibrary, onOpenGuide } = renderStart();
    fireEvent.click(screen.getByRole('button', { name: /^열기/ }));
    fireEvent.click(screen.getByRole('button', { name: /URL 열기/ }));
    fireEvent.click(screen.getByRole('button', { name: /^갤러리/ }));
    fireEvent.click(screen.getByRole('button', { name: /서재로 크게 보기/ }));
    fireEvent.click(screen.getByRole('button', { name: /프로그램 설명/ }));
    expect([onOpenFile, onOpenUrl, onShowGallery, onShowLibrary, onOpenGuide].every((f) => f.mock.calls.length === 1)).toBe(true);
  });

  it('passes background changes and the show-at-startup switch to settings', () => {
    const { container, onSettings } = renderStart();
    fireEvent.click(container.querySelector('[data-bg="aurora"]'));
    expect(onSettings.mock.calls.at(-1)[0]()).toEqual({ startBg: 'aurora' });
    fireEvent.click(screen.getByText('시작할 때 이 화면 보이기'));
    expect(onSettings.mock.calls.at(-1)[0]()).toEqual({ showStartPage: false });
  });

  it('changes the background by itself at the chosen interval', () => {
    vi.useFakeTimers();
    try {
      const { onSettings } = renderStart({ settings: { ...DEFAULT_SETTINGS, startBgInterval: 15 } });
      vi.advanceTimersByTime(15000);
      expect(onSettings).toHaveBeenCalled();
      expect(onSettings.mock.calls[0][0]({ startBg: 'books', startBgRandom: false })).toEqual({ startBg: 'pages' });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Settings → Start screen', () => {
  it('has the same background controls and the startup switch', async () => {
    await setLanguage('ko');
    const onChange = vi.fn();
    render(<SettingsDialog open settings={DEFAULT_SETTINGS} onChange={onChange} onClose={() => {}} />);
    fireEvent.click(screen.getByTitle('시작 화면'));
    const panel = document.querySelector('[data-settings-start]');
    expect(panel.querySelectorAll('.bg-chip')).toHaveLength(21);
    fireEvent.click(panel.querySelector('[data-bg="snow"]'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ startBg: 'snow' }));
    fireEvent.click(within(panel).getByText('시작할 때 이 화면 보이기'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ showStartPage: false }));
  });
});

describe('program guide (doc/)', () => {
  for (const page of ['Guide.html', 'Guide.en.html']) {
    it(`${page} exists and every picture it shows is there`, () => {
      const html = fs.readFileSync(path.join(root, 'doc', page), 'utf8');
      const imgs = [...html.matchAll(/src="(images\/[^"]+)"/g)].map((m) => m[1]);
      expect(imgs.length).toBeGreaterThan(10);
      for (const img of imgs) expect(fs.existsSync(path.join(root, 'doc', img)), img).toBe(true);
      for (const id of ['intro', 'start', 'highlight', 'gallery', 'library', 'print', 'keys']) {
        expect(html, id).toContain(`id="${id}"`);
      }
    });
  }

  it('is copied into public/ by prepare:assets so the app can open it', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.scripts['prepare:assets']).toContain('sync-doc.mjs');
    expect(fs.existsSync(path.join(root, 'scripts', 'sync-doc.mjs'))).toBe(true);
  });

  it('wears the app theme: loads theme.js, which follows the published palette', () => {
    for (const page of ['Guide.html', 'Guide.en.html']) {
      expect(fs.readFileSync(path.join(root, 'doc', page), 'utf8'), page).toContain('<script src="theme.js"></script>');
    }
    const script = fs.readFileSync(path.join(root, 'doc', 'theme.js'), 'utf8');
    expect(script).toContain("'mypdfviewer-theme-palette'");
    expect(script).toContain("addEventListener('storage'");
    const host = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'lib.rs'), 'utf8');
    expect(host).toMatch(/fn win_set_theme_kind/);
    expect(host).toContain('.theme(theme)');
  });

  it('opens from the desktop host in a window of its own', () => {
    const host = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'lib.rs'), 'utf8');
    expect(host).toMatch(/async fn win_open_guide/);
    expect(host).toContain('WebviewUrl::App(format!("doc/{page}")');
  });
});
