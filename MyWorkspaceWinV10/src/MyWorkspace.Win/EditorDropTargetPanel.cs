namespace MyWorkspace.Win;

internal sealed class EditorDropTargetPanel : Panel
{
    public event DragEventHandler? FileDragEnter;
    public event DragEventHandler? FileDragOver;
    public event EventHandler? FileDragLeave;
    public event DragEventHandler? FileDragDrop;

    public EditorDropTargetPanel()
    {
        AllowDrop = true;
        TabStop = false;
        BackColor = Color.Transparent;
        Visible = false;
        SetStyle(ControlStyles.SupportsTransparentBackColor, true);
    }

    protected override void OnDragEnter(DragEventArgs drgevent)
    {
        FileDragEnter?.Invoke(this, drgevent);
        base.OnDragEnter(drgevent);
    }

    protected override void OnDragOver(DragEventArgs drgevent)
    {
        FileDragOver?.Invoke(this, drgevent);
        base.OnDragOver(drgevent);
    }

    protected override void OnDragLeave(EventArgs e)
    {
        FileDragLeave?.Invoke(this, e);
        base.OnDragLeave(e);
    }

    protected override void OnDragDrop(DragEventArgs drgevent)
    {
        FileDragDrop?.Invoke(this, drgevent);
        base.OnDragDrop(drgevent);
    }
}
