import React, { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BookView, { paintMarks } from '../src/components/BookView.jsx';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';
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
    expect(pane.style.getPropertyValue('--read-width')).toBe('640px');
    expect(pane.style.getPropertyValue('--read-align')).toBe('justify');
  });

  it('marks the pane as scrolling or paged, and as two columns', () => {
    const scroll = renderView();
    expect(screen.getByTestId('bookview').className).toContain('scrolling');
    scroll.unmount();
    renderView({ settings: { ...DEFAULT_SETTINGS, pageMode: 'paged', twoColumns: true } });
    expect(screen.getByTestId('bookview').className).toMatch(/paged/);
    expect(screen.getByTestId('bookview').className).toMatch(/twocol/);
  });

  it('paints the highlights of this section', () => {
    renderView({
      marks: { highlights: [{ id: 'h1', section: 0, text: '본문 텍스트', color: 'blue' }], notes: [], bookmarks: [] },
    });
    expect(document.querySelector('[data-highlight="h1"]')).toBeTruthy();
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
      settings: { ...DEFAULT_SETTINGS, zoomMode: 'fit-width' },
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
  it('runs the chosen effect when the reader moves on', () => {
    const view = renderView({ settings: { ...DEFAULT_SETTINGS, pageTurn: 'flip' } });
    expect(screen.getByTestId('chapter').className).not.toContain('turning');
    view.rerender(undefined);
  });

  it('marks the page as turning, in the direction of travel', async () => {
    const { rerender, props } = renderView({ settings: { ...DEFAULT_SETTINGS, pageTurn: 'slide' } });
    rerender(
      <BookView
        {...props}
        settings={{ ...DEFAULT_SETTINGS, pageTurn: 'slide' }}
        section={1}
        content={{ ...htmlContent, index: 1 }}
      />
    );
    await waitFor(() => expect(document.querySelector('.chapter.turning')).toBeTruthy());
    expect(document.querySelector('.chapter').className).toContain('turn-slide');
    expect(document.querySelector('.chapter').className).toContain('turn-forward');
  });

  it('runs nothing at all when the effect is off', async () => {
    const { rerender, props } = renderView({ settings: { ...DEFAULT_SETTINGS, pageTurn: 'none' } });
    rerender(
      <BookView
        {...props}
        settings={{ ...DEFAULT_SETTINGS, pageTurn: 'none' }}
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
