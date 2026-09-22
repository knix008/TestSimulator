import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ContextMenu from '../src/components/ContextMenu.jsx';

function renderMenu(items, { onClose = vi.fn() } = {}) {
  render(
    <ContextMenu
      open
      x={40}
      y={50}
      items={items}
      onClose={onClose}
    />,
  );
  return onClose;
}

describe('ContextMenu actions', () => {
  it('runs Copy (and other items) on click, then closes', () => {
    const onCopy = vi.fn();
    const onPage = vi.fn();
    const onClose = renderMenu([
      { label: 'Copy selection', onClick: onCopy },
      { label: 'Copy page text', onClick: onPage },
    ]);

    fireEvent.click(screen.getByText('Copy selection'));
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onPage).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the page selection: mousedown on the menu is cancelled', () => {
    renderMenu([{ label: 'Copy selection', onClick: vi.fn() }]);
    const menu = document.querySelector('.ctxmenu');
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    menu.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('does not close when the pointer goes down inside the menu', () => {
    const onClose = renderMenu([{ label: 'Copy page text', onClick: vi.fn() }]);
    fireEvent.pointerDown(screen.getByText('Copy page text'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on a pointerdown outside the menu', () => {
    const onClose = renderMenu([{ label: 'Highlight', onClick: vi.fn() }]);
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not fire a disabled item', () => {
    const onCopy = vi.fn();
    renderMenu([{ label: 'Copy selection', onClick: onCopy, disabled: true }]);
    fireEvent.click(screen.getByText('Copy selection'));
    expect(onCopy).not.toHaveBeenCalled();
  });

  it('runs navigation / tool items the same way as Copy', () => {
    const onNext = vi.fn();
    const onText = vi.fn();
    const onClose = renderMenu([
      { label: 'Next page', onClick: onNext },
      { label: 'Text tool', onClick: onText },
    ]);
    fireEvent.click(screen.getByText('Next page'));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onText).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
