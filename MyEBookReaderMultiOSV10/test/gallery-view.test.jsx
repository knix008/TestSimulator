import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import Gallery from '../src/components/Gallery.jsx';
import { panelMinWidth, clampToPanelMin } from '../src/components/panelWidth.js';
import { PANEL_WIDTH_MAX, PANEL_WIDTH_MIN } from '../src/lib/settings.js';
import { translate } from '../src/i18n.js';

const t = (key, args) => translate('ko', key, args);

const SHELF = [
  {
    path: '/books/dune.epub', name: 'dune.epub', dir: '/books', title: 'Dune',
    author: 'Frank Herbert', format: 'epub', formatLabel: 'EPUB', size: 4096,
    sections: 11, section: 5, openedAt: 300, cover: 'data:image/png;base64,AA',
  },
  {
    path: '/books/atlas.pdf', name: 'atlas.pdf', dir: '/books', title: 'Atlas',
    author: '', format: 'pdf', formatLabel: 'PDF', size: 2048,
    sections: 11, section: 10, openedAt: 200, cover: '',
  },
  {
    path: '/pics/scan.tif', name: 'scan.tif', dir: '/pics', title: 'scan',
    author: '', format: 'image', formatLabel: 'Image', size: 999,
    sections: 1, section: 0, openedAt: 100, cover: '',
  },
];

function show(props = {}) {
  const handlers = {
    onOpen: vi.fn(), onForget: vi.fn(), onClear: vi.fn(),
    onView: vi.fn(), onSort: vi.fn(), onClose: vi.fn(),
  };
  const view = render(<Gallery entries={SHELF} {...handlers} {...props} />);
  return { ...view, ...handlers };
}

describe('the gallery', () => {
  it('shows every book it was given, as large icons', () => {
    show();
    expect(document.querySelectorAll('.gcard')).toHaveLength(3);
    expect(screen.getByText('Dune')).toBeTruthy();
    expect(screen.getByText('Frank Herbert')).toBeTruthy();
    // A book with no author says so rather than leaving a gap.
    expect(screen.getAllByText(t('gallery.unknownAuthor')).length).toBe(2);
  });

  it('says how many books are on the shelf', () => {
    show();
    expect(screen.getByText(t('gallery.count', { n: 3 }))).toBeTruthy();
  });

  it('draws a cover when there is one, and initials when there is not', () => {
    show();
    expect(document.querySelectorAll('.gcover-img')).toHaveLength(1);
    expect(document.querySelectorAll('.gcover-blank')).toHaveLength(2);
    expect(screen.getByText('AT')).toBeTruthy();
  });

  it('opens a book when its card is clicked', () => {
    const { onOpen } = show();
    fireEvent.click(screen.getByText('Dune').closest('.gcard'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ path: '/books/dune.epub' }));
  });

  it('forgets one book without opening it', () => {
    const { onForget, onOpen } = show();
    fireEvent.click(screen.getByLabelText(`${t('gallery.forget')}: Dune`));
    expect(onForget).toHaveBeenCalledWith('/books/dune.epub');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('switches to the detailed list, which shows the same books in a table', () => {
    const { onView } = show();
    fireEvent.click(screen.getByTitle(t('gallery.details')));
    expect(onView).toHaveBeenCalledWith('details');

    cleanup();
    show({ view: 'details' });
    const headers = [...document.querySelectorAll('.gallery-table thead th')]
      .map((th) => th.textContent).filter(Boolean);
    expect(headers).toEqual([
      t('gallery.columns.title'), t('gallery.columns.author'), t('gallery.columns.format'),
      t('gallery.columns.size'), t('gallery.columns.progress'), t('gallery.columns.lastRead'),
      t('gallery.columns.location'),
    ]);
    expect(document.querySelectorAll('.gallery-table tbody tr')).toHaveLength(3);
  });

  it('reports how far each book was read', () => {
    show({ view: 'details' });
    const rows = [...document.querySelectorAll('.gallery-table tbody tr')];
    const progress = rows.map((row) => row.querySelector('.gbar-text').textContent);
    expect(progress).toEqual([
      t('gallery.progress', { percent: 50 }),
      t('gallery.finished'),
      t('gallery.unread'),
    ]);
  });

  it('searches the shelf as the reader types', () => {
    show();
    fireEvent.change(screen.getByLabelText(t('gallery.search')), { target: { value: 'herbert' } });
    expect(document.querySelectorAll('.gcard')).toHaveLength(1);
    expect(screen.getByText('Dune')).toBeTruthy();
  });

  it('says when nothing matches, without emptying the shelf', () => {
    show();
    fireEvent.change(screen.getByLabelText(t('gallery.search')), { target: { value: 'zzz' } });
    expect(document.querySelectorAll('.gcard')).toHaveLength(0);
    expect(screen.getByText(t('gallery.noMatch', { query: 'zzz' }))).toBeTruthy();
    expect(screen.getByText(t('gallery.count', { n: 3 }))).toBeTruthy();
  });

  it('changes the order it shows them in', () => {
    const { onSort } = show();
    fireEvent.change(screen.getByLabelText(t('gallery.sort')), { target: { value: 'title' } });
    expect(onSort).toHaveBeenCalledWith('title');

    cleanup();
    show({ sort: 'title' });
    const names = [...document.querySelectorAll('.gname')].map((n) => n.textContent);
    expect(names).toEqual(['Atlas', 'Dune', 'scan']);
  });

  it('says it is empty instead of showing an empty grid', () => {
    show({ entries: [] });
    expect(screen.getByText(t('gallery.empty'))).toBeTruthy();
    expect(document.querySelector('.gallery-grid')).toBeNull();
    expect(screen.getByTitle(t('gallery.clear'))).toBeDisabled();
  });

  it('asks to be emptied, and to be closed', () => {
    const { onClear, onClose } = show();
    fireEvent.click(screen.getByTitle(t('gallery.clear')));
    expect(onClear).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle(t('common.close')));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('how narrow a panel may be', () => {
  it('never goes below the floor, whatever it measures', () => {
    expect(panelMinWidth(0)).toBe(PANEL_WIDTH_MIN);
    expect(panelMinWidth(-40)).toBe(PANEL_WIDTH_MIN);
    expect(panelMinWidth(NaN)).toBe(PANEL_WIDTH_MIN);
    expect(panelMinWidth(120)).toBe(PANEL_WIDTH_MIN);
  });

  it('takes the measurement when the controls need more than the floor', () => {
    expect(panelMinWidth(PANEL_WIDTH_MIN + 96)).toBe(PANEL_WIDTH_MIN + 96);
    expect(panelMinWidth(276.2)).toBe(277);
  });

  it('never asks for more than a panel is allowed to be', () => {
    expect(panelMinWidth(9999)).toBe(PANEL_WIDTH_MAX);
  });

  it('holds a dragged width between that minimum and the maximum', () => {
    expect(clampToPanelMin(10, 276)).toBe(276);
    expect(clampToPanelMin(300, 276)).toBe(300);
    expect(clampToPanelMin(9999, 276)).toBe(PANEL_WIDTH_MAX);
    expect(clampToPanelMin(NaN, 276)).toBe(276);
  });
});
