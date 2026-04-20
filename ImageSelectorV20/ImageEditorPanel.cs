using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.ComponentModel;

namespace ImageSelectorV10;

internal enum SelectionShape
{
    Rectangle,
    Square,
    Ellipse,
    Circle,
    RoundedRectangle,
    RoundedSquare
}

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
    private SelectionShape _selectionShape = SelectionShape.Rectangle;
    private float _cornerRadiusRatio = 0.15f;
    private bool _adjustingCornerRadius;
    private PointF _imageDrawOffsetCanvas = PointF.Empty;
    private const float MinCornerRadiusRatio = 0f;
    private const float MaxCornerRadiusRatio = 0.5f;
    private const float CornerHandleRadiusCanvas = 6f;

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

    [Browsable(false)]
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public SelectionShape SelectionShape
    {
        get => _selectionShape;
        set
        {
            if (_selectionShape == value) return;
            _selectionShape = value;

            if (_hasSelection && _sourceImage != null)
            {
                var normalized = NormalizeSelection();
                if (IsSquareShape(_selectionShape))
                {
                    int side = Math.Max(1, Math.Min(normalized.Width, normalized.Height));
                    int x = Math.Min(normalized.X, _sourceImage.Width - side);
                    int y = Math.Min(normalized.Y, _sourceImage.Height - side);
                    _selectionImageRect = new Rectangle(Math.Max(0, x), Math.Max(0, y), side, side);
                }
                else
                {
                    _selectionImageRect = normalized;
                }
            }

            _canvas.Invalidate();
            SelectionChanged?.Invoke(this, EventArgs.Empty);
        }
    }

    [Browsable(false)]
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public float CornerRadiusRatio
    {
        get => _cornerRadiusRatio;
        set
        {
            float clamped = Math.Clamp(value, MinCornerRadiusRatio, MaxCornerRadiusRatio);
            if (Math.Abs(clamped - _cornerRadiusRatio) < 0.0001f) return;
            _cornerRadiusRatio = clamped;
            _canvas.Invalidate();
            SelectionChanged?.Invoke(this, EventArgs.Empty);
        }
    }

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
        if (IsSquareShape(_selectionShape))
        {
            int side = Math.Clamp(Math.Min(w, h), 1, Math.Min(_sourceImage.Width, _sourceImage.Height));
            w = side;
            h = side;
        }

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
        FocusCanvas();
    }

    /// <summary>이미지 캔버스에 포커스를 둡니다. 키보드(화살표 등) 입력을 받기 위해 사용합니다.</summary>
    public void FocusCanvas() => _canvas.Focus();

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

    private void ScrollSelectionIntoView()
    {
        if (_sourceImage == null || !_hasSelection) return;
        var r = NormalizeSelection();
        int vx = _scrollHost.HorizontalScroll.Value;
        int vy = _scrollHost.VerticalScroll.Value;
        int vw = _scrollHost.ClientRectangle.Width;
        int vh = _scrollHost.ClientRectangle.Height;

        int selL = (int)Math.Floor(_imageDrawOffsetCanvas.X + (r.X * _zoom));
        int selT = (int)Math.Floor(_imageDrawOffsetCanvas.Y + (r.Y * _zoom));
        int selR = (int)Math.Ceiling(_imageDrawOffsetCanvas.X + ((r.X + r.Width) * _zoom));
        int selB = (int)Math.Ceiling(_imageDrawOffsetCanvas.Y + ((r.Y + r.Height) * _zoom));

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
        if (!NeedsMaskedCrop(_selectionShape))
            return _sourceImage.Clone(r, _sourceImage.PixelFormat);

        var crop = new Bitmap(r.Width, r.Height, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(crop);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(Color.Transparent);
        using var path = CreateSelectionPath(
            new RectangleF(0, 0, r.Width, r.Height),
            _selectionShape,
            _cornerRadiusRatio);
        g.SetClip(path);
        g.DrawImage(_sourceImage, new Rectangle(0, 0, r.Width, r.Height), r, GraphicsUnit.Pixel);
        return crop;
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
            _scrollHost.AutoScrollMinSize = Size.Empty;
            _imageDrawOffsetCanvas = PointF.Empty;
            return;
        }

        int imageW = Math.Max(1, (int)Math.Ceiling(_sourceImage.Width * _zoom));
        int imageH = Math.Max(1, (int)Math.Ceiling(_sourceImage.Height * _zoom));
        int viewportW = Math.Max(1, _scrollHost.ClientSize.Width);
        int viewportH = Math.Max(1, _scrollHost.ClientSize.Height);
        int canvasW = Math.Max(imageW, viewportW);
        int canvasH = Math.Max(imageH, viewportH);
        _canvas.Size = new Size(canvasW, canvasH);
        _scrollHost.AutoScrollMinSize = _canvas.Size;
        _imageDrawOffsetCanvas = new PointF(
            (canvasW - imageW) / 2f,
            (canvasH - imageH) / 2f);
    }

    private void SetScroll(Point scroll)
    {
        if (_scrollHost.IsDisposed) return;
        _scrollHost.AutoScrollPosition = new Point(-scroll.X, -scroll.Y);
    }

    private void ApplyZoomAtCanvasPoint(PointF canvasFocus, float newZoom)
    {
        if (_sourceImage == null) return;

        float oldOffsetX = _imageDrawOffsetCanvas.X;
        float oldOffsetY = _imageDrawOffsetCanvas.Y;
        newZoom = Math.Clamp(newZoom, 0.05f, 20f);
        float hx = _scrollHost.HorizontalScroll.Value;
        float hy = _scrollHost.VerticalScroll.Value;

        float imgX = (canvasFocus.X - oldOffsetX) / _zoom;
        float imgY = (canvasFocus.Y - oldOffsetY) / _zoom;

        _zoom = newZoom;
        UpdateCanvasSize();
        _scrollHost.PerformLayout();

        float newCx = (imgX * _zoom) + _imageDrawOffsetCanvas.X;
        float newCy = (imgY * _zoom) + _imageDrawOffsetCanvas.Y;
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
        if (TryStartCornerRadiusAdjust(e.Location))
            return;
        _selecting = true;
        _selectStartCanvas = e.Location;
        _hasSelection = false;
        _canvas.Invalidate();
    }

    private void CanvasMouseMove(MouseEventArgs e)
    {
        if (_adjustingCornerRadius)
        {
            UpdateCornerRadiusFromCanvasPoint(e.Location);
            return;
        }
        if (!_selecting || _sourceImage == null) return;
        var a = CanvasToImage(_selectStartCanvas);
        var b = CanvasToImage(e.Location);
        Rectangle nextSelection;

        if (IsSquareShape(_selectionShape))
        {
            int dx = b.X - a.X;
            int dy = b.Y - a.Y;
            int side = Math.Min(Math.Abs(dx), Math.Abs(dy));
            int x2 = a.X + Math.Sign(dx) * side;
            int y2 = a.Y + Math.Sign(dy) * side;
            x2 = Math.Clamp(x2, 0, _sourceImage.Width);
            y2 = Math.Clamp(y2, 0, _sourceImage.Height);
            int x1 = Math.Clamp(Math.Min(a.X, x2), 0, _sourceImage.Width);
            int y1 = Math.Clamp(Math.Min(a.Y, y2), 0, _sourceImage.Height);
            int xr = Math.Clamp(Math.Max(a.X, x2), 0, _sourceImage.Width);
            int yb = Math.Clamp(Math.Max(a.Y, y2), 0, _sourceImage.Height);
            nextSelection = Rectangle.FromLTRB(x1, y1, xr, yb);
        }
        else
        {
            int x1 = Math.Clamp(Math.Min(a.X, b.X), 0, _sourceImage.Width);
            int y1 = Math.Clamp(Math.Min(a.Y, b.Y), 0, _sourceImage.Height);
            int x2 = Math.Clamp(Math.Max(a.X, b.X), 0, _sourceImage.Width);
            int y2 = Math.Clamp(Math.Max(a.Y, b.Y), 0, _sourceImage.Height);
            nextSelection = Rectangle.FromLTRB(x1, y1, x2, y2);
        }
        _selectionImageRect = nextSelection;
        _hasSelection = nextSelection.Width >= 1 && nextSelection.Height >= 1;
        _canvas.Invalidate();
    }

    private void CanvasMouseUp(MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Left)
        {
            if (_adjustingCornerRadius)
            {
                _adjustingCornerRadius = false;
                _canvas.Cursor = Cursors.Cross;
                return;
            }
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

        var imageRect = new RectangleF(
            _imageDrawOffsetCanvas.X,
            _imageDrawOffsetCanvas.Y,
            _sourceImage.Width * _zoom,
            _sourceImage.Height * _zoom);
        g.DrawImage(_sourceImage, imageRect);
        DrawZoomOverlay(g, imageRect);

        if (_hasSelection && !_selectionImageRect.IsEmpty)
        {
            var r = new RectangleF(
                _imageDrawOffsetCanvas.X + (_selectionImageRect.X * _zoom),
                _imageDrawOffsetCanvas.Y + (_selectionImageRect.Y * _zoom),
                _selectionImageRect.Width * _zoom,
                _selectionImageRect.Height * _zoom);
            using var pen = new Pen(Color.Red, 2f) { DashStyle = DashStyle.Dash };
            if (IsRoundedShape(_selectionShape))
            {
                using var path = CreateRoundedRectanglePath(r, GetCornerRadius(r.Size, _cornerRadiusRatio));
                g.DrawPath(pen, path);
                DrawCornerHandle(g, r);
            }
            else if (IsEllipseShape(_selectionShape))
            {
                g.DrawEllipse(pen, r);
            }
            else
            {
                g.DrawRectangle(pen, r.X, r.Y, r.Width, r.Height);
            }
        }
    }

    private Point CanvasToImage(Point canvasClient)
    {
        if (_sourceImage == null) return Point.Empty;
        int ix = (int)Math.Floor((canvasClient.X - _imageDrawOffsetCanvas.X) / _zoom);
        int iy = (int)Math.Floor((canvasClient.Y - _imageDrawOffsetCanvas.Y) / _zoom);
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

    private static bool IsSquareShape(SelectionShape shape) =>
        shape is SelectionShape.Square or SelectionShape.RoundedSquare or SelectionShape.Circle;

    private static bool IsRoundedShape(SelectionShape shape) =>
        shape is SelectionShape.RoundedRectangle or SelectionShape.RoundedSquare;

    private static bool IsEllipseShape(SelectionShape shape) =>
        shape is SelectionShape.Ellipse or SelectionShape.Circle;

    private static bool NeedsMaskedCrop(SelectionShape shape) =>
        IsRoundedShape(shape) || IsEllipseShape(shape);

    private static float GetCornerRadius(SizeF size, float ratio)
    {
        float minEdge = Math.Min(size.Width, size.Height);
        float maxRadius = minEdge * 0.5f;
        return Math.Clamp(minEdge * ratio, 0f, maxRadius);
    }

    private bool TryStartCornerRadiusAdjust(Point canvasPoint)
    {
        if (!_hasSelection || _sourceImage == null || !IsRoundedShape(_selectionShape))
            return false;

        var handleCenter = GetCornerHandleCenterCanvas();
        float dx = canvasPoint.X - handleCenter.X;
        float dy = canvasPoint.Y - handleCenter.Y;
        float hitRadius = Math.Max(10f, CornerHandleRadiusCanvas + 2f);
        if ((dx * dx) + (dy * dy) > hitRadius * hitRadius)
            return false;

        _adjustingCornerRadius = true;
        _canvas.Cursor = Cursors.SizeWE;
        UpdateCornerRadiusFromCanvasPoint(canvasPoint);
        return true;
    }

    private void UpdateCornerRadiusFromCanvasPoint(Point canvasPoint)
    {
        if (!_hasSelection || _sourceImage == null || !IsRoundedShape(_selectionShape))
            return;

        var r = new RectangleF(
            _imageDrawOffsetCanvas.X + (_selectionImageRect.X * _zoom),
            _imageDrawOffsetCanvas.Y + (_selectionImageRect.Y * _zoom),
            _selectionImageRect.Width * _zoom,
            _selectionImageRect.Height * _zoom);
        float minEdge = Math.Min(r.Width, r.Height);
        if (minEdge < 1f) return;

        float distanceFromRightEdge = Math.Clamp(r.Right - canvasPoint.X, 0f, minEdge * 0.5f);
        float ratio = distanceFromRightEdge / minEdge;
        CornerRadiusRatio = ratio;
    }

    private PointF GetCornerHandleCenterCanvas()
    {
        var r = new RectangleF(
            _imageDrawOffsetCanvas.X + (_selectionImageRect.X * _zoom),
            _imageDrawOffsetCanvas.Y + (_selectionImageRect.Y * _zoom),
            _selectionImageRect.Width * _zoom,
            _selectionImageRect.Height * _zoom);
        float radius = GetCornerRadius(r.Size, _cornerRadiusRatio);
        return new PointF(r.Right - radius, r.Top + radius);
    }

    private void DrawCornerHandle(Graphics g, RectangleF selectionCanvasRect)
    {
        float radius = GetCornerRadius(selectionCanvasRect.Size, _cornerRadiusRatio);
        float cx = selectionCanvasRect.Right - radius;
        float cy = selectionCanvasRect.Top + radius;
        float d = CornerHandleRadiusCanvas * 2f;
        var handleBounds = new RectangleF(cx - CornerHandleRadiusCanvas, cy - CornerHandleRadiusCanvas, d, d);

        using var fill = new SolidBrush(Color.FromArgb(230, 255, 255, 255));
        using var outline = new Pen(Color.Red, 1.5f);
        g.FillEllipse(fill, handleBounds);
        g.DrawEllipse(outline, handleBounds);
    }

    private void DrawZoomOverlay(Graphics g, RectangleF imageRect)
    {
        string zoomText = $"{_zoom * 100f:0.#}%";
        using var font = new Font("Segoe UI", 10f, FontStyle.Bold, GraphicsUnit.Point);
        SizeF textSize = g.MeasureString(zoomText, font);
        float pad = 4f;
        float viewportLeft = _scrollHost.HorizontalScroll.Value;
        float viewportTop = _scrollHost.VerticalScroll.Value;
        float viewportWidth = _scrollHost.ClientRectangle.Width;
        float viewportHeight = _scrollHost.ClientRectangle.Height;
        bool imageFitsViewport = imageRect.Width <= viewportWidth && imageRect.Height <= viewportHeight;
        float anchorX = imageFitsViewport ? viewportLeft + 8f : imageRect.Left + 8f;
        float anchorY = imageFitsViewport ? viewportTop + 8f : imageRect.Top + 8f;
        var textRect = new RectangleF(
            anchorX,
            anchorY,
            textSize.Width + (pad * 2f),
            textSize.Height + (pad * 2f));

        using var bg = new SolidBrush(Color.FromArgb(120, 0, 0, 0));
        using var fg = new SolidBrush(Color.Red);
        g.FillRectangle(bg, textRect);
        g.DrawString(zoomText, font, fg, textRect.Left + pad, textRect.Top + pad);
    }

    private static GraphicsPath CreateRoundedRectanglePath(RectangleF bounds, float radius)
    {
        var path = new GraphicsPath();
        float diameter = Math.Min(Math.Min(bounds.Width, bounds.Height), radius * 2f);
        float r = diameter / 2f;
        if (r <= 0f)
        {
            path.AddRectangle(bounds);
            path.CloseFigure();
            return path;
        }

        path.AddArc(bounds.Left, bounds.Top, diameter, diameter, 180, 90);
        path.AddArc(bounds.Right - diameter, bounds.Top, diameter, diameter, 270, 90);
        path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
        path.AddArc(bounds.Left, bounds.Bottom - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        return path;
    }

    private static GraphicsPath CreateSelectionPath(RectangleF bounds, SelectionShape shape, float cornerRadiusRatio)
    {
        if (IsRoundedShape(shape))
            return CreateRoundedRectanglePath(bounds, GetCornerRadius(bounds.Size, cornerRadiusRatio));

        var path = new GraphicsPath();
        if (IsEllipseShape(shape))
            path.AddEllipse(bounds);
        else
            path.AddRectangle(bounds);
        path.CloseFigure();
        return path;
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
    }
}
