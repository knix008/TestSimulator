import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '../src/i18n.js';
import { setLanguage } from '../src/i18n.js';
import TitleBar from '../src/components/TitleBar.jsx';
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
    expect(container.innerHTML).toContain('#3C3B6E');
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
  it('cycles on the flag and lets a language be chosen from the list', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Language' }));
    expect(onLang).toHaveBeenCalledWith();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a language from the flag list' }));
    fireEvent.click(screen.getByRole('option', { name: /한국어/ }));
    expect(onLang).toHaveBeenCalledWith('ko');
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
