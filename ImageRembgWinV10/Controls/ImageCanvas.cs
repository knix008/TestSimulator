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
    private const float MinClientStrokeDistance = 2f;
    private const float SelectionOutlineWidth = 5.5f;
    private const float LiveFreehandOutlineWidth = 6f;
    private const float SelectionDashLength = 6f;
    private const float SelectionGapLength = 4f;
    private static readonly Color SelectionOutlineColor = Color.FromArgb(255, 255, 215, 0);

    private Bitmap? _sourceImage;
    private Bitmap? _resultImage;
    private Mat? _previewMask;
    private CvPoint[][] _contours = [];
    private CvPoint[][] _selectionOutlineContours = [];
    private Mat? _selectionMask;
    private Mat? _foregroundHintMask;
    private Mat? _backgroundHintMask;
    private const int MaxUndoHistory = 30;
    private readonly List<SelectionSnapshot> _undoStack = [];
    private readonly List<SelectionSnapshot> _redoStack = [];
    private SelectionSnapshot? _pendingSnapshot;
    private readonly List<System.Drawing.Point> _activeStroke = [];
    private readonly List<PointF> _activeStrokeClient = [];
    private System.Drawing.Point _selectStartImage;
    private System.Drawing.Rectangle _draftSelectionRect = System.Drawing.Rectangle.Empty;
    private System.Drawing.Point _lastMouseImage;
    private bool _isDrawingStroke;
    private float _zoom = 1f;
    private PointF _panOffset;
    private System.Drawing.Size _lastViewportSize;
    private bool _showResult;
    private bool _showMaskPreview = true;
    private InteractionMode _interactionMode = InteractionMode.Pan;
    private InteractionMode _strokeInteractionMode = InteractionMode.Pan;
    private bool _isPanning;
    private bool _isProcessing;
    private System.Drawing.Point _lastPanClient;
    private System.Drawing.Point _lastClientMousePoint;
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
        Cursor = Cursors.Default;
        TabStop = true;
    }

    private void UpdateHoverCursor(System.Drawing.Point clientPoint)
    {
        if (_isPanning)
        {
            return;
        }

        if (_sourceImage == null || !TryGetImagePoint(clientPoint, out _))
        {
            Cursor = Cursors.Default;
            return;
        }

        Cursor = _interactionMode switch
        {
            InteractionMode.Pan => Cursors.Hand,
            InteractionMode.SelectFreehand or InteractionMode.SelectRectangle
                or InteractionMode.MarkForeground or InteractionMode.MarkBackground => Cursors.Cross,
            _ => Cursors.Default
        };
    }

    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    [System.ComponentModel.Browsable(false)]
    public InteractionMode InteractionMode
    {
        get => _interactionMode;
        set
        {
            _interactionMode = value;
            UpdateHoverCursor(_lastClientMousePoint);
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
            RequestHostLayout();
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

    public SizeF GetDisplaySize()
    {
        var image = CurrentDisplayImage;
        if (image == null)
        {
            return SizeF.Empty;
        }

        return GetImageDisplaySize(image.Size);
    }

    private Bitmap? CurrentDisplayImage => _showResult && _resultImage != null ? _resultImage : _sourceImage;

    internal void SyncViewAfterLayout()
    {
        ConstrainViewTransform();
        Invalidate();
    }

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
        _resultImage = null;
        ClearPreview();
        ClearMasksInternal();

        _sourceImage = new Bitmap(bitmap);
        InitializeMasks(_sourceImage.Width, _sourceImage.Height);
        _showResult = false;
        FitToWindow();
        ImageChanged?.Invoke(this, EventArgs.Empty);
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        UpdateHoverCursor(_lastClientMousePoint);
        Invalidate();
    }

    public void SetResultImage(Bitmap? bitmap)
    {
        _resultImage?.Dispose();
        _resultImage = bitmap == null ? null : new Bitmap(bitmap);
        if (_showResult)
        {
            RequestHostLayout();
        }

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
        BeginUndoableChange();
        ResetMask(_selectionMask);
        _activeStroke.Clear();
        _activeStrokeClient.Clear();
        _draftSelectionRect = System.Drawing.Rectangle.Empty;
        _selectionOutlineContours = [];
        CommitUndoableChange();
        ClearPreview();
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        Invalidate();
    }

    public void ClearMarkers()
    {
        BeginUndoableChange();
        ResetMask(_foregroundHintMask);
        ResetMask(_backgroundHintMask);
        CommitUndoableChange();
        MarkersChanged?.Invoke(this, EventArgs.Empty);
        Invalidate();
    }

    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    [System.ComponentModel.Browsable(false)]
    public bool CanUndo => _undoStack.Count > 0;

    [System.ComponentModel.DesignerSerializationVisibility(System.ComponentModel.DesignerSerializationVisibility.Hidden)]
    [System.ComponentModel.Browsable(false)]
    public bool CanRedo => _redoStack.Count > 0;

    public event EventHandler? UndoRedoStateChanged;

    public event EventHandler? StateRestored;

    public Mat? GetPreviewMaskClone() => _previewMask?.Clone();

    public Bitmap? GetResultImageClone() => _resultImage == null ? null : new Bitmap(_resultImage);

    public void Undo()
    {
        if (_undoStack.Count == 0)
        {
            return;
        }

        var previous = PopLast(_undoStack);
        PushBounded(_redoStack, CaptureSnapshot());
        RestoreSnapshot(previous);
        previous.Dispose();

        FinishUndoRedo();
    }

    public void Redo()
    {
        if (_redoStack.Count == 0)
        {
            return;
        }

        var next = PopLast(_redoStack);
        PushBounded(_undoStack, CaptureSnapshot());
        RestoreSnapshot(next);
        next.Dispose();

        FinishUndoRedo();
    }

    private void FinishUndoRedo()
    {
        UpdateSelectionOutlineContours();
        StateRestored?.Invoke(this, EventArgs.Empty);
        UndoRedoStateChanged?.Invoke(this, EventArgs.Empty);
        Invalidate();
    }

    public void BeginUndoableChange()
    {
        _pendingSnapshot?.Dispose();
        _pendingSnapshot = CaptureSnapshot();
    }

    public void CommitUndoableChange()
    {
        if (_pendingSnapshot == null)
        {
            return;
        }

        PushBounded(_undoStack, _pendingSnapshot);
        _pendingSnapshot = null;
        ClearRedoStack();
        UndoRedoStateChanged?.Invoke(this, EventArgs.Empty);
    }

    public void DiscardPendingChange()
    {
        _pendingSnapshot?.Dispose();
        _pendingSnapshot = null;
    }

    private void ClearUndoHistory()
    {
        DiscardPendingChange();
        foreach (var snapshot in _undoStack)
        {
            snapshot.Dispose();
        }

        _undoStack.Clear();
        ClearRedoStack();
        UndoRedoStateChanged?.Invoke(this, EventArgs.Empty);
    }

    private void ClearRedoStack()
    {
        foreach (var snapshot in _redoStack)
        {
            snapshot.Dispose();
        }

        _redoStack.Clear();
    }

    private static T PopLast<T>(List<T> list)
    {
        var item = list[^1];
        list.RemoveAt(list.Count - 1);
        return item;
    }

    private static void PushBounded(List<SelectionSnapshot> stack, SelectionSnapshot snapshot)
    {
        stack.Add(snapshot);
        while (stack.Count > MaxUndoHistory)
        {
            stack[0].Dispose();
            stack.RemoveAt(0);
        }
    }

    private SelectionSnapshot CaptureSnapshot() =>
        new(_selectionMask, _foregroundHintMask, _backgroundHintMask, _previewMask, _resultImage, _showResult, _contours);

    private void RestoreSnapshot(SelectionSnapshot snapshot)
    {
        RestoreMask(ref _selectionMask, snapshot.SelectionMask);
        RestoreMask(ref _foregroundHintMask, snapshot.ForegroundMask);
        RestoreMask(ref _backgroundHintMask, snapshot.BackgroundMask);

        _previewMask?.Dispose();
        _previewMask = snapshot.PreviewMask?.Clone();

        _resultImage?.Dispose();
        _resultImage = snapshot.ResultImage == null ? null : new Bitmap(snapshot.ResultImage);

        _showResult = snapshot.ShowResult;
        _contours = snapshot.Contours;
        RequestHostLayout();
    }

    private static void RestoreMask(ref Mat? target, Mat? source)
    {
        if (source == null)
        {
            ResetMask(target);
            return;
        }

        if (target == null)
        {
            target = source.Clone();
            return;
        }

        source.CopyTo(target);
    }

    private sealed class SelectionSnapshot : IDisposable
    {
        public SelectionSnapshot(
            Mat? selection,
            Mat? foreground,
            Mat? background,
            Mat? preview,
            Bitmap? resultImage,
            bool showResult,
            CvPoint[][] contours)
        {
            SelectionMask = selection?.Clone();
            ForegroundMask = foreground?.Clone();
            BackgroundMask = background?.Clone();
            PreviewMask = preview?.Clone();
            ResultImage = resultImage == null ? null : new Bitmap(resultImage);
            ShowResult = showResult;
            Contours = contours.Select(contour => contour.ToArray()).ToArray();
        }

        public Mat? SelectionMask { get; }
        public Mat? ForegroundMask { get; }
        public Mat? BackgroundMask { get; }
        public Mat? PreviewMask { get; }
        public Bitmap? ResultImage { get; }
        public bool ShowResult { get; }
        public CvPoint[][] Contours { get; }

        public void Dispose()
        {
            SelectionMask?.Dispose();
            ForegroundMask?.Dispose();
            BackgroundMask?.Dispose();
            PreviewMask?.Dispose();
            ResultImage?.Dispose();
        }
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
        if (_sourceImage == null)
        {
            return;
        }

        var viewport = GetViewportSize();
        if (viewport.Width <= 0 || viewport.Height <= 0)
        {
            return;
        }

        var scaleX = viewport.Width / (float)_sourceImage.Width;
        var scaleY = viewport.Height / (float)_sourceImage.Height;
        _zoom = Math.Clamp(Math.Min(scaleX, scaleY) * 0.95f, 0.05f, 20f);
        RequestHostLayout();
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
        _lastClientMousePoint = e.Location;
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
                BeginUndoableChange();
                _selectStartImage = imagePoint;
                _strokePreviewClient = new PointF(e.X, e.Y);
                _draftSelectionRect = new System.Drawing.Rectangle(imagePoint.X, imagePoint.Y, 0, 0);
                _activeStroke.Clear();
                ClearPreviewWithoutInvalidate();
                Update();
                break;

            case InteractionMode.MarkForeground:
                _isDrawingStroke = true;
                _strokeInteractionMode = InteractionMode.MarkForeground;
                BeginInteractionCapture();
                BeginUndoableChange();
                PaintBrush(EnsureHintMask(ref _foregroundHintMask), imagePoint, imagePoint);
                ClearPreview();
                MarkersChanged?.Invoke(this, EventArgs.Empty);
                Invalidate();
                break;

            case InteractionMode.MarkBackground:
                _isDrawingStroke = true;
                _strokeInteractionMode = InteractionMode.MarkBackground;
                BeginInteractionCapture();
                BeginUndoableChange();
                PaintBrush(EnsureHintMask(ref _backgroundHintMask), imagePoint, imagePoint);
                ClearPreview();
                MarkersChanged?.Invoke(this, EventArgs.Empty);
                Invalidate();
                break;
        }
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        _lastClientMousePoint = e.Location;

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
                ConstrainViewTransform();

                _lastPanClient = e.Location;
                Invalidate();
            }

            return;
        }

        UpdateHoverCursor(e.Location);

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

    protected override void OnMouseLeave(EventArgs e)
    {
        base.OnMouseLeave(e);
        if (!_isPanning)
        {
            Cursor = Cursors.Default;
        }
    }

    protected override void OnMouseEnter(EventArgs e)
    {
        base.OnMouseEnter(e);
        UpdateHoverCursor(PointToClient(Control.MousePosition));
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);

        if (_isPanning)
        {
            _isPanning = false;
            EndInteractionCapture();
            UpdateHoverCursor(e.Location);
            return;
        }

        if (!_isDrawingStroke)
        {
            return;
        }

        _isDrawingStroke = false;
        EndInteractionCapture();

        if (_strokeInteractionMode is InteractionMode.SelectFreehand or InteractionMode.SelectRectangle)
        {
            if (_strokeInteractionMode == InteractionMode.SelectFreehand)
            {
                if (_strokePreviewClient.HasValue)
                {
                    AppendClientStrokePoint(_strokePreviewClient.Value);
                }

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
        else if (_strokeInteractionMode is InteractionMode.MarkForeground or InteractionMode.MarkBackground)
        {
            CommitUndoableChange();
        }

        _strokePreviewClient = null;

        UpdateHoverCursor(e.Location);
        Invalidate();
    }

    protected override void OnMouseWheel(MouseEventArgs e)
    {
        if (_sourceImage == null || _isDrawingStroke || _isPanning)
        {
            return;
        }

        base.OnMouseWheel(e);

        if (ModifierKeys.HasFlag(Keys.Control))
        {
            var factor = e.Delta > 0 ? 1.15f : 1f / 1.15f;
            ApplyZoomAtClientPoint(_zoom * factor, e.Location);
            return;
        }

        if (!CanPan())
        {
            return;
        }

        if (ModifierKeys.HasFlag(Keys.Shift))
        {
            _panOffset.X += e.Delta;
        }
        else
        {
            _panOffset.Y += e.Delta;
        }

        ConstrainViewTransform();
        Invalidate();
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        PreserveViewportCenterAnchor();
        ConstrainViewTransform();
        Invalidate();
    }

    private void PreserveViewportCenterAnchor()
    {
        if (_sourceImage == null)
        {
            return;
        }

        var newViewport = GetViewportSize();
        if (newViewport.Width <= 0 || newViewport.Height <= 0)
        {
            return;
        }

        if (_lastViewportSize.Width <= 0 || _lastViewportSize.Height <= 0 ||
            _lastViewportSize == newViewport)
        {
            return;
        }

        var anchorImage = new PointF(
            (_lastViewportSize.Width / 2f - _panOffset.X) / _zoom,
            (_lastViewportSize.Height / 2f - _panOffset.Y) / _zoom);
        _panOffset.X = newViewport.Width / 2f - anchorImage.X * _zoom;
        _panOffset.Y = newViewport.Height / 2f - anchorImage.Y * _zoom;
    }

    private System.Drawing.Size GetViewportSize() => ClientSize;

    private void RequestHostLayout()
    {
        if (Parent is ImageCanvasHost host)
        {
            host.UpdateCanvasLayout();
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);

        var image = CurrentDisplayImage;
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
            ClearUndoHistory();
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
        ClearUndoHistory();
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
            DiscardPendingChange();
            _activeStroke.Clear();
            return;
        }

        var contour = BuildLassoContour(_activeStroke);
        if (contour.Length < MinLassoPoints)
        {
            DiscardPendingChange();
            _activeStroke.Clear();
            return;
        }

        using var temp = new Mat(_selectionMask.Size(), MatType.CV_8UC1, Scalar.Black);
        Cv2.FillPoly(temp, [contour], Scalar.White);

        if (Cv2.CountNonZero(temp) < MinSelectionPixels)
        {
            DiscardPendingChange();
            _activeStroke.Clear();
            return;
        }

        Cv2.BitwiseOr(_selectionMask, temp, _selectionMask);
        UpdateSelectionOutlineContours();
        CommitUndoableChange();
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
            DiscardPendingChange();
            _draftSelectionRect = System.Drawing.Rectangle.Empty;
            return;
        }

        if (_draftSelectionRect.Width < 4 || _draftSelectionRect.Height < 4)
        {
            DiscardPendingChange();
            _draftSelectionRect = System.Drawing.Rectangle.Empty;
            return;
        }

        Cv2.Rectangle(
            _selectionMask,
            new Rect(_draftSelectionRect.X, _draftSelectionRect.Y, _draftSelectionRect.Width, _draftSelectionRect.Height),
            Scalar.White,
            -1);
        UpdateSelectionOutlineContours();
        CommitUndoableChange();
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
        ApplyPanForViewportAnchor(anchorImage);
        RequestHostLayout();
        NotifyViewChanged();
        Invalidate();
    }

    private void ApplyZoomAtClientPoint(float newZoom, System.Drawing.Point clientPoint)
    {
        if (_sourceImage == null)
        {
            return;
        }

        var anchorImage = new PointF(
            (clientPoint.X - _panOffset.X) / _zoom,
            (clientPoint.Y - _panOffset.Y) / _zoom);
        _zoom = Math.Clamp(newZoom, 0.05f, 20f);
        _panOffset.X = clientPoint.X - anchorImage.X * _zoom;
        _panOffset.Y = clientPoint.Y - anchorImage.Y * _zoom;
        ConstrainViewTransform();
        RequestHostLayout();
        NotifyViewChanged();
        Invalidate();
    }

    private void ApplyPanForViewportAnchor(PointF anchorImage)
    {
        var center = GetViewportCenter();
        _panOffset.X = center.X - anchorImage.X * _zoom;
        _panOffset.Y = center.Y - anchorImage.Y * _zoom;
        ConstrainViewTransform();
    }

    private PointF GetViewportCenter()
    {
        var viewport = GetViewportSize();
        return new PointF(viewport.Width / 2f, viewport.Height / 2f);
    }

    private PointF GetImagePointAtViewportCenter()
    {
        var center = GetViewportCenter();
        return new PointF(
            (center.X - _panOffset.X) / _zoom,
            (center.Y - _panOffset.Y) / _zoom);
    }

    internal static int GetDisplayPixelSize(float value) =>
        Math.Max(1, (int)Math.Ceiling(value));

    private bool IsImageSmallerThanViewport()
    {
        if (_sourceImage == null)
        {
            return true;
        }

        var viewport = GetViewportSize();
        if (viewport.Width <= 0 || viewport.Height <= 0)
        {
            return true;
        }

        var display = GetDisplaySize();
        return display.Width <= viewport.Width && display.Height <= viewport.Height;
    }

    private bool CanPan() => _sourceImage != null && !IsImageSmallerThanViewport();

    private void ConstrainViewTransform()
    {
        var image = CurrentDisplayImage;
        if (image == null)
        {
            return;
        }

        var viewport = GetViewportSize();
        if (viewport.Width <= 0 || viewport.Height <= 0)
        {
            return;
        }

        var displayWidth = image.Width * _zoom;
        var displayHeight = image.Height * _zoom;

        _panOffset.X = displayWidth <= viewport.Width
            ? (viewport.Width - displayWidth) / 2f
            : Math.Min(0f, Math.Max(viewport.Width - displayWidth, _panOffset.X));

        _panOffset.Y = displayHeight <= viewport.Height
            ? (viewport.Height - displayHeight) / 2f
            : Math.Min(0f, Math.Max(viewport.Height - displayHeight, _panOffset.Y));

        _lastViewportSize = viewport;
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
        BeginUndoableChange();
        _activeStroke.Clear();
        _activeStrokeClient.Clear();
        _strokePreviewClient = new PointF(e.X, e.Y);
        _activeStrokeClient.Add(_strokePreviewClient.Value);
        _draftSelectionRect = System.Drawing.Rectangle.Empty;
        ClearPreviewWithoutInvalidate();
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

        if (!_strokePreviewClient.HasValue)
        {
            return _activeStrokeClient.ToArray();
        }

        var points = new PointF[_activeStrokeClient.Count + 1];
        _activeStrokeClient.CopyTo(points, 0);
        points[^1] = _strokePreviewClient.Value;
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

        if (_selectionOutlineContours.Length > 0)
        {
            DrawSelectionContours(g, _selectionOutlineContours);
        }
        else if (HasSelection)
        {
            DrawSelectionBoundsFallback(g);
        }

        if (_isDrawingStroke && _strokeInteractionMode == InteractionMode.SelectFreehand)
        {
            DrawLiveFreehandSelection(g);
        }
        else if (_isDrawingStroke && _strokeInteractionMode == InteractionMode.SelectRectangle)
        {
            DrawLiveRectangleSelection(g);
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

        if (points.Length >= 2)
        {
            DrawYellowDashedPolyline(g, points, closed: false, LiveFreehandOutlineWidth);
        }
        else if (_strokePreviewClient.HasValue)
        {
            DrawSelectionHandle(g, _strokePreviewClient.Value, LiveFreehandOutlineWidth);
        }
        else
        {
            DrawSelectionHandle(g, points[0], LiveFreehandOutlineWidth);
        }

        if (_strokePreviewClient.HasValue && points.Length >= 2)
        {
            DrawSelectionHandle(g, _strokePreviewClient.Value, LiveFreehandOutlineWidth);
        }
    }

    private static void DrawSelectionHandle(Graphics g, PointF point, float radius)
    {
        using var brush = new SolidBrush(SelectionOutlineColor);
        g.FillEllipse(brush, point.X - radius, point.Y - radius, radius * 2f, radius * 2f);
    }

    private static void DrawYellowDashedPolyline(Graphics g, PointF[] points, bool closed, float lineWidth)
    {
        if (points.Length < 2)
        {
            return;
        }

        using var pen = new Pen(SelectionOutlineColor, lineWidth)
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

            var isRubberBandSegment = !closed && i == segmentCount - 1;
            if (isRubberBandSegment && segmentLength < SelectionDashLength)
            {
                g.DrawLine(pen, from, to);
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

    private static void DrawYellowDashedPolyline(Graphics g, PointF[] points, bool closed) =>
        DrawYellowDashedPolyline(g, points, closed, SelectionOutlineWidth);

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
