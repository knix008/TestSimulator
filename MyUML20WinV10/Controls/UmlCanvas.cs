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
    private bool _isDraggingMessage;
    private float _messageYAtDragStart;
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
    private bool _isDraggingBend;
    private int _bendDragVertexIndex = -1;
    private bool _paintErrorPending;

    // Multi-selection state
    private readonly HashSet<UmlDiagramNode> _multiNodes = [];
    private readonly HashSet<UmlDiagramEdge> _multiEdges = [];
    private bool _isRubberBanding;
    private PointF _rubberBandStart;
    private PointF _rubberBandEnd;

    // Clipboard: stores diagram node IDs + source project for cross-diagram paste
    private static List<Guid>? _clipboardNodeIds;
    private static UmlProject? _clipboardProject;
    private static UmlDiagramKind _clipboardSourceKind;

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
            AssignProject(value);
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
        BackColor = UmlDiagramStyle.CanvasBackground;
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

    public void LoadProject(UmlProject project) => AssignProject(project);

    private void AssignProject(UmlProject project)
    {
        _project = project;
        _selectedNode = null;
        _selectedEdge = null;
        _hoverNode = null;
        _hoverEdge = null;
        _pendingSourceNode = null;
        ResetView();
    }

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

        _toolMode = mode;
        var center = ScreenToCanvas(GetViewportCenter());
        var size = GetDefaultSize(mode);
        var rect = new RectangleF(
            center.X - size.Width / 2f,
            center.Y - size.Height / 2f,
            size.Width,
            size.Height);
        CreateNode(rect);
        NotifyChanged();
        return true;
    }

    public void DuplicateSelection()
    {
        if (_selectedNode is null)
            return;

        var original = _project.FindElement(_selectedNode.ModelElementId);
        if (original is null)
            return;

        UmlElement newElement;
        switch (original)
        {
            case UmlClassifier cls:
                newElement = cls.CloneClassifier();
                newElement.Id = Guid.NewGuid();
                ((UmlClassifier)newElement).Name += " 복사";
                _project.RootPackage.AddClassifier((UmlClassifier)newElement);
                break;
            case UmlActor actor:
                newElement = new UmlActor { Name = actor.Name + " 복사", UseRectangleNotation = actor.UseRectangleNotation };
                _project.RootPackage.AddActor((UmlActor)newElement);
                break;
            case UmlUseCase uc:
                newElement = new UmlUseCase
                {
                    Name = uc.Name + " 복사",
                    ExtensionPoints = [.. uc.ExtensionPoints],
                    Requirements = uc.Requirements,
                    Constraints = uc.Constraints,
                    Scenario = uc.Scenario,
                };
                _project.RootPackage.AddUseCase((UmlUseCase)newElement);
                break;
            case UmlSystemBoundary boundary:
                newElement = new UmlSystemBoundary { Name = boundary.Name + " 복사" };
                _project.RootPackage.AddSystemBoundary((UmlSystemBoundary)newElement);
                break;
            case UmlNote note:
                newElement = new UmlNote { Name = note.Name, Body = note.Body };
                _project.RootPackage.AddNote((UmlNote)newElement);
                break;
            case UmlPackage pkg:
                newElement = new UmlPackage { Name = pkg.Name + " 복사", Stereotype = pkg.Stereotype };
                _project.RootPackage.AddNestedPackage((UmlPackage)newElement);
                break;
            case UmlBehaviorNode beh:
                newElement = new UmlBehaviorNode
                {
                    Name = beh.Name + " 복사",
                    Kind = beh.Kind,
                    CombinedFragmentKind = beh.CombinedFragmentKind,
                    Guard = beh.Guard,
                    ReferencedDiagramName = beh.ReferencedDiagramName,
                    ExpansionKind = beh.ExpansionKind,
                    LifelineKind = beh.LifelineKind,
                    LocalPrecondition = beh.LocalPrecondition,
                    LocalPostcondition = beh.LocalPostcondition,
                };
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)newElement);
                break;
            case UmlComponentPort port:
                newElement = new UmlComponentPort
                {
                    Name = port.Name + " 복사",
                    InterfaceKind = port.InterfaceKind,
                    InterfaceName = port.InterfaceName,
                };
                _project.RootPackage.AddComponentPort((UmlComponentPort)newElement);
                break;
            case UmlComponent component:
                newElement = new UmlComponent { Name = component.Name + " 복사" };
                _project.RootPackage.AddComponent((UmlComponent)newElement);
                break;
            case UmlComponentInterface iface:
                newElement = new UmlComponentInterface
                {
                    Name = iface.Name + " 복사",
                    InterfaceKind = iface.InterfaceKind,
                };
                _project.RootPackage.AddComponentInterface((UmlComponentInterface)newElement);
                break;
            case UmlObjectInstance objectInstance:
                newElement = new UmlObjectInstance
                {
                    Name = objectInstance.Name + " 복사",
                    TypeName = objectInstance.TypeName,
                };
                _project.RootPackage.AddObjectInstance((UmlObjectInstance)newElement);
                break;
            case UmlDeploymentHost deploymentHost:
                newElement = new UmlDeploymentHost { Name = deploymentHost.Name + " 복사" };
                _project.RootPackage.AddDeploymentHost((UmlDeploymentHost)newElement);
                break;
            case UmlArtifact artifact:
                newElement = new UmlArtifact { Name = artifact.Name + " 복사", IsInstance = artifact.IsInstance };
                _project.RootPackage.AddArtifact((UmlArtifact)newElement);
                break;
            default:
                return;
        }

        const float Offset = 24f;
        var newNode = new UmlDiagramNode
        {
            ModelElementId = newElement.Id,
            Presentation = _selectedNode.Presentation,
            X = _selectedNode.X + Offset,
            Y = _selectedNode.Y + Offset,
            Width = _selectedNode.Width,
            Height = _selectedNode.Height,
            ShowCompartments = _selectedNode.ShowCompartments,
        };
        if (UmlNodeSilhouette.IsContainerPresentation(newNode.Presentation))
            ActiveDiagram.Nodes.Insert(0, newNode);
        else
            ActiveDiagram.Nodes.Add(newNode);
        Select(newNode, null);
        NotifyChanged();
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    private void DuplicateSelectionAt(float x, float y)
    {
        DuplicateSelection();
        if (_selectedNode is not null)
        {
            _selectedNode.X = x;
            _selectedNode.Y = y;
        }
    }

    public void RefreshLayout()
    {
        UpdateScrollBars();
        Invalidate();
    }

    public void ApplyTheme()
    {
        BackColor = UmlDiagramStyle.CanvasBackground;
        Invalidate();
    }

    public void DeleteSelection()
    {
        if (HasMultiSelection)
        {
            foreach (var node in _multiNodes.ToList())
            {
                var modelId = node.ModelElementId;
                ActiveDiagram.Nodes.Remove(node);
                ActiveDiagram.Edges.RemoveAll(e => e.SourceNodeId == node.Id || e.TargetNodeId == node.Id);
                _project.RemoveElement(modelId);
            }
            _multiNodes.Clear();
            _multiEdges.Clear();
            NotifyChanged();
            return;
        }

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

    public void CopySelectionToClipboard()
    {
        var nodesToCopy = HasMultiSelection
            ? _multiNodes.ToList()
            : _selectedNode is not null ? [_selectedNode] : [];

        if (nodesToCopy.Count == 0) return;
        _clipboardNodeIds = nodesToCopy.Select(n => n.Id).ToList();
        _clipboardProject = _project;
        _clipboardSourceKind = ActiveDiagram.Kind;
    }

    public void PasteFromClipboard()
    {
        if (_clipboardNodeIds is null || _clipboardNodeIds.Count == 0) return;
        if (_clipboardSourceKind != ActiveDiagram.Kind) return;

        // Find source diagram to locate nodes
        UmlDiagram? sourceDiagram = null;
        foreach (var diagram in _clipboardProject!.Diagrams)
        {
            if (diagram.Nodes.Any(n => _clipboardNodeIds.Contains(n.Id)))
            {
                sourceDiagram = diagram;
                break;
            }
        }
        if (sourceDiagram is null) return;

        const float Offset = 24f;
        var pastedNodes = new List<UmlDiagramNode>();
        var idMap = new Dictionary<Guid, Guid>();

        foreach (var nodeId in _clipboardNodeIds)
        {
            var srcNode = sourceDiagram.Nodes.Find(n => n.Id == nodeId);
            if (srcNode is null) continue;
            var prevSelected = _selectedNode;
            Select(srcNode, null);
            DuplicateSelectionAt(srcNode.X + Offset, srcNode.Y + Offset);
            // The new node is now _selectedNode
            if (_selectedNode is not null && _selectedNode.Id != srcNode.Id)
            {
                idMap[nodeId] = _selectedNode.Id;
                pastedNodes.Add(_selectedNode);
            }
            Select(prevSelected, null);
        }

        // Multi-select the pasted nodes
        _multiNodes.Clear();
        foreach (var n in pastedNodes)
            _multiNodes.Add(n);
        _selectedNode = null;
        _selectedEdge = null;

        NotifyChanged();
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        Invalidate();
    }

    public bool CanPaste => _clipboardNodeIds is { Count: > 0 } && _clipboardSourceKind == ActiveDiagram.Kind;

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

        try
        {
            DrawGrid(e.Graphics);
            UmlDiagramRenderer.DrawDiagram(e.Graphics, _project, ActiveDiagram, _selectedNode, _selectedEdge, _hoverNode, _hoverEdge);

            if (HasMultiSelection)
                DrawMultiSelectionOverlay(e.Graphics);

            if (_isRubberBanding)
                DrawRubberBand(e.Graphics);

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
        catch (Exception ex)
        {
            DrawPaintErrorBanner(e.Graphics, ex.Message);
            if (!_paintErrorPending)
            {
                _paintErrorPending = true;
                BeginInvoke(() =>
                {
                    _paintErrorPending = false;
                    UmlErrorDialog.Show(FindForm()!, "다이어그램 렌더링 오류", ex);
                });
            }
        }
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        Focus();
        try
        {
        if (e.Button == MouseButtons.Right)
        {
            var rpt = ScreenToCanvas(e.Location);
            HitTestDiagram(rpt, out var rn, out var re);
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

        HitTestDiagram(canvasPoint, out var hitNode, out var hitEdge);

        var isCtrl = (ModifierKeys & Keys.Control) != 0;
        var isShift = (ModifierKeys & Keys.Shift) != 0;

        switch (_toolMode)
        {
            case UmlToolMode.Select:
                // Ctrl+Click or Shift+Click → toggle/add multi-selection
                if ((isCtrl || isShift) && hitNode is not null)
                {
                    if (isCtrl)
                        ToggleMultiSelection(hitNode);
                    else
                        AddToMultiSelection(hitNode);
                    Capture = true;
                    break;
                }

                // Clicking on a multi-selected node → start moving group
                if (hitNode is not null && HasMultiSelection && _multiNodes.Contains(hitNode))
                {
                    _dragNode = hitNode;
                    _isDragging = true;
                    _modelChangedDuringDrag = false;
                    Capture = true;
                    break;
                }

                if (_selectedNode is not null && ReferenceEquals(hitNode, _selectedNode))
                {
                    var hi = HitTestResizeHandle(canvasPoint);
                    if (hi >= 0)
                    {
                        _isResizing = true;
                        _resizeHandleIndex = hi;
                        SyncCircleNodeBounds(_selectedNode);
                        SyncActorNodeBounds(_selectedNode);
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
                else if (_selectedEdge is not null && TryBeginBendDrag(canvasPoint))
                {
                    _isDraggingBend = true;
                    _modelChangedDuringDrag = false;
                    Capture = true;
                }
                else if (_selectedEdge is not null && TryBeginSequenceMessageDrag())
                {
                    Capture = true;
                }
                else if (hitNode is null && hitEdge is null)
                {
                    // Start rubber-band selection on empty canvas
                    _isRubberBanding = true;
                    _rubberBandStart = canvasPoint;
                    _rubberBandEnd = canvasPoint;
                    Capture = true;
                }
                else
                {
                    StartPan(e.Location);
                }
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
            case UmlToolMode.CreateNoteLink:
            case UmlToolMode.CreateMessage:
            case UmlToolMode.CreateAsyncMessage:
            case UmlToolMode.CreateReturnMessage:
            case UmlToolMode.CreateCreateMessage:
            case UmlToolMode.CreateDestroyMessage:
            case UmlToolMode.CreateTransition:
            case UmlToolMode.CreateControlFlow:
            case UmlToolMode.CreateObjectFlow:
            case UmlToolMode.CreateAssembly:
            case UmlToolMode.CreatePackageMerge:
            case UmlToolMode.CreatePackageImport:
            case UmlToolMode.CreatePackageNesting:
            case UmlToolMode.CreateAssociationClass:
            case UmlToolMode.CreateClassNesting:
            case UmlToolMode.CreateDeployment:
            case UmlToolMode.CreateDeploymentPath:
            case UmlToolMode.CreateTrace:
            case UmlToolMode.CreateApplyDependency:
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

                    if (ActiveDiagram.Kind == UmlDiagramKind.CommunicationDiagram
                        && UmlToolModeHelper.IsSequenceMessageTool(_toolMode)
                        && hitNode.Presentation != UmlNodePresentation.ObjectInstance)
                        break;

                    if (_toolMode == UmlToolMode.CreateDeployment
                        && hitNode.Presentation != UmlNodePresentation.Artifact)
                        break;

                    if (_toolMode == UmlToolMode.CreateDeploymentPath
                        && hitNode.Presentation != UmlNodePresentation.DeploymentHost)
                        break;

                    _pendingSourceNode = hitNode;
                    _relationshipAnchorY = canvasPoint.Y;
                    // Clear selection so the source node shows only the preview chrome
                    // (blue outline), not the full "selected" appearance with resize handles.
                    Select(null, null);
                }
                else
                {
                    if (ActiveDiagram.Kind == UmlDiagramKind.SequenceDiagram
                        && UmlToolModeHelper.IsSequenceMessageTool(_toolMode))
                    {
                        if (!UmlSequenceLayout.IsLifeline(_project, hitNode))
                            break;

                        CreateRelationship(_pendingSourceNode, hitNode, canvasPoint.Y);
                        _pendingSourceNode = null;
                        break;
                    }

                    if (ActiveDiagram.Kind == UmlDiagramKind.CommunicationDiagram
                        && UmlToolModeHelper.IsSequenceMessageTool(_toolMode))
                    {
                        if (hitNode.Presentation != UmlNodePresentation.ObjectInstance)
                            break;

                        CreateRelationship(_pendingSourceNode, hitNode, canvasPoint.Y);
                        _pendingSourceNode = null;
                        break;
                    }

                    if (_toolMode == UmlToolMode.CreateDeployment
                        && hitNode.Presentation != UmlNodePresentation.DeploymentHost)
                        break;

                    CreateRelationship(_pendingSourceNode, hitNode, canvasPoint.Y);
                    _pendingSourceNode = null;
                }
                break;

            default:
                if (UmlToolModeHelper.IsNodeCreateTool(_toolMode))
                    BeginNodeCreateInteraction(hitNode);
                break;
        }
        }
        catch (Exception ex)
        {
            CancelInteraction();
            UmlErrorDialog.Show(FindForm()!, "캔버스 오류", ex);
        }
    }

    private void BeginNodeCreateInteraction(UmlDiagramNode? hitNode)
    {
        if (hitNode is not null)
        {
            ReturnToSelectTool();
            Select(hitNode, null);
            _dragNode = hitNode;
            _isDragging = true;
            _modelChangedDuringDrag = false;
            Capture = true;
            return;
        }

        _isCreating = true;
        Capture = true;
        Invalidate();
    }

    private void ReturnToSelectTool()
    {
        if (_toolMode == UmlToolMode.Select)
            return;

        _toolMode = UmlToolMode.Select;
        _pendingSourceNode = null;
        UpdateCursor();
        SelectToolRequested?.Invoke(this, EventArgs.Empty);
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        try
        {
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

        if (_isDraggingMessage && _selectedEdge is not null)
        {
            ApplySequenceMessageDrag(canvasPoint);
            return;
        }

        if (_isDraggingBend && _selectedEdge is not null)
        {
            ApplyBendDrag(canvasPoint);
            return;
        }

        if (_isRubberBanding)
        {
            _rubberBandEnd = canvasPoint;
            Invalidate();
            return;
        }

        if (_isDragging && _dragNode is not null)
        {
            var dx = canvasPoint.X - _dragStartCanvas.X;
            var dy = canvasPoint.Y - _dragStartCanvas.Y;
            if (Math.Abs(dx) > 0.01f || Math.Abs(dy) > 0.01f)
            {
                if (HasMultiSelection)
                {
                    // Move all multi-selected nodes together
                    foreach (var n in _multiNodes)
                    {
                        n.X += dx;
                        n.Y += dy;
                    }
                }
                else
                {
                    _dragNode.X += dx;
                    _dragNode.Y += dy;
                }
                _dragStartCanvas = canvasPoint;
                RefreshDiagramEdgeRouting();
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
        catch (Exception ex)
        {
            UmlErrorDialog.Show(FindForm()!, "캔버스 오류", ex);
        }
    }

    private bool ShouldRepaintPointerPreview() =>
        _pointerOnCanvas && !_isPanning && !_isDragging && !_isDraggingBend && !_isDraggingMessage && !_isCreating && !_isResizing &&
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
        try
        {
            CancelInteraction();

            var canvasPoint = ScreenToCanvas(e.Location);
            if (!TryEditAt(canvasPoint))
                return;

            SelectionChanged?.Invoke(this, EventArgs.Empty);
            NotifyChanged();
        }
        catch (Exception ex)
        {
            UmlErrorDialog.Show(FindForm()!, "캔버스 오류", ex);
        }
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        try
        {
        if (e.Button == MouseButtons.Right && !_isPanning && !_isDragging && !_isDraggingBend && !_isDraggingMessage && !_isCreating && !_isResizing && !_isRubberBanding)
        {
            ShowContextMenu(e.Location);
            return;
        }

        if (_isRubberBanding)
        {
            FinishRubberBand();
            Capture = false;
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
            if (UmlCircleNodeGeometry.IsCircleCreateTool(_toolMode) || UmlCircleNodeGeometry.IsDiamondCreateTool(_toolMode))
                rect = UmlCircleNodeGeometry.SquareFromDrag(rect);
            if (_toolMode == UmlToolMode.CreateActor)
                rect = UmlActorGeometry.UniformFromDrag(rect);
            CreateNode(rect);
            _isCreating = false;
            Capture = false;
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

        if (_isDraggingMessage)
        {
            _isDraggingMessage = false;
            Capture = false;
            if (_modelChangedDuringDrag)
                NotifyChanged();
            return;
        }

        if (_isDraggingBend)
        {
            _isDraggingBend = false;
            _bendDragVertexIndex = -1;
            Capture = false;
            if (_modelChangedDuringDrag)
                NotifyChanged();
            return;
        }

        if (_isDragging)
        {
            var movedNode = _dragNode;
            _isDragging = false;
            _dragNode = null;
            Capture = false;
            if (_modelChangedDuringDrag && movedNode is not null)
            {
                RefreshDiagramEdgeRouting();
                NotifyChanged();
            }
            else if (_modelChangedDuringDrag)
                NotifyChanged();

            return;
        }

        Capture = false;
        }
        catch (Exception ex)
        {
            CancelInteraction();
            UmlErrorDialog.Show(FindForm()!, "캔버스 오류", ex);
        }
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

        if (e.Control && e.KeyCode == Keys.C)
            CopySelectionToClipboard();

        if (e.Control && e.KeyCode == Keys.V)
            PasteFromClipboard();

        if (e.Control && e.KeyCode == Keys.A)
            SelectAll();

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

    private void DrawPaintErrorBanner(Graphics g, string message)
    {
        g.ResetTransform();
        using var bgBrush = new SolidBrush(Color.FromArgb(230, 255, 235, 235));
        using var borderPen = new Pen(Color.FromArgb(200, 180, 0, 0), 1.5f);
        using var textBrush = new SolidBrush(Color.FromArgb(210, 150, 0, 0));
        using var font = new Font("Segoe UI", 9f);
        var rect = new RectangleF(8, 8, ClientSize.Width - 16, 44);
        g.FillRectangle(bgBrush, rect.X, rect.Y, rect.Width, rect.Height);
        g.DrawRectangle(borderPen, rect.X, rect.Y, rect.Width, rect.Height);
        g.DrawString($"⚠ 렌더링 오류: {message}", font, textBrush, rect.X + 8, rect.Y + 6);
        g.DrawString("자세한 내용은 오류 창을 확인하세요.", font, textBrush, rect.X + 8, rect.Y + 26);
    }

    private void SelectAll()
    {
        _selectedNode = null;
        _selectedEdge = null;
        _multiNodes.Clear();
        _multiEdges.Clear();
        foreach (var n in ActiveDiagram.Nodes)
            _multiNodes.Add(n);
        Invalidate();
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    private void SaveSelectionAsImage()
    {
        var nodesToExport = HasMultiSelection ? _multiNodes.ToList()
            : _selectedNode is not null ? [_selectedNode] : [];
        if (nodesToExport.Count == 0) return;

        var bounds = nodesToExport.Select(n => n.Bounds)
            .Aggregate((a, b) => RectangleF.Union(a, b));
        bounds.Inflate(20f, 20f);

        using var sfd = new SaveFileDialog
        {
            Title = "선택 영역을 이미지로 저장",
            Filter = "PNG 이미지|*.png|JPEG 이미지|*.jpg;*.jpeg|BMP 이미지|*.bmp",
            DefaultExt = "png",
            FileName = "selection",
        };
        if (sfd.ShowDialog(FindForm()) != DialogResult.OK) return;

        var scale = 2f;
        var bmpW = (int)Math.Max(1, bounds.Width * scale);
        var bmpH = (int)Math.Max(1, bounds.Height * scale);
        using var bmp = new Bitmap(bmpW, bmpH, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        g.Clear(Color.White);
        g.TranslateTransform(-bounds.X * scale, -bounds.Y * scale);
        g.ScaleTransform(scale, scale);
        UmlDiagramRenderer.DrawDiagram(g, _project, ActiveDiagram, null, null, null, null);

        var ext = Path.GetExtension(sfd.FileName).ToLowerInvariant();
        var format = ext switch
        {
            ".jpg" or ".jpeg" => System.Drawing.Imaging.ImageFormat.Jpeg,
            ".bmp" => System.Drawing.Imaging.ImageFormat.Bmp,
            _ => System.Drawing.Imaging.ImageFormat.Png,
        };
        bmp.Save(sfd.FileName, format);
    }

    private void CancelInteraction()
    {
        _isCreating = false;
        _isDragging = false;
        _isDraggingBend = false;
        _bendDragVertexIndex = -1;
        _isDraggingMessage = false;
        _isPanning = false;
        _isResizing = false;
        _resizeHandleIndex = -1;
        _isRubberBanding = false;
        _dragNode = null;
        _modelChangedDuringDrag = false;
        Capture = false;
        Invalidate();
    }

    private void UpdateHover(PointF canvasPoint)
    {
        HitTestDiagram(canvasPoint, out var hoverNode, out var hoverEdge);
        var hoverChanged = _hoverNode != hoverNode || _hoverEdge != hoverEdge;
        _hoverNode = hoverNode;
        _hoverEdge = hoverEdge;

        if (_toolMode == UmlToolMode.Select)
            UpdateCursor();

        if (hoverChanged)
            Invalidate();
    }

    private bool TryEditAt(PointF canvasPoint)
    {
        HitTestDiagram(canvasPoint, out var hitNode, out var hitEdge);
        hitNode ??= _selectedNode;
        hitEdge ??= _selectedEdge;

        if (hitEdge is not null)
        {
            Select(null, hitEdge);
            var relationship = _project.FindRelationship(hitEdge.ModelElementId);
            return relationship is not null && TryEditRelationship(relationship);
        }

        if (hitNode is not null)
        {
            Select(hitNode, null);
            var element = _project.FindElement(hitNode.ModelElementId);
            return element is not null && TryEditElement(element);
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

    private void DrawRubberBand(Graphics g)
    {
        var rect = NormalizeRect(_rubberBandStart, _rubberBandEnd);
        using var fillBrush = new SolidBrush(Color.FromArgb(40, 79, 130, 230));
        using var borderPen = new Pen(Color.FromArgb(160, 79, 130, 230), 1f / _zoom)
        {
            DashStyle = System.Drawing.Drawing2D.DashStyle.Dash,
        };
        g.FillRectangle(fillBrush, rect);
        g.DrawRectangle(borderPen, rect.X, rect.Y, rect.Width, rect.Height);
    }

    private void DrawMultiSelectionOverlay(Graphics g)
    {
        using var handleBrush = new SolidBrush(Color.FromArgb(30, 136, 229));
        using var borderPen = new Pen(Color.FromArgb(30, 136, 229), 1.5f / _zoom)
        {
            DashStyle = System.Drawing.Drawing2D.DashStyle.Dot,
        };
        foreach (var node in _multiNodes)
        {
            var r = node.Bounds;
            g.DrawRectangle(borderPen, r.X, r.Y, r.Width, r.Height);
            const float hSz = 6f;
            var hw = hSz / _zoom;
            var hw2 = hw / 2f;
            PointF[] corners = [
                new(r.Left,            r.Top),
                new(r.Right,           r.Top),
                new(r.Left,            r.Bottom),
                new(r.Right,           r.Bottom),
                new(r.Left + r.Width / 2f, r.Top),
                new(r.Left + r.Width / 2f, r.Bottom),
                new(r.Left,            r.Top + r.Height / 2f),
                new(r.Right,           r.Top + r.Height / 2f),
            ];
            foreach (var pt in corners)
                g.FillRectangle(handleBrush, pt.X - hw2, pt.Y - hw2, hw, hw);
        }
    }

    private void DrawCreatePreview(Graphics g)
    {
        var rect = EnsureDrawableRect(NormalizeRect(_dragStartCanvas, _createPreviewEnd));
        if (UmlToolModeHelper.IsLifelineCreateTool(_toolMode))
            rect = NormalizeLifelineCreateRect(rect);
        else if (UmlCircleNodeGeometry.IsCircleCreateTool(_toolMode))
            rect = NormalizeCircleCreateRect(rect);
        DrawPlacementPreview(g, rect);
    }

    private void DrawToolPlacementPreview(Graphics g)
    {
        var size = GetDefaultSize(_toolMode);
        // Scale down oversized shapes for the hover ghost so they don't obscure the canvas.
        const float MaxGhostW = 180f;
        const float MaxGhostH = 140f;
        var scale = Math.Min(1f, Math.Min(MaxGhostW / size.Width, MaxGhostH / size.Height));
        var ghostW = size.Width * scale;
        var ghostH = size.Height * scale;
        var rect = new RectangleF(
            _pointerCanvas.X - ghostW / 2f,
            _pointerCanvas.Y - ghostH / 2f,
            ghostW,
            ghostH);
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
        if (UmlCircleNodeGeometry.IsCircleCreateTool(_toolMode))
            rect = UmlCircleNodeGeometry.SquareFromDrag(rect);
        if (_toolMode == UmlToolMode.CreateActor)
            rect = UmlActorGeometry.UniformFromDrag(rect);

        UmlNotationPreview.DrawGhost(g, _toolMode, rect);
    }

    private RectangleF EnsureDrawableRect(RectangleF rect)
    {
        if (UmlToolModeHelper.IsLifelineCreateTool(_toolMode))
            return NormalizeLifelineCreateRect(rect);

        if (UmlCircleNodeGeometry.IsCircleCreateTool(_toolMode))
            return NormalizeCircleCreateRect(rect);

        const float minScreen = 6f;
        var screenW = Math.Abs(rect.Width) * _zoom;
        var screenH = Math.Abs(rect.Height) * _zoom;

        if (screenW >= minScreen && screenH >= minScreen)
            return rect;

        var defaults = GetDefaultSize(_toolMode);
        return new RectangleF(rect.X, rect.Y, defaults.Width, defaults.Height);
    }

    private RectangleF NormalizeCircleCreateRect(RectangleF rect) =>
        UmlCircleNodeGeometry.NormalizeCreateRect(rect, GetDefaultSize(_toolMode), _zoom);

    private RectangleF NormalizeLifelineCreateRect(RectangleF rect)
    {
        var defaults = GetDefaultSize(_toolMode);
        const float minWidth = 60f;
        const float minScreen = 6f;

        var width = Math.Abs(rect.Width);
        if (width * _zoom < minScreen)
            width = defaults.Width;
        else
            width = Math.Max(minWidth, width);

        return new RectangleF(rect.X, rect.Y, width, defaults.Height);
    }

    private static SizeF GetDefaultSize(UmlToolMode mode) => mode switch
    {
        UmlToolMode.CreateActor => new SizeF(72, UmlActorGeometry.GetMinimumNodeHeight(72, "Actor")),
        UmlToolMode.CreateUseCase => new SizeF(140, 72),
        UmlToolMode.CreateSystemBoundary => new SizeF(400, 280),
        UmlToolMode.CreateNote => new SizeF(120, 72),
        UmlToolMode.CreatePackage => new SizeF(200, 140),
        UmlToolMode.CreateState => new SizeF(140, 72),
        UmlToolMode.CreateInitialState => new SizeF(32, 32),
        UmlToolMode.CreateFinalState => new SizeF(32, 32),
        UmlToolMode.CreateAction => new SizeF(140, 60),
        UmlToolMode.CreateInitialNode => new SizeF(32, 32),
        UmlToolMode.CreateActivityFinalNode => new SizeF(32, 32),
        UmlToolMode.CreateFlowFinalNode => new SizeF(32, 32),
        UmlToolMode.CreateDecision => new SizeF(72, 72),
        UmlToolMode.CreateMerge => new SizeF(72, 72),
        UmlToolMode.CreateChoice => new SizeF(72, 72),
        UmlToolMode.CreateJunction => new SizeF(32, 32),
        UmlToolMode.CreateShallowHistory => new SizeF(36, 36),
        UmlToolMode.CreateDeepHistory => new SizeF(36, 36),
        UmlToolMode.CreateFork => new SizeF(160, 20),
        UmlToolMode.CreateJoin => new SizeF(160, 20),
        UmlToolMode.CreateLifeline => new SizeF(120, 240),
        UmlToolMode.CreateLoopFragment => new SizeF(280, 160),
        UmlToolMode.CreateAltFragment => new SizeF(280, 160),
        UmlToolMode.CreateOptFragment => new SizeF(280, 160),
        UmlToolMode.CreateParFragment => new SizeF(280, 160),
        UmlToolMode.CreateBreakFragment => new SizeF(280, 160),
        UmlToolMode.CreateRefFragment => new SizeF(280, 160),
        UmlToolMode.CreateInteractionOccurrence => new SizeF(280, 160),
        UmlToolMode.CreateDecomposedLifeline => new SizeF(100, 240),
        UmlToolMode.CreateActivation => new SizeF(24, 60),
        UmlToolMode.CreatePort => new SizeF(20, 20),
        UmlToolMode.CreateSwimlane => new SizeF(200, 360),
        UmlToolMode.CreateObjectNode => new SizeF(100, 48),
        UmlToolMode.CreateComponent => new SizeF(180, 100),
        UmlToolMode.CreateProvidedInterface => new SizeF(88, UmlComponentNotation.MinInterfaceHeight),
        UmlToolMode.CreateRequiredInterface => new SizeF(88, UmlComponentNotation.MinInterfaceHeight),
        UmlToolMode.CreateInterface => new SizeF(160, 100),
        UmlToolMode.CreateEnumeration => new SizeF(140, 90),
        UmlToolMode.CreateObjectInstance => new SizeF(120, 48),
        UmlToolMode.CreateDeploymentHost => new SizeF(140, 80),
        UmlToolMode.CreateArtifact => new SizeF(120, 72),
        UmlToolMode.CreateSequenceEndpoint => new SizeF(28, 28),
        UmlToolMode.CreateGate => new SizeF(36, 36),
        UmlToolMode.CreateExpansionRegion => new SizeF(240, 160),
        UmlToolMode.CreateInterruptibleRegion => new SizeF(240, 160),
        UmlToolMode.CreateNaryAssociationHub => new SizeF(48, 48),
        UmlToolMode.CreateTable => new SizeF(160, 120),
        UmlToolMode.CreateSeqFragment or UmlToolMode.CreateStrictFragment or UmlToolMode.CreateNegFragment
            or UmlToolMode.CreateCriticalFragment or UmlToolMode.CreateIgnoreFragment or UmlToolMode.CreateConsiderFragment
            or UmlToolMode.CreateAssertFragment => new SizeF(280, 160),
        UmlToolMode.CreateStateInvariant or UmlToolMode.CreateContinuation => new SizeF(100, 28),
        UmlToolMode.CreateCompositeState or UmlToolMode.CreateOrthogonalRegion or UmlToolMode.CreateSubmachineState
            or UmlToolMode.CreateActivityContainer => new SizeF(180, 120),
        UmlToolMode.CreateEntryPoint or UmlToolMode.CreateExitPoint or UmlToolMode.CreateTerminateState => new SizeF(24, 24),
        UmlToolMode.CreateDataStore => new SizeF(120, 56),
        UmlToolMode.CreateInputPin or UmlToolMode.CreateOutputPin => new SizeF(14, 14),
        UmlToolMode.CreateExceptionHandler => new SizeF(80, 40),
        UmlToolMode.CreateProfilePackage => new SizeF(200, 140),
        UmlToolMode.CreateMetaclass => new SizeF(160, 100),
        UmlToolMode.CreateTimingLifeline => new SizeF(400, 100),
        UmlToolMode.CreateTimingState => new SizeF(120, 32),
        UmlToolMode.CreateInteractionUse => new SizeF(140, 60),
        _ => new SizeF(160, 120),
    };

    private Guid? ResolveSelectedParentLifelineId()
    {
        if (_selectedNode is null)
            return null;

        if (_project.FindElement(_selectedNode.ModelElementId) is UmlBehaviorNode { Kind: UmlBehaviorNodeKind.Lifeline } lifeline)
            return lifeline.Id;

        return null;
    }

    private void CreateNode(RectangleF rect)
    {
        UmlElement element;
        UmlNodePresentation presentation;

        switch (_toolMode)
        {
            case UmlToolMode.CreateClass:
                element = new UmlClass();
                presentation = UmlNodePresentation.Classifier;
                _project.RootPackage.AddClassifier((UmlClass)element);
                break;
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
            case UmlToolMode.CreateSystemBoundary:
                element = new UmlSystemBoundary();
                presentation = UmlNodePresentation.SystemBoundary;
                _project.RootPackage.AddSystemBoundary((UmlSystemBoundary)element);
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
            case UmlToolMode.CreateFlowFinalNode:
                element = new UmlBehaviorNode { Name = "FlowFinal", Kind = UmlBehaviorNodeKind.FlowFinalNode };
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
            case UmlToolMode.CreateChoice:
                element = new UmlBehaviorNode { Name = "Choice", Kind = UmlBehaviorNodeKind.Choice };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateJunction:
                element = new UmlBehaviorNode { Name = "Junction", Kind = UmlBehaviorNodeKind.Junction };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateShallowHistory:
                element = new UmlBehaviorNode { Name = "H", Kind = UmlBehaviorNodeKind.ShallowHistory };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateDeepHistory:
                element = new UmlBehaviorNode { Name = "H*", Kind = UmlBehaviorNodeKind.DeepHistory };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateLifeline:
                element = new UmlBehaviorNode { Name = "Lifeline", Kind = UmlBehaviorNodeKind.Lifeline };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateDecomposedLifeline:
            {
                var parentId = ResolveSelectedParentLifelineId();
                element = new UmlBehaviorNode
                {
                    Name = "part",
                    Kind = UmlBehaviorNodeKind.Lifeline,
                    ParentLifelineId = parentId,
                    DecompositionRole = ":part",
                };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            }
            case UmlToolMode.CreateAltFragment:
                element = new UmlBehaviorNode { Name = "alt", Kind = UmlBehaviorNodeKind.CombinedFragment, CombinedFragmentKind = UmlCombinedFragmentKind.Alt, Guard = string.Empty };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateOptFragment:
                element = new UmlBehaviorNode { Name = "opt", Kind = UmlBehaviorNodeKind.CombinedFragment, CombinedFragmentKind = UmlCombinedFragmentKind.Opt, Guard = string.Empty };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateParFragment:
                element = new UmlBehaviorNode { Name = "par", Kind = UmlBehaviorNodeKind.CombinedFragment, CombinedFragmentKind = UmlCombinedFragmentKind.Par, Guard = string.Empty };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateLoopFragment:
                element = new UmlBehaviorNode
                {
                    Name = "loop",
                    Kind = UmlBehaviorNodeKind.CombinedFragment,
                    CombinedFragmentKind = UmlCombinedFragmentKind.Loop,
                    Guard = string.Empty,
                };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateBreakFragment:
                element = new UmlBehaviorNode
                {
                    Name = "break",
                    Kind = UmlBehaviorNodeKind.CombinedFragment,
                    CombinedFragmentKind = UmlCombinedFragmentKind.Break,
                    Guard = string.Empty,
                };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateRefFragment:
                element = new UmlBehaviorNode
                {
                    Name = "ref",
                    Kind = UmlBehaviorNodeKind.CombinedFragment,
                    CombinedFragmentKind = UmlCombinedFragmentKind.Ref,
                    ReferencedDiagramName = "Diagram",
                };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateInteractionOccurrence:
                element = new UmlBehaviorNode
                {
                    Name = "sd",
                    Kind = UmlBehaviorNodeKind.CombinedFragment,
                    CombinedFragmentKind = UmlCombinedFragmentKind.InteractionOccurrence,
                    ReferencedDiagramName = "Sequence Diagram",
                };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateActivation:
                element = new UmlBehaviorNode { Name = "Activation", Kind = UmlBehaviorNodeKind.Activation };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateSwimlane:
                element = new UmlBehaviorNode { Name = "Swimlane", Kind = UmlBehaviorNodeKind.Swimlane };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateObjectNode:
                element = new UmlBehaviorNode { Name = "Object", Kind = UmlBehaviorNodeKind.ObjectNode };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreatePort:
                element = new UmlComponentPort();
                presentation = UmlNodePresentation.Port;
                _project.RootPackage.AddComponentPort((UmlComponentPort)element);
                break;
            case UmlToolMode.CreateComponent:
                element = new UmlComponent();
                presentation = UmlNodePresentation.Component;
                _project.RootPackage.AddComponent((UmlComponent)element);
                break;
            case UmlToolMode.CreateProvidedInterface:
                element = new UmlComponentInterface
                {
                    Name = "IProvided",
                    InterfaceKind = UmlComponentInterfaceKind.Provided,
                };
                presentation = UmlNodePresentation.ProvidedInterface;
                _project.RootPackage.AddComponentInterface((UmlComponentInterface)element);
                break;
            case UmlToolMode.CreateRequiredInterface:
                element = new UmlComponentInterface
                {
                    Name = "IRequired",
                    InterfaceKind = UmlComponentInterfaceKind.Required,
                };
                presentation = UmlNodePresentation.RequiredInterface;
                _project.RootPackage.AddComponentInterface((UmlComponentInterface)element);
                break;
            case UmlToolMode.CreateObjectInstance:
                element = new UmlObjectInstance();
                presentation = UmlNodePresentation.ObjectInstance;
                _project.RootPackage.AddObjectInstance((UmlObjectInstance)element);
                break;
            case UmlToolMode.CreateDeploymentHost:
                element = new UmlDeploymentHost();
                presentation = UmlNodePresentation.DeploymentHost;
                _project.RootPackage.AddDeploymentHost((UmlDeploymentHost)element);
                break;
            case UmlToolMode.CreateArtifact:
                element = new UmlArtifact();
                presentation = UmlNodePresentation.Artifact;
                _project.RootPackage.AddArtifact((UmlArtifact)element);
                break;
            case UmlToolMode.CreateSequenceEndpoint:
                element = new UmlBehaviorNode { Name = "endpoint", Kind = UmlBehaviorNodeKind.SequenceEndpoint };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateGate:
                element = new UmlBehaviorNode { Name = "gate", Kind = UmlBehaviorNodeKind.Gate };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateExpansionRegion:
                element = new UmlBehaviorNode
                {
                    Name = "region",
                    Kind = UmlBehaviorNodeKind.ExpansionRegion,
                    ExpansionKind = UmlExpansionRegionKind.Iterative,
                };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateInterruptibleRegion:
                element = new UmlBehaviorNode { Name = "interruptible", Kind = UmlBehaviorNodeKind.InterruptibleRegion };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateTable:
                element = new UmlClass { Name = "Table", Stereotype = "table" };
                presentation = UmlNodePresentation.Classifier;
                _project.RootPackage.AddClassifier((UmlClass)element);
                break;
            case UmlToolMode.CreateProfilePackage:
                element = new UmlPackage { Name = "Profile", Stereotype = "profile" };
                presentation = UmlNodePresentation.Package;
                _project.RootPackage.AddNestedPackage((UmlPackage)element);
                break;
            case UmlToolMode.CreateMetaclass:
                element = new UmlClass { Name = "Metaclass", Stereotype = "metaclass" };
                presentation = UmlNodePresentation.Classifier;
                _project.RootPackage.AddClassifier((UmlClass)element);
                break;
            case UmlToolMode.CreateNaryAssociationHub:
                element = new UmlBehaviorNode { Name = "hub", Kind = UmlBehaviorNodeKind.NaryAssociationHub };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateCompositeState:
                element = new UmlBehaviorNode { Name = "Composite", Kind = UmlBehaviorNodeKind.CompositeState };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateOrthogonalRegion:
                element = new UmlBehaviorNode { Name = "Region", Kind = UmlBehaviorNodeKind.OrthogonalRegion };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateEntryPoint:
                element = new UmlBehaviorNode { Name = "entry", Kind = UmlBehaviorNodeKind.EntryPoint };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateExitPoint:
                element = new UmlBehaviorNode { Name = "exit", Kind = UmlBehaviorNodeKind.ExitPoint };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateTerminateState:
                element = new UmlBehaviorNode { Name = "terminate", Kind = UmlBehaviorNodeKind.TerminateState };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateSubmachineState:
                element = new UmlBehaviorNode { Name = "Submachine", Kind = UmlBehaviorNodeKind.SubmachineState };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateActivityContainer:
                element = new UmlBehaviorNode { Name = "Activity", Kind = UmlBehaviorNodeKind.ActivityContainer };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateDataStore:
                element = new UmlBehaviorNode { Name = "store", Kind = UmlBehaviorNodeKind.DataStore };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateInputPin:
                element = new UmlBehaviorNode { Name = "in", Kind = UmlBehaviorNodeKind.InputPin };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateOutputPin:
                element = new UmlBehaviorNode { Name = "out", Kind = UmlBehaviorNodeKind.OutputPin };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateExceptionHandler:
                element = new UmlBehaviorNode { Name = "handler", Kind = UmlBehaviorNodeKind.ExceptionHandler };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateStateInvariant:
                element = new UmlBehaviorNode { Name = "{inv}", Kind = UmlBehaviorNodeKind.StateInvariant };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateContinuation:
                element = new UmlBehaviorNode { Name = "continuation", Kind = UmlBehaviorNodeKind.Continuation };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateTimingLifeline:
                element = new UmlBehaviorNode { Name = "Lifeline", Kind = UmlBehaviorNodeKind.TimingLifeline };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateTimingState:
                element = new UmlBehaviorNode { Name = "State", Kind = UmlBehaviorNodeKind.TimingState };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            case UmlToolMode.CreateInteractionUse:
                element = new UmlBehaviorNode
                {
                    Name = "interaction",
                    Kind = UmlBehaviorNodeKind.InteractionUse,
                    ReferencedDiagramName = "Sequence Diagram",
                };
                presentation = UmlNodePresentation.Behavior;
                _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                break;
            default:
                if (UmlToolModeHelper.TryCreateCombinedFragment(_toolMode, out var fragment))
                {
                    element = fragment;
                    presentation = UmlNodePresentation.Behavior;
                    _project.RootPackage.AddBehaviorNode(fragment);
                    break;
                }

                if (UmlToolModeHelper.IsNodeCreateTool(_toolMode))
                {
                    element = new UmlBehaviorNode
                    {
                        Name = UmlToolModeHelper.GetDisplayName(_toolMode),
                        Kind = UmlBehaviorNodeKind.State,
                    };
                    presentation = UmlNodePresentation.Behavior;
                    _project.RootPackage.AddBehaviorNode((UmlBehaviorNode)element);
                    break;
                }

                element = new UmlClass();
                presentation = UmlNodePresentation.Classifier;
                _project.RootPackage.AddClassifier((UmlClass)element);
                break;
        }

        // Lifeline: fixed default height; width follows horizontal drag.
        // Circle nodes (initial/final): always square.
        var nodeWidth = UmlToolModeHelper.IsLifelineCreateTool(_toolMode)
            ? rect.Width
            : Math.Max(24, rect.Width);
        var nodeHeight = UmlToolModeHelper.IsLifelineCreateTool(_toolMode)
            ? GetDefaultSize(_toolMode).Height
            : Math.Max(24, rect.Height);

        if (UmlCircleNodeGeometry.IsCircleCreateTool(_toolMode))
        {
            var size = Math.Max(Math.Max(nodeWidth, nodeHeight), UmlCircleNodeGeometry.MinDiameter);
            nodeWidth = size;
            nodeHeight = size;
        }

        if (_toolMode == UmlToolMode.CreateActor)
        {
            var uniform = UmlActorGeometry.NodeBoundsFromDrag(new RectangleF(rect.X, rect.Y, nodeWidth, nodeHeight));
            rect = uniform;
            nodeWidth = uniform.Width;
            nodeHeight = uniform.Height;
        }

        var node = new UmlDiagramNode
        {
            ModelElementId = element.Id,
            Presentation = presentation,
            X = rect.X,
            Y = rect.Y,
            Width = nodeWidth,
            Height = nodeHeight,
        };
        if (UmlNodeSilhouette.IsContainerPresentation(presentation))
            ActiveDiagram.Nodes.Insert(0, node);
        else
            ActiveDiagram.Nodes.Add(node);

        SyncCircleNodeBounds(node);
        Select(node, null);
        ReturnToSelectTool();
    }

    private bool TryGetBendHandleCursor(PointF canvasPoint, out Cursor cursor)
    {
        cursor = Cursors.Default;
        if (_selectedEdge is null)
            return false;

        var sourceNode = ActiveDiagram.FindNode(_selectedEdge.SourceNodeId);
        var targetNode = ActiveDiagram.FindNode(_selectedEdge.TargetNodeId);
        if (sourceNode is null || targetNode is null || UmlEdgeRouting.IsSelfRelationship(sourceNode, targetNode))
            return false;

        if (!UmlDiagramRenderer.TryGetEdgePath(_project, ActiveDiagram, _selectedEdge, out var pathPoints, out _))
            return false;

        var vertexIndex = UmlEdgeRouting.HitTestBendHandle(canvasPoint, pathPoints, _selectedEdge.RoutingKind, _zoom);
        if (vertexIndex is null)
            return false;

        UmlEdgeRouting.GetBendHandleDragAxes(pathPoints, vertexIndex.Value, out var horizontal, out var vertical);
        cursor = horizontal && vertical
            ? Cursors.SizeAll
            : horizontal
                ? Cursors.SizeWE
                : Cursors.SizeNS;
        return true;
    }

    private bool TryBeginBendDrag(PointF canvasPoint)
    {
        if (_selectedEdge is null
            || ActiveDiagram.Kind == UmlDiagramKind.SequenceDiagram
            || _selectedEdge.RoutingKind != UmlEdgeRoutingKind.Bent)
            return false;

        var sourceNode = ActiveDiagram.FindNode(_selectedEdge.SourceNodeId);
        var targetNode = ActiveDiagram.FindNode(_selectedEdge.TargetNodeId);
        if (sourceNode is null || targetNode is null)
            return false;

        if (UmlEdgeRouting.IsSelfRelationship(sourceNode, targetNode))
            return false;

        if (!UmlDiagramRenderer.TryGetEdgePath(_project, ActiveDiagram, _selectedEdge, out var pathPoints, out _))
            return false;

        var vertexIndex = UmlEdgeRouting.HitTestBendHandle(canvasPoint, pathPoints, _selectedEdge.RoutingKind, _zoom);
        if (vertexIndex is null)
            return false;

        _bendDragVertexIndex = vertexIndex.Value;
        return true;
    }

    private void ApplyBendDrag(PointF canvasPoint)
    {
        if (_selectedEdge is null || _bendDragVertexIndex < 0)
            return;

        if (!UmlDiagramRenderer.TryGetEdgePath(_project, ActiveDiagram, _selectedEdge, out var pathPoints, out _))
            return;

        UmlEdgeRouting.SetBendVertex(_selectedEdge, _bendDragVertexIndex, canvasPoint, pathPoints);
        _modelChangedDuringDrag = true;
        Invalidate();
    }

    private bool TryBeginSequenceMessageDrag()
    {
        if (_selectedEdge is null
            || ActiveDiagram.Kind != UmlDiagramKind.SequenceDiagram
            || !UmlSequenceLayout.IsSequenceMessage(_project, ActiveDiagram, _selectedEdge))
            return false;

        _isDraggingMessage = true;
        _messageYAtDragStart = UmlSequenceLayout.GetMessageY(ActiveDiagram, _selectedEdge);
        _modelChangedDuringDrag = false;
        return true;
    }

    private void ApplySequenceMessageDrag(PointF canvasPoint)
    {
        if (_selectedEdge is null)
            return;

        var dy = canvasPoint.Y - _dragStartCanvas.Y;
        if (Math.Abs(dy) < 4f / _zoom)
            return;

        var preferredY = _messageYAtDragStart + dy;
        var minY = UmlSequenceLayout.GetMinimumMessageY(_project, ActiveDiagram);
        var newY = Math.Max(minY, preferredY);
        var currentY = _selectedEdge.SequenceY > 0f ? _selectedEdge.SequenceY : _messageYAtDragStart;

        // When crossing another message, swap positions (reorder within life span).
        // When not crossing, move freely.
        if (!TrySwapWithCrossedMessage(currentY, newY))
            _selectedEdge.SequenceY = newY;

        UmlSequenceLayout.EnsureLifelinesFitMessage(_project, ActiveDiagram, _selectedEdge);
        _modelChangedDuringDrag = true;
        UpdateScrollBars();
        Invalidate();
    }

    private bool TrySwapWithCrossedMessage(float currentY, float newY)
    {
        if (_selectedEdge is null || ActiveDiagram.Kind != UmlDiagramKind.SequenceDiagram)
            return false;

        var movingDown = newY > currentY;
        UmlDiagramEdge? target = null;
        float targetY = 0f;

        foreach (var edge in ActiveDiagram.Edges)
        {
            if (edge.Id == _selectedEdge.Id
                || !UmlSequenceLayout.IsSequenceMessage(_project, ActiveDiagram, edge))
                continue;

            var y = UmlSequenceLayout.GetMessageY(ActiveDiagram, edge);
            if (movingDown && y > currentY && y <= newY && (target is null || y < targetY))
            {
                target = edge;
                targetY = y;
            }
            else if (!movingDown && y < currentY && y >= newY && (target is null || y > targetY))
            {
                target = edge;
                targetY = y;
            }
        }

        if (target is null)
            return false;

        // Swap: put the crossed message at the dragged message's old Y, dragged at new Y.
        target.SequenceY = currentY;
        _selectedEdge.SequenceY = newY;
        return true;
    }

    private void CreateRelationship(UmlDiagramNode sourceNode, UmlDiagramNode targetNode, float? sequenceMessageY = null)
    {
        if (_toolMode == UmlToolMode.CreateNoteLink)
        {
            if (!UmlDiagramCatalog.TryOrientNoteLink(sourceNode, targetNode, out var noteNode, out var annotatedNode))
                return;

            sourceNode = noteNode;
            targetNode = annotatedNode;
        }

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
            UmlToolMode.CreateAssembly => new UmlAssembly
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
            UmlToolMode.CreateNoteLink => new UmlNoteLink
            {
                SourceClassifierId = sourceNode.ModelElementId,
                TargetClassifierId = targetNode.ModelElementId,
            },
            UmlToolMode.CreateMessage or UmlToolMode.CreateAsyncMessage or UmlToolMode.CreateReturnMessage
                or UmlToolMode.CreateSelfMessage or UmlToolMode.CreateCreateMessage or UmlToolMode.CreateDestroyMessage
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
            UmlToolMode.CreatePackageMerge => new UmlPackageRelationship
            {
                PackageKind = UmlPackageRelationshipKind.Merge,
                SourceClassifierId = sourceNode.ModelElementId,
                TargetClassifierId = targetNode.ModelElementId,
            },
            UmlToolMode.CreatePackageImport => new UmlPackageRelationship
            {
                PackageKind = UmlPackageRelationshipKind.Import,
                SourceClassifierId = sourceNode.ModelElementId,
                TargetClassifierId = targetNode.ModelElementId,
            },
            UmlToolMode.CreatePackageNesting => new UmlPackageRelationship
            {
                PackageKind = UmlPackageRelationshipKind.Nesting,
                SourceClassifierId = sourceNode.ModelElementId,
                TargetClassifierId = targetNode.ModelElementId,
            },
            UmlToolMode.CreateAssociationClass => new UmlAssociationClass
            {
                SourceClassifierId = sourceNode.ModelElementId,
                TargetClassifierId = targetNode.ModelElementId,
            },
            UmlToolMode.CreateDeployment => new UmlDeploymentLink
            {
                SourceClassifierId = sourceNode.ModelElementId,
                TargetClassifierId = targetNode.ModelElementId,
            },
            UmlToolMode.CreateDeploymentPath => new UmlDeploymentPath
            {
                SourceClassifierId = sourceNode.ModelElementId,
                TargetClassifierId = targetNode.ModelElementId,
            },
            UmlToolMode.CreateClassNesting => new UmlClassNesting
            {
                SourceClassifierId = sourceNode.ModelElementId,
                TargetClassifierId = targetNode.ModelElementId,
            },
            UmlToolMode.CreateTrace => new UmlDependency
            {
                Stereotype = "trace",
                SourceClassifierId = sourceNode.ModelElementId,
                TargetClassifierId = targetNode.ModelElementId,
            },
            UmlToolMode.CreateApplyDependency => new UmlDependency
            {
                Stereotype = "apply",
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

        if (relationship is UmlBehaviorConnector communicationMessage
            && ActiveDiagram.Kind == UmlDiagramKind.CommunicationDiagram
            && UmlToolModeHelper.IsSequenceMessageTool(_toolMode))
        {
            communicationMessage.CommunicationSequenceNumber = GetNextCommunicationSequenceNumber();
            if (string.IsNullOrWhiteSpace(communicationMessage.Name))
                communicationMessage.Name = "message";
        }

        _project.RootPackage.AddRelationship(relationship);

        if (relationship is UmlPackageRelationship { PackageKind: UmlPackageRelationshipKind.Nesting } nestingRel)
        {
            var child = _project.FindElement(nestingRel.SourceClassifierId) as UmlPackage;
            var parent = _project.FindElement(nestingRel.TargetClassifierId) as UmlPackage;
            if (child is not null && parent is not null)
                UmlPackageNestingHelper.SyncNestedPackage(_project.RootPackage, parent, child);
        }

        var edge = new UmlDiagramEdge
        {
            ModelElementId = relationship.Id,
            SourceNodeId = sourceNode.Id,
            TargetNodeId = targetNode.Id,
            RoutingKind = UmlEdgeRoutingKind.Straight,
        };

        if (ActiveDiagram.Kind != UmlDiagramKind.SequenceDiagram)
            UmlEdgeRouting.ApplyAutoRouting(_project, ActiveDiagram, edge);

        ActiveDiagram.Edges.Add(edge);

        if (ActiveDiagram.Kind == UmlDiagramKind.SequenceDiagram && UmlToolModeHelper.IsSequenceMessageTool(_toolMode))
        {
            var preferredY = sequenceMessageY ?? _relationshipAnchorY;
            UmlSequenceLayout.InsertMessageAndReflow(_project, ActiveDiagram, edge, preferredY);
        }
        Select(null, edge);
        NotifyChanged();
    }

    private void Select(UmlDiagramNode? node, UmlDiagramEdge? edge)
    {
        var changed = _selectedNode != node || _selectedEdge != edge || _multiNodes.Count > 0 || _multiEdges.Count > 0;
        _multiNodes.Clear();
        _multiEdges.Clear();
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

    private void AddToMultiSelection(UmlDiagramNode node)
    {
        _selectedNode = null;
        _selectedEdge = null;
        _multiNodes.Add(node);
        Invalidate();
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    private void ToggleMultiSelection(UmlDiagramNode node)
    {
        _selectedNode = null;
        _selectedEdge = null;
        if (!_multiNodes.Remove(node))
            _multiNodes.Add(node);
        Invalidate();
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    private void FinishRubberBand()
    {
        if (!_isRubberBanding) return;
        _isRubberBanding = false;
        var rect = NormalizeRect(_rubberBandStart, _rubberBandEnd);
        _multiNodes.Clear();
        _multiEdges.Clear();
        foreach (var node in ActiveDiagram.Nodes)
        {
            if (rect.Contains(node.Bounds))
                _multiNodes.Add(node);
        }
        var nodeIdSet = new HashSet<Guid>(_multiNodes.Select(n => n.Id));
        foreach (var edge in ActiveDiagram.Edges)
        {
            if (nodeIdSet.Contains(edge.SourceNodeId) && nodeIdSet.Contains(edge.TargetNodeId))
                _multiEdges.Add(edge);
        }
        if (_multiNodes.Count == 1)
        {
            var single = _multiNodes.First();
            _multiNodes.Clear();
            Select(single, null);
        }
        else if (_multiNodes.Count == 0)
        {
            Select(null, null);
        }
        else
        {
            _selectedNode = null;
            _selectedEdge = null;
            SelectionChanged?.Invoke(this, EventArgs.Empty);
        }
        Invalidate();
    }

    private bool HasMultiSelection => _multiNodes.Count > 0;

    private void HitTestDiagram(PointF location, out UmlDiagramNode? node, out UmlDiagramEdge? edge)
    {
        if (ActiveDiagram.Kind == UmlDiagramKind.SequenceDiagram)
        {
            edge = HitTestEdge(location);
            node = edge is null ? HitTestNode(location) : null;
            return;
        }

        node = HitTestNode(location);
        edge = node is null ? HitTestEdge(location) : null;
    }

    private UmlDiagramNode? HitTestNode(PointF location)
    {
        UmlDiagramLayout.Prepare(_project, ActiveDiagram);
        UmlDiagramNode? containerCandidate = null;

        for (var i = ActiveDiagram.Nodes.Count - 1; i >= 0; i--)
        {
            var node = ActiveDiagram.Nodes[i];
            if (!UmlNodeSilhouette.HitTestNode(_project, node, location, _zoom))
                continue;

            if (UmlNodeSilhouette.IsContainerPresentation(node.Presentation)
                || UmlNodeSilhouette.IsFragmentContainerNode(_project, node))
            {
                containerCandidate ??= node;
                continue;
            }

            return node;
        }

        return containerCandidate;
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
            if (!UmlDiagramRenderer.TryGetEdgePath(_project, ActiveDiagram, edge, out var pathPoints, out _))
                continue;

            if (UmlEdgeRouting.DistanceToPath(pathPoints, edge.RoutingKind, location) <= threshold)
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

        using var minorPen = new Pen(UmlDiagramStyle.GridMinorColor, 1f / _zoom);
        using var majorPen = new Pen(UmlDiagramStyle.GridMajorColor, 1.2f / _zoom);

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
        if (_isDraggingBend && _selectedEdge is not null)
        {
            if (UmlDiagramRenderer.TryGetEdgePath(_project, ActiveDiagram, _selectedEdge, out var bendPath, out _))
            {
                UmlEdgeRouting.GetBendHandleDragAxes(bendPath, _bendDragVertexIndex, out var horizontal, out var vertical);
                Cursor = horizontal && vertical
                    ? Cursors.SizeAll
                    : horizontal
                        ? Cursors.SizeWE
                        : Cursors.SizeNS;
            }
            else
                Cursor = Cursors.SizeAll;
            return;
        }

        if (_isDraggingMessage)
        {
            Cursor = Cursors.SizeNS;
            return;
        }

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

            if (_selectedEdge is not null
                && _pointerOnCanvas
                && _selectedEdge.RoutingKind == UmlEdgeRoutingKind.Bent
                && ActiveDiagram.Kind != UmlDiagramKind.SequenceDiagram
                && TryGetBendHandleCursor(_pointerCanvas, out var bendCursor))
            {
                Cursor = bendCursor;
                return;
            }

            if (_hoverEdge is not null
                && ActiveDiagram.Kind == UmlDiagramKind.SequenceDiagram
                && UmlSequenceLayout.IsSequenceMessage(_project, ActiveDiagram, _hoverEdge))
            {
                Cursor = Cursors.SizeNS;
                return;
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
        if (_selectedNode is null)
            return -1;

        return UmlNodeSilhouette.HitTestResizeHandle(_project, _selectedNode, location);
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

        if (UmlCircleNodeGeometry.IsCircleNode(_project, _selectedNode) || UmlCircleNodeGeometry.IsDiamondNode(_project, _selectedNode))
        {
            ApplyCircleResize(p);
            return;
        }

        if (UmlActorGeometry.IsActorPresentation(_selectedNode.Presentation))
        {
            ApplyActorResize(p);
            return;
        }

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
        RefreshDiagramEdgeRouting();
    }

    private void RefreshDiagramEdgeRouting() =>
        UmlEdgeRouting.RefreshAutoRouting(_project, ActiveDiagram);

    private void SyncCircleNodeBounds(UmlDiagramNode node)
    {
        if (!UmlCircleNodeGeometry.IsCircleNode(_project, node) && !UmlCircleNodeGeometry.IsDiamondNode(_project, node))
            return;

        var square = UmlCircleNodeGeometry.GetCircleBounds(node.Bounds);
        node.X = square.X;
        node.Y = square.Y;
        node.Width = square.Width;
        node.Height = square.Height;
    }

    private void SyncActorNodeBounds(UmlDiagramNode node)
    {
        if (!UmlActorGeometry.IsActorPresentation(node.Presentation))
            return;

        var name = (_project.FindElement(node.ModelElementId) as UmlNamedElement)?.Name;
        var normalized = UmlActorGeometry.NormalizeNodeBounds(node.Bounds, name);
        node.X = normalized.X;
        node.Y = normalized.Y;
        node.Width = normalized.Width;
        node.Height = normalized.Height;
    }

    private void ApplyActorResize(PointF p)
    {
        if (_selectedNode is null)
            return;

        var dragRect = GetResizeDragRect(_resizeBoundsAtStart, p, _resizeHandleIndex);
        var name = (_project.FindElement(_selectedNode.ModelElementId) as UmlNamedElement)?.Name;
        var uniform = UmlActorGeometry.NodeBoundsFromDrag(dragRect, name);
        _selectedNode.X = uniform.X;
        _selectedNode.Y = uniform.Y;
        _selectedNode.Width = uniform.Width;
        _selectedNode.Height = uniform.Height;
        RefreshDiagramEdgeRouting();
    }

    private static RectangleF GetResizeDragRect(RectangleF bounds, PointF p, int handleIndex)
    {
        var left = bounds.Left;
        var top = bounds.Top;
        var right = bounds.Right;
        var bottom = bounds.Bottom;

        switch (handleIndex)
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

        return RectangleF.FromLTRB(Math.Min(left, right), Math.Min(top, bottom), Math.Max(left, right), Math.Max(top, bottom));
    }

    private void ApplyCircleResize(PointF p)
    {
        if (_selectedNode is null)
            return;

        const float minSize = UmlCircleNodeGeometry.MinDiameter;
        var o = _resizeBoundsAtStart;
        float left;
        float top;
        float size;

        switch (_resizeHandleIndex)
        {
            case 0:
                size = Math.Max(Math.Max(o.Right - p.X, o.Bottom - p.Y), minSize);
                left = o.Right - size;
                top = o.Bottom - size;
                break;
            case 1:
                size = Math.Max(o.Bottom - p.Y, minSize);
                left = o.Left + (o.Width - size) / 2f;
                top = o.Bottom - size;
                break;
            case 2:
                size = Math.Max(Math.Max(p.X - o.Left, o.Bottom - p.Y), minSize);
                left = o.Left;
                top = o.Bottom - size;
                break;
            case 3:
                size = Math.Max(p.X - o.Left, minSize);
                left = o.Left;
                top = o.Top + (o.Height - size) / 2f;
                break;
            case 4:
                size = Math.Max(Math.Max(p.X - o.Left, p.Y - o.Top), minSize);
                left = o.Left;
                top = o.Top;
                break;
            case 5:
                size = Math.Max(p.Y - o.Top, minSize);
                left = o.Left + (o.Width - size) / 2f;
                top = o.Top;
                break;
            case 6:
                size = Math.Max(Math.Max(o.Right - p.X, p.Y - o.Top), minSize);
                left = o.Right - size;
                top = o.Top;
                break;
            case 7:
                size = Math.Max(o.Right - p.X, minSize);
                left = o.Right - size;
                top = o.Top + (o.Height - size) / 2f;
                break;
            default:
                return;
        }

        _selectedNode.X = left;
        _selectedNode.Y = top;
        _selectedNode.Width = size;
        _selectedNode.Height = size;
        RefreshDiagramEdgeRouting();
    }

    // ── Overlays ──────────────────────────────────────────────────────────

    private void DrawConnectableHighlight(Graphics g, UmlDiagramNode node)
    {
        var color = _pendingSourceNode is not null
            ? Color.FromArgb(210, 20, 180, 70)
            : Color.FromArgb(160, 0, 140, 200);
        using var pen = new Pen(color, 2f) { DashStyle = System.Drawing.Drawing2D.DashStyle.Dot };
        UmlNodeSilhouette.DrawOutline(g, pen, _project, node);
    }

    private void DrawConnectionPreview(Graphics g)
    {
        var sourceNode = _pendingSourceNode;
        if (sourceNode is null)
            return;

        PointF src;
        PointF tgt;

        if (ActiveDiagram.Kind == UmlDiagramKind.SequenceDiagram && UmlToolModeHelper.IsSequenceMessageTool(_toolMode))
        {
            if (_toolMode == UmlToolMode.CreateSelfMessage)
            {
                var messageY = UmlSequenceLayout.ResolveMessageY(_project, ActiveDiagram, _pointerCanvas.Y);
                var srcX = UmlSequenceLayout.GetLifelineCenterX(sourceNode.Bounds);
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

            var previewY = UmlSequenceLayout.ResolveMessageY(_project, ActiveDiagram, _pointerCanvas.Y);
            var previewSrcX = UmlSequenceLayout.GetLifelineCenterX(sourceNode.Bounds);
            var previewTgtX = _hoverNode is not null && _hoverNode != sourceNode
                ? UmlSequenceLayout.GetLifelineCenterX(_hoverNode.Bounds)
                : _pointerCanvas.X;
            src = new PointF(previewSrcX, previewY);
            tgt = new PointF(previewTgtX, previewY);

            using (var dashPen = new Pen(Color.FromArgb(200, 0, 140, 90), 2f / _zoom)
            {
                DashStyle = System.Drawing.Drawing2D.DashStyle.Dash,
            })
            {
                g.DrawLine(dashPen, src, tgt);
            }

            DrawPreviewArrowHead(g, src, tgt);
            DrawFloatingLabel(g, $"[{GetConnectionTypeLabel(_toolMode)}]", new PointF((src.X + tgt.X) / 2f, src.Y), 6f, -22f);
            DrawConnectionPreviewChrome(g, sourceNode, src, tgt);
            return;
        }

        var targetNode = _hoverNode ?? sourceNode;
        var targetBounds = targetNode?.Bounds
            ?? new RectangleF(_pointerCanvas.X - 1f, _pointerCanvas.Y - 1f, 2f, 2f);
        var previewRouting = new UmlDiagramEdge
        {
            SourceNodeId = sourceNode.Id,
            TargetNodeId = targetNode?.Id ?? sourceNode.Id,
        };
        if (targetNode is not null)
            UmlEdgeRouting.ApplyAutoRouting(_project, ActiveDiagram, previewRouting);

        var previewPath = UmlDiagramRenderer.BuildPreviewPath(
            _project,
            previewRouting.RoutingKind,
            sourceNode,
            sourceNode.Bounds,
            targetNode,
            targetBounds,
            previewRouting,
            ActiveDiagram);
        var flat = UmlEdgeRouting.FlattenForCrossingDetection(previewPath, previewRouting.RoutingKind);
        src = flat[0];
        tgt = flat[^1];

        using (var dashPen = new Pen(Color.FromArgb(200, 0, 140, 90), 2f / _zoom)
        {
            DashStyle = System.Drawing.Drawing2D.DashStyle.Dash,
        })
        {
            if (flat.Length == 2)
                g.DrawLine(dashPen, flat[0], flat[1]);
            else
                g.DrawLines(dashPen, flat);
        }

        if (_toolMode != UmlToolMode.CreateNoteLink)
            DrawPreviewArrowHead(g, flat.Length >= 2 ? flat[^2] : src, tgt);
        DrawFloatingLabel(g, $"[{GetConnectionTypeLabel(_toolMode)}]", UmlEdgeRouting.GetPathLabelPoint(previewPath, previewRouting.RoutingKind), 6f, -22f);
        DrawConnectionPreviewChrome(g, sourceNode, src, tgt);
    }

    private void DrawConnectionPreviewChrome(Graphics g, UmlDiagramNode sourceNode, PointF src, PointF tgt)
    {
        DrawFloatingLabel(g, $"시작: {GetNodeName(sourceNode)}", src, 6f, -22f);

        if (_hoverNode is not null)
            DrawFloatingLabel(g, _hoverNode == sourceNode ? "종료: (자기 자신)" : $"종료: {GetNodeName(_hoverNode)}", tgt, 10f, 8f);
        else
            DrawFloatingLabel(g, "종료: ?", tgt, 10f, 8f);

        using var srcPen = new Pen(Color.FromArgb(200, 0, 110, 200), 2f);
        UmlNodeSilhouette.DrawOutline(g, srcPen, _project, sourceNode);
    }

    private static void DrawPreviewArrowHead(Graphics g, PointF from, PointF to)
    {
        var angle = Math.Atan2(to.Y - from.Y, to.X - from.X);
        const float len = 14f;
        const float wing = 10f;
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

    private int GetNextCommunicationSequenceNumber()
    {
        var max = ActiveDiagram.Edges
            .Select(e => _project.FindRelationship(e.ModelElementId))
            .OfType<UmlBehaviorConnector>()
            .Where(c => c.Kind == UmlBehaviorConnectorKind.Message)
            .Select(c => c.CommunicationSequenceNumber)
            .DefaultIfEmpty(0)
            .Max();
        return max + 1;
    }

    private static string GetDefaultSequenceMessageName(UmlToolMode mode) => mode switch
    {
        UmlToolMode.CreateAsyncMessage => "signal()",
        UmlToolMode.CreateReturnMessage => "return",
        UmlToolMode.CreateSelfMessage => "selfCall()",
        UmlToolMode.CreateCreateMessage => "create",
        UmlToolMode.CreateDestroyMessage => "destroy",
        _ => "call()",
    };

    private static string GetConnectionTypeLabel(UmlToolMode mode) => mode switch
    {
        UmlToolMode.CreateGeneralization => "일반화",
        UmlToolMode.CreateRealization => "실체화",
        UmlToolMode.CreateDependency => "의존",
        UmlToolMode.CreateAssembly => "조립",
        UmlToolMode.CreateAssociation => "연관",
        UmlToolMode.CreateDirectedAssociation => "방향 연관",
        UmlToolMode.CreateAggregation => "집합",
        UmlToolMode.CreateComposition => "합성",
        UmlToolMode.CreateInclude => "포함",
        UmlToolMode.CreateExtend => "확장",
        UmlToolMode.CreateNoteLink => "노트 연결",
        UmlToolMode.CreateMessage => "동기 메시지",
        UmlToolMode.CreateAsyncMessage => "비동기 메시지",
        UmlToolMode.CreateReturnMessage => "반환 메시지",
        UmlToolMode.CreateSelfMessage => "자기 호출",
        UmlToolMode.CreateTransition => "전이",
        UmlToolMode.CreateControlFlow => "제어 흐름",
        UmlToolMode.CreateObjectFlow => "객체 흐름",
        UmlToolMode.CreateDeployment => "배치",
        UmlToolMode.CreateDeploymentPath => "통신 경로",
        _ => "연결",
    };

    // ── Context Menu ──────────────────────────────────────────────────────

    private void ShowContextMenu(Point screenPoint)
    {
        var cp = ScreenToCanvas(screenPoint);
        HitTestDiagram(cp, out var hitNode, out var hitEdge);

        var menu = new ContextMenuStrip();

        // Multi-selection context menu takes priority
        if (HasMultiSelection && (hitNode is null || _multiNodes.Contains(hitNode)))
        {
            BuildMultiSelectionContextMenu(menu);
        }
        else if (hitNode is not null)
        {
            BuildNodeContextMenu(menu, hitNode, cp);
        }
        else if (hitEdge is not null)
        {
            BuildEdgeContextMenu(menu, hitEdge, cp);
        }
        else
        {
            BuildCanvasContextMenu(menu, cp);
        }

        if (menu.Items.Count > 0)
            menu.Show(this, screenPoint);
    }

    private void BuildMultiSelectionContextMenu(ContextMenuStrip menu)
    {
        Add($"선택한 {_multiNodes.Count}개 복사", UmlIcons.Duplicate(), () =>
        {
            CopySelectionToClipboard();
        });
        Add($"선택한 {_multiNodes.Count}개 삭제", UmlIcons.Delete(), () =>
        {
            DeleteSelection();
        });
        menu.Items.Add(new ToolStripSeparator());
        Add("선택 영역을 이미지로 저장...", UmlIcons.ExportImage(), () =>
        {
            SaveSelectionAsImage();
        });

        void Add(string label, Bitmap image, Action action)
        {
            var item = new ToolStripMenuItem(label) { Image = image };
            item.Click += (_, _) => action();
            menu.Items.Add(item);
        }
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
                    var (name, vis) = UmlMemberPrompt.Show(PromptOwner, "속성 추가", "newProperty", UmlVisibility.Private);
                    if (name is null) return;
                    classifier.Properties.Add(new UmlProperty { Name = name.Trim(), Visibility = vis });
                    NotifyChanged();
                });
                Add("연산 추가...", UmlIcons.AddItem(), () =>
                {
                    var (name, vis) = UmlMemberPrompt.Show(PromptOwner, "연산 추가", "newOperation", UmlVisibility.Public);
                    if (name is null) return;
                    classifier.Operations.Add(new UmlOperation { Name = name.Trim(), Visibility = vis });
                    NotifyChanged();
                });
            }

            Add(node.ShowCompartments ? "구획 숨기기" : "구획 표시", UmlIcons.Compartments(), () =>
            {
                node.ShowCompartments = !node.ShowCompartments;
                NotifyChanged();
            });
        }

        if (node.Presentation == UmlNodePresentation.Note)
        {
            menu.Items.Add(new ToolStripSeparator());
            Add("개체에 연결...", UmlIcons.ForToolMode(UmlToolMode.CreateNoteLink), () =>
            {
                Select(node, null);
                _pendingSourceNode = node;
                _toolMode = UmlToolMode.CreateNoteLink;
                ToolModeRequested?.Invoke(this, UmlToolMode.CreateNoteLink);
                UpdateCursor();
                Invalidate();
            });
        }

        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripSeparator());
        Add("복사", UmlIcons.Duplicate(), () => { Select(node, null); CopySelectionToClipboard(); });
        Add("삭제", UmlIcons.Delete(), () => { Select(node, null); DeleteSelection(); });
        Add("이미지로 저장...", UmlIcons.ExportImage(), () => { Select(node, null); SaveSelectionAsImage(); });

        void Add(string label, Bitmap image, Action action)
        {
            var item = new ToolStripMenuItem(label) { Image = image };
            item.Click += (_, _) => action();
            menu.Items.Add(item);
        }
    }

    private void SetEdgeRouting(UmlDiagramEdge edge, UmlEdgeRoutingKind kind)
    {
        edge.RoutingKind = kind;
        if (kind == UmlEdgeRoutingKind.Straight)
        {
            edge.OrthoMidX = null;
            edge.OrthoMidY = null;
        }
        else if (edge.OrthoMidX is null && edge.OrthoMidY is null)
            UmlEdgeRouting.ApplyDefaultBendPosition(_project, ActiveDiagram, edge);

        Invalidate();
        NotifyChanged();
    }

    private void BuildEdgeContextMenu(ContextMenuStrip menu, UmlDiagramEdge edge, PointF cp)
    {
        var rel = _project.FindRelationship(edge.ModelElementId);

        if (ActiveDiagram.Kind != UmlDiagramKind.SequenceDiagram)
        {
            var routingMenu = new ToolStripMenuItem("연결 방식");
            routingMenu.DropDownItems.Add("직선", null, (_, _) => SetEdgeRouting(edge, UmlEdgeRoutingKind.Straight));
            routingMenu.DropDownItems.Add("꺾인선", null, (_, _) => SetEdgeRouting(edge, UmlEdgeRoutingKind.Bent));
            menu.Items.Add(routingMenu);
            menu.Items.Add(new ToolStripSeparator());
        }

        Add("편집...", UmlIcons.Edit(), () =>
        {
            Select(null, edge);
            if (TryEditAt(cp)) { SelectionChanged?.Invoke(this, EventArgs.Empty); NotifyChanged(); }
        });

        if (rel is UmlBehaviorConnector { Kind: UmlBehaviorConnectorKind.Message } message
            && ActiveDiagram.Kind == UmlDiagramKind.SequenceDiagram)
        {
            Add("지속 최소 편집...", UmlIcons.Edit(), () =>
            {
                var t = UmlTextPrompt.Show(PromptOwner, "Duration", "지속 최소", message.DurationMin ?? "");
                if (t is null) return;
                message.DurationMin = string.IsNullOrWhiteSpace(t) ? null : t.Trim();
                NotifyChanged();
            });
            Add("지속 최대 편집...", UmlIcons.Edit(), () =>
            {
                var t = UmlTextPrompt.Show(PromptOwner, "Duration", "지속 최대", message.DurationMax ?? "");
                if (t is null) return;
                message.DurationMax = string.IsNullOrWhiteSpace(t) ? null : t.Trim();
                NotifyChanged();
            });
            Add("지속 제약 편집...", UmlIcons.Edit(), () =>
            {
                var t = UmlTextPrompt.Show(PromptOwner, "Duration", "지속 제약 (레거시)", message.DurationConstraint ?? "");
                if (t is null) return;
                message.DurationConstraint = string.IsNullOrWhiteSpace(t) ? null : t.Trim();
                NotifyChanged();
            });
        }

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
                ActivateTool("시스템 경계 추가", UmlIcons.NodeSystemBoundary(), UmlToolMode.CreateSystemBoundary);
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

            case UmlDiagramKind.ComponentDiagram:
                ActivateNotation(UmlToolMode.CreateComponent);
                ActivateNotation(UmlToolMode.CreateProvidedInterface);
                ActivateNotation(UmlToolMode.CreateRequiredInterface);
                ActivateNotation(UmlToolMode.CreateAssembly);
                menu.Items.Add(new ToolStripSeparator());
                break;

            case UmlDiagramKind.ObjectDiagram:
                ActivateNotation(UmlToolMode.CreateObjectInstance);
                ActivateNotation(UmlToolMode.CreateAssociation);
                ActivateNotation(UmlToolMode.CreateDependency);
                menu.Items.Add(new ToolStripSeparator());
                break;

            case UmlDiagramKind.CommunicationDiagram:
                ActivateNotation(UmlToolMode.CreateObjectInstance);
                ActivateNotation(UmlToolMode.CreateMessage);
                ActivateNotation(UmlToolMode.CreateAssociation);
                menu.Items.Add(new ToolStripSeparator());
                break;

            case UmlDiagramKind.DeploymentDiagram:
                ActivateNotation(UmlToolMode.CreateDeploymentHost);
                ActivateNotation(UmlToolMode.CreateArtifact);
                ActivateNotation(UmlToolMode.CreateDeployment);
                ActivateNotation(UmlToolMode.CreateDeploymentPath);
                menu.Items.Add(new ToolStripSeparator());
                break;
        }

        ActivateTool("Note 추가", UmlIcons.NodeNote(), UmlToolMode.CreateNote);

        if (CanPaste)
        {
            menu.Items.Add(new ToolStripSeparator());
            var pasteItem = new ToolStripMenuItem("붙여넣기") { Image = UmlIcons.Duplicate() };
            pasteItem.Click += (_, _) => PasteFromClipboard();
            menu.Items.Add(pasteItem);
        }
    }

    private void NotifyChanged()
    {
        UpdateScrollBars();
        Invalidate();
        ProjectChanged?.Invoke(this, EventArgs.Empty);
    }
}
