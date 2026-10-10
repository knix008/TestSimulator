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
/** A control in the left tools, by its label. */
const leftTool = (label) => within(document.querySelector('.side-panel.left')).getByLabelText(label);
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
    // The recent books are the History tool, not the folder browser that
    // 'library' opens — pressing the wrong one is why this read as a missing
    // recent list rather than a test looking in the wrong place.
    fireEvent.click(screen.getByTitle(t('panel.history')));
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

  it('stops at the first page and the last page of an ebook', async () => {
    await openSample();
    const prev = () => document.querySelector('.page-arrow.left');
    const next = () => document.querySelector('.page-arrow.right');
    expect(prev()).toBeDisabled();
    const input = () => document.querySelector('.page-input').value;
    expect(input()).toBe('1');
    fireEvent.keyDown(window, { key: 'PageUp' });
    expect(input()).toBe('1');

    for (let i = 0; i < 40 && !next().disabled; i += 1) {
      fireEvent.click(next());
    }
    await waitFor(() => expect(next()).toBeDisabled());
    const atEnd = input();
    const left = document.querySelector('[data-testid=bookview]').scrollLeft;
    fireEvent.click(next());
    fireEvent.keyDown(window, { key: 'PageDown' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(input()).toBe(atEnd);
    expect(document.querySelector('[data-testid=bookview]').scrollLeft).toBe(left);
    expect(prev()).not.toBeDisabled();
  });
});

describe('marking up a book', () => {
  it('adds a bookmark and lists it', async () => {
    await openSample();
    fireEvent.click(leftTool(t('panel.bookmarks')));
    fireEvent.click(leftTool(t('cmd.addBookmark')));
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
    fireEvent.click(leftTool(t('panel.bookmarks')));
    fireEvent.click(leftTool(t('cmd.addBookmark')));
    await waitFor(() => expect(document.querySelectorAll('.mark-list li')).toHaveLength(1));
    fireEvent.click(screen.getByTitle(t('panel.remove')));
    await waitFor(() => expect(screen.getByText(t('panel.noBookmarks'))).toBeTruthy());
  });

  it('writes the marks to a reading file with Ctrl+S', async () => {
    await openSample();
    fireEvent.click(leftTool(t('panel.bookmarks')));
    fireEvent.click(leftTool(t('cmd.addBookmark')));
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
    fireEvent.click(leftTool(t('panel.bookmarks')));
    fireEvent.click(leftTool(t('cmd.addBookmark')));
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
    fireEvent.click(leftTool(t('panel.search')));
    const input = await waitFor(() => document.querySelector('[data-search-input]'));
    fireEvent.change(input, { target: { value: '형광펜' } });
    fireEvent.submit(document.querySelector('.panel-search'));
    await waitFor(() => expect(document.querySelector('.hit-list')).toBeTruthy(), { timeout: 5000 });
    expect(document.querySelectorAll('.hit-list li').length).toBeGreaterThan(0);
  });

  it('jumps to the chapter a hit is in and marks it', async () => {
    await openSample();
    fireEvent.click(leftTool(t('panel.search')));
    const input = await waitFor(() => document.querySelector('[data-search-input]'));
    fireEvent.change(input, { target: { value: '형광펜' } });
    fireEvent.submit(document.querySelector('.panel-search'));
    await waitFor(() => expect(document.querySelector('.hit-row')).toBeTruthy(), { timeout: 5000 });
    fireEvent.click(document.querySelector('.hit-row'));
    await waitFor(() => expect(document.querySelector('mark.find-hit')).toBeTruthy());
  });
});

describe('the panels and the view', () => {
  it('folds and opens the left panel with F9', async () => {
    await openSample();
    fireEvent.keyDown(window, { key: 'F9' });
    await waitFor(() => expect(document.querySelector('.side-panel.left.collapsed')).toBeTruthy());
    // Folded, not removed: the strip that opens it again stays.
    expect(document.querySelector('.side-panel.left .panel-body, .side-panel.left .panel-tabs')).toBeNull();
    fireEvent.keyDown(window, { key: 'F9' });
    await waitFor(() => expect(document.querySelector('.side-panel.left.collapsed')).toBeNull());
    expect(document.querySelector('.side-panel.left')).toBeTruthy();
  });

  it('folds and opens the right panel with F10', async () => {
    await openSample();
    fireEvent.keyDown(window, { key: 'F10' });
    await waitFor(() => expect(document.querySelector('.side-panel.right.collapsed')).toBeTruthy());
    expect(document.querySelector('.side-panel.right .panel-body')).toBeNull();
    fireEvent.keyDown(window, { key: 'F10' });
    await waitFor(() => expect(document.querySelector('.side-panel.right.collapsed')).toBeNull());
    expect(document.querySelector('.side-panel.right')).toBeTruthy();
  });

  it('changes the reading layout from the right panel', async () => {
    await openSample();
    fireEvent.click(screen.getByTitle(t('panel.reading')));
    await waitFor(() => expect(screen.getByTitle(t('cmd.viewSingle'))).toBeTruthy());
    fireEvent.click(screen.getByTitle(t('cmd.viewSingle')));
    await waitFor(() => expect(screen.getByTestId('bookview').className).toContain('paged'));
  });

  it('makes the text bigger and smaller', async () => {
    await openSample();
    const before = screen.getByTestId('bookview').style.getPropertyValue('--read-size');
    fireEvent.click(toolbar(t('cmd.textBigger')));
    await waitFor(() => expect(screen.getByTestId('bookview').style.getPropertyValue('--read-size')).not.toBe(before));
    expect(document.querySelector('[data-testid=font-readout]').textContent).toBe('19px');
  });

  it('zooms with Ctrl+wheel over the text', async () => {
    await openSample();
    fireEvent.wheel(screen.getByTestId('bookview'), { deltaY: -100, ctrlKey: true });
    await waitFor(() => expect(document.querySelector('[data-testid=font-readout]').textContent).toBe('19px'));
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
    await waitFor(() => expect(document.querySelector('[data-testid=font-readout]').textContent).toBe('19px'));
    fireEvent.click(toolbar(t('cmd.textReset')));
    await waitFor(() => expect(document.querySelector('[data-testid=font-readout]').textContent).toBe('17px'));
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

describe('opening a file shows it in the window as it is', () => {
  /** Opens a fixed-layout file — a comic or a picture — through the toolbar. */
  async function openPages(name = 'sample.cbz') {
    const platform = await import('../src/lib/platform.js');
    const bytes = sampleBytes(name);
    platform.openFileDialog.mockResolvedValueOnce({
      data: bytes, name, path: `/books/${name}`, size: bytes.length,
    });
    fireEvent.click(toolbar(t('cmd.open')));
    await waitFor(
      () => expect(document.querySelector(`.doctab`)).toBeTruthy(),
      { timeout: 5000 },
    );
    await waitFor(() => expect(document.querySelector('img.comic-page')).toBeTruthy(), { timeout: 5000 });
  }

  it('fits the page to the window, whatever the last file was left at', async () => {
    await openApp();
    await openPages('sample.cbz');
    // The reader zooms this one right in.
    fireEvent.click(toolbar(t('cmd.fitWidth')));
    fireEvent.click(toolbar(t('cmd.zoomIn')));
    await waitFor(() => expect(toolbar(t('cmd.fitPage')).className).not.toContain('active'));

    // The next file opens fitted to the window rather than at the zoom the
    // previous one happened to be left at.
    await openPages('sample.png');
    await waitFor(() => expect(toolbar(t('cmd.fitPage')).className).toContain('active'));
  });

  it('offers one page at a time and a continuous run for a PDF as well as for text', async () => {
    await openApp();
    await openPages();
    // The control is live for a fixed-layout book, which is what "이어보기가
    // 동작하지 않는다" was about: it used to be greyed out unless the book was
    // reflowable text.
    const run = screen.getByTestId('view-continuous');
    expect(run.disabled).toBe(false);
    fireEvent.click(run);
    await waitFor(() => expect(document.querySelector('.bookview.flowing')).toBeTruthy());
    expect(document.querySelectorAll('.page-slot').length).toBeGreaterThan(1);
    expect(screen.getByTestId('view-single').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('view-double').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByTestId('view-single'));
    await waitFor(() => expect(document.querySelector('.bookview.flowing')).toBeNull());
    expect(screen.getByTestId('view-single').getAttribute('aria-pressed')).toBe('true');
  });

  it('says in the status bar that a picture is selected, and which one', async () => {
    await openApp();
    await openPages();
    const image = document.querySelector('img.comic-page');
    fireEvent.pointerDown(image, { button: 0 });
    await waitFor(() => expect(screen.getByTestId('picked-image')).toBeTruthy());
    expect(image.classList.contains('picked')).toBe(true);
    fireEvent.pointerDown(screen.getByTestId('bookview'), { button: 0 });
    await waitFor(() => expect(document.querySelector('[data-testid="picked-image"]')).toBeNull());
  });

  it('says there is no text to select in a comic instead of doing nothing', async () => {
    await openApp();
    await openPages();
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
    await waitFor(() => expect(document.querySelector('.toasts').textContent).toContain(t('status.noText')));
  });
});

describe('drag and drop from outside the window', () => {
  /** A dropped file, with the bytes a real one would hand over. */
  function dropped(name, sample = name) {
    const bytes = sampleBytes(sample);
    const file = new File([bytes], name);
    file.arrayBuffer = async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return file;
  }

  const app = () => document.querySelector('.app');

  it('opens several books dropped together, each in its own tab', async () => {
    await openApp();
    fireEvent.drop(app(), {
      dataTransfer: { files: [dropped('one.md', 'sample.md'), dropped('two.fb2', 'sample.fb2')] },
    });
    await waitFor(() => expect(document.querySelectorAll('.doctab')).toHaveLength(2), { timeout: 8000 });
    const tabs = [...document.querySelectorAll('.doctab')].map((d) => d.textContent).join(' ');
    expect(tabs).toContain('one.md');
    expect(tabs).toContain('two.fb2');
  });

  it('says so when what was dropped holds nothing to open', async () => {
    await openApp();
    fireEvent.drop(app(), { dataTransfer: { files: [], getData: () => '' } });
    await waitFor(() => expect(document.querySelector('.toasts').textContent)
      .toContain(t('error.nothingDropped')));
  });

  it('keeps the highlight while the pointer crosses the window', async () => {
    await openApp();
    const target = app();
    // dragleave fires for every element crossed on the way in, not only when the
    // pointer leaves the window — so the highlight has to survive them.
    fireEvent.dragEnter(target, { dataTransfer: { types: ['Files'] } });
    await waitFor(() => expect(screen.getByText(t('common.dropHere'))).toBeTruthy());
    fireEvent.dragEnter(document.querySelector('.bookview') || target, { dataTransfer: { types: ['Files'] } });
    fireEvent.dragLeave(document.querySelector('.bookview') || target);
    expect(screen.getByText(t('common.dropHere'))).toBeTruthy();
  });

  it('takes the highlight away when the drag leaves the window', async () => {
    await openApp();
    const target = app();
    fireEvent.dragEnter(target, { dataTransfer: { types: ['Files'] } });
    await waitFor(() => expect(screen.getByText(t('common.dropHere'))).toBeTruthy());
    fireEvent.dragLeave(target);
    await waitFor(() => expect(screen.queryByText(t('common.dropHere'))).toBeNull());
  });

  it('takes the highlight away once the book is dropped', async () => {
    await openApp();
    const target = app();
    fireEvent.dragEnter(target, { dataTransfer: { types: ['Files'] } });
    await waitFor(() => expect(screen.getByText(t('common.dropHere'))).toBeTruthy());
    fireEvent.drop(target, { dataTransfer: { files: [dropped('drop.md', 'sample.md')] } });
    await waitFor(() => expect(screen.queryByText(t('common.dropHere'))).toBeNull());
  });

  it('opens a reading file dropped on the window', async () => {
    await openApp();
    // A .ebkr names the book it belongs to and carries the marks; dropping one
    // has to go through the reading-file path, not the book path.
    const library = JSON.stringify({
      app: 'MyEBookReader',
      version: 1,
      book: { name: 'sample.md', path: '', size: 0 },
      reading: { bookmarks: [], highlights: [], notes: [], clips: [] },
    });
    const file = new File([library], 'notes.ebkr');
    file.arrayBuffer = async () => new TextEncoder().encode(library).buffer;
    file.text = async () => library;
    fireEvent.drop(app(), { dataTransfer: { files: [file] } });
    // The book it names is not beside it here, so the reader is told rather than
    // left wondering — what matters is that it was read as a reading file.
    await waitFor(() => expect(document.querySelector('.toasts, .modal')).toBeTruthy(), { timeout: 8000 });
  });
});

describe('bookmarking a spot with the right button', () => {
  /** jsdom lays nothing out, so the pane and the chapter are told their boxes. */
  function boxed(node, box) {
    node.getBoundingClientRect = () => ({
      left: box.left, top: box.top, width: box.width, height: box.height,
      right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top,
    });
    Object.defineProperty(node, 'clientWidth', { value: box.width, configurable: true });
    Object.defineProperty(node, 'clientHeight', { value: box.height, configurable: true });
  }

  it('offers the command only on the right button, and pins the spot it was used at', async () => {
    await openSample();
    const pane = screen.getByTestId('bookview');
    boxed(pane, { left: 0, top: 0, width: 800, height: 600 });
    boxed(screen.getByTestId('chapter'), { left: 100, top: 40, width: 400, height: 800 });

    fireEvent.contextMenu(pane, { clientX: 300, clientY: 240 });
    const menu = await waitFor(() => {
      const el = document.querySelector('.context-menu, .menu-list');
      expect(el).toBeTruthy();
      return el;
    });
    // The command belongs to the right button: it needs a spot, and only a right
    // click has one.
    const row = within(menu).getByText(t('cmd.bookmarkHere'));
    fireEvent.click(row);

    const pin = await waitFor(() => screen.getByTestId('bookmark-pin'));
    // Half way across the chapter and a quarter of the way down it.
    expect(pin.style.left).toBe('300px');
    expect(pin.style.top).toBe('240px');
  });

  it('keeps bookmarking where the reader is when Ctrl+B is used', async () => {
    await openSample();
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    await waitFor(() => expect(document.querySelector('.statusbar').textContent)
      .toContain(t('status.bookmarkAdded')));
    // Nowhere in particular was pointed at, so nothing is pinned to the page.
    expect(document.querySelector('[data-testid=bookmark-pin]')).toBeNull();
  });
});

describe('page numbers of a reflowable book', () => {
  it('works the pages out and marks them as worked out', async () => {
    await openSample();
    await waitFor(() => expect(document.querySelector('.statusbar')?.textContent).toContain('EPUB'));
    // An ebook has no pages of its own — they change with the window and the
    // type size — so the count is an estimate and says so. It is still shown:
    // it is the only number that says how far through the book the reader is.
    const readout = await waitFor(() => {
      const cell = screen.getByTestId('page-readout');
      expect(cell.textContent).toMatch(/[0-9]+\s*\/\s*[0-9]+/);
      return cell;
    });
    expect(readout.textContent).toContain('≈');
    expect(readout.getAttribute('title')).toContain(t('status.pagesEstimated'));
    // The chapter is numbered too, and the contents list is not.
    expect(document.querySelector('.toc-num')).toBeNull();
    expect(document.querySelector('.statusbar').textContent).toContain('1 /');
  });
});
