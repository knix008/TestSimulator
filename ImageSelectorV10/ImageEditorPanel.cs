using System.Drawing.Drawing2D;

namespace ImageSelectorV10;

internal sealed class ImageEditorPanel : Panel
{
    private readonly Panel _scrollHost;
    private readonly ImageCanvas _canvas;
    private Bitmap? _sourceImage;
    private float _zoom = 1f;
    private bool _selecting;
    private Point _selectStartCanvas;
    private Rectangle _selectionImageRect;
    private bool _hasSelection;
    private bool _fitOnNextResize;

    public ImageEditorPanel()
    {
        BackColor = Color.FromArgb(48, 48, 52);
        TabStop = false;

        _scrollHost = new Panel
        {
            AutoScroll = true,
            Dock = DockStyle.Fill,
            BackColor = Color.FromArgb(48, 48, 52),
            TabStop = false
        };
        _canvas = new ImageCanvas(this);
        _scrollHost.Controls.Add(_canvas);
        Controls.Add(_scrollHost);

        _scrollHost.MouseWheel += ScrollHost_MouseWheel;
        _scrollHost.Resize += (_, _) => OnScrollHostResize();
    }

    public event EventHandler<float>? ZoomFactorChanged;
    public event EventHandler? SelectionChanged;

    public float ZoomFactor => _zoom;

    public bool HasSelection => _hasSelection && _sourceImage != null;

    public Rectangle SelectionInImageCoordinates => _selectionImageRect;

    /// <summary>정규화된 선택 영역의 가로·세로 크기(원본 이미지 픽셀). 선택이 없으면 <see cref="Size.Empty"/>.</summary>
    public Size SelectionSizePixels
    {
        get
        {
            if (!_hasSelection || _sourceImage == null) return Size.Empty;
            var r = NormalizeSelection();
            return new Size(r.Width, r.Height);
        }
    }

    /// <summary>선택 영역 크기(원본 픽셀)를 설정합니다. 기존 선택이 있으면 왼쪽 위 모서리를 유지하고, 없으면 이미지 중앙에 맞춥니다.</summary>
    public void SetSelectionSizePixels(int width, int height)
    {
        if (_sourceImage == null) return;

        int w = Math.Clamp(width, 1, _sourceImage.Width);
        int h = Math.Clamp(height, 1, _sourceImage.Height);

        int x;
        int y;
        if (_hasSelection)
        {
            var cur = NormalizeSelection();
            x = cur.X;
            y = cur.Y;
            if (x + w > _sourceImage.Width) x = _sourceImage.Width - w;
            if (y + h > _sourceImage.Height) y = _sourceImage.Height - h;
            x = Math.Clamp(x, 0, Math.Max(0, _sourceImage.Width - w));
            y = Math.Clamp(y, 0, Math.Max(0, _sourceImage.Height - h));
        }
        else
        {
            x = Math.Max(0, (_sourceImage.Width - w) / 2);
            y = Math.Max(0, (_sourceImage.Height - h) / 2);
        }

        _selectionImageRect = new Rectangle(x, y, w, h);
        _hasSelection = true;
        _canvas.Invalidate();
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>선택 영역을 원본 이미지 좌표 기준으로 이동합니다. 이미지 경계 안으로 잘립니다.</summary>
    public void MoveSelectionByPixels(int deltaX, int deltaY)
    {
        if (_sourceImage == null || !_hasSelection) return;
        var r = NormalizeSelection();
        if (r.Width < 1 || r.Height < 1) return;

        int maxX = Math.Max(0, _sourceImage.Width - r.Width);
        int maxY = Math.Max(0, _sourceImage.Height - r.Height);
        int nx = Math.Clamp(r.X + deltaX, 0, maxX);
        int ny = Math.Clamp(r.Y + deltaY, 0, maxY);
        if (nx == r.X && ny == r.Y) return;

        _selectionImageRect = new Rectangle(nx, ny, r.Width, r.Height);
        _canvas.Invalidate();
        ScrollSelectionIntoView();
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    private bool TryHandleArrowKey(KeyEventArgs e)
    {
        if (_sourceImage == null || !_hasSelection) return false;
        int step = e.Shift ? 10 : 1;
        int dx = 0, dy = 0;
        switch (e.KeyCode)
        {
            case Keys.Left:
                dx = -step;
                break;
            case Keys.Right:
                dx = step;
                break;
            case Keys.Up:
                dy = -step;
                break;
            case Keys.Down:
                dy = step;
                break;
            default:
                return false;
        }

        e.Handled = true;
        e.SuppressKeyPress = true;
        MoveSelectionByPixels(dx, dy);
        return true;
    }

    private void ScrollSelectionIntoView()
    {
        if (_sourceImage == null || !_hasSelection) return;
        var r = NormalizeSelection();
        int vx = _scrollHost.HorizontalScroll.Value;
        int vy = _scrollHost.VerticalScroll.Value;
        int vw = _scrollHost.ClientRectangle.Width;
        int vh = _scrollHost.ClientRectangle.Height;

        int selL = (int)Math.Floor(r.X * _zoom);
        int selT = (int)Math.Floor(r.Y * _zoom);
        int selR = (int)Math.Ceiling((r.X + r.Width) * _zoom);
        int selB = (int)Math.Ceiling((r.Y + r.Height) * _zoom);

        int nvx = vx;
        int nvy = vy;
        if (selL < vx) nvx = selL;
        if (selT < vy) nvy = selT;
        if (selR > vx + vw) nvx = selR - vw;
        if (selB > vy + vh) nvy = selB - vh;

        int maxX = Math.Max(0, _canvas.Width - vw);
        int maxY = Math.Max(0, _canvas.Height - vh);
        nvx = Math.Clamp(nvx, 0, maxX);
        nvy = Math.Clamp(nvy, 0, maxY);
        SetScroll(new Point(nvx, nvy));
    }

    public void LoadFromFile(string path)
    {
        _sourceImage?.Dispose();
        _sourceImage = new Bitmap(path);
        _hasSelection = false;
        _selectionImageRect = Rectangle.Empty;
        _zoom = 1f;
        if (_scrollHost.ClientSize.Width < 1 || _scrollHost.ClientSize.Height < 1)
            _fitOnNextResize = true;
        else
            FitImageToViewport();
        UpdateCanvasSize();
        _canvas.Invalidate();
        ZoomFactorChanged?.Invoke(this, _zoom);
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    public void ClearImage()
    {
        _sourceImage?.Dispose();
        _sourceImage = null;
        _hasSelection = false;
        _selectionImageRect = Rectangle.Empty;
        _zoom = 1f;
        UpdateCanvasSize();
        SetScroll(Point.Empty);
        _canvas.Invalidate();
        ZoomFactorChanged?.Invoke(this, _zoom);
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    public void ZoomInAtCenter()
    {
        if (_sourceImage == null) return;
        var focus = GetViewportCenterInCanvasCoords();
        ApplyZoomAtCanvasPoint(focus, _zoom * 1.2f);
    }

    public void ZoomOutAtCenter()
    {
        if (_sourceImage == null) return;
        var focus = GetViewportCenterInCanvasCoords();
        ApplyZoomAtCanvasPoint(focus, _zoom / 1.2f);
    }

    public Bitmap? CreateCroppedSelection()
    {
        if (_sourceImage == null || !_hasSelection) return null;
        var r = NormalizeSelection();
        r.Intersect(new Rectangle(0, 0, _sourceImage.Width, _sourceImage.Height));
        if (r.Width < 1 || r.Height < 1) return null;
        return _sourceImage.Clone(r, _sourceImage.PixelFormat);
    }

    private void ScrollHost_MouseWheel(object? sender, MouseEventArgs e)
    {
        if (_sourceImage == null) return;
        var canvasPt = HostClientToCanvas(e.Location);
        float factor = e.Delta > 0 ? 1.1f : 1f / 1.1f;
        ApplyZoomAtCanvasPoint(canvasPt, _zoom * factor);
    }

    private PointF GetViewportCenterInCanvasCoords()
    {
        int hx = _scrollHost.HorizontalScroll.Value;
        int hy = _scrollHost.VerticalScroll.Value;
        var r = _scrollHost.ClientRectangle;
        return new PointF(hx + r.Width / 2f, hy + r.Height / 2f);
    }

    private PointF HostClientToCanvas(Point hostClient)
    {
        return new PointF(
            hostClient.X + _scrollHost.HorizontalScroll.Value,
            hostClient.Y + _scrollHost.VerticalScroll.Value);
    }

    private void OnScrollHostResize()
    {
        if (_sourceImage == null) return;
        if (_fitOnNextResize && _scrollHost.ClientSize.Width >= 1 && _scrollHost.ClientSize.Height >= 1)
        {
            _fitOnNextResize = false;
            FitImageToViewport();
            UpdateCanvasSize();
            _canvas.Invalidate();
            ZoomFactorChanged?.Invoke(this, _zoom);
        }
    }

    private void UpdateCanvasSize()
    {
        if (_sourceImage == null)
        {
            _canvas.Size = Size.Empty;
            return;
        }

        int w = Math.Max(1, (int)Math.Ceiling(_sourceImage.Width * _zoom));
        int h = Math.Max(1, (int)Math.Ceiling(_sourceImage.Height * _zoom));
        _canvas.Size = new Size(w, h);
    }

    private void SetScroll(Point scroll)
    {
        if (_scrollHost.IsDisposed) return;
        _scrollHost.AutoScrollPosition = new Point(-scroll.X, -scroll.Y);
    }

    private void ApplyZoomAtCanvasPoint(PointF canvasFocus, float newZoom)
    {
        if (_sourceImage == null) return;

        newZoom = Math.Clamp(newZoom, 0.05f, 20f);
        float hx = _scrollHost.HorizontalScroll.Value;
        float hy = _scrollHost.VerticalScroll.Value;

        float imgX = canvasFocus.X / _zoom;
        float imgY = canvasFocus.Y / _zoom;

        _zoom = newZoom;
        UpdateCanvasSize();
        _scrollHost.PerformLayout();

        float newCx = imgX * _zoom;
        float newCy = imgY * _zoom;
        float newHx = newCx - canvasFocus.X + hx;
        float newHy = newCy - canvasFocus.Y + hy;

        int maxX = Math.Max(0, _canvas.Width - _scrollHost.ClientRectangle.Width);
        int maxY = Math.Max(0, _canvas.Height - _scrollHost.ClientRectangle.Height);
        int sx = (int)Math.Round(Math.Clamp(newHx, 0, maxX));
        int sy = (int)Math.Round(Math.Clamp(newHy, 0, maxY));
        SetScroll(new Point(sx, sy));

        _canvas.Invalidate();
        ZoomFactorChanged?.Invoke(this, _zoom);
    }

    private void FitImageToViewport()
    {
        if (_sourceImage == null) return;
        var vp = _scrollHost.ClientSize;
        if (vp.Width < 1 || vp.Height < 1)
        {
            _zoom = 1f;
            return;
        }

        float zx = vp.Width / (float)_sourceImage.Width;
        float zy = vp.Height / (float)_sourceImage.Height;
        _zoom = Math.Clamp(Math.Min(zx, zy), 0.05f, 10f);
        UpdateCanvasSize();
        _scrollHost.PerformLayout();

        int maxX = Math.Max(0, _canvas.Width - vp.Width);
        int maxY = Math.Max(0, _canvas.Height - vp.Height);
        SetScroll(new Point(maxX / 2, maxY / 2));
    }

    private void CanvasMouseWheel(MouseEventArgs e)
    {
        if (_sourceImage == null) return;
        float factor = e.Delta > 0 ? 1.1f : 1f / 1.1f;
        ApplyZoomAtCanvasPoint(new PointF(e.Location.X, e.Location.Y), _zoom * factor);
    }

    private void CanvasMouseDown(MouseEventArgs e)
    {
        _canvas.Focus();
        if (_sourceImage == null || e.Button != MouseButtons.Left) return;
        _selecting = true;
        _selectStartCanvas = e.Location;
        _hasSelection = false;
        _canvas.Invalidate();
    }

    private void CanvasMouseMove(MouseEventArgs e)
    {
        if (!_selecting || _sourceImage == null) return;
        var a = CanvasToImage(_selectStartCanvas);
        var b = CanvasToImage(e.Location);
        int x1 = Math.Clamp(Math.Min(a.X, b.X), 0, _sourceImage.Width);
        int y1 = Math.Clamp(Math.Min(a.Y, b.Y), 0, _sourceImage.Height);
        int x2 = Math.Clamp(Math.Max(a.X, b.X), 0, _sourceImage.Width);
        int y2 = Math.Clamp(Math.Max(a.Y, b.Y), 0, _sourceImage.Height);
        _selectionImageRect = Rectangle.FromLTRB(x1, y1, x2, y2);
        _hasSelection = (x2 - x1) >= 1 && (y2 - y1) >= 1;
        _canvas.Invalidate();
    }

    private void CanvasMouseUp(MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Left)
        {
            _selecting = false;
            if (_hasSelection) SelectionChanged?.Invoke(this, EventArgs.Empty);
        }
    }

    private void PaintImage(Graphics g)
    {
        if (_sourceImage == null) return;

        g.SmoothingMode = SmoothingMode.HighQuality;
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;

        g.DrawImage(_sourceImage, new Rectangle(0, 0, _canvas.Width, _canvas.Height));

        if (_hasSelection && !_selectionImageRect.IsEmpty)
        {
            var r = new RectangleF(
                _selectionImageRect.X * _zoom,
                _selectionImageRect.Y * _zoom,
                _selectionImageRect.Width * _zoom,
                _selectionImageRect.Height * _zoom);
            using var pen = new Pen(Color.Red, 2f) { DashStyle = DashStyle.Dash };
            g.DrawRectangle(pen, r.X, r.Y, r.Width, r.Height);
        }
    }

    private Point CanvasToImage(Point canvasClient)
    {
        if (_sourceImage == null) return Point.Empty;
        int ix = (int)Math.Floor(canvasClient.X / _zoom);
        int iy = (int)Math.Floor(canvasClient.Y / _zoom);
        return new Point(ix, iy);
    }

    private Rectangle NormalizeSelection()
    {
        var r = _selectionImageRect;
        int x1 = Math.Min(r.Left, r.Right);
        int y1 = Math.Min(r.Top, r.Bottom);
        int x2 = Math.Max(r.Left, r.Right);
        int y2 = Math.Max(r.Top, r.Bottom);
        return Rectangle.FromLTRB(x1, y1, x2, y2);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) _sourceImage?.Dispose();
        base.Dispose(disposing);
    }

    private sealed class ImageCanvas : Panel
    {
        private readonly ImageEditorPanel _host;

        public ImageCanvas(ImageEditorPanel host)
        {
            _host = host;
            TabStop = true;
            Cursor = Cursors.Cross;
            Location = Point.Empty;
            SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint, true);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            _host.PaintImage(e.Graphics);
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            base.OnMouseDown(e);
            _host.CanvasMouseDown(e);
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            base.OnMouseMove(e);
            _host.CanvasMouseMove(e);
        }

        protected override void OnMouseUp(MouseEventArgs e)
        {
            base.OnMouseUp(e);
            _host.CanvasMouseUp(e);
        }

        protected override void OnMouseWheel(MouseEventArgs e)
        {
            _host.CanvasMouseWheel(e);
        }

        protected override bool IsInputKey(Keys keyData)
        {
            return keyData switch
            {
                Keys.Left or Keys.Right or Keys.Up or Keys.Down => true,
                _ => base.IsInputKey(keyData)
            };
        }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            if (_host.TryHandleArrowKey(e))
                return;
            base.OnKeyDown(e);
        }
    }
}
