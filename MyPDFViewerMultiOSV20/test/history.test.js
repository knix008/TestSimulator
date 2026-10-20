import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHistory, EMPTY_WORKSPACE, newId, HISTORY_LIMIT, historyList, jumpPastStacks } from '../src/lib/history.js';

function ws(extra = {}) {
  return { ...EMPTY_WORKSPACE, ...extra };
}

describe('EMPTY_WORKSPACE', () => {
  it('starts with empty lists and no rotation', () => {
    expect(EMPTY_WORKSPACE).toEqual({
      annotations: [],
      clips: [],
      bookmarks: [],
      attachments: [],
      rotation: 0,
    });
  });

  it('caps history at 100 snapshots', () => {
    expect(HISTORY_LIMIT).toBe(100);
  });
});

describe('newId', () => {
  it('returns a non-empty unique string', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId()));
    expect(ids.size).toBe(200);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+$/i);
      expect(id.length).toBeGreaterThan(6);
    }
  });
});

describe('useHistory', () => {
  it('starts from EMPTY_WORKSPACE with nothing to undo or redo', () => {
    const { result } = renderHook(() => useHistory());
    expect(result.current.state).toEqual(EMPTY_WORKSPACE);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.undoLabel).toBe('');
    expect(result.current.redoLabel).toBe('');
    expect(result.current.depth).toBe(0);
  });

  it('accepts an initial workspace', () => {
    const initial = ws({ rotation: 90, bookmarks: [{ id: 'b', page: 1, label: 'A' }] });
    const { result } = renderHook(() => useHistory(initial));
    expect(result.current.state.rotation).toBe(90);
    expect(result.current.state.bookmarks).toHaveLength(1);
  });

  it('commit records a labelled snapshot and clears the redo stack', () => {
    const { result } = renderHook(() => useHistory());
    act(() => {
      result.current.commit(ws({ rotation: 90 }), 'Rotate');
    });
    expect(result.current.state.rotation).toBe(90);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.undoLabel).toBe('Rotate');
    expect(result.current.depth).toBe(1);

    act(() => result.current.undo());
    act(() => result.current.commit(ws({ rotation: 180 }), 'Rotate again'));
    expect(result.current.canRedo).toBe(false);
    expect(result.current.state.rotation).toBe(180);
  });

  it('commit accepts an updater function like setState', () => {
    const { result } = renderHook(() => useHistory());
    act(() => {
      result.current.commit((prev) => ({
        ...prev,
        bookmarks: [...prev.bookmarks, { id: '1', page: 2, label: 'X' }],
      }), 'Bookmark');
    });
    expect(result.current.state.bookmarks).toHaveLength(1);
    expect(result.current.undoLabel).toBe('Bookmark');
  });

  it('does not push history when commit returns the same reference', () => {
    const { result } = renderHook(() => useHistory());
    act(() => {
      result.current.commit((prev) => prev, 'noop');
    });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.depth).toBe(0);
  });

  it('undo / redo restore snapshots and labels', () => {
    const { result } = renderHook(() => useHistory());
    act(() => result.current.commit(ws({ rotation: 90 }), 'Highlight'));
    act(() => result.current.commit(ws({ rotation: 180 }), 'Bookmark'));
    expect(result.current.undoLabel).toBe('Bookmark');

    let label;
    act(() => { label = result.current.undo(); });
    expect(label).toBe('Bookmark');
    expect(result.current.state.rotation).toBe(90);
    expect(result.current.canRedo).toBe(true);
    expect(result.current.redoLabel).toBe('Bookmark');

    act(() => { label = result.current.redo(); });
    expect(label).toBe('Bookmark');
    expect(result.current.state.rotation).toBe(180);
    expect(result.current.canUndo).toBe(true);
  });

  it('undo / redo return null at the ends of the stacks', () => {
    const { result } = renderHook(() => useHistory());
    let label;
    act(() => { label = result.current.undo(); });
    expect(label).toBe(null);
    act(() => { label = result.current.redo(); });
    expect(label).toBe(null);
  });

  it('reset replaces state and clears both stacks', () => {
    const { result } = renderHook(() => useHistory());
    act(() => result.current.commit(ws({ rotation: 90 }), 'A'));
    act(() => result.current.reset(ws({ rotation: 0, bookmarks: [{ id: 'n' }] })));
    expect(result.current.state.bookmarks).toHaveLength(1);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.depth).toBe(0);
  });

  it('reset without a value restores EMPTY_WORKSPACE', () => {
    const { result } = renderHook(() => useHistory(ws({ rotation: 90 })));
    act(() => result.current.reset());
    expect(result.current.state).toEqual(EMPTY_WORKSPACE);
  });

  it('keeps at most HISTORY_LIMIT undo entries', () => {
    const { result } = renderHook(() => useHistory());
    act(() => {
      for (let i = 1; i <= HISTORY_LIMIT + 25; i++) {
        result.current.commit(ws({ rotation: i }), `step ${i}`);
      }
    });
    expect(result.current.depth).toBe(HISTORY_LIMIT);
    expect(result.current.canUndo).toBe(true);
  });

  it('exportSnapshot / restoreSnapshot park and resume a tab session', () => {
    const { result } = renderHook(() => useHistory());
    act(() => result.current.commit(ws({ rotation: 90 }), 'Rotate'));
    act(() => result.current.commit(ws({ rotation: 180, bookmarks: [{ id: 'b' }] }), 'Bookmark'));
    let snap;
    act(() => { snap = result.current.exportSnapshot(); });
    expect(snap.state.rotation).toBe(180);
    expect(snap.past).toHaveLength(2);

    act(() => result.current.reset(ws({ rotation: 0 })));
    expect(result.current.canUndo).toBe(false);

    act(() => result.current.restoreSnapshot(snap));
    expect(result.current.state.rotation).toBe(180);
    expect(result.current.state.bookmarks).toHaveLength(1);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.undoLabel).toBe('Bookmark');

    act(() => result.current.undo());
    expect(result.current.state.rotation).toBe(90);
    expect(result.current.canRedo).toBe(true);
  });

  it('restoreSnapshot with no payload returns to EMPTY_WORKSPACE', () => {
    const { result } = renderHook(() => useHistory(ws({ rotation: 90 })));
    act(() => result.current.restoreSnapshot(null));
    expect(result.current.state).toEqual(EMPTY_WORKSPACE);
    expect(result.current.canUndo).toBe(false);
  });

  it('can undo a highlight then a bookmark in reverse order', () => {
    const { result } = renderHook(() => useHistory());
    act(() => result.current.commit(ws({
      annotations: [{ id: 'h1', kind: 'highlight' }],
    }), 'Highlight'));
    act(() => result.current.commit(ws({
      annotations: [{ id: 'h1', kind: 'highlight' }],
      bookmarks: [{ id: 'b1' }],
    }), 'Bookmark'));

    act(() => result.current.undo());
    expect(result.current.state.bookmarks).toEqual([]);
    expect(result.current.state.annotations).toHaveLength(1);
    act(() => result.current.undo());
    expect(result.current.state).toEqual(EMPTY_WORKSPACE);
  });
});

describe('historyList / jumpPastStacks', () => {
  it('lists past labels newest first', () => {
    expect(historyList([
      { state: { rotation: 0 }, label: 'Highlight' },
      { state: { rotation: 90 }, label: 'Bookmark' },
    ])).toEqual([
      { index: 1, label: 'Bookmark' },
      { index: 0, label: 'Highlight' },
    ]);
    expect(historyList(null)).toEqual([]);
  });

  it('jumps back to a past snapshot and rebuilds redo', () => {
    const a = ws({ rotation: 0 });
    const b = ws({ rotation: 90 });
    const c = ws({ rotation: 180 });
    const next = jumpPastStacks(
      [{ state: a, label: 'Highlight' }, { state: b, label: 'Bookmark' }],
      [],
      c,
      0,
    );
    expect(next.state).toEqual(a);
    expect(next.past).toEqual([]);
    expect(next.future).toEqual([
      { state: b, label: 'Highlight' },
      { state: c, label: 'Bookmark' },
    ]);
  });
});
