using System.Runtime.CompilerServices;
using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

public sealed class CallGraphViewer : UserControl
{
    private readonly HashSet<string> _collapsedNodeIds = new(StringComparer.Ordinal);
    private CallGraphResult? _graph;
    private IReadOnlyList<string> _rootNodeIds = [];
    private GraphLayoutDirection _layoutDirection = GraphLayoutDirection.LeftToRight;
    private ConnectionLineStyle _lineStyle = ConnectionLineStyle.Orthogonal;
    private List<GraphVisualNode> _roots = [];
    private Size _contentSize = new(400, 300);
    private int _visualNodeCount;
    private bool _visualTreeTruncated;
    private bool _isAnalyzing;
    private readonly HashSet<string> _searchMatchNodeIds = new(StringComparer.Ordinal);
    private string? _currentSearchNodeId;
    private readonly System.Windows.Forms.Timer _analysisAnimationTimer;
    private float _hourglassSandProgress;
    private float _hourglassFlipAngle;
    private HourglassAnimationPhase _hourglassPhase = HourglassAnimationPhase.Draining;
    private readonly DiagramZoomController _zoom = new();
    private readonly DiagramScrollPan _pan = new();
    private bool _buildError;
    private string? _hubTargetNodeId;
    private GraphVisualNode? _hubTargetNode;
    private int _rebuildGeneration;
    private string? _lastVisualBuildKey;
    private bool _suppressResizeContentSizing;
    private Image? _hourglassGifImage;
    private bool _hourglassGifLoadAttempted;
    private readonly EventHandler _hourglassGifFrameChangedHandler;

    private enum HourglassAnimationPhase
    {
        Draining,
        Flipping
    }

    public CallGraphViewer()
    {
        DoubleBuffered = true;
        SetStyle(ControlStyles.ResizeRedraw, true);
        BackColor = Color.White;
        AutoScroll = true;

        _analysisAnimationTimer = new System.Windows.Forms.Timer { Interval = 50 };
        _analysisAnimationTimer.Tick += AnalysisAnimationTimer_Tick;
        _hourglassGifFrameChangedHandler = (_, _) => Invalidate();
    }

    private void AnalysisAnimationTimer_Tick(object? sender, EventArgs e)
    {
        if (!_isAnalyzing)
        {
            return;
        }

        switch (_hourglassPhase)
        {
            case HourglassAnimationPhase.Draining:
                _hourglassSandProgress = Math.Min(1f, _hourglassSandProgress + 0.028f);
                if (_hourglassSandProgress >= 1f)
                {
                    _hourglassPhase = HourglassAnimationPhase.Flipping;
                }

                break;

            case HourglassAnimationPhase.Flipping:
                _hourglassFlipAngle = Math.Min(180f, _hourglassFlipAngle + 14f);
                if (_hourglassFlipAngle >= 180f)
                {
                    _hourglassFlipAngle = 0f;
                    _hourglassSandProgress = 0f;
                    _hourglassPhase = HourglassAnimationPhase.Draining;
                }

                break;
        }

        Invalidate();
    }

    private void StartAnalysisAnimation()
    {
        _hourglassSandProgress = 0f;
        _hourglassFlipAngle = 0f;
        _hourglassPhase = HourglassAnimationPhase.Draining;
        _analysisAnimationTimer.Start();
    }

    private void StopAnalysisAnimation()
    {
        _analysisAnimationTimer.Stop();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _analysisAnimationTimer.Stop();
            _analysisAnimationTimer.Dispose();
            if (_hourglassGifImage is not null)
            {
                ImageAnimator.StopAnimate(_hourglassGifImage, _hourglassGifFrameChangedHandler);
                _hourglassGifImage.Dispose();
                _hourglassGifImage = null;
            }
        }

        base.Dispose(disposing);
    }

    public GraphLayoutDirection LayoutDirection
    {
        get => _layoutDirection;
        set
        {
            _layoutDirection = value;
            RebuildVisualTree();
        }
    }

    public ConnectionLineStyle LineStyle
    {
        get => _lineStyle;
        set
        {
            _lineStyle = value;
            _zoom.InvalidateCache();
            Invalidate();
        }
    }

    public event Action<CallGraphNode>? RootNodeChanged;

    public IReadOnlyList<string> RootNodeIds => _rootNodeIds;

    internal bool SuppressResizeContentSizing
    {
        get => _suppressResizeContentSizing;
        set => _suppressResizeContentSizing = value;
    }

    public void SetGraph(CallGraphResult? graph, string? rootNodeId)
    {
        SetGraph(graph, string.IsNullOrWhiteSpace(rootNodeId) ? [] : [rootNodeId]);
    }

    public void SetGraph(CallGraphResult? graph, IReadOnlyList<string> rootNodeIds)
    {
        PrepareSetGraph(graph, rootNodeIds);
        _ = RebuildVisualTreeAsync();
    }

    public Task SetGraphAsync(CallGraphResult? graph, IReadOnlyList<string> rootNodeIds)
    {
        PrepareSetGraph(graph, rootNodeIds);
        return RebuildVisualTreeAsync();
    }

    private void PrepareSetGraph(CallGraphResult? graph, IReadOnlyList<string> rootNodeIds)
    {
        _isAnalyzing = false;
        _buildError = false;
        ViewFailureReporter.Clear(this);
        _graph = graph;
        _rootNodeIds = rootNodeIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.Ordinal)
            .ToList();
        _hubTargetNodeId = null;
        _hubTargetNode = null;
        _collapsedNodeIds.Clear();
        _lastVisualBuildKey = null;
        ClearSearchHighlight();
        _zoom.Reset();
        StopAnalysisAnimation();
        if (!UseWaitCursor) Cursor = Cursors.Default;
    }

    public void SetGlobalVariableAccessGraph(
        CallGraphResult graph,
        IReadOnlyList<string> accessorNodeIds,
        string targetNodeId)
    {
        _isAnalyzing = false;
        _buildError = false;
        ViewFailureReporter.Clear(this);
        _graph = graph;
        _hubTargetNodeId = targetNodeId;
        _hubTargetNode = null;
        _rootNodeIds = accessorNodeIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Where(id => !string.Equals(id, targetNodeId, StringComparison.Ordinal))
            .Distinct(StringComparer.Ordinal)
            .ToList();
        _collapsedNodeIds.Clear();
        ClearSearchHighlight();
        _zoom.Reset();
        StopAnalysisAnimation();
        if (!UseWaitCursor) Cursor = Cursors.Default;

        _ = RebuildVisualTreeAsync();
    }

    public void BeginAnalysis()
    {
        _zoom.Reset();
        _isAnalyzing = true;
        _buildError = false;
        ViewFailureReporter.Clear(this);
        _graph = null;
        _rootNodeIds = [];
        _hubTargetNodeId = null;
        _hubTargetNode = null;
        _roots = [];
        _collapsedNodeIds.Clear();
        ClearSearchHighlight();
        _contentSize = new Size(400, 300);
        _zoom.ApplyContentSize(this, _contentSize);
        AutoScrollPosition = new Point(0, 0);
        StartAnalysisAnimation();
        Invalidate();
    }

    public void EndAnalysis()
    {
        _isAnalyzing = false;
        StopAnalysisAnimation();
        Invalidate();
    }

    public void ResetView()
    {
        _zoom.Reset();
        _zoom.ApplyContentSize(this, _contentSize);
        AutoScrollPosition = new Point(0, 0);
        Invalidate();
    }

    public void ExpandAll()
    {
        if (_collapsedNodeIds.Count == 0)
        {
            return;
        }

        _collapsedNodeIds.Clear();
        _lastVisualBuildKey = null;
        RebuildVisualTree();
    }

    public void CollapseAll()
    {
        if (_graph is null)
        {
            return;
        }

        _collapsedNodeIds.Clear();
        foreach (var node in _graph.Nodes)
        {
            if (_graph.Outgoing.TryGetValue(node.Id, out var children) && children.Count > 0)
            {
                _collapsedNodeIds.Add(node.Id);
            }
        }

        RebuildVisualTree();
    }

    public void ClearSearchHighlight()
    {
        _searchMatchNodeIds.Clear();
        _currentSearchNodeId = null;
        _zoom.InvalidateCache();
        Invalidate();
    }

    public void SetSearchHighlight(IEnumerable<string> matchNodeIds, string? currentNodeId)
    {
        _searchMatchNodeIds.Clear();
        foreach (var nodeId in matchNodeIds)
        {
            _searchMatchNodeIds.Add(nodeId);
        }

        _currentSearchNodeId = currentNodeId;
        _zoom.InvalidateCache();
        Invalidate();
    }

    public bool SetRootNode(string nodeId)
    {
        if (_graph is null || !_graph.NodeMap.TryGetValue(nodeId, out var node))
        {
            return false;
        }

        _rootNodeIds = [nodeId];
        _collapsedNodeIds.Clear();
        RebuildVisualTree();
        ScrollToNode(nodeId);
        RootNodeChanged?.Invoke(node);
        return true;
    }

    public bool TryFocusNode(string nodeId)
    {
        if (_graph is null || !_graph.NodeMap.ContainsKey(nodeId))
        {
            return false;
        }

        if (_rootNodeIds.Count == 0)
        {
            return SetRootNode(nodeId);
        }

        foreach (var rootId in _rootNodeIds)
        {
            if (string.Equals(rootId, nodeId, StringComparison.Ordinal))
            {
                RebuildVisualTree();
                ScrollToNode(nodeId);
                return true;
            }

            var path = FindPath(_graph, rootId, nodeId);
            if (path is null)
            {
                continue;
            }

            foreach (var id in path.SkipLast(1))
            {
                _collapsedNodeIds.Remove(id);
            }

            RebuildVisualTree();
            ScrollToNode(nodeId);
            return true;
        }

        return SetRootNode(nodeId);
    }

    private static List<string>? FindPath(CallGraphResult graph, string rootId, string targetId)
    {
        if (string.Equals(rootId, targetId, StringComparison.Ordinal))
        {
            return [rootId];
        }

        var queue = new Queue<List<string>>();
        queue.Enqueue([rootId]);
        var visited = new HashSet<string>(StringComparer.Ordinal) { rootId };

        while (queue.Count > 0)
        {
            var path = queue.Dequeue();
            var currentId = path[^1];

            if (!graph.Outgoing.TryGetValue(currentId, out var children))
            {
                continue;
            }

            foreach (var childId in children)
            {
                if (!visited.Add(childId))
                {
                    continue;
                }

                var nextPath = new List<string>(path) { childId };
                if (string.Equals(childId, targetId, StringComparison.Ordinal))
                {
                    return nextPath;
                }

                queue.Enqueue(nextPath);
            }
        }

        return null;
    }

    private void ScrollToNode(string nodeId)
    {
        foreach (var node in EnumerateVisualNodes())
        {
            if (!string.Equals(node.Data.Id, nodeId, StringComparison.Ordinal))
            {
                continue;
            }

            var bounds = node.Bounds;
            if (IsHandleCreated)
            {
                BeginInvoke(() => _zoom.ScrollToDocumentPoint(this, bounds.Location, _contentSize));
            }
            else
            {
                _zoom.ScrollToDocumentPoint(this, bounds.Location, _contentSize);
            }

            InvalidateDiagramSurface();
            return;
        }
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

    protected override void OnPaint(PaintEventArgs e)
    {
        if (_isAnalyzing)
        {
            DrawPlaceholder(e.Graphics);
            return;
        }

        if (_buildError)
        {
            DrawFailurePlaceholder(e.Graphics);
            return;
        }

        if (_graph is null || _roots.Count == 0)
        {
            DrawPlaceholder(e.Graphics);
            return;
        }

        try
        {
            _zoom.PaintDocument(e.Graphics, this, e.ClipRectangle, _contentSize, BackColor, DrawCallGraphContent);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
        {
            ViewFailureReporter.Report(this, DiagramViewDisplayNames.Get(DiagramViewKind.CallGraph), "표시", ex);
            DrawMultilinePlaceholder(
                e.Graphics,
                ViewFailureReporter.FormatCanvasMessage(ex, "호출 그래프 표시"));
        }
    }

    private void DrawCallGraphContent(Graphics graphics)
    {
        graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        if (_hubTargetNode is not null)
        {
            foreach (var root in _roots)
            {
                DrawConnectionEdge(graphics, root, _hubTargetNode);
            }
        }
        else
        {
            foreach (var node in CallGraphLayoutEngine.EnumerateNodes(_roots))
            {
                DrawEdge(graphics, node);
            }
        }

        foreach (var node in EnumerateVisualNodes())
        {
            DrawNode(graphics, node);
        }
    }

    public Bitmap? ExportToBitmap()
    {
        if (_graph is null || _roots.Count == 0)
        {
            return null;
        }

        var w = Math.Max(1, _contentSize.Width);
        var h = Math.Max(1, _contentSize.Height);
        var bmp = new Bitmap(w, h, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        g.Clear(Color.Transparent);

        if (_hubTargetNode is not null)
        {
            foreach (var root in _roots)
            {
                DrawConnectionEdge(g, root, _hubTargetNode);
            }
        }
        else
        {
            foreach (var node in CallGraphLayoutEngine.EnumerateNodes(_roots))
            {
                DrawEdge(g, node);
            }
        }

        foreach (var node in EnumerateVisualNodes())
        {
            DrawNode(g, node);
        }

        return bmp;
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (_isAnalyzing || _graph is null)
        {
            return;
        }

        _pan.Begin(e, this);
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        var blockSelection = _pan.End(this);
        base.OnMouseUp(e);

        if (blockSelection || e.Button != MouseButtons.Left || _isAnalyzing || _graph is null)
        {
            return;
        }

        if (TryHitToggle(e.Location, out var toggleNodeId))
        {
            ToggleNode(toggleNodeId);
            return;
        }

        if (TryHitNode(e.Location, out var nodeId))
        {
            if (!string.IsNullOrWhiteSpace(_hubTargetNodeId))
            {
                ScrollToNode(nodeId);
            }
            else
            {
                SetRootNode(nodeId);
            }
        }
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

    protected override void OnMouseDoubleClick(MouseEventArgs e)
    {
        if (_pan.ShouldBlockClick(e.Location))
        {
            return;
        }

        _pan.AcknowledgeClick();
        base.OnMouseDoubleClick(e);

        if (e.Button != MouseButtons.Left)
        {
            return;
        }

        if (TryHitToggle(e.Location, out var toggleNodeId))
        {
            ToggleNode(toggleNodeId);
            return;
        }

        if (TryHitNode(e.Location, out var nodeId)
            && _graph?.NodeMap.TryGetValue(nodeId, out var node) == true)
        {
            SourceFileOpener.TryOpen(node.FilePath, node.LineNumber);
        }
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        if (_pan.HandleMove(e, this, _zoom, _contentSize))
        {
            InvalidateDiagramSurface();
            return;
        }

        base.OnMouseMove(e);

        if (_isAnalyzing || _graph is null)
        {
            if (!UseWaitCursor) Cursor = Cursors.Default;
            return;
        }

        Cursor = TryHitToggle(e.Location, out _) || TryHitNode(e.Location, out _)
            ? Cursors.Hand
            : (UseWaitCursor ? Cursors.WaitCursor : Cursors.Default);
    }

    private bool TryHitToggle(Point clientPoint, out string nodeId)
    {
        nodeId = string.Empty;
        var documentPoint = ClientToDocument(clientPoint);

        foreach (var node in CallGraphLayoutEngine.EnumerateNodes(_roots))
        {
            if (!node.HasChildren)
            {
                continue;
            }

            var hitBounds = Rectangle.Inflate(node.ToggleBounds, 4, 4);
            if (hitBounds.Contains(documentPoint))
            {
                nodeId = node.Data.Id;
                return true;
            }
        }

        return false;
    }

    private bool TryHitNode(Point clientPoint, out string nodeId)
    {
        nodeId = string.Empty;
        var documentPoint = ClientToDocument(clientPoint);

        foreach (var node in EnumerateVisualNodes())
        {
            if (!node.Bounds.Contains(documentPoint))
            {
                continue;
            }

            if (node.HasChildren)
            {
                var toggleHit = Rectangle.Inflate(node.ToggleBounds, 4, 4);
                if (toggleHit.Contains(documentPoint))
                {
                    continue;
                }
            }

            nodeId = node.Data.Id;
            return true;
        }

        return false;
    }

    private void ToggleNode(string nodeId)
    {
        if (_collapsedNodeIds.Contains(nodeId))
        {
            _collapsedNodeIds.Remove(nodeId);
        }
        else
        {
            _collapsedNodeIds.Add(nodeId);
        }

        _lastVisualBuildKey = null;
        _ = RebuildVisualTreeAsync();
    }

    private Point ClientToDocument(Point clientPoint) => _zoom.ClientToDocument(this, clientPoint);

    private void RebuildVisualTree() => _ = RebuildVisualTreeAsync();

    private async Task RebuildVisualTreeAsync()
    {
        var generation = ++_rebuildGeneration;
        var title = DiagramViewDisplayNames.Get(DiagramViewKind.CallGraph);
        var buildKey = CreateVisualBuildKey();

        if (buildKey == _lastVisualBuildKey && _roots.Count > 0 && !_buildError)
        {
            return;
        }

        _roots = [];
        _visualNodeCount = 0;
        _visualTreeTruncated = false;
        _buildError = false;
        ViewFailureReporter.Clear(this);

        if (_graph is null)
        {
            _hubTargetNode = null;
            _contentSize = new Size(400, 300);
            _zoom.ApplyContentSize(this, _contentSize);
            Invalidate();
            return;
        }

        var session = new CallGraphVisualBuildSession
        {
            Graph = _graph,
            RootNodeIds = _rootNodeIds,
            LayoutDirection = _layoutDirection,
            CollapsedNodeIds = _collapsedNodeIds,
            HubTargetNodeId = _hubTargetNodeId
        };

        try
        {
            var built = await ViewProgressRunner.RunBackgroundAsync(
                FindForm(),
                title,
                _ => CallGraphVisualBuilder.Build(session)).ConfigureAwait(true);

            if (generation != _rebuildGeneration || IsDisposed)
            {
                return;
            }

            ApplyVisualBuildSession(built);
            _lastVisualBuildKey = buildKey;
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
        {
            if (generation != _rebuildGeneration || IsDisposed)
            {
                return;
            }

            _buildError = true;
            _roots = [];
            _hubTargetNode = null;
            _contentSize = new Size(400, 300);
            _zoom.InvalidateCache();
            _zoom.ApplyContentSize(this, _contentSize);
            ViewFailureReporter.Report(this, title, "구성", ex);
            Invalidate();
        }
    }

    private void ApplyVisualBuildSession(CallGraphVisualBuildSession session)
    {
        _roots = session.Roots;
        _hubTargetNode = session.HubTargetNode;
        _visualNodeCount = session.VisualNodeCount;
        _visualTreeTruncated = session.VisualTreeTruncated;
        _buildError = session.BuildError;

        if (session.Error is not null)
        {
            _buildError = true;
            _roots = [];
            _hubTargetNode = null;
            _contentSize = new Size(400, 300);
            _zoom.InvalidateCache();
            _zoom.ApplyContentSize(this, _contentSize);
            ViewFailureReporter.Report(this, DiagramViewDisplayNames.Get(DiagramViewKind.CallGraph), "구성", session.Error);
            Invalidate();
            return;
        }

        _contentSize = session.ContentSize;
        _zoom.InvalidateCache();
        _zoom.ApplyContentSize(this, _contentSize);
        Invalidate();
    }

    private string? CreateVisualBuildKey()
    {
        if (_graph is null)
        {
            return null;
        }

        var roots = string.Join('\u001f', _rootNodeIds);
        var collapsed = string.Join(
            '\u001f',
            _collapsedNodeIds.OrderBy(id => id, StringComparer.Ordinal));
        return string.Join(
            '\u001e',
            RuntimeHelpers.GetHashCode(_graph),
            roots,
            _layoutDirection,
            _hubTargetNodeId ?? string.Empty,
            collapsed);
    }

    private IEnumerable<GraphVisualNode> EnumerateVisualNodes()
    {
        foreach (var node in CallGraphLayoutEngine.EnumerateNodes(_roots))
        {
            yield return node;
        }

        if (_hubTargetNode is not null)
        {
            yield return _hubTargetNode;
        }
    }

    private void DrawPlaceholder(Graphics graphics)
    {
        var state = graphics.Save();
        graphics.ResetTransform();

        if (_isAnalyzing)
        {
            DrawAnalyzingPlaceholder(graphics);
            graphics.Restore(state);
            return;
        }

        var message = _graph is null
            ? "분석을 실행하면 함수 호출 관계가 표시됩니다."
            : _visualTreeTruncated
                ? "표시 범위가 제한되었습니다. 노드를 펼치거나 시작 함수를 바꿔 보세요."
                : "시작 함수를 선택하세요.";

        using var font = new Font(Font.FontFamily, 10f);
        using var brush = new SolidBrush(Color.Gray);
        var size = graphics.MeasureString(message, font);
        graphics.DrawString(
            message,
            font,
            brush,
            Math.Max(20, (ClientSize.Width - size.Width) / 2),
            Math.Max(20, (ClientSize.Height - size.Height) / 2));

        graphics.Restore(state);
    }

    private void DrawFailurePlaceholder(Graphics graphics)
    {
        DrawMultilinePlaceholder(
            graphics,
            ViewFailureReporter.FormatCanvasMessage(
                ViewFailureReporter.GetLastException(this),
                "호출 그래프 구성"));
    }

    private void DrawMultilinePlaceholder(Graphics graphics, string message)
    {
        var state = graphics.Save();
        graphics.ResetTransform();

        using var font = new Font(Font.FontFamily, 10f);
        using var brush = new SolidBrush(Color.FromArgb(80, 90, 110));
        var lines = message.Split('\n');
        var lineHeight = font.Height + 4;
        var totalHeight = lines.Length * lineHeight;
        var y = Math.Max(24, (ClientSize.Height - totalHeight) / 2);

        foreach (var line in lines)
        {
            var size = graphics.MeasureString(line, font);
            var x = Math.Max(12, (ClientSize.Width - size.Width) / 2f);
            graphics.DrawString(line, font, brush, x, y);
            y += lineHeight;
        }

        graphics.Restore(state);
    }

    private void DrawAnalyzingPlaceholder(Graphics graphics)
    {
        using var overlay = new SolidBrush(Color.FromArgb(248, 249, 251));
        graphics.FillRectangle(overlay, 0, 0, ClientSize.Width, ClientSize.Height);

        using var titleFont = new Font(Font.FontFamily, 11f, FontStyle.Bold);
        using var subFont = new Font(Font.FontFamily, 9.5f);
        using var titleBrush = new SolidBrush(Color.FromArgb(60, 70, 85));
        using var subBrush = new SolidBrush(Color.FromArgb(110, 120, 135));

        const float hourglassSize = 72f;
        const string title = "백그라운드에서 분석 중...";
        const string subtitle = "잠시만 기다려 주세요.";

        var titleSize = graphics.MeasureString(title, titleFont);
        var subtitleSize = graphics.MeasureString(subtitle, subFont);

        var totalHeight = hourglassSize + 16 + titleSize.Height + 8 + subtitleSize.Height;
        var startY = Math.Max(20, (ClientSize.Height - totalHeight) / 2);
        var centerX = ClientSize.Width / 2f;
        var hourglassCenterY = startY + hourglassSize / 2f;
        DrawHourglassGlyph(graphics, centerX, hourglassCenterY, hourglassSize);

        graphics.DrawString(
            title,
            titleFont,
            titleBrush,
            centerX - titleSize.Width / 2,
            startY + hourglassSize + 16);

        graphics.DrawString(
            subtitle,
            subFont,
            subBrush,
            centerX - subtitleSize.Width / 2,
            startY + hourglassSize + 16 + titleSize.Height + 8);
    }

    private void DrawHourglassGlyph(Graphics graphics, float centerX, float centerY, float size)
    {
        var gif = EnsureHourglassGif();
        if (gif is null)
        {
            DrawAnimatedHourglass(graphics, centerX, centerY, size, _hourglassSandProgress, _hourglassFlipAngle);
            return;
        }

        ImageAnimator.UpdateFrames(gif);

        var targetW = (int)Math.Round(size);
        var targetH = (int)Math.Round(size);
        if (gif.Width > 0 && gif.Height > 0)
        {
            var ratio = Math.Min(size / gif.Width, size / gif.Height);
            targetW = Math.Max(1, (int)Math.Round(gif.Width * ratio));
            targetH = Math.Max(1, (int)Math.Round(gif.Height * ratio));
        }

        var dest = new Rectangle(
            (int)Math.Round(centerX - targetW / 2f),
            (int)Math.Round(centerY - targetH / 2f),
            targetW,
            targetH);
        graphics.DrawImage(gif, dest);
    }

    private Image? EnsureHourglassGif()
    {
        if (_hourglassGifLoadAttempted)
        {
            return _hourglassGifImage;
        }

        _hourglassGifLoadAttempted = true;

        try
        {
            var baseDir = AppContext.BaseDirectory;
            var candidate = Path.Combine(baseDir, "Assets", "HourGlasses.gif");
            if (!File.Exists(candidate))
            {
                var alt = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "Assets", "HourGlasses.gif"));
                candidate = File.Exists(alt) ? alt : candidate;
            }

            if (!File.Exists(candidate))
            {
                return null;
            }

            _hourglassGifImage = Image.FromFile(candidate);
            ImageAnimator.Animate(_hourglassGifImage, _hourglassGifFrameChangedHandler);
        }
        catch
        {
            _hourglassGifImage = null;
        }

        return _hourglassGifImage;
    }

    private static void DrawAnimatedHourglass(
        Graphics graphics,
        float centerX,
        float centerY,
        float size,
        float sandProgress,
        float flipAngle)
    {
        var state = graphics.Save();
        graphics.TranslateTransform(centerX, centerY);
        graphics.RotateTransform(flipAngle);
        graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        var halfWidth = size * 0.34f;
        var halfHeight = size * 0.46f;
        var neck = size * 0.06f;

        using var glassFill = new SolidBrush(Color.FromArgb(235, 240, 248));
        using var sandFill = new SolidBrush(Color.FromArgb(230, 162, 60));
        using var streamFill = new SolidBrush(Color.FromArgb(210, 140, 45));
        using var framePen = new Pen(Color.FromArgb(74, 108, 155), 2.5f);

        var topGlass = new[]
        {
            new PointF(-halfWidth, -halfHeight),
            new PointF(halfWidth, -halfHeight),
            new PointF(neck, 0),
            new PointF(-neck, 0)
        };
        var bottomGlass = new[]
        {
            new PointF(-neck, 0),
            new PointF(neck, 0),
            new PointF(halfWidth, halfHeight),
            new PointF(-halfWidth, halfHeight)
        };

        graphics.FillPolygon(glassFill, topGlass);
        graphics.FillPolygon(glassFill, bottomGlass);
        graphics.DrawPolygon(framePen, topGlass);
        graphics.DrawPolygon(framePen, bottomGlass);
        graphics.DrawLine(framePen, -halfWidth, -halfHeight, halfWidth, -halfHeight);
        graphics.DrawLine(framePen, -halfWidth, halfHeight, halfWidth, halfHeight);

        sandProgress = Math.Clamp(sandProgress, 0f, 1f);
        var topFill = 1f - sandProgress;
        var bottomFill = sandProgress;
        var inset = MathF.Max(1.5f, size * 0.01f);
        var topOuterY = -halfHeight + size * 0.08f;
        var topNeckY = -size * 0.02f;
        var bottomNeckY = size * 0.02f;
        var bottomOuterY = halfHeight - size * 0.08f;

        float ClampHalfWidth(float w, float minInsetScale = 1f)
            => Math.Max(inset * minInsetScale, w - inset);

        float HalfWidthAtY(float y, float outerY, float neckY)
        {
            var t = Math.Clamp((y - neckY) / Math.Max(0.001f, outerY - neckY), 0f, 1f);
            return neck + (halfWidth - neck) * t;
        }

        void DrawChamberSand(float fill, float outerY, float neckY)
        {
            if (fill <= 0.02f)
            {
                return;
            }

            // fill=0 -> surface at neck (empty), fill=1 -> surface at outer boundary (full)
            var surfaceY = neckY + (outerY - neckY) * fill;
            var halfWidthAtSurface = ClampHalfWidth(HalfWidthAtY(surfaceY, outerY, neckY));
            var halfWidthAtNeck = ClampHalfWidth(HalfWidthAtY(neckY, outerY, neckY), 0.5f);

            var sandPolygon = new[]
            {
                new PointF(-halfWidthAtSurface, surfaceY),
                new PointF(halfWidthAtSurface, surfaceY),
                new PointF(halfWidthAtNeck, neckY),
                new PointF(-halfWidthAtNeck, neckY)
            };
            graphics.FillPolygon(sandFill, sandPolygon);
        }

        // Top chamber drains (decreases), bottom chamber fills (increases) using the same geometry.
        DrawChamberSand(topFill, topOuterY, topNeckY);
        DrawChamberSand(bottomFill, bottomOuterY, bottomNeckY);

        if (sandProgress is > 0.03f and < 0.97f)
        {
            var streamWidth = neck * 0.35f;
            graphics.FillRectangle(streamFill, -streamWidth / 2f, -size * 0.02f, streamWidth, size * 0.06f);
        }

        graphics.Restore(state);
    }

    private void DrawNode(Graphics graphics, GraphVisualNode node)
    {
        var isRoot = _rootNodeIds.Count == 1
            && string.Equals(node.Data.Id, _rootNodeIds[0], StringComparison.Ordinal);
        var isCurrentMatch = _currentSearchNodeId is not null
            && string.Equals(node.Data.Id, _currentSearchNodeId, StringComparison.Ordinal);
        var isMatch = _searchMatchNodeIds.Contains(node.Data.Id);

        var fillColor = isRoot
            ? Color.FromArgb(225, 237, 252)
            : isCurrentMatch
            ? Color.FromArgb(255, 236, 179)
            : isMatch
                ? Color.FromArgb(255, 249, 219)
                : Color.FromArgb(245, 248, 252);
        var borderColor = isRoot
            ? Color.FromArgb(41, 128, 185)
            : isCurrentMatch
                ? Color.FromArgb(230, 126, 34)
                : isMatch
                    ? Color.FromArgb(241, 196, 15)
                    : Color.FromArgb(74, 108, 155);
        var borderWidth = isRoot ? 2.5f : isCurrentMatch ? 2.5f : isMatch ? 2f : 1.5f;

        using var fillBrush = new SolidBrush(fillColor);
        using var borderPen = new Pen(borderColor, borderWidth);
        using var textBrush = new SolidBrush(Color.FromArgb(30, 40, 55));
        using var subTextBrush = new SolidBrush(Color.FromArgb(100, 110, 125));
        using var font = new Font(Font.FontFamily, 9f, FontStyle.Bold);
        using var subFont = new Font(Font.FontFamily, 7.5f);

        var bounds = node.Bounds;
        graphics.FillRectangle(fillBrush, bounds);
        graphics.DrawRectangle(borderPen, bounds);

        const int textPadding = 8;
        var titleRect = new Rectangle(bounds.Left + textPadding, bounds.Top + 6, bounds.Width - textPadding * 2, 18);
        graphics.DrawString(node.Data.DisplayName, font, textBrush, titleRect, StringFormat.GenericDefault);

        var subtitle = node.Data.FullName;
        if (subtitle.Length > 28)
        {
            subtitle = subtitle[..25] + "...";
        }

        graphics.DrawString(
            subtitle,
            subFont,
            subTextBrush,
            new Rectangle(bounds.Left + textPadding, bounds.Top + 24, bounds.Width - textPadding * 2, 14));

        if (node.HasChildren)
        {
            DrawToggleButton(graphics, node);
        }
    }

    private void DrawToggleButton(Graphics graphics, GraphVisualNode node)
    {
        using var toggleBack = new SolidBrush(Color.FromArgb(74, 108, 155));
        using var toggleBorder = new Pen(Color.FromArgb(50, 80, 120));
        using var symbolBrush = new SolidBrush(Color.White);
        using var font = new Font(Font.FontFamily, 10f, FontStyle.Bold);

        graphics.FillRectangle(toggleBack, node.ToggleBounds);
        graphics.DrawRectangle(toggleBorder, node.ToggleBounds);

        var symbol = node.IsExpanded ? "−" : "+";
        var symbolSize = graphics.MeasureString(symbol, font);
        graphics.DrawString(
            symbol,
            font,
            symbolBrush,
            node.ToggleBounds.Left + (node.ToggleBounds.Width - symbolSize.Width) / 2,
            node.ToggleBounds.Top + (node.ToggleBounds.Height - symbolSize.Height) / 2);
    }

    private void DrawEdge(Graphics graphics, GraphVisualNode node)
    {
        if (node.Parent is null)
        {
            return;
        }

        DrawConnectionEdge(graphics, node.Parent, node);
    }

    private void DrawConnectionEdge(Graphics graphics, GraphVisualNode from, GraphVisualNode to)
    {
        using var pen = new Pen(Color.FromArgb(130, 145, 165), 1.6f);
        using var arrowCap = new System.Drawing.Drawing2D.AdjustableArrowCap(3.5f, 4f, isFilled: true);
        pen.CustomEndCap = arrowCap;
        var start = GetAnchorPoint(from, towardChild: true);
        var end = GetAnchorPoint(to, towardChild: false);

        switch (_lineStyle)
        {
            case ConnectionLineStyle.Straight:
                graphics.DrawLine(pen, start, end);
                break;
            case ConnectionLineStyle.Bezier:
                DrawBezier(graphics, pen, start, end);
                break;
            default:
                DrawOrthogonal(graphics, pen, start, end);
                break;
        }
    }

    private Point GetAnchorPoint(GraphVisualNode node, bool towardChild)
    {
        var bounds = node.Bounds;

        if (_layoutDirection == GraphLayoutDirection.LeftToRight)
        {
            if (towardChild && node.HasChildren && !node.ToggleBounds.IsEmpty)
            {
                var toggle = node.ToggleBounds;
                return new Point(toggle.Right, toggle.Top + toggle.Height / 2);
            }

            return towardChild
                ? new Point(bounds.Right, bounds.Top + bounds.Height / 2)
                : new Point(bounds.Left, bounds.Top + bounds.Height / 2);
        }

        if (towardChild && node.HasChildren && !node.ToggleBounds.IsEmpty)
        {
            var toggle = node.ToggleBounds;
            return new Point(toggle.Left + toggle.Width / 2, toggle.Bottom);
        }

        return towardChild
            ? new Point(bounds.Left + bounds.Width / 2, bounds.Bottom)
            : new Point(bounds.Left + bounds.Width / 2, bounds.Top);
    }

    private void DrawOrthogonal(Graphics graphics, Pen pen, Point start, Point end)
    {
        if (_layoutDirection == GraphLayoutDirection.LeftToRight)
        {
            var midX = (start.X + end.X) / 2;
            graphics.DrawLines(pen, new[]
            {
                start,
                new Point(midX, start.Y),
                new Point(midX, end.Y),
                end
            });
        }
        else
        {
            var midY = (start.Y + end.Y) / 2;
            graphics.DrawLines(pen, new[]
            {
                start,
                new Point(start.X, midY),
                new Point(end.X, midY),
                end
            });
        }
    }

    private static void DrawBezier(Graphics graphics, Pen pen, Point start, Point end)
    {
        var signedDx = end.X - start.X;
        var signedDy = end.Y - start.Y;
        var dx = Math.Abs(signedDx);
        var dy = Math.Abs(signedDy);
        var rawOff = Math.Max(40, Math.Max(dx, dy) / 2);

        Point control1, control2;
        if (dx >= dy)
        {
            // Cap to half of horizontal span so control points never cross
            var off = Math.Max(1, Math.Min(rawOff, dx / 2));
            var sign = signedDx >= 0 ? 1 : -1;
            control1 = new Point(start.X + sign * off, start.Y);
            control2 = new Point(end.X - sign * off, end.Y);
        }
        else
        {
            var off = Math.Max(1, Math.Min(rawOff, dy / 2));
            var sign = signedDy >= 0 ? 1 : -1;
            control1 = new Point(start.X, start.Y + sign * off);
            control2 = new Point(end.X, end.Y - sign * off);
        }

        graphics.DrawBezier(pen, start, control1, control2, end);
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        if (_suppressResizeContentSizing)
        {
            return;
        }

        _zoom.ApplyContentSize(this, _contentSize);
    }

    private void InvalidateDiagramSurface() => Invalidate(ClientRectangle);
}
