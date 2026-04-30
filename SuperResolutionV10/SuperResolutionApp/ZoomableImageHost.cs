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

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        LayoutImage();
    }
}
