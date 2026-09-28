import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LeftPanel from '../src/components/LeftPanel.jsx';
import RightPanel from '../src/components/RightPanel.jsx';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';
import i18n from '../src/i18n.js';

const book = {
  meta: { title: '샘플 책', author: 'SHKWON', publisher: 'TestSimulator', date: '2026', language: 'ko', description: '소개 글' },
  fileName: 'sample.epub',
  filePath: 'C:\\books\\sample.epub',
  fileSize: 66779,
  formatLabel: 'EPUB',
  reflowable: true,
  sectionCount: 3,
  cover: () => 'blob:cover',
};

const toc = [
  { label: '첫 장', section: 0, anchor: '', children: [{ label: '1.1 절', section: 1, anchor: 'a', children: [] }] },
  { label: '둘째 장', section: 2, anchor: '', children: [] },
];

function renderLeft(over = {}) {
  const props = {
    panel: 'contents',
    width: 260,
    onPanel: vi.fn(),
    onResize: vi.fn(),
    book,
    section: 0,
    toc,
    onGoTo: vi.fn(),
    bookmarks: [],
    onGoToBookmark: vi.fn(),
    onRemoveBookmark: vi.fn(),
    onClearBookmarks: vi.fn(),
    search: { query: '', results: [], busy: false, activeIndex: -1 },
    onSearch: vi.fn(),
    onGoToHit: vi.fn(),
    folderRoot: '',
    currentPath: '',
    desktop: false,
    onPickFolder: vi.fn(),
    onOpenFile: vi.fn(),
    loadFolder: vi.fn(async () => []),
    recentFiles: [],
    onOpenRecent: vi.fn(),
    onRemoveRecent: vi.fn(),
    onClearRecent: vi.fn(),
    ...over,
  };
  return { ...render(<LeftPanel {...props} />), props };
}

describe('LeftPanel', () => {
  it('shows nothing when it is closed', () => {
    const { container } = renderLeft({ panel: 'none' });
    expect(container.firstChild).toBeNull();
  });

  it('offers a tab per tool, each with a tooltip', () => {
    renderLeft();
    const tabs = [...document.querySelectorAll('.panel-tab')];
    expect(tabs.map((t) => t.getAttribute('title'))).toEqual([
      i18n.t('panel.contents'), i18n.t('panel.library'), i18n.t('panel.bookmarks'), i18n.t('panel.search'),
    ]);
    expect(document.querySelector('.panel-tab.active').title).toBe(i18n.t('panel.contents'));
  });

  it('switches tool when a tab is clicked', () => {
    const { props } = renderLeft();
    fireEvent.click(screen.getByTitle(i18n.t('panel.bookmarks')));
    expect(props.onPanel).toHaveBeenCalledWith('bookmarks');
  });

  it('lists the contents, nested, and jumps when a row is clicked', () => {
    const { props } = renderLeft();
    expect(screen.getByText('첫 장')).toBeTruthy();
    expect(screen.getByText('1.1 절')).toBeTruthy();
    fireEvent.click(screen.getByText('1.1 절'));
    expect(props.onGoTo).toHaveBeenCalledWith(1, 'a');
  });

  it('marks the chapter being read', () => {
    renderLeft({ section: 2 });
    expect(document.querySelector('.toc-row.active').textContent).toContain('둘째 장');
  });

  it('says so when the book has no contents list', () => {
    renderLeft({ toc: [] });
    expect(screen.getByText(i18n.t('panel.noContents'))).toBeTruthy();
  });

  it('lists the bookmarks, and removes one or all of them', () => {
    const bookmarks = [{ id: 'b1', label: '표시한 곳', section: 1, fracY: 0.3 }];
    const { props } = renderLeft({ panel: 'bookmarks', bookmarks });
    fireEvent.click(screen.getByText('표시한 곳'));
    expect(props.onGoToBookmark).toHaveBeenCalledWith(bookmarks[0]);
    fireEvent.click(screen.getByTitle(i18n.t('panel.remove')));
    expect(props.onRemoveBookmark).toHaveBeenCalledWith('b1');
    fireEvent.click(screen.getByTitle(i18n.t('panel.removeAll')));
    expect(props.onClearBookmarks).toHaveBeenCalled();
  });

  it('says so when there are no bookmarks yet', () => {
    renderLeft({ panel: 'bookmarks' });
    expect(screen.getByText(i18n.t('panel.noBookmarks'))).toBeTruthy();
    expect(screen.getByTitle(i18n.t('panel.removeAll'))).toBeDisabled();
  });

  it('searches the book from its own box', () => {
    const { props } = renderLeft({ panel: 'search' });
    const input = document.querySelector('[data-search-input]');
    fireEvent.change(input, { target: { value: '형광펜' } });
    fireEvent.submit(document.querySelector('.panel-search'));
    expect(props.onSearch).toHaveBeenCalledWith('형광펜');
  });

  it('lists the hits with their snippet and jumps to one', () => {
    const results = [{ section: 1, index: 4, snippet: '…형광펜으로…', label: '2' }];
    const { props } = renderLeft({ panel: 'search', search: { query: '형광펜', results, busy: false, activeIndex: 0 } });
    expect(screen.getByText(i18n.t('panel.results', { count: 1 }))).toBeTruthy();
    fireEvent.click(screen.getByText('…형광펜으로…'));
    expect(props.onGoToHit).toHaveBeenCalledWith(0);
    expect(document.querySelector('.hit-row.active')).toBeTruthy();
  });

  it('says while it is searching, and when it found nothing', () => {
    const busy = renderLeft({ panel: 'search', search: { query: 'x', results: [], busy: true, activeIndex: -1 } });
    expect(screen.getByText(i18n.t('panel.searching'))).toBeTruthy();
    busy.unmount();
    renderLeft({ panel: 'search', search: { query: 'x', results: [], busy: false, activeIndex: -1 } });
    expect(screen.getByText(i18n.t('panel.noResults'))).toBeTruthy();
  });

  it('explains that folder browsing needs the desktop app', () => {
    renderLeft({ panel: 'library' });
    expect(screen.getByText(i18n.t('panel.folderWeb'))).toBeTruthy();
    expect(screen.getByTitle(i18n.t('panel.pickFolder'))).toBeDisabled();
  });

  it('lists the folder of books, opening a file when one is clicked', async () => {
    const loadFolder = vi.fn(async () => ([
      { name: 'sub', path: '/books/sub', kind: 'dir' },
      { name: 'a.epub', path: '/books/a.epub', kind: 'book', size: 100, format: 'epub' },
    ]));
    const { props } = renderLeft({ panel: 'library', desktop: true, folderRoot: '/books', loadFolder });
    await waitFor(() => expect(screen.getByText('a.epub')).toBeTruthy());
    expect(screen.getByText('sub')).toBeTruthy();
    fireEvent.click(screen.getByText('a.epub'));
    expect(props.onOpenFile).toHaveBeenCalledWith('/books/a.epub');
  });

  it('opens a folder deeper in the tree when it is expanded', async () => {
    const loadFolder = vi.fn(async (dir) => (dir === '/books'
      ? [{ name: 'sub', path: '/books/sub', kind: 'dir' }]
      : [{ name: 'deep.epub', path: '/books/sub/deep.epub', kind: 'book', format: 'epub' }]));
    renderLeft({ panel: 'library', desktop: true, folderRoot: '/books', loadFolder });
    await waitFor(() => expect(screen.getByText('sub')).toBeTruthy());
    fireEvent.click(screen.getByText('sub'));
    await waitFor(() => expect(screen.getByText('deep.epub')).toBeTruthy());
  });

  it('lists the recent files, and can forget one or all of them', () => {
    const recentFiles = [{ path: '/a/b.epub', name: 'b.epub', dir: '/a', format: 'epub' }];
    const { props } = renderLeft({ panel: 'library', recentFiles });
    fireEvent.click(screen.getByText('b.epub'));
    expect(props.onOpenRecent).toHaveBeenCalledWith(recentFiles[0]);
    fireEvent.click(screen.getByTitle(i18n.t('recent.remove')));
    expect(props.onRemoveRecent).toHaveBeenCalledWith('/a/b.epub');
    fireEvent.click(screen.getByTitle(i18n.t('recent.clear')));
    expect(props.onClearRecent).toHaveBeenCalled();
  });

  it('can be dragged wider', () => {
    const { props } = renderLeft();
    const grip = document.querySelector('.panel-resizer');
    fireEvent.pointerDown(grip, { button: 0, clientX: 260 });
    fireEvent.pointerMove(grip, { clientX: 320 });
    expect(props.onResize).toHaveBeenCalledWith(320);
  });
});

function renderRight(over = {}) {
  const props = {
    panel: 'properties',
    width: 260,
    onPanel: vi.fn(),
    onResize: vi.fn(),
    book,
    section: 1,
    settings: DEFAULT_SETTINGS,
    onSettings: vi.fn(),
    libraryPath: '',
    dirty: false,
    highlights: [],
    notes: [],
    onGoToMark: vi.fn(),
    onRemoveMark: vi.fn(),
    onCopyMark: vi.fn(),
    ...over,
  };
  return { ...render(<RightPanel {...props} />), props };
}

describe('RightPanel', () => {
  it('shows nothing when it is closed', () => {
    const { container } = renderRight({ panel: 'none' });
    expect(container.firstChild).toBeNull();
  });

  it('lists the book properties, one per row', () => {
    renderRight();
    expect(screen.getByText('샘플 책')).toBeTruthy();
    expect(screen.getByText('SHKWON')).toBeTruthy();
    expect(screen.getByText('EPUB')).toBeTruthy();
    expect(screen.getByText('65.2 KB')).toBeTruthy();
    expect(screen.getByText(i18n.t('props.notSaved'))).toBeTruthy();
    for (const row of document.querySelectorAll('.prop-row')) {
      expect(row.getAttribute('title')).toBeTruthy();
    }
  });

  it('shows the cover when the book has one', () => {
    renderRight();
    expect(document.querySelector('.cover-image').getAttribute('src')).toBe('blob:cover');
  });

  it('falls back to a placeholder when the book has no cover', () => {
    renderRight({ book: { ...book, cover: () => '' } });
    expect(document.querySelector('.cover-wrap.empty')).toBeTruthy();
  });

  it('names the reading file once it has been saved', () => {
    renderRight({ libraryPath: 'C:\\books\\sample.ebkr', dirty: true });
    expect(screen.getByText('sample.ebkr •')).toBeTruthy();
  });

  it('changes the reading layout from its controls', () => {
    const { props } = renderRight({ panel: 'reading' });
    fireEvent.change(document.querySelectorAll('input[type="range"]')[0], { target: { value: '150' } });
    expect(props.onSettings).toHaveBeenCalledWith(expect.objectContaining({ fontScale: 1.5 }));

    fireEvent.click(screen.getByTitle(i18n.t('reading.paged')));
    expect(props.onSettings).toHaveBeenCalledWith(expect.objectContaining({ pageMode: 'paged' }));

    fireEvent.click(screen.getByTitle(i18n.t('reading.bold')));
    expect(props.onSettings).toHaveBeenCalledWith(expect.objectContaining({ readerBold: true }));

    // The row and its checkbox share the tooltip, so the control is the input.
    fireEvent.click(screen.getAllByTitle(i18n.t('reading.justify')).find((el) => el.tagName === 'INPUT'));
    expect(props.onSettings).toHaveBeenCalledWith(expect.objectContaining({ justify: true }));
  });

  it('previews the reading typography', () => {
    renderRight({ panel: 'reading', settings: { ...DEFAULT_SETTINGS, fontScale: 2 } });
    const preview = document.querySelector('.reading-preview');
    expect(preview.textContent).toBe(i18n.t('reading.preview'));
    expect(preview.style.fontSize).toBe('34px');
  });

  it('lists the highlights and notes, and acts on them', () => {
    const highlights = [{ id: 'h1', section: 0, text: '칠한 글' }];
    const notes = [{ id: 'n1', section: 2, note: '메모 내용', text: '' }];
    const { props } = renderRight({ panel: 'notes', highlights, notes });
    fireEvent.click(screen.getByText('칠한 글'));
    expect(props.onGoToMark).toHaveBeenCalledWith(highlights[0]);
    fireEvent.click(screen.getByText('메모 내용'));
    expect(props.onGoToMark).toHaveBeenCalledWith(notes[0]);
    fireEvent.click(document.querySelectorAll('.icon-btn')[0]);
    expect(props.onCopyMark).toHaveBeenCalled();
    fireEvent.click(document.querySelectorAll('.icon-btn')[1]);
    expect(props.onRemoveMark).toHaveBeenCalledWith('h1', 'highlight');
  });

  it('says so when nothing has been marked', () => {
    renderRight({ panel: 'notes' });
    expect(screen.getByText(i18n.t('panel.noNotes'))).toBeTruthy();
  });

  it('can be dragged wider from its left edge', () => {
    const { props } = renderRight();
    const grip = document.querySelector('.panel-resizer.right');
    fireEvent.pointerDown(grip, { button: 0, clientX: 800 });
    fireEvent.pointerMove(grip, { clientX: 760 });
    expect(props.onResize).toHaveBeenCalledWith(300);
  });
});
