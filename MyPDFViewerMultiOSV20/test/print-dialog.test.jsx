import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { setLanguage } from '../src/i18n.js';
import PrintDialog, { PRINT_WINDOW_SIZE } from '../src/components/PrintDialog.jsx';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';
import { PRINT_OPTION_DEFAULTS } from '../src/lib/print-layout.js';

beforeAll(() => {
  if (typeof HTMLCanvasElement !== 'undefined') {
    HTMLCanvasElement.prototype.getContext = () => ({
      fillRect() {}, drawImage() {}, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
      strokeRect() {}, setLineDash() {}, getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {},
      fillStyle: '', strokeStyle: '', lineWidth: 1,
    });
  }
});

// A portrait page (80 × 110 pt).
function mockDoc() {
  return {
    getPage: vi.fn(async () => ({
      rotate: 0,
      getViewport: ({ scale = 1 } = {}) => ({ width: 80 * scale, height: 110 * scale, scale }),
      render: () => ({ promise: Promise.resolve() }),
      cleanup: vi.fn(),
    })),
  };
}

async function renderPrint({ lang = 'en', settings = {}, ...overrides } = {}) {
  await setLanguage(lang);
  const onPrint = vi.fn();
  const onChange = vi.fn();
  const utils = render(
    <PrintDialog
      open
      doc={mockDoc()}
      numPages={12}
      pageNumber={3}
      settings={{ ...DEFAULT_SETTINGS, printScope: 'all', ...settings }}
      onChange={onChange}
      onPrint={onPrint}
      onClose={() => {}}
      busy={false}
      {...overrides}
    />,
  );
  return { onPrint, onChange, ...utils };
}

const q = (sel) => document.querySelector(sel);
const summary = () => q('[data-print-summary]').textContent;
const sheet = () => q('[data-print-sheet]').textContent;
const printButton = () => q('[data-print-go]');
const options = (extra = {}) => expect.objectContaining({ ...PRINT_OPTION_DEFAULTS, ...extra });

describe('PrintDialog — range', () => {
  it('shows how many pages and sheets the all-pages scope will print', async () => {
    await renderPrint();
    expect(summary()).toBe('12 page(s) → 12 sheet(s) × 1');
  });

  it('prints only the current page', async () => {
    const { onPrint } = await renderPrint();
    fireEvent.click(screen.getByRole('radio', { name: /Current page/i }));
    fireEvent.click(printButton());
    expect(onPrint).toHaveBeenCalledWith({ pages: [3], scope: 'current', orientation: 'auto', options: options() });
  });

  it('disables Print for an invalid custom range and says why', async () => {
    const { onPrint } = await renderPrint();
    fireEvent.click(screen.getByRole('radio', { name: /Custom range/i }));
    fireEvent.change(screen.getByPlaceholderText(/1-5/), { target: { value: '99' } });
    expect(q('[data-print-message]').textContent).toMatch(/only has 12 pages/i);
    expect(q('[data-print-message]').classList.contains('error')).toBe(true);
    expect(printButton().disabled).toBe(true);
    fireEvent.click(printButton());
    expect(onPrint).not.toHaveBeenCalled();
  });

  it('accepts a custom range like 1-3, 8', async () => {
    const { onPrint } = await renderPrint();
    fireEvent.click(screen.getByRole('radio', { name: /Custom range/i }));
    fireEvent.change(screen.getByPlaceholderText(/1-5/), { target: { value: '1-3, 8' } });
    fireEvent.click(printButton());
    expect(onPrint).toHaveBeenCalledWith(expect.objectContaining({ pages: [1, 2, 3, 8], scope: 'custom' }));
  });

  it('keeps the range box in place, usable only for a custom range', async () => {
    await renderPrint();
    expect(q('[data-print-range]').disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Custom range/i }));
    expect(q('[data-print-range]').disabled).toBe(false);
  });

  it('prints only the odd or only the even pages', async () => {
    const { onPrint, onChange } = await renderPrint();
    fireEvent.change(q('[data-print-subset]'), { target: { value: 'even' } });
    expect(summary()).toBe('6 page(s) → 6 sheet(s) × 1');
    expect(onChange.mock.calls.at(-1)[0].printOptions.subset).toBe('even');
    fireEvent.click(printButton());
    expect(onPrint.mock.calls[0][0].pages).toEqual([2, 4, 6, 8, 10, 12]);
    fireEvent.change(q('[data-print-subset]'), { target: { value: 'odd' } });
    expect(summary()).toBe('6 page(s) → 6 sheet(s) × 1');
  });

  it('says so when odd/even leaves nothing to print', async () => {
    await renderPrint();
    fireEvent.click(screen.getByRole('radio', { name: /Current page/i }));   // page 3
    fireEvent.change(q('[data-print-subset]'), { target: { value: 'even' } });
    expect(q('[data-print-message]').textContent).toMatch(/no pages of that kind/);
    expect(printButton().disabled).toBe(true);
    expect(screen.getByText('Nothing to preview.')).toBeTruthy();
  });

  it('shows an empty preview when the custom range is blank', async () => {
    await renderPrint();
    fireEvent.click(screen.getByRole('radio', { name: /Custom range/i }));
    fireEvent.change(screen.getByPlaceholderText(/1-5/), { target: { value: '' } });
    expect(screen.getByText('Nothing to preview.')).toBeTruthy();
  });
});

describe('PrintDialog — page setup', () => {
  it('offers paper, orientation, margins, pages per sheet, scale and colour', async () => {
    await renderPrint();
    const values = (sel) => [...q(sel).options].map((o) => o.value);
    expect(values('[data-print-paper]')).toEqual(['a4', 'a3', 'a5', 'b5', 'letter', 'legal']);
    expect(values('[data-print-orientation]')).toEqual(['auto', 'portrait', 'landscape']);
    expect(values('[data-print-margin]')).toEqual(['none', 'narrow', 'normal', 'wide']);
    expect(values('[data-print-per-sheet]')).toEqual(['1', '2', '4', '6', '9']);
    expect(values('[data-print-scale]')).toEqual(['fit', 'actual', 'custom']);
    expect(values('[data-print-color]')).toEqual(['color', 'gray']);
  });

  it('remembers each choice in the settings and sends it with the job', async () => {
    const { onPrint, onChange } = await renderPrint();
    fireEvent.change(q('[data-print-paper]'), { target: { value: 'letter' } });
    fireEvent.change(q('[data-print-margin]'), { target: { value: 'wide' } });
    fireEvent.change(q('[data-print-color]'), { target: { value: 'gray' } });
    fireEvent.change(q('[data-print-orientation]'), { target: { value: 'landscape' } });
    expect(onChange.mock.calls.at(-1)[0].printOrientation).toBe('landscape');
    expect(onChange.mock.calls.at(-2)[0].printOptions).toMatchObject({ paper: 'letter', margin: 'wide', color: 'gray' });
    fireEvent.click(printButton());
    expect(onPrint).toHaveBeenCalledWith(expect.objectContaining({
      orientation: 'landscape', options: options({ paper: 'letter', margin: 'wide', color: 'gray' }),
    }));
  });

  it('starts from the page setup used last time', async () => {
    await renderPrint({ settings: { printOptions: { ...PRINT_OPTION_DEFAULTS, paper: 'a3', perSheet: 2 }, printOrientation: 'portrait' } });
    expect(q('[data-print-paper]').value).toBe('a3');
    expect(q('[data-print-per-sheet]').value).toBe('2');
    expect(q('[data-print-orientation]').value).toBe('portrait');
    expect(summary()).toBe('12 page(s) → 6 sheet(s) × 1');
  });

  it('puts several pages on a sheet and steps through the sheets', async () => {
    await renderPrint();
    fireEvent.change(q('[data-print-per-sheet]'), { target: { value: '4' } });
    expect(summary()).toBe('12 page(s) → 3 sheet(s) × 1');
    expect(sheet()).toBe('Sheet 1 / 3 · p. 1–4');
    fireEvent.click(screen.getByRole('button', { name: 'Next sheet' }));
    await waitFor(() => expect(sheet()).toBe('Sheet 2 / 3 · p. 5–8'));
    fireEvent.click(screen.getByRole('button', { name: 'Last sheet' }));
    await waitFor(() => expect(sheet()).toBe('Sheet 3 / 3 · p. 9–12'));
    expect(screen.getByRole('button', { name: 'Next sheet' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'First sheet' }));
    await waitFor(() => expect(sheet()).toBe('Sheet 1 / 3 · p. 1–4'));
    expect(screen.getByRole('button', { name: 'Previous sheet' }).disabled).toBe(true);
  });

  it('turns the paper for auto orientation when that fits the pages better', async () => {
    await renderPrint();
    expect(q('[data-print-preview-paper]').textContent).toBe('A4 · Portrait');
    // Two portrait pages side by side come out larger on landscape paper.
    fireEvent.change(q('[data-print-per-sheet]'), { target: { value: '2' } });
    await waitFor(() => expect(q('[data-print-preview-paper]').textContent).toBe('A4 · Landscape'));
    fireEvent.change(q('[data-print-orientation]'), { target: { value: 'portrait' } });
    await waitFor(() => expect(q('[data-print-preview-paper]').textContent).toBe('A4 · Portrait'));
    fireEvent.change(q('[data-print-paper]'), { target: { value: 'legal' } });
    await waitFor(() => expect(q('[data-print-preview-paper]').textContent).toBe('Legal · Portrait'));
  });

  it('lets the percent be set only for a custom scale, with − and + steps of 10', async () => {
    const { onChange } = await renderPrint();
    const percent = () => q('[data-print-number="percent"]');
    expect(percent().disabled).toBe(true);
    fireEvent.change(q('[data-print-scale]'), { target: { value: 'custom' } });
    expect(percent().disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Increase Percent' }));
    expect(percent().value).toBe('110');
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Percent' }));
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Percent' }));
    expect(percent().value).toBe('90');
    expect(onChange.mock.calls.at(-1)[0].printOptions).toMatchObject({ scaleMode: 'custom', scalePercent: 90 });
    fireEvent.change(percent(), { target: { value: '9999' } });
    expect(percent().value).toBe('400');
  });

  it('draws the preview sheet', async () => {
    await renderPrint();
    await waitFor(() => expect(q('[data-print-canvas]').width).toBeGreaterThan(1));
    // A4 portrait: taller than wide.
    expect(q('[data-print-canvas]').height).toBeGreaterThan(q('[data-print-canvas]').width);
  });
});

describe('PrintDialog — magnifier', () => {
  it('shows the spot under the pointer enlarged and hides when the pointer leaves', async () => {
    // jsdom has no PointerEvent; a MouseEvent carries the coordinates.
    if (typeof window.PointerEvent === 'undefined') window.PointerEvent = class extends MouseEvent {};
    await renderPrint();
    const canvas = q('[data-print-canvas]');
    await waitFor(() => expect(canvas.width).toBeGreaterThan(1));
    const box = canvas.parentElement;
    canvas.getBoundingClientRect = () => ({ left: 100, top: 50, width: 400, height: 560, right: 500, bottom: 610 });
    box.getBoundingClientRect = () => ({ left: 0, top: 0, width: 700, height: 700, right: 700, bottom: 700 });
    expect(q('[data-print-lens]').hidden).toBe(true);
    fireEvent.pointerMove(box, { clientX: 300, clientY: 200 });
    const lens = q('[data-print-lens]');
    expect(lens.hidden).toBe(false);
    expect(lens.style.left).toBe(`${300 - 150}px`);
    expect(lens.style.top).toBe(`${200 - 95}px`);
    // Off the sheet: no magnifier.
    fireEvent.pointerMove(box, { clientX: 20, clientY: 20 });
    expect(q('[data-print-lens]').hidden).toBe(true);
    fireEvent.pointerMove(box, { clientX: 300, clientY: 200 });
    fireEvent.pointerLeave(box);
    expect(q('[data-print-lens]').hidden).toBe(true);
  });

  it('draws the preview with enough detail for the magnifier', async () => {
    const { PREVIEW_DETAIL } = await import('../src/components/PrintDialog.jsx');
    await renderPrint();
    const canvas = q('[data-print-canvas]');
    await waitFor(() => expect(canvas.width).toBeGreaterThan(1));
    expect(canvas.width / parseFloat(canvas.style.width)).toBeCloseTo(PREVIEW_DETAIL, 1);
  });
});

describe('PrintDialog — fixed size', () => {
  it('has the same fixed size whatever is chosen, with no scrolling', async () => {
    await renderPrint();
    const dialog = screen.getByRole('dialog');
    expect(dialog.classList.contains('fixed-size')).toBe(true);
    expect(dialog.style.height).toBe(`${PRINT_WINDOW_SIZE.height}px`);
    expect(dialog.style.getPropertyValue('--modal-width')).toBe(`${PRINT_WINDOW_SIZE.width}px`);
    const controls = () => dialog.querySelectorAll('input, select, button').length;
    const before = controls();
    fireEvent.click(screen.getByRole('radio', { name: /Custom range/i }));
    fireEvent.change(screen.getByPlaceholderText(/1-5/), { target: { value: '999' } });
    fireEvent.change(q('[data-print-scale]'), { target: { value: 'custom' } });
    expect(controls()).toBe(before);
    expect(dialog.style.height).toBe(`${PRINT_WINDOW_SIZE.height}px`);
  });
});

describe('PrintDialog — web', () => {
  it('leaves the printer and copies to the browser print window', async () => {
    await renderPrint();
    expect(q('[data-print-printer]').disabled).toBe(true);
    expect(q('[data-print-preview-printer]').textContent).toBe('Chosen in the browser print window');
    expect(q('[data-print-number="copies"]').disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /System print dialog/ })).toBeNull();
  });
});

describe('PrintDialog — desktop', () => {
  const listPrinters = () => vi.fn(async () => ({ printers: ['Office', 'Home'], default: 'Home' }));

  it('picks the default printer and prints straight to it with copies, orientation and page setup', async () => {
    const { onPrint, onChange } = await renderPrint({ lang: 'ko', numPages: 4, pageNumber: 2, listPrinters: listPrinters() });
    await waitFor(() => expect(q('[data-print-printer]').value).toBe('Home'));
    expect(screen.getByRole('option', { name: 'Home (기본)' })).toBeTruthy();
    expect(q('[data-print-preview-printer]').textContent).toBe('Home');
    fireEvent.change(q('[data-print-printer]'), { target: { value: 'Office' } });
    expect(q('[data-print-preview-printer]').textContent).toBe('Office');
    fireEvent.change(q('[data-print-number="copies"]'), { target: { value: '3' } });
    fireEvent.change(q('[data-print-orientation]'), { target: { value: 'landscape' } });
    fireEvent.change(q('[data-print-paper]'), { target: { value: 'a5' } });
    expect(summary()).toBe('4쪽 → 용지 4장 × 3부');
    fireEvent.click(printButton());
    expect(onPrint).toHaveBeenCalledWith({
      pages: [1, 2, 3, 4], scope: 'all', printer: 'Office', copies: 3, orientation: 'landscape', options: options({ paper: 'a5' }),
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ printPrinter: 'Office', printOrientation: 'landscape' }));
  });

  it('steps the copies with − and +, between 1 and 99', async () => {
    await renderPrint({ lang: 'ko', listPrinters: listPrinters() });
    await waitFor(() => expect(q('[data-print-printer]').value).toBe('Home'));
    const copies = () => q('[data-print-number="copies"]');
    expect(screen.getByRole('button', { name: '매수 줄이기' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '매수 늘리기' }));
    fireEvent.click(screen.getByRole('button', { name: '매수 늘리기' }));
    expect(copies().value).toBe('3');
    fireEvent.click(screen.getByRole('button', { name: '매수 줄이기' }));
    expect(copies().value).toBe('2');
  });

  it('remembers the last printer and prints straight to it, with no system print window', async () => {
    const { onPrint } = await renderPrint({ lang: 'ko', numPages: 4, pageNumber: 2, listPrinters: listPrinters(), settings: { printPrinter: 'Office' } });
    await waitFor(() => expect(q('[data-print-printer]').value).toBe('Office'));
    expect(screen.queryByRole('button', { name: /시스템 인쇄 창/ })).toBeNull();
    fireEvent.click(printButton());
    expect(onPrint).toHaveBeenCalledTimes(1);
    expect(onPrint.mock.calls[0][0]).toEqual({ pages: [1, 2, 3, 4], scope: 'all', orientation: 'auto', options: options(), printer: 'Office', copies: 1 });
  });

  it('fits the window on a small screen and keeps that size', async () => {
    const { printWindowSize } = await import('../src/components/PrintDialog.jsx');
    expect(printWindowSize(null)).toEqual(PRINT_WINDOW_SIZE);
    expect(printWindowSize({ availWidth: 1920, availHeight: 1040 })).toEqual(PRINT_WINDOW_SIZE);
    expect(printWindowSize({ availWidth: 1280, availHeight: 720 })).toEqual({ width: 1180, height: 680 });
    expect(printWindowSize({ availWidth: 800, availHeight: 600 })).toEqual({ width: 900, height: 620 });
  });

  it('cannot print directly when no printer is installed', async () => {
    await renderPrint({ lang: 'ko', listPrinters: vi.fn(async () => ({ printers: [], default: null })) });
    await waitFor(() => expect(q('[data-print-message]').textContent).toBe('설치된 프린터가 없습니다.'));
    expect(printButton().disabled).toBe(true);
  });
});
