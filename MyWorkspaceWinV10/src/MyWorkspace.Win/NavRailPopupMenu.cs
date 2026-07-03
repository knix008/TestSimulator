namespace MyWorkspace.Win;

internal sealed class NavRailPopupMenu : ContextMenuStrip
{
    private Control? _anchor;
    private System.Windows.Forms.Timer? _mouseTrackTimer;
    private bool _handlersAttached;

    public void ShowAt(Control anchor, Point screenLocation)
    {
        _anchor = anchor;
        EnsureHandlers();
        Show(screenLocation);
    }

    private void EnsureHandlers()
    {
        if (_handlersAttached)
            return;

        _handlersAttached = true;
        Opened += (_, _) =>
        {
            Focus();
            StartMouseTracking();
        };
        Closed += (_, _) => StopMouseTracking();
        KeyDown += (_, e) =>
        {
            if (e.KeyCode != Keys.Escape)
                return;

            Close(ToolStripDropDownCloseReason.Keyboard);
            e.Handled = true;
        };
    }

    public bool CloseIfVisible()
    {
        if (!Visible)
            return false;

        Close(ToolStripDropDownCloseReason.CloseCalled);
        return true;
    }

    private void StartMouseTracking()
    {
        StopMouseTracking();
        _mouseTrackTimer = new System.Windows.Forms.Timer { Interval = 50 };
        _mouseTrackTimer.Tick += OnMouseTrackTick;
        _mouseTrackTimer.Start();
    }

    private void StopMouseTracking()
    {
        if (_mouseTrackTimer == null)
            return;

        _mouseTrackTimer.Stop();
        _mouseTrackTimer.Tick -= OnMouseTrackTick;
        _mouseTrackTimer.Dispose();
        _mouseTrackTimer = null;
    }

    private void OnMouseTrackTick(object? sender, EventArgs e)
    {
        if (!Visible)
        {
            StopMouseTracking();
            return;
        }

        if (!ContainsScreenPoint(Control.MousePosition))
            Close(ToolStripDropDownCloseReason.AppFocusChange);
    }

    private bool ContainsScreenPoint(Point screenPoint)
    {
        if (_anchor is { IsDisposed: false })
        {
            var anchorBounds = _anchor.RectangleToScreen(_anchor.ClientRectangle);
            anchorBounds.Inflate(4, 4);
            if (anchorBounds.Contains(screenPoint))
                return true;
        }

        if (GetScreenBounds(this).Contains(screenPoint))
            return true;

        return ContainsScreenPointInSubmenus(Items, screenPoint);
    }

    private static bool ContainsScreenPointInSubmenus(ToolStripItemCollection items, Point screenPoint)
    {
        foreach (ToolStripItem item in items)
        {
            if (item is not ToolStripDropDownItem dropDownItem)
                continue;

            var dropDown = dropDownItem.DropDown;
            if (!dropDown.Visible)
                continue;

            if (GetScreenBounds(dropDown).Contains(screenPoint))
                return true;

            if (ContainsScreenPointInSubmenus(dropDown.Items, screenPoint))
                return true;
        }

        return false;
    }

    private static Rectangle GetScreenBounds(ToolStripDropDown dropdown)
    {
        var bounds = dropdown.Bounds;
        if (bounds.Width <= 0 || bounds.Height <= 0)
            bounds = new Rectangle(dropdown.Location, dropdown.GetPreferredSize(Size.Empty));

        return bounds;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
            StopMouseTracking();

        base.Dispose(disposing);
    }
}
