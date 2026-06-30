namespace MyWorkspace.Win;

internal sealed class TabCloseEventArgs(TabPage tabPage, int tabIndex) : EventArgs
{
    public TabPage TabPage { get; } = tabPage;
    public int TabIndex { get; } = tabIndex;
}

internal sealed class CloseableTabControl : TabControl
{
    private const int CloseButtonSize = 14;
    private const int CloseButtonRightPadding = 6;
    private const int TextLeftPadding = 10;
    private const int TextRightPadding = CloseButtonSize + CloseButtonRightPadding + 6;
    private const int TabHeight = 28;

    private int? _hotCloseIndex;

    public event EventHandler<TabCloseEventArgs>? TabCloseRequested;

    public CloseableTabControl()
    {
        DrawMode = TabDrawMode.OwnerDrawFixed;
        SizeMode = TabSizeMode.Normal;
        ItemSize = new Size(0, TabHeight);
        Padding = new Point(10, 4);
        HotTrack = false;
        DoubleBuffered = true;
        AppTheme.Changed += OnThemeChanged;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
            AppTheme.Changed -= OnThemeChanged;

        base.Dispose(disposing);
    }

    public void RefreshTabLayout()
    {
        Invalidate();
    }

    protected override void OnPaintBackground(PaintEventArgs pevent)
    {
        using (var brush = new SolidBrush(AppTheme.EditorBackground))
            pevent.Graphics.FillRectangle(brush, ClientRectangle);

        if (TabCount == 0)
            return;

        var tabRowHeight = GetTabRect(0).Bottom;
        if (tabRowHeight <= 0)
            return;

        var stripRect = new Rectangle(0, 0, ClientSize.Width, tabRowHeight);
        using (var stripBrush = new SolidBrush(AppTheme.Sidebar))
            pevent.Graphics.FillRectangle(stripBrush, stripRect);
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        Invalidate();
    }

    protected override void WndProc(ref Message m)
    {
        // Remove the default TabControl content-area inset border.
        const int tcmAdjustRect = 0x1328;
        if (m.Msg == tcmAdjustRect && !DesignMode)
        {
            m.Result = (IntPtr)1;
            return;
        }

        base.WndProc(ref m);
    }

    protected override void OnDrawItem(DrawItemEventArgs e)
    {
        if (e.Index < 0 || e.Index >= TabPages.Count)
            return;

        var tabPage = TabPages[e.Index];
        var bounds = GetTabRect(e.Index);
        var selected = e.Index == SelectedIndex;
        var backColor = selected ? AppTheme.Surface : AppTheme.Sidebar;
        var textColor = selected ? AppTheme.TextPrimary : AppTheme.TextSecondary;

        using (var backBrush = new SolidBrush(backColor))
            e.Graphics.FillRectangle(backBrush, bounds);

        var closeRect = GetCloseButtonRect(bounds);
        var closeHot = _hotCloseIndex == e.Index;
        var closeColor = closeHot ? AppTheme.Danger : AppTheme.TextMuted;
        DrawCloseButton(e.Graphics, closeRect, closeColor);

        var textRect = new Rectangle(
            bounds.Left + TextLeftPadding,
            bounds.Top,
            Math.Max(0, bounds.Width - TextLeftPadding - TextRightPadding),
            bounds.Height);

        TextRenderer.DrawText(
            e.Graphics,
            tabPage.Text,
            Font,
            textRect,
            textColor,
            TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        var hotIndex = HitTestCloseIndex(e.Location);
        if (hotIndex == _hotCloseIndex)
            return;

        var previous = _hotCloseIndex;
        _hotCloseIndex = hotIndex;
        if (previous.HasValue)
            InvalidateTab(previous.Value);
        if (hotIndex.HasValue)
            InvalidateTab(hotIndex.Value);
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        if (_hotCloseIndex == null)
            return;

        var previous = _hotCloseIndex;
        _hotCloseIndex = null;
        InvalidateTab(previous.Value);
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        var closeIndex = HitTestCloseIndex(e.Location);
        if (closeIndex.HasValue && (e.Button == MouseButtons.Left || e.Button == MouseButtons.Middle))
        {
            RequestCloseTab(closeIndex.Value);
            return;
        }

        if (e.Button == MouseButtons.Middle)
        {
            for (var i = 0; i < TabCount; i++)
            {
                if (!GetTabRect(i).Contains(e.Location))
                    continue;

                RequestCloseTab(i);
                return;
            }
        }

        base.OnMouseDown(e);
    }

    private void RequestCloseTab(int index)
    {
        if (index < 0 || index >= TabPages.Count)
            return;

        TabCloseRequested?.Invoke(this, new TabCloseEventArgs(TabPages[index], index));
    }

    private int? HitTestCloseIndex(Point location)
    {
        for (var i = 0; i < TabCount; i++)
        {
            if (GetCloseButtonRect(GetTabRect(i)).Contains(location))
                return i;
        }

        return null;
    }

    private static Rectangle GetCloseButtonRect(Rectangle tabRect) =>
        new(
            tabRect.Right - CloseButtonSize - CloseButtonRightPadding,
            tabRect.Top + (tabRect.Height - CloseButtonSize) / 2,
            CloseButtonSize,
            CloseButtonSize);

    private static void DrawCloseButton(Graphics graphics, Rectangle bounds, Color color)
    {
        using var pen = new Pen(color, 1.8f);
        var inset = 3;
        graphics.DrawLine(pen, bounds.Left + inset, bounds.Top + inset, bounds.Right - inset, bounds.Bottom - inset);
        graphics.DrawLine(pen, bounds.Right - inset, bounds.Top + inset, bounds.Left + inset, bounds.Bottom - inset);
    }

    private void InvalidateTab(int index)
    {
        if (index < 0 || index >= TabCount)
            return;

        Invalidate(GetTabRect(index));
    }

    private void OnThemeChanged() => Invalidate();
}
