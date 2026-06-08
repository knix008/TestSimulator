using System.Drawing.Drawing2D;
using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

public sealed class StructureDiagramViewer : UserControl
{
    private DiagramViewKind _viewKind = DiagramViewKind.ClassDiagram;
    private AnalysisResult? _analysis;
    private IReadOnlyList<string> _functionRootIds = [];
    private IReadOnlyList<string> _fileRootOverride = [];
    private IReadOnlyList<string> _directoryRootOverride = [];
    private string? _dataFlowRootOverride;
    private string? _projectRootDirectory;
    private GraphLayoutDirection _layoutDirection = GraphLayoutDirection.LeftToRight;
    private ConnectionLineStyle _lineStyle = ConnectionLineStyle.Orthogonal;
    private bool _isAnalyzing;
    private Size _contentSize = new(400, 300);
    private readonly List<DiagramBoxNode> _boxes = [];
    private readonly List<DiagramEdge> _edges = [];
    private readonly Dictionary<string, DiagramBoxNode> _boxMap = new(StringComparer.Ordinal);
    private SequenceDiagramResult? _sequence;
    private readonly HashSet<string> _highlightIds = new(StringComparer.Ordinal);
    private string? _currentHighlightId;
    private readonly DiagramZoomController _zoom = new();
    private readonly DiagramScrollPan _pan = new();
    private bool _buildError;
    private string? _focusedTypeId;

    public event Action<FileRelationNode>? FileRootChanged;
    public event Action<DirectoryRelationNode>? DirectoryRootChanged;
    public event Action<CallGraphNode>? FunctionRootChanged;

    public StructureDiagramViewer()
    {
        DoubleBuffered = true;
        SetStyle(ControlStyles.ResizeRedraw, true);
        BackColor = Color.White;
        AutoScroll = true;
    }

    public DiagramViewKind ViewKind
    {
        get => _viewKind;
        set
        {
            if (_viewKind == value)
            {
                return;
            }

            _viewKind = value;
            Rebuild();
        }
    }

    public void SetAnalysis(AnalysisResult? analysis, IReadOnlyList<string> functionRootIds, string? projectRootDirectory = null)
    {
        _isAnalyzing = false;
        _buildError = false;
        ViewFailureReporter.Clear(this);
        _zoom.Reset();
        var preserveContainerRoots = ReferenceEquals(_analysis, analysis)
            && _functionRootIds.SequenceEqual(functionRootIds);
        _analysis = analysis;
        _functionRootIds = functionRootIds;
        _projectRootDirectory = projectRootDirectory;
        if (!preserveContainerRoots)
        {
            _fileRootOverride = [];
            _directoryRootOverride = [];
        }
        _dataFlowRootOverride = null;
        // _focusedTypeId is NOT reset here — BeginAnalysis and FocusType control it.
        _highlightIds.Clear();
        _currentHighlightId = null;
        Rebuild();
    }

    public void FocusType(string? typeId)
    {
        if (_focusedTypeId == typeId)
        {
            return;
        }

        _focusedTypeId = typeId;
        Rebuild();
        EnsureCurrentBoxVisible();
    }

    public void BeginAnalysis()
    {
        _zoom.Reset();
        _isAnalyzing = true;
        _buildError = false;
        ViewFailureReporter.Clear(this);
        _analysis = null;
        _focusedTypeId = null;
        _boxes.Clear();
        _edges.Clear();
        _boxMap.Clear();
        _sequence = null;
        _contentSize = new Size(400, 300);
        _zoom.ApplyContentSize(this, _contentSize);
        Invalidate();
    }

    public void EndAnalysis() => _isAnalyzing = false;

    public void ResetView()
    {
        _zoom.Reset();
        _zoom.ApplyContentSize(this, _contentSize);
        AutoScrollPosition = new Point(0, 0);
        Invalidate();
    }

    public void ClearSearchHighlight()
    {
        _highlightIds.Clear();
        _currentHighlightId = null;
        Invalidate();
    }

    public void FocusFile(string fileId)
    {
        _fileRootOverride = [fileId];
        _directoryRootOverride = [];
        Rebuild();
    }

    public void FocusDirectory(string directoryId)
    {
        _directoryRootOverride = [directoryId];
        _fileRootOverride = [];
        Rebuild();
    }

    public GraphLayoutDirection LayoutDirection
    {
        get => _layoutDirection;
        set
        {
            if (_layoutDirection == value)
            {
                return;
            }

            _layoutDirection = value;
            Rebuild();
        }
    }

    public ConnectionLineStyle LineStyle
    {
        get => _lineStyle;
        set
        {
            if (_lineStyle == value)
            {
                return;
            }

            _lineStyle = value;
            _zoom.InvalidateCache();
            Invalidate();
        }
    }

    public void SetSearchHighlight(IEnumerable<string> matchIds, string? currentId)
    {
        _highlightIds.Clear();
        foreach (var id in matchIds)
        {
            _highlightIds.Add(id);
        }

        _currentHighlightId = currentId;
        _zoom.InvalidateCache();
        Invalidate();
        EnsureCurrentBoxVisible();
    }

    private void EnsureCurrentBoxVisible()
    {
        var targetId = _currentHighlightId
            ?? _focusedTypeId
            ?? _fileRootOverride.FirstOrDefault()
            ?? _directoryRootOverride.FirstOrDefault();
        ScrollToBox(targetId);
    }

    private void ScrollToBox(string? boxId)
    {
        if (string.IsNullOrEmpty(boxId) || !_boxMap.TryGetValue(boxId, out var box))
        {
            return;
        }

        var location = box.Bounds.Location;
        if (IsHandleCreated)
        {
            BeginInvoke(() => _zoom.ScrollToDocumentPoint(this, location, _contentSize));
        }
        else
        {
            _zoom.ScrollToDocumentPoint(this, location, _contentSize);
        }
    }

    protected override void OnScroll(ScrollEventArgs se)
    {
        base.OnScroll(se);
        InvalidateDiagramSurface();
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        using var brush = new SolidBrush(BackColor);
        e.Graphics.FillRectangle(brush, e.ClipRectangle);
    }

    protected override void OnMouseWheel(MouseEventArgs e)
    {
        if (_zoom.HandleMouseWheel(this, e, _contentSize))
        {
            InvalidateDiagramSurface();
            return;
        }

        base.OnMouseWheel(e);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        if (_isAnalyzing)
        {
            DrawMessage(e.Graphics, "다이어그램을 준비하는 중...");
            return;
        }

        if (_analysis is null)
        {
            DrawMessage(e.Graphics, "분석을 실행하면 다이어그램이 표시됩니다.");
            return;
        }

        if (_buildError)
        {
            DrawMultilineMessage(
                e.Graphics,
                ViewFailureReporter.FormatCanvasMessage(
                    ViewFailureReporter.GetLastException(this),
                    "다이어그램 구성"));
            return;
        }

        try
        {
            if (_viewKind == DiagramViewKind.SequenceDiagram)
            {
                _zoom.PaintDocument(e.Graphics, this, e.ClipRectangle, _contentSize, BackColor, DrawSequence);
                return;
            }

            if (_boxes.Count == 0)
            {
                DrawMessage(e.Graphics, "표시할 구조 정보가 없습니다.");
                return;
            }

            _zoom.PaintDocument(e.Graphics, this, e.ClipRectangle, _contentSize, BackColor, DrawStructureDiagram);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
        {
            ViewFailureReporter.Report(this, DiagramViewDisplayNames.Get(_viewKind), "표시", ex);
            DrawMultilineMessage(
                e.Graphics,
                ViewFailureReporter.FormatCanvasMessage(ex, "다이어그램 표시"));
        }
    }

    private bool IsUmlClassView() =>
        _viewKind is DiagramViewKind.ClassDiagram or DiagramViewKind.Inheritance;

    private bool IsContainerRelationView() =>
        _viewKind is DiagramViewKind.FileRelations or DiagramViewKind.DirectoryRelations;

    private bool IsDataFlowView() => _viewKind == DiagramViewKind.DataFlow;

    private bool UsesFlowStyleEdges() =>
        _viewKind is DiagramViewKind.DataFlow
            or DiagramViewKind.FileRelations
            or DiagramViewKind.DirectoryRelations;

    private void DrawStructureDiagram(Graphics graphics)
    {
        graphics.SmoothingMode = SmoothingMode.AntiAlias;

        if (UsesFlowStyleEdges())
        {
            var arrows = DrawFlowStyleEdgeBodies(graphics);
            DrawFlowStyleBoxes(graphics);
            DiagramConnectionDrawer.DrawArrowHeads(graphics, arrows);
            DrawFlowStyleEdgeLabels(graphics);
            return;
        }

        foreach (var edge in _edges)
        {
            if (!_boxMap.TryGetValue(edge.FromId, out var from) || !_boxMap.TryGetValue(edge.ToId, out var to))
            {
                continue;
            }

            if (IsUmlClassView())
            {
                UmlClassDiagramRenderer.DrawRelation(graphics, from, to, edge, _lineStyle);
            }
            else
            {
                DrawEdge(graphics, edge);
            }
        }

        foreach (var box in _boxes)
        {
            var isCurrent = _currentHighlightId is not null && string.Equals(box.Id, _currentHighlightId, StringComparison.Ordinal);
            var isMatch = _highlightIds.Contains(box.Id);

            if (box.IsUmlStyle)
            {
                UmlClassDiagramRenderer.DrawClass(graphics, box, isMatch, isCurrent);
            }
            else
            {
                DrawBox(graphics, box);
            }
        }
    }

    public Bitmap? ExportToBitmap()
    {
        if (_analysis is null)
        {
            return null;
        }

        var w = Math.Max(1, _contentSize.Width);
        var h = Math.Max(1, _contentSize.Height);
        var bmp = new Bitmap(w, h, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        g.Clear(Color.Transparent);

        if (_viewKind == DiagramViewKind.SequenceDiagram)
        {
            DrawSequence(g);
            return bmp;
        }

        if (_boxes.Count == 0)
        {
            return null;
        }

        if (UsesFlowStyleEdges())
        {
            var arrows = DrawFlowStyleEdgeBodies(g);
            DrawFlowStyleBoxes(g, includeHighlight: false);
            DiagramConnectionDrawer.DrawArrowHeads(g, arrows);
            DrawFlowStyleEdgeLabels(g);
        }
        else
        {
            foreach (var edge in _edges)
            {
                if (!_boxMap.TryGetValue(edge.FromId, out var from) || !_boxMap.TryGetValue(edge.ToId, out var to))
                {
                    continue;
                }

                if (IsUmlClassView())
                {
                    UmlClassDiagramRenderer.DrawRelation(g, from, to, edge, _lineStyle);
                }
                else
                {
                    DrawEdge(g, edge);
                }
            }

            foreach (var box in _boxes)
            {
                if (box.IsUmlStyle)
                {
                    UmlClassDiagramRenderer.DrawClass(g, box, isHighlight: false, isCurrent: false);
                }
                else
                {
                    DrawBox(g, box);
                }
            }
        }

        return bmp;
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (_isAnalyzing)
        {
            return;
        }

        _pan.Begin(e, this);
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        var blockSelection = _pan.End(this);
        base.OnMouseUp(e);

        if (blockSelection || e.Button != MouseButtons.Left || _analysis is null)
        {
            return;
        }

        if (!TryHitBox(e.Location, out var nodeId) || !_boxMap.TryGetValue(nodeId, out _))
        {
            return;
        }

        if (_viewKind == DiagramViewKind.DataFlow)
        {
            if (!_analysis.CallGraph.NodeMap.TryGetValue(nodeId, out var node))
            {
                return;
            }

            _dataFlowRootOverride = nodeId;
            FunctionRootChanged?.Invoke(node);
            Rebuild();
            return;
        }

        if (!IsContainerRelationView())
        {
            return;
        }

        if (_viewKind == DiagramViewKind.FileRelations)
        {
            if (!_analysis.FileRelations.FileMap.TryGetValue(nodeId, out var file))
            {
                return;
            }

            _fileRootOverride = [nodeId];
            _directoryRootOverride = [];
            FileRootChanged?.Invoke(file);
            Rebuild();
            return;
        }

        if (!_analysis.DirectoryRelations.DirectoryMap.TryGetValue(nodeId, out var directory))
        {
            return;
        }

        _directoryRootOverride = [nodeId];
        _fileRootOverride = [];
        DirectoryRootChanged?.Invoke(directory);
        Rebuild();
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        if (_pan.HandleMove(e, this, _zoom, _contentSize))
        {
            InvalidateDiagramSurface();
            return;
        }

        base.OnMouseMove(e);
    }

    protected override void OnMouseClick(MouseEventArgs e)
    {
        if (_pan.ShouldBlockClick(e.Location))
        {
            return;
        }

        _pan.AcknowledgeClick();
        base.OnMouseClick(e);
    }

    private bool TryHitBox(Point clientPoint, out string boxId)
    {
        boxId = string.Empty;
        var documentPoint = ClientToDocument(clientPoint);

        foreach (var box in _boxes)
        {
            if (!box.Bounds.Contains(documentPoint))
            {
                continue;
            }

            boxId = box.Id;
            return true;
        }

        return false;
    }

    private Point ClientToDocument(Point clientPoint) => _zoom.ClientToDocument(this, clientPoint);

    private void Rebuild()
    {
        _zoom.InvalidateCache();
        _boxes.Clear();
        _edges.Clear();
        _boxMap.Clear();
        _sequence = null;
        _buildError = false;
        ViewFailureReporter.Clear(this);

        if (_analysis is null)
        {
            _contentSize = new Size(400, 300);
            _zoom.ApplyContentSize(this, _contentSize);
            Invalidate();
            return;
        }

        try
        {
            switch (_viewKind)
            {
                case DiagramViewKind.ClassDiagram:
                    BuildClassDiagram(_analysis.Structure, inheritanceOnly: false);
                    break;
                case DiagramViewKind.Inheritance:
                    BuildClassDiagram(_analysis.Structure, inheritanceOnly: true);
                    break;
                case DiagramViewKind.FileRelations:
                    BuildFileRelations();
                    break;
                case DiagramViewKind.DirectoryRelations:
                    BuildDirectoryRelations();
                    break;
                case DiagramViewKind.DataFlow:
                    BuildDataFlow(
                        _analysis.CallGraph,
                        _dataFlowRootOverride ?? _functionRootIds.FirstOrDefault());
                    break;
                case DiagramViewKind.SequenceDiagram:
                    _sequence = SequenceDiagramBuilder.Build(_analysis.CallGraph, _functionRootIds.FirstOrDefault());
                    ApplySequenceContentSize(_sequence);
                    Invalidate();
                    return;
            }
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
        {
            _buildError = true;
            _boxes.Clear();
            _edges.Clear();
            _boxMap.Clear();
            _sequence = null;
            _contentSize = new Size(400, 300);
            _zoom.ApplyContentSize(this, _contentSize);
            ViewFailureReporter.Report(this, DiagramViewDisplayNames.Get(_viewKind), "구성", ex);
        }

        EnsureCurrentBoxVisible();
        Invalidate();
    }

    private void BuildFileRelations()
    {
        var full = _analysis!.FileRelations;
        FileRelationGraphResult subgraph;

        if (_fileRootOverride.Count > 0)
        {
            subgraph = FileCallGraphBuilder.BuildSubgraphFromFileRoots(full, _fileRootOverride);
        }
        else if (_functionRootIds.Count > 0)
        {
            subgraph = FileCallGraphBuilder.BuildSubgraph(full, _analysis.CallGraph, _functionRootIds);
        }
        else
        {
            subgraph = full;
        }

        if (subgraph.Files.Count == 0)
        {
            _contentSize = new Size(400, 300);
            _zoom.ApplyContentSize(this, _contentSize);
            return;
        }

        foreach (var file in subgraph.Files)
        {
            var box = FileRelationDiagramRenderer.CreateBox(file);
            _boxes.Add(box);
            _boxMap[box.Id] = box;
        }

        foreach (var edge in subgraph.Edges)
        {
            _edges.Add(new DiagramEdge
            {
                FromId = edge.FromFileId,
                ToId = edge.ToFileId,
                Label = edge.Label,
                CallCount = edge.CallCount,
                RelationKind = StructureRelationKind.Dependency
            });
        }

        var primaryRoot = _fileRootOverride.FirstOrDefault()
            ?? FileCallGraphBuilder.ResolveFileRoots(_analysis.CallGraph, _functionRootIds).FirstOrDefault();

        if (string.IsNullOrEmpty(primaryRoot))
        {
            var depths = ComputeFileDepths(subgraph);
            ApplyBoxContentSize(DiagramBoxLayoutEngine.LayoutLayered(_boxes, depths));
        }
        else
        {
            var orderedOutgoing = BuildOrderedOutgoing(subgraph.Outgoing);
            ApplyBoxContentSize(_layoutDirection == GraphLayoutDirection.TopToBottom
                ? DiagramBoxLayoutEngine.LayoutTopToBottomTree(
                    _boxes,
                    orderedOutgoing,
                    primaryRoot)
                : DiagramBoxLayoutEngine.LayoutLeftToRightTree(
                    _boxes,
                    orderedOutgoing,
                    primaryRoot));
        }
    }

    private void BuildDirectoryRelations()
    {
        var full = _analysis!.DirectoryRelations;
        DirectoryRelationGraphResult subgraph;

        if (_directoryRootOverride.Count > 0)
        {
            subgraph = DirectoryCallGraphBuilder.BuildSubgraphFromDirectoryRoots(full, _directoryRootOverride);
        }
        else if (_functionRootIds.Count > 0)
        {
            subgraph = DirectoryCallGraphBuilder.BuildSubgraph(full, _analysis.CallGraph, _functionRootIds);
        }
        else
        {
            subgraph = full;
        }

        if (subgraph.Directories.Count == 0)
        {
            _contentSize = new Size(400, 300);
            _zoom.ApplyContentSize(this, _contentSize);
            return;
        }

        subgraph = DirectoryCallGraphBuilder.EnrichWithAncestorDirectories(subgraph, _projectRootDirectory);

        foreach (var directory in subgraph.Directories)
        {
            var box = FileRelationDiagramRenderer.CreateDirectoryBox(directory);
            _boxes.Add(box);
            _boxMap[box.Id] = box;
        }

        foreach (var edge in subgraph.Edges)
        {
            _edges.Add(new DiagramEdge
            {
                FromId = edge.FromDirectoryId,
                ToId = edge.ToDirectoryId,
                Label = edge.Label,
                CallCount = edge.CallCount,
                RelationKind = StructureRelationKind.Dependency
            });
        }

        var primaryRoot = DirectoryCallGraphBuilder.ResolvePrimaryLayoutRoot(
            subgraph,
            _analysis.CallGraph,
            _functionRootIds,
            _directoryRootOverride,
            _projectRootDirectory);

        var useProjectPathLayout = false;
        string? projectRootDirectoryId = null;
        if (_directoryRootOverride.Count == 0
            && !string.IsNullOrWhiteSpace(_projectRootDirectory)
            && DirectoryCallGraphBuilder.TryGetProjectRootDirectoryId(
                subgraph,
                _projectRootDirectory,
                out var resolvedProjectRootId))
        {
            useProjectPathLayout = true;
            projectRootDirectoryId = resolvedProjectRootId;
        }

        if (useProjectPathLayout)
        {
            var depths = DirectoryCallGraphBuilder.ComputePathLayoutDepths(
                subgraph,
                _projectRootDirectory!,
                projectRootDirectoryId);
            ApplyBoxContentSize(DiagramBoxLayoutEngine.LayoutLayered(_boxes, depths));
        }
        else if (string.IsNullOrEmpty(primaryRoot))
        {
            var depths = ComputeDirectoryDepths(subgraph);
            ApplyBoxContentSize(DiagramBoxLayoutEngine.LayoutLayered(_boxes, depths));
        }
        else
        {
            var orderedOutgoing = BuildOrderedOutgoing(subgraph.Outgoing);
            ApplyBoxContentSize(_layoutDirection == GraphLayoutDirection.TopToBottom
                ? DiagramBoxLayoutEngine.LayoutTopToBottomTree(
                    _boxes,
                    orderedOutgoing,
                    primaryRoot)
                : DiagramBoxLayoutEngine.LayoutLeftToRightTree(
                    _boxes,
                    orderedOutgoing,
                    primaryRoot));
        }
    }

    private static Dictionary<string, int> ComputeFileDepths(FileRelationGraphResult graph)
    {
        var nodeIds = graph.Files.Select(file => file.Id).ToList();
        var incomingCount = nodeIds.ToDictionary(id => id, _ => 0, StringComparer.OrdinalIgnoreCase);

        foreach (var edge in graph.Edges)
        {
            if (incomingCount.ContainsKey(edge.ToFileId))
            {
                incomingCount[edge.ToFileId]++;
            }
        }

        var queue = new Queue<string>(incomingCount.Where(pair => pair.Value == 0).Select(pair => pair.Key));
        if (queue.Count == 0)
        {
            // Pure cycle graph: put every node on the same layer to avoid infinite depth propagation.
            queue = new Queue<string>(nodeIds);
        }

        var depths = nodeIds.ToDictionary(id => id, _ => 0, StringComparer.OrdinalIgnoreCase);
        var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        while (queue.Count > 0)
        {
            var current = queue.Dequeue();
            if (!visited.Add(current))
            {
                continue;
            }

            if (!graph.Outgoing.TryGetValue(current, out var children))
            {
                continue;
            }

            foreach (var child in children)
            {
                if (!depths.ContainsKey(child))
                {
                    continue;
                }

                if (!visited.Contains(child))
                {
                    depths[child] = Math.Max(depths[child], depths[current] + 1);
                    queue.Enqueue(child);
                }
            }
        }

        return depths;
    }

    private IReadOnlyDictionary<string, List<string>> BuildOrderedOutgoing(
        IReadOnlyDictionary<string, List<string>> outgoing)
    {
        var ordered = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);

        foreach (var (fromId, children) in outgoing)
        {
            ordered[fromId] = children
                .Where(childId => _boxMap.ContainsKey(childId))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(childId => _boxMap[childId].Title, StringComparer.OrdinalIgnoreCase)
                .ThenBy(childId => childId, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        return ordered;
    }

    private static Dictionary<string, int> ComputeDirectoryDepths(DirectoryRelationGraphResult graph)
    {
        var nodeIds = graph.Directories.Select(directory => directory.Id).ToList();
        var incomingCount = nodeIds.ToDictionary(id => id, _ => 0, StringComparer.OrdinalIgnoreCase);

        foreach (var edge in graph.Edges)
        {
            if (incomingCount.ContainsKey(edge.ToDirectoryId))
            {
                incomingCount[edge.ToDirectoryId]++;
            }
        }

        var queue = new Queue<string>(incomingCount.Where(pair => pair.Value == 0).Select(pair => pair.Key));
        if (queue.Count == 0)
        {
            queue = new Queue<string>(nodeIds);
        }

        var depths = nodeIds.ToDictionary(id => id, _ => 0, StringComparer.OrdinalIgnoreCase);
        var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        while (queue.Count > 0)
        {
            var current = queue.Dequeue();
            if (!visited.Add(current))
            {
                continue;
            }

            if (!graph.Outgoing.TryGetValue(current, out var children))
            {
                continue;
            }

            foreach (var child in children)
            {
                if (!depths.ContainsKey(child))
                {
                    continue;
                }

                if (!visited.Contains(child))
                {
                    depths[child] = Math.Max(depths[child], depths[current] + 1);
                    queue.Enqueue(child);
                }
            }
        }

        return depths;
    }

    private void BuildClassDiagram(ProjectStructureResult structure, bool inheritanceOnly)
    {
        var allRelations = structure.Relations
            .Where(relation => inheritanceOnly
                ? relation.Kind == StructureRelationKind.Inheritance
                : relation.Kind is StructureRelationKind.Inheritance or StructureRelationKind.Implementation)
            .ToList();

        List<StructureRelationEdge> relations;
        var typeIds = new HashSet<string>(StringComparer.Ordinal);

        if (_focusedTypeId is not null && structure.TypeMap.ContainsKey(_focusedTypeId))
        {
            // Show focused type and its 1-hop neighbors via any relation.
            typeIds.Add(_focusedTypeId);
            foreach (var relation in structure.Relations)
            {
                if (relation.FromId == _focusedTypeId || relation.ToId == _focusedTypeId)
                {
                    typeIds.Add(relation.FromId);
                    typeIds.Add(relation.ToId);
                }
            }

            relations = allRelations
                .Where(r => typeIds.Contains(r.FromId) && typeIds.Contains(r.ToId))
                .ToList();
        }
        else
        {
            relations = allRelations;

            foreach (var relation in relations)
            {
                typeIds.Add(relation.FromId);
                typeIds.Add(relation.ToId);
            }

            if (!inheritanceOnly)
            {
                foreach (var type in structure.Types)
                {
                    typeIds.Add(type.Id);
                }
            }
        }

        foreach (var typeId in typeIds)
        {
            if (!structure.TypeMap.TryGetValue(typeId, out var type))
            {
                continue;
            }

            var box = UmlClassDiagramRenderer.CreateBox(type);
            _boxes.Add(box);
            _boxMap[box.Id] = box;
        }

        foreach (var relation in relations)
        {
            if (!_boxMap.ContainsKey(relation.FromId) || !_boxMap.ContainsKey(relation.ToId))
            {
                continue;
            }

            _edges.Add(new DiagramEdge
            {
                FromId = relation.FromId,
                ToId = relation.ToId,
                Label = string.Empty,
                RelationKind = relation.Kind
            });
        }

        var depths = ComputeTypeDepths(_boxMap.Keys, relations);

        var clusteringEdges = inheritanceOnly
            ? _edges
            : _edges.Concat(
                    structure.Relations
                        .Where(relation => relation.Kind == StructureRelationKind.Dependency)
                        .Select(relation => new DiagramEdge
                        {
                            FromId = relation.FromId,
                            ToId = relation.ToId,
                            Label = string.Empty,
                            RelationKind = relation.Kind
                        }))
                .ToList();

        ApplyBoxContentSize(UmlClassDiagramRenderer.Layout(_boxes, depths, clusteringEdges));
    }

    private void BuildDataFlow(CallGraphResult callGraph, string? rootNodeId)
    {
        var flow = DataFlowDiagramBuilder.Build(callGraph, rootNodeId);
        foreach (var node in flow.Nodes)
        {
            var box = new DiagramBoxNode
            {
                Id = node.Id,
                Title = node.DisplayName,
                Subtitle = "함수",
                Lines = [node.FullName, "→ 호출/데이터 전달"]
            };
            _boxes.Add(box);
            _boxMap[box.Id] = box;
        }

        foreach (var edge in flow.Edges)
        {
            _edges.Add(new DiagramEdge
            {
                FromId = edge.FromId,
                ToId = edge.ToId,
                Label = edge.Label
            });
        }

        var root = rootNodeId ?? flow.Nodes.FirstOrDefault()?.Id ?? string.Empty;
        ApplyBoxContentSize(string.IsNullOrEmpty(root)
            ? DiagramBoxLayoutEngine.LayoutLayered(_boxes, _boxes.ToDictionary(box => box.Id, _ => 0))
            : _layoutDirection == GraphLayoutDirection.TopToBottom
                ? DiagramBoxLayoutEngine.LayoutTopToBottomTree(_boxes, flow.Outgoing, root)
                : DiagramBoxLayoutEngine.LayoutLeftToRightTree(_boxes, flow.Outgoing, root));
    }

    private static Dictionary<string, int> ComputeTypeDepths(
        IEnumerable<string> typeIds,
        IReadOnlyList<StructureRelationEdge> relations)
    {
        var inheritance = relations
            .Where(relation => relation.Kind is StructureRelationKind.Inheritance or StructureRelationKind.Implementation)
            .ToList();

        var parents = inheritance
            .GroupBy(relation => relation.FromId)
            .ToDictionary(group => group.Key, group => group.Select(edge => edge.ToId).ToList(), StringComparer.Ordinal);

        var depths = typeIds.ToDictionary(id => id, _ => 0, StringComparer.Ordinal);
        var changed = true;

        while (changed)
        {
            changed = false;
            foreach (var (id, parentList) in parents)
            {
                if (!depths.ContainsKey(id))
                {
                    continue;
                }

                foreach (var parent in parentList)
                {
                    if (!depths.TryGetValue(parent, out var parentDepth))
                    {
                        depths[parent] = 0;
                        parentDepth = 0;
                    }

                    var next = parentDepth + 1;
                    if (depths[id] < next)
                    {
                        depths[id] = next;
                        changed = true;
                    }
                }
            }
        }

        return depths;
    }

    private Size ComputeSequenceSize(SequenceDiagramResult? sequence) =>
        UmlSequenceDiagramRenderer.Measure(sequence);

    private void DrawSequence(Graphics graphics)
    {
        if (_sequence is null || _sequence.ParticipantIds.Count == 0)
        {
            DrawMessage(graphics, "시퀀스 다이어그램을 표시할 호출 경로가 없습니다.\n루트 메서드에서 시작 함수를 선택하세요.");
            return;
        }

        if (!string.IsNullOrWhiteSpace(_sequence.TruncationNote))
        {
            using var noteFont = new Font(Font.FontFamily, 8.25f, FontStyle.Italic);
            using var noteBrush = new SolidBrush(Color.FromArgb(120, 90, 0));
            graphics.DrawString(_sequence.TruncationNote, noteFont, noteBrush, 12, 6);
        }

        UmlSequenceDiagramRenderer.Draw(graphics, _sequence);
    }

    private List<DiagramEdgeArrow> DrawFlowStyleEdgeBodies(Graphics graphics)
    {
        var arrows = new List<DiagramEdgeArrow>(_edges.Count);
        foreach (var edge in _edges)
        {
            if (!_boxMap.TryGetValue(edge.FromId, out var from) || !_boxMap.TryGetValue(edge.ToId, out var to))
            {
                continue;
            }

            var (color, dashStyle) = GetFlowStyleEdgeStyle(edge);
            var arrow = DiagramConnectionDrawer.DrawSideEdge(
                graphics,
                from,
                to,
                _lineStyle,
                color,
                width: 1.8f,
                dashStyle,
                _layoutDirection,
                preferLayoutAnchors: true);
            if (arrow is not null)
            {
                arrows.Add(arrow.Value);
            }
        }

        return arrows;
    }

    private void DrawFlowStyleBoxes(Graphics graphics, bool includeHighlight = true)
    {
        foreach (var box in _boxes)
        {
            if (IsContainerRelationView())
            {
                if (includeHighlight)
                {
                    var isCurrent = _currentHighlightId is not null
                        && string.Equals(box.Id, _currentHighlightId, StringComparison.Ordinal);
                    var isMatch = _highlightIds.Contains(box.Id);
                    FileRelationDiagramRenderer.DrawFileBox(graphics, box, isMatch, isCurrent);
                }
                else
                {
                    FileRelationDiagramRenderer.DrawFileBox(graphics, box, isHighlight: false, isCurrent: false);
                }
            }
            else if (includeHighlight)
            {
                DrawBox(graphics, box);
            }
            else
            {
                DrawBox(graphics, box, includeHighlight: false, isHighlight: false, isCurrent: false);
            }
        }
    }

    private void DrawFlowStyleEdgeLabels(Graphics graphics)
    {
        using var font = IsContainerRelationView()
            ? new Font("Segoe UI", 7.5f, FontStyle.Bold)
            : new Font(Font.FontFamily, 7.5f);
        using var brush = new SolidBrush(
            IsContainerRelationView()
                ? Color.FromArgb(52, 73, 94)
                : Color.FromArgb(80, 90, 110));
        var occupied = new List<RectangleF>();

        foreach (var edge in _edges)
        {
            var label = ResolveFlowEdgeLabel(edge);
            if (string.IsNullOrWhiteSpace(label)
                || !_boxMap.TryGetValue(edge.FromId, out var from)
                || !_boxMap.TryGetValue(edge.ToId, out var to))
            {
                continue;
            }

            var connection = DiagramConnectionDrawer.ResolveConnection(from, to, _layoutDirection, preferLayoutAnchors: true);
            var route = DiagramConnectionDrawer.BuildRoutePoints(connection, _lineStyle, _layoutDirection);
            var labelSize = DiagramEdgeLabelPlacer.MeasureLabel(graphics, label, font);
            var position = DiagramEdgeLabelPlacer.FindPosition(route, labelSize, occupied);
            DiagramEdgeLabelPlacer.DrawLabel(graphics, label, font, brush, position);
        }
    }

    private string ResolveFlowEdgeLabel(DiagramEdge edge)
    {
        if (IsContainerRelationView() && edge.CallCount is int callCount)
        {
            return RelationEdgeLabels.FormatCallCount(callCount);
        }

        return edge.Label;
    }

    private (Color Color, DashStyle DashStyle) GetFlowStyleEdgeStyle(DiagramEdge edge)
    {
        if (IsContainerRelationView())
        {
            return (Color.FromArgb(52, 73, 94), DashStyle.Solid);
        }

        var color = edge.RelationKind switch
        {
            StructureRelationKind.Inheritance => Color.FromArgb(39, 174, 96),
            StructureRelationKind.Implementation => Color.FromArgb(142, 68, 173),
            StructureRelationKind.Dependency => Color.FromArgb(127, 140, 141),
            _ => Color.FromArgb(52, 96, 145)
        };

        var dashStyle = edge.RelationKind is StructureRelationKind.Implementation or StructureRelationKind.Dependency
            ? DashStyle.Dash
            : DashStyle.Solid;

        return (color, dashStyle);
    }

    private void DrawBox(Graphics graphics, DiagramBoxNode box) =>
        DrawBox(graphics, box, includeHighlight: true);

    private void DrawBox(Graphics graphics, DiagramBoxNode box, bool includeHighlight, bool? isHighlight = null, bool? isCurrent = null)
    {
        var resolvedCurrent = isCurrent ?? (_currentHighlightId is not null && string.Equals(box.Id, _currentHighlightId, StringComparison.Ordinal));
        var resolvedMatch = isHighlight ?? (includeHighlight && _highlightIds.Contains(box.Id));

        var fill = resolvedCurrent
            ? Color.FromArgb(255, 236, 179)
            : resolvedMatch
                ? Color.FromArgb(255, 249, 219)
                : Color.FromArgb(248, 250, 255);
        var border = resolvedCurrent
            ? Color.FromArgb(230, 126, 34)
            : Color.FromArgb(74, 108, 155);

        using var fillBrush = new SolidBrush(fill);
        using var borderPen = new Pen(border, resolvedCurrent ? 2.5f : 1.6f);
        using var titleFont = new Font(Font.FontFamily, 9f, FontStyle.Bold);
        using var subFont = new Font(Font.FontFamily, 7.5f);
        using var textBrush = new SolidBrush(Color.FromArgb(35, 45, 60));

        graphics.FillRectangle(fillBrush, box.Bounds);
        graphics.DrawRectangle(borderPen, box.Bounds);
        graphics.DrawString(box.Title, titleFont, textBrush, box.Bounds.Left + 8, box.Bounds.Top + 6);
        graphics.DrawString(box.Subtitle, subFont, Brushes.DimGray, box.Bounds.Right - 56, box.Bounds.Top + 8);

        var y = box.Bounds.Top + 24;
        foreach (var line in box.Lines.Take(6))
        {
            var text = line.Length > 28 ? line[..25] + "..." : line;
            graphics.DrawString(text, subFont, textBrush, box.Bounds.Left + 8, y);
            y += 14;
        }
    }

    private void DrawEdge(Graphics graphics, DiagramEdge edge)
    {
        if (!_boxMap.TryGetValue(edge.FromId, out var from) || !_boxMap.TryGetValue(edge.ToId, out var to))
        {
            return;
        }

        Point start, end;
        if (_layoutDirection == GraphLayoutDirection.LeftToRight)
        {
            start = new Point(from.Bounds.Right, from.Bounds.Top + from.Bounds.Height / 2);
            end = new Point(to.Bounds.Left, to.Bounds.Top + to.Bounds.Height / 2);
        }
        else
        {
            start = new Point(from.Bounds.Left + from.Bounds.Width / 2, from.Bounds.Bottom);
            end = new Point(to.Bounds.Left + to.Bounds.Width / 2, to.Bounds.Top);
        }

        var color = edge.RelationKind switch
        {
            StructureRelationKind.Inheritance => Color.FromArgb(39, 174, 96),
            StructureRelationKind.Implementation => Color.FromArgb(142, 68, 173),
            StructureRelationKind.Dependency => Color.FromArgb(127, 140, 141),
            _ => Color.FromArgb(74, 108, 155)
        };

        using var pen = new Pen(color, 1.6f);
        if (edge.RelationKind == StructureRelationKind.Implementation || edge.RelationKind == StructureRelationKind.Dependency)
        {
            pen.DashStyle = System.Drawing.Drawing2D.DashStyle.Dash;
        }

        switch (_lineStyle)
        {
            case ConnectionLineStyle.Bezier:
                DrawBezierEdge(graphics, pen, start, end);
                break;
            case ConnectionLineStyle.Orthogonal:
                DrawOrthogonalEdge(graphics, pen, start, end);
                break;
            default:
                graphics.DrawLine(pen, start, end);
                break;
        }

        DrawArrowHead(graphics, pen, start.X, start.Y, end.X, end.Y);

        if (!string.IsNullOrWhiteSpace(edge.Label))
        {
            using var font = new Font(Font.FontFamily, 7.5f);
            graphics.DrawString(edge.Label, font, Brushes.DimGray, (start.X + end.X) / 2f, (start.Y + end.Y) / 2f - 12);
        }
    }

    private static void DrawBezierEdge(Graphics graphics, Pen pen, Point start, Point end)
    {
        var signedDx = end.X - start.X;
        var signedDy = end.Y - start.Y;
        var dx = Math.Abs(signedDx);
        var dy = Math.Abs(signedDy);
        var rawOff = Math.Max(36, Math.Max(dx, dy) / 2);

        Point c1, c2;
        if (dx >= dy)
        {
            var off = Math.Max(1, Math.Min(rawOff, dx / 2));
            var sign = signedDx >= 0 ? 1 : -1;
            c1 = new Point(start.X + sign * off, start.Y);
            c2 = new Point(end.X - sign * off, end.Y);
        }
        else
        {
            var off = Math.Max(1, Math.Min(rawOff, dy / 2));
            var sign = signedDy >= 0 ? 1 : -1;
            c1 = new Point(start.X, start.Y + sign * off);
            c2 = new Point(end.X, end.Y - sign * off);
        }
        graphics.DrawBezier(pen, start, c1, c2, end);
    }

    private static void DrawOrthogonalEdge(Graphics graphics, Pen pen, Point start, Point end)
    {
        var midX = (start.X + end.X) / 2;
        var midY = (start.Y + end.Y) / 2;
        var dx = Math.Abs(end.X - start.X);
        var dy = Math.Abs(end.Y - start.Y);
        if (dy >= dx)
        {
            graphics.DrawLines(pen, new Point[] { start, new Point(start.X, midY), new Point(end.X, midY), end });
        }
        else
        {
            graphics.DrawLines(pen, new Point[] { start, new Point(midX, start.Y), new Point(midX, end.Y), end });
        }
    }

    private static void DrawArrowHead(Graphics graphics, Pen pen, int x1, int y1, int x2, int y2)
    {
        if (x1 == x2 && y1 == y2)
        {
            return;
        }

        var dx = x2 - x1;
        var dy = y2 - y1;
        var len = MathF.Sqrt(dx * dx + dy * dy);
        if (len < 1f)
        {
            return;
        }

        var ux = dx / len;
        var uy = dy / len;
        var tipX = x2;
        var tipY = y2;
        graphics.DrawLine(pen, tipX, tipY, (int)(tipX - ux * 8 - uy * 4), (int)(tipY - uy * 8 + ux * 4));
        graphics.DrawLine(pen, tipX, tipY, (int)(tipX - ux * 8 + uy * 4), (int)(tipY - uy * 8 - ux * 4));
    }

    private void DrawMessage(Graphics graphics, string message)
    {
        DrawMultilineMessage(graphics, message);
    }

    private void DrawMultilineMessage(Graphics graphics, string message)
    {
        using var font = new Font(Font.FontFamily, 10f);
        using var brush = new SolidBrush(Color.FromArgb(80, 90, 110));
        var lines = message.Split('\n');
        var lineHeight = font.Height + 4;
        var totalHeight = lines.Length * lineHeight;
        var y = Math.Max(24, (Height - totalHeight) / 2);

        foreach (var line in lines)
        {
            var size = graphics.MeasureString(line, font);
            var x = Math.Max(12, (Width - size.Width) / 2f);
            graphics.DrawString(line, font, brush, x, y);
            y += lineHeight;
        }
    }

    private void ApplyBoxContentSize(Size layoutSize)
    {
        _contentSize = DiagramZoomController.InflateContentSize(
            layoutSize,
            _boxes.Select(box => box.Bounds));
        _zoom.ApplyContentSize(this, _contentSize);
    }

    private void ApplySequenceContentSize(SequenceDiagramResult? sequence)
    {
        var measured = ComputeSequenceSize(sequence);
        _contentSize = new Size(measured.Width, measured.Height + 64);
        _zoom.ApplyContentSize(this, _contentSize);
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        _zoom.ApplyContentSize(this, _contentSize);
    }

    private void InvalidateDiagramSurface() => Invalidate(ClientRectangle);
}
