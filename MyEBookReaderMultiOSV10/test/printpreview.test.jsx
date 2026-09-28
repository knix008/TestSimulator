import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DialogBody } from '../src/components/dialogs.jsx';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';
import MenuBar, { BAR_MENUS, MENU_KEYS } from '../src/components/MenuBar.jsx';
import { paperSizeMm } from '../src/lib/print.js';
import { translate } from '../src/i18n.js';

const t = (key, args) => translate('ko', key, args);

function printDialog(print = {}) {
  const onResult = vi.fn();
  render(
    <DialogBody
      name="print"
      payload={{
        language: 'ko',
        print: {
          count: 8, current: 1, scope: 'all', reflowable: true,
          previewHtml: '<p>a page</p>', previewTitle: '첫 장', ...print,
        },
      }}
      onResult={onResult}
    />,
  );
  return { onResult, sheet: () => document.querySelector('.print-preview-paper') };
}

const ratioOf = (el) => el.style.aspectRatio.replace(/\s/g, '');

describe('the print preview follows the page setup', () => {
  it('draws the paper it is set to, in proportion', () => {
    const { sheet } = printDialog();
    const [w, h] = paperSizeMm('A4', false);
    expect(ratioOf(sheet())).toBe(`${w}/${h}`);
  });

  it('changes shape when another paper is chosen', () => {
    const { sheet } = printDialog();
    const before = ratioOf(sheet());
    fireEvent.change(screen.getByLabelText(t('print.paper')), { target: { value: 'A5' } });
    const [w, h] = paperSizeMm('A5', false);
    expect(ratioOf(sheet())).toBe(`${w}/${h}`);
    // A5 and A4 share proportions, so the label is what tells them apart.
    expect(sheet().dataset.paper).toBe('A5');
    expect(screen.getByTestId('print-setup').textContent).toContain('A5');
    expect(before).toBeTruthy();
  });

  it('turns over for landscape', () => {
    const { sheet } = printDialog();
    fireEvent.click(screen.getByText(t('print.landscape')));
    const [w, h] = paperSizeMm('A4', true);
    expect(ratioOf(sheet())).toBe(`${w}/${h}`);
    expect(w).toBeGreaterThan(h);
    expect(document.querySelector('.print-preview-sheet').className).toContain('landscape');
    expect(screen.getByTestId('print-setup').textContent).toContain(t('print.landscape'));
  });

  it('shows the margins, and widens them as they are set', () => {
    const { sheet } = printDialog();
    const margin = () => parseFloat(sheet().style.getPropertyValue('--print-margin-x'));
    const before = margin();
    // The margin is set the way every other number is: less, the number, more.
    fireEvent.click(screen.getByLabelText(`${t('print.margin')} +`));
    expect(margin()).toBeGreaterThan(before);
    expect(screen.getByTestId('print-setup').textContent).toContain('16mm');

    // And the number itself puts it back to what it was.
    fireEvent.click(screen.getByLabelText(`${t('print.margin')}: 16mm`));
    expect(margin()).toBe(before);
  });

  it('sets every other number the same way', () => {
    // One row per number, three controls: less, the value, more.
    render(
      <DialogBody
        name="settings"
        payload={{ language: 'ko', settings: DEFAULT_SETTINGS }}
        onResult={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText(t('settings.tabs.reading')));
    const steppers = [...document.querySelectorAll('.settings-panel.on .stepper')];
    expect(steppers.length).toBeGreaterThanOrEqual(2);
    for (const stepper of steppers) {
      expect(stepper.querySelectorAll('button')).toHaveLength(3);
      expect(stepper.querySelector('.stepper-value').textContent).toBeTruthy();
    }
    expect(document.querySelectorAll('.settings-panel.on input[type="range"]')).toHaveLength(0);
  });

  it('prints the chapter title on the sheet only when asked to', () => {
    printDialog();
    expect(screen.getByText('첫 장')).toBeTruthy();
    fireEvent.click(screen.getByText(t('print.titles')));
    expect(screen.queryByText('첫 장')).toBeNull();
  });

  it('asks the application for a new page only when the page changes', () => {
    const { onResult } = printDialog({ scope: 'all', count: 8 });
    onResult.mockClear();

    // Page setup is drawn here, so none of it goes back to the application.
    fireEvent.click(screen.getByText(t('print.landscape')));
    fireEvent.change(screen.getByLabelText(t('print.paper')), { target: { value: 'A5' } });
    expect(onResult).not.toHaveBeenCalled();

    // A different page does.
    fireEvent.click(screen.getByTitle(t('cmd.nextSection')));
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ action: 'preview', page: 2 }));
  });
});

describe('the menu bar', () => {
  it('names every menu, in order', () => {
    const onOpenMenu = vi.fn();
    render(<MenuBar onOpenMenu={onOpenMenu} />);
    const items = [...document.querySelectorAll('.menubar-item')];
    expect(items.map((b) => b.dataset.menu)).toEqual(BAR_MENUS);
    expect(items.map((b) => b.textContent)).toEqual(BAR_MENUS.map((id) => t(`menu.${id}`)));
    expect(document.querySelector('[role="menubar"]')).toBeTruthy();
  });

  it('opens a menu, anchored under the name that was clicked', () => {
    const onOpenMenu = vi.fn();
    render(<MenuBar onOpenMenu={onOpenMenu} />);
    fireEvent.click(screen.getByText(t('menu.view')));
    expect(onOpenMenu).toHaveBeenCalledWith('view', expect.objectContaining({
      x: expect.any(Number), y: expect.any(Number), width: expect.any(Number),
    }));
  });

  it('shows which menu is open', () => {
    render(<MenuBar onOpenMenu={vi.fn()} openMenu="marks" />);
    const open = document.querySelector('.menubar-item.open');
    expect(open.dataset.menu).toBe('marks');
    expect(open.getAttribute('aria-expanded')).toBe('true');
  });

  it('swaps menus when the pointer moves along an open bar', () => {
    const onOpenMenu = vi.fn();
    render(<MenuBar onOpenMenu={onOpenMenu} openMenu="file" />);
    fireEvent.mouseEnter(screen.getByText(t('menu.view')));
    expect(onOpenMenu).toHaveBeenCalledWith('view', expect.any(Object));

    cleanup();
    onOpenMenu.mockClear();
    // With nothing open, passing over a name does nothing.
    render(<MenuBar onOpenMenu={onOpenMenu} />);
    fireEvent.mouseEnter(screen.getByText(t('menu.view')));
    expect(onOpenMenu).not.toHaveBeenCalled();
  });

  it('gives each menu a letter to open it by', () => {
    expect(Object.keys(MENU_KEYS).sort()).toEqual([...BAR_MENUS].sort());
    expect(new Set(Object.values(MENU_KEYS)).size).toBe(BAR_MENUS.length);
  });
});
