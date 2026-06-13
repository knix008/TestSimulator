namespace MyProject.Forms
{
    public enum ContextMenuTarget
    {
        TaskGridHeader,
        TaskGridEmpty,
        TaskGridTask,
        GanttHeader,
        GanttEmpty,
        GanttTask
    }

    public sealed class ContextMenuRequestEventArgs : EventArgs
    {
        public required ContextMenuTarget Target { get; init; }
        public int TaskId { get; init; } = -1;
        public required Point Location { get; init; }
    }
}
