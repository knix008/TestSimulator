using System.ComponentModel;
using System.Drawing.Drawing2D;

namespace VideoPlayerV10.App;

public class SeekBarControl : Control
{
    private int _minimum;
    private int _maximum = 1000;
    private int _value;
    private bool _dragging;

    [DefaultValue(10)]
    public int LargeChange { get; set; } = 10;

    [DefaultValue(1)]
    public int SmallChange { get; set; } = 1;

    [DefaultValue(0)]
    public int Minimum
    {
        get => _minimum;
        set
        {
            _minimum = value;
            if (_maximum < _minimum)
            {
                _maximum = _minimum;
            }

            Value = _value;
            Invalidate();
        }
    }

    [DefaultValue(1000)]
    public int Maximum
    {
        get => _maximum;
        set
        {
            _maximum = Math.Max(value, _minimum);
            Value = _value;
            Invalidate();
        }
    }

    [DefaultValue(0)]
    public int Value
    {
        get => _value;
        set
        {
            int clamped = Math.Clamp(value, _minimum, _maximum);
            if (_value == clamped)
            {
                return;
            }

            _value = clamped;
            Invalidate();
            ValueChanged?.Invoke(this, EventArgs.Empty);
        }
    }

    public event EventHandler? ValueChanged;

    public SeekBarControl()
    {
        SetStyle(
            ControlStyles.AllPaintingInWmPaint |
            ControlStyles.UserPaint |
            ControlStyles.OptimizedDoubleBuffer |
            ControlStyles.ResizeRedraw,
            true);

        Height = 24;
        BackColor = Color.White;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);

        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;

        const int trackHeight = 6;
        int left = 6;
        int width = Math.Max(1, ClientSize.Width - 12);
        int top = (ClientSize.Height - trackHeight) / 2;
        float ratio = _maximum > _minimum ? (float)(_value - _minimum) / (_maximum - _minimum) : 0f;
        int fillWidth = (int)(width * ratio);

        Rectangle trackRect = new(left, top, width, trackHeight);
        Rectangle fillRect = new(left, top, fillWidth, trackHeight);

        using var trackBrush = new SolidBrush(Color.FromArgb(220, 224, 228));
        using var fillBrush = new SolidBrush(Color.FromArgb(28, 132, 246));
        using var thumbBrush = new SolidBrush(Color.FromArgb(28, 132, 246));

        e.Graphics.FillRoundedRectangle(trackBrush, trackRect, 3);
        if (fillWidth > 0)
        {
            e.Graphics.FillRoundedRectangle(fillBrush, fillRect, 3);
        }

        int thumbX = left + fillWidth;
        thumbX = Math.Clamp(thumbX, left, left + width);
        Rectangle thumbRect = new(thumbX - 6, top - 4, 12, 12);
        e.Graphics.FillEllipse(thumbBrush, thumbRect);
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        _dragging = true;
        UpdateValueFromX(e.X);
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        if (_dragging)
        {
            UpdateValueFromX(e.X);
        }
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        _dragging = false;
        UpdateValueFromX(e.X);
    }

    private void UpdateValueFromX(int x)
    {
        int left = 6;
        int width = Math.Max(1, ClientSize.Width - 12);
        int clampedX = Math.Clamp(x, left, left + width);
        float ratio = (float)(clampedX - left) / width;
        Value = _minimum + (int)Math.Round(ratio * (_maximum - _minimum));
    }
}

internal static class GraphicsExtensions
{
    public static void FillRoundedRectangle(this Graphics graphics, Brush brush, Rectangle bounds, int radius)
    {
        using GraphicsPath path = new();
        int diameter = radius * 2;
        Rectangle arc = new(bounds.Location, new Size(diameter, diameter));

        path.AddArc(arc, 180, 90);
        arc.X = bounds.Right - diameter;
        path.AddArc(arc, 270, 90);
        arc.Y = bounds.Bottom - diameter;
        path.AddArc(arc, 0, 90);
        arc.X = bounds.Left;
        path.AddArc(arc, 90, 90);
        path.CloseFigure();

        graphics.FillPath(brush, path);
    }
}
