// The desktop context menu is drawn in a window of its own. A real click on
// that window gives it the focus, so the main window blurs before the click
// arrives: the menu must stay open across that blur, or the item under the
// pointer is gone and Highlight, Copy, Add to library… do nothing.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const menuWin = vi.hoisted(() => ({ focused: false }));

vi.mock('../src/lib/platform.js', () => ({
  api: { win: { popoutHide: () => Promise.resolve(true), popoutShow: () => Promise.resolve(true) } },
}));

vi.mock('../src/lib/popout.js', () => {
  const win = new EventTarget();
  win.closed = false;
  win.document = { hasFocus: () => menuWin.focused };
  menuWin.win = win;
  return {
    canPopOut: () => true,
    openPopout: () => {
      const root = document.createElement('div');
      document.body.append(root);
      return { win, root, label: 'popout-menu' };
    },
    fitPopout: () => Promise.resolve(),
    toScreen: (x, y) => ({ x, y }),
  };
});

const { default: ContextMenu } = await import('../src/components/ContextMenu.jsx');

function renderMenu(items) {
  const onClose = vi.fn();
  render(<ContextMenu open x={40} y={50} items={items} onClose={onClose} />);
  return onClose;
}

describe('ContextMenu in its own window', () => {
  let pageFocus;
  beforeEach(() => {
    vi.useFakeTimers();
    menuWin.focused = false;
    pageFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });
  afterEach(() => {
    pageFocus.mockRestore();
    vi.useRealTimers();
  });

  it('stays open when the main window blurs because the menu took the focus, and runs the item', () => {
    const onHighlight = vi.fn();
    const onClose = renderMenu([{ label: 'Highlight', onClick: onHighlight }]);
    pageFocus.mockReturnValue(false);
    menuWin.focused = true;
    act(() => {
      window.dispatchEvent(new Event('blur'));
      menuWin.win.dispatchEvent(new Event('focus'));
      vi.advanceTimersByTime(500);
    });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Highlight'));
    expect(onHighlight).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when the focus leaves both windows for another program', () => {
    const onClose = renderMenu([{ label: 'Copy selection', onClick: vi.fn() }]);
    pageFocus.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('blur'));
      vi.advanceTimersByTime(500);
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when the menu window, holding the focus, loses it to another program', () => {
    const onClose = renderMenu([{ label: 'Copy selection', onClick: vi.fn() }]);
    pageFocus.mockReturnValue(false);
    act(() => {
      menuWin.win.dispatchEvent(new Event('blur'));
      vi.advanceTimersByTime(500);
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape pressed in the menu window', () => {
    const onClose = renderMenu([{ label: 'Copy selection', onClick: vi.fn() }]);
    act(() => { menuWin.win.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' })); });
    expect(onClose).toHaveBeenCalled();
  });
});
