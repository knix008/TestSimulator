import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '../src/i18n.js';
import { setLanguage } from '../src/i18n.js';
import Toolbar from '../src/components/Toolbar.jsx';
import { DEFAULT_SETTINGS, normalize } from '../src/lib/settings.js';
import {
  OPEN_ZOOM_MODE, VIEW_FIT_BUTTONS, fitButtonDisabled, computeScale, normalizeZoomMode,
} from '../src/lib/view.js';
import { pdfSaveTarget, highlightAppearanceContent } from '../src/lib/pdf-write.js';

const noop = () => {};

function toolbarProps(overrides = {}) {
  return {
    doc: { numPages: 4 },
    pageNumber: 1,
    numPages: 4,
    scale: 1,
    hasSelection: false,
    dirty: false,
    history: { canUndo: false, canRedo: false, undo: noop, redo: noop },
    tool: 'text',
    onTool: noop,
    panel: 'none',
    onOpen: noop,
    onOpenUrl: noop,
    onOpenRecent: noop,
    onRemoveRecent: noop,
    onClearRecent: noop,
    onSave: noop,
    onSaveAs: noop,
    onCopyText: noop,
    onSelectPage: noop,
    onExtractImages: noop,
    onExportText: noop,
    onHighlight: noop,
    onComment: noop,
    onComments: noop,
    onBookmarks: noop,
    onBookmark: noop,
    onGoToPage: noop,
    onZoom: noop,
    onZoomMode: noop,
    onRotate: noop,
    onLayout: noop,
    onPageEffect: noop,
    onSearch: noop,
    onTogglePanel: noop,
    onTheme: noop,
    onLang: noop,
    onSettings: noop,
    onAbout: noop,
    onPrint: noop,
    settings: { ...DEFAULT_SETTINGS, theme: 'dark', pageLayout: 'continuous' },
    ...overrides,
  };
}

function fitGroup(container) {
  return container.querySelector('[data-view-fit]');
}

describe('opening fits the page to the window', () => {
  it('uses fit-page as the open and fallback zoom', () => {
    expect(OPEN_ZOOM_MODE).toBe('fit-page');
    expect(DEFAULT_SETTINGS.zoomMode).toBe('fit-page');
    expect(normalizeZoomMode(undefined)).toBe('fit-page');
    expect(normalize({}).zoomMode).toBe('fit-page');
  });

  it('fit-page keeps the whole page inside the pane', () => {
    const baseSize = { width: 600, height: 800 };
    const viewport = { width: 1200, height: 700 };
    const s = computeScale({ baseSize, viewport, zoomMode: OPEN_ZOOM_MODE, zoom: 1, rotation: 0, layout: 'continuous' });
    expect(800 * s).toBeLessThanOrEqual(700);
    expect(600 * s).toBeLessThanOrEqual(1200);
  });
});

describe('view fit buttons', () => {
  it('lists whole page, original, width and height in that order', () => {
    expect(VIEW_FIT_BUTTONS.map((b) => b.mode)).toEqual(['fit-page', 'actual', 'fit-width', 'fit-height']);
  });

  it('disables everything without a document and all but fit-page in two-page view', () => {
    for (const { mode } of VIEW_FIT_BUTTONS) {
      expect(fitButtonDisabled(mode, { hasDoc: false, layout: 'continuous' })).toBe(true);
      expect(fitButtonDisabled(mode, { hasDoc: true, layout: 'single' })).toBe(false);
    }
    expect(fitButtonDisabled('fit-page', { hasDoc: true, layout: 'spread' })).toBe(false);
    expect(fitButtonDisabled('actual', { hasDoc: true, layout: 'spread' })).toBe(true);
  });

  it('renders four toolbar buttons that switch the zoom mode', async () => {
    await setLanguage('ko');
    const onZoomMode = vi.fn();
    const { container } = render(<Toolbar {...toolbarProps({ onZoomMode })} />);
    const group = within(fitGroup(container));
    const names = ['화면 맞춤', '원본 크기', '폭 맞춤', '높이 맞춤'];
    for (const name of names) fireEvent.click(group.getByRole('button', { name }));
    expect(onZoomMode.mock.calls.map((c) => c[0])).toEqual(['fit-page', 'actual', 'fit-width', 'fit-height']);
  });

  it('marks the current mode as active', async () => {
    await setLanguage('ko');
    const { container, rerender } = render(<Toolbar {...toolbarProps()} />);
    const active = () => [...fitGroup(container).querySelectorAll('button.active')].map((b) => b.getAttribute('aria-label'));
    expect(active()).toEqual(['화면 맞춤']);
    rerender(<Toolbar {...toolbarProps({ settings: { ...DEFAULT_SETTINGS, zoomMode: 'fit-height' } })} />);
    expect(active()).toEqual(['높이 맞춤']);
    rerender(<Toolbar {...toolbarProps({ settings: { ...DEFAULT_SETTINGS, zoomMode: 'custom' } })} />);
    expect(active()).toEqual([]);
  });

  it('shows English labels too', async () => {
    await setLanguage('en');
    const { container } = render(<Toolbar {...toolbarProps()} />);
    const group = within(fitGroup(container));
    for (const name of ['Fit Window', 'Actual Size', 'Fit Width', 'Fit Height']) {
      expect(group.getByRole('button', { name })).toBeTruthy();
    }
    await setLanguage('ko');
  });

  it('keeps only fit-page usable in two-page view', async () => {
    await setLanguage('ko');
    const { container } = render(<Toolbar {...toolbarProps({ settings: { ...DEFAULT_SETTINGS, pageLayout: 'spread' } })} />);
    const group = within(fitGroup(container));
    expect(group.getByRole('button', { name: '화면 맞춤' }).disabled).toBe(false);
    expect(group.getByRole('button', { name: '원본 크기' }).disabled).toBe(true);
    expect(group.getByRole('button', { name: '폭 맞춤' }).disabled).toBe(true);
    expect(group.getByRole('button', { name: '높이 맞춤' }).disabled).toBe(true);
  });

  it('disables the buttons before a document is open', async () => {
    await setLanguage('ko');
    const { container } = render(<Toolbar {...toolbarProps({ doc: null })} />);
    for (const b of fitGroup(container).querySelectorAll('button')) expect(b.disabled).toBe(true);
  });
});

describe('saving highlights back into the PDF', () => {
  it('overwrites a file opened from disk and asks otherwise', () => {
    expect(pdfSaveTarget({ desktop: true, path: 'C:\\docs\\a.pdf' })).toBe('overwrite');
    expect(pdfSaveTarget({ desktop: true, path: '/home/u/a.pdf' })).toBe('overwrite');
    expect(pdfSaveTarget({ desktop: true, path: null })).toBe('dialog');
    expect(pdfSaveTarget({ desktop: true, path: 'https://x.test/a.pdf' })).toBe('dialog');
    expect(pdfSaveTarget({ desktop: false, path: '/home/u/a.pdf' })).toBe('dialog');
  });

  it('paints each highlighted line with a multiply-blended fill', () => {
    const content = highlightAppearanceContent(
      [{ x: 10, y: 20, w: 100, h: 12 }, { x: 10, y: 5, w: 50.12345, h: 12 }],
      [1, 0.84, 0],
    );
    expect(content).toContain('/GS0 gs');
    expect(content).toContain('1 0.84 0 rg');
    expect(content).toContain('10 20 100 12 re');
    expect(content).toContain('10 5 50.123 12 re');
    expect(content.trim().endsWith('f')).toBe(true);
  });
});
