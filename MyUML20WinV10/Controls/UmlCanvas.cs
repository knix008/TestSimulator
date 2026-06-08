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
    private bool _isResizing;
    private int _resizeHandleIndex = -1;
    private RectangleF _resizeBoundsAtStart;
    private float _relationshipAnchorY;

    public event EventHandler? SelectionChanged;
    public event EventHandler? ProjectChanged;
    public event EventHandler? SelectToolRequested;
    public event EventHandler<UmlToolMode>? ToolModeRequested;
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

    public void SetActiveDiagram(UmlDiagram diagram)
    {
        _project.ActiveDiagram = diagram;
        _selectedNode = null;
        _selectedEdge = null;
        _hoverNode = null;
        _hoverEdge = null;
        _pendingSourceNode = null;
        UpdateScrollBars();
        Invalidate();
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

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

        if (UmlToolModeHelper.IsRelationshipTool(_toolMode) && _hoverNode is not null)
            DrawConnectableHighlight(e.Graphics, _hoverNode);

        if (_pendingSourceNode is not null && _pointerOnCanvas)
            DrawConnectionPreview(e.Graphics);

        if (_isCreating)
            DrawCreatePreview(e.Graphics);
        else if (_pointerOnCanvas && !_isPanning && !_isDragging && !_isResizing && UmlToolModeHelper.IsNodeCreateTool(_toolMode))
            DrawToolPlacementPreview(e.Graphics);
        else if (_pointerOnCanvas && !_isPanning && !_isDragging && !_isCreating && !_isResizing && UmlToolModeHelper.IsRelationshipTool(_toolMode) && _pendingSourceNode is null)
            DrawRelationshipSilhouette(e.Graphics);

    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        Focus();

        if (e.Button == MouseButtons.Right)
        {
            var rpt = ScreenToCanvas(e.Location);
            var rn = HitTestNode(rpt);
            var re = rn is null ? HitTestEdge(rpt) : null;
            if (rn is not null || re is not null)
                Select(rn, re);
            return;
        }

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
                if (_selectedNode is not null)
                {
                    var hi = HitTestResizeHandle(canvasPoint);
                    if (hi >= 0)
                    {
                        _isResizing = true;
                        _resizeHandleIndex = hi;
                        _resizeBoundsAtStart = _selectedNode.Bounds;
                        Capture = true;
                        break;
                    }
                }
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
                else
                {
                    StartPan(e.Location);
                }
                break;

            case UmlToolMode.CreateClass:
            case UmlToolMode.CreateInterface:
            case UmlToolMode.CreateEnumeration:
            case UmlToolMode.CreatePackage:
            case UmlToolMode.CreateActor:
            case UmlToolMode.CreateUseCase:
            case UmlToolMode.CreateNote:
            case UmlToolMode.CreateState:
            case UmlToolMode.CreateInitialState:
            case UmlToolMode.CreateFinalState:
            case UmlToolMode.CreateAction:
            case UmlToolMode.CreateInitialNode:
            case UmlToolMode.CreateActivityFinalNode:
            case UmlToolMode.CreateDecision:
            case UmlToolMode.CreateMerge:
            case UmlToolMode.CreateFork:
            case UmlToolMode.CreateJoin:
            case UmlToolMode.CreateLifeline:
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

            case UmlToolMode.CreateSelfMessage:
                if (hitNode is null)
                {
                    StartPan(e.Location);
                    break;
                }

                if (ActiveDiagram.Kind != UmlDiagramKind.SequenceDiagram
                    || !UmlSequenceLayout.IsLifeline(_project, hitNode))
                    break;

                _relationshipAnchorY = canvasPoint.Y;
                CreateRelationship(hitNode, hitNode);
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
            case UmlToolMode.CreateMessage:
            case UmlToolMode.CreateAsyncMessage:
            case UmlToolMode.CreateReturnMessage:
            case UmlToolMode.CreateTransition:
            case UmlToolMode.CreateControlFlow:
            case UmlToolMode.CreateObjectFlow:
                if (hitNode is null)
                {
                    StartPan(e.Location);
                    break;
                }

                if (_pendingSourceNode is null)
                {
                    if (ActiveDiagram.Kind == UmlDiagramKind.SequenceDiagram
                        && UmlToolModeHelper.IsSequenceMessageTool(_toolMode)
                        && !UmlSequenceLayout.IsLifeline(_project, hitNode))
                        break;

                    _pendingSourceNode = hitNode;
                    _relationshipAnchorY = canvasPoint.Y;
                    Select(hitNode, null);
                }
                else if (_pendingSourceNode.Id != hitNode.Id)
                {
                    if (ActiveDiagram.Kind == UmlDiagramKind.SequenceDiagram
                        && UmlToolModeHelper.IsSequenceMessageTool(_toolMode)
                        && !UmlSequenceLayout.IsLifeline(_project, hitNode))
                        break;

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

        if (_isResizing && _selectedNode is not null)
        {
            ApplyResize(canvasPoint);
            UpdateScrollBars();
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

        if (ShouldRepaintPointerPreview())
            Invalidate();
    }

    private bool ShouldRepaintPointerPreview() =>
        _pointerOnCanvas && !_isPanning && !_isDragging && !_isCreating && !_isResizing &&
        (UmlToolModeHelper.IsNodeCreateTool(_toolMode) || UmlToolModeHelper.IsRelationshipTool(_toolMode));

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

        if (e.Button == MouseButtons.Right && !_isPanning && !_isDragging && !_isCreating && !_isResizing)
        {
            ShowContextMenu(e.Location);
            return;
        }

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
            _toolMode = UmlToolMode.Select;
            SelectToolRequested?.Invoke(this, EventArgs.Empty);
            NotifyChanged();
            return;
        }

        if (_isResizing)
        {
            _isResizing = false;
            _resizeHandleIndex = -1;
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
        _isResizing = false;
        _resizeHandleIndex = -1;
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

    private void DrawRelationshipSilhouette(Graphics g)
    {
        const float w = 72f;
        const float h = 36f;
        var rect = new RectangleF(_pointerCanvas.X - w / 2f, _pointerCanvas.Y - h / 2f, w, h);
        UmlToolModeHelper.DrawPreview(g, _toolMode, rect, Color.FromArgb(120, 237, 233, 254), Color.FromArgb(210, 79, 70, 229));
    }

    private void DrawPlacementPreview(Graphics g, RectangleF rect)
    {
        UmlNotationPreview.DrawGhost(g, _toolMode, rect);

        using var pen = new Pen(Color.FromArgb(220, 79, 70, 229), 2f / _zoom)
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
        UmlToolMode.CreateState => new SizeF(140, 72),
        UmlToolMode.CreateInitialState => new SizeF(32, 32),
        UmlToolMode.CreateFinalState => new SizeF(32, 32),
        UmlToolMode.CreateAction => new SizeF(140, 60),
        UmlToolMode.CreateInitialNode => new SizeF(32, 32),
        UmlToolMode.CreateActivityFinalNode => new SizeF(32, 32),
        UmlToolMode.CreateDecision => new SizeF(72, 72),
        UmlToolMode.CreateMerge => new SizeF(72, 72),
        UmlToolMode.CreateFork => new SizeF(160, 20),
        UmlToolMode.CreateJoin => new SizeF(160, 20),
        UmlToolMode.CreateLifeline => new SizeF(120, 240),
        UmlToolMode.CreateActivation => new SizeF(24, 60),
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
            case UmlToolMode.CreateState:
                element = new UmlBehaviorNode { Name = "State", Kind = UmlBehaviorNodeKind.State };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateInitialState:
                element = new UmlBehaviorNode { Name = "Initial", Kind = UmlBehaviorNodeKind.InitialState };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateFinalState:
                element = new UmlBehaviorNode { Name = "Final", Kind = UmlBehaviorNodeKind.FinalState };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateAction:
                element = new UmlBehaviorNode { Name = "Action", Kind = UmlBehaviorNodeKind.Action };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateInitialNode:
                element = new UmlBehaviorNode { Name = "Initial", Kind = UmlBehaviorNodeKind.InitialNode };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateActivityFinalNode:
                element = new UmlBehaviorNode { Name = "Final", Kind = UmlBehaviorNodeKind.ActivityFinalNode };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateDecision:
                element = new UmlBehaviorNode { Name = "Decision", Kind = UmlBehaviorNodeKind.Decision };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateMerge:
                element = new UmlBehaviorNode { Name = "Merge", Kind = UmlBehaviorNodeKind.Merge };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateFork:
                element = new UmlBehaviorNode { Name = "Fork", Kind = UmlBehaviorNodeKind.Fork };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateJoin:
                element = new UmlBehaviorNode { Name = "Join", Kind = UmlBehaviorNodeKind.Join };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateLifeline:
                element = new UmlBehaviorNode { Name = "Lifeline", Kind = UmlBehaviorNodeKind.Lifeline };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateActivation:
                element = new UmlBehaviorNode { Name = "Activation", Kind = UmlBehaviorNodeKind.Activation };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
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
            UmlToolMode.CreateMessage or UmlToolMode.CreateAsyncMessage or UmlToolMode.CreateReturnMessage or UmlToolMode.CreateSelfMessage
                => new UmlBehaviorConnector
                {
                    Kind = UmlBehaviorConnectorKind.Message,
                    MessageKind = UmlToolModeHelper.MessageKindFromTool(_toolMode),
                    Name = GetDefaultSequenceMessageName(_toolMode),
                    SourceClassifierId = sourceNode.ModelElementId,
                    TargetClassifierId = targetNode.ModelElementId,
                },
            UmlToolMode.CreateTransition => new UmlBehaviorConnector
            {
                Kind = UmlBehaviorConnectorKind.Transition,
                SourceClassifierId = sourceNode.ModelElementId,
                TargetClassifierId = targetNode.ModelElementId,
            },
            UmlToolMode.CreateControlFlow => new UmlBehaviorConnector
            {
                Kind = UmlBehaviorConnectorKind.ControlFlow,
                SourceClassifierId = sourceNode.ModelElementId,
                TargetClassifierId = targetNode.ModelElementId,
            },
            UmlToolMode.CreateObjectFlow => new UmlBehaviorConnector
            {
                Kind = UmlBehaviorConnectorKind.ObjectFlow,
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
            UmlToolMode.CreateDirectedAssociation => new UmlAssociation
            {
                SourceClassifierId = sourceNode.ModelElementId,
                TargetClassifierId = targetNode.ModelElementId,
                IsDirected = true,
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

        if (ActiveDiagram.Kind == UmlDiagramKind.SequenceDiagram && UmlToolModeHelper.IsSequenceMessageTool(_toolMode))
        {
            var messageY = UmlSequenceLayout.SuggestNextMessageY(_project, ActiveDiagram, _relationshipAnchorY);
            edge.SequenceY = messageY;
            UmlSequenceLayout.EnsureLifelinesFitMessage(_project, ActiveDiagram, edge);
        }

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
        UmlDiagramLayout.Prepare(_project, ActiveDiagram);
        var threshold = Math.Max(6f, MinHitSize) / _zoom;

        if (ActiveDiagram.Kind == UmlDiagramKind.SequenceDiagram)
        {
            foreach (var edge in ActiveDiagram.Edges)
            {
                if (!UmlSequenceLayout.IsSequenceMessage(_project, ActiveDiagram, edge))
                    continue;

                foreach (var (start, end) in UmlSequenceLayout.GetMessageSegments(_project, ActiveDiagram, edge))
                {
                    if (DistanceToSegment(location, start, end) <= threshold)
                        return edge;
                }
            }

            return null;
        }

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
        if (_isResizing)
        {
            Cursor = GetResizeCursor(_resizeHandleIndex);
            return;
        }

        if (_isPanning || _spacePressed || _toolMode == UmlToolMode.Pan)
        {
            Cursor = Cursors.Hand;
            return;
        }

        if (_toolMode == UmlToolMode.Select)
        {
            if (_selectedNode is not null && _pointerOnCanvas)
            {
                var hi = HitTestResizeHandle(_pointerCanvas);
                if (hi >= 0)
                {
                    Cursor = GetResizeCursor(hi);
                    return;
                }
            }

            if (_hoverNode is not null || _hoverEdge is not null)
            {
                Cursor = Cursors.SizeAll;
                return;
            }

            Cursor = Cursors.Hand;
            return;
        }

        if (UmlToolModeHelper.IsNodeCreateTool(_toolMode) && _hoverNode is not null)
        {
            Cursor = Cursors.SizeAll;
            return;
        }

        if (UmlToolModeHelper.IsRelationshipTool(_toolMode) && _hoverNode is not null)
        {
            Cursor = Cursors.Hand;
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

    // ── Resize ────────────────────────────────────────────────────────────

    private int HitTestResizeHandle(PointF location)
    {
        if (_selectedNode is null) return -1;
        var rect = _selectedNode.Bounds;
        const float hitSize = 12f;
        var half = hitSize / 2f;
        PointF[] pts =
        [
            new(rect.Left, rect.Top),
            new(rect.Left + rect.Width / 2f, rect.Top),
            new(rect.Right, rect.Top),
            new(rect.Right, rect.Top + rect.Height / 2f),
            new(rect.Right, rect.Bottom),
            new(rect.Left + rect.Width / 2f, rect.Bottom),
            new(rect.Left, rect.Bottom),
            new(rect.Left, rect.Top + rect.Height / 2f),
        ];

        for (var i = 0; i < pts.Length; i++)
        {
            var hr = new RectangleF(pts[i].X - half, pts[i].Y - half, hitSize, hitSize);
            if (hr.Contains(location))
                return i;
        }

        return -1;
    }

    private static Cursor GetResizeCursor(int idx) => idx switch
    {
        0 or 4 => Cursors.SizeNWSE,
        2 or 6 => Cursors.SizeNESW,
        1 or 5 => Cursors.SizeNS,
        _ => Cursors.SizeWE,
    };

    private void ApplyResize(PointF p)
    {
        if (_selectedNode is null) return;
        const float minW = 60f;
        const float minH = 40f;
        var o = _resizeBoundsAtStart;
        var left = o.Left; var top = o.Top; var right = o.Right; var bottom = o.Bottom;

        switch (_resizeHandleIndex)
        {
            case 0: left = p.X; top = p.Y; break;
            case 1: top = p.Y; break;
            case 2: right = p.X; top = p.Y; break;
            case 3: right = p.X; break;
            case 4: right = p.X; bottom = p.Y; break;
            case 5: bottom = p.Y; break;
            case 6: left = p.X; bottom = p.Y; break;
            case 7: left = p.X; break;
        }

        if (right - left < minW)
        {
            if (_resizeHandleIndex is 0 or 6 or 7) left = right - minW;
            else right = left + minW;
        }

        if (bottom - top < minH)
        {
            if (_resizeHandleIndex is 0 or 1 or 2) top = bottom - minH;
            else bottom = top + minH;
        }

        _selectedNode.X = left;
        _selectedNode.Y = top;
        _selectedNode.Width = right - left;
        _selectedNode.Height = bottom - top;
    }

    // ── Overlays ──────────────────────────────────────────────────────────

    private void DrawConnectableHighlight(Graphics g, UmlDiagramNode node)
    {
        var b = node.Bounds;
        var color = _pendingSourceNode is not null
            ? Color.FromArgb(210, 20, 180, 70)
            : Color.FromArgb(160, 0, 140, 200);
        using var pen = new Pen(color, 2f) { DashStyle = System.Drawing.Drawing2D.DashStyle.Dot };
        g.DrawRectangle(pen, b.X, b.Y, b.Width, b.Height);
    }

    private void DrawConnectionPreview(Graphics g)
    {
        if (_pendingSourceNode is null) return;

        PointF src;
        PointF tgt;

        if (ActiveDiagram.Kind == UmlDiagramKind.SequenceDiagram && UmlToolModeHelper.IsSequenceMessageTool(_toolMode))
        {
            if (_toolMode == UmlToolMode.CreateSelfMessage)
            {
                var messageY = UmlSequenceLayout.SuggestNextMessageY(_project, ActiveDiagram, _pointerCanvas.Y);
                var srcX = UmlSequenceLayout.GetLifelineCenterX(_pendingSourceNode.Bounds);
                var right = srcX + UmlSequenceLayout.SelfMessageLoopWidth;
                var bottom = messageY + UmlSequenceLayout.SelfMessageLoopHeight;
                src = new PointF(srcX, messageY);
                tgt = new PointF(right, messageY);

                using var dashPen = new Pen(Color.FromArgb(200, 0, 140, 90), 2f / _zoom)
                {
                    DashStyle = System.Drawing.Drawing2D.DashStyle.Dash,
                };
                g.DrawLine(dashPen, src, tgt);
                g.DrawLine(dashPen, tgt, new PointF(right, bottom));
                g.DrawLine(dashPen, new PointF(right, bottom), new PointF(srcX, bottom));
                DrawPreviewArrowHead(g, src, tgt);
                DrawFloatingLabel(g, $"[{GetConnectionTypeLabel(_toolMode)}]", new PointF((src.X + tgt.X) / 2f, src.Y), 6f, -22f);
                return;
            }

            var previewY = UmlSequenceLayout.SuggestNextMessageY(_project, ActiveDiagram, _pointerCanvas.Y);
            var previewSrcX = UmlSequenceLayout.GetLifelineCenterX(_pendingSourceNode.Bounds);
            var previewTgtX = _hoverNode is not null && _hoverNode != _pendingSourceNode
                ? UmlSequenceLayout.GetLifelineCenterX(_hoverNode.Bounds)
                : _pointerCanvas.X;
            src = new PointF(previewSrcX, previewY);
            tgt = new PointF(previewTgtX, previewY);
        }
        else
        {
            src = GetNodeCenter(_pendingSourceNode);
            tgt = _pointerCanvas;
        }

        using var dashPen2 = new Pen(Color.FromArgb(200, 0, 140, 90), 2f / _zoom)
        {
            DashStyle = _toolMode == UmlToolMode.CreateReturnMessage
                ? System.Drawing.Drawing2D.DashStyle.Dash
                : System.Drawing.Drawing2D.DashStyle.Dash,
        };
        g.DrawLine(dashPen2, src, tgt);
        DrawPreviewArrowHead(g, src, tgt);

        var mid = new PointF((src.X + tgt.X) / 2f, (src.Y + tgt.Y) / 2f);
        DrawFloatingLabel(g, $"[{GetConnectionTypeLabel(_toolMode)}]", mid, 6f, -22f);
        DrawFloatingLabel(g, $"시작: {GetNodeName(_pendingSourceNode)}", src, 6f, -22f);

        if (_hoverNode is not null && _hoverNode != _pendingSourceNode)
            DrawFloatingLabel(g, $"종료: {GetNodeName(_hoverNode)}", tgt, 10f, 8f);
        else
            DrawFloatingLabel(g, "종료: ?", tgt, 10f, 8f);

        var sb2 = _pendingSourceNode.Bounds;
        using var srcPen = new Pen(Color.FromArgb(200, 0, 110, 200), 2f);
        g.DrawRectangle(srcPen, sb2.X, sb2.Y, sb2.Width, sb2.Height);
    }

    private static void DrawPreviewArrowHead(Graphics g, PointF from, PointF to)
    {
        var angle = Math.Atan2(to.Y - from.Y, to.X - from.X);
        const float len = 12f;
        const float wing = 6f;
        var p1 = new PointF(
            (float)(to.X - len * Math.Cos(angle) + wing * Math.Sin(angle)),
            (float)(to.Y - len * Math.Sin(angle) - wing * Math.Cos(angle)));
        var p2 = new PointF(
            (float)(to.X - len * Math.Cos(angle) - wing * Math.Sin(angle)),
            (float)(to.Y - len * Math.Sin(angle) + wing * Math.Cos(angle)));
        using var pen = new Pen(Color.FromArgb(220, 0, 120, 70), 2.5f)
        {
            StartCap = System.Drawing.Drawing2D.LineCap.Round,
            EndCap = System.Drawing.Drawing2D.LineCap.Round,
        };
        g.DrawLine(pen, to, p1);
        g.DrawLine(pen, to, p2);
    }

    private static void DrawFloatingLabel(Graphics g, string text, PointF anchor, float dx, float dy)
    {
        using var font = new Font("Segoe UI", 8f);
        using var back = new SolidBrush(Color.FromArgb(190, 235, 250, 240));
        using var fore = new SolidBrush(Color.FromArgb(220, 0, 90, 55));
        var sz = g.MeasureString(text, font);
        var x = anchor.X + dx;
        var y = anchor.Y + dy;
        g.FillRectangle(back, x - 2f, y - 1f, sz.Width + 4f, sz.Height + 2f);
        g.DrawString(text, font, fore, x, y);
    }

    private PointF GetNodeCenter(UmlDiagramNode node) =>
        new(node.Bounds.Left + node.Bounds.Width / 2f, node.Bounds.Top + node.Bounds.Height / 2f);

    private string GetNodeName(UmlDiagramNode node)
    {
        var el = _project.FindElement(node.ModelElementId);
        return el is UmlNamedElement named ? named.Name : "?";
    }

    private static string GetDefaultSequenceMessageName(UmlToolMode mode) => mode switch
    {
        UmlToolMode.CreateAsyncMessage => "signal()",
        UmlToolMode.CreateReturnMessage => "return",
        UmlToolMode.CreateSelfMessage => "selfCall()",
        _ => "call()",
    };

    private static string GetConnectionTypeLabel(UmlToolMode mode) => mode switch
    {
        UmlToolMode.CreateGeneralization => "일반화",
        UmlToolMode.CreateRealization => "실체화",
        UmlToolMode.CreateDependency => "의존",
        UmlToolMode.CreateAssociation => "연관",
        UmlToolMode.CreateDirectedAssociation => "방향 연관",
        UmlToolMode.CreateAggregation => "집합",
        UmlToolMode.CreateComposition => "합성",
        UmlToolMode.CreateInclude => "포함",
        UmlToolMode.CreateExtend => "확장",
        UmlToolMode.CreateMessage => "동기 메시지",
        UmlToolMode.CreateAsyncMessage => "비동기 메시지",
        UmlToolMode.CreateReturnMessage => "반환 메시지",
        UmlToolMode.CreateSelfMessage => "자기 호출",
        UmlToolMode.CreateTransition => "전이",
        UmlToolMode.CreateControlFlow => "제어 흐름",
        UmlToolMode.CreateObjectFlow => "객체 흐름",
        _ => "연결",
    };

    // ── Context Menu ──────────────────────────────────────────────────────

    private void ShowContextMenu(Point screenPoint)
    {
        var cp = ScreenToCanvas(screenPoint);
        var hitNode = HitTestNode(cp);
        var hitEdge = hitNode is null ? HitTestEdge(cp) : null;

        var menu = new ContextMenuStrip();

        if (hitNode is not null)
            BuildNodeContextMenu(menu, hitNode, cp);
        else if (hitEdge is not null)
            BuildEdgeContextMenu(menu, hitEdge, cp);
        else
            BuildCanvasContextMenu(menu, cp);

        if (menu.Items.Count > 0)
            menu.Show(this, screenPoint);
    }

    private void BuildNodeContextMenu(ContextMenuStrip menu, UmlDiagramNode node, PointF cp)
    {
        var element = _project.FindElement(node.ModelElementId);

        Add("이름 편집...", UmlIcons.Edit(), () =>
        {
            Select(node, null);
            if (TryEditAt(cp)) { SelectionChanged?.Invoke(this, EventArgs.Empty); NotifyChanged(); }
        });

        if (element is UmlClassifier classifier)
        {
            Add("스테레오타입 편집...", UmlIcons.Edit(), () =>
            {
                var t = UmlTextPrompt.Show(PromptOwner, "스테레오타입", "스테레오타입", classifier.Stereotype ?? "");
                if (t is null) return;
                classifier.Stereotype = t.Trim();
                NotifyChanged();
            });

            if (classifier is UmlClass cls)
            {
                Add(cls.IsAbstract ? "구체 클래스로 변경" : "추상 클래스로 변경", UmlIcons.ToggleAbstract(), () =>
                {
                    cls.IsAbstract = !cls.IsAbstract;
                    NotifyChanged();
                });
            }

            menu.Items.Add(new ToolStripSeparator());

            if (classifier is UmlEnumeration en)
            {
                Add("리터럴 추가...", UmlIcons.AddItem(), () =>
                {
                    var t = UmlTextPrompt.Show(PromptOwner, "리터럴 추가", "이름", "LITERAL");
                    if (t is null) return;
                    en.Literals.Add(t.Trim());
                    NotifyChanged();
                });
            }
            else
            {
                Add("속성 추가...", UmlIcons.AddItem(), () =>
                {
                    var t = UmlTextPrompt.Show(PromptOwner, "속성 추가", "이름", "newProperty");
                    if (t is null) return;
                    classifier.Properties.Add(new UmlProperty { Name = t.Trim() });
                    NotifyChanged();
                });
                Add("연산 추가...", UmlIcons.AddItem(), () =>
                {
                    var t = UmlTextPrompt.Show(PromptOwner, "연산 추가", "이름", "newOperation");
                    if (t is null) return;
                    classifier.Operations.Add(new UmlOperation { Name = t.Trim() });
                    NotifyChanged();
                });
            }

            Add(node.ShowCompartments ? "구획 숨기기" : "구획 표시", UmlIcons.Compartments(), () =>
            {
                node.ShowCompartments = !node.ShowCompartments;
                NotifyChanged();
            });
        }

        menu.Items.Add(new ToolStripSeparator());
        Add("삭제", UmlIcons.Delete(), () => { Select(node, null); DeleteSelection(); });

        void Add(string label, Bitmap image, Action action)
        {
            var item = new ToolStripMenuItem(label) { Image = image };
            item.Click += (_, _) => action();
            menu.Items.Add(item);
        }
    }

    private void BuildEdgeContextMenu(ContextMenuStrip menu, UmlDiagramEdge edge, PointF cp)
    {
        var rel = _project.FindRelationship(edge.ModelElementId);

        Add("편집...", UmlIcons.Edit(), () =>
        {
            Select(null, edge);
            if (TryEditAt(cp)) { SelectionChanged?.Invoke(this, EventArgs.Empty); NotifyChanged(); }
        });

        if (rel is UmlAssociation assoc)
        {
            Add("소스 다중성 편집...", UmlIcons.Multiplicity(), () =>
            {
                var t = UmlTextPrompt.Show(PromptOwner, "다중성", "소스 다중성", assoc.SourceMultiplicity ?? "");
                if (t is null) return;
                assoc.SourceMultiplicity = t.Trim();
                NotifyChanged();
            });
            Add("대상 다중성 편집...", UmlIcons.Multiplicity(), () =>
            {
                var t = UmlTextPrompt.Show(PromptOwner, "다중성", "대상 다중성", assoc.TargetMultiplicity ?? "");
                if (t is null) return;
                assoc.TargetMultiplicity = t.Trim();
                NotifyChanged();
            });
        }

        menu.Items.Add(new ToolStripSeparator());
        Add("삭제", UmlIcons.Delete(), () => { Select(null, edge); DeleteSelection(); });

        void Add(string label, Bitmap image, Action action)
        {
            var item = new ToolStripMenuItem(label) { Image = image };
            item.Click += (_, _) => action();
            menu.Items.Add(item);
        }
    }

    private void BuildCanvasContextMenu(ContextMenuStrip menu, PointF cp)
    {
        void ActivateTool(string label, Bitmap image, UmlToolMode mode)
        {
            var item = new ToolStripMenuItem(label) { Image = image };
            item.Click += (_, _) =>
            {
                _toolMode = mode;
                ToolModeRequested?.Invoke(this, mode);
                Invalidate();
            };
            menu.Items.Add(item);
        }

        void ActivateNotation(UmlToolMode mode) =>
            ActivateTool($"{UmlToolModeHelper.GetDisplayName(mode)} 추가", UmlIcons.ForToolMode(mode), mode);

        var kind = ActiveDiagram.Kind;

        switch (kind)
        {
            case UmlDiagramKind.UseCaseDiagram:
                ActivateTool("Actor 추가", UmlIcons.NodeActor(), UmlToolMode.CreateActor);
                ActivateTool("Use Case 추가", UmlIcons.NodeUseCase(), UmlToolMode.CreateUseCase);
                menu.Items.Add(new ToolStripSeparator());
                break;

            case UmlDiagramKind.ClassDiagram:
                ActivateTool("Class 추가", UmlIcons.NodeClass(), UmlToolMode.CreateClass);
                ActivateTool("Interface 추가", UmlIcons.NodeInterface(), UmlToolMode.CreateInterface);
                ActivateTool("Enumeration 추가", UmlIcons.NodeEnumeration(), UmlToolMode.CreateEnumeration);
                ActivateTool("Package 추가", UmlIcons.NodePackage(), UmlToolMode.CreatePackage);
                menu.Items.Add(new ToolStripSeparator());
                break;

            case UmlDiagramKind.SequenceDiagram:
                ActivateNotation(UmlToolMode.CreateLifeline);
                ActivateNotation(UmlToolMode.CreateMessage);
                ActivateNotation(UmlToolMode.CreateReturnMessage);
                menu.Items.Add(new ToolStripSeparator());
                break;

            case UmlDiagramKind.StateMachineDiagram:
                ActivateNotation(UmlToolMode.CreateState);
                ActivateNotation(UmlToolMode.CreateInitialState);
                ActivateNotation(UmlToolMode.CreateFinalState);
                menu.Items.Add(new ToolStripSeparator());
                break;

            case UmlDiagramKind.ActivityDiagram:
                ActivateNotation(UmlToolMode.CreateAction);
                ActivateNotation(UmlToolMode.CreateInitialNode);
                ActivateNotation(UmlToolMode.CreateActivityFinalNode);
                ActivateNotation(UmlToolMode.CreateDecision);
                ActivateNotation(UmlToolMode.CreateMerge);
                ActivateNotation(UmlToolMode.CreateFork);
                ActivateNotation(UmlToolMode.CreateJoin);
                menu.Items.Add(new ToolStripSeparator());
                break;
        }

        ActivateTool("Note 추가", UmlIcons.NodeNote(), UmlToolMode.CreateNote);
    }

    private void NotifyChanged()
    {
        UpdateScrollBars();
        Invalidate();
        ProjectChanged?.Invoke(this, EventArgs.Empty);
    }
}
