using MyDiagramWinV10.History;
using MyDiagramWinV10.Models;
using MyDiagramWinV10.Rendering;

namespace MyDiagramWinV10.Controls;

public sealed class DiagramCanvas : Control
{
    private const float MinZoom = 0.25f;
    private const float MaxZoom = 4.0f;
    private const int MinContentWidth = 2400;
    private const int MinContentHeight = 1800;
    private const int ContentPadding = 200;

    private readonly DiagramProject _project = new();
    private readonly DiagramUndoManager _undoManager = new();
    private readonly VScrollBar _vScroll = new();
    private readonly HScrollBar _hScroll = new();
    private ToolMode _toolMode = ToolMode.Select;
    private ShapeKind _shapeKind = ShapeKind.Rectangle;
    private ConnectorKind _connectorKind = ConnectorKind.Straight;
    private ConnectorPreset _connectorPreset = ConnectorPreset.Default;
    private DiagramShape? _selectedShape;
    private DiagramConnector? _selectedConnector;
    private DiagramShape? _connectorSource;
    private DiagramShape? _dragShape;
    private PointF _dragStartCanvas;
    private PointF _lastMouseCanvas;
    private ResizeHandle _activeHandle = ResizeHandle.None;
    private bool _isDragging;
    private bool _isResizing;
    private bool _isCreating;
    private bool _isPanning;
    private Point _panStartScreen;
    private int _panStartHScroll;
    private int _panStartVScroll;
    private float _zoom = 1.0f;
    private bool _spacePressed;
    private bool _suppressUndo;
    private bool _propertyUndoRecorded;
    private bool _mouseOnCanvas;

    private enum EndpointSide { None, Source, Target }
    private EndpointSide _draggingEndpoint = EndpointSide.None;
    private PointF _endpointDragCurrentCanvas;
    private bool _isDraggingBend;
    private bool _isDraggingCurve;

    public event EventHandler? SelectionChanged;
    public event EventHandler? ProjectChanged;
    public event EventHandler? ZoomChanged;
    public event EventHandler? UndoStateChanged;
    public event EventHandler? ShapeCreated;
    public event EventHandler? SelectToolRequested;

    public DiagramProject Project => _project;
    public ToolMode ToolMode => _toolMode;
    public ShapeKind CurrentShapeKind => _shapeKind;
    public ConnectorKind CurrentConnectorKind => _connectorKind;
    public float Zoom => _zoom;
    public bool CanUndo => _undoManager.CanUndo;
    public bool CanRedo => _undoManager.CanRedo;

    public DiagramShape? SelectedShape
    {
        get => _selectedShape;
        private set
        {
            if (_selectedShape == value)
                return;
            _selectedShape = value;
            if (value is not null)
                _selectedConnector = null;
            _propertyUndoRecorded = false;
            SelectionChanged?.Invoke(this, EventArgs.Empty);
            Invalidate();
        }
    }

    public DiagramConnector? SelectedConnector
    {
        get => _selectedConnector;
        private set
        {
            if (_selectedConnector == value)
                return;
            _selectedConnector = value;
            if (value is not null)
                _selectedShape = null;
            _propertyUndoRecorded = false;
            SelectionChanged?.Invoke(this, EventArgs.Empty);
            Invalidate();
        }
    }

    public DiagramCanvas()
    {
        DoubleBuffered = true;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        BackColor = Color.FromArgb(_project.CanvasBackColorArgb);

        if (System.ComponentModel.LicenseManager.UsageMode == System.ComponentModel.LicenseUsageMode.Designtime) return;

        _vScroll.Dock = DockStyle.Right;
        _vScroll.Visible = false;
        _vScroll.Scroll += (_, _) => Invalidate();
        _hScroll.Dock = DockStyle.Bottom;
        _hScroll.Visible = false;
        _hScroll.Scroll += (_, _) => Invalidate();
        Controls.Add(_vScroll);
        Controls.Add(_hScroll);
        _undoManager.Reset(_project);
    }

    public void Undo()
    {
        var restored = _undoManager.Undo(_project);
        if (restored is null)
            return;

        RestoreProject(restored);
    }

    public void Redo()
    {
        var restored = _undoManager.Redo(_project);
        if (restored is null)
            return;

        RestoreProject(restored);
    }

    public void SetSpacePressed(bool pressed)
    {
        _spacePressed = pressed;
        UpdateCursor();
    }

    public void SetToolMode(ToolMode mode)
    {
        _toolMode = mode;
        _connectorSource = null;
        UpdateCursor();
    }

    public void SetShapeKind(ShapeKind kind) => _shapeKind = kind;

    public void SetConnectorKind(ConnectorKind kind) => _connectorKind = kind;

    public void SetConnectorPreset(ConnectorPreset preset)
    {
        _connectorPreset = preset;
        _connectorKind   = preset.Kind;
        UpdateCursor();
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

        var anchorPoint = anchor ?? GetViewportCenter();
        AdjustScrollForZoom(anchorPoint, oldZoom);
        UpdateScrollBars();
        Invalidate();
        ZoomChanged?.Invoke(this, EventArgs.Empty);
    }

    public void LoadProject(DiagramProject project)
    {
        DiagramRenderer.ClearImageCache();
        _project.Title = project.Title;
        _project.CanvasBackColorArgb = project.CanvasBackColorArgb;
        _project.Shapes = project.Shapes.Select(s => s.Clone()).ToList();
        _project.Connectors = project.Connectors.Select(c => c.Clone()).ToList();
        BackColor = Color.FromArgb(_project.CanvasBackColorArgb);
        ResetView();
        ClearSelection();
        _undoManager.Reset(_project);
        NotifyUndoState();
        ProjectChanged?.Invoke(this, EventArgs.Empty);
    }

    public DiagramProject CreateProjectSnapshot() => _project.Clone();

    public void NewProject()
    {
        DiagramRenderer.ClearImageCache();
        _project.Title = "새 다이어그램";
        _project.CanvasBackColorArgb = unchecked((int)0xFFF5F5F5);
        _project.Shapes.Clear();
        _project.Connectors.Clear();
        BackColor = Color.FromArgb(_project.CanvasBackColorArgb);
        ResetView();
        ClearSelection();
        _undoManager.Reset(_project);
        NotifyUndoState();
        ProjectChanged?.Invoke(this, EventArgs.Empty);
    }

    public void DeleteSelection()
    {
        if (_selectedShape is null && _selectedConnector is null)
            return;

        RecordUndo();
        if (_selectedShape is not null)
        {
            var id = _selectedShape.Id;
            _project.Shapes.RemoveAll(s => s.Id == id);
            _project.Connectors.RemoveAll(c => c.SourceShapeId == id || c.TargetShapeId == id);
            ClearSelection();
            NotifyChanged();
            return;
        }

        if (_selectedConnector is not null)
        {
            _project.Connectors.RemoveAll(c => c.Id == _selectedConnector.Id);
            ClearSelection();
            NotifyChanged();
        }
    }

    public void ClearSelection()
    {
        _selectedShape = null;
        _selectedConnector = null;
        _connectorSource = null;
        Invalidate();
    }

    public void ApplyShapeProperties(DiagramShape source)
    {
        if (_selectedShape is null)
            return;

        RecordPropertyUndo();
        _selectedShape.Kind = source.Kind;
        _selectedShape.Text = source.Text;
        _selectedShape.Width = Math.Max(20, source.Width);
        _selectedShape.Height = Math.Max(20, source.Height);
        _selectedShape.FillColorArgb = source.FillColorArgb;
        _selectedShape.BorderColorArgb = source.BorderColorArgb;
        _selectedShape.TextColorArgb = source.TextColorArgb;
        _selectedShape.BorderWidth = source.BorderWidth;
        _selectedShape.BorderStyle = source.BorderStyle;
        _selectedShape.FontName = source.FontName;
        _selectedShape.FontSize = source.FontSize;
        _selectedShape.FontBold = source.FontBold;
        NotifyChanged();
    }

    public void ApplyConnectorProperties(DiagramConnector source)
    {
        if (_selectedConnector is null)
            return;

        RecordPropertyUndo();
        _selectedConnector.Kind = source.Kind;
        _selectedConnector.LineColorArgb = source.LineColorArgb;
        _selectedConnector.LineWidth = source.LineWidth;
        _selectedConnector.LineStyle = source.LineStyle;
        _selectedConnector.HasStartArrow = source.HasStartArrow;
        _selectedConnector.HasEndArrow = source.HasEndArrow;
        _selectedConnector.Label = source.Label;
        NotifyChanged();
    }

    public void SetShapeImage(string? path)
    {
        if (_selectedShape is null || string.IsNullOrWhiteSpace(path))
            return;

        RecordUndo();
        _selectedShape.ImagePath = path;
        _selectedShape.ImageBase64 = null;
        NotifyChanged();
    }

    public void ClearShapeImage()
    {
        if (_selectedShape is null)
            return;

        RecordUndo();
        _selectedShape.ImagePath = null;
        _selectedShape.ImageBase64 = null;
        NotifyChanged();
    }

    protected override void OnMouseEnter(EventArgs e)
    {
        base.OnMouseEnter(e);
        _mouseOnCanvas = true;
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        base.OnMouseLeave(e);
        _mouseOnCanvas = false;
        if (_toolMode == ToolMode.Shape || _toolMode == ToolMode.Connector)
            Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        e.Graphics.TranslateTransform(-_hScroll.Value, -_vScroll.Value);
        e.Graphics.ScaleTransform(_zoom, _zoom);

        DrawGrid(e.Graphics);

        // Build the full polyline for every connector upfront so we can compute
        // crossings before drawing anything.
        var connectorLines = new List<(DiagramConnector Connector, PointF[] Points)>();
        foreach (var connector in _project.Connectors)
        {
            var source = _project.Shapes.FirstOrDefault(s => s.Id == connector.SourceShapeId);
            var target = _project.Shapes.FirstOrDefault(s => s.Id == connector.TargetShapeId);
            if (source is null || target is null)
                continue;

            var start = DiagramRenderer.GetConnectionPoint(source, target, connector.SourceAnchorAngle);
            var end   = DiagramRenderer.GetConnectionPoint(target, source, connector.TargetAnchorAngle);
            var pts = DiagramRenderer.BuildConnectorPoints(connector.Kind, start, end, connector);
            connectorLines.Add((connector, pts));
        }

        // Draw connectors with bridge (hop) arcs where later connectors cross earlier ones.
        for (int ci = 0; ci < connectorLines.Count; ci++)
        {
            var (connector, pts) = connectorLines[ci];
            var source = _project.Shapes.First(s => s.Id == connector.SourceShapeId);
            var target = _project.Shapes.First(s => s.Id == connector.TargetShapeId);

            // Collect crossing points from all earlier connectors against this one.
            var crossings = new List<(float T, PointF Pt)>();
            for (int oi = 0; oi < ci; oi++)
            {
                var (_, otherPts) = connectorLines[oi];
                for (int si = 1; si < pts.Length; si++)
                {
                    for (int sj = 1; sj < otherPts.Length; sj++)
                    {
                        var cross = DiagramRenderer.SegmentIntersection(
                            pts[si - 1], pts[si], otherPts[sj - 1], otherPts[sj]);
                        if (cross is not null)
                        {
                            float dx = pts[si].X - pts[si - 1].X;
                            float dy = pts[si].Y - pts[si - 1].Y;
                            float segLen = MathF.Sqrt(dx * dx + dy * dy);
                            float distAlongSeg = MathF.Sqrt(
                                (cross.Value.X - pts[si - 1].X) * (cross.Value.X - pts[si - 1].X) +
                                (cross.Value.Y - pts[si - 1].Y) * (cross.Value.Y - pts[si - 1].Y));
                            float t = (si - 1) + (segLen > 0.001f ? distAlongSeg / segLen : 0);
                            crossings.Add((t, cross.Value));
                        }
                    }
                }
            }

            DiagramRenderer.DrawConnectorWithBridges(e.Graphics, connector, source, target, crossings);

            if (_selectedConnector?.Id == connector.Id)
            {
                using var pen = new Pen(Color.DodgerBlue, 1f / _zoom) { DashStyle = System.Drawing.Drawing2D.DashStyle.Dot };
                e.Graphics.DrawLine(pen, pts[0], pts[^1]);
            }
        }

        foreach (var shape in _project.Shapes)
            DiagramRenderer.DrawShape(e.Graphics, shape, PointF.Empty, _selectedShape?.Id == shape.Id);

        if (_isCreating && _dragShape is not null)
            DiagramRenderer.DrawShape(e.Graphics, _dragShape, PointF.Empty, selected: true);

        // Ghost preview: show the selected shape kind at cursor when not yet dragging
        if (_toolMode == ToolMode.Shape && !_isCreating && _mouseOnCanvas)
        {
            const float ghostW = 160f;
            const float ghostH = 110f;
            var ghostRect = new RectangleF(
                _lastMouseCanvas.X - ghostW / 2,
                _lastMouseCanvas.Y - ghostH / 2,
                ghostW,
                ghostH);
            DiagramRenderer.DrawGhostShape(e.Graphics, _shapeKind, ghostRect);
        }

        // Endpoint handles for selected connector
        if (_selectedConnector is not null)
        {
            var cSrc = _project.Shapes.FirstOrDefault(s => s.Id == _selectedConnector.SourceShapeId);
            var cTgt = _project.Shapes.FirstOrDefault(s => s.Id == _selectedConnector.TargetShapeId);
            if (cSrc is not null && cTgt is not null)
            {
                var (sPt, ePt) = GetConnectorEndpoints(_selectedConnector);
                DrawConnectorHandle(e.Graphics, sPt);
                DrawConnectorHandle(e.Graphics, ePt);

                if (_draggingEndpoint != EndpointSide.None)
                {
                    var fixedPt = _draggingEndpoint == EndpointSide.Source ? ePt : sPt;
                    using var previewPen = new Pen(Color.OrangeRed, 2f / _zoom)
                        { DashStyle = System.Drawing.Drawing2D.DashStyle.Dash };
                    e.Graphics.DrawLine(previewPen, fixedPt, _endpointDragCurrentCanvas);

                    var hoverShape = HitTestShape(_endpointDragCurrentCanvas);
                    if (hoverShape is not null)
                    {
                        var hb = hoverShape.EffectiveBounds;
                        using var hlPen = new Pen(Color.OrangeRed, 2f / _zoom);
                        e.Graphics.DrawRectangle(hlPen, hb.X - 4, hb.Y - 4, hb.Width + 8, hb.Height + 8);
                    }
                }
            }
        }

        // Bend handle for selected orthogonal connector (drag to reposition the vertical segment)
        if (_selectedConnector is not null && !_isDraggingBend && !_isDraggingCurve &&
            (_selectedConnector.Kind == ConnectorKind.Orthogonal ||
             _selectedConnector.Kind == ConnectorKind.RightAngleCurved))
        {
            var cSrc = _project.Shapes.FirstOrDefault(s => s.Id == _selectedConnector.SourceShapeId);
            var cTgt = _project.Shapes.FirstOrDefault(s => s.Id == _selectedConnector.TargetShapeId);
            {
                var (sPt, ePt) = GetConnectorEndpoints(_selectedConnector);
                if (_selectedConnector.Kind is ConnectorKind.Orthogonal or ConnectorKind.RightAngleCurved)
                    DrawBendHandle(e.Graphics, DiagramRenderer.GetOrthogonalBendHandle(sPt, ePt, _selectedConnector));
            }
        }

        // Curve handle for selected curved connector (drag to change curvature)
        if (_selectedConnector?.Kind == ConnectorKind.Curved && !_isDraggingCurve && !_isDraggingBend)
        {
            var cSrc = _project.Shapes.FirstOrDefault(s => s.Id == _selectedConnector.SourceShapeId);
            var cTgt = _project.Shapes.FirstOrDefault(s => s.Id == _selectedConnector.TargetShapeId);
            if (cSrc is not null && cTgt is not null)
            {
                var (sPt, ePt) = GetConnectorEndpoints(_selectedConnector);
                var handle = GetCurveHandle(sPt, ePt, _selectedConnector);
                DrawCurveHandle(e.Graphics, handle);
            }
        }

        if (_connectorSource is not null && _mouseOnCanvas)
        {
            // Highlight source shape bounding box so the user can see what they clicked
            var srcBounds = _connectorSource.Bounds;
            using var hlPen = new Pen(Color.FromArgb(200, 255, 120, 0), 2f / _zoom) { DashStyle = System.Drawing.Drawing2D.DashStyle.Dot };
            e.Graphics.DrawRectangle(hlPen, srcBounds.X - 4, srcBounds.Y - 4, srcBounds.Width + 8, srcBounds.Height + 8);

            // Use a 1×1 virtual target at the cursor to find the real start anchor
            var virtualTarget = new DiagramShape
            {
                Kind = ShapeKind.Rectangle,
                X = _lastMouseCanvas.X,
                Y = _lastMouseCanvas.Y,
                Width = 1,
                Height = 1
            };
            var startPt = DiagramRenderer.GetConnectionPoint(_connectorSource, virtualTarget);
            var pts = DiagramRenderer.BuildConnectorPoints(_connectorKind, startPt, _lastMouseCanvas);

            using var pen = new Pen(Color.FromArgb(220, 255, 120, 0), 2.5f / _zoom) { DashStyle = System.Drawing.Drawing2D.DashStyle.Dash };
            if (_connectorKind == ConnectorKind.Curved && pts.Length == 4)
                e.Graphics.DrawBezier(pen, pts[0], pts[1], pts[2], pts[3]);
            else if (_connectorKind == ConnectorKind.RightAngleCurved && pts.Length >= 2)
                e.Graphics.DrawLines(pen, pts);
            else if (pts.Length >= 2)
                e.Graphics.DrawLines(pen, pts);

            // Dot at anchor start and at cursor
            float dotR = 5f / _zoom;
            using var dotBrush = new SolidBrush(Color.OrangeRed);
            e.Graphics.FillEllipse(dotBrush, startPt.X - dotR, startPt.Y - dotR, dotR * 2, dotR * 2);
            e.Graphics.FillEllipse(dotBrush, _lastMouseCanvas.X - dotR, _lastMouseCanvas.Y - dotR, dotR * 2, dotR * 2);
        }
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        Focus();
        var canvasPoint = ScreenToCanvas(e.Location);

        if (e.Button == MouseButtons.Right)
        {
            ShowContextMenu(e.Location, canvasPoint);
            return;
        }

        if (TryStartPan(e))
            return;

        if (_toolMode == ToolMode.Shape && e.Button == MouseButtons.Left)
        {
            var existing = HitTestShape(canvasPoint);
            if (existing is not null)
            {
                SelectedShape = existing;
                RecordUndo();
                _isDragging = true;
                _dragStartCanvas = canvasPoint;
                _lastMouseCanvas = canvasPoint;
                Capture = true;
                SelectToolRequested?.Invoke(this, EventArgs.Empty);
                SetToolMode(ToolMode.Select);
                return;
            }

            RecordUndo();
            _isCreating = true;
            _dragShape = new DiagramShape
            {
                Kind = _shapeKind,
                X = canvasPoint.X,
                Y = canvasPoint.Y,
                Width = 1,
                Height = 1
            };
            _dragStartCanvas = canvasPoint;
            Capture = true;
            Invalidate();
            return;
        }

        if (_toolMode == ToolMode.Connector && e.Button == MouseButtons.Left)
        {
            var shape = HitTestShape(canvasPoint);
            if (shape is null)
                return;

            if (_connectorSource is null)
            {
                _connectorSource = shape;
                Invalidate();
                return;
            }

            if (_connectorSource.Id != shape.Id)
            {
                RecordUndo();
                var connector = new DiagramConnector
                {
                    SourceShapeId  = _connectorSource.Id,
                    TargetShapeId  = shape.Id,
                    Kind           = _connectorPreset.Kind,
                    LineStyle      = _connectorPreset.LineStyle,
                    HasStartArrow  = _connectorPreset.StartArrow != ArrowHeadStyle.None,
                    HasEndArrow    = _connectorPreset.EndArrow   != ArrowHeadStyle.None,
                    StartArrowStyle = _connectorPreset.StartArrow,
                    EndArrowStyle   = _connectorPreset.EndArrow,
                };
                var sourcePoint = DiagramRenderer.GetConnectionPoint(_connectorSource, shape);
                var targetPoint = DiagramRenderer.GetConnectionPoint(shape, _connectorSource);
                connector.SourceAnchorAngle = DiagramRenderer.InferAnchorAngle(_connectorSource, sourcePoint);
                connector.TargetAnchorAngle = DiagramRenderer.InferAnchorAngle(shape, targetPoint);
                _project.Connectors.Add(connector);
                SelectedConnector = connector;
                _connectorSource = null;
                NotifyChanged();
            }
            else
            {
                _connectorSource = null;
                Invalidate();
            }

            return;
        }

        if (_toolMode == ToolMode.Select && e.Button == MouseButtons.Left)
        {
            // Check connector endpoint handles first (highest priority)
            if (_selectedConnector is not null)
            {
                var cSrc = _project.Shapes.FirstOrDefault(s => s.Id == _selectedConnector.SourceShapeId);
                var cTgt = _project.Shapes.FirstOrDefault(s => s.Id == _selectedConnector.TargetShapeId);
                if (cSrc is not null && cTgt is not null)
                {
                    float handleR = 8f / _zoom;
                    var (sPt, ePt) = GetConnectorEndpoints(_selectedConnector);
                    if (Distance(canvasPoint, sPt) <= handleR)
                    {
                        _draggingEndpoint = EndpointSide.Source;
                        _endpointDragCurrentCanvas = canvasPoint;
                        Capture = true;
                        return;
                    }
                    if (Distance(canvasPoint, ePt) <= handleR)
                    {
                        _draggingEndpoint = EndpointSide.Target;
                        _endpointDragCurrentCanvas = canvasPoint;
                        Capture = true;
                        return;
                    }
                }
            }

            // Check bend handle (orthogonal connectors)
            if (_selectedConnector is not null &&
                (_selectedConnector.Kind == ConnectorKind.Orthogonal ||
                 _selectedConnector.Kind == ConnectorKind.RightAngleCurved))
            {
                var (bSPt, bEPt) = GetConnectorEndpoints(_selectedConnector);
                if (bSPt != default || bEPt != default)
                {
                    var handle = DiagramRenderer.GetOrthogonalBendHandle(bSPt, bEPt, _selectedConnector);
                    if (Distance(canvasPoint, handle) <= 9f / _zoom)
                    {
                        RecordUndo();
                        _isDraggingBend = true;
                        Capture = true;
                        return;
                    }
                }
            }

            // Check curve handle (curved connectors)
            if (_selectedConnector?.Kind == ConnectorKind.Curved)
            {
                var (cSPt, cEPt) = GetConnectorEndpoints(_selectedConnector);
                if (cSPt != default || cEPt != default)
                {
                    var handle = GetCurveHandle(cSPt, cEPt, _selectedConnector);
                    if (Distance(canvasPoint, handle) <= 9f / _zoom)
                    {
                        RecordUndo();
                        _isDraggingCurve = true;
                        Capture = true;
                        return;
                    }
                }
            }

            // Check collapse button on any shape (before resize handles)
            foreach (var sh in _project.Shapes)
            {
                if (DiagramRenderer.GetCollapseButtonBounds(sh).Contains(canvasPoint))
                {
                    RecordUndo();
                    SelectedShape = sh;
                    sh.IsCollapsed = !sh.IsCollapsed;
                    NotifyChanged();
                    return;
                }
            }

            if (_selectedShape is not null)
            {
                _activeHandle = DiagramRenderer.HitTestResizeHandle(_selectedShape, canvasPoint, 8f / _zoom);
                if (_activeHandle != ResizeHandle.None)
                {
                    RecordUndo();
                    _isResizing = true;
                    _dragStartCanvas = canvasPoint;
                    Capture = true;
                    return;
                }
            }

            if (TryPickConnector(canvasPoint, out var hitConnector))
            {
                SelectedConnector = hitConnector;
                return;
            }

            var hitShape = HitTestShape(canvasPoint);
            if (hitShape is not null)
            {
                SelectedShape = hitShape;
                RecordUndo();
                _isDragging = true;
                _dragStartCanvas = canvasPoint;
                _lastMouseCanvas = canvasPoint;
                Capture = true;
                return;
            }

            if (CanPanWithDrag() || _spacePressed)
            {
                StartPan(e.Location);
                return;
            }

            ClearSelection();
        }
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        var canvasPoint = ScreenToCanvas(e.Location);

        if (_draggingEndpoint != EndpointSide.None)
        {
            _endpointDragCurrentCanvas = canvasPoint;
            Invalidate();
            return;
        }

        if (_isDraggingBend && _selectedConnector is not null)
        {
            var (bendStart, bendEnd) = GetConnectorEndpoints(_selectedConnector);
            if (DiagramRenderer.IsOrthogonalVerticalFirst(bendStart, bendEnd, _selectedConnector))
            {
                _selectedConnector.OrthoMidY = canvasPoint.Y;
                _selectedConnector.OrthoMidX = null;
            }
            else
            {
                _selectedConnector.OrthoMidX = canvasPoint.X;
                _selectedConnector.OrthoMidY = null;
            }

            Invalidate();
            return;
        }

        if (_isDraggingCurve && _selectedConnector is not null)
        {
            var (dSPt, dEPt) = GetConnectorEndpoints(_selectedConnector);
            float midX = (dSPt.X + dEPt.X) / 2f;
            float midY = (dSPt.Y + dEPt.Y) / 2f;
            _selectedConnector.CurveMidOffsetX = canvasPoint.X - midX;
            _selectedConnector.CurveMidOffsetY = canvasPoint.Y - midY;
            Invalidate();
            return;
        }

        if (_isPanning)
        {
            var dx = _panStartScreen.X - e.X;
            var dy = _panStartScreen.Y - e.Y;
            _hScroll.Value = ClampScroll(_hScroll, _panStartHScroll + dx);
            _vScroll.Value = ClampScroll(_vScroll, _panStartVScroll + dy);
            Invalidate();
            return;
        }

        if (_isCreating && _dragShape is not null)
        {
            var x = Math.Min(_dragStartCanvas.X, canvasPoint.X);
            var y = Math.Min(_dragStartCanvas.Y, canvasPoint.Y);
            var w = Math.Max(20 / _zoom, Math.Abs(canvasPoint.X - _dragStartCanvas.X));
            var h = Math.Max(20 / _zoom, Math.Abs(canvasPoint.Y - _dragStartCanvas.Y));
            _dragShape.X = x;
            _dragShape.Y = y;
            _dragShape.Width = w;
            _dragShape.Height = h;
            _lastMouseCanvas = canvasPoint;
            Invalidate();
            return;
        }

        if (_isResizing && _selectedShape is not null)
        {
            DiagramRenderer.ApplyResize(_selectedShape, _activeHandle, canvasPoint, _dragStartCanvas);
            _dragStartCanvas = canvasPoint;
            _lastMouseCanvas = canvasPoint;
            Invalidate();
            return;
        }

        if (_isDragging && _selectedShape is not null)
        {
            var dx = canvasPoint.X - _lastMouseCanvas.X;
            var dy = canvasPoint.Y - _lastMouseCanvas.Y;
            _selectedShape.X += dx;
            _selectedShape.Y += dy;
            _lastMouseCanvas = canvasPoint;
            Invalidate();
            return;
        }

        // Track position for ghost preview and connector source line
        bool needsRedraw = _toolMode == ToolMode.Shape || _toolMode == ToolMode.Connector;
        _lastMouseCanvas = canvasPoint;
        if (needsRedraw)
            Invalidate();
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);

        if (_isDraggingBend || _isDraggingCurve)
        {
            _isDraggingBend = false;
            _isDraggingCurve = false;
            Capture = false;
            NotifyChanged();
            return;
        }

        if (_draggingEndpoint != EndpointSide.None)
        {
            var canvasPoint = ScreenToCanvas(e.Location);
            var hitShape = HitTestShape(canvasPoint);
            if (hitShape is not null && _selectedConnector is not null)
            {
                var otherId = _draggingEndpoint == EndpointSide.Source
                    ? _selectedConnector.TargetShapeId
                    : _selectedConnector.SourceShapeId;

                if (hitShape.Id != otherId)
                {
                    RecordUndo();
                    var eb = hitShape.EffectiveBounds;
                    float cx = eb.X + eb.Width / 2;
                    float cy = eb.Y + eb.Height / 2;
                    float angle = MathF.Atan2(canvasPoint.Y - cy, canvasPoint.X - cx) * 180f / MathF.PI;
                    if (_draggingEndpoint == EndpointSide.Source)
                    {
                        _selectedConnector.SourceShapeId    = hitShape.Id;
                        _selectedConnector.SourceAnchorAngle = angle;
                    }
                    else
                    {
                        _selectedConnector.TargetShapeId    = hitShape.Id;
                        _selectedConnector.TargetAnchorAngle = angle;
                    }
                    NotifyChanged();
                }
            }
            else if (_selectedConnector is not null)
            {
                // Dropped on empty space — clear anchor angle so auto-route resumes
                if (_draggingEndpoint == EndpointSide.Source)
                    _selectedConnector.SourceAnchorAngle = null;
                else
                    _selectedConnector.TargetAnchorAngle = null;
            }

            _draggingEndpoint = EndpointSide.None;
            Capture = false;
            Invalidate();
            return;
        }

        if (_isPanning)
        {
            _isPanning = false;
            Capture = false;
            UpdateCursor();
            return;
        }

        if (_isCreating && _dragShape is not null)
        {
            if (_dragShape.Width >= 20 / _zoom && _dragShape.Height >= 20 / _zoom)
            {
                _project.Shapes.Add(_dragShape);
                SelectedShape = _dragShape;
                ShapeCreated?.Invoke(this, EventArgs.Empty);
                SelectToolRequested?.Invoke(this, EventArgs.Empty);
                SetToolMode(ToolMode.Select);
            }

            _dragShape = null;
            _isCreating = false;
            Capture = false;
            NotifyChanged();
            return;
        }

        if (_isDragging || _isResizing)
        {
            _isDragging = false;
            _isResizing = false;
            _activeHandle = ResizeHandle.None;
            Capture = false;
            NotifyChanged();
        }
    }

    protected override void OnMouseDoubleClick(MouseEventArgs e)
    {
        base.OnMouseDoubleClick(e);
        if (_toolMode != ToolMode.Select)
            return;

        var shape = HitTestShape(ScreenToCanvas(e.Location));
        if (shape is null)
            return;

        SelectedShape = shape;
        var input = PromptText("도형 텍스트 편집", shape.Text);
        if (input is null)
            return;

        RecordUndo();
        shape.Text = input;
        NotifyChanged();
    }

    protected override void OnMouseWheel(MouseEventArgs e)
    {
        base.OnMouseWheel(e);

        if (ModifierKeys.HasFlag(Keys.Control))
        {
            var factor = e.Delta > 0 ? 1.1f : 0.9f;
            ZoomAt(e.Location, factor);
            return;
        }

        if (ModifierKeys.HasFlag(Keys.Shift))
        {
            if (!_hScroll.Visible)
                return;

            var delta = e.Delta > 0 ? -_hScroll.SmallChange : _hScroll.SmallChange;
            _hScroll.Value = ClampScroll(_hScroll, _hScroll.Value + delta);
        }
        else
        {
            if (!_vScroll.Visible)
                return;

            var delta = e.Delta > 0 ? -_vScroll.SmallChange : _vScroll.SmallChange;
            _vScroll.Value = ClampScroll(_vScroll, _vScroll.Value + delta);
        }

        Invalidate();
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        UpdateScrollBars();
    }

    private bool TryStartPan(MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Middle || (_spacePressed && e.Button == MouseButtons.Left))
        {
            StartPan(e.Location);
            return true;
        }

        return false;
    }

    private void StartPan(Point screenPoint)
    {
        _isPanning = true;
        _panStartScreen = screenPoint;
        _panStartHScroll = _hScroll.Value;
        _panStartVScroll = _vScroll.Value;
        Capture = true;
        Cursor = Cursors.Hand;
    }

    private bool CanPanWithDrag()
    {
        if (_zoom <= 1.0f)
            return false;

        var content = GetLogicalContentSize();
        var viewport = GetViewportSize();
        return content.Width * _zoom > viewport.Width || content.Height * _zoom > viewport.Height;
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

    private Size GetLogicalContentSize()
    {
        float right = MinContentWidth;
        float bottom = MinContentHeight;

        foreach (var shape in _project.Shapes)
        {
            right = Math.Max(right, shape.X + shape.Width + ContentPadding);
            bottom = Math.Max(bottom, shape.Y + shape.Height + ContentPadding);
        }

        return new Size((int)Math.Ceiling(right), (int)Math.Ceiling(bottom));
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
        int width = ClientSize.Width;
        int height = ClientSize.Height;

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

        bool needV = content.Height > viewport.Height;
        bool needH = content.Width > viewport.Width;

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
        if (_isPanning || _spacePressed)
        {
            Cursor = Cursors.Hand;
            return;
        }

        Cursor = _toolMode switch
        {
            ToolMode.Shape => Cursors.Cross,
            ToolMode.Connector => Cursors.Hand,
            _ => Cursors.Default
        };
    }

    private void DrawGrid(Graphics g)
    {
        const int minorGrid = 20;
        const int majorGrid = 100;
        var logical = GetLogicalContentSize();

        // Compute visible canvas region to skip lines entirely outside the viewport.
        float visLeft = _hScroll.Value / _zoom;
        float visTop = _vScroll.Value / _zoom;
        var viewport = GetViewportSize();
        float visRight = Math.Min(logical.Width, visLeft + viewport.Width / _zoom);
        float visBottom = Math.Min(logical.Height, visTop + viewport.Height / _zoom);

        int xMinor0 = (int)(Math.Floor(visLeft / minorGrid) * minorGrid);
        int yMinor0 = (int)(Math.Floor(visTop / minorGrid) * minorGrid);
        int xMajor0 = (int)(Math.Floor(visLeft / majorGrid) * majorGrid);
        int yMajor0 = (int)(Math.Floor(visTop / majorGrid) * majorGrid);

        using var minorPen = new Pen(Color.FromArgb(22, 0, 0, 0), 1f / _zoom);
        using var majorPen = new Pen(Color.FromArgb(46, 0, 0, 0), 1.2f / _zoom);
        using var axisPen = new Pen(Color.FromArgb(90, 0, 120, 215), 1.5f / _zoom);

        for (int x = xMinor0; x <= visRight; x += minorGrid)
            g.DrawLine(minorPen, x, visTop, x, visBottom);
        for (int y = yMinor0; y <= visBottom; y += minorGrid)
            g.DrawLine(minorPen, visLeft, y, visRight, y);

        for (int x = xMajor0; x <= visRight; x += majorGrid)
            g.DrawLine(majorPen, x, visTop, x, visBottom);
        for (int y = yMajor0; y <= visBottom; y += majorGrid)
            g.DrawLine(majorPen, visLeft, y, visRight, y);

        // Highlight origin axis so users can quickly read position.
        g.DrawLine(axisPen, 0, visTop, 0, visBottom);
        g.DrawLine(axisPen, visLeft, 0, visRight, 0);

        // Draw coordinate labels (view only, never persisted/exported).
        var fontSize = Math.Clamp(9f / _zoom, 6f, 11f);
        using var font = new Font("맑은 고딕", fontSize, FontStyle.Regular, GraphicsUnit.Point);
        using var textBrush = new SolidBrush(Color.FromArgb(130, 0, 0, 0));
        var labelOffset = 2f / _zoom;

        for (int x = xMajor0; x <= visRight; x += majorGrid)
            if (x > 0) g.DrawString(x.ToString(), font, textBrush, x + labelOffset, labelOffset);
        for (int y = yMajor0; y <= visBottom; y += majorGrid)
            if (y > 0) g.DrawString(y.ToString(), font, textBrush, labelOffset, y + labelOffset);
    }

    private DiagramShape? HitTestShape(PointF point)
    {
        for (int i = _project.Shapes.Count - 1; i >= 0; i--)
        {
            if (DiagramRenderer.HitTestShape(_project.Shapes[i], point))
                return _project.Shapes[i];
        }

        return null;
    }

    private bool TryPickConnector(PointF point, out DiagramConnector connector)
    {
        connector = null!;
        DiagramConnector? best = null;
        float bestDistance = float.MaxValue;
        var hitShape = HitTestShape(point);

        for (int i = _project.Connectors.Count - 1; i >= 0; i--)
        {
            var candidate = _project.Connectors[i];
            var source = _project.Shapes.FirstOrDefault(s => s.Id == candidate.SourceShapeId);
            var target = _project.Shapes.FirstOrDefault(s => s.Id == candidate.TargetShapeId);
            if (source is null || target is null)
                continue;

            float tolerance = DiagramRenderer.GetConnectorHitTolerance(candidate, _zoom);
            float distance = DiagramRenderer.GetDistanceToConnector(candidate, source, target, point);
            if (distance > tolerance || distance >= bestDistance)
                continue;

            if (hitShape is not null
                && DiagramRenderer.HitTestShape(hitShape, point)
                && distance > 8f / _zoom)
                continue;

            best = candidate;
            bestDistance = distance;
        }

        if (best is null)
            return false;

        connector = best;
        return true;
    }

    private DiagramConnector? HitTestConnector(PointF point)
        => TryPickConnector(point, out var connector) ? connector : null;

    private static float Distance(PointF a, PointF b)
    {
        float dx = a.X - b.X;
        float dy = a.Y - b.Y;
        return MathF.Sqrt(dx * dx + dy * dy);
    }

    private PointF ScreenToCanvas(Point point)
        => new(
            (point.X + _hScroll.Value) / _zoom,
            (point.Y + _vScroll.Value) / _zoom);

    private void RecordUndo()
    {
        if (_suppressUndo)
            return;

        _undoManager.Push(_project);
        NotifyUndoState();
    }

    private void RecordPropertyUndo()
    {
        if (_suppressUndo || _propertyUndoRecorded)
            return;

        _undoManager.Push(_project);
        _propertyUndoRecorded = true;
        NotifyUndoState();
    }

    private void RestoreProject(DiagramProject restored)
    {
        _suppressUndo = true;
        try
        {
            DiagramRenderer.ClearImageCache();
            _project.Title = restored.Title;
            _project.CanvasBackColorArgb = restored.CanvasBackColorArgb;
            _project.Shapes = restored.Shapes.Select(s => s.Clone()).ToList();
            _project.Connectors = restored.Connectors.Select(c => c.Clone()).ToList();
            BackColor = Color.FromArgb(_project.CanvasBackColorArgb);
            _propertyUndoRecorded = false;
            ClearSelection();
            UpdateScrollBars();
            Invalidate();
            ProjectChanged?.Invoke(this, EventArgs.Empty);
            NotifyUndoState();
        }
        finally
        {
            _suppressUndo = false;
        }
    }

    private void NotifyUndoState() => UndoStateChanged?.Invoke(this, EventArgs.Empty);

    private void NotifyChanged()
    {
        UpdateScrollBars();
        Invalidate();
        ProjectChanged?.Invoke(this, EventArgs.Empty);
    }

    private void ShowContextMenu(Point screenPt, PointF canvasPt)
    {
        var hitShape = HitTestShape(canvasPt);
        var hitConnector = HitTestConnector(canvasPt);

        if (hitConnector is not null) SelectedConnector = hitConnector;
        else if (hitShape is not null) SelectedShape = hitShape;

        var menu = new ContextMenuStrip();

        if (hitShape is not null)
        {
            menu.Items.Add("텍스트 편집", null, (_, _) =>
            {
                var input = PromptText("도형 텍스트 편집", hitShape.Text);
                if (input is null) return;
                RecordUndo(); hitShape.Text = input; NotifyChanged();
            });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("맨 앞으로", null, (_, _) =>
            {
                RecordUndo();
                _project.Shapes.Remove(hitShape);
                _project.Shapes.Add(hitShape);
                NotifyChanged();
            });
            menu.Items.Add("맨 뒤로", null, (_, _) =>
            {
                RecordUndo();
                _project.Shapes.Remove(hitShape);
                _project.Shapes.Insert(0, hitShape);
                NotifyChanged();
            });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("삭제", null, (_, _) => DeleteSelection());
        }
        else if (hitConnector is not null)
        {
            var kindMenu = new ToolStripMenuItem("연결선 종류");
            kindMenu.DropDownItems.Add("직선",   null, (_, _) => ChangeConnectorKind(hitConnector, ConnectorKind.Straight));
            kindMenu.DropDownItems.Add("꺾은선", null, (_, _) => ChangeConnectorKind(hitConnector, ConnectorKind.Orthogonal));
            kindMenu.DropDownItems.Add("곡선",   null, (_, _) => ChangeConnectorKind(hitConnector, ConnectorKind.Curved));
            kindMenu.DropDownItems.Add("완만한꺾", null, (_, _) => ChangeConnectorKind(hitConnector, ConnectorKind.RightAngleCurved));
            menu.Items.Add(kindMenu);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("삭제", null, (_, _) => DeleteSelection());
        }

        if (menu.Items.Count > 0)
            menu.Show(this, screenPt);
        else
            menu.Dispose();
    }

    private void ChangeConnectorKind(DiagramConnector connector, ConnectorKind kind)
    {
        RecordUndo();
        connector.Kind = kind;
        NotifyChanged();
    }

    private void DrawConnectorHandle(Graphics g, PointF pt)
    {
        float r = 6f / _zoom;
        using var brush = new SolidBrush(Color.White);
        using var pen = new Pen(Color.DodgerBlue, 1.5f / _zoom);
        g.FillEllipse(brush, pt.X - r, pt.Y - r, r * 2, r * 2);
        g.DrawEllipse(pen, pt.X - r, pt.Y - r, r * 2, r * 2);
    }

    private void DrawBendHandle(Graphics g, PointF pt)
    {
        float r = 5f / _zoom;
        PointF[] diamond =
        [
            new(pt.X,     pt.Y - r),
            new(pt.X + r, pt.Y),
            new(pt.X,     pt.Y + r),
            new(pt.X - r, pt.Y)
        ];
        using var brush = new SolidBrush(Color.White);
        using var pen   = new Pen(Color.FromArgb(40, 130, 240), 1.5f / _zoom);
        g.FillPolygon(brush, diamond);
        g.DrawPolygon(pen, diamond);
    }

    private void DrawCurveHandle(Graphics g, PointF pt)
    {
        float r = 5f / _zoom;
        using var brush = new SolidBrush(Color.LightYellow);
        using var pen   = new Pen(Color.DarkGoldenrod, 1.5f / _zoom);
        g.FillRectangle(brush, pt.X - r, pt.Y - r, r * 2, r * 2);
        g.DrawRectangle(pen, pt.X - r, pt.Y - r, r * 2, r * 2);
    }

    private (PointF Start, PointF End) GetConnectorEndpoints(DiagramConnector c)
    {
        var src = _project.Shapes.FirstOrDefault(s => s.Id == c.SourceShapeId);
        var tgt = _project.Shapes.FirstOrDefault(s => s.Id == c.TargetShapeId);
        if (src is null || tgt is null) return default;
        return (DiagramRenderer.GetConnectionPoint(src, tgt, c.SourceAnchorAngle),
                DiagramRenderer.GetConnectionPoint(tgt, src, c.TargetAnchorAngle));
    }

    private static PointF GetCurveHandle(PointF start, PointF end, DiagramConnector connector)
    {
        float midX = (start.X + end.X) / 2f;
        float midY = (start.Y + end.Y) / 2f;
        return new PointF(midX + (connector.CurveMidOffsetX ?? 0f),
                          midY + (connector.CurveMidOffsetY ?? 0f));
    }

    private static string? PromptText(string title, string defaultValue)
    {
        using var form = new Form
        {
            Text = title,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            StartPosition = FormStartPosition.CenterParent,
            ClientSize = new Size(360, 140),
            MinimizeBox = false,
            MaximizeBox = false,
            ShowInTaskbar = false
        };

        var textBox = new TextBox
        {
            Location = new Point(12, 12),
            Size = new Size(336, 72),
            Multiline = true,
            Text = defaultValue,
            ScrollBars = ScrollBars.Vertical
        };
        var ok = new Button { Text = "확인", DialogResult = DialogResult.OK, Location = new Point(192, 96), Size = new Size(75, 28) };
        var cancel = new Button { Text = "취소", DialogResult = DialogResult.Cancel, Location = new Point(273, 96), Size = new Size(75, 28) };
        form.Controls.AddRange([textBox, ok, cancel]);
        form.AcceptButton = ok;
        form.CancelButton = cancel;

        return form.ShowDialog() == DialogResult.OK ? textBox.Text : null;
    }
}
