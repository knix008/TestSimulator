using MyDiffWinV10.App.Core;

namespace MyDiffWinV10.App.Controls;

/// <summary>
/// A narrow strip alongside a pane's scrollbar that maps every diff row to a proportional
/// band of color (added/removed/modified), plus a viewport rectangle showing the currently
/// visible range — a minimap so the user can see where the differences are before scrolling
/// to them. Clicking anywhere on the strip jumps the paired pane there.
/// </summary>
public sealed class DiffOverviewBar : Control
{
    private const int BucketedOverviewThreshold = 2048;

    private IReadOnlyList<DiffRow>? _rows;
    private IReadOnlyList<DiffLineKind>? _kinds;
    private SyncLineListBox? _target;

    public event EventHandler<int>? LineClicked;

    public DiffOverviewBar()
    {
        Width = 14;
        DoubleBuffered = true;
        BackColor = PaneTheme.OverviewBackgroundColor;
        Cursor = Cursors.Hand;
    }

    public void SetRows(IReadOnlyList<DiffRow>? rows)
    {
        _rows = rows;
        _kinds = null;
        Invalidate();
    }

    public void SetRowKinds(IReadOnlyList<DiffLineKind>? kinds)
    {
        _kinds = kinds;
        _rows = null;
        Invalidate();
    }

    public void AttachTarget(SyncLineListBox target)
    {
        DetachTarget();
        _target = target;
        target.Scrolled += OnTargetChanged;
        target.Resize += OnTargetChanged;
        target.FontChanged += OnTargetChanged;
        target.LinesChanged += OnTargetChanged;
    }

    private void DetachTarget()
    {
        if (_target == null)
        {
            return;
        }

        _target.Scrolled -= OnTargetChanged;
        _target.Resize -= OnTargetChanged;
        _target.FontChanged -= OnTargetChanged;
        _target.LinesChanged -= OnTargetChanged;
        _target = null;
    }

    private void OnTargetChanged(object? sender, EventArgs e) => Invalidate();

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);

        var bounds = ClientRectangle;
        using (var background = new SolidBrush(BackColor))
        {
            e.Graphics.FillRectangle(background, bounds);
        }

        var rows = _rows;
        var kinds = _kinds ?? rows?.Select(row => row.Kind).ToList();
        if (kinds == null || kinds.Count == 0 || bounds.Height <= 0)
        {
            return;
        }

        int total = kinds.Count;
        if (total > BucketedOverviewThreshold)
        {
            DrawBucketedOverview(e.Graphics, bounds, kinds);
        }
        else
        {
            DrawDetailedOverview(e.Graphics, bounds, kinds);
        }

        DrawViewportIndicator(e.Graphics, bounds, total);

        using var borderPen = new Pen(PaneTheme.GutterDividerColor);
        e.Graphics.DrawLine(borderPen, 0, 0, 0, bounds.Height);
    }

    private static void DrawDetailedOverview(Graphics graphics, Rectangle bounds, IReadOnlyList<DiffLineKind> kinds)
    {
        int total = kinds.Count;
        for (int i = 0; i < total; i++)
        {
            DiffLineKind kind = kinds[i];
            if (kind == DiffLineKind.Same)
            {
                continue;
            }

            int y = (int)((long)i * bounds.Height / total);
            int yNext = (int)((long)(i + 1) * bounds.Height / total);
            int height = Math.Max(1, yNext - y);
            using var brush = new SolidBrush(AccentForKind(kind));
            graphics.FillRectangle(brush, 2, y, Math.Max(1, bounds.Width - 4), height);
        }
    }

    private static void DrawBucketedOverview(Graphics graphics, Rectangle bounds, IReadOnlyList<DiffLineKind> kinds)
    {
        int total = kinds.Count;
        int barWidth = Math.Max(1, bounds.Width - 4);
        for (int y = 0; y < bounds.Height; y++)
        {
            int lineStart = (int)((long)y * total / bounds.Height);
            int lineEnd = (int)((long)(y + 1) * total / bounds.Height);
            if (lineEnd <= lineStart)
            {
                lineEnd = lineStart + 1;
            }

            lineEnd = Math.Min(lineEnd, total);
            DiffLineKind kind = DiffLineKind.Same;
            for (int line = lineStart; line < lineEnd; line++)
            {
                kind = StrongerKind(kind, kinds[line]);
            }

            if (kind == DiffLineKind.Same)
            {
                continue;
            }

            using var brush = new SolidBrush(AccentForKind(kind));
            graphics.FillRectangle(brush, 2, y, barWidth, 1);
        }
    }

    private static DiffLineKind StrongerKind(DiffLineKind current, DiffLineKind candidate) =>
        (DiffLineKind)Math.Max((int)current, (int)candidate);

    private static Color AccentForKind(DiffLineKind kind) =>
        kind switch
        {
            DiffLineKind.Added => PaneTheme.AddedAccent,
            DiffLineKind.Removed => PaneTheme.RemovedAccent,
            DiffLineKind.Modified => PaneTheme.ModifiedAccent,
            _ => PaneTheme.OverviewViewportColor,
        };

    private void DrawViewportIndicator(Graphics graphics, Rectangle bounds, int total)
    {
        if (_target is not { IsHandleCreated: true } target || total <= 0)
        {
            return;
        }

        int first = target.GetFirstVisibleLine();
        int lineHeight = Math.Max(1, target.ItemHeight);
        int visibleCount = target.ClientSize.Height > 0
            ? (int)Math.Ceiling(target.ClientSize.Height / (double)lineHeight)
            : total;

        int y = (int)((long)first * bounds.Height / total);
        int height = Math.Max(4, (int)((long)visibleCount * bounds.Height / total));
        using var pen = new Pen(PaneTheme.OverviewViewportColor, 1.5f);
        graphics.DrawRectangle(pen, 0, y, Math.Max(0, bounds.Width - 1), Math.Min(height, bounds.Height - y - 1));
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);

        var rows = _rows;
        var kinds = _kinds ?? rows?.Select(row => row.Kind).ToList();
        if (kinds == null || kinds.Count == 0 || ClientSize.Height <= 0)
        {
            return;
        }

        int line = (int)((long)e.Y * kinds.Count / ClientSize.Height);
        LineClicked?.Invoke(this, Math.Clamp(line, 0, kinds.Count - 1));
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
