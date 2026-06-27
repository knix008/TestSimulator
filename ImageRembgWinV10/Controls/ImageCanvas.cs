using ImageRembgWinV10.Localization;
using OpenCvSharp;
using OpenCvSharp.Extensions;
using CvPoint = OpenCvSharp.Point;

namespace ImageRembgWinV10.Controls;

public sealed class ImageCanvas : Control
{
    private const int BrushRadius = 12;
    private const int MinLassoPoints = 3;
    private const int MinSelectionPixels = 16;
    private const int MaxStrokePoints = 4096;
    private const int MinStrokeDistance = 2;
    private const int MaxDrawPoints = 512;
    private const float MinClientStrokeDistance = 0f;
    private const float SelectionOutlineWidth = 3.5f;
    private const float SelectionDashLength = 5f;
    private const float SelectionGapLength = 3f;
    private static readonly Color SelectionOutlineColor = Color.FromArgb(255, 255, 215, 0);

    private Bitmap? _sourceImage;
    private Bitmap? _resultImage;
    private Mat? _previewMask;
    private CvPoint[][] _contours = [];
    private CvPoint[][] _selectionOutlineContours = [];
    private Mat? _selectionMask;
    private Mat? _foregroundHintMask;
    private Mat? _backgroundHintMask;
    private readonly List<System.Drawing.Point> _activeStroke = [];
    private readonly List<PointF> _activeStrokeClient = [];
    private System.Drawing.Point _selectStartImage;
    private System.Drawing.Rectangle _draftSelectionRect = System.Drawing.Rectangle.Empty;
    private System.Drawing.Point _lastMouseImage;
    private bool _isDrawingStroke;
    private float _zoom = 1f;
    private PointF _panOffset;
    private bool _showResult;
    private bool _showMaskPreview = true;
    private InteractionMode _interactionMode = InteractionMode.Pan;
    private InteractionMode _strokeInteractionMode = InteractionMode.Pan;
    private bool _isPanning;
    private bool _isProcessing;
    private System.Drawing.Point _lastPanClient;
    private PointF? _strokePreviewClient;

    public ImageCanvas()
    {
        SetStyle(
            ControlStyles.AllPaintingInWmPaint |
            ControlStyles.UserPaint |
            ControlStyles.OptimizedDoubleBuffer |
            ControlStyles.ResizeRedraw,
            true);

        BackColor = Color.FromArgb(45, 45, 48);
        Cursor = Cursors.Hand;
        TabStop = true;
    }

    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    [System.ComponentModel.Browsable(false)]
    public InteractionMode InteractionMode
    {
        get => _interactionMode;
        set
        {
            _interactionMode = value;
            Cursor = value switch
            {
                InteractionMode.Pan => Cursors.Hand,
                InteractionMode.SelectFreehand or InteractionMode.SelectRectangle or InteractionMode.MarkForeground or InteractionMode.MarkBackground => Cursors.Cross,
                _ => Cursors.Default
            };
        }
    }

    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    [System.ComponentModel.Browsable(false)]
    public bool ShowResult
    {
        get => _showResult;
        set
        {
            _showResult = value;
            Invalidate();
        }
    }

    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    [System.ComponentModel.Browsable(false)]
    public bool ShowMaskPreview
    {
        get => _showMaskPreview;
        set
        {
            _showMaskPreview = value;
            Invalidate();
        }
    }

    public bool HasSelection => Services.SegmentationMaskBuilder.HasMaskContent(_selectionMask);

    public System.Drawing.Rectangle SelectionRectangle =>
        Services.SegmentationMaskBuilder.GetMaskBounds(_selectionMask)
        ?? System.Drawing.Rectangle.Empty;

    public IReadOnlyList<System.Drawing.Point> ForegroundPoints => [];

    public IReadOnlyList<System.Drawing.Point> BackgroundPoints => [];

    public float ZoomFactor => _zoom;

    public bool HasImage => _sourceImage != null;

    public System.Drawing.Size ImageSize => _sourceImage?.Size ?? System.Drawing.Size.Empty;

    public event EventHandler? ImageChanged;
    public event EventHandler? SelectionChanged;
    public event EventHandler? MarkersChanged;
    public event EventHandler<CanvasViewChangedEventArgs>? ViewChanged;

    public Mat GetSelectionMaskClone()
    {
        if (!HasSelection || _selectionMask == null)
        {
            throw new InvalidOperationException(L.Get("Exception.NoSelection"));
        }

        return _selectionMask.Clone();
    }

    public Mat? GetForegroundHintMaskClone()
    {
        return _foregroundHintMask?.Clone();
    }

    public Mat? GetBackgroundHintMaskClone()
    {
        return _backgroundHintMask?.Clone();
    }

    public void LoadSourceImage(Bitmap bitmap)
    {
        ArgumentNullException.ThrowIfNull(bitmap);

        _sourceImage?.Dispose();
        _resultImage?.Dispose();
        ClearPreview();
        ClearMasksInternal();

        _sourceImage = new Bitmap(bitmap);
        InitializeMasks(_sourceImage.Width, _sourceImage.Height);
        _showResult = false;
        FitToWindow();
        ImageChanged?.Invoke(this, EventArgs.Empty);
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        Invalidate();
    }

    public void SetResultImage(Bitmap? bitmap)
    {
        _resultImage?.Dispose();
        _resultImage = bitmap == null ? null : new Bitmap(bitmap);
        Invalidate();
    }

    public void SetContours(CvPoint[][] contours)
    {
        _contours = contours
            .Select(contour => Services.SegmentationMaskBuilder.SimplifyContourForDrawing(contour, MaxDrawPoints))
            .ToArray();
        if (!_isDrawingStroke)
        {
            Invalidate();
        }
    }

    public void SetProcessing(bool isProcessing)
    {
        _isProcessing = isProcessing;
    }

    public void SetPreviewMask(Mat? mask)
    {
        _previewMask?.Dispose();
        _previewMask = mask?.Clone();
        if (!_isDrawingStroke)
        {
            Invalidate();
        }
    }

    public void ClearPreview()
    {
        ClearPreviewWithoutInvalidate();
        Invalidate();
    }

    private void ClearPreviewWithoutInvalidate()
    {
        _previewMask?.Dispose();
        _previewMask = null;
        _contours = [];
    }

    public void ClearSelection()
    {
        ResetMask(_selectionMask);
        _activeStroke.Clear();
        _activeStrokeClient.Clear();
        _draftSelectionRect = System.Drawing.Rectangle.Empty;
        _selectionOutlineContours = [];
        ClearPreview();
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        Invalidate();
    }

    public void ClearMarkers()
    {
        ResetMask(_foregroundHintMask);
        ResetMask(_backgroundHintMask);
        MarkersChanged?.Invoke(this, EventArgs.Empty);
        Invalidate();
    }

    public void ZoomIn()
    {
        ApplyZoomAtViewportCenter(_zoom * 1.2f);
    }

    public void ZoomOut()
    {
        ApplyZoomAtViewportCenter(_zoom / 1.2f);
    }

    public void FitToWindow()
    {
        if (_sourceImage == null || ClientSize.Width <= 0 || ClientSize.Height <= 0)
        {
            return;
        }

        var scaleX = ClientSize.Width / (float)_sourceImage.Width;
        var scaleY = ClientSize.Height / (float)_sourceImage.Height;
        _zoom = Math.Clamp(Math.Min(scaleX, scaleY) * 0.95f, 0.05f, 20f);
        ConstrainViewTransform();
        NotifyViewChanged();
        Invalidate();
    }

    public bool TryGetImagePoint(System.Drawing.Point clientPoint, out System.Drawing.Point imagePoint)
    {
        imagePoint = System.Drawing.Point.Empty;
        if (_sourceImage == null)
        {
            return false;
        }

        var x = (int)Math.Floor((clientPoint.X - _panOffset.X) / _zoom);
        var y = (int)Math.Floor((clientPoint.Y - _panOffset.Y) / _zoom);
        if (x < 0 || y < 0 || x >= _sourceImage.Width || y >= _sourceImage.Height)
        {
            return false;
        }

        imagePoint = new System.Drawing.Point(x, y);
        return true;
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        Focus();

        if (_sourceImage == null)
        {
            return;
        }

        if ((e.Button == MouseButtons.Middle ||
             (_interactionMode == InteractionMode.Pan && e.Button == MouseButtons.Left)) &&
            CanPan())
        {
            _isPanning = true;
            _lastPanClient = e.Location;
            Cursor = Cursors.SizeAll;
            BeginInteractionCapture();
            return;
        }

        if (e.Button == MouseButtons.Left && _interactionMode == InteractionMode.SelectFreehand)
        {
            BeginFreehandStroke(e);
            return;
        }

        if (!TryGetImagePoint(e.Location, out var imagePoint))
        {
            return;
        }

        _lastMouseImage = imagePoint;

        if (e.Button != MouseButtons.Left)
        {
            return;
        }

        switch (_interactionMode)
        {
            case InteractionMode.SelectRectangle:
                _isDrawingStroke = true;
                _strokeInteractionMode = InteractionMode.SelectRectangle;
                BeginInteractionCapture();
                _selectStartImage = imagePoint;
                _strokePreviewClient = new PointF(e.X, e.Y);
                _draftSelectionRect = new System.Drawing.Rectangle(imagePoint.X, imagePoint.Y, 0, 0);
                _activeStroke.Clear();
                _selectionOutlineContours = [];
                ResetMask(_selectionMask);
                ClearPreviewWithoutInvalidate();
                SelectionChanged?.Invoke(this, EventArgs.Empty);
                Update();
                break;

            case InteractionMode.MarkForeground:
                _isDrawingStroke = true;
                _strokeInteractionMode = InteractionMode.MarkForeground;
                BeginInteractionCapture();
                PaintBrush(EnsureHintMask(ref _foregroundHintMask), imagePoint, imagePoint);
                ClearPreview();
                MarkersChanged?.Invoke(this, EventArgs.Empty);
                Invalidate();
                break;

            case InteractionMode.MarkBackground:
                _isDrawingStroke = true;
                _strokeInteractionMode = InteractionMode.MarkBackground;
                BeginInteractionCapture();
                PaintBrush(EnsureHintMask(ref _backgroundHintMask), imagePoint, imagePoint);
                ClearPreview();
                MarkersChanged?.Invoke(this, EventArgs.Empty);
                Invalidate();
                break;
        }
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        if (_isPanning)
        {
            if (!CanPan())
            {
                _isPanning = false;
                EndInteractionCapture();
                return;
            }

            var deltaX = e.X - _lastPanClient.X;
            var deltaY = e.Y - _lastPanClient.Y;
            if (deltaX != 0 || deltaY != 0)
            {
                _panOffset.X += deltaX;
                _panOffset.Y += deltaY;
                _lastPanClient = e.Location;
                ConstrainViewTransform();
                Invalidate();
            }

            return;
        }

        base.OnMouseMove(e);

        if (!_isDrawingStroke || _sourceImage == null)
        {
            return;
        }

        if (!TryGetImagePoint(e.Location, out var imagePoint))
        {
            imagePoint = ClampToImage(_lastMouseImage);
        }

        switch (_strokeInteractionMode)
        {
            case InteractionMode.SelectFreehand:
                _strokePreviewClient = new PointF(e.X, e.Y);
                AppendClientStrokePoint(_strokePreviewClient.Value);
                break;

            case InteractionMode.SelectRectangle:
                _draftSelectionRect = NormalizeRectangle(_selectStartImage, imagePoint);
                _strokePreviewClient = new PointF(e.X, e.Y);
                break;

            case InteractionMode.MarkForeground:
                PaintBrush(EnsureHintMask(ref _foregroundHintMask), _lastMouseImage, imagePoint);
                MarkersChanged?.Invoke(this, EventArgs.Empty);
                break;

            case InteractionMode.MarkBackground:
                PaintBrush(EnsureHintMask(ref _backgroundHintMask), _lastMouseImage, imagePoint);
                MarkersChanged?.Invoke(this, EventArgs.Empty);
                break;
        }

        _lastMouseImage = imagePoint;

        if (_strokeInteractionMode is InteractionMode.SelectFreehand or InteractionMode.SelectRectangle)
        {
            Invalidate();
            Update();
            return;
        }

        Invalidate();
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);

        if (_isPanning)
        {
            _isPanning = false;
            EndInteractionCapture();
            InteractionMode = _interactionMode;
            return;
        }

        if (!_isDrawingStroke)
        {
            return;
        }

        _isDrawingStroke = false;
        _strokePreviewClient = null;
        EndInteractionCapture();

        if (_strokeInteractionMode is InteractionMode.SelectFreehand or InteractionMode.SelectRectangle)
        {
            if (_strokeInteractionMode == InteractionMode.SelectFreehand)
            {
                PopulateImageStrokeFromClient();
                FinalizeLassoSelection();
                _activeStrokeClient.Clear();
            }
            else
            {
                FinalizeRectangleSelection();
            }

            SelectionChanged?.Invoke(this, EventArgs.Empty);
        }

        Invalidate();
    }

    protected override void OnMouseWheel(MouseEventArgs e)
    {
        if (_sourceImage == null || _isDrawingStroke || _isPanning)
        {
            return;
        }

        base.OnMouseWheel(e);
        var factor = e.Delta > 0 ? 1.15f : 1f / 1.15f;
        ApplyZoomAtViewportCenter(_zoom * factor);
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        ConstrainViewTransform();
        Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);

        var image = _showResult && _resultImage != null ? _resultImage : _sourceImage;
        if (image == null)
        {
            DrawPlaceholder(e.Graphics);
            return;
        }

        var destRect = GetImageDisplayRect(image.Size);

        DrawBaseLayer(e.Graphics, image, fastImageQuality: _isDrawingStroke);

        if (!_showResult && !_isProcessing && !_isDrawingStroke)
        {
            if (_showMaskPreview && _previewMask != null)
            {
                DrawMaskOverlay(e.Graphics, destRect);
            }

            DrawHintMaskOverlay(e.Graphics, destRect, _foregroundHintMask, Color.FromArgb(90, 80, 220, 100));
            DrawHintMaskOverlay(e.Graphics, destRect, _backgroundHintMask, Color.FromArgb(90, 240, 80, 80));
            DrawContours(e.Graphics, destRect);
        }

        if (_isDrawingStroke)
        {
            DrawSelection(e.Graphics);
        }
        else if (!_showResult && !_isProcessing && HasSelection)
        {
            DrawSelection(e.Graphics);
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _sourceImage?.Dispose();
            _resultImage?.Dispose();
            _previewMask?.Dispose();
            _selectionMask?.Dispose();
            _foregroundHintMask?.Dispose();
            _backgroundHintMask?.Dispose();
        }

        base.Dispose(disposing);
    }

    private void InitializeMasks(int width, int height)
    {
        _selectionMask?.Dispose();
        _foregroundHintMask?.Dispose();
        _backgroundHintMask?.Dispose();

        _selectionMask = new Mat(height, width, MatType.CV_8UC1, Scalar.Black);
        _foregroundHintMask = new Mat(height, width, MatType.CV_8UC1, Scalar.Black);
        _backgroundHintMask = new Mat(height, width, MatType.CV_8UC1, Scalar.Black);
    }

    private void ClearMasksInternal()
    {
        _selectionMask?.Dispose();
        _foregroundHintMask?.Dispose();
        _backgroundHintMask?.Dispose();
        _selectionMask = null;
        _foregroundHintMask = null;
        _backgroundHintMask = null;
        _activeStroke.Clear();
        _activeStrokeClient.Clear();
        _selectionOutlineContours = [];
    }

    private void AppendClientStrokePoint(PointF clientPoint)
    {
        if (_activeStrokeClient.Count >= MaxStrokePoints)
        {
            return;
        }

        if (_activeStrokeClient.Count > 0)
        {
            var last = _activeStrokeClient[^1];
            var dx = clientPoint.X - last.X;
            var dy = clientPoint.Y - last.Y;
            if (dx * dx + dy * dy < MinClientStrokeDistance)
            {
                return;
            }
        }

        _activeStrokeClient.Add(clientPoint);
    }

    private void PopulateImageStrokeFromClient()
    {
        _activeStroke.Clear();
        if (_sourceImage == null || _activeStrokeClient.Count == 0)
        {
            return;
        }

        foreach (var clientPoint in _activeStrokeClient)
        {
            var imagePoint = ClientPointToImage(clientPoint);
            if (_activeStroke.Count > 0 && _activeStroke[^1] == imagePoint)
            {
                continue;
            }

            _activeStroke.Add(imagePoint);
        }
    }

    private System.Drawing.Point ClientPointToImage(PointF clientPoint)
    {
        return new System.Drawing.Point(
            Math.Clamp((int)Math.Floor((clientPoint.X - _panOffset.X) / _zoom), 0, _sourceImage!.Width - 1),
            Math.Clamp((int)Math.Floor((clientPoint.Y - _panOffset.Y) / _zoom), 0, _sourceImage!.Height - 1));
    }

    private static void ResetMask(Mat? mask)
    {
        if (mask == null || mask.Empty())
        {
            return;
        }

        mask.SetTo(Scalar.Black);
    }

    private Mat EnsureHintMask(ref Mat? mask)
    {
        if (_sourceImage == null)
        {
            throw new InvalidOperationException(L.Get("Exception.NoImageLoaded"));
        }

        mask ??= new Mat(_sourceImage.Height, _sourceImage.Width, MatType.CV_8UC1, Scalar.Black);
        return mask;
    }

    private void AppendStrokePoint(System.Drawing.Point imagePoint)
    {
        if (_activeStroke.Count >= MaxStrokePoints)
        {
            return;
        }

        if (_activeStroke.Count == 0)
        {
            _activeStroke.Add(imagePoint);
            return;
        }

        var last = _activeStroke[^1];
        if (last == imagePoint)
        {
            return;
        }

        var dx = imagePoint.X - last.X;
        var dy = imagePoint.Y - last.Y;
        if (dx * dx + dy * dy < MinStrokeDistance * MinStrokeDistance)
        {
            return;
        }

        var steps = Math.Max(Math.Abs(dx), Math.Abs(dy));
        if (steps <= 1)
        {
            _activeStroke.Add(imagePoint);
            return;
        }

        var stride = Math.Max(1, steps / 8);
        for (var step = stride; step <= steps; step += stride)
        {
            if (_activeStroke.Count >= MaxStrokePoints)
            {
                break;
            }

            var x = last.X + dx * step / steps;
            var y = last.Y + dy * step / steps;
            _activeStroke.Add(new System.Drawing.Point(x, y));
        }
    }

    private void FinalizeLassoSelection()
    {
        if (_selectionMask == null || _activeStroke.Count < MinLassoPoints)
        {
            _activeStroke.Clear();
            _selectionOutlineContours = [];
            ResetMask(_selectionMask);
            return;
        }

        var contour = BuildLassoContour(_activeStroke);
        if (contour.Length < MinLassoPoints)
        {
            _activeStroke.Clear();
            _selectionOutlineContours = [];
            ResetMask(_selectionMask);
            return;
        }

        using var temp = new Mat(_selectionMask.Size(), MatType.CV_8UC1, Scalar.Black);
        Cv2.FillPoly(temp, [contour], Scalar.White);

        if (Cv2.CountNonZero(temp) < MinSelectionPixels)
        {
            ResetMask(_selectionMask);
            _activeStroke.Clear();
            _selectionOutlineContours = [];
            return;
        }

        temp.CopyTo(_selectionMask);
        UpdateSelectionOutlineContours();
        _activeStroke.Clear();
    }

    private static CvPoint[] BuildLassoContour(IReadOnlyList<System.Drawing.Point> stroke)
    {
        var contour = stroke
            .Select(point => new CvPoint(point.X, point.Y))
            .ToArray();

        if (contour.Length <= 3)
        {
            return contour;
        }

        var epsilon = Math.Max(1.0, Cv2.ArcLength(contour, false) / MaxDrawPoints);
        var simplified = Cv2.ApproxPolyDP(contour, epsilon, true);
        return simplified.Length >= MinLassoPoints ? simplified : contour;
    }

    private void UpdateSelectionOutlineContours()
    {
        if (_selectionMask == null || !HasSelection)
        {
            _selectionOutlineContours = [];
            return;
        }

        using var maskCopy = _selectionMask.Clone();
        Cv2.FindContours(
            maskCopy,
            out var contours,
            out _,
            RetrievalModes.External,
            ContourApproximationModes.ApproxSimple);

        _selectionOutlineContours = contours
            .Select(contour => Services.SegmentationMaskBuilder.SimplifyContourForDrawing(contour, MaxDrawPoints))
            .ToArray();
    }

    private void FinalizeRectangleSelection()
    {
        if (_selectionMask == null)
        {
            _draftSelectionRect = System.Drawing.Rectangle.Empty;
            return;
        }

        if (_draftSelectionRect.Width < 4 || _draftSelectionRect.Height < 4)
        {
            ResetMask(_selectionMask);
            _draftSelectionRect = System.Drawing.Rectangle.Empty;
            return;
        }

        ResetMask(_selectionMask);
        Cv2.Rectangle(
            _selectionMask,
            new Rect(_draftSelectionRect.X, _draftSelectionRect.Y, _draftSelectionRect.Width, _draftSelectionRect.Height),
            Scalar.White,
            -1);
        UpdateSelectionOutlineContours();
        _draftSelectionRect = System.Drawing.Rectangle.Empty;
    }

    private static System.Drawing.Rectangle NormalizeRectangle(System.Drawing.Point a, System.Drawing.Point b)
    {
        return System.Drawing.Rectangle.FromLTRB(
            Math.Min(a.X, b.X),
            Math.Min(a.Y, b.Y),
            Math.Max(a.X, b.X),
            Math.Max(a.Y, b.Y));
    }

    private static void PaintBrush(Mat mask, System.Drawing.Point from, System.Drawing.Point to)
    {
        Cv2.Line(
            mask,
            new CvPoint(from.X, from.Y),
            new CvPoint(to.X, to.Y),
            Scalar.White,
            BrushRadius * 2,
            LineTypes.AntiAlias);

        Cv2.Circle(mask, new CvPoint(to.X, to.Y), BrushRadius, Scalar.White, -1, LineTypes.AntiAlias);
    }

    private void ApplyZoomAtViewportCenter(float newZoom)
    {
        if (_sourceImage == null)
        {
            return;
        }

        var anchorImage = GetImagePointAtViewportCenter();
        _zoom = Math.Clamp(newZoom, 0.05f, 20f);

        if (IsImageSmallerThanViewport())
        {
            ConstrainViewTransform();
        }
        else
        {
            var center = GetViewportCenter();
            _panOffset.X = center.X - anchorImage.X * _zoom;
            _panOffset.Y = center.Y - anchorImage.Y * _zoom;
            ConstrainViewTransform();
        }

        NotifyViewChanged();
        Invalidate();
    }

    private PointF GetViewportCenter() =>
        new(ClientSize.Width / 2f, ClientSize.Height / 2f);

    private PointF GetImagePointAtViewportCenter()
    {
        var center = GetViewportCenter();
        var imageX = (center.X - _panOffset.X) / _zoom;
        var imageY = (center.Y - _panOffset.Y) / _zoom;

        if (_sourceImage != null)
        {
            imageX = Math.Clamp(imageX, 0, _sourceImage.Width);
            imageY = Math.Clamp(imageY, 0, _sourceImage.Height);
        }

        return new PointF(imageX, imageY);
    }

    private bool IsImageSmallerThanViewport()
    {
        if (_sourceImage == null || ClientSize.Width <= 0 || ClientSize.Height <= 0)
        {
            return true;
        }

        var displayWidth = _sourceImage.Width * _zoom;
        var displayHeight = _sourceImage.Height * _zoom;
        return displayWidth <= ClientSize.Width && displayHeight <= ClientSize.Height;
    }

    private bool CanPan() => _sourceImage != null && !IsImageSmallerThanViewport();

    private void ConstrainViewTransform()
    {
        if (_sourceImage == null || ClientSize.Width <= 0 || ClientSize.Height <= 0)
        {
            return;
        }

        var displayWidth = _sourceImage.Width * _zoom;
        var displayHeight = _sourceImage.Height * _zoom;

        if (displayWidth <= ClientSize.Width)
        {
            _panOffset.X = (ClientSize.Width - displayWidth) / 2f;
        }
        else
        {
            _panOffset.X = Math.Clamp(_panOffset.X, ClientSize.Width - displayWidth, 0);
        }

        if (displayHeight <= ClientSize.Height)
        {
            _panOffset.Y = (ClientSize.Height - displayHeight) / 2f;
        }
        else
        {
            _panOffset.Y = Math.Clamp(_panOffset.Y, ClientSize.Height - displayHeight, 0);
        }
    }

    private void NotifyViewChanged()
    {
        ViewChanged?.Invoke(this, new CanvasViewChangedEventArgs { Zoom = _zoom });
    }

    private void BeginInteractionCapture()
    {
        Capture = true;
    }

    private void BeginFreehandStroke(MouseEventArgs e)
    {
        _isDrawingStroke = true;
        _strokeInteractionMode = InteractionMode.SelectFreehand;
        BeginInteractionCapture();
        _activeStroke.Clear();
        _activeStrokeClient.Clear();
        _strokePreviewClient = new PointF(e.X, e.Y);
        _activeStrokeClient.Add(_strokePreviewClient.Value);
        _draftSelectionRect = System.Drawing.Rectangle.Empty;
        _selectionOutlineContours = [];
        ResetMask(_selectionMask);
        ClearPreviewWithoutInvalidate();
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        Invalidate();
        Update();
    }

    private void EndInteractionCapture()
    {
        if (Capture)
        {
            Capture = false;
        }
    }

    private void DrawBaseLayer(Graphics g, Bitmap image, bool fastImageQuality)
    {
        g.Clear(BackColor);
        var destRect = GetImageDisplayRect(image.Size);
        DrawCheckerboard(g, destRect);
        g.InterpolationMode = fastImageQuality
            ? System.Drawing.Drawing2D.InterpolationMode.Bilinear
            : System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
        g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
        g.DrawImage(image, destRect);
    }

    private PointF[] BuildFreehandPreviewPoints()
    {
        if (_activeStrokeClient.Count == 0)
        {
            return _strokePreviewClient.HasValue
                ? [_strokePreviewClient.Value]
                : [];
        }

        var points = new PointF[_activeStrokeClient.Count + 1];
        _activeStrokeClient.CopyTo(points);
        points[^1] = _strokePreviewClient ?? _activeStrokeClient[^1];
        return points;
    }

    private void DrawLiveRectangleSelection(Graphics g)
    {
        if (!_strokePreviewClient.HasValue)
        {
            return;
        }

        var startClient = ImageToClient(_selectStartImage);
        var endClient = _strokePreviewClient.Value;
        var rect = System.Drawing.RectangleF.FromLTRB(
            Math.Min(startClient.X, endClient.X),
            Math.Min(startClient.Y, endClient.Y),
            Math.Max(startClient.X, endClient.X),
            Math.Max(startClient.Y, endClient.Y));
        DrawDashedRectangle(g, rect);
    }

    private System.Drawing.SizeF GetImageDisplaySize(System.Drawing.Size imageSize)
    {
        return new System.Drawing.SizeF(imageSize.Width * _zoom, imageSize.Height * _zoom);
    }

    private System.Drawing.RectangleF GetImageDisplayRect(System.Drawing.Size imageSize)
    {
        var size = GetImageDisplaySize(imageSize);
        return new RectangleF(_panOffset.X, _panOffset.Y, size.Width, size.Height);
    }

    private PointF ImageToClient(System.Drawing.Point imagePoint)
    {
        return new PointF(
            _panOffset.X + imagePoint.X * _zoom,
            _panOffset.Y + imagePoint.Y * _zoom);
    }

    private System.Drawing.Point ClampToImage(System.Drawing.Point point)
    {
        if (_sourceImage == null)
        {
            return point;
        }

        return new System.Drawing.Point(
            Math.Clamp(point.X, 0, _sourceImage.Width - 1),
            Math.Clamp(point.Y, 0, _sourceImage.Height - 1));
    }

    private void DrawPlaceholder(Graphics g)
    {
        using var font = new Font(Font.FontFamily, 11f, FontStyle.Regular);
        using var brush = new SolidBrush(Color.FromArgb(180, 220, 220, 220));
        using var format = new StringFormat
        {
            Alignment = StringAlignment.Center,
            LineAlignment = StringAlignment.Center
        };
        g.DrawString(L.Get("Canvas.EmptyHint"), font, brush, ClientRectangle, format);
    }

    private static void DrawCheckerboard(Graphics g, RectangleF bounds)
    {
        if (bounds.Width <= 0 || bounds.Height <= 0)
        {
            return;
        }

        const int cell = 12;
        using var light = new SolidBrush(Color.FromArgb(255, 230, 230, 230));
        using var dark = new SolidBrush(Color.FromArgb(255, 200, 200, 200));
        g.FillRectangle(light, bounds);

        var startX = (int)Math.Floor(bounds.X);
        var startY = (int)Math.Floor(bounds.Y);
        var endX = (int)Math.Ceiling(bounds.Right);
        var endY = (int)Math.Ceiling(bounds.Bottom);

        for (var y = startY; y < endY; y += cell)
        {
            for (var x = startX; x < endX; x += cell)
            {
                var row = (y - startY) / cell;
                var col = (x - startX) / cell;
                if ((row + col) % 2 == 0)
                {
                    continue;
                }

                var tile = Rectangle.Intersect(
                    new Rectangle(x, y, cell, cell),
                    Rectangle.Round(bounds));
                if (tile.Width > 0 && tile.Height > 0)
                {
                    g.FillRectangle(dark, tile);
                }
            }
        }
    }

    private void DrawMaskOverlay(Graphics g, RectangleF destRect)
    {
        if (_previewMask == null || _sourceImage == null)
        {
            return;
        }

        using var maskBitmap = BitmapConverter.ToBitmap(_previewMask);
        using var tint = new Bitmap(maskBitmap.Width, maskBitmap.Height);
        using (var tg = Graphics.FromImage(tint))
        {
            tg.Clear(Color.FromArgb(110, 0, 200, 120));
        }

        using var attributes = new System.Drawing.Imaging.ImageAttributes();
        attributes.SetColorMatrix(new System.Drawing.Imaging.ColorMatrix
        {
            Matrix33 = 0.45f
        });
        attributes.SetColorKey(Color.FromArgb(0, 0, 0), Color.FromArgb(0, 0, 0));

        var dest = Rectangle.Round(destRect);
        g.DrawImage(maskBitmap, dest, 0, 0, maskBitmap.Width, maskBitmap.Height, GraphicsUnit.Pixel, attributes);
        g.DrawImage(tint, dest, 0, 0, tint.Width, tint.Height, GraphicsUnit.Pixel, attributes);
    }

    private void DrawHintMaskOverlay(Graphics g, RectangleF destRect, Mat? hintMask, Color tintColor)
    {
        if (hintMask == null || hintMask.Empty() || Cv2.CountNonZero(hintMask) == 0)
        {
            return;
        }

        using var maskBitmap = BitmapConverter.ToBitmap(hintMask);
        using var tint = new Bitmap(maskBitmap.Width, maskBitmap.Height);
        using (var tintGraphics = Graphics.FromImage(tint))
        {
            tintGraphics.Clear(tintColor);
        }

        using var attributes = new System.Drawing.Imaging.ImageAttributes();
        attributes.SetColorMatrix(new System.Drawing.Imaging.ColorMatrix
        {
            Matrix33 = 0.55f
        });
        attributes.SetColorKey(Color.Black, Color.Black);

        var dest = Rectangle.Round(destRect);
        g.DrawImage(tint, dest, 0, 0, tint.Width, tint.Height, GraphicsUnit.Pixel, attributes);
    }

    private void DrawSelection(Graphics g)
    {
        if (_sourceImage == null)
        {
            return;
        }

        var previousSmoothing = g.SmoothingMode;
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        if (_isDrawingStroke && _strokeInteractionMode == InteractionMode.SelectFreehand)
        {
            DrawLiveFreehandSelection(g);
            g.SmoothingMode = previousSmoothing;
            return;
        }

        if (_isDrawingStroke && _strokeInteractionMode == InteractionMode.SelectRectangle)
        {
            DrawLiveRectangleSelection(g);
            g.SmoothingMode = previousSmoothing;
            return;
        }

        if (_selectionOutlineContours.Length > 0)
        {
            DrawSelectionContours(g, _selectionOutlineContours);
        }
        else if (HasSelection)
        {
            DrawSelectionBoundsFallback(g);
        }

        g.SmoothingMode = previousSmoothing;
    }

    private void DrawSelectionBoundsFallback(Graphics g)
    {
        var bounds = SelectionRectangle;
        if (bounds.Width <= 0 || bounds.Height <= 0)
        {
            return;
        }

        var topLeft = ImageToClient(bounds.Location);
        var bottomRight = ImageToClient(new System.Drawing.Point(bounds.Right, bounds.Bottom));
        var rect = System.Drawing.RectangleF.FromLTRB(topLeft.X, topLeft.Y, bottomRight.X, bottomRight.Y);
        DrawDashedRectangle(g, rect);
    }

    private void DrawSelectionContours(Graphics g, CvPoint[][] contours)
    {
        foreach (var contour in contours)
        {
            if (contour.Length < 2)
            {
                continue;
            }

            var points = contour
                .Select(point => ImageToClient(new System.Drawing.Point(point.X, point.Y)))
                .ToArray();

            DrawDashedPolyline(g, points, closed: points.Length >= 3);
        }
    }

    private void DrawDashedRectangle(Graphics g, RectangleF rect)
    {
        var points = new[]
        {
            new PointF(rect.Left, rect.Top),
            new PointF(rect.Right, rect.Top),
            new PointF(rect.Right, rect.Bottom),
            new PointF(rect.Left, rect.Bottom)
        };

        DrawDashedPolyline(g, points, closed: true);
    }

    private void DrawLiveFreehandSelection(Graphics g)
    {
        var points = BuildFreehandPreviewPoints();
        if (points.Length == 0)
        {
            return;
        }

        if (points.Length == 1)
        {
            DrawSelectionHandle(g, points[0]);
            return;
        }

        DrawYellowDashedPolyline(g, points, closed: false);
    }

    private static void DrawSelectionHandle(Graphics g, PointF point)
    {
        var radius = SelectionOutlineWidth;
        using var brush = new SolidBrush(SelectionOutlineColor);
        g.FillEllipse(brush, point.X - radius, point.Y - radius, radius * 2f, radius * 2f);
    }

    private static void DrawYellowDashedPolyline(Graphics g, PointF[] points, bool closed)
    {
        if (points.Length < 2)
        {
            return;
        }

        using var pen = new Pen(SelectionOutlineColor, SelectionOutlineWidth)
        {
            LineJoin = System.Drawing.Drawing2D.LineJoin.Round,
            StartCap = System.Drawing.Drawing2D.LineCap.Flat,
            EndCap = System.Drawing.Drawing2D.LineCap.Flat,
        };

        var cycleLength = SelectionDashLength + SelectionGapLength;
        var pathDistance = 0f;
        var segmentCount = closed ? points.Length : points.Length - 1;

        for (var i = 0; i < segmentCount; i++)
        {
            var from = points[i];
            var to = points[(i + 1) % points.Length];
            var dx = to.X - from.X;
            var dy = to.Y - from.Y;
            var segmentLength = MathF.Sqrt(dx * dx + dy * dy);
            if (segmentLength < 0.01f)
            {
                continue;
            }

            var unitX = dx / segmentLength;
            var unitY = dy / segmentLength;
            var t = 0f;

            while (t < segmentLength)
            {
                var cyclePos = (pathDistance + t) % cycleLength;
                var inDash = cyclePos < SelectionDashLength;
                var remainingInPhase = inDash
                    ? SelectionDashLength - cyclePos
                    : cycleLength - cyclePos;
                var advance = MathF.Min(remainingInPhase, segmentLength - t);

                if (inDash)
                {
                    g.DrawLine(
                        pen,
                        from.X + unitX * t,
                        from.Y + unitY * t,
                        from.X + unitX * (t + advance),
                        from.Y + unitY * (t + advance));
                }

                t += advance;
            }

            pathDistance += segmentLength;
        }
    }

    private void DrawDashedPolyline(Graphics g, PointF[] points, bool closed)
    {
        DrawYellowDashedPolyline(g, points, closed);
    }

    private void DrawContourPaths(Graphics g, Pen pen, CvPoint[][] contours)
    {
        foreach (var contour in contours)
        {
            if (contour.Length < 2)
            {
                continue;
            }

            var points = contour
                .Select(point => ImageToClient(new System.Drawing.Point(point.X, point.Y)))
                .Select(point => new PointF(point.X, point.Y))
                .ToArray();

            if (points.Length >= 3)
            {
                g.DrawPolygon(pen, points);
            }
            else
            {
                g.DrawLines(pen, points);
            }
        }
    }

    private static IReadOnlyList<System.Drawing.Point> SubsampleStrokePoints(
        IReadOnlyList<System.Drawing.Point> stroke,
        int maxPoints)
    {
        if (stroke.Count <= maxPoints)
        {
            return stroke;
        }

        var step = Math.Max(1, stroke.Count / maxPoints);
        var sampled = new List<System.Drawing.Point>(maxPoints);
        for (var i = 0; i < stroke.Count && sampled.Count < maxPoints; i += step)
        {
            sampled.Add(stroke[i]);
        }

        return sampled;
    }

    private void DrawContours(Graphics g, RectangleF destRect)
    {
        if (_contours.Length == 0 || _sourceImage == null)
        {
            return;
        }

        using var pen = new Pen(Color.FromArgb(250, 0, 255, 140), 2.5f);
        pen.LineJoin = System.Drawing.Drawing2D.LineJoin.Round;
        DrawContourPaths(g, pen, _contours);
    }
}
