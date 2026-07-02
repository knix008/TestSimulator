namespace MyWorkspace.Win;

/// <summary>
/// Root layout panel for the frameless shell.
/// </summary>
internal sealed class FramelessRootPanel : Panel
{
    public FramelessRootPanel()
    {
        Dock = DockStyle.Fill;
        Padding = new Padding(AppTheme.ShellBorderWidth);
        TabStop = false;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
        UpdateStyles();
        ApplyThemeColors();

        if (!DesignMode)
            AppTheme.Changed += OnThemeChanged;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing && !DesignMode)
            AppTheme.Changed -= OnThemeChanged;

        base.Dispose(disposing);
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        e.Graphics.Clear(AppTheme.Background);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);

        var width = ClientSize.Width;
        var height = ClientSize.Height;
        if (width <= 1 || height <= 1)
            return;

        e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.None;
        using var pen = AppTheme.CreateShellBorderPen();
        e.Graphics.DrawRectangle(pen, 0, 0, width - 1, height - 1);
    }

    private void ApplyThemeColors()
    {
        BackColor = AppTheme.Background;
        Invalidate();
    }

    private void OnThemeChanged()
    {
        if (IsDisposed)
            return;

        if (InvokeRequired)
            BeginInvoke(ApplyThemeColors);
        else
            ApplyThemeColors();
    }
}
