using CodeAnalyzer.Models;

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
    private bool _isAnalyzing;
    private readonly HashSet<string> _searchMatchNodeIds = new(StringComparer.Ordinal);
    private string? _currentSearchNodeId;
    private readonly System.Windows.Forms.Timer _analysisAnimationTimer;
    private float _hourglassRotation;

    public CallGraphViewer()
    {
        DoubleBuffered = true;
        SetStyle(ControlStyles.ResizeRedraw, true);
        BackColor = Color.White;
        AutoScroll = true;

        _analysisAnimationTimer = new System.Windows.Forms.Timer { Interval = 50 };
        _analysisAnimationTimer.Tick += AnalysisAnimationTimer_Tick;
    }

    private void AnalysisAnimationTimer_Tick(object? sender, EventArgs e)
    {
        if (!_isAnalyzing)
        {
            return;
        }

        _hourglassRotation = (_hourglassRotation + 24f) % 360f;
        Invalidate();
    }

    private void StartAnalysisAnimation()
    {
        _hourglassRotation = 0f;
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
            Invalidate();
        }
    }

    public void SetGraph(CallGraphResult? graph, string? rootNodeId)
    {
        SetGraph(graph, string.IsNullOrWhiteSpace(rootNodeId) ? [] : [rootNodeId]);
    }

    public void SetGraph(CallGraphResult? graph, IReadOnlyList<string> rootNodeIds)
    {
        _isAnalyzing = false;
        _graph = graph;
        _rootNodeIds = rootNodeIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.Ordinal)
            .ToList();
        _collapsedNodeIds.Clear();
        ClearSearchHighlight();
        StopAnalysisAnimation();
        Cursor = Cursors.Default;
        RebuildVisualTree();
    }

    public void BeginAnalysis()
    {
        _isAnalyzing = true;
        _graph = null;
        _rootNodeIds = [];
        _roots = [];
        _collapsedNodeIds.Clear();
        ClearSearchHighlight();
        _contentSize = new Size(400, 300);
        AutoScrollMinSize = _contentSize;
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

    public void ExpandAll()
    {
        _collapsedNodeIds.Clear();
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
        Invalidate();
    }

    public bool TryFocusNode(string nodeId)
    {
        if (_graph is null || _rootNodeIds.Count == 0)
        {
            return false;
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

        return false;
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
        foreach (var node in CallGraphLayoutEngine.EnumerateNodes(_roots))
        {
            if (!string.Equals(node.Data.Id, nodeId, StringComparison.Ordinal))
            {
                continue;
            }

            var bounds = node.Bounds;
            const int margin = 24;
            AutoScrollPosition = new Point(Math.Max(0, bounds.Left - margin), Math.Max(0, bounds.Top - margin));
            return;
        }
    }

    protected override void OnScroll(ScrollEventArgs se)
    {
        base.OnScroll(se);
        Invalidate(true);
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        using var brush = new SolidBrush(BackColor);
        var state = e.Graphics.Save();
        e.Graphics.ResetTransform();
        e.Graphics.FillRectangle(brush, 0, 0, ClientSize.Width, ClientSize.Height);
        e.Graphics.Restore(state);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);

        e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        if (_isAnalyzing || _graph is null || _roots.Count == 0)
        {
            DrawPlaceholder(e.Graphics);
            return;
        }

        foreach (var node in CallGraphLayoutEngine.EnumerateNodes(_roots))
        {
            DrawEdge(e.Graphics, node);
        }

        foreach (var node in CallGraphLayoutEngine.EnumerateNodes(_roots))
        {
            DrawNode(e.Graphics, node);
        }
    }

    protected override void OnMouseClick(MouseEventArgs e)
    {
        base.OnMouseClick(e);

        if (TryHitToggle(e.Location, out var nodeId))
        {
            ToggleNode(nodeId);
        }
    }

    protected override void OnMouseDoubleClick(MouseEventArgs e)
    {
        base.OnMouseDoubleClick(e);

        if (TryHitToggle(e.Location, out var nodeId))
        {
            ToggleNode(nodeId);
        }
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

        RebuildVisualTree();
    }

    private Point ClientToDocument(Point clientPoint)
    {
        return new Point(clientPoint.X - AutoScrollPosition.X, clientPoint.Y - AutoScrollPosition.Y);
    }

    private void RebuildVisualTree()
    {
        _roots = [];

        if (_graph is null || _rootNodeIds.Count == 0)
        {
            _contentSize = new Size(400, 300);
            AutoScrollMinSize = _contentSize;
            Invalidate();
            return;
        }

        foreach (var rootNodeId in _rootNodeIds)
        {
            if (!_graph.NodeMap.ContainsKey(rootNodeId))
            {
                continue;
            }

            var visitedOnPath = new HashSet<string>(StringComparer.Ordinal);
            var rootVisual = BuildVisualNode(rootNodeId, visitedOnPath);
            if (rootVisual is not null)
            {
                _roots.Add(rootVisual);
            }
        }

        if (_roots.Count == 0)
        {
            _contentSize = new Size(400, 300);
            AutoScrollMinSize = _contentSize;
            Invalidate();
            return;
        }

        _contentSize = CallGraphLayoutEngine.Layout(_roots, _layoutDirection);
        AutoScrollMinSize = _contentSize;
        Invalidate();
    }

    private GraphVisualNode? BuildVisualNode(string nodeId, HashSet<string> visitedOnPath)
    {
        if (!_graph!.NodeMap.TryGetValue(nodeId, out var data))
        {
            return null;
        }

        if (visitedOnPath.Contains(nodeId))
        {
            return new GraphVisualNode
            {
                Data = data,
                HasChildren = false,
                IsExpanded = false
            };
        }

        visitedOnPath.Add(nodeId);

        var childIds = _graph.Outgoing.TryGetValue(nodeId, out var outgoing) ? outgoing : [];
        var isExpanded = !_collapsedNodeIds.Contains(nodeId);

        var visualNode = new GraphVisualNode
        {
            Data = data,
            HasChildren = childIds.Count > 0,
            IsExpanded = isExpanded
        };

        if (isExpanded)
        {
            foreach (var childId in childIds)
            {
                var child = BuildVisualNode(childId, visitedOnPath);
                if (child is null)
                {
                    continue;
                }

                child.Parent = visualNode;
                visualNode.Children.Add(child);
            }
        }

        visitedOnPath.Remove(nodeId);
        return visualNode;
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

        DrawRotatingHourglass(graphics, centerX, hourglassCenterY, hourglassSize, _hourglassRotation);

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

    private static void DrawRotatingHourglass(Graphics graphics, float centerX, float centerY, float size, float rotationDegrees)
    {
        var state = graphics.Save();
        graphics.TranslateTransform(centerX, centerY);
        graphics.RotateTransform(rotationDegrees);
        graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        var halfWidth = size * 0.34f;
        var halfHeight = size * 0.46f;
        var neck = size * 0.06f;

        using var glassFill = new SolidBrush(Color.FromArgb(235, 240, 248));
        using var sandFill = new SolidBrush(Color.FromArgb(230, 162, 60));
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

        var topSand = new[]
        {
            new PointF(-halfWidth * 0.72f, -halfHeight + size * 0.08f),
            new PointF(halfWidth * 0.72f, -halfHeight + size * 0.08f),
            new PointF(neck * 0.8f, -size * 0.04f),
            new PointF(-neck * 0.8f, -size * 0.04f)
        };
        var bottomSand = new[]
        {
            new PointF(-neck * 0.8f, size * 0.12f),
            new PointF(neck * 0.8f, size * 0.12f),
            new PointF(halfWidth * 0.55f, halfHeight - size * 0.06f),
            new PointF(-halfWidth * 0.55f, halfHeight - size * 0.06f)
        };

        graphics.FillPolygon(sandFill, topSand);
        graphics.FillPolygon(sandFill, bottomSand);

        graphics.Restore(state);
    }

    private void DrawNode(Graphics graphics, GraphVisualNode node)
    {
        var isCurrentMatch = _currentSearchNodeId is not null
            && string.Equals(node.Data.Id, _currentSearchNodeId, StringComparison.Ordinal);
        var isMatch = _searchMatchNodeIds.Contains(node.Data.Id);

        var fillColor = isCurrentMatch
            ? Color.FromArgb(255, 236, 179)
            : isMatch
                ? Color.FromArgb(255, 249, 219)
                : Color.FromArgb(245, 248, 252);
        var borderColor = isCurrentMatch
            ? Color.FromArgb(230, 126, 34)
            : isMatch
                ? Color.FromArgb(241, 196, 15)
                : Color.FromArgb(74, 108, 155);
        var borderWidth = isCurrentMatch ? 2.5f : isMatch ? 2f : 1.5f;

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

        using var pen = new Pen(Color.FromArgb(130, 145, 165), 1.6f);
        var parent = node.Parent;
        var start = GetAnchorPoint(parent, towardChild: true);
        var end = GetAnchorPoint(node, towardChild: false);

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
        var dx = Math.Abs(end.X - start.X);
        var dy = Math.Abs(end.Y - start.Y);
        var controlOffset = Math.Max(40, Math.Max(dx, dy) / 2);

        Point control1;
        Point control2;

        if (dx >= dy)
        {
            control1 = new Point(start.X + controlOffset, start.Y);
            control2 = new Point(end.X - controlOffset, end.Y);
        }
        else
        {
            control1 = new Point(start.X, start.Y + controlOffset);
            control2 = new Point(end.X, end.Y - controlOffset);
        }

        graphics.DrawBezier(pen, start, control1, control2, end);
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        AutoScrollMinSize = _contentSize;
    }
}
