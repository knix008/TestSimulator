namespace MyDiffWinV10.App.Controls;

/// <summary>
/// A wider stand-in for a pane's native vertical scrollbar — the native ListBox scrollbar is
/// a fixed, narrow system width that's awkward to grab with the mouse, and Windows doesn't
/// expose a way to widen it directly. This wraps a real <see cref="VScrollBar"/> (which does
/// support an arbitrary <see cref="Control.Width"/>) and keeps it in sync with the attached
/// <see cref="SyncLineListBox"/> in both directions.
/// </summary>
public sealed class PaneVScrollBar : VScrollBar
{
    private SyncLineListBox? _target;
    private bool _suppressTargetSync;

    public PaneVScrollBar()
    {
        Width = 24;
    }

    public void AttachTarget(SyncLineListBox target)
    {
        DetachTarget();
        _target = target;
        target.HideNativeVerticalScrollbar = true;
        target.Scrolled += OnTargetChanged;
        target.LinesChanged += OnTargetChanged;
        target.Resize += OnTargetChanged;
        target.FontChanged += OnTargetChanged;
        Scroll += OnScroll;
        RefreshFromTarget();
    }

    private void DetachTarget()
    {
        if (_target == null)
        {
            return;
        }

        _target.HideNativeVerticalScrollbar = false;
        _target.Scrolled -= OnTargetChanged;
        _target.LinesChanged -= OnTargetChanged;
        _target.Resize -= OnTargetChanged;
        _target.FontChanged -= OnTargetChanged;
        Scroll -= OnScroll;
        _target = null;
    }

    private void OnTargetChanged(object? sender, EventArgs e) => RefreshFromTarget();

    /// <summary>
    /// Re-reads the target's current scroll position. Needed after code sets
    /// <see cref="ListBox.TopIndex"/> directly (e.g. jump-to-diff), since that doesn't raise
    /// the target's <see cref="SyncLineListBox.Scrolled"/> event the way mouse/scrollbar
    /// input does.
    /// </summary>
    public void SyncFromTarget() => RefreshFromTarget();

    private void RefreshFromTarget()
    {
        var target = _target;
        if (target == null || !target.IsHandleCreated || !IsHandleCreated)
        {
            return;
        }

        int lineHeight = Math.Max(1, target.ItemHeight);
        int visibleLines = target.ClientSize.Height > 0
            ? Math.Max(1, target.ClientSize.Height / lineHeight)
            : 1;
        int contentCount = target.ContentLineCount;
        int max = Math.Max(0, contentCount - 1);

        _suppressTargetSync = true;
        Maximum = max;
        LargeChange = Math.Min(Math.Max(1, visibleLines), max + 1);
        SmallChange = 1;
        Enabled = contentCount > visibleLines;

        int maxTop = Math.Max(0, Maximum - LargeChange + 1);
        Value = Math.Clamp(target.GetFirstVisibleLine(), 0, maxTop);
        _suppressTargetSync = false;
    }

    private void OnScroll(object? sender, ScrollEventArgs e)
    {
        if (_suppressTargetSync || _target == null)
        {
            return;
        }

        _target.SetBinaryScrollTop(Math.Clamp(e.NewValue, 0, Math.Max(0, _target.ContentLineCount - 1)), syncPartners: true);
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        RefreshFromTarget();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            DetachTarget();
        }

        base.Dispose(disposing);
    }
}
