import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '../src/i18n.js';
import { setLanguage } from '../src/i18n.js';
import TitleBar from '../src/components/TitleBar.jsx';
import TabBar from '../src/components/TabBar.jsx';
import StatusBar from '../src/components/StatusBar.jsx';
import Toolbar from '../src/components/Toolbar.jsx';
import { PromptDialog, ErrorDialog, UnsavedDialog } from '../src/components/Dialogs.jsx';
import {
  IconOpen, IconPrint, IconSelectText, IconImage, IconMarquee, IconFlag, FlagKo, FlagEn,
} from '../src/components/Icons.jsx';
import { THEMES, nextTheme } from '../src/lib/themes.js';
import ThemePopup from '../src/components/ThemePopup.jsx';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';
import buildInfo from '../src/build-info.json';

describe('TitleBar', () => {
  it('shows the product name, version and document title', () => {
    render(<TitleBar title="report.pdf •" />);
    expect(screen.getByText('MyPDFViewer')).toBeTruthy();
    expect(screen.getByText(`v${buildInfo.version}`)).toBeTruthy();
    expect(screen.getByText('report.pdf •')).toBeTruthy();
  });

  it('hides window controls on the web', () => {
    const { container } = render(<TitleBar title="" />);
    expect(container.querySelector('.titlebar-controls')).toBe(null);
  });
});

describe('TabBar', () => {
  const tabs = [
    { id: 'a', name: 'one.pdf', path: '/one.pdf', dirty: false },
    { id: 'b', name: 'two.pdf', path: '/two.pdf', dirty: true },
  ];

  it('renders nothing when no documents are open', () => {
    const { container } = render(<TabBar tabs={[]} activeId={null} />);
    expect(container.querySelector('.tabbar')).toBe(null);
  });

  it('marks the active tab and shows a dirty dot', async () => {
    await setLanguage('en');
    render(<TabBar tabs={tabs} activeId="b" />);
    const items = screen.getAllByRole('tab');
    expect(items).toHaveLength(2);
    expect(items[1].className).toMatch(/active/);
    expect(items[1].className).toMatch(/dirty/);
    expect(items[1].textContent).toContain('two.pdf');
    expect(items[1].textContent).toContain('•');
  });

  it('selects a tab on click and closes from the close button', async () => {
    await setLanguage('en');
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<TabBar tabs={tabs} activeId="a" onSelect={onSelect} onClose={onClose} />);
    fireEvent.click(screen.getByText('two.pdf'));
    expect(onSelect).toHaveBeenCalledWith('b');
    fireEvent.click(screen.getAllByTitle(/Close this document/)[0]);
    expect(onClose).toHaveBeenCalledWith('a');
  });

  it('closes a tab on middle-click', () => {
    const onClose = vi.fn();
    render(<TabBar tabs={tabs} activeId="a" onClose={onClose} />);
    fireEvent(
      screen.getByText('one.pdf').closest('[role="tab"]'),
      new MouseEvent('auxclick', { button: 1, bubbles: true }),
    );
    expect(onClose).toHaveBeenCalledWith('a');
  });

  it('hides the overflow buttons when every tab fits', async () => {
    await setLanguage('en');
    render(<TabBar tabs={tabs} activeId="a" />);
    expect(document.querySelector('.tabbar-nav')).toBe(null);
  });

  function overflowStrip(scroller, { scrollWidth = 900, clientWidth = 240, scrollLeft = 0 } = {}) {
    let left = scrollLeft;
    Object.defineProperty(scroller, 'scrollWidth', { configurable: true, get: () => scrollWidth });
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, get: () => clientWidth });
    Object.defineProperty(scroller, 'scrollLeft', {
      configurable: true,
      get: () => left,
      set: (v) => { left = v; },
    });
    scroller.scrollBy = vi.fn(({ left: delta }) => {
      left += delta;
      fireEvent.scroll(scroller);
    });
    scroller.scrollTo = vi.fn(({ left: next }) => {
      left = next;
      fireEvent.scroll(scroller);
    });
    fireEvent.scroll(scroller);
    return {
      get left() { return left; },
    };
  }

  it('shows < > on the right when tabs overflow and scrolls the strip', async () => {
    await setLanguage('en');
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: String(i), name: `doc-${i}.pdf`, path: `/${i}.pdf`, dirty: false,
    }));
    render(<TabBar tabs={many} activeId="0" />);
    const scroller = document.querySelector('.tabbar-scroll');
    const state = overflowStrip(scroller);
    const prev = screen.getByTitle('Previous tabs');
    const next = screen.getByTitle('Next tabs');
    expect(document.querySelector('.tabbar-nav')).toBeTruthy();
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    expect(scroller.scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: 168, behavior: 'smooth' }));
    expect(state.left).toBeGreaterThan(0);
    expect(screen.getByTitle('Previous tabs').disabled).toBe(false);
  });

  it('disables the next button at the right end and scrolls back with <', async () => {
    await setLanguage('en');
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: String(i), name: `doc-${i}.pdf`, path: `/${i}.pdf`, dirty: false,
    }));
    render(<TabBar tabs={many} activeId="7" />);
    const scroller = document.querySelector('.tabbar-scroll');
    overflowStrip(scroller, { scrollLeft: 660 });
    expect(screen.getByTitle('Previous tabs').disabled).toBe(false);
    expect(screen.getByTitle('Next tabs').disabled).toBe(true);
    fireEvent.click(screen.getByTitle('Previous tabs'));
    expect(scroller.scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: -168 }));
  });

  it('labels the overflow buttons in Korean', async () => {
    await setLanguage('ko');
    const many = Array.from({ length: 6 }, (_, i) => ({
      id: String(i), name: `문서${i}.pdf`, path: `/${i}.pdf`, dirty: false,
    }));
    render(<TabBar tabs={many} activeId="0" />);
    overflowStrip(document.querySelector('.tabbar-scroll'));
    expect(screen.getByTitle('이전 탭')).toBeTruthy();
    expect(screen.getByTitle('다음 탭')).toBeTruthy();
    expect(screen.getByRole('tablist').getAttribute('aria-label')).toBe('열린 문서');
  });

  it('does not select a tab when its close button is clicked', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<TabBar tabs={tabs} activeId="a" onSelect={onSelect} onClose={onClose} />);
    fireEvent.click(screen.getAllByTitle(/Close this document|이 문서를 닫습니다/)[1]);
    expect(onClose).toHaveBeenCalledWith('b');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ignores a right-button aux click', () => {
    const onClose = vi.fn();
    render(<TabBar tabs={tabs} activeId="a" onClose={onClose} />);
    fireEvent(
      screen.getByText('one.pdf').closest('[role="tab"]'),
      new MouseEvent('auxclick', { button: 2, bubbles: true }),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('exposes the file path as the tab title', () => {
    render(<TabBar tabs={tabs} activeId="a" />);
    expect(screen.getByText('one.pdf').closest('[role="tab"]').title).toBe('/one.pdf');
  });

  it('scrolls the active tab into view when it sits off-screen', async () => {
    await setLanguage('en');
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: String(i), name: `doc-${i}.pdf`, path: `/${i}.pdf`, dirty: false,
    }));
    const { rerender } = render(<TabBar tabs={many} activeId="0" />);
    const scroller = document.querySelector('.tabbar-scroll');
    overflowStrip(scroller, { scrollLeft: 0 });
    const last = [...scroller.querySelectorAll('[role="tab"]')].at(-1);
    Object.defineProperty(last, 'offsetLeft', { configurable: true, get: () => 720 });
    Object.defineProperty(last, 'offsetWidth', { configurable: true, get: () => 80 });
    rerender(<TabBar tabs={many} activeId="7" />);
    expect(scroller.scrollTo).toHaveBeenCalledWith({ left: 568 });
  });

  it('renders nothing when tabs is omitted', () => {
    const { container } = render(<TabBar />);
    expect(container.querySelector('.tabbar')).toBe(null);
  });
});

describe('StatusBar', () => {
  it('renders a ready status without a document', async () => {
    await setLanguage('en');
    render(
      <StatusBar
        file={null}
        doc={null}
        pageNumber={1}
        scale={1}
        selectionChars={0}
        dirty={false}
        history={{ depth: 0 }}
        message=""
      />,
    );
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.getByText('No document')).toBeTruthy();
  });
});

describe('PromptDialog URL validation', () => {
  it('rejects a non-http address', async () => {
    await setLanguage('en');
    const onSubmit = vi.fn();
    render(<PromptDialog open kind="url" error="" onSubmit={onSubmit} onClose={() => {}} />);
    const input = screen.getByPlaceholderText(/example.com/);
    fireEvent.change(input, { target: { value: 'ftp://x' } });
    fireEvent.click(screen.getByText('Open'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/http:\/\/ or https:\/\//)).toBeTruthy();
  });

  it('submits a trimmed https URL', async () => {
    await setLanguage('en');
    const onSubmit = vi.fn();
    render(<PromptDialog open kind="url" error="" onSubmit={onSubmit} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/example.com/), {
      target: { value: '  https://cdn.example.com/a.pdf  ' },
    });
    fireEvent.click(screen.getByText('Open'));
    expect(onSubmit).toHaveBeenCalledWith('https://cdn.example.com/a.pdf');
  });
});

describe('UnsavedDialog', () => {
  it('asks Save / Don’t save / Cancel and reports the choice', async () => {
    await setLanguage('en');
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const onCancel = vi.fn();
    render(<UnsavedDialog open onSave={onSave} onDiscard={onDiscard} onCancel={onCancel} />);
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    expect(screen.getByText(/Bookmarks, comments/)).toBeTruthy();
    fireEvent.click(screen.getByText("Don't save"));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('stays closed when open is false', () => {
    const { container } = render(
      <UnsavedDialog open={false} onSave={() => {}} onDiscard={() => {}} onCancel={() => {}} />,
    );
    expect(container.querySelector('.unsaved-modal')).toBe(null);
  });
});

describe('ErrorDialog', () => {
  it('shows the operation and the stripped message', async () => {
    await setLanguage('en');
    render(
      <ErrorDialog
        error={{ context: 'open', message: 'file is damaged', details: 'stack' }}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('file is damaged')).toBeTruthy();
    expect(document.querySelector('.err-context')?.textContent).toMatch(/opening a file/i);
  });
});

describe('Icons', () => {
  it('renders the selection-tool icons as SVG', () => {
    const { container } = render(
      <>
        <IconOpen />
        <IconPrint />
        <IconSelectText />
        <IconImage />
        <IconMarquee />
      </>,
    );
    expect(container.querySelectorAll('svg').length).toBe(5);
  });

  it('draws Korean and English flags for the language button', () => {
    const { container } = render(<><FlagKo /><FlagEn /><IconFlag lang="en" /></>);
    expect(container.querySelectorAll('svg.lang-flag').length).toBe(3);
    expect(container.innerHTML).toContain('#CD2E3A');
    expect(container.innerHTML).toContain('#012169');
    expect(container.innerHTML).toContain('#C8102E');
    expect(container.innerHTML).not.toContain('#3C3B6E');
  });
});

describe('Toolbar theme split button', () => {
  const noop = () => {};
  const history = {
    canUndo: false, canRedo: false, undo: noop, redo: noop,
  };

  function renderBar(onTheme = vi.fn()) {
    render(
      <Toolbar
        settings={{ ...DEFAULT_SETTINGS, theme: 'dark' }}
        doc={null}
        pageNumber={1}
        numPages={0}
        scale={1}
        hasSelection={false}
        dirty={false}
        history={history}
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
        onComments={noop}
        onBookmarks={noop}
        onBookmark={noop}
        onGoToPage={noop}
        onZoom={noop}
        onZoomMode={noop}
        onRotate={noop}
        onLayout={noop}
        onSearch={noop}
        onTogglePanel={noop}
        onTheme={onTheme}
        onLang={noop}
        onSettings={noop}
        onAbout={noop}
        onPrint={noop}
      />,
    );
    return onTheme;
  }

  it('cycles to the next theme when the theme icon is clicked', async () => {
    await setLanguage('en');
    const onTheme = renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));
    expect(onTheme).toHaveBeenCalledWith(nextTheme('dark'));
    expect(screen.queryByRole('option', { name: /nord/i })).toBeNull();
  });

  it('opens a picker from the chevron so a theme can be chosen', async () => {
    await setLanguage('en');
    const onTheme = renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a colour theme from the list' }));
    expect(screen.getByRole('option', { name: /nord/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: /nord/i }));
    expect(onTheme).toHaveBeenCalledWith('nord');
  });
});

describe('Toolbar language flags', () => {
  it('toggles the language when the flag is clicked, without a picker', async () => {
    await setLanguage('en');
    const onLang = vi.fn();
    const noop = () => {};
    render(
      <Toolbar
        settings={{ ...DEFAULT_SETTINGS, theme: 'dark', lang: 'en' }}
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
        onComments={noop}
        onBookmarks={noop}
        onBookmark={noop}
        onGoToPage={noop}
        onZoom={noop}
        onZoomMode={noop}
        onRotate={noop}
        onLayout={noop}
        onSearch={noop}
        onTogglePanel={noop}
        onTheme={noop}
        onLang={onLang}
        onSettings={noop}
        onAbout={noop}
        onPrint={noop}
      />,
    );
    expect(document.querySelector('.lang-flag')).toBeTruthy();
    expect(document.body.innerHTML).toContain('#012169');
    fireEvent.click(screen.getByRole('button', { name: 'Language' }));
    expect(onLang).toHaveBeenCalledTimes(1);
    expect(onLang).toHaveBeenCalledWith();
    expect(screen.queryByRole('option', { name: /한국어/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Choose a language/ })).toBeNull();
  });
});

describe('Toolbar panel buttons', () => {
  it('exposes comments, bookmarks and search on the bar', async () => {
    await setLanguage('en');
    const onComments = vi.fn();
    const onBookmarks = vi.fn();
    const onSearch = vi.fn();
    const noop = () => {};
    render(
      <Toolbar
        settings={{ ...DEFAULT_SETTINGS, theme: 'dark' }}
        doc={{ numPages: 2 }}
        pageNumber={1}
        numPages={2}
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
        onComments={onComments}
        onBookmarks={onBookmarks}
        onBookmark={noop}
        onGoToPage={noop}
        onZoom={noop}
        onZoomMode={noop}
        onRotate={noop}
        onLayout={noop}
        onSearch={onSearch}
        onTogglePanel={noop}
        onTheme={noop}
        onLang={noop}
        onSettings={noop}
        onAbout={noop}
        onPrint={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Comments' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bookmarks' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Find' })[0]);
    expect(onComments).toHaveBeenCalledTimes(1);
    expect(onBookmarks).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledTimes(1);
  });
});

describe('ThemePopup', () => {
  afterEach(() => {
    delete window.electronAPI;
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('theme-popup');
    document.body.classList.remove('theme-popup');
  });

  it('lists every theme without a scrolling container', () => {
    const pickTheme = vi.fn();
    window.electronAPI = { isElectron: true, win: { pickTheme, setPopupSize: vi.fn() } };
    const { container } = render(<ThemePopup current="nord" />);
    expect(screen.getAllByRole('option')).toHaveLength(THEMES.length);
    expect(container.querySelector('.dd-list.themes')).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: /ember/i }));
    expect(pickTheme).toHaveBeenCalledWith('ember');
  });
});

describe('theme swatches stay unique', () => {
  it('does not reuse the same 3-stop bar triple', () => {
    const keys = THEMES.map((t) => t.bars.join(','));
    expect(new Set(keys).size).toBe(THEMES.length);
  });
});
