using System.ComponentModel;
using MyUML20WinV10.Export;
using MyUML20WinV10.Models;
using MyUML20WinV10.Rendering;

namespace MyUML20WinV10.Controls;

public sealed class UmlCanvas : Control
{
    private const float MinZoom = 0.25f;
    private const float MaxZoom = 4.0f;
    private const int MinContentWidth = 2400;
    private const int MinContentHeight = 1800;
    private const int ContentPadding = 200;
    private const float MinHitSize = 8f;

    private readonly VScrollBar _vScroll = new();
    private readonly HScrollBar _hScroll = new();

    private UmlProject _project = new();
    private UmlToolMode _toolMode = UmlToolMode.Select;
    private UmlDiagramNode? _selectedNode;
    private UmlDiagramEdge? _selectedEdge;
    private UmlDiagramNode? _hoverNode;
    private UmlDiagramEdge? _hoverEdge;
    private UmlDiagramNode? _pendingSourceNode;
    private UmlDiagramNode? _dragNode;
    private PointF _dragStartCanvas;
    private PointF _createPreviewEnd;
    private Point _dragStartScreen;
    private bool _isDragging;
    private bool _isCreating;
    private bool _isPanning;
    private bool _spacePressed;
    private bool _modelChangedDuringDrag;
    private Point _panStartScreen;
    private int _panStartHScroll;
    private int _panStartVScroll;
    private float _zoom = 1.0f;
    private PointF _pointerCanvas;
    private bool _pointerOnCanvas;

    public event EventHandler? SelectionChanged;
    public event EventHandler? ProjectChanged;
    public event EventHandler? SelectToolRequested;
    public event EventHandler? ZoomChanged;

    [Browsable(false)]
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public UmlProject Project
    {
        get => _project;
        set
        {
            _project = value;
            _selectedNode = null;
            _selectedEdge = null;
            _hoverNode = null;
            _hoverEdge = null;
            _pendingSourceNode = null;
            ResetView();
            ProjectChanged?.Invoke(this, EventArgs.Empty);
        }
    }

    [Browsable(false)]
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public UmlDiagram ActiveDiagram => _project.ActiveDiagram;

    [Browsable(false)]
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public UmlToolMode ToolMode => _toolMode;

    [Browsable(false)]
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public float Zoom => _zoom;

    [Browsable(false)]
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public UmlDiagramNode? SelectedNode => _selectedNode;

    [Browsable(false)]
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public UmlDiagramEdge? SelectedEdge => _selectedEdge;

    [Browsable(false)]
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public object? SelectedObject
    {
        get
        {
            if (_selectedNode is not null)
            {
                var element = _project.FindElement(_selectedNode.ModelElementId);
                return element ?? (object)_selectedNode;
            }

            if (_selectedEdge is not null)
            {
                var relationship = _project.FindRelationship(_selectedEdge.ModelElementId);
                return relationship ?? (object)_selectedEdge;
            }

            return null;
        }
    }

    public UmlCanvas()
    {
        DoubleBuffered = true;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw | ControlStyles.Selectable, true);
        BackColor = Color.FromArgb(245, 245, 245);
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

    public void SetToolMode(UmlToolMode mode)
    {
        _toolMode = mode;
        _pendingSourceNode = null;
        CancelInteraction();
        UpdateCursor();
    }

    public void LoadProject(UmlProject project) => Project = project;

    public void ZoomIn() => ZoomAt(GetViewportCenter(), 1.25f);

    public void ZoomOut() => ZoomAt(GetViewportCenter(), 0.8f);

    public void ZoomReset() => SetZoom(1.0f, GetViewportCenter());

    public void SelectModelElement(Guid modelElementId)
    {
        var node = ActiveDiagram.FindNodeByModelId(modelElementId);
        if (node is not null)
        {
            Select(node, null);
            return;
        }

        var edge = ActiveDiagram.Edges.FirstOrDefault(e => e.ModelElementId == modelElementId);
        if (edge is not null)
            Select(null, edge);
    }

    public bool TryPlaceNotation(UmlToolMode mode)
    {
        if (!UmlToolModeHelper.IsNodeCreateTool(mode))
            return false;

        var previousMode = _toolMode;
        _toolMode = mode;
        var center = ScreenToCanvas(GetViewportCenter());
        var size = GetDefaultSize(mode);
        var rect = new RectangleF(
            center.X - size.Width / 2f,
            center.Y - size.Height / 2f,
            size.Width,
            size.Height);
        CreateNode(rect);
        _toolMode = previousMode;
        NotifyChanged();
        return true;
    }

    public void DeleteSelection()
    {
        if (_selectedEdge is not null)
        {
            _project.RemoveElement(_selectedEdge.ModelElementId);
            ActiveDiagram.Edges.Remove(_selectedEdge);
            _selectedEdge = null;
            NotifyChanged();
            return;
        }

        if (_selectedNode is not null)
        {
            var modelId = _selectedNode.ModelElementId;
            ActiveDiagram.Nodes.Remove(_selectedNode);
            ActiveDiagram.Edges.RemoveAll(e => e.SourceNodeId == _selectedNode.Id || e.TargetNodeId == _selectedNode.Id);
            _project.RemoveElement(modelId);
            _selectedNode = null;
            NotifyChanged();
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        if (DesignMode)
        {
            using var designBrush = new SolidBrush(Color.FromArgb(240, 243, 248));
            e.Graphics.FillRectangle(designBrush, ClientRectangle);
            using var designPen = new Pen(Color.FromArgb(180, 180, 200));
            e.Graphics.DrawRectangle(designPen, 0, 0, Width - 1, Height - 1);
            return;
        }

        e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        e.Graphics.TranslateTransform(-_hScroll.Value, -_vScroll.Value);
        e.Graphics.ScaleTransform(_zoom, _zoom);

        DrawGrid(e.Graphics);
        UmlDiagramRenderer.DrawDiagram(e.Graphics, _project, ActiveDiagram, _selectedNode, _selectedEdge, _hoverNode, _hoverEdge);

        if (_isCreating)
            DrawCreatePreview(e.Graphics);
        else if (_pointerOnCanvas && !_isPanning && !_isDragging && UmlToolModeHelper.IsNodeCreateTool(_toolMode))
            DrawToolPlacementPreview(e.Graphics);
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        Focus();

        if (e.Button != MouseButtons.Left && e.Button != MouseButtons.Middle)
            return;

        if (TryStartPan(e))
            return;

        var canvasPoint = ScreenToCanvas(e.Location);
        _dragStartScreen = e.Location;
        _dragStartCanvas = canvasPoint;
        _createPreviewEnd = canvasPoint;

        if (_toolMode == UmlToolMode.Pan)
        {
            StartPan(e.Location);
            return;
        }

        var hitNode = HitTestNode(canvasPoint);
        var hitEdge = hitNode is null ? HitTestEdge(canvasPoint) : null;

        switch (_toolMode)
        {
            case UmlToolMode.Select:
                Select(hitNode, hitEdge);
                if (_selectedNode is not null)
                {
                    _dragNode = _selectedNode;
                    _isDragging = true;
                    _modelChangedDuringDrag = false;
                    Capture = true;
                }
                else if (_selectedEdge is not null)
                {
                    Capture = true;
                }
                break;

            case UmlToolMode.CreateClass:
            case UmlToolMode.CreateInterface:
            case UmlToolMode.CreateEnumeration:
            case UmlToolMode.CreatePackage:
            case UmlToolMode.CreateActor:
            case UmlToolMode.CreateUseCase:
            case UmlToolMode.CreateNote:
                if (hitNode is not null)
                {
                    Select(hitNode, null);
                    _dragNode = hitNode;
                    _isDragging = true;
                    _modelChangedDuringDrag = false;
                    Capture = true;
                    break;
                }

                _isCreating = true;
                Capture = true;
                Invalidate();
                break;

            case UmlToolMode.CreateAssociation:
            case UmlToolMode.CreateDirectedAssociation:
            case UmlToolMode.CreateAggregation:
            case UmlToolMode.CreateComposition:
            case UmlToolMode.CreateGeneralization:
            case UmlToolMode.CreateRealization:
            case UmlToolMode.CreateDependency:
            case UmlToolMode.CreateInclude:
            case UmlToolMode.CreateExtend:
                if (hitNode is null)
                    break;

                if (_pendingSourceNode is null)
                {
                    _pendingSourceNode = hitNode;
                    Select(hitNode, null);
                }
                else if (_pendingSourceNode.Id != hitNode.Id)
                {
                    CreateRelationship(_pendingSourceNode, hitNode);
                    _pendingSourceNode = null;
                }
                else
                {
                    _pendingSourceNode = null;
                }
                break;
        }
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);

        if (_isPanning)
        {
            var dx = _panStartScreen.X - e.X;
            var dy = _panStartScreen.Y - e.Y;
            _hScroll.Value = ClampScroll(_hScroll, _panStartHScroll + dx);
            _vScroll.Value = ClampScroll(_vScroll, _panStartVScroll + dy);
            Invalidate();
            return;
        }

        var canvasPoint = ScreenToCanvas(e.Location);

        if (_isCreating)
        {
            _createPreviewEnd = canvasPoint;
            Invalidate();
            return;
        }

        if (_isDragging && _dragNode is not null)
        {
            var dx = canvasPoint.X - _dragStartCanvas.X;
            var dy = canvasPoint.Y - _dragStartCanvas.Y;
            if (Math.Abs(dx) > 0.01f || Math.Abs(dy) > 0.01f)
            {
                _dragNode.X += dx;
                _dragNode.Y += dy;
                _dragStartCanvas = canvasPoint;
                _modelChangedDuringDrag = true;
                UpdateScrollBars();
                Invalidate();
            }

            return;
        }

        _pointerCanvas = canvasPoint;
        _pointerOnCanvas = true;
        UpdateHover(canvasPoint);
    }

    protected override void OnMouseEnter(EventArgs e)
    {
        base.OnMouseEnter(e);
        _pointerOnCanvas = true;
        Invalidate();
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        base.OnMouseLeave(e);
        _pointerOnCanvas = false;
        if (_hoverNode is null && _hoverEdge is null)
        {
            UpdateCursor();
            Invalidate();
            return;
        }

        _hoverNode = null;
        _hoverEdge = null;
        UpdateCursor();
        Invalidate();
    }

    protected override void OnMouseDoubleClick(MouseEventArgs e)
    {
        base.OnMouseDoubleClick(e);
        if (e.Button != MouseButtons.Left)
            return;

        CancelInteraction();

        var canvasPoint = ScreenToCanvas(e.Location);
        if (!TryEditAt(canvasPoint))
            return;

        SelectionChanged?.Invoke(this, EventArgs.Empty);
        NotifyChanged();
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);

        if (_isPanning)
        {
            _isPanning = false;
            Capture = false;
            UpdateCursor();
            return;
        }

        if (_isCreating)
        {
            var rect = NormalizeRect(_dragStartCanvas, ScreenToCanvas(e.Location));
            rect = EnsureDrawableRect(rect);
            CreateNode(rect);
            _isCreating = false;
            Capture = false;
            NotifyChanged();
            return;
        }

        if (_isDragging)
        {
            _isDragging = false;
            _dragNode = null;
            Capture = false;
            if (_modelChangedDuringDrag)
                NotifyChanged();
            return;
        }

        Capture = false;
    }

    protected override void OnMouseWheel(MouseEventArgs e)
    {
        if (!ClientRectangle.Contains(e.Location))
            return;

        if (ModifierKeys.HasFlag(Keys.Shift))
        {
            if (_hScroll.Visible)
            {
                var delta = e.Delta > 0 ? -_hScroll.SmallChange : _hScroll.SmallChange;
                _hScroll.Value = ClampScroll(_hScroll, _hScroll.Value + delta);
                Invalidate();
            }
            return;
        }

        var factor = e.Delta > 0 ? 1.1f : 0.9f;
        ZoomAt(e.Location, factor);
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        UpdateScrollBars();
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        base.OnKeyDown(e);
        if (e.KeyCode == Keys.Space)
        {
            _spacePressed = true;
            UpdateCursor();
        }

        if (e.KeyCode == Keys.Delete)
            DeleteSelection();

        if (e.KeyCode == Keys.Escape)
        {
            _pendingSourceNode = null;
            CancelInteraction();
            SetToolMode(UmlToolMode.Select);
            SelectToolRequested?.Invoke(this, EventArgs.Empty);
        }
    }

    protected override void OnKeyUp(KeyEventArgs e)
    {
        base.OnKeyUp(e);
        if (e.KeyCode == Keys.Space)
        {
            _spacePressed = false;
            UpdateCursor();
        }
    }

    private void CancelInteraction()
    {
        _isCreating = false;
        _isDragging = false;
        _isPanning = false;
        _dragNode = null;
        _modelChangedDuringDrag = false;
        Capture = false;
        Invalidate();
    }

    private void UpdateHover(PointF canvasPoint)
    {
        var hoverNode = HitTestNode(canvasPoint);
        var hoverEdge = hoverNode is null ? HitTestEdge(canvasPoint) : null;
        if (_hoverNode == hoverNode && _hoverEdge == hoverEdge)
            return;

        _hoverNode = hoverNode;
        _hoverEdge = hoverEdge;
        UpdateCursor();
        Invalidate();
    }

    private bool TryEditAt(PointF canvasPoint)
    {
        var hitNode = HitTestNode(canvasPoint) ?? _selectedNode;
        if (hitNode is not null)
        {
            Select(hitNode, null);
            var element = _project.FindElement(hitNode.ModelElementId);
            return element is not null && TryEditElement(element);
        }

        var hitEdge = HitTestEdge(canvasPoint) ?? _selectedEdge;
        if (hitEdge is not null)
        {
            Select(null, hitEdge);
            var relationship = _project.FindRelationship(hitEdge.ModelElementId);
            return relationship is not null && TryEditRelationship(relationship);
        }

        return false;
    }

    private IWin32Window PromptOwner => (IWin32Window?)FindForm() ?? this;

    private bool TryEditElement(UmlElement element)
    {
        switch (element)
        {
            case UmlNote note:
            {
                var text = UmlTextPrompt.Show(PromptOwner, "메모 편집", "내용", note.Body, multiline: true);
                if (text is null)
                    return false;

                note.Body = text;
                if (string.IsNullOrWhiteSpace(note.Name) || note.Name == "Note")
                    note.Name = text.Split('\n')[0].Trim();
                return true;
            }
            case UmlNamedElement named:
            {
                var text = UmlTextPrompt.Show(PromptOwner, "이름 편집", "이름", named.Name);
                if (text is null)
                    return false;

                named.Name = text.Trim();
                return true;
            }
            default:
                return false;
        }
    }

    private bool TryEditRelationship(UmlRelationship relationship)
    {
        if (relationship is UmlDependency dependency)
        {
            var text = UmlTextPrompt.Show(PromptOwner, "의존 편집", "스테레오타입", dependency.Stereotype);
            if (text is null)
                return false;

            dependency.Stereotype = text.Trim();
            return true;
        }

        var name = UmlTextPrompt.Show(PromptOwner, "관계 편집", "이름", relationship.Name ?? string.Empty);
        if (name is null)
            return false;

        relationship.Name = name.Trim();
        return true;
    }

    private void DrawCreatePreview(Graphics g)
    {
        var rect = EnsureDrawableRect(NormalizeRect(_dragStartCanvas, _createPreviewEnd));
        DrawPlacementPreview(g, rect);
    }

    private void DrawToolPlacementPreview(Graphics g)
    {
        var size = GetDefaultSize(_toolMode);
        var rect = new RectangleF(
            _pointerCanvas.X - size.Width / 2f,
            _pointerCanvas.Y - size.Height / 2f,
            size.Width,
            size.Height);
        DrawPlacementPreview(g, rect);
    }

    private void DrawPlacementPreview(Graphics g, RectangleF rect)
    {
        using var fill = new SolidBrush(Color.FromArgb(48, 79, 70, 229));
        g.FillRectangle(fill, rect.X, rect.Y, rect.Width, rect.Height);

        var previewRect = RectangleF.Inflate(rect, -6, -6);
        UmlToolModeHelper.DrawPreview(
            g,
            _toolMode,
            previewRect,
            Color.FromArgb(237, 233, 254),
            Color.FromArgb(79, 70, 229));

        using var pen = new Pen(Color.FromArgb(200, 79, 70, 229), 1.5f / _zoom)
        {
            DashStyle = System.Drawing.Drawing2D.DashStyle.Dash,
        };
        g.DrawRectangle(pen, rect.X, rect.Y, rect.Width, rect.Height);
    }

    private RectangleF EnsureDrawableRect(RectangleF rect)
    {
        const float minScreen = 6f;
        var screenW = Math.Abs(rect.Width) * _zoom;
        var screenH = Math.Abs(rect.Height) * _zoom;

        if (screenW >= minScreen && screenH >= minScreen)
            return rect;

        var defaults = GetDefaultSize(_toolMode);
        return new RectangleF(rect.X, rect.Y, defaults.Width, defaults.Height);
    }

    private static SizeF GetDefaultSize(UmlToolMode mode) => mode switch
    {
        UmlToolMode.CreateActor => new SizeF(72, 96),
        UmlToolMode.CreateUseCase => new SizeF(140, 72),
        UmlToolMode.CreateNote => new SizeF(120, 72),
        UmlToolMode.CreatePackage => new SizeF(200, 140),
        UmlToolMode.CreateInterface => new SizeF(160, 100),
        UmlToolMode.CreateEnumeration => new SizeF(140, 90),
        _ => new SizeF(160, 120),
    };

    private void CreateNode(RectangleF rect)
    {
        UmlElement element;
        UmlNodePresentation presentation;

        switch (_toolMode)
        {
            case UmlToolMode.CreateInterface:
                element = new UmlInterface();
                presentation = UmlNodePresentation.Classifier;
                _project.RootPackage.AddClassifier((UmlClassifier)element);
                break;
            case UmlToolMode.CreateEnumeration:
                element = new UmlEnumeration();
                presentation = UmlNodePresentation.Classifier;
                _project.RootPackage.AddClassifier((UmlClassifier)element);
                break;
            case UmlToolMode.CreatePackage:
                element = new UmlPackage { Name = "Package" };
                presentation = UmlNodePresentation.Package;
                _project.RootPackage.AddNestedPackage((UmlPackage)element);
                break;
            case UmlToolMode.CreateActor:
                element = new UmlActor();
                presentation = UmlNodePresentation.Actor;
                _project.RootPackage.AddActor((UmlActor)element);
                break;
            case UmlToolMode.CreateUseCase:
                element = new UmlUseCase();
                presentation = UmlNodePresentation.UseCase;
                _project.RootPackage.AddUseCase((UmlUseCase)element);
                break;
            case UmlToolMode.CreateNote:
                element = new UmlNote();
                presentation = UmlNodePresentation.Note;
                _project.RootPackage.AddNote((UmlNote)element);
                break;
            default:
                element = new UmlClass();
                presentation = UmlNodePresentation.Classifier;
                _project.RootPackage.AddClassifier((UmlClass)element);
                break;
        }

        var node = new UmlDiagramNode
        {
            ModelElementId = element.Id,
            Presentation = presentation,
            X = rect.X,
            Y = rect.Y,
            Width = Math.Max(24, rect.Width),
            Height = Math.Max(24, rect.Height),
        };
        ActiveDiagram.Nodes.Add(node);
        Select(node, null);
    }

    private void CreateRelationship(UmlDiagramNode sourceNode, UmlDiagramNode targetNode)
    {
        UmlRelationship relationship = _toolMode switch
        {
            UmlToolMode.CreateGeneralization => new UmlGeneralization
            {
                SourceClassifierId = sourceNode.ModelElementId,
                TargetClassifierId = targetNode.ModelElementId,
            },
            UmlToolMode.CreateRealization => new UmlRealization
            {
                SourceClassifierId = sourceNode.ModelElementId,
                TargetClassifierId = targetNode.ModelElementId,
            },
            UmlToolMode.CreateDependency => new UmlDependency
            {
                SourceClassifierId = sourceNode.ModelElementId,
                TargetClassifierId = targetNode.ModelElementId,
            },
            UmlToolMode.CreateInclude => new UmlInclude
            {
                SourceClassifierId = sourceNode.ModelElementId,
                TargetClassifierId = targetNode.ModelElementId,
            },
            UmlToolMode.CreateExtend => new UmlExtend
            {
                SourceClassifierId = sourceNode.ModelElementId,
                TargetClassifierId = targetNode.ModelElementId,
            },
            UmlToolMode.CreateAggregation => new UmlAssociation
            {
                SourceClassifierId = sourceNode.ModelElementId,
                TargetClassifierId = targetNode.ModelElementId,
                Aggregation = UmlAggregationKind.Shared,
            },
            UmlToolMode.CreateComposition => new UmlAssociation
            {
                SourceClassifierId = sourceNode.ModelElementId,
                TargetClassifierId = targetNode.ModelElementId,
                Aggregation = UmlAggregationKind.Composite,
            },
            _ => new UmlAssociation
            {
                SourceClassifierId = sourceNode.ModelElementId,
                TargetClassifierId = targetNode.ModelElementId,
            },
        };

        _project.RootPackage.AddRelationship(relationship);
        var edge = new UmlDiagramEdge
        {
            ModelElementId = relationship.Id,
            SourceNodeId = sourceNode.Id,
            TargetNodeId = targetNode.Id,
        };
        ActiveDiagram.Edges.Add(edge);
        Select(null, edge);
        NotifyChanged();
    }

    private void Select(UmlDiagramNode? node, UmlDiagramEdge? edge)
    {
        var changed = _selectedNode != node || _selectedEdge != edge;
        _selectedNode = node;
        _selectedEdge = edge;
        if (node is not null)
            _selectedEdge = null;
        if (edge is not null)
            _selectedNode = null;

        Invalidate();
        if (changed)
            SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    private UmlDiagramNode? HitTestNode(PointF location)
    {
        UmlDiagramLayout.Prepare(_project, ActiveDiagram);
        for (var i = ActiveDiagram.Nodes.Count - 1; i >= 0; i--)
        {
            var node = ActiveDiagram.Nodes[i];
            var bounds = node.Bounds;
            var minW = Math.Max(bounds.Width, MinHitSize / _zoom);
            var minH = Math.Max(bounds.Height, MinHitSize / _zoom);
            var hit = new RectangleF(bounds.X, bounds.Y, minW, minH);
            if (hit.Contains(location))
                return node;
        }

        return null;
    }

    private UmlDiagramEdge? HitTestEdge(PointF location)
    {
        var threshold = Math.Max(6f, MinHitSize) / _zoom;
        foreach (var edge in ActiveDiagram.Edges)
        {
            var source = ActiveDiagram.FindNode(edge.SourceNodeId);
            var target = ActiveDiagram.FindNode(edge.TargetNodeId);
            if (source is null || target is null)
                continue;

            var start = new PointF(source.Bounds.Left + source.Bounds.Width / 2f, source.Bounds.Top + source.Bounds.Height / 2f);
            var end = new PointF(target.Bounds.Left + target.Bounds.Width / 2f, target.Bounds.Top + target.Bounds.Height / 2f);
            if (DistanceToSegment(location, start, end) <= threshold)
                return edge;
        }

        return null;
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

    private void SetZoom(float zoom, Point anchor)
    {
        var oldZoom = _zoom;
        _zoom = Math.Clamp(zoom, MinZoom, MaxZoom);
        if (Math.Abs(_zoom - oldZoom) < 0.001f)
            return;

        AdjustScrollForZoom(anchor, oldZoom);
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
        UmlDiagramLayout.Prepare(_project, ActiveDiagram);
        float right = MinContentWidth;
        float bottom = MinContentHeight;

        if (_isCreating)
        {
            var preview = EnsureDrawableRect(NormalizeRect(_dragStartCanvas, _createPreviewEnd));
            right = Math.Max(right, preview.Right + ContentPadding);
            bottom = Math.Max(bottom, preview.Bottom + ContentPadding);
        }

        foreach (var node in ActiveDiagram.Nodes)
        {
            right = Math.Max(right, node.X + node.Width + ContentPadding);
            bottom = Math.Max(bottom, node.Y + node.Height + ContentPadding);
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

    private void DrawGrid(Graphics g)
    {
        const int minorGrid = 20;
        const int majorGrid = 100;
        var logical = GetLogicalContentSize();

        var visLeft = _hScroll.Value / _zoom;
        var visTop = _vScroll.Value / _zoom;
        var viewport = GetViewportSize();
        var visRight = Math.Min(logical.Width, visLeft + viewport.Width / _zoom);
        var visBottom = Math.Min(logical.Height, visTop + viewport.Height / _zoom);

        var xMinor0 = (int)(Math.Floor(visLeft / minorGrid) * minorGrid);
        var yMinor0 = (int)(Math.Floor(visTop / minorGrid) * minorGrid);
        var xMajor0 = (int)(Math.Floor(visLeft / majorGrid) * majorGrid);
        var yMajor0 = (int)(Math.Floor(visTop / majorGrid) * majorGrid);

        using var minorPen = new Pen(Color.FromArgb(22, 0, 0, 0), 1f / _zoom);
        using var majorPen = new Pen(Color.FromArgb(46, 0, 0, 0), 1.2f / _zoom);

        for (var x = xMinor0; x <= visRight; x += minorGrid)
            g.DrawLine(minorPen, x, visTop, x, visBottom);
        for (var y = yMinor0; y <= visBottom; y += minorGrid)
            g.DrawLine(minorPen, visLeft, y, visRight, y);

        for (var x = xMajor0; x <= visRight; x += majorGrid)
            g.DrawLine(majorPen, x, visTop, x, visBottom);
        for (var y = yMajor0; y <= visBottom; y += majorGrid)
            g.DrawLine(majorPen, visLeft, y, visRight, y);
    }

    private PointF ScreenToCanvas(Point point) =>
        new((point.X + _hScroll.Value) / _zoom, (point.Y + _vScroll.Value) / _zoom);

    private void UpdateCursor()
    {
        if (_isPanning || _spacePressed || _toolMode == UmlToolMode.Pan)
        {
            Cursor = Cursors.Hand;
            return;
        }

        if (_toolMode == UmlToolMode.Select && (_hoverNode is not null || _hoverEdge is not null))
        {
            Cursor = Cursors.SizeAll;
            return;
        }

        Cursor = UmlToolModeHelper.IsNodeCreateTool(_toolMode) ? Cursors.Cross : Cursors.Default;
    }

    private static float DistanceToSegment(PointF p, PointF a, PointF b)
    {
        var dx = b.X - a.X;
        var dy = b.Y - a.Y;
        if (dx == 0 && dy == 0)
            return Distance(p, a);

        var t = ((p.X - a.X) * dx + (p.Y - a.Y) * dy) / (dx * dx + dy * dy);
        t = Math.Clamp(t, 0, 1);
        var proj = new PointF(a.X + t * dx, a.Y + t * dy);
        return Distance(p, proj);
    }

    private static float Distance(PointF p, PointF f) =>
        MathF.Sqrt((p.X - f.X) * (p.X - f.X) + (p.Y - f.Y) * (p.Y - f.Y));

    private static RectangleF NormalizeRect(PointF a, PointF b) =>
        RectangleF.FromLTRB(Math.Min(a.X, b.X), Math.Min(a.Y, b.Y), Math.Max(a.X, b.X), Math.Max(a.Y, b.Y));

    private void NotifyChanged()
    {
        UpdateScrollBars();
        Invalidate();
        ProjectChanged?.Invoke(this, EventArgs.Empty);
    }
}
