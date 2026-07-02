namespace MyWorkspace.Win;

internal sealed class TreeViewRightClickEventArgs(TreeNode? node, Point location) : EventArgs
{
    public TreeNode? Node { get; } = node;

    public Point Location { get; } = location;
}

internal class ThemedTreeView : TreeView
{
    private const int WmContextMenu = 0x007B;
    private const int WmEraseBkgnd = 0x0014;

    public ThemedTreeView()
    {
        DoubleBuffered = true;
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint | ControlStyles.ResizeRedraw, true);
        UpdateStyles();
        AppTheme.Changed += OnAppThemeChanged;
        AfterExpand += OnTreeStructureChanged;
        AfterCollapse += OnTreeStructureChanged;
    }

    public event EventHandler<TreeViewRightClickEventArgs>? RightNodeClick;

    internal void ApplyNativeTheme() => NativeControlTheme.ApplyTreeViewTheme(this);

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            AppTheme.Changed -= OnAppThemeChanged;
            AfterExpand -= OnTreeStructureChanged;
            AfterCollapse -= OnTreeStructureChanged;
        }

        base.Dispose(disposing);
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        ApplyNativeTheme();
    }

    protected override void OnSizeChanged(EventArgs e)
    {
        base.OnSizeChanged(e);
        QueueNativeThemeRefresh();
    }

    private void OnAppThemeChanged()
    {
        if (IsDisposed || !IsHandleCreated)
            return;

        if (InvokeRequired)
            BeginInvoke(ApplyNativeTheme);
        else
            ApplyNativeTheme();
    }

    private void OnTreeStructureChanged(object? sender, TreeViewEventArgs e) =>
        QueueNativeThemeRefresh();

    private void QueueNativeThemeRefresh()
    {
        if (IsDisposed || !IsHandleCreated)
            return;

        if (InvokeRequired)
            BeginInvoke(ApplyNativeTheme);
        else
            ApplyNativeTheme();
    }

    public TreeNode? GetNodeAtClientPoint(Point clientPoint)
    {
        var hit = HitTest(clientPoint);
        if (hit.Node != null)
            return hit.Node;

        var nodeAt = GetNodeAt(clientPoint.X, clientPoint.Y);
        if (nodeAt != null)
            return nodeAt;

        if (ClientSize.Width > 0)
        {
            var step = Math.Max(1, ClientSize.Width / 4);
            for (var x = 0; x < ClientSize.Width; x += step)
            {
                nodeAt = GetNodeAt(x, clientPoint.Y);
                if (nodeAt != null)
                    return nodeAt;
            }

            nodeAt = GetNodeAt(ClientSize.Width - 1, clientPoint.Y);
            if (nodeAt != null)
                return nodeAt;
        }

        foreach (var node in EnumerateVisibleNodes(Nodes))
        {
            var bounds = node.Bounds;
            if (bounds.Height <= 0)
                continue;

            if (clientPoint.Y >= bounds.Top && clientPoint.Y < bounds.Bottom)
                return node;
        }

        return null;
    }

    private static IEnumerable<TreeNode> EnumerateVisibleNodes(TreeNodeCollection nodes)
    {
        foreach (TreeNode node in nodes)
        {
            yield return node;

            if (!node.IsExpanded)
                continue;

            foreach (var child in EnumerateVisibleNodes(node.Nodes))
                yield return child;
        }
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WmContextMenu)
        {
            var screenPoint = new Point(m.LParam.ToInt32());
            Point clientPoint;
            TreeNode? node;

            if ((short)screenPoint.X == -1 && (short)screenPoint.Y == -1)
            {
                node = SelectedNode;
                clientPoint = node != null
                    ? new Point(Math.Max(0, node.Bounds.Left), Math.Max(0, node.Bounds.Top))
                    : Point.Empty;
            }
            else
            {
                clientPoint = PointToClient(screenPoint);
                node = GetNodeAtClientPoint(clientPoint);
            }

            RightNodeClick?.Invoke(this, new TreeViewRightClickEventArgs(node, clientPoint));
            return;
        }

        if (m.Msg == WmEraseBkgnd)
            return;

        if (NativeControlTheme.IsParentNotifyCreate(m))
            NativeControlTheme.ApplyScrollbarTheme(m.LParam);

        base.WndProc(ref m);
    }
}
