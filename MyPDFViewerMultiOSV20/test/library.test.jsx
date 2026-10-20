// The library: favorites shown large — on shelves, as covers, as a list or a
// table — with one size slider for every view.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '../src/i18n.js';
import { setLanguage } from '../src/i18n.js';
import Library from '../src/components/Library.jsx';
import Toolbar from '../src/components/Toolbar.jsx';
import {
  booksPerShelf, shelvesOf, clampBookSize, normalizeLibraryView, LIBRARY_VIEWS, BOOK_MIN, BOOK_MAX,
} from '../src/lib/gallery.js';
import { normalize, DEFAULT_SETTINGS } from '../src/lib/settings.js';

const entries = [
  { path: 'C:\\d\\a.pdf', name: 'a.pdf', dir: 'C:\\d', size: 2048, addedAt: 1, openedAt: 30, favorite: true },
  { path: 'C:\\d\\b.pdf', name: 'b.pdf', dir: 'C:\\d', size: 10, addedAt: 2, openedAt: 20, favorite: true },
  { path: 'C:\\d\\c.pdf', name: 'c.pdf', dir: 'C:\\d', size: 10, addedAt: 3, openedAt: 10, favorite: true },
  { path: 'C:\\e\\not-a-favorite.pdf', name: 'not-a-favorite.pdf', dir: 'C:\\e', size: 99, addedAt: 4 },
];

function renderLibrary(props = {}) {
  const h = {
    onView: vi.fn(), onBookSize: vi.fn(), onOpen: vi.fn(), onUnfavorite: vi.fn(), onAdd: vi.fn(),
    onNeedThumb: vi.fn(), onClose: vi.fn(), onBookMenu: vi.fn(), onShowGallery: vi.fn(),
  };
  const utils = render(<Library entries={entries} {...h} {...props} />);
  return { ...utils, ...h };
}

describe('shelving', () => {
  it('puts as many books on a shelf as fit, at least one', () => {
    expect(booksPerShelf(1000, 220)).toBe(3);   // 936 px of shelf: 3×220 + 2×28
    expect(booksPerShelf(1200, 220)).toBe(4);
    expect(booksPerShelf(100, 220)).toBe(1);
    expect(shelvesOf([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(shelvesOf([], 3)).toEqual([]);
  });

  it('keeps the book size and the view in range', () => {
    expect(clampBookSize(10)).toBe(BOOK_MIN);
    expect(clampBookSize(9999)).toBe(BOOK_MAX);
    expect(clampBookSize('x')).toBe(220);
    expect(LIBRARY_VIEWS).toEqual(['shelf', 'covers', 'list', 'details']);
    expect(normalizeLibraryView('wall')).toBe('shelf');
    expect(DEFAULT_SETTINGS.libraryView).toBe('shelf');
    expect(normalize({ libraryBookSize: 5000, libraryView: 'list' })).toMatchObject({ libraryBookSize: BOOK_MAX, libraryView: 'list' });
  });
});

describe('Library', () => {
  beforeEach(async () => { await setLanguage('ko'); });

  it('shows only the favorites, as books on shelves', () => {
    const { container } = renderLibrary();
    expect(screen.getByText('3권')).toBeTruthy();
    expect(container.querySelectorAll('.shelf .book')).toHaveLength(3);
    expect(container.querySelectorAll('.shelf-board').length).toBeGreaterThan(0);
    expect([...container.querySelectorAll('.book-title')].map((e) => e.textContent)).toEqual(['a', 'b', 'c']);
    expect(container.textContent).not.toMatch(/not-a-favorite/);
  });

  it('opens a book, unstars it, and offers its menu', () => {
    const { container, onOpen, onUnfavorite, onBookMenu } = renderLibrary();
    const book = container.querySelectorAll('.book')[1];
    fireEvent.click(book);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ name: 'b.pdf' }));
    fireEvent.click(book.querySelector('.book-remove'));
    expect(onUnfavorite).toHaveBeenCalledWith(expect.objectContaining({ name: 'b.pdf' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.contextMenu(book);
    expect(onBookMenu).toHaveBeenCalled();
  });

  it('scales every view with one size slider', () => {
    const { container, onBookSize, rerender } = renderLibrary({ bookSize: 220 });
    expect(container.querySelector('[data-library]').style.getPropertyValue('--book')).toBe('220px');
    fireEvent.change(screen.getByLabelText('크기'), { target: { value: '300' } });
    expect(onBookSize).toHaveBeenCalledWith(300);
    rerender(<Library entries={entries} bookSize={300} view="list" />);
    expect(container.querySelector('[data-library]').style.getPropertyValue('--book')).toBe('300px');
  });

  it('switches between shelves, covers, list and details', () => {
    const { onView, rerender, container } = renderLibrary();
    for (const [label, v] of [['책장', 'shelf'], ['표지', 'covers'], ['목록', 'list'], ['자세히', 'details']]) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }));
      expect(onView).toHaveBeenLastCalledWith(v);
    }
    rerender(<Library entries={entries} view="covers" />);
    expect(container.querySelectorAll('.cover-card')).toHaveLength(3);
    rerender(<Library entries={entries} view="list" />);
    expect([...container.querySelectorAll('.lib-row-title')].map((e) => e.textContent)).toEqual(['a', 'b', 'c']);
    expect(container.querySelector('.lib-row-meta').textContent).toMatch(/2\.0 KB/);
    rerender(<Library entries={entries} view="details" />);
    expect(container.querySelectorAll('.lib-table tbody tr')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: /^이름/ }));
    fireEvent.click(screen.getByRole('button', { name: /^이름/ }));
    expect(container.querySelector('.lib-table tbody tr .c-name').textContent).toBe('c.pdf');
  });

  it('finds books, adds files, goes to the gallery and closes with Esc', () => {
    const { container, onAdd, onShowGallery, onClose } = renderLibrary();
    fireEvent.change(screen.getByLabelText('이름이나 폴더로 찾기'), { target: { value: 'b.p' } });
    expect(container.querySelectorAll('.book')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /파일 추가/ }));
    expect(onAdd).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('갤러리 열기'));
    expect(onShowGallery).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('takes one book or every book off the shelves at once, in every view', () => {
    const onRemoveAll = vi.fn();
    const { container, onUnfavorite, rerender } = renderLibrary({ onRemoveAll });
    expect(container.querySelector('.book').querySelector('[aria-label^="서재에서 빼기"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /전체 삭제/ }));
    expect(onRemoveAll).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ name: 'a.pdf' })]));
    expect(onRemoveAll.mock.calls[0][0]).toHaveLength(3);
    expect(document.querySelector('[role=dialog]')).toBeNull();
    for (const view of ['covers', 'list', 'details']) {
      rerender(<Library entries={entries} view={view} onUnfavorite={onUnfavorite} onRemoveAll={onRemoveAll} />);
      const btns = container.querySelectorAll('button[aria-label^="서재에서 빼기"]');
      expect(btns).toHaveLength(3);
      fireEvent.click(btns[2]);
      expect(onUnfavorite).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'c.pdf' }));
    }
  });

  it('explains an empty library', () => {
    renderLibrary({ entries: [entries[3]] });
    expect(screen.getByText(/서재가 비어 있습니다/)).toBeTruthy();
  });
});

describe('Toolbar library button', () => {
  it('opens the library', async () => {
    await setLanguage('ko');
    const onLibrary = vi.fn();
    const noop = () => {};
    render(
      <Toolbar
        settings={{ ...DEFAULT_SETTINGS }}
        doc={null}
        pageNumber={1}
        numPages={0}
        scale={1}
        hasSelection={false}
        dirty={false}
        history={{ canUndo: false, canRedo: false, undo: noop, redo: noop }}
        tool="text"
        onTool={noop}
        panel="none"
        onOpen={noop}
        onOpenUrl={noop}
        onOpenRecent={noop}
        onRemoveRecent={noop}
        onClearRecent={noop}
        onSave={noop}
        onSaveAs={noop}
        onCopyText={noop}
        onSelectPage={noop}
        onExtractImages={noop}
        onExportText={noop}
        onHighlight={noop}
        onComment={noop}
        onBookmark={noop}
        onGoToPage={noop}
        onZoom={noop}
        onZoomMode={noop}
        onRotate={noop}
        onLayout={noop}
        onTogglePanel={noop}
        onTheme={noop}
        onLang={noop}
        onSettings={noop}
        onAbout={noop}
        onPrint={noop}
        onLibrary={onLibrary}
        libraryOpen
      />,
    );
    const btn = screen.getByRole('button', { name: '서재' });
    expect(btn.classList.contains('active')).toBe(true);
    fireEvent.click(btn);
    expect(onLibrary).toHaveBeenCalled();
  });
});
