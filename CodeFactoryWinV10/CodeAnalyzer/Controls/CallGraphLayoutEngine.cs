using CodeAnalyzer.Models;

namespace CodeAnalyzer.Controls;

internal sealed class GraphVisualNode
{
    public required CallGraphNode Data { get; init; }
    public GraphVisualNode? Parent { get; set; }
    public List<GraphVisualNode> Children { get; } = [];
    public bool HasChildren { get; set; }
    public bool IsExpanded { get; set; } = true;
    public Rectangle Bounds { get; set; }
    public Rectangle ToggleBounds { get; set; }
    public Point Center { get; set; }
}

internal static class CallGraphLayoutEngine
{
    private const int NodeWidth = 180;
    private const int NodeHeight = 44;
    private const int HorizontalGap = 80;
    private const int VerticalGap = 28;
    private const int ToggleSize = 18;
    private const int ToggleMargin = 4;

    public static Size Layout(IReadOnlyList<GraphVisualNode> roots, GraphLayoutDirection direction)
    {
        var nextPosition = 0;
        foreach (var root in roots)
        {
            nextPosition = AssignPositions(root, 0, nextPosition, direction);
            nextPosition += direction == GraphLayoutDirection.TopToBottom ? NodeWidth + VerticalGap : NodeHeight + VerticalGap;
        }

        var bounds = Rectangle.Empty;
        foreach (var node in EnumerateNodes(roots))
        {
            bounds = bounds == Rectangle.Empty ? node.Bounds : Rectangle.Union(bounds, node.Bounds);
            if (node.HasChildren && !node.ToggleBounds.IsEmpty)
            {
                bounds = Rectangle.Union(bounds, node.ToggleBounds);
            }
        }

        return new Size(Math.Max(bounds.Right + 40, 400), Math.Max(bounds.Bottom + 40, 300));
    }

    private static int AssignPositions(GraphVisualNode node, int depth, int startPosition, GraphLayoutDirection direction)
    {
        if (!node.IsExpanded || node.Children.Count == 0)
        {
            PlaceNode(node, depth, startPosition, direction);
            return startPosition + (direction == GraphLayoutDirection.TopToBottom ? NodeWidth + VerticalGap : NodeHeight + VerticalGap);
        }

        var childStart = startPosition;
        var childPositions = new List<int>();

        foreach (var child in node.Children)
        {
            var childEnd = AssignPositions(child, depth + 1, childStart, direction);
            childPositions.Add((childStart + childEnd - (direction == GraphLayoutDirection.TopToBottom ? NodeWidth + VerticalGap : NodeHeight + VerticalGap)) / 2);
            childStart = childEnd;
        }

        var centerPosition = childPositions.Count == 1
            ? childPositions[0]
            : (childPositions.First() + childPositions.Last()) / 2;

        PlaceNode(node, depth, centerPosition, direction);
        return childStart;
    }

    private static void PlaceNode(GraphVisualNode node, int depth, int position, GraphLayoutDirection direction)
    {
        if (direction == GraphLayoutDirection.LeftToRight)
        {
            var x = 24 + depth * (NodeWidth + HorizontalGap);
            var y = 24 + position;
            node.Bounds = new Rectangle(x, y, NodeWidth, NodeHeight);
            node.ToggleBounds = node.HasChildren
                ? new Rectangle(
                    node.Bounds.Right + ToggleMargin,
                    node.Bounds.Top + (NodeHeight - ToggleSize) / 2,
                    ToggleSize,
                    ToggleSize)
                : Rectangle.Empty;
        }
        else
        {
            var x = 24 + position;
            var y = 24 + depth * (NodeHeight + HorizontalGap);
            node.Bounds = new Rectangle(x, y, NodeWidth, NodeHeight);
            node.ToggleBounds = node.HasChildren
                ? new Rectangle(
                    node.Bounds.Left + (NodeWidth - ToggleSize) / 2,
                    node.Bounds.Bottom + ToggleMargin,
                    ToggleSize,
                    ToggleSize)
                : Rectangle.Empty;
        }

        node.Center = new Point(node.Bounds.Left + NodeWidth / 2, node.Bounds.Top + NodeHeight / 2);
    }

    public static IEnumerable<GraphVisualNode> EnumerateNodes(IEnumerable<GraphVisualNode> roots)
    {
        foreach (var root in roots)
        {
            foreach (var node in EnumerateNodes(root))
            {
                yield return node;
            }
        }
    }

    private static IEnumerable<GraphVisualNode> EnumerateNodes(GraphVisualNode node)
    {
        yield return node;

        if (!node.IsExpanded)
        {
            yield break;
        }

        foreach (var child in node.Children)
        {
            foreach (var descendant in EnumerateNodes(child))
            {
                yield return descendant;
            }
        }
    }
}
