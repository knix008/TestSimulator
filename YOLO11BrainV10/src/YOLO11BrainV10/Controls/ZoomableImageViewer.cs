using System.Drawing;
using System.Windows.Forms;

namespace YOLO11BrainV10.Controls;

/// <summary>
/// Scrollable image view with mouse-wheel zoom and left-drag panning.
/// </summary>
public sealed class ZoomableImageViewer : UserControl
{
    private const int WmMouseWheel = 0x020A;
    private readonly ScrollableWheelPanel _scroll;
    private readonly ZoomPictureBox _pic;
    private float _zoom = 1f;
    private bool _panning;
    private Point _panLast;

    public ZoomableImageViewer()
    {
        BorderStyle = BorderStyle.Fixed3D;
        BackColor = Color.FromArgb(32, 32, 36);
        TabStop = true;

        _scroll = new ScrollableWheelPanel(this)
        {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            BackColor = Color.FromArgb(32, 32, 36),
            TabStop = true,
        };

        _pic = new ZoomPictureBox
        {
            Location = Point.Empty,
            SizeMode = PictureBoxSizeMode.StretchImage,
            TabStop = false,
            BackColor = Color.FromArgb(32, 32, 36),
        };
        _pic.WheelDelta += delta => HandleZoomWheel(delta);

        _scroll.Controls.Add(_pic);
        Controls.Add(_scroll);

        _pic.MouseDown += Pic_MouseDown;
        _pic.MouseMove += Pic_MouseMove;
        _pic.MouseUp += Pic_MouseUp;
        _pic.MouseLeave += Pic_MouseLeave;
        MouseEnter += (_, _) => Focus();
        _scroll.MouseEnter += (_, _) => Focus();
        _scroll.Resize += (_, _) => OnScrollHostResize();
    }

    private void OnScrollHostResize()
    {
        if (_pic.Image == null)
            return;
        ApplyZoomLayout();
    }

    public Image? Image
    {
        get => _pic.Image;
        set
        {
            var old = _pic.Image;
            _pic.Image = value;
            old?.Dispose();
            if (value != null)
                ZoomToFit();
            else
            {
                _zoom = 1f;
                _pic.Size = Size.Empty;
                _pic.Location = Point.Empty;
                _scroll.AutoScrollMinSize = Size.Empty;
            }
        }
    }

    /// <summary>Sets image without resetting zoom (first image still uses fit-to-view).</summary>
    public void SetImageKeepView(Image? value)
    {
        var first = _pic.Image == null;
        var old = _pic.Image;
        _pic.Image = value;
        old?.Dispose();

        if (value == null)
        {
            _zoom = 1f;
            _pic.Size = Size.Empty;
            _pic.Location = Point.Empty;
            _scroll.AutoScrollMinSize = Size.Empty;
            return;
        }

        if (first)
            ZoomToFit();
        else
            ApplyZoomLayout();
    }

    public void ZoomToFit()
    {
        if (_pic.Image == null)
        {
            _zoom = 1f;
            _pic.Size = Size.Empty;
            _pic.Location = Point.Empty;
            _scroll.AutoScrollMinSize = Size.Empty;
            return;
        }

        var cw = Math.Max(1, _scroll.ClientSize.Width);
        var ch = Math.Max(1, _scroll.ClientSize.Height);
        var zw = cw / (float)_pic.Image.Width;
        var zh = ch / (float)_pic.Image.Height;
        _zoom = Math.Clamp(Math.Min(zw, zh), MinZoom, MaxZoom);
        ApplyZoomLayout();
        ScrollTo(0, 0);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _pic.Image?.Dispose();
            _pic.Image = null;
        }

        base.Dispose(disposing);
    }

    private void Pic_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left)
            return;
        _panning = true;
        _panLast = e.Location;
        _pic.Capture = true;
        Cursor = Cursors.Hand;
    }

    private void Pic_MouseMove(object? sender, MouseEventArgs e)
    {
        if (!_panning)
            return;

        int dx = e.X - _panLast.X;
        int dy = e.Y - _panLast.Y;
        _panLast = e.Location;

        var hs = _scroll.HorizontalScroll;
        var vs = _scroll.VerticalScroll;
        if (hs.Visible)
            hs.Value = Math.Clamp(hs.Value - dx, hs.Minimum, SafeScrollMax(hs));
        if (vs.Visible)
            vs.Value = Math.Clamp(vs.Value - dy, vs.Minimum, SafeScrollMax(vs));
    }

    private void Pic_MouseUp(object? sender, MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Left)
            EndPan();
    }

    private void Pic_MouseLeave(object? sender, EventArgs e)
    {
        if (!_panning)
            return;
        if ((Control.MouseButtons & MouseButtons.Left) == 0)
            EndPan();
    }

    private void EndPan()
    {
        _panning = false;
        _pic.Capture = false;
        Cursor = Cursors.Default;
    }

    private void HandleZoomWheel(int delta)
    {
        if (_pic.Image == null)
            return;

        float oldZoom = _zoom;
        float factor = delta > 0 ? 1.12f : 1f / 1.12f;
        _zoom = Math.Clamp(_zoom * factor, MinZoom, MaxZoom);
        if (Math.Abs(_zoom - oldZoom) < 1e-4f)
            return;

        var hs = _scroll.HorizontalScroll;
        var vs = _scroll.VerticalScroll;
        var clientPt = _scroll.PointToClient(Cursor.Position);
        bool inside = _scroll.ClientRectangle.Contains(clientPt);
        int cx = inside ? clientPt.X : _scroll.ClientRectangle.Width / 2;
        int cy = inside ? clientPt.Y : _scroll.ClientRectangle.Height / 2;
        double ratio = _zoom / oldZoom;

        ApplyZoomLayout();

        int newX = (int)Math.Round((hs.Value + cx) * ratio - cx);
        int newY = (int)Math.Round((vs.Value + cy) * ratio - cy);
        _scroll.PerformLayout();
        ScrollTo(newX, newY);
    }

    private void ApplyZoomLayout()
    {
        if (_pic.Image == null)
        {
            _pic.Size = Size.Empty;
            _pic.Location = Point.Empty;
            _scroll.AutoScrollMinSize = Size.Empty;
            return;
        }

        int w = Math.Max(1, (int)Math.Round(_pic.Image.Width * _zoom));
        int h = Math.Max(1, (int)Math.Round(_pic.Image.Height * _zoom));

        int cw = Math.Max(1, _scroll.ClientSize.Width);
        int ch = Math.Max(1, _scroll.ClientSize.Height);

        // When the scaled image is smaller than the viewport, expand the scroll document and
        // offset the picture so it stays visually centered (letterboxing in the panel).
        int minW = Math.Max(w, cw);
        int minH = Math.Max(h, ch);
        int ox = (minW - w) / 2;
        int oy = (minH - h) / 2;

        _pic.SuspendLayout();
        _scroll.SuspendLayout();
        try
        {
            _pic.Size = new Size(w, h);
            _pic.Location = new Point(ox, oy);
            _scroll.AutoScrollMinSize = new Size(minW, minH);
        }
        finally
        {
            _scroll.ResumeLayout(true);
            _pic.ResumeLayout();
        }
    }

    private void ScrollTo(int x, int y)
    {
        var hs = _scroll.HorizontalScroll;
        var vs = _scroll.VerticalScroll;
        if (hs.Visible)
            hs.Value = Math.Clamp(x, hs.Minimum, SafeScrollMax(hs));
        if (vs.Visible)
            vs.Value = Math.Clamp(y, vs.Minimum, SafeScrollMax(vs));
    }

    private static int SafeScrollMax(ScrollProperties sp) =>
        Math.Max(sp.Minimum, sp.Maximum - sp.LargeChange + 1);

    private static float MinZoom => 0.05f;
    private static float MaxZoom => 32f;

    private sealed class ZoomPictureBox : PictureBox
    {
        public event Action<int>? WheelDelta;

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WmMouseWheel && WheelDelta != null)
            {
                int delta = (short)((uint)m.WParam.ToInt64() >> 16);
                WheelDelta.Invoke(delta);
                return;
            }

            base.WndProc(ref m);
        }
    }

    private sealed class ScrollableWheelPanel : Panel
    {
        private readonly ZoomableImageViewer _owner;

        public ScrollableWheelPanel(ZoomableImageViewer owner) => _owner = owner;

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WmMouseWheel)
            {
                if (ClientRectangle.Contains(PointToClient(Cursor.Position)))
                {
                    int delta = (short)((uint)m.WParam.ToInt64() >> 16);
                    _owner.HandleZoomWheel(delta);
                    return;
                }
            }

            base.WndProc(ref m);
        }
    }
}
