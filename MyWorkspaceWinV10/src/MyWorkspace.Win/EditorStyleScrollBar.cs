using System.Drawing.Drawing2D;

namespace MyWorkspace.Win;

internal sealed class EditorStyleScrollBar : Control
{
    private const int Inset = 3;
    private const int MinThumbHeight = 24;

    private int _minimum;
    private int _maximum;
    private int _pageSize = 1;
    private int _value;
    private bool _dragging;
    private int _dragOffsetY;

    public EditorStyleScrollBar()
    {
        Width = 16;
        SetStyle(
            ControlStyles.AllPaintingInWmPaint
            | ControlStyles.OptimizedDoubleBuffer
            | ControlStyles.ResizeRedraw
            | ControlStyles.UserPaint,
            true);
        TabStop = false;
        ApplyTheme();
        AppTheme.Changed += OnAppThemeChanged;
    }

    public event EventHandler<ScrollEventArgs>? Scroll;

    protected override void Dispose(bool disposing)
    {
        if (disposing)
            AppTheme.Changed -= OnAppThemeChanged;

        base.Dispose(disposing);
    }

    public void ApplyTheme() => BackColor = AppTheme.Sidebar;

    public void SetValues(int minimum, int maximum, int pageSize, int value)
    {
        _minimum = minimum;
        _maximum = maximum;
        _pageSize = Math.Max(1, pageSize);
        _value = Math.Clamp(value, minimum, maximum);

        var range = _maximum - _minimum + 1;
        var visible = range > _pageSize;
        if (Visible != visible)
            Visible = visible;

        Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        if (!Visible)
            return;

        var graphics = e.Graphics;
        graphics.Clear(AppTheme.Sidebar);

        var trackHeight = ClientSize.Height;
        if (trackHeight <= MinThumbHeight + Inset * 2)
            return;

        var thumbHeight = GetThumbHeight(trackHeight);
        var thumbTop = GetThumbTop(trackHeight, thumbHeight);
        var thumbRect = new Rectangle(
            Inset,
            thumbTop,
            Math.Max(4, Width - Inset * 2),
            thumbHeight);

        using var brush = new SolidBrush(AppTheme.Border);
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using var path = CreateRoundedRect(thumbRect, thumbRect.Width / 2f);
        graphics.FillPath(brush, path);
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (!Visible || e.Button != MouseButtons.Left)
            return;

        Focus();

        var trackHeight = ClientSize.Height;
        var thumbHeight = GetThumbHeight(trackHeight);
        var thumbTop = GetThumbTop(trackHeight, thumbHeight);
        var thumbRect = new Rectangle(Inset, thumbTop, Width - Inset * 2, thumbHeight);

        if (thumbRect.Contains(e.Location))
        {
            _dragging = true;
            _dragOffsetY = e.Y - thumbTop;
            return;
        }

        var targetValue = ValueFromY(e.Y, trackHeight, thumbHeight);
        SetValueAndRaise(targetValue, ScrollEventType.ThumbTrack);
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        if (!_dragging || e.Button != MouseButtons.Left)
            return;

        var trackHeight = ClientSize.Height;
        var thumbHeight = GetThumbHeight(trackHeight);
        var targetValue = ValueFromY(e.Y - _dragOffsetY + thumbHeight / 2, trackHeight, thumbHeight);
        SetValueAndRaise(targetValue, ScrollEventType.ThumbTrack);
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (!_dragging)
            return;

        _dragging = false;
        SetValueAndRaise(_value, ScrollEventType.ThumbPosition);
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        base.OnMouseLeave(e);
        if (_dragging && Control.MouseButtons != MouseButtons.Left)
            _dragging = false;
    }

    private void OnAppThemeChanged()
    {
        if (IsDisposed)
            return;

        if (InvokeRequired)
            BeginInvoke(ApplyThemeAndInvalidate);
        else
            ApplyThemeAndInvalidate();
    }

    private void ApplyThemeAndInvalidate()
    {
        ApplyTheme();
        Invalidate();
    }

    private int GetThumbHeight(int trackHeight)
    {
        var total = _maximum - _minimum + 1;
        if (total <= _pageSize)
            return trackHeight;

        return Math.Max(MinThumbHeight, (int)Math.Round((double)_pageSize / total * trackHeight));
    }

    private int GetThumbTop(int trackHeight, int thumbHeight)
    {
        var scrollable = Math.Max(0, _maximum - _minimum - _pageSize + 1);
        if (scrollable == 0)
            return Inset;

        var movable = Math.Max(1, trackHeight - thumbHeight - Inset * 2);
        return Inset + (int)Math.Round((double)(_value - _minimum) / scrollable * movable);
    }

    private int ValueFromY(int y, int trackHeight, int thumbHeight)
    {
        var scrollable = Math.Max(0, _maximum - _minimum - _pageSize + 1);
        if (scrollable == 0)
            return _minimum;

        var movable = Math.Max(1, trackHeight - thumbHeight - Inset * 2);
        var normalized = Math.Clamp(y - Inset - thumbHeight / 2, 0, movable);
        return _minimum + (int)Math.Round((double)normalized / movable * scrollable);
    }

    private void SetValueAndRaise(int value, ScrollEventType type)
    {
        var clamped = Math.Clamp(value, _minimum, Math.Max(_minimum, _maximum));
        if (clamped == _value && type == ScrollEventType.ThumbTrack)
        {
            Invalidate();
            return;
        }

        _value = clamped;
        Invalidate();
        Scroll?.Invoke(this, new ScrollEventArgs(type, clamped));
    }

    private static GraphicsPath CreateRoundedRect(Rectangle bounds, float radius)
    {
        var path = new GraphicsPath();
        if (bounds.Width <= 0 || bounds.Height <= 0)
            return path;

        var diameter = Math.Min(radius * 2, Math.Min(bounds.Width, bounds.Height));
        var arc = new RectangleF(bounds.X, bounds.Y, diameter, diameter);
        path.AddArc(arc, 180, 90);
        arc.X = bounds.Right - diameter;
        path.AddArc(arc, 270, 90);
        arc.Y = bounds.Bottom - diameter;
        path.AddArc(arc, 0, 90);
        arc.X = bounds.X;
        path.AddArc(arc, 90, 90);
        path.CloseFigure();
        return path;
    }
}
