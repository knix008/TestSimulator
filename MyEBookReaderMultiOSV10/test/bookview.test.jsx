import React, { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import BookView, { paintMarks } from '../src/components/BookView.jsx';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';
// The real translations, so the words the pane puts on the page are the words a
// reader would see rather than the keys behind them.
import '../src/i18n.js';
import { highlightCss } from '../src/lib/library.js';

const reflowBook = {
  reflowable: true,
  sectionCount: 3,
  sections: [{ label: '1' }, { label: '2' }, { label: '3' }],
  pdf: null,
};

const htmlContent = {
  kind: 'html',
  index: 0,
  html: '<h1 id="h1">첫 장</h1><p>본문 텍스트 여기 있습니다.</p><p><a data-section="2" data-anchor="part">다음</a> <a data-external="https://example.com">web</a></p>',
  headings: [{ id: 'h1', level: 1, text: '첫 장' }],
  title: '첫 장',
  text: '본문 텍스트',
};

function renderView(over = {}) {
  const ref = createRef();
  const props = {
    book: reflowBook,
    section: 0,
    content: htmlContent,
    settings: DEFAULT_SETTINGS,
    marks: { highlights: [], notes: [], bookmarks: [] },
    searchQuery: '',
    activeHit: null,
    onSelectionChange: vi.fn(),
    onContextMenu: vi.fn(),
    onFollowLink: vi.fn(),
    onOpenExternal: vi.fn(),
    onProgress: vi.fn(),
    onPageInfo: vi.fn(),
    onZoomStep: vi.fn(),
    onTextStep: vi.fn(),
    onScaleChange: vi.fn(),
    onPickImage: vi.fn(),
    onGoToPage: vi.fn(),
    onTurnPage: vi.fn(),
    onError: vi.fn(),
    emptyState: <p>no book</p>,
    ...over,
  };
  return { ...render(<BookView ref={ref} {...props} />), props, ref };
}

describe('paintMarks', () => {
  it('wraps the highlighted words where they appear', () => {
    const out = paintMarks('<p>keep this passage</p>', [{ id: 'm1', text: 'this passage', color: 'green' }]);
    expect(out).toContain('data-highlight="m1"');
    expect(out).toContain(highlightCss('green'));
    expect(out).toContain('>this passage<');
  });

  it('marks only the first occurrence — a highlight is one passage', () => {
    const out = paintMarks('<p>word word word</p>', [{ id: 'm', text: 'word' }]);
    expect(out.match(/data-highlight/g)).toHaveLength(1);
  });

  it('never matches inside a tag', () => {
    const out = paintMarks('<p title="target">text</p>', [{ id: 'm', text: 'target' }]);
    expect(out).toBe('<p title="target">text</p>');
  });

  it('paints a note differently from a highlight', () => {
    expect(paintMarks('<p>noted words</p>', [{ id: 'n', text: 'noted', kind: 'note' }]))
      .toContain('mark-note');
  });

  it('ignores a mark whose text is gone or too short', () => {
    expect(paintMarks('<p>x</p>', [{ id: 'a', text: 'not here' }, { id: 'b', text: 'x' }]))
      .toBe('<p>x</p>');
  });

  it('leaves the html alone when there is nothing to paint', () => {
    expect(paintMarks('<p>a</p>', [])).toBe('<p>a</p>');
  });

  // A highlight is the string the browser handed over for the selection. It
  // has no tags in it, its entities are already characters, and the source's
  // line breaks and indentation have become single spaces — so looking for it
  // in the markup verbatim found almost nothing, and the reader's highlights
  // simply never appeared on the page.
  it('paints a passage that runs over a line break in the source', () => {
    const source = ['<p>keep this', '      passage whole</p>'].join('\n');
    const out = paintMarks(source, [{ id: 'm', text: 'this passage' }]);
    expect(out).toContain('data-highlight="m"');
    expect(out).toContain('keep <span');
  });

  it('paints a passage that runs through a tag, without tearing the markup', () => {
    const out = paintMarks('<p>a <em>bold</em> claim</p>', [{ id: 'm', text: 'a bold claim' }]);
    // One span per run of text, so the <em> is still open and closed in order.
    expect(out.match(/data-highlight="m"/g)).toHaveLength(3);
    expect(out.indexOf('<em>')).toBeLessThan(out.indexOf('</em>'));
    expect(out).toContain('<em>');
    expect(out).toContain('</em>');
  });

  it('paints a passage written with entities in the source', () => {
    const out = paintMarks('<p>salt &amp; pepper</p>', [{ id: 'm', text: 'salt & pepper' }]);
    expect(out).toContain('data-highlight="m"');
    expect(out).toContain('&amp;');
  });

  it('still refuses a hit that only exists inside an attribute', () => {
    expect(paintMarks('<p title="a b">text</p>', [{ id: 'm', text: 'a b' }]))
      .toBe('<p title="a b">text</p>');
  });
});

describe('BookView — reflowable text', () => {
  it('shows the welcome state with no book', () => {
    renderView({ book: null });
    expect(screen.getByText('no book')).toBeTruthy();
  });

  it('renders the chapter', () => {
    renderView();
    expect(screen.getByText('첫 장')).toBeTruthy();
    expect(screen.getByText(/본문 텍스트/)).toBeTruthy();
  });

  it('applies the reading settings as CSS variables', () => {
    renderView({ settings: { ...DEFAULT_SETTINGS, fontScale: 2, readingWidth: 640, justify: true } });
    const pane = screen.getByTestId('bookview');
    expect(pane.style.getPropertyValue('--read-size')).toBe('34px');
    // The page is as wide as the text is large (see readingStyle).
    expect(pane.style.getPropertyValue('--read-width')).toBe('1280px');
    expect(pane.style.getPropertyValue('--read-align')).toBe('justify');
  });

  it('marks the pane as scrolling or paged, and as two columns', () => {
    const scroll = renderView();
    expect(screen.getByTestId('bookview').className).toContain('scrolling');
    scroll.unmount();
    renderView({ settings: { ...DEFAULT_SETTINGS, pageMode: 'paged', twoColumns: true } });
    expect(screen.getByTestId('bookview').className).toMatch(/paged/);
    expect(screen.getByTestId('bookview').className).toContain('view-double');
  });

  it('lays an EPUB out as two pages across the window', () => {
    renderView({
      settings: { ...DEFAULT_SETTINGS, viewLayout: 'double', columns: 1 },
    });
    const pane = screen.getByTestId('bookview');
    expect(pane.className).toContain('view-double');
    expect(pane.className).toContain('paged');
    expect(pane.className).not.toContain('scrolling');
    // Two facing pages, not the two-column split of one page.
    expect(pane.className).not.toContain('cols-2');
    expect(pane.style.getPropertyValue('--col-visible')).toBe('2');
  });

  it('keeps an ebook page one shape and scales it to the window', () => {
    renderView({ settings: { ...DEFAULT_SETTINGS, viewLayout: 'single' } });
    const pane = screen.getByTestId('bookview');
    expect(pane.style.width).toBe('520px');
    expect(pane.style.height).toBe('780px');
    expect(pane.style.getPropertyValue('--col-slot')).toBe('520px');
    expect(pane.parentElement.className).toContain('reflow-fit');
  });

  it('scales two facing pages as two of that same page', () => {
    renderView({ settings: { ...DEFAULT_SETTINGS, viewLayout: 'double' } });
    const pane = screen.getByTestId('bookview');
    expect(pane.style.width).toBe('1040px');
    expect(pane.style.height).toBe('780px');
    expect(pane.style.getPropertyValue('--col-slot')).toBe('520px');
  });

  it('puts two columns on one page, and on a continuous run, without becoming two pages', () => {
    const one = renderView({
      settings: { ...DEFAULT_SETTINGS, viewLayout: 'single', columns: 2, twoColumns: true },
    });
    const pane = screen.getByTestId('bookview');
    expect(pane.className).toContain('view-single');
    expect(pane.className).toContain('cols-2');
    expect(pane.className).not.toContain('view-double');
    expect(pane.style.getPropertyValue('--col-visible')).toBe('2');
    one.unmount();

    const run = renderView({
      settings: { ...DEFAULT_SETTINGS, viewLayout: 'continuous', columns: 2, twoColumns: true },
    });
    const scrolling = screen.getByTestId('bookview');
    expect(scrolling.className).toContain('view-continuous');
    expect(scrolling.className).toContain('scrolling');
    expect(scrolling.className).not.toContain('cols-2');
    expect(scrolling.style.getPropertyValue('--col-visible')).toBe('1');
    run.unmount();

    renderView({
      book: { reflowable: false, sectionCount: 2, sections: [], pdf: null },
      content: { kind: 'pdf', index: 0, page: 1, html: '' },
      settings: { ...DEFAULT_SETTINGS, viewLayout: 'single', columns: 2 },
    });
    expect(screen.getByTestId('bookview').className).not.toContain('cols-2');
    expect(screen.getByTestId('bookview').style.getPropertyValue('--col-visible')).toBe('1');
  });

  it('paints the highlights of this section', () => {
    renderView({
      marks: { highlights: [{ id: 'h1', section: 0, text: '본문 텍스트', color: 'blue' }], notes: [], bookmarks: [] },
    });
    expect(document.querySelector('[data-highlight="h1"]')).toBeTruthy();
  });

  it('leaves highlights off the page when they are hidden', () => {
    renderView({
      settings: { ...DEFAULT_SETTINGS, showHighlights: false },
      marks: { highlights: [{ id: 'h1', section: 0, text: '본문 텍스트', color: 'blue' }], notes: [], bookmarks: [] },
    });
    expect(document.querySelector('[data-highlight="h1"]')).toBeNull();
    expect(document.querySelector('[data-testid=chapter]').textContent).toContain('본문 텍스트');
  });

  it('marks the search hits', () => {
    renderView({ searchQuery: '본문' });
    expect(document.querySelectorAll('mark.find-hit').length).toBeGreaterThan(0);
  });

  it('follows an internal link with its anchor', () => {
    const { props } = renderView();
    fireEvent.click(screen.getByText('다음'));
    expect(props.onFollowLink).toHaveBeenCalledWith({ section: 2, anchor: 'part' });
  });

  it('hands an external link to the system browser', () => {
    const { props } = renderView();
    fireEvent.click(screen.getByText('web'));
    expect(props.onOpenExternal).toHaveBeenCalledWith('https://example.com');
  });

  it('asks for the context menu on a right click', () => {
    const { props } = renderView();
    fireEvent.contextMenu(screen.getByTestId('bookview'));
    expect(props.onContextMenu).toHaveBeenCalled();
  });

  it('changes the text size on Ctrl+wheel', () => {
    const { props } = renderView();
    fireEvent.wheel(screen.getByTestId('bookview'), { deltaY: -100, ctrlKey: true });
    expect(props.onTextStep).toHaveBeenCalledWith(1);
    fireEvent.wheel(screen.getByTestId('bookview'), { deltaY: 100, ctrlKey: true });
    expect(props.onTextStep).toHaveBeenCalledWith(-1);
  });

  it('leaves a plain wheel alone, so scrolling still scrolls', () => {
    const { props } = renderView();
    fireEvent.wheel(screen.getByTestId('bookview'), { deltaY: 100 });
    expect(props.onTextStep).not.toHaveBeenCalled();
  });

  it('reports the reading position as the pane scrolls', () => {
    const { props } = renderView();
    fireEvent.scroll(screen.getByTestId('bookview'));
    expect(props.onProgress).toHaveBeenCalled();
  });

  it('selects the whole chapter on request, and clears it again', () => {
    const { ref, props } = renderView();
    ref.current.selectAll();
    expect(props.onSelectionChange).toHaveBeenCalled();
    ref.current.clearSelection();
    expect(props.onSelectionChange).toHaveBeenLastCalledWith('');
  });

  it('reports where the reader is inside the section', () => {
    const { ref } = renderView();
    expect(ref.current.getFracY()).toBe(0);
    expect(() => ref.current.scrollToFrac(0.5)).not.toThrow();
    expect(ref.current.columnState()).toEqual({ pages: 1, page: 0 });
  });

  it('scrolls to an anchor without throwing when it is missing', () => {
    const { ref } = renderView();
    expect(() => ref.current.scrollToAnchor('h1')).not.toThrow();
    expect(() => ref.current.scrollToAnchor('nope')).not.toThrow();
  });

  it('shows the first page of a chapter once that chapter has arrived', () => {
    const { rerender, props } = renderView({
      settings: { ...DEFAULT_SETTINGS, pageMode: 'paged' },
      section: 1,
      content: { ...htmlContent, index: 1, html: '<p>The chapter being left</p>' },
    });
    const pane = screen.getByTestId('bookview');
    pane.scrollLeft = 500;
    // The section has changed, but the pane is still drawing the chapter that
    // was left. That offset must not be thrown away yet, and it must not be
    // applied to the chapter that is about to arrive.
    rerender(
      <BookView
        {...props}
        section={0}
        content={{ ...htmlContent, index: 1, html: '<p>The chapter being left</p>' }}
      />,
    );
    expect(pane.scrollLeft).toBe(500);
    rerender(
      <BookView
        {...props}
        section={0}
        content={{ ...htmlContent, index: 0, html: '<h1>첫 장</h1><p>처음</p>' }}
      />,
    );
    expect(pane.scrollLeft).toBe(0);
    expect(screen.getByTestId('chapter').textContent).toContain('첫 장');
  });

  it('opens a contents anchor on a whole page', () => {
    const { ref } = renderView({
      settings: { ...DEFAULT_SETTINGS, pageMode: 'paged' },
      content: { ...htmlContent, html: '<h1 id="h1">첫 장</h1><p id="later">나중</p>' },
    });
    const pane = screen.getByTestId('bookview');
    Object.defineProperty(pane, 'clientWidth', { configurable: true, value: 400 });
    Object.defineProperty(pane, 'scrollWidth', { configurable: true, value: 1200 });
    pane.scrollLeft = 0;
    pane.scrollTo = vi.fn(({ left }) => { pane.scrollLeft = left; });
    const later = pane.querySelector('#later');
    const paneLeft = pane.getBoundingClientRect().left;
    later.getClientRects = () => [{ left: paneLeft + 900, top: 0, width: 80, height: 20, right: paneLeft + 980, bottom: 20 }];
    act(() => { ref.current.scrollToAnchor('later'); });
    // 900px along a 400px page is the third page, which starts at 800.
    expect(pane.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: 800, behavior: 'auto' }));
  });

  it('shows a note when the chapter is empty', () => {
    renderView({ content: { ...htmlContent, html: '' } });
    expect(document.querySelector('.chapter-empty')).toBeTruthy();
  });

  it('treats content with no stated kind as markup', () => {
    // Every reflowable reader returns HTML; only comics and PDFs say otherwise.
    const { kind, ...withoutKind } = htmlContent;
    void kind;
    renderView({ content: withoutKind });
    expect(screen.getByTestId('chapter').textContent).toContain('본문 텍스트');
  });

  it('draws nothing at all while a section is still loading', () => {
    renderView({ content: null });
    expect(document.querySelector('[data-testid="chapter"]')).toBeNull();
    // An <img> with no source here would report a broken page to the reader.
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('.chapter-empty')).toBeTruthy();
  });

  it('reports the scale a fixed-layout page is drawn at', () => {
    const { props } = renderView({
      book: { reflowable: false, sectionCount: 1, sections: [{ label: '1' }], pdf: null },
      content: { kind: 'image', index: 0, src: 'blob:p', href: 'p.png', html: '' },
      settings: { ...DEFAULT_SETTINGS, zoomMode: 'custom', zoom: 1.5 },
    });
    expect(props.onScaleChange).toHaveBeenCalled();
  });
});

describe('BookView — background image', () => {
  it('paints the chosen picture behind the text at the chosen opacity', () => {
    renderView({
      settings: {
        ...DEFAULT_SETTINGS,
        backgroundImage: 'data:image/png;base64,AAAA',
        backgroundOpacity: 40,
        backgroundFit: 'contain',
      },
    });
    const pane = screen.getByTestId('bookview');
    expect(pane.className).toContain('has-bg');
    expect(pane.className).toContain('bg-contain');
    expect(pane.style.getPropertyValue('--bg-opacity')).toBe('0.4');
    expect(document.querySelector('.bookview-bg')).toBeTruthy();
  });

  it('paints no background layer when no picture is set', () => {
    renderView();
    expect(document.querySelector('.bookview-bg')).toBeNull();
  });
});

describe('BookView — comic pages', () => {
  const comic = { reflowable: false, sectionCount: 2, sections: [{ label: '1' }, { label: '2' }], pdf: null };
  const page = { kind: 'image', index: 0, src: 'blob:page1', href: 'page1.png', title: 'page1.png', html: '' };

  it('shows the page image', () => {
    renderView({ book: comic, content: page });
    expect(document.querySelector('img.comic-page').getAttribute('src')).toBe('blob:page1');
  });

  it('zooms with Ctrl+wheel instead of resizing text', () => {
    const { props } = renderView({ book: comic, content: page });
    fireEvent.wheel(screen.getByTestId('bookview'), { deltaY: -100, ctrlKey: true });
    expect(props.onZoomStep).toHaveBeenCalledWith(1);
    expect(props.onTextStep).not.toHaveBeenCalled();
  });

  it('inverts the page when night reading is on', () => {
    renderView({ book: comic, content: page, settings: { ...DEFAULT_SETTINGS, invertPages: true } });
    expect(screen.getByTestId('bookview').className).toContain('inverted');
  });

  it('reports a page image that cannot be decoded', () => {
    const { props } = renderView({ book: comic, content: page });
    fireEvent.error(document.querySelector('img.comic-page'));
    expect(props.onError).toHaveBeenCalled();
  });
});

describe('BookView — one page or two', () => {
  const comic = {
    reflowable: false,
    sectionCount: 4,
    sections: [{ label: '1' }, { label: '2' }, { label: '3' }, { label: '4' }],
    pdf: null,
    loadSection: (index) => ({ kind: 'image', index, src: `blob:p${index}`, href: `p${index}.png`, html: '' }),
  };
  const page = { kind: 'image', index: 0, src: 'blob:p0', href: 'p0.png', html: '' };

  it('shows one page by default', () => {
    renderView({ book: comic, content: page });
    expect(document.querySelectorAll('img.comic-page')).toHaveLength(1);
    expect(screen.getByTestId('bookview').className).toContain('one-up');
  });

  it('shows the facing page in a two-page spread', () => {
    renderView({
      book: comic,
      content: page,
      settings: { ...DEFAULT_SETTINGS, spread: 'double' },
    });
    const pages = document.querySelectorAll('img.comic-page');
    expect(pages).toHaveLength(2);
    expect(pages[1].getAttribute('src')).toBe('blob:p1');
    expect(screen.getByTestId('bookview').className).toContain('spread');
  });

  it('shows one page at the end of the book, where there is no facing page', () => {
    renderView({
      book: comic,
      content: { ...page, index: 3 },
      section: 3,
      settings: { ...DEFAULT_SETTINGS, spread: 'double' },
    });
    expect(document.querySelectorAll('img.comic-page')).toHaveLength(1);
  });

  it('puts two PDF pages side by side', () => {
    renderView({
      book: { reflowable: false, sectionCount: 6, sections: [], pdf: null },
      content: { kind: 'pdf', index: 0, page: 1, html: '' },
      settings: { ...DEFAULT_SETTINGS, spread: 'double' },
    });
    expect(document.querySelectorAll('.pdf-page')).toHaveLength(2);
    expect(document.querySelectorAll('.pdf-page')[1].getAttribute('data-page')).toBe('2');
  });

  it('follows the zoom mode for a picture', () => {
    const fit = renderView({
      book: comic,
      content: page,
      settings: { ...DEFAULT_SETTINGS, viewLayout: 'double', zoomMode: 'fit-width' },
    });
    expect(document.querySelector('img.comic-page').style.width).toBe('100%');
    fit.unmount();
    renderView({
      book: comic,
      content: page,
      settings: { ...DEFAULT_SETTINGS, zoomMode: 'actual' },
    });
    expect(document.querySelector('img.comic-page').style.width).toBe('auto');
  });

  it('fits a picture to the window by default, height and all', () => {
    renderView({ book: comic, content: page });
    const image = document.querySelector('img.comic-page');
    // Fit-window is the default: the picture is held inside the pane rather
    // than filling its width and running off the bottom.
    expect(image.style.width).not.toBe('100%');
    expect(image.style.maxWidth || image.style.maxHeight).toBeTruthy();
  });
});

describe('BookView — turning a page', () => {
  // A page has to be going away for there to be a turn: read as one continuous
  // column there is no turn, so these read a chapter a page at a time.
  const ONE_PAGE = { ...DEFAULT_SETTINGS, pageMode: 'paged' };

  it('runs the chosen effect when the reader moves on', () => {
    const view = renderView({ settings: { ...ONE_PAGE, pageTurn: 'flip' } });
    expect(screen.getByTestId('chapter').className).not.toContain('turning');
    view.rerender(undefined);
  });

  it('marks the page as turning, in the direction of travel', async () => {
    const { rerender, props } = renderView({ settings: { ...ONE_PAGE, pageTurn: 'slide' } });
    rerender(
      <BookView
        {...props}
        settings={{ ...ONE_PAGE, pageTurn: 'slide' }}
        section={1}
        content={{ ...htmlContent, index: 1 }}
      />
    );
    await waitFor(() => expect(document.querySelector('.chapter.turning')).toBeTruthy());
    expect(document.querySelector('.chapter').className).toContain('turn-slide');
    expect(document.querySelector('.chapter').className).toContain('turn-forward');
  });

  // A book turns the page that is being *left*, over the page that has arrived,
  // and the arrived page does not move: it is uncovered, not brought in. Moving
  // the arriving page instead is a new page sliding into view, which is not what
  // turning a page looks like — that is the bug these are here for.
  it('turns the page being left away over the new one, which stays still', async () => {
    const comic = {
      reflowable: false,
      sectionCount: 3,
      sections: [{ label: '1' }, { label: '2' }, { label: '3' }],
      pdf: null,
      loadSection: (index) => ({ kind: 'image', index, src: `blob:p${index}`, html: '' }),
    };
    const paged = { ...DEFAULT_SETTINGS, pageFlow: 'paged', pageTurn: 'slide' };
    const { rerender, props } = renderView({
      book: comic,
      content: { kind: 'image', index: 0, src: 'blob:p0', html: '' },
      settings: paged,
    });
    rerender(
      <BookView
        {...props}
        book={comic}
        settings={paged}
        section={1}
        content={{ kind: 'image', index: 1, src: 'blob:p1', html: '' }}
      />
    );

    const leaving = await waitFor(() => {
      const found = document.querySelector('[data-testid=turn-page]');
      expect(found).toBeTruthy();
      return found;
    });
    // What moves is a leaf cut to the page, carrying a copy of the page the
    // reader was on.
    expect(leaving.querySelector('.leaf-face.front img').getAttribute('src')).toBe('blob:p0');
    expect(leaving.querySelector('.turn-leaf').className).toContain('turn-slide');
    // The page underneath is the new one, and it carries no effect to move it.
    expect(document.querySelector('img.comic-page').getAttribute('src')).toBe('blob:p1');
  });

  it('gives text an effect only where a chapter is replaced, not where it scrolls', async () => {
    const paged = { ...ONE_PAGE, pageTurn: 'slide' };
    const { rerender, props } = renderView({ settings: paged });
    rerender(
      <BookView {...props} settings={paged} section={1} content={{ ...htmlContent, index: 1 }} />
    );
    await waitFor(() => expect(document.querySelector('.chapter.turning')).toBeTruthy());
    // A new chapter is put in place of the old one — nothing moves by itself,
    // so the effect stands in for the page going away.
    expect(document.querySelector('.chapter').className).toContain('turn-chapter');
  });

  it('turns the chapter being left away over the one that has arrived', async () => {
    const paged = { ...ONE_PAGE, pageTurn: 'slide' };
    const first = { ...htmlContent, index: 0, html: '<p>The chapter being left</p>' };
    const { rerender, props } = renderView({ settings: paged, content: first });
    rerender(
      <BookView
        {...props}
        settings={paged}
        section={1}
        content={{ ...htmlContent, index: 1, html: '<p>The chapter arriving</p>' }}
      />
    );

    const leaving = await waitFor(() => {
      const found = document.querySelector('[data-testid=turn-page]');
      expect(found).toBeTruthy();
      return found;
    });
    // What slides away is the chapter the reader was on. The window stays on
    // the page, so the slide cannot grow the pane.
    expect(leaving.querySelector('.turn-sheet').textContent).toContain('The chapter being left');
    expect(leaving.className).toContain('turn-slide');
    expect(leaving.querySelector('.turn-sheet').className).toContain('turn-slide');
    // The live chapter underneath is the new one, and it is never moved.
    expect(screen.getByTestId('chapter').textContent).toContain('The chapter arriving');
    expect(screen.getByTestId('chapter').className).not.toContain('turn-slide-move');
    // And the copy is out of the reader's way: not selectable, not clickable.
    expect(leaving.getAttribute('aria-hidden')).toBe('true');

    // Once the turn is over nothing of the old chapter is left on screen.
    await waitFor(
      () => expect(document.querySelector('[data-testid=turn-page]')).toBeNull(),
      { timeout: 2000 },
    );
  });

  it('turns the column being left over on the binding, as a PDF page does', async () => {
    const paged = { ...ONE_PAGE, pageTurn: 'flip' };
    const { ref } = renderView({
      settings: paged,
      content: { ...htmlContent, html: '<p>The page being left</p>' },
    });
    const pane = screen.getByTestId('bookview');
    Object.defineProperty(pane, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(pane, 'scrollWidth', { value: 2400, configurable: true });
    pane.scrollTo = vi.fn(({ left }) => { pane.scrollLeft = left; });
    fireEvent(window, new Event('resize'));

    let went;
    act(() => { went = ref.current.turnPage(1); });
    expect(went).toBe(true);
    // The pane is already on the column being landed on. The copy covers it.
    expect(pane.scrollLeft).toBe(800);

    const leaving = await waitFor(() => {
      const found = document.querySelector('[data-testid=turn-page]');
      expect(found).toBeTruthy();
      return found;
    });
    expect(leaving.className).toContain('turn-flip');
    expect(leaving.className).toContain('turn-forward');
    expect(leaving.textContent).toContain('The page being left');
    // As a PDF page turns: the leaf is the column just left, on its own sheet
    // of paper, and it goes over on the binding. The column being landed on
    // is the live pane underneath, and nothing is held over it.
    expect(leaving.querySelector('.turn-base')).toBeNull();
    expect(leaving.querySelector('.turn-sheet .leaf-face .chapter.leaving').style.transform).toContain('translate(0px');
    expect(leaving.style.left).toBe('800px');
    expect(leaving.style.width).toBe('800px');

    // Another turn before the first has finished starts again from where the
    // first one landed: that column is now the one being left.
    let again;
    act(() => { again = ref.current.turnPage(1); });
    expect(again).toBe(true);
    expect(pane.scrollLeft).toBe(1600);
    const next = await waitFor(() => {
      const found = document.querySelector('[data-testid=turn-page]');
      expect(found?.querySelector('.turn-sheet .leaf-face .chapter.leaving')?.style.transform)
        .toContain('translate(-800px');
      return found;
    });
    expect(next.style.left).toBe('1600px');
  });

  it('prints the page being landed on the back of a spread leaf', async () => {
    const comic = {
      reflowable: false,
      sectionCount: 4,
      sections: [{ label: '1' }, { label: '2' }, { label: '3' }, { label: '4' }],
      pdf: null,
      loadSection: (index) => ({ kind: 'image', index, src: `blob:p${index}`, html: '' }),
    };
    const paged = { ...DEFAULT_SETTINGS, pageFlow: 'paged', spread: 'double', pageTurn: 'flip' };
    const { rerender, props } = renderView({
      book: comic,
      content: { kind: 'image', index: 0, src: 'blob:p0', html: '' },
      settings: paged,
    });
    rerender(
      <BookView
        {...props}
        book={comic}
        settings={paged}
        section={2}
        content={{ kind: 'image', index: 2, src: 'blob:p2', html: '' }}
      />
    );

    const leaving = await waitFor(() => {
      const found = document.querySelector('[data-testid=turn-page]');
      expect(found).toBeTruthy();
      return found;
    });
    // Going forward, the right-hand page lifts. Its face is that page, the
    // left-hand page stays, and the back of the leaf is the new left-hand page
    // it comes down on.
    expect(leaving.querySelector('.leaf-face.front img').getAttribute('src')).toBe('blob:p1');
    expect(leaving.querySelector('.turn-stay img').getAttribute('src')).toBe('blob:p0');
    expect(leaving.querySelector('.leaf-face.back img').getAttribute('src')).toBe('blob:p2');
    expect(leaving.querySelector('.turn-leaf').className).toContain('half');
    expect(leaving.querySelector('.turn-leaf').className).toContain('forward');
  });

  it('runs nothing at all when the effect is off', async () => {
    const { rerender, props } = renderView({ settings: { ...ONE_PAGE, pageTurn: 'none' } });
    rerender(
      <BookView
        {...props}
        settings={{ ...ONE_PAGE, pageTurn: 'none' }}
        section={1}
        content={{ ...htmlContent, index: 1 }}
      />
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(document.querySelector('.chapter.turning')).toBeNull();
  });
});

describe('BookView — PDF pages', () => {
  it('puts a canvas and a text layer on the page', () => {
    renderView({
      book: { reflowable: false, sectionCount: 1, sections: [{ label: '1' }], pdf: null },
      content: { kind: 'pdf', index: 0, page: 1, html: '' },
    });
    expect(document.querySelector('canvas.pdf-canvas')).toBeTruthy();
    expect(document.querySelector('.textLayer')).toBeTruthy();
  });
});

describe('BookView — a continuous run of pages', () => {
  const comicBook = {
    reflowable: false,
    sectionCount: 6,
    sections: [1, 2, 3, 4, 5, 6].map((n) => ({ label: String(n) })),
    pdf: null,
    loadSection: (index) => ({ kind: 'image', index, src: `blob:p${index}`, href: `p${index}.png`, html: '' }),
  };
  const firstPage = { kind: 'image', index: 0, src: 'blob:p0', href: 'p0.png', html: '' };
  const flowing = { ...DEFAULT_SETTINGS, pageFlow: 'scroll' };

  /** Gives the slots a height, which jsdom does not lay out for itself. */
  function layOutSlots(height = 500) {
    const slots = [...document.querySelectorAll('.page-slot')];
    slots.forEach((slot, i) => {
      Object.defineProperty(slot, 'offsetTop', { value: i * height, configurable: true });
      Object.defineProperty(slot, 'offsetHeight', { value: height, configurable: true });
    });
    // The pane is as tall as the run it holds; a glide is kept inside that.
    const pane = document.querySelector('.bookview');
    Object.defineProperty(pane, 'scrollHeight', {
      value: slots.length * height, configurable: true,
    });
    return slots;
  }

  it('keeps a place in the run for every page of the book', () => {
    renderView({ book: comicBook, content: firstPage, settings: flowing });
    expect(screen.getByTestId('bookview').className).toContain('flowing');
    expect(document.querySelectorAll('.page-slot')).toHaveLength(6);
  });

  it('paints only the pages near the one being read', () => {
    renderView({ book: comicBook, content: firstPage, settings: flowing });
    // Two either side of the first page: three pages painted, six places kept.
    expect(document.querySelectorAll('img.comic-page')).toHaveLength(3);
    const painted = [...document.querySelectorAll('.page-slot')].map((s) => !!s.querySelector('img'));
    expect(painted).toEqual([true, true, true, false, false, false]);
  });

  it('keeps one page per place while the book is one continuous run', () => {
    renderView({
      book: comicBook,
      content: firstPage,
      // The old spread flag used to pair pages inside the run. A run and two
      // pages are one choice each, so the run stays one page wide.
      settings: { ...flowing, spread: 'double' },
    });
    expect(document.querySelectorAll('.page-slot')).toHaveLength(6);
    expect(document.querySelector('.page-slot').querySelectorAll('img.comic-page')).toHaveLength(1);
  });

  it('reports the page the reader has scrolled onto', () => {
    const { props } = renderView({ book: comicBook, content: firstPage, settings: flowing });
    layOutSlots(500);
    const pane = screen.getByTestId('bookview');
    Object.defineProperty(pane, 'clientHeight', { value: 400, configurable: true });
    pane.scrollTop = 1000;                // the third page
    fireEvent.scroll(pane);
    expect(props.onGoToPage).toHaveBeenCalledWith(2);
  });

  it('reports how far into the page the reader is, not into the whole run', () => {
    const { props } = renderView({ book: comicBook, content: firstPage, settings: flowing });
    layOutSlots(500);
    const pane = screen.getByTestId('bookview');
    Object.defineProperty(pane, 'clientHeight', { value: 400, configurable: true });
    pane.scrollTop = 1250;                // half way down the third page
    fireEvent.scroll(pane);
    expect(props.onProgress).toHaveBeenLastCalledWith(0.5);
  });

  it('turns to the top of the next page rather than part way down it', () => {
    const { ref } = renderView({ book: comicBook, content: firstPage, settings: flowing });
    const slots = layOutSlots(300);
    const pane = screen.getByTestId('bookview');
    Object.defineProperty(pane, 'clientHeight', { value: 400, configurable: true });
    pane.scrollTo = vi.fn(({ top }) => { pane.scrollTop = top; });
    expect(ref.current.turnPage(1)).toBe(true);
    // The whole page is already on screen, so the turn goes to the next one.
    expect(pane.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: slots[1].offsetTop }));
  });

  it('scrolls through a page taller than the window before turning', () => {
    const { ref } = renderView({ book: comicBook, content: firstPage, settings: flowing });
    layOutSlots(1200);
    const pane = screen.getByTestId('bookview');
    Object.defineProperty(pane, 'clientHeight', { value: 400, configurable: true });
    pane.scrollTo = vi.fn(({ top }) => { pane.scrollTop = top; });
    ref.current.turnPage(1);
    const { top } = pane.scrollTo.mock.calls[0][0];
    expect(top).toBeGreaterThan(0);
    expect(top).toBeLessThan(1200);
  });

  it('says there is nowhere left to go at the end of the run', () => {
    const { ref } = renderView({
      book: comicBook,
      content: { ...firstPage, index: 5 },
      section: 5,
      settings: flowing,
    });
    const slots = layOutSlots(300);
    const pane = screen.getByTestId('bookview');
    Object.defineProperty(pane, 'clientHeight', { value: 400, configurable: true });
    pane.scrollTop = slots[5].offsetTop;
    pane.scrollTo = vi.fn();
    expect(ref.current.turnPage(1)).toBe(false);
  });

  it('shows one page at a time when that is what was asked for', () => {
    renderView({
      book: comicBook,
      content: firstPage,
      settings: { ...DEFAULT_SETTINGS, pageFlow: 'paged' },
    });
    expect(screen.getByTestId('bookview').className).not.toContain('flowing');
    expect(document.querySelectorAll('.page-slot')).toHaveLength(0);
    expect(document.querySelectorAll('img.comic-page')).toHaveLength(1);
  });

  it('leaves reflowable text to its own setting', () => {
    renderView({ settings: { ...DEFAULT_SETTINGS, pageFlow: 'scroll' } });
    // A chapter is not a run of pages: pageFlow says nothing about it.
    expect(screen.getByTestId('bookview').className).not.toContain('flowing');
    expect(screen.getByTestId('chapter')).toBeTruthy();
  });
});

describe('BookView — selecting text', () => {
  const comicBook = {
    reflowable: false,
    sectionCount: 2,
    sections: [{ label: '1' }, { label: '2' }],
    pdf: null,
    loadSection: (index) => ({ kind: 'image', index, src: `blob:p${index}`, html: '' }),
  };

  it('selects the whole chapter of a reflowable book', () => {
    const { ref, props } = renderView();
    expect(ref.current.selectAll()).toBe(true);
    expect(props.onSelectionChange).toHaveBeenCalled();
    expect(ref.current.hasText()).toBe(true);
  });

  it('has nothing to select in a comic, and says so rather than doing nothing', () => {
    const { ref } = renderView({
      book: comicBook,
      content: { kind: 'image', index: 0, src: 'blob:p0', html: '' },
    });
    expect(ref.current.hasText()).toBe(false);
    expect(ref.current.selectAll()).toBe(false);
  });

  it('selects the words of a PDF page from its text layer', () => {
    const { ref } = renderView({
      book: { reflowable: false, sectionCount: 1, sections: [{ label: '1' }], pdf: null },
      content: { kind: 'pdf', index: 0, page: 1, html: '' },
    });
    // pdf.js fills the layer in; with no worker in the test it is filled here.
    const layer = document.querySelector('.textLayer');
    const span = document.createElement('span');
    span.textContent = 'PDF 안의 글자';
    layer.append(span);
    expect(ref.current.hasText()).toBe(true);
    expect(ref.current.selectAll()).toBe(true);
  });
});

describe('BookView — picking a picture', () => {
  const comicBook = {
    reflowable: false,
    sectionCount: 2,
    sections: [{ label: '1' }, { label: '2' }],
    pdf: null,
    loadSection: (index) => ({ kind: 'image', index, src: `blob:p${index}`, html: '' }),
  };
  const comicPage = { kind: 'image', index: 0, src: 'blob:p0', html: '', title: 'page1.png' };

  it('marks the comic page the reader clicked, and reports it', () => {
    const { props } = renderView({ book: comicBook, content: comicPage });
    const image = document.querySelector('img.comic-page');
    fireEvent.pointerDown(image, { button: 0 });
    expect(image.classList.contains('picked')).toBe(true);
    expect(props.onPickImage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'page', name: 'page1.png' }));
  });

  it('lets the picture go again when the reader clicks away', () => {
    const { props } = renderView({ book: comicBook, content: comicPage });
    const image = document.querySelector('img.comic-page');
    fireEvent.pointerDown(image, { button: 0 });
    fireEvent.pointerDown(screen.getByTestId('bookview'), { button: 0 });
    expect(image.classList.contains('picked')).toBe(false);
    expect(props.onPickImage).toHaveBeenLastCalledWith(null);
  });

  it('does not mark a PDF page as a picture when the page is clicked', () => {
    const { props } = renderView({
      book: { reflowable: false, sectionCount: 1, sections: [{ label: '1' }], pdf: null },
      content: { kind: 'pdf', index: 0, page: 1, html: '' },
    });
    const layer = document.querySelector('.textLayer');
    fireEvent.pointerDown(layer, { button: 0 });
    const canvas = document.querySelector('canvas.pdf-canvas');
    fireEvent.pointerDown(canvas, { button: 0 });
    expect(canvas.classList.contains('picked')).toBe(false);
    expect(document.querySelector('[data-testid=picked-mark]')).toBeNull();
    expect(props.onPickImage).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'pdf' }));
  });

  it('leaves the page alone when the reader clicks the words on it', () => {
    const { props } = renderView({
      book: { reflowable: false, sectionCount: 1, sections: [{ label: '1' }], pdf: null },
      content: { kind: 'pdf', index: 0, page: 1, html: '' },
    });
    const layer = document.querySelector('.textLayer');
    const span = document.createElement('span');
    span.textContent = '글자';
    layer.append(span);
    fireEvent.pointerDown(span, { button: 0 });
    expect(document.querySelector('canvas.pdf-canvas').classList.contains('picked')).toBe(false);
    expect(props.onPickImage).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'pdf' }));
  });

  it('picks a picture inside the text of a chapter', () => {
    renderView({
      content: { ...htmlContent, html: '<p>글</p><img src="blob:fig" alt="그림 1">' },
    });
    const figure = document.querySelector('.chapter img');
    fireEvent.pointerDown(figure, { button: 0 });
    expect(figure.classList.contains('picked')).toBe(true);
  });
});

describe('BookView — a spread meets the window', () => {
  const comicBook = {
    reflowable: false,
    sectionCount: 3,
    sections: [{ label: '1' }, { label: '2' }, { label: '3' }],
    pdf: null,
    loadSection: (index) => ({ kind: 'image', index, src: `blob:p${index}`, html: '' }),
  };
  const page = { kind: 'image', index: 0, src: 'blob:p0', html: '' };

  it('creases the binding only where two pages actually meet', () => {
    const two = renderView({
      book: comicBook,
      content: page,
      settings: { ...DEFAULT_SETTINGS, spread: 'double' },
    });
    expect(document.querySelector('.page-spread').className).toContain('two-up');
    two.unmount();
    // The last page of an odd book has nothing facing it: no crease.
    renderView({
      book: comicBook,
      content: { ...page, index: 2 },
      section: 2,
      settings: { ...DEFAULT_SETTINGS, spread: 'double' },
    });
    expect(document.querySelector('.page-spread').className).not.toContain('two-up');
  });
});

describe('BookView — turning several pages in a row', () => {
  it('runs the effect on every turn, not on every other one', async () => {
    const paged = { ...DEFAULT_SETTINGS, pageMode: 'paged', pageTurn: 'slide' };
    const { rerender, props } = renderView({ settings: paged });
    const turnTo = async (section) => {
      rerender(
        <BookView
          {...props}
          settings={paged}
          section={section}
          content={{ ...htmlContent, index: section }}
        />
      );
      await waitFor(() => expect(document.querySelector('.chapter.turning')).toBeTruthy());
    };
    await turnTo(1);
    // Straight on to the next one: the second turn used to be swallowed by the
    // window that kept one chapter change from counting as two turns.
    await turnTo(2);
    expect(document.querySelector('.chapter').className).toContain('turn-forward');
  });
});

describe('BookView — coming back to a page in a run', () => {
  const comicBook = {
    reflowable: false,
    sectionCount: 6,
    sections: [1, 2, 3, 4, 5, 6].map((n) => ({ label: String(n) })),
    pdf: null,
    loadSection: (index) => ({ kind: 'image', index, src: `blob:p${index}`, html: '' }),
  };
  const flowing = { ...DEFAULT_SETTINGS, pageFlow: 'scroll' };

  it('opens the run at the page the reader was last on', () => {
    renderView({
      book: comicBook,
      content: { kind: 'image', index: 4, src: 'blob:p4', html: '' },
      section: 4,
      settings: flowing,
    });
    const pane = screen.getByTestId('bookview');
    const slots = [...document.querySelectorAll('.page-slot')];
    slots.forEach((slot, i) => {
      Object.defineProperty(slot, 'offsetTop', { value: i * 400, configurable: true });
      Object.defineProperty(slot, 'offsetHeight', { value: 400, configurable: true });
    });
    // The pane is re-measured when the pages are, which is what lines the run up
    // on the page being read rather than on the top of the book.
    Object.defineProperty(pane, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(pane, 'clientHeight', { value: 400, configurable: true });
    fireEvent(window, new Event('resize'));
    expect(pane.scrollTop).toBe(4 * 400);
  });

  it('does not take the reader back once they have scrolled', () => {
    const { props } = renderView({
      book: comicBook,
      content: { kind: 'image', index: 0, src: 'blob:p0', html: '' },
      settings: flowing,
    });
    const pane = screen.getByTestId('bookview');
    const slots = [...document.querySelectorAll('.page-slot')];
    slots.forEach((slot, i) => {
      Object.defineProperty(slot, 'offsetTop', { value: i * 400, configurable: true });
      Object.defineProperty(slot, 'offsetHeight', { value: 400, configurable: true });
    });
    Object.defineProperty(pane, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(pane, 'clientHeight', { value: 350, configurable: true });
    pane.scrollTop = 250;                        // part way down the first page
    fireEvent.scroll(pane);
    fireEvent(window, new Event('resize'));
    expect(pane.scrollTop).toBe(250);
    expect(props.onGoToPage).not.toHaveBeenCalled();
  });
});

describe('BookView — reading a chapter forwards and back', () => {
  /** Lays a chapter out as something taller than the window. */
  function tall(view, { height = 400, content = 1200 } = {}) {
    const pane = screen.getByTestId('bookview');
    Object.defineProperty(pane, 'clientHeight', { value: height, configurable: true });
    Object.defineProperty(pane, 'scrollHeight', { value: content, configurable: true });
    pane.scrollTo = vi.fn(({ top }) => { pane.scrollTop = top; });
    return pane;
  }

  it('scrolls down the chapter before saying there is nowhere left to go', () => {
    const { ref } = renderView();
    const pane = tall();
    expect(ref.current.turnPage(1)).toBe(true);
    expect(pane.scrollTop).toBeGreaterThan(0);
  });

  it('turns two pages for two presses, even mid-glide', () => {
    const { ref } = renderView();
    const pane = tall();
    // A smooth scroll is still on its way when the second press arrives, so the
    // live scroll position is not where the pane is heading. Reading it was how
    // two presses used to turn one page.
    pane.scrollTo = vi.fn();
    ref.current.turnPage(1);
    const first = pane.scrollTo.mock.calls[0][0].top;
    ref.current.turnPage(1);
    const second = pane.scrollTo.mock.calls[1][0].top;
    expect(second).toBeGreaterThan(first);
    expect(second).toBe(Math.min(1200 - 400, first * 2));
  });

  it('says there is nowhere left to go at the foot of the chapter', () => {
    const { ref } = renderView();
    const pane = tall();
    pane.scrollTop = 800;                     // 1200 of content in a 400 window
    expect(ref.current.turnPage(1)).toBe(false);
  });

  it('says there is nowhere left to go at the head of the chapter', () => {
    const { ref } = renderView();
    tall();
    expect(ref.current.turnPage(-1)).toBe(false);
  });

  it('opens the chapter before this one at its end, not its start', async () => {
    const { ref, rerender, props } = renderView();
    const pane = tall();
    // Nowhere back to go inside this chapter: the reader is turning into the one
    // before it, and asks to arrive at its end.
    expect(ref.current.turnPage(-1)).toBe(false);
    ref.current.arriveAtEnd();
    rerender(
      <BookView {...props} section={0} content={{ ...htmlContent, index: 0, html: '<p>이전 장</p>' }} />
    );
    await waitFor(() => expect(pane.scrollTop).toBe(1200 - 400));
  });

  it('opens a chapter reached any other way at its start', async () => {
    const { rerender, props } = renderView();
    const pane = tall();
    pane.scrollTop = 500;
    rerender(
      <BookView {...props} section={2} content={{ ...htmlContent, index: 2, html: '<p>다음 장</p>' }} />
    );
    await waitFor(() => expect(pane.scrollTop).toBe(0));
  });
});

describe('BookView — one page at a time, to the last page', () => {
  /** A chapter whose columns come to 2.4 screens. */
  function columns(pane, { width = 1000, content = 2400 } = {}) {
    Object.defineProperty(pane, 'clientWidth', { value: width, configurable: true });
    Object.defineProperty(pane, 'scrollWidth', { value: content, configurable: true });
    pane.scrollTo = vi.fn(({ left }) => { pane.scrollLeft = Math.min(left, content - width); });
    return pane;
  }

  const onePage = { ...DEFAULT_SETTINGS, pageMode: 'paged' };

  it('counts the part-page at the end as a page, and reaches it', () => {
    const { ref, props } = renderView({ settings: { ...onePage, pageTurn: 'none' } });
    const pane = columns(screen.getByTestId('bookview'));
    fireEvent(window, new Event('resize'));
    expect(props.onPageInfo).toHaveBeenLastCalledWith({ pages: 3, page: 0, atStart: true, atEnd: false });

    // A press at a time, each one settled before the next — as a key press is.
    const press = (dir) => { let went; act(() => { went = ref.current.turnPage(dir); }); return went; };
    expect(press(1)).toBe(true);
    expect(pane.scrollLeft).toBe(1000);
    expect(press(1)).toBe(true);
    // The third page starts where the pane can reach, not a whole width along.
    expect(pane.scrollLeft).toBe(1400);
    expect(ref.current.columnState().page).toBe(2);
    // And only then is the chapter over.
    expect(press(1)).toBe(false);
  });

  it('turns one facing page when two are showing', async () => {
    const { ref, props } = renderView({
      settings: { ...DEFAULT_SETTINGS, viewLayout: 'double', pageMode: 'paged', pageTurn: 'slide' },
    });
    const pane = columns(screen.getByTestId('bookview'), { width: 1000, content: 2400 });
    fireEvent(window, new Event('resize'));
    expect(props.onPageInfo).toHaveBeenLastCalledWith({ pages: 4, page: 0, atStart: true, atEnd: false });
    let went;
    act(() => { went = ref.current.turnPage(1); });
    expect(went).toBe(true);
    // Already the next facing page. The copy is the spread that was just left.
    expect(pane.scrollLeft).toBe(500);
    const sheet = await waitFor(() => {
      const found = document.querySelector('.turn-sheet');
      expect(found).toBeTruthy();
      return found;
    });
    expect(sheet.className).toContain('turn-half');
    expect(sheet.className).toContain('turn-forward');
    expect(sheet.querySelector('.chapter.leaving').style.transform).toContain('translate(0px');
  });

  it('turns the right-hand page of a spread over to the left', async () => {
    const { ref } = renderView({
      settings: { ...DEFAULT_SETTINGS, viewLayout: 'double', pageMode: 'paged', pageTurn: 'flip' },
      content: { ...htmlContent, html: '<p>The page being left</p>' },
    });
    const pane = columns(screen.getByTestId('bookview'), { width: 1000, content: 2400 });
    fireEvent(window, new Event('resize'));
    let went;
    act(() => { went = ref.current.turnPage(1); });
    expect(went).toBe(true);
    expect(pane.scrollLeft).toBe(500);

    const layer = await waitFor(() => {
      const found = document.querySelector('[data-testid=turn-page]');
      expect(found).toBeTruthy();
      return found;
    });
    const sheet = layer.querySelector('.turn-sheet');
    expect(sheet.className).toContain('turn-half');
    expect(sheet.className).toContain('turn-forward');
    // The leaf is the page the reader is looking at — the right-hand page of
    // the spread being left, which is one page along from its left edge. It
    // turns away over the gutter, and what it uncovers is the spread that has
    // already arrived underneath, so there is no held ground at all.
    expect(layer.querySelector('.turn-base')).toBeNull();
    const leaf = sheet.querySelector('.leaf-face.front .chapter.leaving');
    expect(leaf.style.transform).toContain('translate(-500px');
    expect(leaf.textContent).toContain('The page being left');
    // A leaf of a spread has a back, so it goes the whole way over instead of
    // disappearing as it stands upright. It carries the same page across.
    const back = sheet.querySelector('.leaf-face.back .chapter.leaving');
    expect(back.style.transform).toContain('translate(-500px');
    // And the page that is *not* turning is held where it was, so the spread
    // does not change under the reader before the leaf has come down.
    const stay = layer.querySelector('.turn-stay.left .chapter.leaving');
    expect(stay.style.transform).toContain('translate(0px');
    expect(layer.querySelector('.turn-stay.right')).toBeNull();
  });

  it('turns one facing page for each click, even when the clicks land together', async () => {
    const { ref } = renderView({
      settings: { ...DEFAULT_SETTINGS, viewLayout: 'double', pageMode: 'paged', pageTurn: 'flip' },
      content: { ...htmlContent, html: '<p>The page being left</p>' },
    });
    const pane = columns(screen.getByTestId('bookview'), { width: 1000, content: 2400 });
    fireEvent(window, new Event('resize'));
    act(() => {
      ref.current.turnPage(1);
      ref.current.turnPage(1);
    });
    // Two clicks, two facing pages. A click that arrived before the first had
    // been drawn used to leave both of them on the same page.
    expect(pane.scrollLeft).toBe(1000);
    const layer = await waitFor(() => {
      const found = document.querySelector('[data-testid=turn-page]');
      expect(found).toBeTruthy();
      return found;
    });
    const sheet = layer.querySelector('.turn-sheet');
    expect(sheet.className).toContain('turn-half');
    expect(sheet.className).toContain('turn-forward');
    // The leaf is the right-hand page of the spread the second click left,
    // which stood at 500 — so the page that turns is the one at 1000.
    expect(layer.querySelector('.turn-base')).toBeNull();
    expect(sheet.querySelector('.leaf-face.front .chapter.leaving').style.transform).toContain('translate(-1000px');
  });

  it('turns one facing page when the stored page count is still the empty pane', () => {
    const { ref } = renderView({
      settings: { ...DEFAULT_SETTINGS, viewLayout: 'double', pageMode: 'paged', pageTurn: 'flip' },
    });
    const pane = screen.getByTestId('bookview');
    // No resize: the count taken while the pane measured nothing is still one
    // page. The chapter has since laid out several pages wide.
    Object.defineProperty(pane, 'clientWidth', { value: 1000, configurable: true });
    Object.defineProperty(pane, 'scrollWidth', { value: 2400, configurable: true });
    pane.scrollTo = vi.fn(({ left }) => { pane.scrollLeft = left; });
    let went;
    act(() => { went = ref.current.turnPage(1); });
    expect(went).toBe(true);
    expect(pane.scrollLeft).toBe(500);
  });

  it('turns one page of the spread when the next chapter opens', async () => {
    const settings = { ...DEFAULT_SETTINGS, viewLayout: 'double', pageMode: 'paged', pageTurn: 'flip' };
    const first = { ...htmlContent, index: 0, html: '<p>The spread being left</p>' };
    const { rerender, props, ref } = renderView({ settings, content: first });
    const pane = columns(screen.getByTestId('bookview'), { width: 1000, content: 1000 });
    fireEvent(window, new Event('resize'));
    pane.scrollLeft = 400;
    let went;
    act(() => { went = ref.current.turnPage(1); });
    expect(went).toBe(false);

    rerender(
      <BookView
        {...props}
        settings={settings}
        section={1}
        content={{ ...htmlContent, index: 1, html: '<p>The chapter arriving</p>' }}
      />
    );
    const layer = await waitFor(() => {
      const found = document.querySelector('[data-testid=turn-page]');
      expect(found).toBeTruthy();
      return found;
    });
    const sheet = layer.querySelector('.turn-sheet');
    expect(sheet.className).toContain('turn-half');
    expect(sheet.className).toContain('turn-forward');
    // The leaf is the right-hand page of the spread being left, at the place
    // the turn saved — 400, plus one page. The chapter that has arrived is
    // the live pane underneath, uncovered as the leaf goes over.
    expect(layer.querySelector('.turn-base')).toBeNull();
    const leaf = sheet.querySelector('.leaf-face.front .chapter.leaving');
    expect(leaf.style.transform).toContain('translate(-900px');
    expect(leaf.textContent).toContain('The spread being left');
  });

  it('calls the far end of the chapter the last page as the reader scrolls', () => {
    const { props } = renderView({ settings: onePage });
    const pane = columns(screen.getByTestId('bookview'));
    fireEvent(window, new Event('resize'));
    pane.scrollLeft = 1400;                 // as far as 2.4 screens will scroll
    fireEvent.scroll(pane);
    expect(props.onPageInfo).toHaveBeenLastCalledWith({ pages: 3, page: 2, atStart: false, atEnd: true });
  });

  it('opens the chapter before this one on its last page', async () => {
    const { ref, rerender, props } = renderView({ settings: onePage });
    const pane = columns(screen.getByTestId('bookview'));
    fireEvent(window, new Event('resize'));
    expect(ref.current.turnPage(-1)).toBe(false);
    ref.current.arriveAtEnd();
    rerender(
      <BookView {...props} settings={onePage} section={0} content={{ ...htmlContent, index: 0, html: '<p>이전 장</p>' }} />
    );
    await waitFor(() => expect(pane.scrollLeft).toBe(1400));
  });
});

describe('BookView — saying what is selected on the page', () => {
  const comicBook = {
    reflowable: false,
    sectionCount: 2,
    sections: [{ label: '1' }, { label: '2' }],
    pdf: null,
    loadSection: (index) => ({ kind: 'image', index, src: `blob:p${index}`, html: '' }),
  };
  const comicPage = { kind: 'image', index: 0, src: 'blob:p0', html: '', title: 'page1.png' };

  /** jsdom lays nothing out, so the picture is told what box it occupies. */
  function boxed(node, box) {
    node.getBoundingClientRect = () => ({
      left: box.left, top: box.top, width: box.width, height: box.height,
      right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top,
    });
    Object.defineProperty(node, 'clientWidth', { value: box.width, configurable: true });
    Object.defineProperty(node, 'clientHeight', { value: box.height, configurable: true });
  }

  it('draws a frame over the picked picture, and nothing else', () => {
    renderView({ book: comicBook, content: comicPage });
    const pane = screen.getByTestId('bookview');
    boxed(pane, { left: 0, top: 0, width: 900, height: 700 });
    const image = document.querySelector('img.comic-page');
    boxed(image, { left: 100, top: 60, width: 400, height: 300 });
    Object.defineProperty(image, 'naturalWidth', { value: 800, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 600, configurable: true });
    fireEvent.pointerDown(image, { button: 0 });

    const mark = screen.getByTestId('picked-mark');
    expect(mark.style.left).toBe('100px');
    expect(mark.style.top).toBe('60px');
    expect(mark.style.width).toBe('400px');
    expect(mark.style.height).toBe('300px');
    // The frame is the whole of it. A caption over the page saying a picture
    // was selected only repeated what the frame already shows.
    expect(mark.textContent).toBe('');
    expect(mark.querySelector('*')).toBeNull();
  });

  it('takes the mark away when the picture is let go of', () => {
    renderView({ book: comicBook, content: comicPage });
    const pane = screen.getByTestId('bookview');
    boxed(pane, { left: 0, top: 0, width: 900, height: 700 });
    const image = document.querySelector('img.comic-page');
    boxed(image, { left: 0, top: 0, width: 400, height: 300 });
    fireEvent.pointerDown(image, { button: 0 });
    expect(screen.getByTestId('picked-mark')).toBeTruthy();
    fireEvent.pointerDown(pane, { button: 0 });
    expect(document.querySelector('[data-testid=picked-mark]')).toBeNull();
  });
});

describe('BookView — a bookmark on a spot', () => {
  /** jsdom lays nothing out, so the chapter is told what box it occupies. */
  function boxed(node, box) {
    node.getBoundingClientRect = () => ({
      left: box.left, top: box.top, width: box.width, height: box.height,
      right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top,
    });
    Object.defineProperty(node, 'clientWidth', { value: box.width, configurable: true });
    Object.defineProperty(node, 'clientHeight', { value: box.height, configurable: true });
  }

  it('turns a point on the screen into a place in the chapter', () => {
    const { ref } = renderView();
    boxed(screen.getByTestId('bookview'), { left: 0, top: 0, width: 800, height: 600 });
    boxed(screen.getByTestId('chapter'), { left: 100, top: 50, width: 400, height: 1000 });
    const place = ref.current.placeAt(300, 300);
    // A quarter across the chapter and a quarter down it.
    expect(place.spot.x).toBeCloseTo(0.5, 2);
    expect(place.spot.y).toBeCloseTo(0.25, 2);
  });

  it('keeps a point inside the chapter however far outside it was clicked', () => {
    const { ref } = renderView();
    boxed(screen.getByTestId('bookview'), { left: 0, top: 0, width: 800, height: 600 });
    boxed(screen.getByTestId('chapter'), { left: 100, top: 50, width: 400, height: 1000 });
    expect(ref.current.placeAt(-500, -500).spot).toEqual({ x: 0, y: 0 });
    expect(ref.current.placeAt(9000, 9000).spot).toEqual({ x: 1, y: 1 });
  });

  it('draws a pin where the bookmark was placed', () => {
    const marks = {
      highlights: [],
      notes: [],
      bookmarks: [{ id: 'b1', section: 0, label: '여기', fracY: 0.25, spot: { x: 0.5, y: 0.25 } }],
    };
    const view = renderView({ marks });
    boxed(screen.getByTestId('bookview'), { left: 0, top: 0, width: 800, height: 600 });
    boxed(screen.getByTestId('chapter'), { left: 100, top: 50, width: 400, height: 1000 });
    // The pane is measured again when it is laid out.
    fireEvent(window, new Event('resize'));
    const pin = screen.getByTestId('bookmark-pin');
    expect(pin.style.left).toBe('300px');
    expect(pin.style.top).toBe('300px');
    expect(pin.textContent).toBe('여기');
    view.unmount();
  });

  it('draws no pin for a bookmark that was not placed anywhere in particular', () => {
    renderView({
      marks: { highlights: [], notes: [], bookmarks: [{ id: 'b2', section: 0, label: '장', fracY: 0.5 }] },
    });
    fireEvent(window, new Event('resize'));
    expect(document.querySelector('[data-testid=bookmark-pin]')).toBeNull();
  });
});

describe('BookView — the guard that keeps a PDF selection to itself', () => {
  const pdfBook = { reflowable: false, sectionCount: 2, sections: [{ label: '1' }, { label: '2' }], pdf: null };
  const pdfPage = { kind: 'pdf', index: 0, page: 1, html: '' };

  /** A text layer with words in it, as pdf.js would leave it. */
  function withWords() {
    const layer = document.querySelector('.textLayer');
    const span = document.createElement('span');
    span.textContent = '글자';
    layer.append(span);
    const guard = document.createElement('div');
    guard.className = 'endOfContent';
    layer.append(guard);
    return { layer, span, guard };
  }

  it('leaves the guard parked at the foot of the page while nothing is being dragged', () => {
    renderView({ book: pdfBook, content: pdfPage });
    const { layer, guard } = withWords();
    fireEvent(document, new Event('selectionchange'));
    expect(layer.classList.contains('selecting')).toBe(false);
    expect(guard.nextSibling).toBeNull();
  });

  it('arms the guard beside the words being dragged over, and parks it again after', () => {
    renderView({ book: pdfBook, content: pdfPage });
    const { layer, span, guard } = withWords();

    // A press on the words is the start of a drag over them.
    fireEvent.pointerDown(span, { button: 0 });
    const range = document.createRange();
    range.setStart(span.firstChild, 0);
    range.setEnd(span.firstChild, 1);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent(document, new Event('selectionchange'));

    expect(layer.classList.contains('selecting')).toBe(true);
    // Beside the end of the selection, so the empty space around the words
    // belongs to the guard instead of to text elsewhere on the page.
    expect(span.nextSibling).toBe(guard);

    fireEvent.pointerUp(document);
    expect(layer.classList.contains('selecting')).toBe(false);
    expect(guard.nextSibling).toBeNull();
  });
});

describe('BookView — the wheel', () => {
  const ONE_PAGE = { ...DEFAULT_SETTINGS, pageMode: 'paged' };

  /** Tells the pane how much of it there is to scroll. */
  function room(pane, { height = 400, content = 400 } = {}) {
    Object.defineProperty(pane, 'clientHeight', { value: height, configurable: true });
    Object.defineProperty(pane, 'scrollHeight', { value: content, configurable: true });
    return pane;
  }

  it('turns the page when there is nothing to scroll', () => {
    const { props } = renderView({ settings: ONE_PAGE });
    const pane = room(screen.getByTestId('bookview'));
    fireEvent.wheel(pane, { deltaY: 120 });
    expect(props.onTurnPage).toHaveBeenCalledWith(1);
  });

  it('turns back when the wheel goes the other way', () => {
    const { props } = renderView({ settings: ONE_PAGE });
    const pane = room(screen.getByTestId('bookview'));
    fireEvent.wheel(pane, { deltaY: -120 });
    expect(props.onTurnPage).toHaveBeenCalledWith(-1);
  });

  it('does not turn on a nudge too small to mean it', () => {
    const { props } = renderView({ settings: ONE_PAGE });
    const pane = room(screen.getByTestId('bookview'));
    fireEvent.wheel(pane, { deltaY: 12 });
    expect(props.onTurnPage).not.toHaveBeenCalled();
    // Though several nudges the same way do add up to a turn.
    fireEvent.wheel(pane, { deltaY: 12 });
    fireEvent.wheel(pane, { deltaY: 12 });
    fireEvent.wheel(pane, { deltaY: 12 });
    fireEvent.wheel(pane, { deltaY: 12 });
    expect(props.onTurnPage).toHaveBeenCalledWith(1);
  });

  it('turns one page for one flick, not a dozen', () => {
    const { props } = renderView({ settings: ONE_PAGE });
    const pane = room(screen.getByTestId('bookview'));
    // What a trackpad sends for a single flick: many events in quick succession.
    for (let i = 0; i < 20; i += 1) fireEvent.wheel(pane, { deltaY: 40 });
    expect(props.onTurnPage).toHaveBeenCalledTimes(1);
  });

  it('scrolls a page taller than the window before turning it', () => {
    const { props } = renderView({ settings: ONE_PAGE });
    const pane = room(screen.getByTestId('bookview'), { height: 400, content: 1200 });
    pane.scrollTop = 0;
    fireEvent.wheel(pane, { deltaY: 200 });
    // There is more of this page to see: the pane scrolls it the ordinary way.
    expect(props.onTurnPage).not.toHaveBeenCalled();

    pane.scrollTop = 800;
    fireEvent.wheel(pane, { deltaY: 200 });
    expect(props.onTurnPage).toHaveBeenCalledWith(1);
  });

  it('leaves the wheel alone when the book is read as one continuous thing', () => {
    const { props } = renderView({ settings: { ...DEFAULT_SETTINGS, pageMode: 'scroll' } });
    const pane = room(screen.getByTestId('bookview'));
    fireEvent.wheel(pane, { deltaY: 400 });
    expect(props.onTurnPage).not.toHaveBeenCalled();
  });

  it('still resizes the text when the wheel is held with Ctrl', () => {
    const { props } = renderView({ settings: ONE_PAGE });
    const pane = room(screen.getByTestId('bookview'));
    fireEvent.wheel(pane, { deltaY: -120, ctrlKey: true });
    expect(props.onTextStep).toHaveBeenCalledWith(1);
    expect(props.onTurnPage).not.toHaveBeenCalled();
  });

  it('counts a wheel that reports lines rather than pixels', () => {
    const { props } = renderView({ settings: ONE_PAGE });
    const pane = room(screen.getByTestId('bookview'));
    // deltaMode 1 is lines: three of them is a notch on most mice.
    fireEvent.wheel(pane, { deltaY: 3, deltaMode: 1 });
    expect(props.onTurnPage).toHaveBeenCalledWith(1);
  });
});
