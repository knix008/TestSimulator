// Coloured icons, red close buttons, the dotted corner grips, dialogs in a
// window of their own, and whole-sheet printing.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import * as Icons from '../src/components/Icons.jsx';
import Modal from '../src/components/Modal.jsx';
import { mirrorDocument, openPopout, canPopOut } from '../src/lib/popout.js';
import { renderSheet, renderPreviewSheet, renderSheetsForPrint } from '../src/lib/print.js';
import { printPlan } from '../src/lib/print-layout.js';
import { applyTheme } from '../src/lib/settings.js';
import '../src/i18n.js';

const css = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'src', 'App.css'), 'utf8');

// Icons drawn in the text colour on purpose: window buttons and small marks.
const PLAIN = new Set(['IconChevron', 'IconMore', 'IconMinimize', 'IconMaximize', 'IconRestore']);
// Already in full colour: the language flags.
const FLAGS = new Set(['IconFlag']);

describe('coloured icons', () => {
  const icons = Object.entries(Icons).filter(([name, C]) => /^Icon/.test(name) && typeof C === 'function' && !FLAGS.has(name));

  it('gives every icon a colour family', () => {
    expect(icons.length).toBeGreaterThan(80);
    for (const [name, Icon] of icons) {
      const { container, unmount } = render(<Icon />);
      const hue = container.querySelector('svg').getAttribute('data-hue');
      if (PLAIN.has(name)) expect(hue, name).toBeNull();
      else expect(Icons.ICON_HUES, name).toContain(hue);
      unmount();
    }
  });

  it('colours the start-screen background buttons too', () => {
    for (const [id, Icon] of Object.entries(Icons.BG_ICONS)) {
      const { container, unmount } = render(<Icon />);
      expect(Icons.ICON_HUES, id).toContain(container.querySelector('svg').getAttribute('data-hue'));
      unmount();
    }
  });

  it('has a dark and a light shade for every family', () => {
    for (const hue of Icons.ICON_HUES) {
      expect(css, hue).toMatch(new RegExp(`svg\\[data-hue='${hue}'\\]\\s*\\{\\s*color: var\\(--ic-${hue}\\)`));
      expect(css.match(new RegExp(`--ic-${hue}:`, 'g')), hue).toHaveLength(2);
    }
    expect(css).toMatch(/:root\[data-theme-kind='light'\]\s*\{[^}]*--ic-blue/);
  });

  it('takes the text colour on accent backgrounds', () => {
    for (const sel of ['.tbtn.active svg[data-hue]', '.btn.primary svg[data-hue]', '.bg-chip.active svg[data-hue]', '.modal-x:hover svg[data-hue]']) {
      expect(css, sel).toContain(sel);
    }
  });

  it('marks the theme dark or light for the icon shades', () => {
    applyTheme('light');
    expect(document.documentElement.getAttribute('data-theme-kind')).toBe('light');
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme-kind')).toBe('dark');
  });
});

describe('close buttons', () => {
  it('turn red under the pointer in every pop-up', () => {
    const rule = css.match(/\.modal-x:hover, \.close-x:hover, \.winbtn-close:hover \{([^}]*)\}/);
    expect(rule).toBeTruthy();
    expect(rule[1]).toMatch(/background: #e81123/);
    for (const file of ['Gallery.jsx', 'Library.jsx']) {
      const src = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'src', 'components', file), 'utf8');
      expect(src, file).toMatch(/className="btn icon-only close-x" onClick=\{onClose\}/);
    }
  });
});

describe('the window corner grip', () => {
  // Only the desktop window has it, so it is read from the source here; the
  // desktop smoke test (scripts/smoke-desktop.mjs) looks at the real one.
  it('is a triangle of six dots, like the start-screen cards', () => {
    const src = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'src', 'components', 'StatusBar.jsx'), 'utf8');
    const grip = src.slice(src.indexOf('function ResizeGrip'), src.indexOf('export default function StatusBar'));
    expect(grip.match(/<circle /g)).toHaveLength(6);
    expect(grip).not.toMatch(/<path /);
  });
});

describe('dialogs in a window of their own', () => {
  it('stays in the page where no window can be opened (tests)', () => {
    expect(canPopOut()).toBe(false);
    expect(openPopout('dialog-x')).toBeNull();
  });

  it('copies the stylesheets and theme attributes into the window and follows changes', async () => {
    const other = document.implementation.createHTMLDocument('pop');
    const style = document.createElement('style');
    style.textContent = '.x { color: red; }';
    document.head.append(style);
    document.documentElement.setAttribute('data-theme', 'ocean');
    const stop = mirrorDocument(other, document, { rootClass: 'popout-dialog' });
    expect(other.head.querySelector('base')).toBeTruthy();
    expect([...other.head.querySelectorAll('style[data-mirror]')].some((s) => s.textContent.includes('.x'))).toBe(true);
    expect(other.documentElement.getAttribute('data-theme')).toBe('ocean');
    expect(other.documentElement.classList.contains('popout-dialog')).toBe(true);
    document.documentElement.setAttribute('data-theme', 'forest');
    await new Promise((r) => { setTimeout(r, 0); });
    expect(other.documentElement.getAttribute('data-theme')).toBe('forest');
    stop();
    style.remove();
  });

  it('falls back to the in-page dialog with the same fixed size', () => {
    const onClose = vi.fn();
    render(<Modal open windowName="print" fixedSize={{ width: 700, height: 500 }} title="T" onClose={onClose}><p>body</p></Modal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog.closest('.modal-backdrop')).toBeTruthy();
    expect(dialog.style.height).toBe('500px');
    expect(dialog.classList.contains('fixed-size')).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('whole sheets for the printer', () => {
  const calls = [];
  beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = function getContext() {
      const canvas = this;
      return {
        fillRect() {}, save() {}, restore() {}, beginPath() {}, clip() {}, strokeRect() {}, setLineDash() {},
        rect(...a) { calls.push(['rect', ...a]); },
        drawImage(img, ...a) { calls.push(['draw', img.ownerDocument === document, ...a]); },
        getImageData: (x, y, w, h) => { calls.push(['gray', w, h]); return { data: new Uint8ClampedArray(w * h * 4) }; },
        putImageData() {},
        canvas,
      };
    };
    HTMLCanvasElement.prototype.toBlob = function toBlob(cb) { cb({ arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }); };
  });

  const doc = {
    getPage: vi.fn(async () => ({
      rotate: 0,
      getViewport: ({ scale = 1 } = {}) => ({ width: 595.28 * scale, height: 841.89 * scale, scale }),
      render: () => ({ promise: Promise.resolve() }),
      cleanup: vi.fn(),
    })),
  };

  it('draws the paper at the asked resolution with each page in its cell', async () => {
    calls.length = 0;
    const plan = printPlan({ pages: [1, 2, 3], options: { perSheet: 2, margin: 'none' }, orientation: 'landscape' });
    const canvas = document.createElement('canvas');
    const res = await renderSheet({ doc, plan, sheetIndex: 0, canvas, pxPerMm: 2 });
    expect([canvas.width, canvas.height]).toEqual([594, 420]);
    expect(res.pages).toEqual([1, 2]);
    const draws = calls.filter((c) => c[0] === 'draw');
    expect(draws).toHaveLength(2);
    // Drawn from canvases of this document (pdf.js keeps the PDF's fonts here).
    expect(draws.every((d) => d[1])).toBe(true);
    expect(draws[1][2]).toBeGreaterThan(draws[0][2]);
  });

  it('turns the sheet grey for black-and-white printing', async () => {
    calls.length = 0;
    const plan = printPlan({ pages: [1], options: { color: 'gray' } });
    await renderSheet({ doc, plan, sheetIndex: 0, canvas: document.createElement('canvas'), pxPerMm: 1 });
    expect(calls.some((c) => c[0] === 'gray')).toBe(true);
  });

  it('renders the preview at the screen pixel ratio and reports its CSS size', async () => {
    const plan = printPlan({ pages: [1], options: {} });
    const canvas = document.createElement('canvas');
    const res = await renderPreviewSheet({ doc, plan, sheetIndex: 0, canvas, maxWidth: 210, maxHeight: 400, pixelRatio: 2 });
    expect([res.cssWidth, res.cssHeight]).toEqual([210, 297]);
    expect([canvas.width, canvas.height]).toEqual([420, 594]);
  });

  it('makes one JPEG per sheet', async () => {
    const plan = printPlan({ pages: [1, 2, 3, 4, 5], options: { perSheet: 4 } });
    const progress = vi.fn();
    const sheets = await renderSheetsForPrint({ doc, plan, dpi: 30, onProgress: progress });
    expect(sheets.map((s) => s.pages)).toEqual([[1, 2, 3, 4], [5]]);
    expect(sheets[0].bytes).toBeInstanceOf(Uint8Array);
    expect(progress).toHaveBeenLastCalledWith({ done: 2, total: 2 });
  });
});

describe('the theme menu', () => {
  it('has a Custom themes… button at the top that opens the custom theme settings', async () => {
    const { ThemeMenu, CUSTOM_THEME_ACTION } = await import('../src/components/ThemePicker.jsx');
    const { setLanguage } = await import('../src/i18n.js');
    await setLanguage('ko');
    const onCustomize = vi.fn();
    const { container } = render(<div data-menu><ThemeMenu current="dark" onPick={() => {}} onCustomize={onCustomize} /></div>);
    const first = container.querySelector('[data-menu]').firstElementChild;
    expect(first.classList.contains('theme-menu-top')).toBe(true);
    const btn = first.querySelector('[data-theme-customize]');
    expect(btn.textContent).toBe('사용자 정의 테마 설정…');
    expect(btn.compareDocumentPosition(container.querySelector('.theme-cols')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(btn);
    expect(onCustomize).toHaveBeenCalledTimes(1);
    expect(CUSTOM_THEME_ACTION).toBe('__custom-theme__');
  });

  it('has no such button where nothing can open the settings', async () => {
    const { ThemeMenu } = await import('../src/components/ThemePicker.jsx');
    const { container } = render(<ThemeMenu current="dark" onPick={() => {}} />);
    expect(container.querySelector('[data-theme-customize]')).toBeNull();
  });
});

describe('the detached theme menu window', () => {
  it('sends Custom themes… to the main window instead of a theme', async () => {
    const pickTheme = vi.fn();
    window.desktopAPI = { win: { pickTheme, setPopupSize: vi.fn(), closeThemePopup: vi.fn() } };
    try {
      const { default: ThemePopup } = await import('../src/components/ThemePopup.jsx');
      const { CUSTOM_THEME_ACTION } = await import('../src/components/ThemePicker.jsx');
      const { container } = render(<ThemePopup current="dark" />);
      const top = container.querySelector('.theme-popup-menu').firstElementChild;
      expect(top.classList.contains('theme-menu-top')).toBe(true);
      fireEvent.click(top.querySelector('[data-theme-customize]'));
      expect(pickTheme).toHaveBeenCalledWith(CUSTOM_THEME_ACTION);
    } finally {
      delete window.desktopAPI;
    }
  });
});
