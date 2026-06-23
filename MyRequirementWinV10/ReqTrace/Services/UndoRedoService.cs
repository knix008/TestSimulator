using ReqTrace.Models;
using ReqTrace.Persistence;

namespace ReqTrace.Services;

public sealed class UndoRedoService
{
    private const int MaxDepth = 50;
    private readonly List<ProjectData> _undo = new();
    private readonly List<ProjectData> _redo = new();

    public event EventHandler? StateChanged;

    public bool CanUndo => _undo.Count > 0;
    public bool CanRedo => _redo.Count > 0;

    public void Clear()
    {
        _undo.Clear();
        _redo.Clear();
        NotifyStateChanged();
    }

    public void Record(ProjectData current)
    {
        _undo.Add(ProjectDataCloner.Clone(current));
        while (_undo.Count > MaxDepth)
            _undo.RemoveAt(0);

        _redo.Clear();
        NotifyStateChanged();
    }

    public ProjectData? Undo(ProjectData current)
    {
        if (_undo.Count == 0)
            return null;

        _redo.Add(ProjectDataCloner.Clone(current));
        var previous = _undo[^1];
        _undo.RemoveAt(_undo.Count - 1);
        NotifyStateChanged();
        return ProjectDataCloner.Clone(previous);
    }

    public ProjectData? Redo(ProjectData current)
    {
        if (_redo.Count == 0)
            return null;

        _undo.Add(ProjectDataCloner.Clone(current));
        var next = _redo[^1];
        _redo.RemoveAt(_redo.Count - 1);
        NotifyStateChanged();
        return ProjectDataCloner.Clone(next);
    }

    private void NotifyStateChanged() => StateChanged?.Invoke(this, EventArgs.Empty);
}
