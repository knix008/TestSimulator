using System.ComponentModel;

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
    private const int WmLButtonDown = 0x0201;

    public ThemedTreeView()
    {
        DoubleBuffered = true;
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
        UpdateStyles();
        AppTheme.Changed += OnAppThemeChanged;
        AfterExpand += OnTreeLayoutChanged;
        AfterCollapse += OnTreeLayoutChanged;
    }

    public event EventHandler<TreeViewRightClickEventArgs>? RightNodeClick;

    [DefaultValue(true)]
    public bool SuppressHorizontalScrollbar { get; set; } = true;

    public string? ActiveNodeKey { get; private set; }

    public void SetActiveNodeKey(string? key)
    {
        if (string.Equals(ActiveNodeKey, key, StringComparison.Ordinal))
            return;

        ActiveNodeKey = key;
        if (IsHandleCreated)
            Invalidate();
    }

    internal void ApplyNativeTheme(bool broadcastThemeChange = false) =>
        NativeControlTheme.ApplyTreeViewTheme(this, broadcastThemeChange);

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            if (SuppressHorizontalScrollbar)
                cp.Style |= TreeViewScrollBarHelper.TvsNoHscroll;
            return cp;
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            AppTheme.Changed -= OnAppThemeChanged;
            AfterExpand -= OnTreeLayoutChanged;
            AfterCollapse -= OnTreeLayoutChanged;
        }

        base.Dispose(disposing);
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        ApplyNativeTheme();
        CommitHorizontalScrollbarSuppression();
    }

    protected override void OnSizeChanged(EventArgs e)
    {
        base.OnSizeChanged(e);
        CommitHorizontalScrollbarSuppression();
    }

    private void OnTreeLayoutChanged(object? sender, TreeViewEventArgs e) =>
        CommitHorizontalScrollbarSuppression();

    private void OnAppThemeChanged()
    {
        if (IsDisposed || !IsHandleCreated)
            return;

        if (InvokeRequired)
            BeginInvoke(OnAppThemeChangedCore);
        else
            OnAppThemeChangedCore();
    }

    private void OnAppThemeChangedCore()
    {
        ApplyNativeTheme(broadcastThemeChange: true);
        CommitHorizontalScrollbarSuppression();
    }

    internal void CommitHorizontalScrollbarSuppression()
    {
        if (!SuppressHorizontalScrollbar || !IsHandleCreated)
            return;

        TreeViewScrollBarHelper.SuppressHorizontalScrollbars(Handle);
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

    internal bool TryGetNodeRowBounds(TreeNode node, out Rectangle rowBounds)
    {
        if (TreeViewNativeHelper.TryGetItemRowBounds(this, node, out rowBounds))
        {
            if (rowBounds.Height < ItemHeight)
                rowBounds = new Rectangle(rowBounds.X, rowBounds.Y, ClientSize.Width, ItemHeight);
            else
                rowBounds = new Rectangle(0, rowBounds.Top, ClientSize.Width, rowBounds.Height);
            return true;
        }

        var bounds = node.Bounds;
        var height = Math.Max(bounds.Height > 0 ? bounds.Height : ItemHeight, ItemHeight);

        if (bounds.Height > 0)
        {
            rowBounds = new Rectangle(0, bounds.Top, ClientSize.Width, height);
            return true;
        }

        foreach (var visible in EnumerateVisibleNodes(Nodes))
        {
            if (!ReferenceEquals(visible, node))
                continue;

            if (TreeViewNativeHelper.TryGetItemRowBounds(this, visible, out rowBounds))
            {
                rowBounds = new Rectangle(0, rowBounds.Top, ClientSize.Width, Math.Max(rowBounds.Height, ItemHeight));
                return true;
            }

            var visibleBounds = visible.Bounds;
            var visibleHeight = Math.Max(visibleBounds.Height > 0 ? visibleBounds.Height : ItemHeight, ItemHeight);
            rowBounds = visibleBounds.Height > 0
                ? new Rectangle(0, visibleBounds.Top, ClientSize.Width, visibleHeight)
                : new Rectangle(0, 0, ClientSize.Width, visibleHeight);
            return true;
        }

        rowBounds = default;
        return false;
    }

    private bool TryHandleExpandMouseDown(Point clientPoint)
    {
        if (!AppTheme.TryHandleTreeExpandClick(this, clientPoint, out var toggledNode))
            return false;

        Focus();
        SelectedNode = toggledNode;
        return true;
    }

    protected override void WndProc(ref Message m)
    {
        if (SuppressHorizontalScrollbar && TreeViewScrollBarHelper.ShouldSuppressMessage(m.Msg))
            return;

        if (m.Msg == WmLButtonDown &&
            TryHandleExpandMouseDown(TreeViewNativeHelper.GetClientPointFromLParam(m.LParam)))
            return;

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
        {
            var childHandle = m.LParam;
            base.WndProc(ref m);
            if (TreeViewScrollBarHelper.IsVerticalScrollBar(childHandle))
                NativeControlTheme.ApplyScrollbarTheme(childHandle);
            CommitHorizontalScrollbarSuppression();
            return;
        }

        base.WndProc(ref m);

        if (SuppressHorizontalScrollbar && m.Msg == 0x0005)
            CommitHorizontalScrollbarSuppression();
    }
}
