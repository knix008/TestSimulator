using CodeAnalyzer.Models;

namespace CodeAnalyzer.Controls;

internal sealed class DiagramBoxNode
{
    public required string Id { get; init; }
    public required string Title { get; init; }
    public required string Subtitle { get; init; }
    public IReadOnlyList<string> Lines { get; init; } = [];
    public bool IsUmlStyle { get; init; }
    public string TypeKind { get; init; } = "class";
    public bool IsAbstract { get; init; }
    public IReadOnlyList<string> Attributes { get; init; } = [];
    public IReadOnlyList<string> Operations { get; init; } = [];
    public Rectangle Bounds { get; set; }
}

internal sealed class DiagramEdge
{
    public required string FromId { get; init; }
    public required string ToId { get; init; }
    public required string Label { get; init; }
    public int? CallCount { get; init; }
    public StructureRelationKind? RelationKind { get; init; }
}

internal static class DiagramBoxLayoutEngine
{
    private const int NodeWidth = 200;
    private const int LineHeight = 14;
    private const int HeaderHeight = 36;
    private const int HorizontalGap = 72;
    private const int VerticalGap = 110;
    private const int TreeDepthGap = 120;
    private const int TreeSiblingGap = 36;

    public static int MeasureNodeHeight(DiagramBoxNode node)
    {
        if (node.TypeKind is "file" or "directory")
        {
            return HeaderHeight + Math.Max(1, node.Attributes.Count) * LineHeight + 36;
        }

        return HeaderHeight + Math.Max(1, node.Lines.Count) * LineHeight + 12;
    }

    public static Size LayoutLayered(
        IReadOnlyList<DiagramBoxNode> nodes,
        IReadOnlyDictionary<string, int> depthById,
        GraphLayoutDirection layoutDirection = GraphLayoutDirection.TopToBottom)
    {
        if (nodes.Count == 0)
        {
            return new Size(400, 300);
        }

        var grouped = nodes
            .GroupBy(node => depthById.TryGetValue(node.Id, out var depth) ? depth : 0)
            .OrderBy(group => group.Key)
            .ToList();

        if (layoutDirection == GraphLayoutDirection.LeftToRight)
        {
            var bounds = Rectangle.Empty;
            var x = 24;

            foreach (var group in grouped)
            {
                var y = 24;

                foreach (var node in group.OrderBy(n => n.Title, StringComparer.OrdinalIgnoreCase))
                {
                    var height = MeasureNodeHeight(node);
                    node.Bounds = new Rectangle(x, y, NodeWidth, height);
                    bounds = bounds == Rectangle.Empty ? node.Bounds : Rectangle.Union(bounds, node.Bounds);
                    y += height + HorizontalGap;
                }

                x += NodeWidth + VerticalGap;
            }

            return new Size(Math.Max(bounds.Right + 40, 400), Math.Max(bounds.Bottom + 40, 300));
        }

        var topDownBounds = Rectangle.Empty;
        var topDownY = 24;

        foreach (var group in grouped)
        {
            var rowHeight = group.Max(MeasureNodeHeight);
            var topDownX = 24;
            foreach (var node in group.OrderBy(n => n.Title, StringComparer.OrdinalIgnoreCase))
            {
                var height = MeasureNodeHeight(node);
                node.Bounds = new Rectangle(topDownX, topDownY, NodeWidth, height);
                topDownBounds = topDownBounds == Rectangle.Empty ? node.Bounds : Rectangle.Union(topDownBounds, node.Bounds);
                topDownX += NodeWidth + HorizontalGap;
            }

            topDownY += rowHeight + VerticalGap;
        }

        return new Size(Math.Max(topDownBounds.Right + 40, 400), Math.Max(topDownBounds.Bottom + 40, 300));
    }

    public static Size LayoutLeftToRightTree(
        IReadOnlyList<DiagramBoxNode> nodes,
        IReadOnlyDictionary<string, List<string>> outgoing,
        string rootId)
    {
        if (nodes.Count == 0)
        {
            return new Size(400, 300);
        }

        var nodeMap = nodes.ToDictionary(node => node.Id, StringComparer.Ordinal);

        // BFS to compute minimum depth from root (depth → column X).
        var depthById = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        if (!string.IsNullOrWhiteSpace(rootId) && nodeMap.ContainsKey(rootId))
        {
            var queue = new Queue<(string Id, int Depth)>();
            depthById[rootId] = 0;
            queue.Enqueue((rootId, 0));

            while (queue.Count > 0)
            {
                var (id, depth) = queue.Dequeue();
                if (!outgoing.TryGetValue(id, out var children))
                {
                    continue;
                }

                foreach (var childId in children)
                {
                    if (!nodeMap.ContainsKey(childId))
                    {
                        continue;
                    }

                    var nextDepth = depth + 1;
                    if (!depthById.TryGetValue(childId, out var existing) || nextDepth < existing)
                    {
                        depthById[childId] = nextDepth;
                        queue.Enqueue((childId, nextDepth));
                    }
                }
            }
        }

        foreach (var node in nodes)
        {
            if (!depthById.ContainsKey(node.Id))
            {
                depthById[node.Id] = 0;
            }
        }

        // Group by depth — each group is a vertical column.
        var grouped = nodes
            .GroupBy(node => depthById.TryGetValue(node.Id, out var d) ? d : 0)
            .OrderBy(g => g.Key)
            .ToList();

        var bounds = Rectangle.Empty;
        var x = 24;

        foreach (var group in grouped)
        {
            var y = 24;

            foreach (var node in group.OrderBy(n => n.Title, StringComparer.OrdinalIgnoreCase))
            {
                var height = MeasureNodeHeight(node);
                node.Bounds = new Rectangle(x, y, NodeWidth, height);
                bounds = bounds == Rectangle.Empty ? node.Bounds : Rectangle.Union(bounds, node.Bounds);
                y += height + HorizontalGap;
            }

            x += NodeWidth + VerticalGap;
        }

        return new Size(Math.Max(bounds.Right + 40, 400), Math.Max(bounds.Bottom + 40, 300));
    }

    public static Size LayoutTopToBottomTree(
        IReadOnlyList<DiagramBoxNode> nodes,
        IReadOnlyDictionary<string, List<string>> outgoing,
        string rootId)
    {
        if (nodes.Count == 0)
        {
            return new Size(400, 300);
        }

        var nodeMap = nodes.ToDictionary(node => node.Id, StringComparer.Ordinal);

        // Compute minimum depth from the root within the outgoing adjacency.
        var depthById = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        if (!string.IsNullOrWhiteSpace(rootId) && nodeMap.ContainsKey(rootId))
        {
            var queue = new Queue<(string Id, int Depth)>();
            depthById[rootId] = 0;
            queue.Enqueue((rootId, 0));

            while (queue.Count > 0)
            {
                var (id, depth) = queue.Dequeue();
                if (!outgoing.TryGetValue(id, out var children))
                {
                    continue;
                }

                foreach (var childId in children)
                {
                    if (!nodeMap.ContainsKey(childId))
                    {
                        continue;
                    }

                    var nextDepth = depth + 1;
                    if (!depthById.TryGetValue(childId, out var existing) || nextDepth < existing)
                    {
                        depthById[childId] = nextDepth;
                        queue.Enqueue((childId, nextDepth));
                    }
                }
            }
        }

        // Nodes outside the root-reachable set become depth 0.
        foreach (var node in nodes)
        {
            if (!depthById.ContainsKey(node.Id))
            {
                depthById[node.Id] = 0;
            }
        }

        var grouped = nodes
            .GroupBy(node => depthById.TryGetValue(node.Id, out var depth) ? depth : 0)
            .OrderBy(g => g.Key)
            .ToList();

        var bounds = Rectangle.Empty;
        var y = 24;

        foreach (var group in grouped)
        {
            var rowHeight = group.Max(MeasureNodeHeight);
            var x = 24;

            foreach (var node in group.OrderBy(n => n.Title, StringComparer.OrdinalIgnoreCase))
            {
                var height = MeasureNodeHeight(node);
                node.Bounds = new Rectangle(x, y, NodeWidth, height);
                bounds = bounds == Rectangle.Empty ? node.Bounds : Rectangle.Union(bounds, node.Bounds);
                x += NodeWidth + HorizontalGap;
            }

            y += rowHeight + VerticalGap;
        }

        return new Size(Math.Max(bounds.Right + 40, 400), Math.Max(bounds.Bottom + 40, 300));
    }
}
