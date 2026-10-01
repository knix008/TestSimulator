import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Toolbar from '../src/components/Toolbar.jsx';
import StatusBar from '../src/components/StatusBar.jsx';
import TabBar from '../src/components/TabBar.jsx';
import MenuList from '../src/components/MenuList.jsx';
import ContextMenu from '../src/components/ContextMenu.jsx';
import Tooltip from '../src/components/Tooltip.jsx';
import Toasts from '../src/components/Toasts.jsx';
import Modal from '../src/components/Modal.jsx';
import { ICONS, iconByName } from '../src/components/Icons.jsx';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';
import { menuRows } from '../src/lib/menus.js';
import i18n from '../src/i18n.js';

const history = {
  canUndo: false, canRedo: false, undoLabel: '', redoLabel: '', depth: 0,
  undo: vi.fn(), redo: vi.fn(),
};

const book = {
  meta: { title: '샘플 책', author: 'SHKWON' },
  fileName: 'sample.epub',
  filePath: 'C:\\books\\sample.epub',
  fileSize: 66779,
  format: 'epub',
  formatLabel: 'EPUB',
  reflowable: true,
  sectionCount: 3,
  sections: [{ label: '1' }, { label: '2' }, { label: '3' }],
  toc: [],
};

function renderToolbar(over = {}) {
  const props = {
    settings: DEFAULT_SETTINGS,
    book,
    section: 0,
    sectionCount: 3,
    scale: 1,
    hasSelection: false,
    history,
    bookmarkCount: 0,
    onOpenMenu: vi.fn(),
    onCommand: vi.fn(),
    onGoToSection: vi.fn(),
    onTheme: vi.fn(),
    onLang: vi.fn(),
    onReaderFont: vi.fn(),
    ...over,
  };
  return { ...render(<Toolbar {...props} />), props };
}

describe('Toolbar', () => {
  it('gives every button a tooltip', () => {
    renderToolbar();
    const buttons = [...document.querySelectorAll('.toolbar button')];
    expect(buttons.length).toBeGreaterThan(10);
    for (const button of buttons) {
      const tip = button.getAttribute('title') || button.getAttribute('data-tip');
      expect(tip, button.getAttribute('aria-label') || button.outerHTML.slice(0, 80)).toBeTruthy();
    }
  });

  it('gives every input and slider a tooltip too', () => {
    renderToolbar();
    for (const field of document.querySelectorAll('.toolbar input, .toolbar select')) {
      expect(field.getAttribute('title'), field.outerHTML.slice(0, 60)).toBeTruthy();
    }
  });

  it('runs a command when its button is pressed', () => {
    const { props } = renderToolbar();
    fireEvent.click(screen.getByLabelText(i18n.t('cmd.open')));
    expect(props.onCommand).toHaveBeenCalledWith('open');
  });

  it('puts Open folder beside Open book', () => {
    renderToolbar();
    const folder = screen.getByTestId('open-folder');
    expect(folder.getAttribute('aria-label')).toBe(i18n.t('cmd.openFolder'));
    expect(folder.getAttribute('title')).toBe(i18n.t('tip.openFolder'));
    const open = screen.getByLabelText(i18n.t('cmd.open'));
    expect(open.compareDocumentPosition(folder) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('asks for a menu, with where the button is, when a menu button is pressed', () => {
    // A page-turn effect needs a page that goes away, so the book has to be
    // coming one screen at a time for the list to be offered at all.
    const { props } = renderToolbar({ settings: { ...DEFAULT_SETTINGS, pageMode: 'paged' } });
    fireEvent.click(screen.getByTestId('page-turn'));
    expect(props.onOpenMenu).toHaveBeenCalledWith('turn', expect.objectContaining({
      x: expect.any(Number), y: expect.any(Number),
    }));
  });

  it('holds no menu that the menu bar already holds', () => {
    renderToolbar();
    // The row is actions. The five menus live on the bar above it, and having
    // them in both places put two ways to every command an inch apart.
    for (const menu of ['file', 'reading', 'view', 'marks', 'app']) {
      expect(document.querySelector(`.toolbar [data-menu="${menu}"]`), menu).toBeNull();
      expect(screen.queryByLabelText(i18n.t(`menu.${menu}`)), menu).toBeNull();
    }
    // What is left are the two that are not menu-bar menus: the reader's own
    // bookmarks, and the page-turn effect picked from a list.
    expect(screen.getByTestId('page-turn')).toBeTruthy();
    expect(document.querySelector('.menu-wrap.split .menu-btn')).toBeTruthy();
  });

  it('disables the book commands when nothing is open', () => {
    renderToolbar({ book: null });
    expect(screen.getByLabelText(i18n.t('cmd.print'))).toBeDisabled();
    expect(screen.getByLabelText(i18n.t('cmd.open'))).not.toBeDisabled();
  });

  it('offers smaller, the current size, and larger', () => {
    const { props } = renderToolbar({ settings: { ...DEFAULT_SETTINGS, fontScale: 1.2 } });
    fireEvent.click(screen.getByLabelText(i18n.t('cmd.textSmaller')));
    expect(props.onCommand).toHaveBeenCalledWith('textSmaller');
    fireEvent.click(screen.getByLabelText(i18n.t('cmd.textBigger')));
    expect(props.onCommand).toHaveBeenCalledWith('textBigger');
    const readout = screen.getByLabelText(i18n.t('cmd.textReset'));
    expect(readout.textContent).toBe('20px');
    fireEvent.click(readout);
    expect(props.onCommand).toHaveBeenCalledWith('textReset');
  });

  it('tells smaller from bigger by the size of the letter, not by a sign', () => {
    renderToolbar();
    const smaller = screen.getByTestId('font-smaller');
    const bigger = screen.getByTestId('font-bigger');
    // The sign is there to be read, and the letter to be seen: the two
    // buttons must not draw the same picture as each other.
    expect(smaller.textContent).toBe('−');
    expect(bigger.textContent).toBe('+');
    const path = (el) => el.querySelector('svg path').getAttribute('d');
    expect(path(smaller)).not.toBe(path(bigger));
    // And the bigger one really is the taller letter: its apex sits higher.
    const apex = (el) => Math.min(...[...path(el).matchAll(/[-\d.]+\s+([-\d.]+)/g)].map((m) => Number(m[1])));
    expect(apex(bigger)).toBeLessThan(apex(smaller));
  });
  it('puts a fixed-layout book back to actual size from the same readout', () => {
    const { props } = renderToolbar({ book: { ...book, reflowable: false }, scale: 1.75 });
    const readout = document.querySelector('.zoom-readout');
    expect(readout.textContent).toBe('175%');
    fireEvent.click(readout);
    expect(props.onCommand).toHaveBeenCalledWith('actualSize');
  });

  it('offers one page, two pages and a continuous run, and only one is on', () => {
    const fixed = { ...book, reflowable: false };
    const single = renderToolbar({ book: fixed });
    const one = screen.getByTestId('view-single');
    const two = screen.getByTestId('view-double');
    const run = screen.getByTestId('view-continuous');
    expect(one.getAttribute('aria-pressed')).toBe('true');
    expect(two.getAttribute('aria-pressed')).toBe('false');
    expect(run.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(two);
    expect(single.props.onCommand).toHaveBeenCalledWith('viewDouble');
    single.unmount();

    const doubled = renderToolbar({
      book: fixed,
      settings: { ...DEFAULT_SETTINGS, viewLayout: 'double', spread: 'double', pageFlow: 'paged' },
    });
    expect(screen.getByTestId('view-double').className).toContain('active');
    expect(screen.getByTestId('view-single').className).not.toContain('active');
    expect(screen.getByTestId('view-continuous').className).not.toContain('active');
    fireEvent.click(screen.getByTestId('view-continuous'));
    expect(doubled.props.onCommand).toHaveBeenCalledWith('viewContinuous');
  });

  it('puts the page-turn control to the right of the view buttons', () => {
    renderToolbar();
    const order = [...document.querySelectorAll('[data-testid]')].map((el) => el.getAttribute('data-testid'));
    const view = order.indexOf('view-continuous');
    const turn = order.indexOf('page-turn');
    const columns = order.indexOf('columns-1');
    expect(view).toBeGreaterThan(order.indexOf('view-single'));
    expect(turn).toBe(view + 1);
    expect(columns).toBeGreaterThan(turn);
  });

  it('offers the same three views for a reflowable book', () => {
    renderToolbar();
    expect(screen.getByTestId('view-single')).not.toBeDisabled();
    expect(screen.getByTestId('view-double')).not.toBeDisabled();
    expect(screen.getByTestId('view-continuous')).not.toBeDisabled();
    expect(screen.getByTestId('view-continuous').getAttribute('aria-pressed')).toBe('true');
  });

  it('offers one or two columns for text, and not for a PDF', () => {
    const text = renderToolbar({ settings: { ...DEFAULT_SETTINGS, viewLayout: 'single', columns: 1 } });
    expect(screen.getByTestId('columns-1').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('columns-2')).not.toBeDisabled();
    expect(screen.queryByTestId('columns-3')).toBeNull();
    fireEvent.click(screen.getByTestId('columns-2'));
    expect(text.props.onCommand).toHaveBeenCalledWith('columns2');
    text.unmount();

    renderToolbar({
      book: { ...book, reflowable: false },
      settings: { ...DEFAULT_SETTINGS, viewLayout: 'single', columns: 2 },
    });
    expect(screen.getByTestId('columns-1')).toBeDisabled();
    expect(screen.getByTestId('columns-2')).toBeDisabled();
  });

  it('does not offer columns while the book is read continuously', () => {
    renderToolbar({ settings: { ...DEFAULT_SETTINGS, viewLayout: 'continuous', columns: 2, twoColumns: true } });
    expect(screen.getByTestId('columns-1')).toBeDisabled();
    expect(screen.getByTestId('columns-2')).toBeDisabled();
    expect(screen.getByTestId('columns-1').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('columns-2').getAttribute('aria-pressed')).toBe('false');
  });

  it('does not offer columns while two pages are showing', () => {
    renderToolbar({ settings: { ...DEFAULT_SETTINGS, viewLayout: 'double', columns: 2, twoColumns: true } });
    expect(screen.getByTestId('columns-1')).toBeDisabled();
    expect(screen.getByTestId('columns-2')).toBeDisabled();
    expect(screen.getByTestId('columns-1').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('columns-2').getAttribute('aria-pressed')).toBe('false');
  });

  it('does not offer a page-turn effect while the book is read continuously', () => {
    renderToolbar({ settings: { ...DEFAULT_SETTINGS, viewLayout: 'continuous' } });
    expect(screen.getByTestId('page-turn')).toBeDisabled();
  });

  it('fits an ebook to the window itself, and turns pages only one or two at a time', () => {
    renderToolbar({ settings: { ...DEFAULT_SETTINGS, viewLayout: 'single' } });
    expect(screen.queryByTestId('fit-page')).toBeNull();
    expect(screen.queryByTestId('fit-width')).toBeNull();
    expect(screen.queryByTestId('fit-height')).toBeNull();
    expect(screen.getByTestId('page-turn')).not.toBeDisabled();
    expect(screen.getByTestId('view-single')).not.toBeDisabled();
    expect(screen.getByTestId('view-double')).not.toBeDisabled();
  });

  it('turns pages of an ebook shown two at a time', () => {
    renderToolbar({ settings: { ...DEFAULT_SETTINGS, viewLayout: 'double' } });
    expect(screen.getByTestId('page-turn')).not.toBeDisabled();
    expect(screen.queryByTestId('fit-page')).toBeNull();
  });

  it('keeps width and height fit off a single page, which always fills the window', () => {
    const fixed = { ...book, reflowable: false };
    renderToolbar({ book: fixed, settings: { ...DEFAULT_SETTINGS, viewLayout: 'single' } });
    expect(screen.getByTestId('fit-page')).not.toBeDisabled();
    expect(screen.getByTestId('fit-width')).toBeDisabled();
    expect(screen.getByTestId('fit-height')).toBeDisabled();
  });

  it('leaves bookmarks and search to the left tools', () => {
    renderToolbar({ bookmarkCount: 3, hasSelection: true });
    const bar = within(document.querySelector('.toolbar'));
    expect(bar.queryByLabelText(i18n.t('cmd.addBookmark'))).toBeNull();
    expect(bar.queryByLabelText(i18n.t('menu.bookmarks'))).toBeNull();
    expect(bar.queryByLabelText(i18n.t('cmd.find'))).toBeNull();
  });

  it('has the highlighter on the row, off until something is selected', () => {
    renderToolbar({ hasSelection: false });
    const bar = within(document.querySelector('.toolbar'));
    expect(bar.getByLabelText(i18n.t('cmd.highlight')).disabled).toBe(true);
  });

  it('paints the selection when the highlighter is pressed', () => {
    const { props } = renderToolbar({ hasSelection: true });
    const bar = within(document.querySelector('.toolbar'));
    fireEvent.click(bar.getByLabelText(i18n.t('cmd.highlight')));
    expect(props.onCommand).toHaveBeenCalledWith('highlight');
  });

  it('jumps to the chapter typed into the box', () => {
    const { props } = renderToolbar();
    const input = document.querySelector('.page-input');
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onGoToSection).toHaveBeenCalledWith(2);
  });

  it('ignores a chapter number the book does not have', () => {
    const { props } = renderToolbar();
    const input = document.querySelector('.page-input');
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.blur(input);
    expect(props.onGoToSection).not.toHaveBeenCalled();
    expect(input).toHaveValue('1');
  });

  it('offers every installed font for an EPUB or MOBI, and none for a PDF', async () => {
    const text = renderToolbar();
    const pick = screen.getByTestId('reader-font');
    expect(pick).not.toBeDisabled();
    expect(pick.getAttribute('title')).toBe(i18n.t('tip.readerFont'));
    await waitFor(() => expect(within(pick).getByRole('option', { name: 'Georgia' })).toBeTruthy());
    fireEvent.change(pick, { target: { value: 'Georgia' } });
    expect(text.props.onReaderFont).toHaveBeenCalledWith('Georgia');
    text.unmount();

    renderToolbar({ book: { ...book, reflowable: false, format: 'pdf' } });
    expect(screen.queryByTestId('reader-font')).toBeNull();
  });

  it('shows the text size for a reflowable book and leaves document zoom off', () => {
    const reflow = renderToolbar({ settings: { ...DEFAULT_SETTINGS, fontScale: 1.5 } });
    expect(screen.getByTestId('font-readout').textContent).toBe('26px');
    expect(screen.getByTestId('font-smaller')).not.toBeDisabled();
    expect(screen.getByTestId('font-bigger')).not.toBeDisabled();
    expect(screen.getByTestId('zoom-out')).toBeDisabled();
    expect(screen.getByTestId('zoom-in')).toBeDisabled();
    expect(screen.getByTestId('zoom-readout')).toBeDisabled();
    reflow.unmount();
    renderToolbar({ book: { ...book, reflowable: false }, scale: 2 });
    expect(screen.getByTestId('zoom-readout').textContent).toBe('200%');
    expect(screen.getByTestId('zoom-in')).not.toBeDisabled();
    expect(screen.queryByTestId('font-readout')).toBeNull();
  });

  it('marks the panels that are open', () => {
    const open = renderToolbar();
    expect(screen.getByLabelText(i18n.t('cmd.toggleLeft')).className).toContain('active');
    open.unmount();
    renderToolbar({ settings: { ...DEFAULT_SETTINGS, leftPanel: 'none' } });
    expect(screen.getByLabelText(i18n.t('cmd.toggleLeft')).className).not.toContain('active');
  });

  it('shows labels next to the icons when asked to', () => {
    renderToolbar({ settings: { ...DEFAULT_SETTINGS, showToolbarLabels: true } });
    expect(document.querySelectorAll('.tbtn-label').length).toBeGreaterThan(4);
  });

  it('switches the theme and the language from the right-hand group', () => {
    const { props } = renderToolbar();
    // The theme control is split: the icon cycles, the chevron opens the list.
    fireEvent.click(document.querySelector('.toolbar-right .menu-wrap.split .tbtn'));
    expect(props.onTheme).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(i18n.t('cmd.language')));
    expect(props.onLang).toHaveBeenCalled();
  });

  it('has exactly one settings button', () => {
    renderToolbar();
    const settings = [...document.querySelectorAll('.toolbar button')]
      .filter((button) => (button.getAttribute('aria-label') || '') === i18n.t('cmd.settings'));
    expect(settings).toHaveLength(1);
  });

  it('gives every toolbar control its own icon', () => {
    renderToolbar();
    // Two buttons drawing the same picture is how the settings button and the
    // application menu came to look alike; the shapes are compared directly.
    const shapes = [...document.querySelectorAll('.toolbar-right button')]
      .map((button) => button.querySelector('svg')?.innerHTML)
      .filter(Boolean);
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it('asks for the theme list in its own window from the chevron beside it', () => {
    const { props } = renderToolbar();
    fireEvent.click(document.querySelector('.toolbar-right .menu-wrap.split .menu-btn'));
    expect(props.onOpenMenu).toHaveBeenCalledWith('theme', expect.any(Object));
  });
});

describe('StatusBar', () => {
  const statusProps = {
    book,
    section: 1,
    progress: 0.5,
    scale: 1,
    columns: { pages: 1, page: 0 },
    selectionChars: 0,
    dirty: false,
    history,
    message: '',
    busy: false,
    bookmarks: 2,
  };

  it('shows what is open and where the reader is', () => {
    render(<StatusBar {...statusProps} />);
    expect(screen.getByText(/샘플 책/)).toBeTruthy();
    expect(screen.getByText(/2 \/ 3/)).toBeTruthy();
    expect(screen.getByText(/50%/)).toBeTruthy();
    expect(screen.getByText('EPUB')).toBeTruthy();
  });

  it('shows the file size, the selection and the undo depth', () => {
    render(<StatusBar {...statusProps} selectionChars={12} />);
    expect(screen.getByText('65.2 KB')).toBeTruthy();
    expect(screen.getByText(i18n.t('status.chars', { n: 12 }))).toBeTruthy();
    expect(screen.getByText(i18n.t('status.history', { n: 0 }))).toBeTruthy();
  });

  it('says whether there is unsaved work', () => {
    render(<StatusBar {...statusProps} dirty />);
    expect(screen.getByText(i18n.t('status.modified'))).toBeTruthy();
  });

  it('counts the bookmarks of the open book', () => {
    render(<StatusBar {...statusProps} />);
    expect(screen.getByTitle(i18n.t('status.bookmarks', { n: 2 }))).toBeTruthy();
  });

  it('says so plainly when no book is open', () => {
    render(<StatusBar {...statusProps} book={null} />);
    expect(screen.getByText(i18n.t('status.noBook'))).toBeTruthy();
  });

  it('says where the reader is in the chapter and in the book', () => {
    render(<StatusBar {...statusProps} pageCount={12} pageNow={3} columns={{ pages: 4, page: 2 }} />);
    // Both numbers, as the cells above say they should be: the chapter, where
    // in the chapter, and how far through the book. The last is worked out
    // rather than the book's own, and the ≈ says so. Both the in-chapter count
    // and the book-wide one used to be rendered only for fixed-layout books —
    // whose chapter is a single page and whose pages are its own — so for an
    // ebook, the one format that needs them, neither ever appeared.
    expect(screen.getByTestId('page-readout').textContent).toMatch(/3\s*\/\s*12/);
    expect(screen.getByTestId('chapter-pages').textContent).toMatch(/3\s*\/\s*4/);
    expect(screen.getByText(/2 \/ 3/)).toBeTruthy();
  });

  it('leaves the in-chapter count off while the chapter is one page', () => {
    render(<StatusBar {...statusProps} columns={{ pages: 1, page: 0 }} />);
    expect(screen.queryByTestId('chapter-pages')).toBeNull();
  });

  it('numbers the pages of a fixed-layout book', () => {
    render(<StatusBar
      {...statusProps}
      book={{ ...book, reflowable: false, formatLabel: 'PDF' }}
      pageCount={10}
      pageNow={3}
    />);
    expect(screen.getByTestId('page-readout').textContent).toContain('3 / 10');
  });

  it('gives every cell a tooltip', () => {
    render(<StatusBar {...statusProps} />);
    for (const cell of document.querySelectorAll('.st-cell')) {
      expect(cell.getAttribute('title')).toBeTruthy();
    }
  });
});

describe('TabBar', () => {
  const tabs = [
    { id: 't1', name: 'one.epub', path: '/one.epub', dirty: false },
    { id: 't2', name: 'two.pdf', path: '/two.pdf', dirty: true },
  ];

  it('shows nothing when no book is open', () => {
    const { container } = render(<TabBar tabs={[]} activeId={null} onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('lists the open books and marks the active one', () => {
    render(<TabBar tabs={tabs} activeId="t2" onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('one.epub')).toBeTruthy();
    expect(document.querySelector('.doctab.active').textContent).toContain('two.pdf');
  });

  it('marks a book with unsaved work', () => {
    render(<TabBar tabs={tabs} activeId="t1" onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(document.querySelectorAll('.doctab.dirty')).toHaveLength(1);
    expect(document.querySelector('.doctab-dot')).toBeTruthy();
  });

  it('switches book when a tab is clicked', () => {
    const onSelect = vi.fn();
    render(<TabBar tabs={tabs} activeId="t1" onSelect={onSelect} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('two.pdf'));
    expect(onSelect).toHaveBeenCalledWith('t2');
  });

  it('closes a book from its × button, and from a middle click', () => {
    const onClose = vi.fn();
    render(<TabBar tabs={tabs} activeId="t1" onSelect={vi.fn()} onClose={onClose} />);
    fireEvent.click(document.querySelectorAll('.doctab-close')[0]);
    expect(onClose).toHaveBeenCalledWith('t1');
    fireEvent(document.querySelectorAll('.doctab')[1], new MouseEvent('auxclick', { button: 1, bubbles: true }));
    expect(onClose).toHaveBeenCalledWith('t2');
  });

  it('gives each tab the full path as its tooltip', () => {
    render(<TabBar tabs={tabs} activeId="t1" onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(document.querySelectorAll('.doctab')[0].getAttribute('title')).toBe('/one.epub');
  });
});

describe('MenuList', () => {
  const rows = menuRows('file', {
    hasBook: true,
    recentFiles: [{ path: '/a/b.epub', name: 'b.epub', dir: '/a' }],
  });

  it('renders one row per line, each with an icon and a label', () => {
    render(<MenuList rows={rows} translate={(k) => i18n.t(k)} onChoose={vi.fn()} />);
    const items = document.querySelectorAll('.menu-item');
    expect(items.length).toBeGreaterThan(5);
    for (const item of items) {
      expect(item.querySelector('.menu-icon')).toBeTruthy();
      expect(item.querySelector('.menu-label').textContent.trim()).not.toBe('');
    }
  });

  it('shows the shortcut of a row that has one', () => {
    render(<MenuList rows={rows} translate={(k) => i18n.t(k)} onChoose={vi.fn()} />);
    expect(screen.getByText('Ctrl+O')).toBeTruthy();
  });

  it('reports the row that was chosen', () => {
    const onChoose = vi.fn();
    render(<MenuList rows={rows} translate={(k) => i18n.t(k)} onChoose={onChoose} />);
    fireEvent.click(screen.getByText(i18n.t('cmd.print')));
    expect(onChoose).toHaveBeenCalledWith('print');
  });

  it('offers to forget one recent file', () => {
    const onChoose = vi.fn();
    render(<MenuList rows={rows} translate={(k) => i18n.t(k)} onChoose={onChoose} />);
    fireEvent.click(document.querySelector('.menu-forget'));
    expect(onChoose).toHaveBeenCalledWith('recent-forget:/a/b.epub');
  });

  it('renders a section heading, a separator and an empty note', () => {
    render(<MenuList
      rows={[{ section: 'recent.title' }, { separator: true }, { empty: 'recent.empty' }]}
      translate={(k) => i18n.t(k)}
      onChoose={vi.fn()}
    />);
    expect(document.querySelector('.menu-head')).toBeTruthy();
    expect(document.querySelector('.menu-sep')).toBeTruthy();
    expect(document.querySelector('.menu-empty')).toBeTruthy();
  });

  it('lays a long menu out in columns when it is asked to', () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({ id: `r${i}`, text: `row ${i}`, icon: 'open' }));
    const { rerender } = render(
      <MenuList rows={rows} translate={(k) => k} onChoose={() => {}} />,
    );
    // One column by default: no grid, no row count to lay out.
    expect(document.querySelector('.menu-list').className).toBe('menu-list');

    rerender(<MenuList rows={rows} columns={2} translate={(k) => k} onChoose={() => {}} />);
    const list = document.querySelector('.menu-list');
    expect(list.className).toContain('cols-2');
    // Nine rows over two columns is five in the first one, filled downwards.
    expect(list.style.getPropertyValue('--menu-rows')).toBe('5');
    expect(document.querySelectorAll('.menu-item')).toHaveLength(9);
  });

  it('shows a theme row as its three swatch colours', () => {
    render(<MenuList
      rows={[{ id: 'theme:nord', text: 'nord', icon: 'theme', bars: ['#1', '#2', '#3'], checked: true }]}
      translate={(k) => k}
      onChoose={vi.fn()}
    />);
    expect(document.querySelectorAll('.theme-swatch i')).toHaveLength(3);
    expect(document.querySelector('.menu-item.checked')).toBeTruthy();
  });

  it('cannot choose a disabled row', () => {
    const onChoose = vi.fn();
    render(<MenuList rows={[{ id: 'x', text: 'nope', icon: 'open', disabled: true }]} translate={(k) => k} onChoose={onChoose} />);
    fireEvent.click(screen.getByText('nope'));
    expect(onChoose).not.toHaveBeenCalled();
  });
});

describe('ContextMenu (the in-page fallback)', () => {
  const rows = menuRows('context', { hasBook: true, hasSelection: true });

  it('shows nothing when closed', () => {
    const { container } = render(<ContextMenu open={false} rows={rows} onChoose={vi.fn()} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('opens at the pointer and reports the chosen row', () => {
    const onChoose = vi.fn();
    const onClose = vi.fn();
    render(<ContextMenu open x={40} y={60} rows={rows} onChoose={onChoose} onClose={onClose} />);
    expect(document.querySelector('.ctxmenu')).toBeTruthy();
    fireEvent.click(screen.getByText(i18n.t('cmd.copySelection')));
    expect(onChoose).toHaveBeenCalledWith('copySelection');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape and on a click outside it', () => {
    const onClose = vi.fn();
    render(<ContextMenu open x={0} y={0} rows={rows} onChoose={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(onClose.mock.calls.length).toBeGreaterThan(1);
  });
});

describe('Tooltip', () => {
  it('moves a title onto the element as data-tip, so the slow native one never fires', () => {
    render(
      <>
        <button type="button" title="explains itself">hover me</button>
        <Tooltip />
      </>
    );
    const button = screen.getByText('hover me');
    fireEvent.mouseOver(button);
    expect(button.getAttribute('data-tip')).toBe('explains itself');
    expect(button.hasAttribute('title')).toBe(false);
  });
});

describe('Toasts', () => {
  it('shows nothing when there is nothing to say', () => {
    const { container } = render(<Toasts toasts={[]} onDismiss={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows a message and dismisses it on click', () => {
    const onDismiss = vi.fn();
    render(<Toasts toasts={[{ id: 'a', text: '복사했습니다', kind: 'ok' }]} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText('복사했습니다'));
    expect(onDismiss).toHaveBeenCalledWith('a');
  });
});

describe('Modal', () => {
  it('shows its title and children, and closes on Escape', () => {
    const onClose = vi.fn();
    render(<Modal open title="제목" onClose={onClose}><p>안쪽</p></Modal>);
    expect(screen.getByText('제목')).toBeTruthy();
    expect(screen.getByText('안쪽')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when the backdrop is clicked, unless told not to', () => {
    const onClose = vi.fn();
    const { rerender } = render(<Modal open title="t" onClose={onClose}><p>x</p></Modal>);
    fireEvent.mouseDown(document.querySelector('.modal-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<Modal open title="t" onClose={onClose} closeOnBackdrop={false}><p>x</p></Modal>);
    fireEvent.mouseDown(document.querySelector('.modal-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('the icon set', () => {
  it('has a component for every name menus refer to', () => {
    for (const [name, Component] of Object.entries(ICONS)) {
      expect(typeof Component, name).toBe('function');
    }
  });

  it('falls back to a real component for an unknown name', () => {
    expect(typeof iconByName('no-such-icon')).toBe('function');
  });

  it('renders as an inline SVG that inherits the text colour', () => {
    const { container } = render(<>{React.createElement(iconByName('open'), { size: 20 })}</>);
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('20');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
  });
});

describe('within helper sanity', () => {
  it('finds a control inside a region', () => {
    render(<div role="group" aria-label="g"><button type="button">inside</button></div>);
    expect(within(screen.getByRole('group')).getByText('inside')).toBeTruthy();
  });
});
