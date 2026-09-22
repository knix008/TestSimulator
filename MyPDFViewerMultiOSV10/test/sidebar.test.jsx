import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import '../src/i18n.js';
import { setLanguage } from '../src/i18n.js';
import Sidebar from '../src/components/Sidebar.jsx';

function renderSide(props = {}) {
  return render(
    <Sidebar
      panel="search"
      width={264}
      onResize={vi.fn()}
      onPanel={vi.fn()}
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
      {...props}
    />,
  );
}

describe('Sidebar comments tool', () => {
  it('shows a comments rail button and lists notes in that panel', async () => {
    await setLanguage('en');
    const onGoToComment = vi.fn();
    const { container, getByLabelText, getByTitle, getByText } = renderSide({
      panel: 'comments',
      comments: [{ id: 'n1', kind: 'note', page: 2, text: 'check the figure', rect: { y: 0.3 } }],
      onGoToComment,
    });
    expect(getByLabelText('Comments')).toBeTruthy();
    expect(container.querySelector('.comment-list')).toBeTruthy();
    fireEvent.click(getByTitle('check the figure'));
    expect(onGoToComment).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1', page: 2 }));
    expect(getByTitle('Add comment')).toBeTruthy();
    expect(getByTitle('Attach file')).toBeTruthy();
  });

  it('lists attached PDF comments and jumps to that passage', async () => {
    await setLanguage('en');
    const onGoToComment = vi.fn();
    const { getByTitle, queryByTitle } = renderSide({
      panel: 'comments',
      comments: [
        { id: 'H1', kind: 'highlight', page: 4, text: 'check this', source: 'pdf', removable: false, fracY: 0.22 },
      ],
      onGoToComment,
    });
    fireEvent.click(getByTitle('check this'));
    expect(onGoToComment).toHaveBeenCalledWith(expect.objectContaining({ id: 'H1', page: 4, fracY: 0.22 }));
    expect(queryByTitle('Delete')).toBeNull();
  });
});

describe('Sidebar folder tree', () => {
  it('shows a folders rail button and lists subfolders plus PDFs', async () => {
    await setLanguage('en');
    const onOpenFolderFile = vi.fn();
    const loadFolder = vi.fn(async (dir) => {
      if (dir === '/docs') {
        return [
          { name: 'invoices', path: '/docs/invoices', kind: 'dir' },
          { name: 'report.pdf', path: '/docs/report.pdf', kind: 'pdf', size: 12 },
        ];
      }
      return [];
    });
    const { container, getByLabelText, getByTitle, getByText } = renderSide({
      panel: 'folders',
      desktop: true,
      folderRoot: '/docs',
      loadFolder,
      onOpenFolderFile,
    });
    expect(getByLabelText('Folders')).toBeTruthy();
    expect(getByTitle('Open folder')).toBeTruthy();
    await waitFor(() => expect(getByText('report.pdf')).toBeTruthy());
    expect(getByText('invoices')).toBeTruthy();
    expect(container.querySelector('.folder-tree .tree')).toBeTruthy();
    fireEvent.click(getByTitle('/docs/report.pdf'));
    expect(onOpenFolderFile).toHaveBeenCalledWith('/docs/report.pdf');
  });

  it('shows PDF files that live inside a nested folder', async () => {
    await setLanguage('en');
    const loadFolder = vi.fn(async (dir) => {
      if (dir === '/docs') {
        return [{ name: 'invoices', path: '/docs/invoices', kind: 'dir' }];
      }
      if (dir === '/docs/invoices') {
        return [
          { name: 'jan.pdf', path: '/docs/invoices/jan.pdf', kind: 'pdf', size: 20 },
          { name: 'feb.pdf', path: '/docs/invoices/feb.pdf', kind: 'pdf', size: 30 },
        ];
      }
      return [];
    });
    const { getByText } = renderSide({
      panel: 'folders',
      desktop: true,
      folderRoot: '/docs',
      loadFolder,
    });
    await waitFor(() => expect(getByText('invoices')).toBeTruthy());
    await waitFor(() => expect(getByText('jan.pdf')).toBeTruthy());
    expect(getByText('feb.pdf')).toBeTruthy();
  });

  it('asks the user to pick a folder when none is open', async () => {
    await setLanguage('en');
    const onPickFolder = vi.fn();
    const { getByText, getByTitle } = renderSide({
      panel: 'folders',
      desktop: true,
      folderRoot: '',
      onPickFolder,
    });
    expect(getByText(/Choose a folder/)).toBeTruthy();
    fireEvent.click(getByTitle('Open folder'));
    expect(onPickFolder).toHaveBeenCalled();
  });
});

describe('Sidebar outline', () => {
  it('paints only the selected heading when several share a page', async () => {
    await setLanguage('en');
    const outline = [
      {
        id: 'ch', title: 'Chapter', page: 3, level: 0, loc: null,
        items: [
          { id: 'a', title: 'Alpha', page: 3, level: 1, loc: null, items: [] },
          { id: 'b', title: 'Beta', page: 3, level: 1, loc: null, items: [] },
        ],
      },
    ];
    const { container, getByTitle, getByText } = renderSide({
      panel: 'outline',
      pageNumber: 3,
      outline,
    });
    await waitFor(() => expect(getByTitle('Expand all')).toBeTruthy());
    expect(container.querySelector('.side-head .side-head-actions')).toBeTruthy();
    expect(getByTitle('Collapse all')).toBeTruthy();
    expect(container.querySelector('.outline-tree .side-actions')).toBeFalsy();
    const painted = () => [...container.querySelectorAll('.outline-tree .tree-row.current')]
      .map((el) => el.textContent);
    expect(painted()).toEqual(['Beta3']);
    fireEvent.click(getByTitle('Chapter'));
    expect(painted()).toEqual(['Chapter3']);
    fireEvent.click(getByTitle('Alpha'));
    expect(painted()).toEqual(['Alpha3']);
  });
});

describe('Sidebar header actions', () => {
  it('puts image extract on the Images title row', async () => {
    await setLanguage('en');
    const onExtractImages = vi.fn();
    const { getByTitle, container } = renderSide({
      panel: 'images',
      doc: {},
      onExtractImages,
    });
    const btn = getByTitle('Extract from this page');
    expect(container.querySelector('.side-head').contains(btn)).toBe(true);
    expect(container.querySelector('.side-body .side-actions')).toBeFalsy();
    fireEvent.click(btn);
    expect(onExtractImages).toHaveBeenCalledWith(1);
  });

  it('disables image extract until a document is open', async () => {
    await setLanguage('en');
    const onExtractImages = vi.fn();
    const { getByTitle } = renderSide({ panel: 'images', doc: null, onExtractImages });
    expect(getByTitle('Extract from this page').disabled).toBe(true);
    fireEvent.click(getByTitle('Extract from this page'));
    expect(onExtractImages).not.toHaveBeenCalled();
  });

  it('puts comment and attach icons on the Comments title row', async () => {
    await setLanguage('en');
    const onAddComment = vi.fn();
    const onAttachFile = vi.fn();
    const { getByTitle, container } = renderSide({
      panel: 'comments',
      doc: {},
      onAddComment,
      onAttachFile,
    });
    const head = container.querySelector('.side-head');
    fireEvent.click(getByTitle('Add comment'));
    fireEvent.click(getByTitle('Attach file'));
    expect(head.contains(getByTitle('Add comment'))).toBe(true);
    expect(onAddComment).toHaveBeenCalled();
    expect(onAttachFile).toHaveBeenCalled();
  });
});

describe('Sidebar splitter', () => {
  it('shows a separator when the panel is open', async () => {
    await setLanguage('en');
    const { container } = renderSide();
    const split = container.querySelector('.side-splitter');
    expect(split).toBeTruthy();
    expect(split.getAttribute('role')).toBe('separator');
    expect(split.getAttribute('aria-orientation')).toBe('vertical');
  });

  it('hides the separator when the panel is collapsed', () => {
    const { container } = renderSide({ panel: 'none' });
    expect(container.querySelector('.side-splitter')).toBe(null);
    expect(container.querySelector('.sidebar').classList.contains('collapsed')).toBe(true);
  });

  it('reports a new width while the separator is dragged', () => {
    const onResize = vi.fn();
    const { container } = renderSide({ onResize, width: 264 });
    const split = container.querySelector('.side-splitter');
    fireEvent.mouseDown(split, { button: 0, clientX: 300 });
    fireEvent.mouseMove(window, { clientX: 360 });
    expect(onResize).toHaveBeenCalledWith(324);
    fireEvent.mouseUp(window);
  });
});
