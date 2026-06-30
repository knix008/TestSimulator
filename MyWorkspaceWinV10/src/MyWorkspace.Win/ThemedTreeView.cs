namespace MyWorkspace.Win;

internal class ThemedTreeView : TreeView
{
    public ThemedTreeView()
    {
        DoubleBuffered = true;
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint | ControlStyles.ResizeRedraw, true);
        UpdateStyles();
    }

    protected override void WndProc(ref Message m)
    {
        const int wmEraseBkgnd = 0x0014;
        if (m.Msg == wmEraseBkgnd)
            return;

        base.WndProc(ref m);
    }
}
