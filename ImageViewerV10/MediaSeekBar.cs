namespace ImageViewerV10;

public sealed class MediaSeekBar : Control
{
    private double _progress;
    private bool _isDragging;

    public event Action<double>? SeekRequested;
    public event Action<bool>? SeekingStateChanged;

    public double Progress
    {
        get => _progress;
        set
        {
            double clamped = Math.Clamp(value, 0d, 1d);
            if (Math.Abs(_progress - clamped) < 0.0001d)
            {
                return;
            }

            _progress = clamped;
            Invalidate();
        }
    }

    public MediaSeekBar()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint |
                 ControlStyles.OptimizedDoubleBuffer |
                 ControlStyles.ResizeRedraw |
                 ControlStyles.UserPaint, true);
        Cursor = Cursors.Hand;
        Height = 16;
        MinimumSize = new Size(60, 16);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);

        e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        Rectangle trackRect = new(3, Height / 2 - 3, Math.Max(8, Width - 6), 6);
        int playedWidth = (int)Math.Round(trackRect.Width * _progress);
        Rectangle playedRect = new(trackRect.X, trackRect.Y, Math.Max(0, playedWidth), trackRect.Height);

        using var remainBrush = new SolidBrush(Color.FromArgb(78, 82, 88));
        using var playedBrush = new SolidBrush(Color.FromArgb(56, 189, 248));
        using var thumbBrush = new SolidBrush(Color.WhiteSmoke);

        e.Graphics.FillRectangle(remainBrush, trackRect);
        if (playedRect.Width > 0)
        {
            e.Graphics.FillRectangle(playedBrush, playedRect);
        }

        int thumbX = trackRect.Left + playedWidth;
        thumbX = Math.Clamp(thumbX, trackRect.Left, trackRect.Right);
        Rectangle thumbRect = new(thumbX - 5, trackRect.Y - 4, 10, 14);
        e.Graphics.FillEllipse(thumbBrush, thumbRect);
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button != MouseButtons.Left)
        {
            return;
        }

        _isDragging = true;
        SeekingStateChanged?.Invoke(true);
        SetProgressFromX(e.X, true);
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        if (_isDragging)
        {
            SetProgressFromX(e.X, true);
        }
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (!_isDragging)
        {
            return;
        }

        _isDragging = false;
        SetProgressFromX(e.X, true);
        SeekingStateChanged?.Invoke(false);
    }

    private void SetProgressFromX(int x, bool emitEvent)
    {
        Rectangle trackRect = new(3, Height / 2 - 3, Math.Max(8, Width - 6), 6);
        double value = (double)(x - trackRect.Left) / trackRect.Width;
        Progress = Math.Clamp(value, 0d, 1d);
        if (emitEvent)
        {
            SeekRequested?.Invoke(Progress);
        }
    }
}
