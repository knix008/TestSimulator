import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
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
    expect(getByText('Add comment')).toBeTruthy();
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
