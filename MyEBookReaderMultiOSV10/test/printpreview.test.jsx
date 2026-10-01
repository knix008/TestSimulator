import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DialogBody } from '../src/components/dialogs.jsx';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';
import MenuBar, { BAR_MENUS, MENU_KEYS, MENU_ICONS, BAR_COMMAND } from '../src/components/MenuBar.jsx';
import { ICONS } from '../src/components/Icons.jsx';
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
    const margin = (side) => parseFloat(sheet().style.getPropertyValue(`--print-margin-${side}`));
    const before = margin('left');
    // The margin is set the way every other number is: less, the number, more.
    fireEvent.click(screen.getByLabelText(`${t('print.margin')} +`));
    expect(margin('left')).toBeGreaterThan(before);
    expect(screen.getByTestId('print-setup').textContent).toContain('15mm');

    // And the number itself puts it back to what it was.
    fireEvent.click(screen.getByLabelText(`${t('print.margin')}: 15mm`));
    expect(margin('left')).toBe(before);
  });

  it('draws each side of the sheet at its own width', () => {
    const { sheet } = printDialog();
    const margin = (side) => parseFloat(sheet().style.getPropertyValue(`--print-margin-${side}`));
    fireEvent.click(screen.getByLabelText(t('print.marginEven')));
    fireEvent.click(screen.getByLabelText(`${t('print.margin_left')} +`));
    // A wider binding edge shows as a wider binding edge, not as an average.
    expect(margin('left')).toBeGreaterThan(margin('right'));
    expect(margin('top')).toBe(margin('bottom'));
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
    // The five menus carry data-menu. Settings is on the bar too but is not
    // a menu — it opens a window — so it carries data-command instead, and
    // anything counting the menus must not count it.
    expect(items.map((b) => b.dataset.menu).filter(Boolean)).toEqual(BAR_MENUS);
    expect(items.at(-1).dataset.command).toBe(BAR_COMMAND.id);
    expect(items.slice(0, BAR_MENUS.length).map((b) => b.textContent.trim()))
      .toEqual(BAR_MENUS.map((id) => t(`menu.${id}`)));
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

  it('opens the settings window from the bar, without a menu in between', () => {
    const onCommand = vi.fn();
    const onOpenMenu = vi.fn();
    render(<MenuBar onOpenMenu={onOpenMenu} onCommand={onCommand} />);
    fireEvent.click(screen.getByText(t('cmd.settings')));
    expect(onCommand).toHaveBeenCalledWith('settings');
    expect(onOpenMenu).not.toHaveBeenCalled();
  });

  it('marks the program menu with information, not with a gear', () => {
    // The gear is Settings, which is its own item now.
    expect(MENU_ICONS.app).toBe('info');
    expect(Object.values(MENU_ICONS)).not.toContain('settings');
    expect(BAR_COMMAND.icon).toBe('settings');
  });
  it('draws a picture beside every name', () => {
    render(<MenuBar onOpenMenu={vi.fn()} />);
    for (const id of BAR_MENUS) {
      const item = document.querySelector(`.menubar-item[data-menu="${id}"]`);
      // The icon, then the name — a bar of bare words is what this replaced.
      expect(item.querySelector('svg'), id).toBeTruthy();
      expect(item.querySelector('.menubar-label')?.textContent, id).toBe(t(`menu.${id}`));
      expect(item.firstElementChild.tagName.toLowerCase(), id).toBe('svg');
    }
  });

  it('names an icon for each menu, and no two the same', () => {
    expect(Object.keys(MENU_ICONS).sort()).toEqual([...BAR_MENUS].sort());
    expect(new Set(Object.values(MENU_ICONS)).size).toBe(BAR_MENUS.length);
    for (const name of Object.values(MENU_ICONS)) {
      expect(ICONS[name], name).toBeTruthy();
    }
  });
});
