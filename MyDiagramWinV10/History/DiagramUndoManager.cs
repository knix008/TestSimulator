using MyDiagramWinV10.Models;

namespace MyDiagramWinV10.History;

public sealed class DiagramUndoManager
{
    private const int MaxDepth = 50;
    private readonly Stack<DiagramProject> _undo = new();
    private readonly Stack<DiagramProject> _redo = new();

    public bool CanUndo => _undo.Count > 0;
    public bool CanRedo => _redo.Count > 0;

    public void Reset(DiagramProject current)
    {
        _undo.Clear();
        _redo.Clear();
        _undo.Push(current.Clone());
    }

    public void Push(DiagramProject current)
    {
        _undo.Push(current.Clone());
        if (_undo.Count > MaxDepth)
        {
            // Keep the newest MaxDepth snapshots, discarding the oldest.
            // Take() enumerates top→bottom; reversing gives oldest→newest order
            // for re-pushing so the newest ends up back on top.
            var keep = _undo.Take(MaxDepth).Reverse().ToList();
            _undo.Clear();
            foreach (var item in keep)
                _undo.Push(item);
        }

        _redo.Clear();
    }

    public DiagramProject? Undo(DiagramProject current)
    {
        if (_undo.Count <= 1)
            return null;

        _redo.Push(current.Clone());
        _undo.Pop();
        return _undo.Peek().Clone();
    }

    public DiagramProject? Redo(DiagramProject current)
    {
        if (_redo.Count == 0)
            return null;

        _undo.Push(current.Clone());
        return _redo.Pop().Clone();
    }
}
