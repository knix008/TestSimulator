namespace SuperResolutionApp;

/// <summary>
/// AutoScroll + mouse-wheel zoom preview with persistent zoom %.
/// </summary>
public class ZoomableImageHost : UserControl
{
    private readonly Panel _scroll = new();
    private readonly PictureBox _picture = new();
    private readonly Label _zoomLabel = new();
    private float _userZoom = 1f;
    private const double WheelFactor = 1.12;
    private bool _isPanning;
    private Point _panStartMouse;
    private Point _panStartScroll;

    public ZoomableImageHost()
    {
        SetStyle(ControlStyles.ResizeRedraw, true);
        DoubleBuffered = true;

        _scroll.AutoScroll = true;
        _scroll.Dock = DockStyle.Fill;
        _scroll.BackColor = Color.Black;
        _scroll.TabStop = true;
        _scroll.Controls.Add(_picture);

        _picture.SizeMode = PictureBoxSizeMode.Zoom;
        _picture.TabStop = false;
        _picture.BackColor = Color.Black;

        _zoomLabel.AutoSize = true;
        _zoomLabel.Padding = new Padding(6, 4, 6, 4);
        _zoomLabel.BackColor = Color.FromArgb(220, 40, 40, 40);
        _zoomLabel.ForeColor = Color.WhiteSmoke;
        _zoomLabel.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        _zoomLabel.Visible = false;
        _zoomLabel.Location = new Point(4, 4);

        Controls.Add(_scroll);
        Controls.Add(_zoomLabel);
        _zoomLabel.BringToFront();

        void focusScroll(object? s, EventArgs e) => _scroll.Focus();

        MouseEnter += focusScroll;
        _scroll.MouseEnter += focusScroll;
        _picture.MouseEnter += focusScroll;
        _zoomLabel.MouseEnter += focusScroll;

        Resize += (_, _) => LayoutImage();
        _scroll.Resize += (_, _) => LayoutImage();

        _scroll.MouseDown += BeginPan;
        _scroll.MouseMove += ContinuePan;
        _scroll.MouseUp += EndPan;
        _picture.MouseDown += BeginPan;
        _picture.MouseMove += ContinuePan;
        _picture.MouseUp += EndPan;
    }

    /// <summary>Image to display (caller owns lifetime unless cleared before dispose).</summary>
    public Image? PreviewImage
    {
        get => _picture.Image;
        set
        {
            _picture.Image = value;
            _userZoom = 1f;
            LayoutImage();
        }
    }

    /// <summary>Wheel delta from system message (typically ±120 per notch).</summary>
    public void ApplyWheelDelta(int delta)
    {
        if (_picture.Image is null || delta == 0)
        {
            return;
        }

        if (delta > 0)
        {
            _userZoom *= (float)WheelFactor;
        }
        else
        {
            _userZoom /= (float)WheelFactor;
        }

        _userZoom = Math.Clamp(_userZoom, 0.12f, 64f);
        LayoutImage();
    }

    private void LayoutImage()
    {
        if (_picture.Image is null)
        {
            _picture.Size = Size.Empty;
            _picture.Location = Point.Empty;
            _zoomLabel.Visible = false;
            return;
        }

        var img = _picture.Image;
        int cw = Math.Max(1, _scroll.ClientSize.Width);
        int ch = Math.Max(1, _scroll.ClientSize.Height);

        double fit = Math.Min(cw / (double)img.Width, ch / (double)img.Height);
        if (double.IsInfinity(fit) || double.IsNaN(fit) || fit <= 0)
        {
            fit = 1;
        }

        double scale = fit * _userZoom;
        int w = Math.Max(1, (int)Math.Round(img.Width * scale));
        int h = Math.Max(1, (int)Math.Round(img.Height * scale));
        _picture.Size = new Size(w, h);
        // Center if smaller than viewport; pin to top-left when larger so scrollbars work naturally.
        int x = w < cw ? (cw - w) / 2 : 0;
        int y = h < ch ? (ch - h) / 2 : 0;
        _picture.Location = new Point(x, y);

        UpdateZoomLabel();
    }

    private void UpdateZoomLabel()
    {
        if (_picture.Image is null)
        {
            _zoomLabel.Visible = false;
            return;
        }

        int pct = (int)Math.Round(_userZoom * 100);
        _zoomLabel.Text = $"{pct}%";
        _zoomLabel.Visible = true;
    }

    private void BeginPan(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left || !CanPan())
        {
            return;
        }

        _isPanning = true;
        _panStartMouse = GetScreenMousePosition(sender as Control, e.Location);
        _panStartScroll = GetCurrentScrollOffset();
        Cursor = Cursors.SizeAll;
        _picture.Cursor = Cursors.SizeAll;
        _scroll.Cursor = Cursors.SizeAll;
    }

    private void ContinuePan(object? sender, MouseEventArgs e)
    {
        if (!_isPanning)
        {
            return;
        }

        var current = GetScreenMousePosition(sender as Control, e.Location);
        int dx = current.X - _panStartMouse.X;
        int dy = current.Y - _panStartMouse.Y;

        int maxX = Math.Max(0, _scroll.DisplayRectangle.Width - _scroll.ClientSize.Width);
        int maxY = Math.Max(0, _scroll.DisplayRectangle.Height - _scroll.ClientSize.Height);

        int targetX = Math.Clamp(_panStartScroll.X - dx, 0, maxX);
        int targetY = Math.Clamp(_panStartScroll.Y - dy, 0, maxY);
        _scroll.AutoScrollPosition = new Point(targetX, targetY);
    }

    private void EndPan(object? sender, MouseEventArgs e)
    {
        if (!_isPanning)
        {
            return;
        }

        _isPanning = false;
        Cursor = Cursors.Default;
        _picture.Cursor = Cursors.Default;
        _scroll.Cursor = Cursors.Default;
    }

    private bool CanPan()
    {
        return _picture.Image is not null &&
               (_picture.Width > _scroll.ClientSize.Width || _picture.Height > _scroll.ClientSize.Height);
    }

    private Point GetCurrentScrollOffset()
    {
        var p = _scroll.AutoScrollPosition;
        return new Point(-p.X, -p.Y);
    }

    private static Point GetScreenMousePosition(Control? source, Point location)
    {
        return source?.PointToScreen(location) ?? Control.MousePosition;
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        LayoutImage();
    }
}
