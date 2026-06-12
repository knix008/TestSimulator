using System.ComponentModel;
using SVGEditorWinV10.Models;
using SVGEditorWinV10.Rendering;
using SVGEditorWinV10.Ui;

namespace SVGEditorWinV10.Controls;

public sealed class SvgCanvas : Control
{
    private const float MinElementSize = 4f;
    private const float MinZoom = 0.25f;
    private const float MaxZoom = 4.0f;

    private readonly SvgDocument _document = new();
    private readonly VScrollBar _vScroll = new();
    private readonly HScrollBar _hScroll = new();

    private EditorTool _tool = EditorTool.Select;
    private readonly HashSet<Guid> _selectedIds = new();
    private SvgElement? _primarySelected;
    private PointF _dragStart;
    private PointF _dragCurrent;
    private bool _isCreating;
    private bool _isMoving;
    private bool _isResizing;
    private bool _isMarqueeSelecting;
    private ResizeHandle _activeResizeHandle = ResizeHandle.None;
    private PointF _resizeDragPrevious;
    private RectangleF _resizeStartBounds;
    private float _resizeStartCornerRadius;
    private PointF _moveOffset;
    private List<ElementPose>? _moveSnapshots;
    private float _zoom = 1.0f;
    private Color _defaultFill = Color.FromArgb(219, 234, 254);
    private FillPattern _defaultFillPattern = FillPattern.Solid;
    private float _defaultFillOpacity = 1f;
    private float _defaultStrokeOpacity = 1f;
    private Color _defaultStroke = Color.FromArgb(37, 99, 235);
    private float _defaultStrokeWidth = 2f;
    private StrokeLineStyle _defaultStrokeLineStyle = StrokeLineStyle.Solid;
    private LineMarkerStyle _defaultStartMarker = LineMarkerStyle.None;
    private LineMarkerStyle _defaultEndMarker = LineMarkerStyle.None;
    private Color _defaultTextColor = SvgTextRenderer.DefaultTextColor;
    private string _defaultText = SvgTextRenderer.DefaultText;
    private string _defaultFontName = SvgTextRenderer.DefaultFontName;
    private float _defaultFontSize = SvgTextRenderer.DefaultFontSize;
    private bool _defaultFontBold;
    private bool _defaultFontItalic;
    private string? _pendingImageDataUri;
    private string? _pendingImageSourcePath;
    private SizeF _pendingImagePixelSize;

    public event EventHandler? DocumentChanged;
    public event EventHandler? SelectionChanged;
    public event EventHandler? ZoomChanged;

    public event EventHandler? TextEditRequested;

    public SvgDocument Document => _document;
    public EditorTool CurrentTool => _tool;
    public SvgElement? SelectedElement => _primarySelected;
    public IReadOnlyList<SvgElement> SelectedElements => GetSelectedElements();
    public int SelectionCount => _selectedIds.Count;
    public float Zoom => _zoom;

    private sealed class ElementPose
    {
        public required Guid Id { get; init; }
        public RectangleF Bounds { get; init; }
        public PointF Start { get; init; }
        public PointF End { get; init; }
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    [Browsable(false)]
    public Color DefaultFill
    {
        get => _defaultFill;
        set => _defaultFill = value;
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    [Browsable(false)]
    public FillPattern DefaultFillPattern
    {
        get => _defaultFillPattern;
        set => _defaultFillPattern = value;
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    [Browsable(false)]
    public float DefaultFillOpacity
    {
        get => _defaultFillOpacity;
        set => _defaultFillOpacity = SvgColorHelper.ClampOpacity(value);
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    [Browsable(false)]
    public float DefaultStrokeOpacity
    {
        get => _defaultStrokeOpacity;
        set => _defaultStrokeOpacity = SvgColorHelper.ClampOpacity(value);
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    [Browsable(false)]
    public Color DefaultStroke
    {
        get => _defaultStroke;
        set => _defaultStroke = value;
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    [Browsable(false)]
    public float DefaultStrokeWidth
    {
        get => _defaultStrokeWidth;
        set => _defaultStrokeWidth = Math.Max(1f, value);
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    [Browsable(false)]
    public StrokeLineStyle DefaultStrokeLineStyle
    {
        get => _defaultStrokeLineStyle;
        set => _defaultStrokeLineStyle = value;
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    [Browsable(false)]
    public LineMarkerStyle DefaultStartMarker
    {
        get => _defaultStartMarker;
        set => _defaultStartMarker = value;
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    [Browsable(false)]
    public LineMarkerStyle DefaultEndMarker
    {
        get => _defaultEndMarker;
        set => _defaultEndMarker = value;
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    [Browsable(false)]
    public Color DefaultTextColor
    {
        get => _defaultTextColor;
        set => _defaultTextColor = value;
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    [Browsable(false)]
    public string DefaultText
    {
        get => _defaultText;
        set => _defaultText = string.IsNullOrEmpty(value) ? SvgTextRenderer.DefaultText : value;
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    [Browsable(false)]
    public string DefaultFontName
    {
        get => _defaultFontName;
        set => _defaultFontName = string.IsNullOrWhiteSpace(value) ? SvgTextRenderer.DefaultFontName : value;
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    [Browsable(false)]
    public float DefaultFontSize
    {
        get => _defaultFontSize;
        set => _defaultFontSize = Math.Max(6f, value);
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    [Browsable(false)]
    public bool DefaultFontBold
    {
        get => _defaultFontBold;
        set => _defaultFontBold = value;
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    [Browsable(false)]
    public bool DefaultFontItalic
    {
        get => _defaultFontItalic;
        set => _defaultFontItalic = value;
    }

    public void NotifyDocumentChanged()
    {
        Invalidate();
        DocumentChanged?.Invoke(this, EventArgs.Empty);
    }

    public SvgCanvas()
    {
        DoubleBuffered = true;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        BackColor = Color.FromArgb(210, 215, 222);
        TabStop = true;

        if (LicenseManager.UsageMode == LicenseUsageMode.Designtime)
            return;

        _vScroll.Dock = DockStyle.Right;
        _vScroll.Visible = false;
        _vScroll.Scroll += (_, _) => Invalidate();
        _hScroll.Dock = DockStyle.Bottom;
        _hScroll.Visible = false;
        _hScroll.Scroll += (_, _) => Invalidate();
        Controls.Add(_vScroll);
        Controls.Add(_hScroll);
    }

    public void NewDocument(float width = 800f, float height = 600f)
    {
        _document.Width = width;
        _document.Height = height;
        _document.BackgroundColorArgb = Color.White.ToArgb();
        _document.Elements.Clear();
        ClearPendingImage();
        SvgImageAssetService.ClearCache();
        ClearSelection();
        ResetView();
        DocumentChanged?.Invoke(this, EventArgs.Empty);
    }

    public void LoadDocument(SvgDocument document)
    {
        _document.Width = document.Width;
        _document.Height = document.Height;
        _document.BackgroundColorArgb = document.BackgroundColorArgb;
        _document.Elements = document.Elements.Select(e => e.Clone()).ToList();
        ClearPendingImage();
        SvgImageAssetService.ClearCache();
        ClearSelection();
        ResetView();
        DocumentChanged?.Invoke(this, EventArgs.Empty);
    }

    public void SetPendingImage(string dataUri, string sourcePath, SizeF pixelSize)
    {
        _pendingImageDataUri = dataUri;
        _pendingImageSourcePath = sourcePath;
        _pendingImagePixelSize = pixelSize;
    }

    public void ClearPendingImage()
    {
        _pendingImageDataUri = null;
        _pendingImageSourcePath = null;
        _pendingImagePixelSize = SizeF.Empty;
    }

    public void SetTool(EditorTool tool)
    {
        _tool = tool;
        if (_tool != EditorTool.Image)
            ClearPendingImage();
        if (_tool != EditorTool.Select)
            ClearSelection();
        UpdateCursor();
    }

    public void SetDocumentSize(float width, float height)
    {
        width = Math.Max(1f, width);
        height = Math.Max(1f, height);
        if (Math.Abs(_document.Width - width) < 0.001f && Math.Abs(_document.Height - height) < 0.001f)
            return;

        _document.Width = width;
        _document.Height = height;
        UpdateScrollBars();
        Invalidate();
        DocumentChanged?.Invoke(this, EventArgs.Empty);
    }

    public void DeleteSelected()
    {
        if (_selectedIds.Count == 0)
            return;

        _document.Elements.RemoveAll(e => _selectedIds.Contains(e.Id));
        ClearSelection();
        Invalidate();
        DocumentChanged?.Invoke(this, EventArgs.Empty);
    }

    public void SelectAll()
    {
        if (_document.Elements.Count == 0)
        {
            ClearSelection();
            return;
        }

        SetSelection(_document.Elements, _document.Elements[^1]);
    }

    public void SelectElement(SvgElement? element) => SetSingleSelection(element);

    private List<SvgElement> GetSelectedElements() =>
        _document.Elements.Where(e => _selectedIds.Contains(e.Id)).ToList();

    private bool IsSelected(SvgElement element) => _selectedIds.Contains(element.Id);

    private void SetSingleSelection(SvgElement? element)
    {
        if (element is null)
        {
            ClearSelection();
            return;
        }

        SetSelection([element], element);
    }

    private void SetSelection(IEnumerable<SvgElement> elements, SvgElement? primary)
    {
        var nextIds = elements.Select(e => e.Id).ToHashSet();
        var nextPrimary = primary ?? elements.LastOrDefault();
        if (SetsEqual(_selectedIds, nextIds) && _primarySelected == nextPrimary)
            return;

        _selectedIds.Clear();
        foreach (var id in nextIds)
            _selectedIds.Add(id);

        _primarySelected = nextPrimary;
        NotifySelectionChanged();
    }

    private void AddToSelection(SvgElement element)
    {
        if (_selectedIds.Add(element.Id))
            _primarySelected = element;
        else
            _primarySelected = element;

        NotifySelectionChanged();
    }

    private void ToggleSelection(SvgElement element)
    {
        if (_selectedIds.Contains(element.Id))
        {
            _selectedIds.Remove(element.Id);
            _primarySelected = GetSelectedElements().LastOrDefault();
        }
        else
        {
            _selectedIds.Add(element.Id);
            _primarySelected = element;
        }

        NotifySelectionChanged();
    }

    private static bool SetsEqual(HashSet<Guid> left, HashSet<Guid> right) =>
        left.Count == right.Count && left.All(right.Contains);

    private void NotifySelectionChanged()
    {
        Invalidate();
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    public void ZoomIn() => ZoomAt(GetViewportCenter(), 1.25f);

    public void ZoomOut() => ZoomAt(GetViewportCenter(), 0.8f);

    public void ZoomReset() => SetZoom(1.0f, GetViewportCenter());

    public void SetZoom(float zoom, Point? anchor = null)
    {
        var oldZoom = _zoom;
        _zoom = Math.Clamp(zoom, MinZoom, MaxZoom);
        if (Math.Abs(_zoom - oldZoom) < 0.001f)
            return;

        AdjustScrollForZoom(anchor ?? GetViewportCenter(), oldZoom);
        UpdateScrollBars();
        Invalidate();
        ZoomChanged?.Invoke(this, EventArgs.Empty);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        if (LicenseManager.UsageMode == LicenseUsageMode.Designtime)
        {
            using var border = new Pen(Color.FromArgb(209, 213, 219));
            e.Graphics.DrawRectangle(border, 0, 0, Width - 1, Height - 1);
            using var brush = new SolidBrush(Color.FromArgb(156, 163, 175));
            e.Graphics.DrawString("SvgCanvas", Font, brush, 8, 8);
            return;
        }

        using (var chromeBrush = new SolidBrush(BackColor))
            e.Graphics.FillRectangle(chromeBrush, ClientRectangle);

        e.Graphics.TranslateTransform(-_hScroll.Value, -_vScroll.Value);
        e.Graphics.ScaleTransform(_zoom, _zoom);

        using (var pageBrush = new SolidBrush(Color.FromArgb(_document.BackgroundColorArgb)))
            e.Graphics.FillRectangle(pageBrush, 0, 0, _document.Width, _document.Height);

        EditorCanvasGrid.Draw(
            e.Graphics,
            _zoom,
            _hScroll.Value,
            _vScroll.Value,
            GetViewportSize(),
            _document.Width,
            _document.Height);

        DrawPageBorder(e.Graphics);

        foreach (var element in _document.Elements)
            SvgShapeRenderer.Draw(e.Graphics, element);

        if (_isCreating)
            DrawPreview(e.Graphics);

        if (_isMarqueeSelecting)
            DrawMarquee(e.Graphics);

        if (!_isCreating)
        {
            foreach (var element in GetSelectedElements())
                DrawSelectionOutline(e.Graphics, element);
        }
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (LicenseManager.UsageMode == LicenseUsageMode.Designtime)
            return;

        if (_tool != EditorTool.Select)
        {
            if (e.Button != MouseButtons.Left)
                return;

            if (_tool == EditorTool.Image && string.IsNullOrEmpty(_pendingImageDataUri))
                return;

            Focus();
            _isCreating = true;
            var point = ToCanvasPoint(e.Location);
            _dragStart = EditorCanvasGrid.SnapPoint(point);
            _dragCurrent = _dragStart;
            Capture = true;
            Invalidate();
            return;
        }

        var canvasPoint = ToCanvasPoint(e.Location);

        if (e.Button == MouseButtons.Right)
        {
            var hit = HitTest(canvasPoint);
            if (hit is not null && !IsSelected(hit))
                SetSingleSelection(hit);

            ShowSelectionContextMenu(e.Location);
            return;
        }

        if (e.Button != MouseButtons.Left)
            return;

        Focus();

        if (_primarySelected is not null
            && _selectedIds.Count == 1
            && SupportsResizeHandles(_primarySelected))
        {
            var handle = SvgResizeHandles.HitTest(_primarySelected.Bounds, canvasPoint, 8f / _zoom);
            if (handle != ResizeHandle.None)
            {
                _isResizing = true;
                _activeResizeHandle = handle;
                _resizeDragPrevious = canvasPoint;
                _resizeStartBounds = _primarySelected.Bounds;
                _resizeStartCornerRadius = _primarySelected.CornerRadius;
                Capture = true;
                Invalidate();
                return;
            }
        }

        var hitElement = HitTest(canvasPoint);

        if (hitElement is not null)
        {
            var extendSelection = (ModifierKeys & Keys.Control) == Keys.Control;
            var addSelection = (ModifierKeys & Keys.Shift) == Keys.Shift;

            if (extendSelection)
                ToggleSelection(hitElement);
            else if (addSelection)
                AddToSelection(hitElement);
            else if (IsSelected(hitElement) && _selectedIds.Count > 1)
                _primarySelected = hitElement;
            else
                SetSingleSelection(hitElement);

            if (IsSelected(hitElement))
                BeginMove(canvasPoint, hitElement);

            return;
        }

        if ((ModifierKeys & Keys.Control) != Keys.Control && (ModifierKeys & Keys.Shift) != Keys.Shift)
            ClearSelection();

        _isMarqueeSelecting = true;
        _dragStart = canvasPoint;
        _dragCurrent = canvasPoint;
        Capture = true;
        Invalidate();
    }

    protected override void OnMouseDoubleClick(MouseEventArgs e)
    {
        base.OnMouseDoubleClick(e);
        if (LicenseManager.UsageMode == LicenseUsageMode.Designtime || e.Button != MouseButtons.Left)
            return;

        if (_tool is not (EditorTool.Select or EditorTool.Text))
            return;

        var hit = HitTest(ToCanvasPoint(e.Location));
        if (hit?.Kind != SvgElementKind.Text)
            return;

        SetSingleSelection(hit);
        TextEditRequested?.Invoke(this, EventArgs.Empty);
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        if (LicenseManager.UsageMode == LicenseUsageMode.Designtime)
            return;

        var point = ToCanvasPoint(e.Location);

        if (_isMoving)
        {
            MoveSelection(EditorCanvasGrid.SnapPoint(point));
            Invalidate();
            return;
        }

        if (_isResizing)
        {
            ResizeSelection(EditorCanvasGrid.SnapPoint(point));
            Invalidate();
            return;
        }

        if (_isMarqueeSelecting)
        {
            _dragCurrent = point;
            Invalidate();
            return;
        }

        if (!_isCreating)
            return;

        _dragCurrent = EditorCanvasGrid.SnapPoint(point);
        Invalidate();
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (LicenseManager.UsageMode == LicenseUsageMode.Designtime)
            return;

        if (e.Button != MouseButtons.Left)
            return;

        Capture = false;

        if (_isMoving)
        {
            _isMoving = false;
            _moveSnapshots = null;
            DocumentChanged?.Invoke(this, EventArgs.Empty);
            return;
        }

        if (_isResizing)
        {
            if (_primarySelected?.Kind == SvgElementKind.Text)
                _primarySelected.TextBoundsManuallySized = true;
            else if (_primarySelected?.Kind == SvgElementKind.Image)
                _primarySelected.TextBoundsManuallySized = true;

            _isResizing = false;
            _activeResizeHandle = ResizeHandle.None;
            DocumentChanged?.Invoke(this, EventArgs.Empty);
            return;
        }

        if (_isMarqueeSelecting)
        {
            _isMarqueeSelecting = false;
            var rect = NormalizeRect(_dragStart, _dragCurrent);
            if (rect.Width >= MinElementSize || rect.Height >= MinElementSize)
            {
                var hits = _document.Elements.Where(e => IntersectsSelection(rect, e)).ToList();
                if ((ModifierKeys & Keys.Control) == Keys.Control)
                {
                    foreach (var element in hits)
                        AddToSelection(element);
                }
                else if (hits.Count > 0)
                {
                    SetSelection(hits, hits[^1]);
                }
                else if ((ModifierKeys & Keys.Control) != Keys.Control && (ModifierKeys & Keys.Shift) != Keys.Shift)
                {
                    ClearSelection();
                }
            }

            Invalidate();
            return;
        }

        if (!_isCreating)
            return;

        _isCreating = false;
        var point = EditorCanvasGrid.SnapPoint(ToCanvasPoint(e.Location));
        var created = CreateElement(_dragStart, point);
        if (created is not null)
        {
            _document.Elements.Add(created);
            SetSingleSelection(created);
            DocumentChanged?.Invoke(this, EventArgs.Empty);
        }

        Invalidate();
    }

    protected override void OnMouseWheel(MouseEventArgs e)
    {
        base.OnMouseWheel(e);
        if (LicenseManager.UsageMode == LicenseUsageMode.Designtime)
            return;

        if ((ModifierKeys & Keys.Control) == Keys.Control)
        {
            var factor = e.Delta > 0 ? 1.25f : 0.8f;
            ZoomAt(e.Location, factor);
            return;
        }

        if (_vScroll.Visible)
        {
            var delta = e.Delta > 0 ? -_vScroll.SmallChange : _vScroll.SmallChange;
            _vScroll.Value = ClampScroll(_vScroll, _vScroll.Value + delta);
            Invalidate();
            return;
        }

        if (_hScroll.Visible)
        {
            var delta = e.Delta > 0 ? -_hScroll.SmallChange : _hScroll.SmallChange;
            _hScroll.Value = ClampScroll(_hScroll, _hScroll.Value + delta);
            Invalidate();
        }
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        if (LicenseManager.UsageMode == LicenseUsageMode.Designtime)
            return;

        UpdateScrollBars();
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        base.OnKeyDown(e);
        if (_tool != EditorTool.Select)
            return;

        if (e.Control && e.KeyCode == Keys.A)
        {
            SelectAll();
            e.Handled = true;
            return;
        }

        if (e.KeyCode == Keys.Delete)
        {
            DeleteSelected();
            e.Handled = true;
        }
    }

    private void BeginMove(PointF point, SvgElement anchor)
    {
        _isMoving = true;
        Capture = true;
        _moveSnapshots = GetSelectedElements()
            .Select(e => new ElementPose
            {
                Id = e.Id,
                Bounds = e.Bounds,
                Start = e.Start,
                End = e.End
            })
            .ToList();

        if (anchor.Kind == SvgElementKind.Line)
            _moveOffset = new PointF(point.X - anchor.Start.X, point.Y - anchor.Start.Y);
        else
            _moveOffset = new PointF(point.X - anchor.Bounds.X, point.Y - anchor.Bounds.Y);
    }

    private void ResizeSelection(PointF point)
    {
        if (_primarySelected is null || !SupportsResizeHandles(_primarySelected))
            return;

        var bounds = _primarySelected.Bounds;
        SvgResizeHandles.ApplyResize(ref bounds, _activeResizeHandle, point, _resizeDragPrevious);
        _primarySelected.Bounds = bounds;

        if (_primarySelected.Kind == SvgElementKind.RoundedRectangle)
        {
            var scaleX = bounds.Width / Math.Max(_resizeStartBounds.Width, 1f);
            var scaleY = bounds.Height / Math.Max(_resizeStartBounds.Height, 1f);
            var scale = Math.Min(scaleX, scaleY);
            var baseRadius = _resizeStartCornerRadius > 0f
                ? _resizeStartCornerRadius
                : SvgShapeRenderer.DefaultCornerRadius(_resizeStartBounds);
            _primarySelected.CornerRadius = Math.Min(
                baseRadius * scale,
                Math.Min(bounds.Width, bounds.Height) / 2f);
        }

        _resizeDragPrevious = point;
    }

    private static bool SupportsResizeHandles(SvgElement element) =>
        element.Kind != SvgElementKind.Line;

    private void MoveSelection(PointF point)
    {
        if (_moveSnapshots is null || _primarySelected is null)
            return;

        if (_primarySelected.Kind == SvgElementKind.Line)
        {
            var start = EditorCanvasGrid.SnapPoint(new PointF(point.X - _moveOffset.X, point.Y - _moveOffset.Y));
            var delta = new PointF(start.X - _moveSnapshots.First(s => s.Id == _primarySelected.Id).Start.X,
                start.Y - _moveSnapshots.First(s => s.Id == _primarySelected.Id).Start.Y);
            ApplyMoveDelta(delta);
            return;
        }

        var left = EditorCanvasGrid.Snap(point.X - _moveOffset.X);
        var top = EditorCanvasGrid.Snap(point.Y - _moveOffset.Y);
        var snapshot = _moveSnapshots.First(s => s.Id == _primarySelected.Id);
        var boundsDelta = new PointF(left - snapshot.Bounds.X, top - snapshot.Bounds.Y);
        ApplyMoveDelta(boundsDelta);
    }

    private void ApplyMoveDelta(PointF delta)
    {
        if (_moveSnapshots is null)
            return;

        foreach (var snapshot in _moveSnapshots)
        {
            var element = _document.Elements.FirstOrDefault(e => e.Id == snapshot.Id);
            if (element is null)
                continue;

            if (element.Kind == SvgElementKind.Line)
            {
                element.Start = new PointF(snapshot.Start.X + delta.X, snapshot.Start.Y + delta.Y);
                element.End = new PointF(snapshot.End.X + delta.X, snapshot.End.Y + delta.Y);
            }
            else
            {
                element.Bounds = new RectangleF(
                    snapshot.Bounds.X + delta.X,
                    snapshot.Bounds.Y + delta.Y,
                    snapshot.Bounds.Width,
                    snapshot.Bounds.Height);
            }
        }
    }

    private static bool IntersectsSelection(RectangleF rect, SvgElement element)
    {
        var bounds = element.GetBounds();
        return rect.IntersectsWith(bounds);
    }

    private void DrawMarquee(Graphics graphics)
    {
        var rect = NormalizeRect(_dragStart, _dragCurrent);
        using var fill = new SolidBrush(Color.FromArgb(36, 37, 99, 235));
        using var border = new Pen(Color.FromArgb(120, 37, 99, 235), 1f / _zoom)
        {
            DashStyle = System.Drawing.Drawing2D.DashStyle.Dot
        };
        graphics.FillRectangle(fill, rect.X, rect.Y, rect.Width, rect.Height);
        graphics.DrawRectangle(border, rect.X, rect.Y, rect.Width, rect.Height);
    }

    private void ShowSelectionContextMenu(Point screenLocation)
    {
        var menu = new ContextMenuStrip
        {
            Font = ModernTheme.UiFont
        };

        var deleteItem = new ToolStripMenuItem("삭제", null, (_, _) => DeleteSelected())
        {
            Enabled = _selectedIds.Count > 0,
            ShortcutKeyDisplayString = "Del"
        };
        var selectAllItem = new ToolStripMenuItem("전체 선택", null, (_, _) => SelectAll())
        {
            ShortcutKeyDisplayString = "Ctrl+A"
        };
        var clearItem = new ToolStripMenuItem("선택 해제", null, (_, _) => ClearSelection())
        {
            Enabled = _selectedIds.Count > 0
        };

        menu.Items.Add(deleteItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(selectAllItem);
        menu.Items.Add(clearItem);
        menu.Show(this, screenLocation);
    }

    private SvgElement? CreateElement(PointF start, PointF end)
    {
        if (_tool == EditorTool.Line)
        {
            if (Distance(start, end) < MinElementSize)
                return null;

            return new SvgElement
            {
                Kind = SvgElementKind.Line,
                Start = start,
                End = end,
                StrokeColor = _defaultStroke,
                StrokeOpacity = _defaultStrokeOpacity,
                StrokeWidth = _defaultStrokeWidth,
                StrokeLineStyle = _defaultStrokeLineStyle,
                StartMarker = _defaultStartMarker,
                EndMarker = _defaultEndMarker
            };
        }

        if (_tool == EditorTool.Text)
        {
            var textBounds = NormalizeRect(start, end);
            if (textBounds.Width < MinElementSize && textBounds.Height < MinElementSize)
            {
                var template = CreateDefaultTextTemplate();
                textBounds = SvgTextRenderer.CreateBoundsAtPoint(start, template);
            }
            else
            {
                textBounds = new RectangleF(
                    textBounds.X,
                    textBounds.Y,
                    Math.Max(textBounds.Width, MinElementSize),
                    Math.Max(textBounds.Height, MinElementSize));
            }

            var textElement = CreateDefaultTextTemplate();
            textElement.Bounds = textBounds;
            if (textBounds.Width >= MinElementSize || textBounds.Height >= MinElementSize)
                textElement.TextBoundsManuallySized = true;

            return textElement;
        }

        if (_tool == EditorTool.Image)
        {
            if (string.IsNullOrEmpty(_pendingImageDataUri))
                return null;

            var imageBounds = NormalizeRect(start, end);
            if (imageBounds.Width < MinElementSize && imageBounds.Height < MinElementSize)
                imageBounds = SvgImageAssetService.CreateDefaultBounds(start, _pendingImagePixelSize);
            else
            {
                imageBounds = new RectangleF(
                    imageBounds.X,
                    imageBounds.Y,
                    Math.Max(imageBounds.Width, MinElementSize),
                    Math.Max(imageBounds.Height, MinElementSize));
            }

            return new SvgElement
            {
                Kind = SvgElementKind.Image,
                Bounds = imageBounds,
                ImageDataUri = _pendingImageDataUri,
                ImageSourcePath = _pendingImageSourcePath,
                FillOpacity = _defaultFillOpacity,
                TextBoundsManuallySized = true
            };
        }

        if (!SvgShapeRenderer.UsesBounds(_tool))
            return null;

        var bounds = NormalizeRect(start, end);
        if (bounds.Width < MinElementSize || bounds.Height < MinElementSize)
            return null;

        var kind = SvgShapeRenderer.ToolToKind(_tool);
        return new SvgElement
        {
            Kind = kind,
            Bounds = bounds,
            CornerRadius = kind == SvgElementKind.RoundedRectangle ? SvgShapeRenderer.DefaultCornerRadius(bounds) : 0f,
            FillColor = _defaultFill,
            FillPattern = _defaultFillPattern,
            FillOpacity = _defaultFillOpacity,
            StrokeColor = _defaultStroke,
            StrokeOpacity = _defaultStrokeOpacity,
            StrokeWidth = _defaultStrokeWidth,
            StrokeLineStyle = _defaultStrokeLineStyle
        };
    }

    private SvgElement? HitTest(PointF point)
    {
        for (var i = _document.Elements.Count - 1; i >= 0; i--)
        {
            if (_document.Elements[i].HitTest(point))
                return _document.Elements[i];
        }

        return null;
    }

    private void ClearSelection()
    {
        if (_selectedIds.Count == 0 && _primarySelected is null)
            return;

        _selectedIds.Clear();
        _primarySelected = null;
        NotifySelectionChanged();
    }

    private PointF ToCanvasPoint(Point screenPoint)
    {
        return new PointF(
            (screenPoint.X + _hScroll.Value) / _zoom,
            (screenPoint.Y + _vScroll.Value) / _zoom);
    }

    private static RectangleF NormalizeRect(PointF a, PointF b)
    {
        var left = Math.Min(a.X, b.X);
        var top = Math.Min(a.Y, b.Y);
        var width = Math.Abs(a.X - b.X);
        var height = Math.Abs(a.Y - b.Y);
        return new RectangleF(left, top, width, height);
    }

    private static float Distance(PointF a, PointF b)
    {
        var dx = a.X - b.X;
        var dy = a.Y - b.Y;
        return MathF.Sqrt(dx * dx + dy * dy);
    }

    private void DrawPreview(Graphics graphics)
    {
        if (_tool == EditorTool.Line)
        {
            SvgShapeRenderer.DrawLinePreview(
                graphics,
                _dragStart,
                _dragCurrent,
                _defaultStroke,
                _defaultStrokeOpacity,
                _defaultStrokeWidth,
                _defaultStrokeLineStyle,
                _defaultStartMarker,
                _defaultEndMarker);
            return;
        }

        if (_tool == EditorTool.Text)
        {
            var textBounds = NormalizeRect(_dragStart, _dragCurrent);
            if (textBounds.Width < MinElementSize && textBounds.Height < MinElementSize)
            {
                var template = CreateDefaultTextTemplate();
                textBounds = SvgTextRenderer.CreateBoundsAtPoint(_dragStart, template);
            }

            SvgTextRenderer.DrawPreview(
                graphics,
                textBounds,
                _defaultText,
                _defaultFontName,
                _defaultFontSize,
                _defaultFontBold,
                _defaultFontItalic,
                _defaultTextColor,
                _defaultFillOpacity);
            return;
        }

        if (_tool == EditorTool.Image)
        {
            var imageBounds = NormalizeRect(_dragStart, _dragCurrent);
            if (imageBounds.Width < MinElementSize && imageBounds.Height < MinElementSize)
                imageBounds = SvgImageAssetService.CreateDefaultBounds(_dragStart, _pendingImagePixelSize);

            SvgImageRenderer.DrawPreview(graphics, imageBounds, _pendingImageDataUri, _defaultFillOpacity);
            return;
        }

        if (!SvgShapeRenderer.UsesBounds(_tool))
            return;

        var bounds = NormalizeRect(_dragStart, _dragCurrent);
        SvgShapeRenderer.DrawPreview(
            graphics,
            SvgShapeRenderer.ToolToKind(_tool),
            bounds,
            _defaultFill,
            _defaultFillPattern,
            _defaultFillOpacity,
            _defaultStroke,
            _defaultStrokeOpacity,
            _defaultStrokeWidth,
            _defaultStrokeLineStyle);
    }

    private void DrawSelectionOutline(Graphics graphics, SvgElement element)
    {
        var bounds = element.GetBounds();
        using var pen = new Pen(Color.FromArgb(37, 99, 235), 1f) { DashStyle = System.Drawing.Drawing2D.DashStyle.Dot };
        graphics.DrawRectangle(pen, bounds.X, bounds.Y, bounds.Width, bounds.Height);

        if (SupportsResizeHandles(element)
            && _selectedIds.Count == 1
            && element.Id == _primarySelected?.Id)
        {
            SvgResizeHandles.Draw(graphics, bounds, 6f / _zoom);
        }
    }

    private void DrawPageBorder(Graphics g)
    {
        var w = _document.Width;
        var h = _document.Height;
        if (w <= 0f || h <= 0f)
            return;

        var penWidth = Math.Max(1f / _zoom, 1f);
        using var pagePen = new Pen(Color.FromArgb(107, 114, 128), penWidth)
        {
            Alignment = System.Drawing.Drawing2D.PenAlignment.Inset
        };

        g.DrawRectangle(pagePen, 0, 0, w, h);
    }

    private void ZoomAt(Point screenPoint, float factor)
    {
        var oldZoom = _zoom;
        _zoom = Math.Clamp(_zoom * factor, MinZoom, MaxZoom);
        if (Math.Abs(_zoom - oldZoom) < 0.001f)
            return;

        AdjustScrollForZoom(screenPoint, oldZoom);
        UpdateScrollBars();
        Invalidate();
        ZoomChanged?.Invoke(this, EventArgs.Empty);
    }

    private void AdjustScrollForZoom(Point screenPoint, float oldZoom)
    {
        var canvasPoint = new PointF(
            (screenPoint.X + _hScroll.Value) / oldZoom,
            (screenPoint.Y + _vScroll.Value) / oldZoom);

        _hScroll.Value = ClampScroll(_hScroll, (int)Math.Round(canvasPoint.X * _zoom - screenPoint.X));
        _vScroll.Value = ClampScroll(_vScroll, (int)Math.Round(canvasPoint.Y * _zoom - screenPoint.Y));
    }

    private void ResetView()
    {
        _zoom = 1.0f;
        _hScroll.Value = 0;
        _vScroll.Value = 0;
        UpdateScrollBars();
        Invalidate();
        ZoomChanged?.Invoke(this, EventArgs.Empty);
    }

    private Point GetViewportCenter()
    {
        var viewport = GetViewportSize();
        return new Point(viewport.Width / 2, viewport.Height / 2);
    }

    private SizeF GetLogicalContentSize()
    {
        return new SizeF(_document.Width, _document.Height);
    }

    private Size GetContentSize()
    {
        var logical = GetLogicalContentSize();
        return new Size(
            (int)Math.Ceiling(logical.Width * _zoom),
            (int)Math.Ceiling(logical.Height * _zoom));
    }

    private Size GetViewportSize()
    {
        var width = ClientSize.Width;
        var height = ClientSize.Height;

        if (_vScroll.Visible)
            width -= _vScroll.Width;
        if (_hScroll.Visible)
            height -= _hScroll.Height;

        return new Size(Math.Max(1, width), Math.Max(1, height));
    }

    private void UpdateScrollBars()
    {
        var content = GetContentSize();
        var viewport = GetViewportSize();

        var needV = content.Height > viewport.Height;
        var needH = content.Width > viewport.Width;

        if (needV)
            viewport.Width = Math.Max(1, ClientSize.Width - _vScroll.Width);
        if (needH)
            viewport.Height = Math.Max(1, ClientSize.Height - _hScroll.Height);

        needV = content.Height > viewport.Height;
        needH = content.Width > viewport.Width;

        _vScroll.Visible = needV;
        _hScroll.Visible = needH;

        ConfigureScrollBar(_hScroll, content.Width, viewport.Width);
        ConfigureScrollBar(_vScroll, content.Height, viewport.Height);

        _hScroll.Value = ClampScroll(_hScroll, _hScroll.Value);
        _vScroll.Value = ClampScroll(_vScroll, _vScroll.Value);
    }

    private static void ConfigureScrollBar(ScrollBar scrollBar, int contentSize, int viewportSize)
    {
        scrollBar.Minimum = 0;
        scrollBar.LargeChange = Math.Max(1, viewportSize);
        scrollBar.SmallChange = Math.Max(1, viewportSize / 10);
        scrollBar.Maximum = Math.Max(0, contentSize - 1);
    }

    private static int ClampScroll(ScrollBar scrollBar, int value)
    {
        if (!scrollBar.Visible)
            return 0;

        var max = Math.Max(scrollBar.Minimum, scrollBar.Maximum - scrollBar.LargeChange + 1);
        return Math.Clamp(value, scrollBar.Minimum, max);
    }

    private void UpdateCursor()
    {
        Cursor = _tool is EditorTool.Select ? Cursors.SizeAll : Cursors.Cross;
    }

    private SvgElement CreateDefaultTextTemplate() =>
        new()
        {
            Kind = SvgElementKind.Text,
            TextContent = _defaultText,
            FontName = _defaultFontName,
            FontSize = _defaultFontSize,
            FontBold = _defaultFontBold,
            FontItalic = _defaultFontItalic,
            FillColor = _defaultTextColor,
            FillOpacity = _defaultFillOpacity
        };
}
