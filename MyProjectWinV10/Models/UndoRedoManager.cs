namespace MyProject.Models
{
    public sealed class UndoRedoManager
    {
        private readonly Stack<string> _undo = new();
        private readonly Stack<string> _redo = new();
        private const int MaxDepth = 50;

        public bool CanUndo => _undo.Count > 0;
        public bool CanRedo => _redo.Count > 0;

        public void SaveSnapshot(ProjectModel model)
        {
            PushSnapshot(ProjectFile.ToUndoSnapshot(model));
        }

        public void PushSnapshot(string snapshot)
        {
            _undo.Push(snapshot);
            _redo.Clear();
            Trim(_undo);
        }

        public ProjectModel? Undo(ProjectModel current)
        {
            if (!CanUndo) return null;
            _redo.Push(ProjectFile.ToUndoSnapshot(current));
            return RestoreSnapshot(_undo.Pop(), current);
        }

        public ProjectModel? Redo(ProjectModel current)
        {
            if (!CanRedo) return null;
            _undo.Push(ProjectFile.ToUndoSnapshot(current));
            return RestoreSnapshot(_redo.Pop(), current);
        }

        private static ProjectModel RestoreSnapshot(string snapshot, ProjectModel current)
        {
            return ProjectFile.FromSnapshot(snapshot, current.FilePath);
        }

        public void DiscardLast()
        {
            if (_undo.Count > 0) _undo.Pop();
        }

        public void Clear()
        {
            _undo.Clear();
            _redo.Clear();
        }

        private static void Trim(Stack<string> stack)
        {
            if (stack.Count <= MaxDepth) return;
            var items = stack.ToArray();
            stack.Clear();
            for (int i = Math.Min(items.Length - 1, MaxDepth - 1); i >= 0; i--)
                stack.Push(items[i]);
        }
    }
}
