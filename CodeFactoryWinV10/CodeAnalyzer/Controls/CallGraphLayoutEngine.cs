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
    private const int TopToBottomDepthGap = 120;
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

    public static Size LayoutHubAccess(
        IReadOnlyList<GraphVisualNode> accessors,
        GraphVisualNode target,
        GraphLayoutDirection direction)
    {
        if (accessors.Count == 0)
        {
            PlaceNode(target, depth: 0, position: 24, direction);
            return new Size(target.Bounds.Right + 40, Math.Max(target.Bounds.Bottom + 40, 300));
        }

        if (direction == GraphLayoutDirection.LeftToRight)
        {
            var y = 24;
            foreach (var accessor in accessors)
            {
                PlaceNode(accessor, depth: 0, position: y, direction);
                y += NodeHeight + VerticalGap;
            }

            var firstTop = accessors[0].Bounds.Top;
            var lastBottom = accessors[^1].Bounds.Bottom;
            var centerY = (firstTop + lastBottom) / 2 - NodeHeight / 2;
            PlaceNode(target, depth: 1, position: centerY, direction);
        }
        else
        {
            var x = 24;
            foreach (var accessor in accessors)
            {
                PlaceNode(accessor, depth: 0, position: x, direction);
                x += NodeWidth + VerticalGap;
            }

            var firstLeft = accessors[0].Bounds.Left;
            var lastRight = accessors[^1].Bounds.Right;
            var centerX = (firstLeft + lastRight) / 2 - NodeWidth / 2;
            PlaceNode(target, depth: 1, position: centerX, direction);
        }

        var bounds = Rectangle.Empty;
        foreach (var node in accessors)
        {
            bounds = bounds == Rectangle.Empty ? node.Bounds : Rectangle.Union(bounds, node.Bounds);
        }

        bounds = Rectangle.Union(bounds, target.Bounds);
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
                    node.Bounds.Right,
                    node.Bounds.Top + (NodeHeight - ToggleSize) / 2,
                    ToggleSize,
                    ToggleSize)
                : Rectangle.Empty;
        }
        else
        {
            var x = 24 + position;
            var y = 24 + depth * (NodeHeight + TopToBottomDepthGap);
            node.Bounds = new Rectangle(x, y, NodeWidth, NodeHeight);
            node.ToggleBounds = node.HasChildren
                ? new Rectangle(
                    node.Bounds.Left + (NodeWidth - ToggleSize) / 2,
                    node.Bounds.Bottom,
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
