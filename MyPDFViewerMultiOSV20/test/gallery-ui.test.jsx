// Gallery view, the History / Highlights / Favorites panels, the left-panel
// right-click menus and the direct-print dialog, as the user meets them.
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import '../src/i18n.js';
import { setLanguage } from '../src/i18n.js';
import Gallery from '../src/components/Gallery.jsx';
import Sidebar from '../src/components/Sidebar.jsx';
import PrintDialog from '../src/components/PrintDialog.jsx';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';
import { setThumb, __resetThumbs } from '../src/lib/thumb-store.js';

beforeAll(() => {
  if (typeof HTMLCanvasElement !== 'undefined') {
    HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, fillStyle: '' });
  }
});

const entries = [
  { path: 'C:\\d\\a.pdf', name: 'a.pdf', dir: 'C:\\d', size: 2048, addedAt: 1, openedAt: 30, favorite: true },
  { path: 'C:\\d\\b.pdf', name: 'b.pdf', dir: 'C:\\d', size: 10, addedAt: 2, openedAt: 20 },
  { path: 'C:\\e\\c.pdf', name: 'c.pdf', dir: 'C:\\e', size: 99, addedAt: 3 },
];

function renderGallery(props = {}) {
  const handlers = {
    onView: vi.fn(), onTileSize: vi.fn(), onOpen: vi.fn(), onRemove: vi.fn(), onFavorite: vi.fn(),
    onAdd: vi.fn(), onNeedThumb: vi.fn(), onClose: vi.fn(), onCardMenu: vi.fn(),
  };
  const utils = render(<Gallery entries={entries} currentPath={'C:\\d\\b.pdf'} {...handlers} {...props} />);
  return { ...utils, ...handlers };
}

describe('Gallery', () => {
  beforeEach(async () => { __resetThumbs(); await setLanguage('ko'); });

  it('shows every file as a picture with its name, the open one marked', async () => {
    await setThumb('C:\\d\\a.pdf', 'data:image/jpeg;base64,AAAA');
    const { container, onNeedThumb } = renderGallery();
    const cards = container.querySelectorAll('.gal-card');
    expect([...cards].map((c) => c.querySelector('.gal-name').textContent)).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
    await waitFor(() => expect(cards[0].querySelector('img')?.getAttribute('src')).toBe('data:image/jpeg;base64,AAAA'));
    // No picture yet: the app is asked to draw one.
    await waitFor(() => expect(onNeedThumb).toHaveBeenCalledWith(expect.objectContaining({ name: 'b.pdf' })));
    expect(cards[1].classList.contains('current')).toBe(true);
  });

  it('opens, stars, removes and offers a menu on a card', () => {
    const { container, onOpen, onFavorite, onRemove, onCardMenu } = renderGallery();
    const card = container.querySelectorAll('.gal-card')[1];
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ name: 'b.pdf' }));
    fireEvent.click(within(card).getByLabelText('서재에 추가'));
    expect(onFavorite).toHaveBeenCalledWith(expect.objectContaining({ name: 'b.pdf' }), true);
    fireEvent.click(within(card).getByLabelText(/갤러리에서 제거/));
    expect(onRemove).toHaveBeenCalledWith('C:\\d\\b.pdf');
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.contextMenu(card);
    expect(onCardMenu).toHaveBeenCalledTimes(1);
  });

  it('resizes the tiles with the slider', () => {
    const { container, onTileSize } = renderGallery({ tileSize: 168 });
    expect(container.querySelector('.gal-tiles').style.getPropertyValue('--tile')).toBe('168px');
    fireEvent.change(screen.getByLabelText('크기'), { target: { value: '280' } });
    expect(onTileSize).toHaveBeenCalledWith(280);
  });

  it('switches to the details table with sortable columns', () => {
    const { onView, rerender } = renderGallery();
    fireEvent.click(screen.getByRole('button', { name: /자세히/ }));
    expect(onView).toHaveBeenCalledWith('details');
    rerender(<Gallery entries={entries} view="details" onView={onView} />);
    const rows = () => [...document.querySelectorAll('.gal-table tbody tr')].map((r) => r.querySelector('.c-name').textContent);
    expect(rows()).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
    expect(document.querySelector('.gal-table tbody tr .c-size').textContent).toBe('2.0 KB');
    fireEvent.click(screen.getByRole('button', { name: /^이름/ }));
    expect(rows()).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
    fireEvent.click(screen.getByRole('button', { name: /^이름/ }));
    expect(rows()).toEqual(['c.pdf', 'b.pdf', 'a.pdf']);
    fireEvent.click(screen.getByRole('button', { name: /^크기/ }));
    expect(rows()).toEqual(['a.pdf', 'c.pdf', 'b.pdf']);
  });

  it('filters favorites and searches by name or folder', () => {
    const { container } = renderGallery();
    fireEvent.click(screen.getByRole('button', { name: /서재 1/ }));
    expect(container.querySelectorAll('.gal-card')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '전체' }));
    fireEvent.change(screen.getByLabelText('이름이나 폴더로 찾기'), { target: { value: 'C:\\e' } });
    expect([...container.querySelectorAll('.gal-name')].map((n) => n.textContent)).toEqual(['c.pdf']);
  });

  it('adds files and closes with Esc', () => {
    const { onAdd, onClose } = renderGallery();
    fireEvent.click(screen.getByRole('button', { name: /파일 추가/ }));
    expect(onAdd).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('explains the empty gallery', () => {
    renderGallery({ entries: [] });
    expect(screen.getByText(/자동으로 등록됩니다/)).toBeTruthy();
  });
});

function renderSide(props = {}) {
  const h = {
    onPanel: vi.fn(), onOpenGalleryEntry: vi.fn(), onToggleFavorite: vi.fn(), onShowGallery: vi.fn(),
    onForgetRecent: vi.fn(), onForgetAllRecent: vi.fn(), onClearEditHistory: vi.fn(),
    onGoToHighlight: vi.fn(), onDeleteHighlights: vi.fn(), onContextMenuItems: vi.fn(),
    onRevealPath: vi.fn(), onCopyText: vi.fn(),
  };
  const utils = render(
    <Sidebar
      panel="history"
      width={264}
      onResize={vi.fn()}
      doc={null}
      pageNumber={1}
      onGoToPage={vi.fn()}
      outline={[]}
      images={[]}
      onExtractImages={vi.fn()}
      extracting={false}
      search={{ query: '', results: [], busy: false, run: vi.fn() }}
      bookmarks={[]}
      clips={[]}
      onCopyImage={vi.fn()}
      onSaveImage={vi.fn()}
      onRemoveBookmark={vi.fn()}
      onCopyClip={vi.fn()}
      onSaveClip={vi.fn()}
      onRemoveClip={vi.fn()}
      desktop
      history={{ pastEntries: [{ label: 'Highlight' }], jumpToPast: vi.fn() }}
      recentFiles={entries.slice(0, 2)}
      favorites={entries.filter((e) => e.favorite)}
      {...h}
      {...props}
    />,
  );
  return { ...utils, ...h };
}

const hl = [
  { id: '12R', source: 'pdf', page: 1, text: 'saved line', color: 'yellow' },
  { id: 'w1', source: 'workspace', page: 2, text: 'new line', color: 'yellow' },
];

describe('History panel', () => {
  beforeEach(async () => { await setLanguage('ko'); });

  it('lists recently opened files with a delete button each and clear-all, no confirmation', () => {
    const { container, onForgetRecent, onForgetAllRecent, onOpenGalleryEntry, onClearEditHistory } = renderSide();
    const rows = container.querySelectorAll('.recent-list li');
    expect([...rows].map((r) => r.querySelector('.ol-title').textContent)).toEqual(['a.pdf', 'b.pdf']);
    fireEvent.click(rows[1].querySelector('.side-item'));
    expect(onOpenGalleryEntry).toHaveBeenCalledWith(expect.objectContaining({ name: 'b.pdf' }));
    fireEvent.click(rows[1].querySelector('.row-del'));
    expect(onForgetRecent).toHaveBeenCalledWith('C:\\d\\b.pdf');
    const [clearRecent, clearEdits] = container.querySelectorAll('.side-section-row .link-btn');
    fireEvent.click(clearRecent);
    expect(onForgetAllRecent).toHaveBeenCalled();
    fireEvent.click(clearEdits);
    expect(onClearEditHistory).toHaveBeenCalled();
    expect(document.querySelector('[role=dialog]')).toBeNull();
  });
});

describe('Highlights panel', () => {
  beforeEach(async () => { await setLanguage('ko'); });

  it('has its own tab on the left rail', () => {
    const { onPanel } = renderSide({ panel: 'none' });
    fireEvent.click(screen.getByLabelText('형광펜'));
    expect(onPanel).toHaveBeenCalledWith('highlights');
  });

  it('lists highlights, jumps to one, deletes one or all at once', () => {
    const { container, onGoToHighlight, onDeleteHighlights } = renderSide({ panel: 'highlights', highlights: hl });
    const rows = container.querySelectorAll('.hl-list li');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toMatch(/saved line.*1쪽.*PDF에 저장됨/);
    expect(rows[1].textContent).toMatch(/new line.*2쪽.*저장 전/);
    fireEvent.click(rows[1].querySelector('.side-item'));
    expect(onGoToHighlight).toHaveBeenCalledWith(hl[1]);
    fireEvent.click(rows[0].querySelector('.row-del'));
    expect(onDeleteHighlights).toHaveBeenLastCalledWith([hl[0]]);
    fireEvent.click(screen.getByTitle('형광펜 모두 지우기'));
    expect(onDeleteHighlights).toHaveBeenLastCalledWith(hl);
  });

  it('says so when there are none', () => {
    renderSide({ panel: 'highlights', highlights: [] });
    expect(screen.getByText(/형광펜이 없습니다/)).toBeTruthy();
  });
});

describe('Favorites panel', () => {
  beforeEach(async () => { await setLanguage('ko'); });

  it('opens and unstars favorites and stars the current document', () => {
    const current = { path: 'C:\\e\\c.pdf', name: 'c.pdf' };
    const { container, onOpenGalleryEntry, onToggleFavorite, onShowGallery } = renderSide({
      panel: 'favorites', currentEntry: current, currentIsFavorite: false,
    });
    const row = container.querySelector('.fav-list li');
    expect(row.querySelector('.ol-title').textContent).toBe('a.pdf');
    fireEvent.click(row.querySelector('.side-item'));
    expect(onOpenGalleryEntry).toHaveBeenCalled();
    fireEvent.click(row.querySelector('.row-del'));
    expect(onToggleFavorite).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'a.pdf' }), false);
    fireEvent.click(screen.getByTitle('현재 문서를 서재에 추가'));
    expect(onToggleFavorite).toHaveBeenLastCalledWith(current, true);
    fireEvent.click(screen.getByTitle('갤러리 열기'));
    expect(onShowGallery).toHaveBeenCalled();
  });
});

describe('Library panel on the left', () => {
  beforeEach(async () => { await setLanguage('ko'); });

  it('has the bookshelf icon on its tab', () => {
    const { container } = renderSide({ panel: 'none' });
    const tab = screen.getByLabelText('서재');
    expect(tab.closest('.side-rail')).toBe(container.querySelector('.side-rail'));
    // The tab draws the bookshelf (three books on a board), not the old star.
    expect(tab.querySelectorAll('svg rect').length).toBe(2);
  });

  it('removes one entry or all of them at once, without asking', () => {
    const onClearLibrary = vi.fn();
    const favs = entries.map((e) => ({ ...e, favorite: true }));
    const { container, onToggleFavorite, onContextMenuItems } = renderSide({ panel: 'favorites', favorites: favs, onClearLibrary });
    expect(container.querySelector('.side-section').textContent).toBe('3권');
    const rows = container.querySelectorAll('.fav-list li');
    fireEvent.click(rows[1].querySelector('.row-del'));
    expect(onToggleFavorite).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'b.pdf' }), false);
    fireEvent.click(screen.getByRole('button', { name: '전체 삭제' }));
    expect(onClearLibrary).toHaveBeenCalledWith(favs);
    expect(document.querySelector('[role=dialog]')).toBeNull();
    fireEvent.contextMenu(rows[0]);
    const items = onContextMenuItems.mock.calls.at(-1)[1];
    expect(items.filter((i) => !i.separator).every((i) => typeof i.icon === 'function')).toBe(true);
    items.find((i) => i.label === '서재 모두 비우기').onClick();
    expect(onClearLibrary).toHaveBeenCalledTimes(2);
  });

  it('cannot clear an empty library', () => {
    renderSide({ panel: 'favorites', favorites: [], onClearLibrary: vi.fn() });
    expect(screen.getByRole('button', { name: '전체 삭제' }).disabled).toBe(true);
  });
});

describe('left-panel right-click menus', () => {
  beforeEach(async () => { await setLanguage('ko'); });

  const lastItems = (fn) => fn.mock.calls[fn.mock.calls.length - 1][1];
  const allHaveIcons = (items) => items.filter((i) => !i.separator).every((i) => typeof i.icon === 'function');

  it('gives a highlight row its own menu, every item with an icon', () => {
    const { container, onContextMenuItems, onDeleteHighlights } = renderSide({ panel: 'highlights', highlights: hl });
    fireEvent.contextMenu(container.querySelector('.hl-list li'));
    const items = lastItems(onContextMenuItems);
    expect(items.filter((i) => !i.separator).map((i) => i.label)).toEqual(['이 위치로 이동', '글자 복사', '이 형광펜 지우기', '형광펜 모두 지우기']);
    expect(allHaveIcons(items)).toBe(true);
    items.find((i) => i.label === '이 형광펜 지우기').onClick();
    expect(onDeleteHighlights).toHaveBeenCalledWith([hl[0]]);
  });

  it('gives a recent file a menu that can forget it or reveal it', () => {
    const { container, onContextMenuItems, onForgetRecent, onRevealPath } = renderSide();
    fireEvent.contextMenu(container.querySelector('.recent-list li'));
    const items = lastItems(onContextMenuItems);
    expect(allHaveIcons(items)).toBe(true);
    items.find((i) => i.label.startsWith('기록에서 지우기')).onClick();
    expect(onForgetRecent).toHaveBeenCalledWith('C:\\d\\a.pdf');
    items.find((i) => i.label === '폴더에서 보기').onClick();
    expect(onRevealPath).toHaveBeenCalledWith('C:\\d\\a.pdf');
  });

  it('shows the general menu on empty panel space and on the rail', () => {
    const { container, onContextMenuItems } = renderSide({ panel: 'highlights', highlights: [] });
    fireEvent.contextMenu(container.querySelector('.side-body'));
    expect(allHaveIcons(lastItems(onContextMenuItems))).toBe(true);
    fireEvent.contextMenu(container.querySelector('.side-rail'));
    expect(lastItems(onContextMenuItems).map((i) => i.label).filter(Boolean)).toContain('패널 닫기');
  });
});

describe('Print dialog on the desktop', () => {
  function mockDoc() {
    return {
      getPage: vi.fn(async () => ({
        rotate: 0,
        getViewport: ({ scale = 1 } = {}) => ({ width: 80 * scale, height: 110 * scale, scale }),
        render: () => ({ promise: Promise.resolve() }),
        cleanup: vi.fn(),
      })),
    };
  }

  async function renderPrint(listPrinters, settings = {}) {
    await setLanguage('ko');
    const onPrint = vi.fn();
    const onChange = vi.fn();
    render(
      <PrintDialog
        open
        doc={mockDoc()}
        numPages={4}
        pageNumber={2}
        settings={{ ...DEFAULT_SETTINGS, ...settings }}
        onChange={onChange}
        onPrint={onPrint}
        onClose={() => {}}
        busy={false}
        listPrinters={listPrinters}
      />,
    );
    return { onPrint, onChange };
  }

  it('picks the default printer and prints straight to it with copies and orientation', async () => {
    const listPrinters = vi.fn(async () => ({ printers: ['Office', 'Home'], default: 'Home' }));
    const { onPrint, onChange } = await renderPrint(listPrinters);
    await waitFor(() => expect(screen.getByLabelText('프린터').value).toBe('Home'));
    expect(screen.getByRole('option', { name: 'Home (기본)' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('프린터'), { target: { value: 'Office' } });
    fireEvent.change(screen.getByLabelText('매수'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('용지 방향'), { target: { value: 'landscape' } });
    fireEvent.click(screen.getByRole('button', { name: '인쇄' }));
    expect(onPrint).toHaveBeenCalledWith({ pages: [1, 2, 3, 4], scope: 'all', printer: 'Office', copies: 3, orientation: 'landscape' });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ printPrinter: 'Office', printOrientation: 'landscape' }));
  });

  it('remembers the last printer and still offers the system dialog', async () => {
    const listPrinters = vi.fn(async () => ({ printers: ['Office', 'Home'], default: 'Home' }));
    const { onPrint } = await renderPrint(listPrinters, { printPrinter: 'Office' });
    await waitFor(() => expect(screen.getByLabelText('프린터').value).toBe('Office'));
    fireEvent.click(screen.getByRole('button', { name: '시스템 인쇄 창…' }));
    expect(onPrint).toHaveBeenCalledWith({ pages: [1, 2, 3, 4], scope: 'all', viaSystem: true });
  });

  it('cannot print directly when no printer is installed', async () => {
    await renderPrint(vi.fn(async () => ({ printers: [], default: null })));
    await waitFor(() => expect(screen.getAllByText('설치된 프린터가 없습니다.').length).toBeGreaterThan(0));
    expect(screen.getByRole('button', { name: '인쇄' }).disabled).toBe(true);
  });
});
