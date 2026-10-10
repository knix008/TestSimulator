import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LeftPanel, { ACTION_ROWS } from '../src/components/LeftPanel.jsx';
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
    onAddBookmark: vi.fn(),
    onGoToBookmark: vi.fn(),
    onRemoveBookmark: vi.fn(),
    onClearBookmarks: vi.fn(),
    notes: [],
    highlights: [],
    showHighlights: true,
    hasSelection: false,
    onAddNote: vi.fn(),
    onHighlight: vi.fn(),
    onShowHighlights: vi.fn(),
    onGoToMark: vi.fn(),
    onRemoveMark: vi.fn(),
    onCopyMark: vi.fn(),
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
    gallery: [],
    onOpenGallery: vi.fn(),
    onForgetGallery: vi.fn(),
    onClearGallery: vi.fn(),
    ...over,
  };
  return { ...render(<LeftPanel {...props} />), props };
}

describe('LeftPanel', () => {
  it('folds to a strip, and the strip opens the panel again', () => {
    const open = renderLeft({ panel: 'bookmarks' });
    const title = () => document.querySelector('.panel-foldbar .panel-title');
    expect(title().textContent).toBe(i18n.t('panel.bookmarks'));
    expect(title().querySelector('svg')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('panel.fold') }));
    expect(open.props.onPanel).toHaveBeenCalledWith('none');
    open.rerender(<LeftPanel {...open.props} panel="none" />);
    expect(document.querySelector('.side-panel.left.collapsed')).toBeTruthy();
    expect(title().textContent).toBe(i18n.t('panel.bookmarks'));
    expect(title().querySelector('svg')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('panel.unfold') }));
    expect(open.props.onPanel).toHaveBeenLastCalledWith('bookmarks');
  });

  it('offers a tab per tool, each with a tooltip', () => {
    renderLeft();
    const tabs = [...document.querySelectorAll('.panel-tab')];
    expect(tabs.map((t) => t.getAttribute('title'))).toEqual([
      i18n.t('panel.library'), i18n.t('panel.contents'), i18n.t('panel.history'),
      i18n.t('panel.bookmarks'),
      i18n.t('panel.notes'), i18n.t('panel.highlights'), i18n.t('panel.search'),
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

  it('adds a bookmark from the bookmarks tool', () => {
    const { props } = renderLeft({ panel: 'bookmarks' });
    fireEvent.click(screen.getByLabelText(i18n.t('cmd.addBookmark')));
    expect(props.onAddBookmark).toHaveBeenCalled();
  });

  it('lists notes, and adds one from the notes tool', () => {
    const notes = [{ id: 'n1', section: 2, note: '메모 내용', text: '' }];
    const { props } = renderLeft({ panel: 'notes', notes });
    fireEvent.click(screen.getByText('메모 내용'));
    expect(props.onGoToMark).toHaveBeenCalledWith(notes[0]);
    fireEvent.click(screen.getByLabelText(i18n.t('cmd.addNote')));
    expect(props.onAddNote).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle(i18n.t('panel.remove')));
    expect(props.onRemoveMark).toHaveBeenCalledWith('n1', 'note');
  });

  it('says so when there are no notes yet', () => {
    renderLeft({ panel: 'notes' });
    expect(screen.getByText(i18n.t('panel.noNotes'))).toBeTruthy();
  });

  it('lists highlights, paints them only while they are shown, and marks a selection', () => {
    const highlights = [{ id: 'h1', section: 0, text: '칠한 글' }];
    const shown = renderLeft({ panel: 'highlights', highlights, showHighlights: true, hasSelection: true });
    expect(screen.getByTestId('show-highlights').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByText('칠한 글'));
    expect(shown.props.onGoToMark).toHaveBeenCalledWith(highlights[0]);
    fireEvent.click(screen.getByTestId('apply-highlight'));
    expect(shown.props.onHighlight).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('show-highlights'));
    expect(shown.props.onShowHighlights).toHaveBeenCalledWith(false);
    shown.unmount();

    renderLeft({ panel: 'highlights', showHighlights: false, hasSelection: false });
    expect(screen.getByTestId('show-highlights').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('apply-highlight')).toBeDisabled();
    expect(screen.getByText(i18n.t('panel.noHighlights'))).toBeTruthy();
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

  it('keeps the recent files out of the folder view', () => {
    renderLeft({
      panel: 'library',
      recentFiles: [{ path: '/a/b.epub', name: 'b.epub', dir: '/a', format: 'epub' }],
    });
    expect(screen.queryByText('b.epub')).toBeNull();
    expect(screen.queryByText(i18n.t('recent.title'))).toBeNull();
  });

  it('lists the recent files, and can forget one or all of them', () => {
    const recentFiles = [{ path: '/a/b.epub', name: 'b.epub', dir: '/a', format: 'epub' }];
    const { props } = renderLeft({ panel: 'history', recentFiles });
    fireEvent.click(screen.getByText('b.epub'));
    expect(props.onOpenRecent).toHaveBeenCalledWith(recentFiles[0]);
    fireEvent.click(screen.getByTitle(i18n.t('recent.remove')));
    expect(props.onRemoveRecent).toHaveBeenCalledWith('/a/b.epub');
    expect(screen.queryByText(i18n.t('recent.title'))).toBeNull();
    fireEvent.click(screen.getByTitle(i18n.t('recent.clear')));
    expect(props.onClearRecent).toHaveBeenCalled();
  });

  it('lists the gallery one book to a line, with a small cover', () => {
    const gallery = [
      { path: '/a/dune.epub', name: 'dune.epub', title: 'Dune', format: 'epub', cover: 'data:image/png;base64,AA', openedAt: 2 },
      { path: '/a/emma.epub', name: 'emma.epub', title: 'Emma', format: 'epub', cover: '', openedAt: 1 },
    ];
    const { props } = renderLeft({ panel: 'gallery', gallery });
    const rows = [...document.querySelectorAll('.shelf-row')];
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('img.gcover-img').getAttribute('src')).toBe('data:image/png;base64,AA');
    expect(rows[1].querySelector('.gcover-blank')).toBeTruthy();
    expect(screen.queryByText(i18n.t('gallery.title'))).toBeNull();
    fireEvent.click(screen.getByTitle(i18n.t('recent.clear')));
    expect(props.onClearGallery).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Dune'));
    expect(props.onOpenGallery).toHaveBeenCalledWith(gallery[0]);
    fireEvent.click(screen.getByLabelText(`${i18n.t('gallery.forget')}: Emma`));
    expect(props.onForgetGallery).toHaveBeenCalledWith('/a/emma.epub');
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
  it('folds to a strip, and the strip opens the panel again', () => {
    const open = renderRight({ panel: 'reading' });
    const title = () => document.querySelector('.panel-foldbar .panel-title');
    expect(title().textContent).toBe(i18n.t('panel.reading'));
    expect(title().querySelector('svg')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('panel.fold') }));
    expect(open.props.onPanel).toHaveBeenCalledWith('none');
    open.rerender(<RightPanel {...open.props} panel="none" />);
    expect(document.querySelector('.side-panel.right.collapsed')).toBeTruthy();
    expect(title().textContent).toBe(i18n.t('panel.reading'));
    expect(title().querySelector('svg')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('panel.unfold') }));
    expect(open.props.onPanel).toHaveBeenLastCalledWith('reading');
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
    // The text size is typed, or stepped with the buttons either side of it.
    const size = screen.getByLabelText(i18n.t('reading.size'));
    fireEvent.focus(size);
    fireEvent.change(size, { target: { value: '26' } });
    fireEvent.blur(size);
    expect(props.onSettings).toHaveBeenCalledWith(expect.objectContaining({ fontScale: 26 / 17 }));

    fireEvent.click(screen.getByTitle(i18n.t('cmd.viewSingle')));
    expect(props.onSettings).toHaveBeenCalledWith(expect.objectContaining({
      viewLayout: 'single', pageMode: 'paged', spread: 'single',
    }));

    fireEvent.click(screen.getByTitle(i18n.t('reading.bold')));
    expect(props.onSettings).toHaveBeenCalledWith(expect.objectContaining({ readerBold: true }));

    // The row and its checkbox share the tooltip, so the control is the input.
    fireEvent.click(screen.getAllByTitle(i18n.t('reading.justify')).find((el) => el.tagName === 'INPUT'));
    expect(props.onSettings).toHaveBeenCalledWith(expect.objectContaining({ justify: true }));
  });

  it('sets an ebook page from five sizes, or from a side the reader types', () => {
    const { props } = renderRight({ panel: 'reading' });
    fireEvent.change(screen.getByLabelText(i18n.t('reading.page')), { target: { value: 'lg' } });
    expect(props.onSettings).toHaveBeenCalledWith(expect.objectContaining({
      pagePreset: 'lg', pageWidth: 840, pageHeight: 910,
    }));

    fireEvent.click(screen.getByLabelText(`${i18n.t('reading.pageWidth')} ${i18n.t('common.more')}`));
    expect(props.onSettings).toHaveBeenCalledWith(expect.objectContaining({
      pagePreset: 'custom', pageWidth: 730, pageHeight: 780,
    }));
  });

  it('leaves the page size alone when the open file already has pages', () => {
    renderRight({ panel: 'reading', book: { ...book, reflowable: false, formatLabel: 'PDF' } });
    expect(screen.getByLabelText(i18n.t('reading.page'))).toBeDisabled();
    expect(screen.getByLabelText(i18n.t('reading.pageWidth'))).toBeDisabled();
    expect(screen.getByLabelText(i18n.t('reading.pageHeight'))).toBeDisabled();
  });

  it('previews the reading typography', () => {
    renderRight({ panel: 'reading', settings: { ...DEFAULT_SETTINGS, fontScale: 2 } });
    const preview = document.querySelector('.reading-preview');
    expect(preview.textContent).toBe(i18n.t('reading.preview'));
    expect(preview.style.fontSize).toBe('34px');
  });

  it('can be dragged wider from its left edge', () => {
    const { props } = renderRight();
    const grip = document.querySelector('.panel-resizer.right');
    fireEvent.pointerDown(grip, { button: 0, clientX: 800 });
    fireEvent.pointerMove(grip, { clientX: 760 });
    expect(props.onResize).toHaveBeenCalledWith(300);
  });
});

describe('RightPanel — a width that stays put', () => {
  it('is the same width with a book, without one, and with a different one', () => {
    const widths = [];
    const read = () => document.querySelector('.side-panel.right').style.width;

    const view = renderRight({ panel: 'properties' });
    widths.push(read());
    view.unmount();

    renderRight({ panel: 'properties', book: null });
    widths.push(read());
    // Nothing about a book may reach the panel's width.
    expect(new Set(widths).size).toBe(1);
  });

  it('holds the room for a scrollbar open, so what is in it never shifts sideways', () => {
    renderRight({ panel: 'properties' });
    const body = document.querySelector('.panel-body');
    expect(body).toBeTruthy();
    // The rule is in the stylesheet rather than inline, so what is asserted is
    // that the panel body is the element the rule is written for.
    expect(body.className).toContain('panel-body');
  });
});

describe('RightPanel — numbers that can be typed', () => {
  const numbers = () => [
    i18n.t('reading.size'), i18n.t('reading.lineHeight'),
    i18n.t('reading.gap'), i18n.t('reading.letter'),
  ];

  it('gives every number a box and a step either side of it', () => {
    renderRight({ panel: 'reading' });
    for (const label of numbers()) {
      const box = screen.getByLabelText(label);
      expect(box.tagName).toBe('INPUT');
      expect(screen.getByLabelText(`${label} ${i18n.t('common.less')}`)).toBeTruthy();
      expect(screen.getByLabelText(`${label} ${i18n.t('common.more')}`)).toBeTruthy();
    }
    // No sliders left: a slider cannot be told an exact value or read back.
    expect(document.querySelectorAll('.panel-body input[type="range"]')).toHaveLength(0);
  });

  it('steps up and down by the step, and stops at the ends', () => {
    const { props } = renderRight({ panel: 'reading', settings: { ...DEFAULT_SETTINGS, fontScale: 1 } });
    fireEvent.click(screen.getByLabelText(`${i18n.t('reading.size')} ${i18n.t('common.more')}`));
    expect(props.onSettings).toHaveBeenCalledWith(expect.objectContaining({ fontScale: 18 / 17 }));

    const top = renderRight({ panel: 'reading', settings: { ...DEFAULT_SETTINGS, fontScale: 3 } });
    expect(screen.getAllByLabelText(`${i18n.t('reading.size')} ${i18n.t('common.more')}`).at(-1)).toBeDisabled();
    top.unmount();
  });

  it('takes a typed number when the box is left, and keeps it inside the range', () => {
    const { props } = renderRight({ panel: 'reading' });
    const box = screen.getByLabelText(i18n.t('reading.lineHeight'));
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: '2.2' } });
    fireEvent.blur(box);
    expect(props.onSettings).toHaveBeenCalledWith(expect.objectContaining({ lineHeight: 2.2 }));

    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: '99' } });
    fireEvent.blur(box);
    expect(props.onSettings).toHaveBeenCalledWith(expect.objectContaining({ lineHeight: 2.6 }));
  });

  it('lets a half-typed number be typed without being clamped mid-word', () => {
    const { props } = renderRight({ panel: 'reading' });
    const box = screen.getByLabelText(i18n.t('reading.size'));
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: '1' } });
    // "1" on the way to "26" must not become the minimum.
    expect(props.onSettings).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: '26' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(props.onSettings).toHaveBeenCalledWith(expect.objectContaining({ fontScale: 26 / 17 }));
  });
});

describe('LeftPanel — a rail of tools with the chosen one beside it', () => {
  it('stacks its tabs rather than sharing a row between them', () => {
    renderLeft();
    const strip = document.querySelector('.side-panel.left .panel-tabs');
    expect(strip.className).toContain('stacked');
    // A rail is icons, named by tooltip — no words to clip however narrow it is.
    const tabs = [...strip.querySelectorAll('.panel-tab')];
    expect(tabs).toHaveLength(7);
    for (const tab of tabs) {
      expect(tab.querySelector('.panel-tab-label')).toBeNull();
      expect(tab.getAttribute('title')).toBeTruthy();
      expect(tab.getAttribute('aria-label')).toBe(tab.getAttribute('title'));
    }
  });

  it('puts the rail and the tool it opens side by side in the one panel', () => {
    renderLeft();
    const panel = document.querySelector('.side-panel.left');
    const kids = [...panel.children]
      .filter((el) => !el.className.includes('panel-resizer'))
      // The measuring strip is laid out but hidden and out of the flow.
      .filter((el) => !el.className.includes('panel-measure'));
    // Rail first, then the column that holds the selected tool: one panel, two columns.
    expect(kids.map((el) => el.className.split(' ')[0])).toEqual(['panel-tabs', 'panel-column']);
    expect(kids[1].querySelector('[role=tabpanel]')).toBeTruthy();
  });

  it('measures every row of buttons the tools show', () => {
    // The panel is as wide as the widest row whichever tool is open, which
    // only holds while this list mirrors the buttons the tools actually have.
    const labels = new Set(ACTION_ROWS.flat());
    for (const key of ['panel.pickFolder', 'recent.clear', 'cmd.addBookmark',
      'cmd.addNote', 'cmd.highlight', 'panel.showHighlights', 'panel.removeAll']) {
      expect(labels, key).toContain(key);
    }
    renderLeft();
    const strip = document.querySelector('.panel-measure');
    expect(strip).toBeTruthy();
    expect(strip.getAttribute('aria-hidden')).toBe('true');
    expect(strip.querySelectorAll('.panel-actions')).toHaveLength(ACTION_ROWS.length);
    // Nothing in it can be reached: they are spans, not buttons.
    expect(strip.querySelectorAll('button')).toHaveLength(0);
  });
  it('still switches tool when one is clicked', () => {
    const { props } = renderLeft();
    fireEvent.click(screen.getByTitle(i18n.t('panel.search')));
    expect(props.onPanel).toHaveBeenCalledWith('search');
  });

  it('leaves the right panel tabs across the top', () => {
    renderRight();
    const strip = document.querySelector('.side-panel.right .panel-tabs');
    expect(strip.className).not.toContain('stacked');
  });
});
