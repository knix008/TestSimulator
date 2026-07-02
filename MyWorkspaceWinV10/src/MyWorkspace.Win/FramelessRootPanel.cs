namespace MyWorkspace.Win;

/// <summary>
/// Root layout panel for the frameless shell.
/// </summary>
internal sealed class FramelessRootPanel : Panel
{
    public FramelessRootPanel()
    {
        Dock = DockStyle.Fill;
        TabStop = false;
        BackColor = AppTheme.Background;

        if (!DesignMode)
            AppTheme.Changed += OnThemeChanged;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing && !DesignMode)
            AppTheme.Changed -= OnThemeChanged;

        base.Dispose(disposing);
    }

    private void OnThemeChanged()
    {
        if (IsDisposed)
            return;

        if (InvokeRequired)
            BeginInvoke(() => BackColor = AppTheme.Background);
        else
            BackColor = AppTheme.Background;
    }
}
