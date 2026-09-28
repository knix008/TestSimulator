import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MenuHost from '../src/components/MenuHost.jsx';
import DialogHost from '../src/components/DialogHost.jsx';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';
import { translate } from '../src/i18n.js';

const t = (key, args) => translate('ko', key, args);

// The popup windows talk to the main process and to nothing else, so the bridge
// is all they need to be tested through: a payload arrives, the window reports
// the size it wants, and a click travels back as an id.
function bridge() {
  const listeners = { menu: [], dialog: [] };
  const api = {
    isElectron: true,
    menu: {
      payload: vi.fn(async () => null),
      onPayload: vi.fn((cb) => { listeners.menu.push(cb); return () => {}; }),
      reportSize: vi.fn(),
      choose: vi.fn(),
      close: vi.fn(),
    },
    dialog: {
      payload: vi.fn(async () => null),
      onPayload: vi.fn((cb) => { listeners.dialog.push(cb); return () => {}; }),
      reportSize: vi.fn(),
      send: vi.fn(),
      close: vi.fn(),
    },
  };
  return { api, listeners };
}

let harness;

beforeEach(() => {
  harness = bridge();
  window.electronAPI = harness.api;
});

afterEach(() => {
  delete window.electronAPI;
  document.documentElement.classList.remove('popup-window', 'menu-window-root', 'dialog-window-root');
  document.body.classList.remove('popup-window');
});

describe('MenuHost — a menu in its own window', () => {
  it('shows nothing until the main process says which menu this is', () => {
    render(<MenuHost />);
    expect(document.querySelector('.menu-list')).toBeNull();
  });

  it('renders the menu it is told to, one row per line with icons', async () => {
    render(<MenuHost />);
    harness.listeners.menu[0]({
      menu: 'file',
      language: 'ko',
      theme: 'dark',
      state: { hasBook: true, recentFiles: [] },
      openId: 1,
    });
    await waitFor(() => expect(screen.getByText(t('cmd.open'))).toBeTruthy());
    expect(document.querySelectorAll('.menu-item').length).toBeGreaterThan(5);
    for (const item of document.querySelectorAll('.menu-item')) {
      expect(item.querySelector('.menu-icon')).toBeTruthy();
    }
  });

  it('reports the size it needs so the window can fit it', async () => {
    render(<MenuHost />);
    harness.listeners.menu[0]({ menu: 'app', language: 'ko', theme: 'dark', state: {}, openId: 2 });
    await waitFor(() => expect(harness.api.menu.reportSize).toHaveBeenCalled());
    expect(harness.api.menu.reportSize.mock.calls[0][0]).toMatchObject({
      width: expect.any(Number), height: expect.any(Number),
    });
  });

  it('deals a menu too tall for the screen into columns', async () => {
    // jsdom measures nothing, so the list is made to answer with a height that
    // no screen could show, and then with a height that fits once it is split.
    // jsdom's screen is 768px tall, so 1200px of rows needs exactly two columns.
    const heights = { value: 1200 };
    const measure = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function rect() {
        const columns = Number((this.querySelector?.('.menu-list')?.className || '').match(/cols-(\d)/)?.[1] || 1);
        return { width: 300 * columns, height: heights.value / columns, top: 0, left: 0, right: 0, bottom: 0 };
      });
    try {
      render(<MenuHost />);
      harness.listeners.menu[0]({ menu: 'theme', language: 'ko', theme: 'dark', state: {}, openId: 9 });

      await waitFor(() => expect(document.querySelector('.menu-list').className).toContain('cols-'));
      const list = document.querySelector('.menu-list');
      // Forty themes over two columns: twenty rows and two headings, so the
      // first column holds half of the rows.
      expect(list.className).toContain('cols-2');
      expect(document.querySelector('.menu-window').className).toContain('wide');

      // Split, it reports a size the window can actually show.
      await waitFor(() => expect(harness.api.menu.reportSize).toHaveBeenCalled());
      const reported = harness.api.menu.reportSize.mock.calls.at(-1)[0];
      expect(reported.height).toBeLessThan(1200);
      expect(reported.width).toBeGreaterThan(300);
    } finally {
      measure.mockRestore();
    }
  });

  it('keeps a short menu in one column', async () => {
    render(<MenuHost />);
    harness.listeners.menu[0]({ menu: 'app', language: 'ko', theme: 'dark', state: {}, openId: 10 });
    await waitFor(() => expect(document.querySelector('.menu-list')).toBeTruthy());
    expect(document.querySelector('.menu-list').className).toBe('menu-list');
    expect(document.querySelector('.menu-window').className).toBe('menu-window');
  });

  it('sends the chosen row back to the window that opened it', async () => {
    render(<MenuHost />);
    harness.listeners.menu[0]({ menu: 'app', language: 'ko', theme: 'dark', state: {}, openId: 3 });
    await waitFor(() => expect(screen.getByText(t('cmd.about'))).toBeTruthy());
    fireEvent.click(screen.getByText(t('cmd.about')));
    expect(harness.api.menu.choose).toHaveBeenCalledWith('about');
  });

  it('renders the theme list with a swatch per theme', async () => {
    render(<MenuHost />);
    harness.listeners.menu[0]({ menu: 'theme', language: 'ko', theme: 'nord', state: {}, openId: 4 });
    await waitFor(() => expect(document.querySelectorAll('.theme-swatch').length).toBeGreaterThan(20));
    expect(document.querySelector('.menu-item.checked').textContent).toContain('nord');
  });

  it('follows the language it is given', async () => {
    render(<MenuHost />);
    harness.listeners.menu[0]({ menu: 'app', language: 'en', theme: 'dark', state: {}, openId: 5 });
    await waitFor(() => expect(screen.getByText('About')).toBeTruthy());
  });

  it('applies the theme it is given, so the popup matches the app', async () => {
    render(<MenuHost />);
    harness.listeners.menu[0]({ menu: 'app', language: 'ko', theme: 'sepia', state: {}, openId: 6 });
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('sepia'));
  });

  it('dismisses itself on Escape', () => {
    render(<MenuHost />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(harness.api.menu.close).toHaveBeenCalled();
  });

  it('empties itself when the menu is dismissed', async () => {
    render(<MenuHost />);
    harness.listeners.menu[0]({ menu: 'app', language: 'ko', theme: 'dark', state: {}, openId: 7 });
    await waitFor(() => expect(document.querySelector('.menu-list')).toBeTruthy());
    harness.listeners.menu[0](null);
    await waitFor(() => expect(document.querySelector('.menu-list')).toBeNull());
  });
});

describe('DialogHost — a dialog in its own window', () => {
  const message = (name, payload = {}, openId = 1) => ({
    name,
    openId,
    payload: { language: 'ko', theme: 'dark', settings: DEFAULT_SETTINGS, ...payload },
  });

  it('shows nothing until it is given an identity', () => {
    render(<DialogHost />);
    expect(document.querySelector('.dialog')).toBeNull();
  });

  it('renders the dialog it is told to be, framed and titled', async () => {
    render(<DialogHost />);
    harness.listeners.dialog[0](message('about', { info: {}, build: { version: '1.0.0' } }));
    await waitFor(() => expect(screen.getByText(t('about.title'))).toBeTruthy());
    expect(document.querySelector('.dialog-about')).toBeTruthy();
  });

  it('sends a result back and closes for a final answer', async () => {
    render(<DialogHost />);
    harness.listeners.dialog[0](message('unsaved'));
    await waitFor(() => expect(screen.getByText(t('common.save'))).toBeTruthy());
    fireEvent.click(screen.getByText(t('common.save')));
    expect(harness.api.dialog.send).toHaveBeenCalledWith('unsaved', { action: 'save' });
    expect(harness.api.dialog.close).toHaveBeenCalled();
  });

  it('stays open for a live edit, such as a settings change', async () => {
    render(<DialogHost />);
    harness.listeners.dialog[0](message('settings'));
    await waitFor(() => expect(screen.getByTitle('sepia')).toBeTruthy());
    fireEvent.click(screen.getByTitle('sepia'));
    expect(harness.api.dialog.send).toHaveBeenCalledWith('settings', expect.objectContaining({ action: 'settings' }));
    expect(harness.api.dialog.close).not.toHaveBeenCalled();
  });

  it('reports the height its content needs, so nothing scrolls inside', async () => {
    render(<DialogHost />);
    harness.listeners.dialog[0](message('unsaved'));
    await waitFor(() => expect(harness.api.dialog.reportSize).toHaveBeenCalled());
  });

  it('does not resize the fixed dialogs', async () => {
    render(<DialogHost />);
    harness.listeners.dialog[0](message('settings'));
    await waitFor(() => expect(document.querySelector('.dialog-settings')).toBeTruthy());
    expect(harness.api.dialog.reportSize).not.toHaveBeenCalled();
  });

  it('closes on Escape and from the title bar', async () => {
    render(<DialogHost />);
    harness.listeners.dialog[0](message('about', { info: {}, build: {} }));
    await waitFor(() => expect(document.querySelector('.dialog-x')).toBeTruthy());
    fireEvent.click(document.querySelector('.dialog-x'));
    expect(harness.api.dialog.close).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(harness.api.dialog.close).toHaveBeenCalledTimes(2);
  });

  it('empties itself when the pooled window is handed back', async () => {
    render(<DialogHost />);
    harness.listeners.dialog[0](message('about', { info: {}, build: {} }));
    await waitFor(() => expect(document.querySelector('.dialog')).toBeTruthy());
    harness.listeners.dialog[0]({ name: null, payload: null, openId: 0 });
    await waitFor(() => expect(document.querySelector('.dialog')).toBeNull());
  });

  it('follows the theme and the language of the application', async () => {
    render(<DialogHost />);
    harness.listeners.dialog[0](message('unsaved', { theme: 'ocean', language: 'en' }));
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('ocean'));
    expect(screen.getByText('Save')).toBeTruthy();
  });
});
