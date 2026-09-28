import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { sampleBytes } from './helpers/samples.mjs';
import i18n from '../src/i18n.js';

// The whole application, driven through its own controls.
//
// Only the edge of the app is replaced — the file dialogs, the clipboard and
// printing, which are the browser's or the OS's job. Everything inside (opening
// a real EPUB, laying it out, bookmarking, searching, the panels, the dialogs,
// the keyboard) is the real thing, so these tests fail when a control stops
// working rather than when an implementation detail changes.
const saved = [];
const printed = [];
const copied = [];

vi.mock('../src/lib/platform.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    openFileDialog: vi.fn(async () => ({
      data: sampleBytes('sample.epub'),
      name: 'sample.epub',
      path: null,
      size: sampleBytes('sample.epub').length,
    })),
    saveText: vi.fn(async ({ defaultName, content }) => {
      saved.push({ defaultName, content });
      return defaultName;
    }),
    copyText: vi.fn(async (text) => { copied.push(text); return true; }),
    readClipboardText: vi.fn(async () => '붙여넣은 글'),
    printHtml: vi.fn(async ({ html, title }) => { printed.push({ html, title }); return { printed: true }; }),
    downloadUrl: vi.fn(async () => ({
      data: sampleBytes('sample.fb2'),
      name: 'downloaded.fb2',
      size: sampleBytes('sample.fb2').length,
    })),
    pickImage: vi.fn(async () => ({ data: new Uint8Array([1, 2, 3]), name: 'bg.png', size: 3 })),
  };
});

const { default: App } = await import('../src/App.jsx');

const t = (key, args) => i18n.t(key, args);

/** A toolbar control, by its label — the panels use some of the same words. */
const toolbar = (label) => within(document.querySelector('.toolbar')).getByLabelText(label);
/** The dialog showing right now. */
const dialog = () => within(document.querySelector('.modal'));

async function openApp() {
  const view = render(<App />);
  // The welcome hint is unique; the app's name appears in the title bar too.
  await waitFor(() => expect(screen.getByText(t('common.welcomeHint'))).toBeTruthy());
  return view;
}

async function openSample() {
  const view = await openApp();
  fireEvent.click(toolbar(t('cmd.open')));
  await waitFor(() => expect(screen.getByTestId('chapter')).toBeTruthy(), { timeout: 5000 });
  return view;
}

beforeEach(async () => {
  saved.length = 0;
  printed.length = 0;
  copied.length = 0;
  localStorage.clear();
  await i18n.changeLanguage('ko');
});

describe('starting up', () => {
  it('shows the title bar with the program name and its version', async () => {
    await openApp();
    expect(document.querySelector('.titlebar-app').textContent).toBe('MyEBookReader');
    expect(document.querySelector('.titlebar-version').textContent).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  it('invites the reader to open a book', async () => {
    await openApp();
    expect(document.querySelector('.welcome h2').textContent).toBe(t('common.welcome'));
    expect(document.querySelector('.statusbar').textContent).toContain(t('status.noBook'));
  });

  it('has a toolbar, both panels and a status bar', async () => {
    await openApp();
    expect(document.querySelector('.toolbar')).toBeTruthy();
    expect(document.querySelector('.side-panel.left')).toBeTruthy();
    expect(document.querySelector('.side-panel.right')).toBeTruthy();
    expect(document.querySelector('.statusbar')).toBeTruthy();
  });
});

describe('opening a book', () => {
  it('opens an EPUB and shows its first chapter', async () => {
    await openSample();
    expect(screen.getByTestId('chapter').textContent).toContain('MyEBookReader');
    expect(document.title).toContain('sample.epub');
  });

  it('lists the contents in the left panel', async () => {
    await openSample();
    const panel = document.querySelector('.side-panel.left');
    await waitFor(() => expect(within(panel).getByText(/첫 장/)).toBeTruthy());
    expect(within(panel).getByText(/셋째 장/)).toBeTruthy();
  });

  it('shows the book in the status bar and in a tab', async () => {
    await openSample();
    expect(document.querySelector('.statusbar').textContent).toContain('EPUB');
    expect(document.querySelector('.doctab').textContent).toContain('sample.epub');
  });

  it('shows the metadata in the right panel', async () => {
    await openSample();
    const panel = document.querySelector('.side-panel.right');
    expect(within(panel).getByText('MyEBookReader 샘플 책')).toBeTruthy();
    expect(within(panel).getByText('SHKWON')).toBeTruthy();
  });

  it('remembers the book in the recent list', async () => {
    await openSample();
    fireEvent.click(screen.getByTitle(t('panel.library')));
    await waitFor(() => expect(document.querySelector('.recent-list')).toBeTruthy());
    expect(document.querySelector('.recent-list').textContent).toContain('sample.epub');
  });
});

describe('moving through a book', () => {
  it('goes to the next and previous chapter from the toolbar', async () => {
    await openSample();
    fireEvent.click(toolbar(t('cmd.nextSection')));
    await waitFor(() => expect(screen.getByTestId('chapter').textContent).toContain('둘째 장'));
    fireEvent.click(toolbar(t('cmd.prevSection')));
    await waitFor(() => expect(screen.getByTestId('chapter').textContent).toContain('첫 장'));
  });

  it('jumps to a chapter from the contents list', async () => {
    await openSample();
    const panel = document.querySelector('.side-panel.left');
    fireEvent.click(within(panel).getByText(/셋째 장/));
    await waitFor(() => expect(screen.getByTestId('chapter').textContent).toContain('셋째 장'));
  });

  it('jumps to a chapter typed into the toolbar box', async () => {
    await openSample();
    const input = document.querySelector('.page-input');
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(screen.getByTestId('chapter').textContent).toContain('둘째 장'));
  });

  it('follows a link inside the book', async () => {
    await openSample();
    fireEvent.click(toolbar(t('cmd.nextSection')));
    await waitFor(() => expect(screen.getByText('셋째 장으로 이동')).toBeTruthy());
    fireEvent.click(screen.getByText('셋째 장으로 이동'));
    await waitFor(() => expect(screen.getByTestId('chapter').textContent).toContain('그림과 인쇄'));
  });

  it('turns the page with the keyboard', async () => {
    await openSample();
    fireEvent.keyDown(window, { key: 'PageDown' });
    await waitFor(() => expect(screen.getByTestId('chapter').textContent).toContain('둘째 장'));
  });
});

describe('marking up a book', () => {
  it('adds a bookmark and lists it', async () => {
    await openSample();
    fireEvent.click(toolbar(t('cmd.addBookmark')));
    await waitFor(() => expect(document.querySelector('.mark-list')).toBeTruthy());
    expect(document.querySelector('.statusbar').textContent).toContain(t('status.modified'));
  });

  it('adds a bookmark with Ctrl+B, and undoes it', async () => {
    await openSample();
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    await waitFor(() => expect(document.querySelectorAll('.mark-list li')).toHaveLength(1));
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    await waitFor(() => expect(document.querySelectorAll('.mark-list li')).toHaveLength(0));
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    await waitFor(() => expect(document.querySelectorAll('.mark-list li')).toHaveLength(1));
  });

  it('removes a bookmark from the panel', async () => {
    await openSample();
    fireEvent.click(toolbar(t('cmd.addBookmark')));
    await waitFor(() => expect(document.querySelectorAll('.mark-list li')).toHaveLength(1));
    fireEvent.click(screen.getByTitle(t('panel.remove')));
    await waitFor(() => expect(screen.getByText(t('panel.noBookmarks'))).toBeTruthy());
  });

  it('writes the marks to a reading file with Ctrl+S', async () => {
    await openSample();
    fireEvent.click(toolbar(t('cmd.addBookmark')));
    await waitFor(() => expect(document.querySelector('.mark-list')).toBeTruthy());
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(saved.length).toBe(1));
    expect(saved[0].defaultName).toBe('sample.ebkr');
    const written = JSON.parse(saved[0].content);
    expect(written.magic).toBe('MyEBookReader');
    expect(written.reading.bookmarks).toHaveLength(1);
    expect(written.book.title).toContain('샘플');
  });

  it('says the work is saved again afterwards', async () => {
    await openSample();
    fireEvent.click(toolbar(t('cmd.addBookmark')));
    await waitFor(() => expect(document.querySelector('.statusbar').textContent).toContain(t('status.modified')));
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(document.querySelector('.statusbar').textContent).toContain(t('status.clean')));
  });

  it('copies a chapter to the clipboard from the context menu', async () => {
    await openSample();
    fireEvent.contextMenu(screen.getByTestId('bookview'), { clientX: 100, clientY: 100 });
    await waitFor(() => expect(document.querySelector('.ctxmenu')).toBeTruthy());
    fireEvent.click(within(document.querySelector('.ctxmenu')).getByText(t('cmd.copySection')));
    await waitFor(() => expect(copied.length).toBe(1));
    expect(copied[0]).toContain('MyEBookReader');
  });
});

describe('searching', () => {
  it('finds a word and lists the hits', async () => {
    await openSample();
    fireEvent.click(toolbar(t('cmd.find')));
    const input = await waitFor(() => document.querySelector('[data-search-input]'));
    fireEvent.change(input, { target: { value: '형광펜' } });
    fireEvent.submit(document.querySelector('.panel-search'));
    await waitFor(() => expect(document.querySelector('.hit-list')).toBeTruthy(), { timeout: 5000 });
    expect(document.querySelectorAll('.hit-list li').length).toBeGreaterThan(0);
  });

  it('jumps to the chapter a hit is in and marks it', async () => {
    await openSample();
    fireEvent.click(toolbar(t('cmd.find')));
    const input = await waitFor(() => document.querySelector('[data-search-input]'));
    fireEvent.change(input, { target: { value: '형광펜' } });
    fireEvent.submit(document.querySelector('.panel-search'));
    await waitFor(() => expect(document.querySelector('.hit-row')).toBeTruthy(), { timeout: 5000 });
    fireEvent.click(document.querySelector('.hit-row'));
    await waitFor(() => expect(document.querySelector('mark.find-hit')).toBeTruthy());
  });
});

describe('the panels and the view', () => {
  it('hides and shows the left panel with F9', async () => {
    await openSample();
    fireEvent.keyDown(window, { key: 'F9' });
    await waitFor(() => expect(document.querySelector('.side-panel.left')).toBeNull());
    fireEvent.keyDown(window, { key: 'F9' });
    await waitFor(() => expect(document.querySelector('.side-panel.left')).toBeTruthy());
  });

  it('hides and shows the right panel with F10', async () => {
    await openSample();
    fireEvent.keyDown(window, { key: 'F10' });
    await waitFor(() => expect(document.querySelector('.side-panel.right')).toBeNull());
  });

  it('changes the reading layout from the right panel', async () => {
    await openSample();
    fireEvent.click(screen.getByTitle(t('panel.reading')));
    await waitFor(() => expect(screen.getByTitle(t('reading.paged'))).toBeTruthy());
    fireEvent.click(screen.getByTitle(t('reading.paged')));
    await waitFor(() => expect(screen.getByTestId('bookview').className).toContain('paged'));
  });

  it('makes the text bigger and smaller', async () => {
    await openSample();
    const before = screen.getByTestId('bookview').style.getPropertyValue('--read-size');
    fireEvent.click(toolbar(t('cmd.textBigger')));
    await waitFor(() => expect(screen.getByTestId('bookview').style.getPropertyValue('--read-size')).not.toBe(before));
    expect(document.querySelector('.zoom-readout').textContent).toBe('110%');
  });

  it('zooms with Ctrl+wheel over the text', async () => {
    await openSample();
    fireEvent.wheel(screen.getByTestId('bookview'), { deltaY: -100, ctrlKey: true });
    await waitFor(() => expect(document.querySelector('.zoom-readout').textContent).toBe('110%'));
  });
});

describe('appearance', () => {
  it('cycles the theme from the toolbar', async () => {
    await openApp();
    const before = document.documentElement.getAttribute('data-theme');
    fireEvent.click(document.querySelector('.toolbar-right .menu-wrap.split .tbtn'));
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).not.toBe(before));
  });

  it('switches language, and every label follows', async () => {
    await openApp();
    fireEvent.click(toolbar(t('cmd.language')));
    await waitFor(() => expect(document.querySelector('.statusbar').textContent).toContain('No book open'));
    expect(toolbar('Open book')).toBeTruthy();
  });

  it('puts the text back to its default size from the readout', async () => {
    await openSample();
    fireEvent.click(toolbar(t('cmd.textBigger')));
    await waitFor(() => expect(document.querySelector('.zoom-readout').textContent).toBe('110%'));
    fireEvent.click(toolbar(t('cmd.textReset')));
    await waitFor(() => expect(document.querySelector('.zoom-readout').textContent).toBe('100%'));
  });
});

describe('the dialogs', () => {
  it('opens the settings dialog and changes the theme there', async () => {
    await openApp();
    fireEvent.click(toolbar(t('cmd.settings')));
    await waitFor(() => expect(document.querySelector('.dialog-settings')).toBeTruthy());
    fireEvent.click(screen.getByTitle('sepia'));
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('sepia'));
  });

  it('opens the About dialog with the build information and the author', async () => {
    await openApp();
    fireEvent.click(toolbar(t('cmd.about')));
    await waitFor(() => expect(screen.getByText('SHKWON(knix008@naver.com)')).toBeTruthy());
    expect(screen.getByText(t('about.built'))).toBeTruthy();
  });

  it('opens the print dialog with the ranges and a preview', async () => {
    await openSample();
    fireEvent.click(toolbar(t('cmd.print')));
    await waitFor(() => expect(document.querySelector('.print-layout')).toBeTruthy());
    expect(screen.getByText(t('print.allHint', { n: 3 }))).toBeTruthy();
    await waitFor(() => expect(document.querySelector('.print-preview-page')).toBeTruthy());
  });

  it('prints the chapters that were chosen', async () => {
    await openSample();
    fireEvent.click(toolbar(t('cmd.print')));
    await waitFor(() => expect(document.querySelector('.dialog-print')).toBeTruthy());
    // "인쇄" is both the dialog's title and its button.
    fireEvent.click(dialog().getByRole('button', { name: t('print.print') }));
    await waitFor(() => expect(printed.length).toBe(1), { timeout: 5000 });
    expect(printed[0].html).toContain('@page');
    expect(printed[0].html).toContain('MyEBookReader');
  });

  it('reports a file it cannot read, with copyable detail', async () => {
    await openApp();
    const file = new File([new Uint8Array([0x00, 0x01, 0x02])], 'broken.epub');
    fireEvent.drop(document.querySelector('.app'), { dataTransfer: { files: [file] } });
    await waitFor(() => expect(document.querySelector('.dialog-error')).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByTitle(t('error.copy'))).toBeTruthy();
    fireEvent.click(screen.getByTitle(t('error.copy')));
    await waitFor(() => expect(copied.length).toBe(1));
    expect(copied[0]).toContain('MyEBookReader');
  });
});

describe('drag and drop', () => {
  it('opens a book dropped onto the window', async () => {
    await openApp();
    const bytes = sampleBytes('sample.md');
    const file = new File([bytes], 'dropped.md');
    file.arrayBuffer = async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    fireEvent.drop(document.querySelector('.app'), { dataTransfer: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('chapter')).toBeTruthy(), { timeout: 5000 });
    expect(document.querySelector('.doctab').textContent).toContain('dropped.md');
  });

  it('shows where a dragged book will land', async () => {
    await openApp();
    fireEvent.dragOver(document.querySelector('.app'));
    await waitFor(() => expect(screen.getByText(t('common.dropHere'))).toBeTruthy());
  });
});

describe('several books at once', () => {
  it('keeps each book in its own tab and switches between them', async () => {
    await openSample();
    const bytes = sampleBytes('sample.fb2');
    const file = new File([bytes], 'second.fb2');
    file.arrayBuffer = async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    fireEvent.drop(document.querySelector('.app'), { dataTransfer: { files: [file] } });
    await waitFor(() => expect(document.querySelectorAll('.doctab')).toHaveLength(2), { timeout: 5000 });

    fireEvent.click(screen.getByText('sample.epub'));
    await waitFor(() => expect(document.querySelector('.doctab.active').textContent).toContain('sample.epub'));
  });

  it('closes a tab from its × button', async () => {
    await openSample();
    fireEvent.click(document.querySelector('.doctab-close'));
    await waitFor(() => expect(document.querySelectorAll('.doctab')).toHaveLength(0));
    expect(screen.getByText(t('common.welcomeHint'))).toBeTruthy();
  });
});
