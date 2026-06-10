using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

public static class UmlAutoLayout
{
    private const float HGap = 50f;
    private const float VGap = 60f;
    private const float ComponentGapX = 80f;
    private const float StartX = 40f;
    private const float StartY = 40f;

    public static void Apply(UmlProject project, UmlDiagram diagram)
    {
        var nodes = diagram.Nodes.ToList();
        if (nodes.Count == 0) return;

        if (diagram.Kind == UmlDiagramKind.SequenceDiagram)
        {
            ApplySequenceLayout(project, diagram, nodes);
            return;
        }

        ApplyHierarchicalLayout(nodes, diagram.Edges.ToList());
    }

    private static void ApplySequenceLayout(UmlProject project, UmlDiagram diagram, List<UmlDiagramNode> nodes)
    {
        var lifelines = nodes.Where(n => UmlSequenceLayout.IsLifeline(project, n)).ToList();

        float x = StartX;
        foreach (var node in lifelines)
        {
            node.X = x;
            node.Y = StartY;
            x += node.Width + HGap;
        }

        // Reset sequence Y so layout recomputes from scratch
        foreach (var edge in diagram.Edges.Where(e => UmlSequenceLayout.IsSequenceMessage(project, diagram, e)))
            edge.SequenceY = 0f;

        UmlSequenceLayout.Prepare(project, diagram);
    }

    private static void ApplyHierarchicalLayout(List<UmlDiagramNode> nodes, List<UmlDiagramEdge> edges)
    {
        var nodeMap = nodes.ToDictionary(n => n.Id);

        var outAdj = nodes.ToDictionary(n => n.Id, _ => new HashSet<Guid>());
        var inAdj = nodes.ToDictionary(n => n.Id, _ => new HashSet<Guid>());
        var allAdj = nodes.ToDictionary(n => n.Id, _ => new HashSet<Guid>());

        foreach (var e in edges)
        {
            if (!outAdj.ContainsKey(e.SourceNodeId) || !inAdj.ContainsKey(e.TargetNodeId))
                continue;
            outAdj[e.SourceNodeId].Add(e.TargetNodeId);
            inAdj[e.TargetNodeId].Add(e.SourceNodeId);
            allAdj[e.SourceNodeId].Add(e.TargetNodeId);
            allAdj[e.TargetNodeId].Add(e.SourceNodeId);
        }

        // Find connected components
        var visited = new HashSet<Guid>();
        var components = new List<List<UmlDiagramNode>>();
        foreach (var node in nodes)
        {
            if (visited.Contains(node.Id)) continue;
            var comp = new List<UmlDiagramNode>();
            BfsComponent(node.Id, allAdj, nodeMap, visited, comp);
            components.Add(comp);
        }

        float cx = StartX;
        foreach (var comp in components)
        {
            var bounds = LayoutComponent(comp, outAdj, inAdj, cx, StartY);
            cx = bounds.Right + ComponentGapX;
        }
    }

    private static void BfsComponent(
        Guid start,
        Dictionary<Guid, HashSet<Guid>> adj,
        Dictionary<Guid, UmlDiagramNode> nodeMap,
        HashSet<Guid> visited,
        List<UmlDiagramNode> comp)
    {
        var queue = new Queue<Guid>();
        queue.Enqueue(start);
        visited.Add(start);
        while (queue.Count > 0)
        {
            var id = queue.Dequeue();
            if (nodeMap.TryGetValue(id, out var node)) comp.Add(node);
            foreach (var nb in adj[id].Where(nb => !visited.Contains(nb)))
            {
                visited.Add(nb);
                queue.Enqueue(nb);
            }
        }
    }

    private static RectangleF LayoutComponent(
        List<UmlDiagramNode> nodes,
        Dictionary<Guid, HashSet<Guid>> outAdj,
        Dictionary<Guid, HashSet<Guid>> inAdj,
        float startX,
        float startY)
    {
        if (nodes.Count == 1)
        {
            nodes[0].X = startX;
            nodes[0].Y = startY;
            return nodes[0].Bounds;
        }

        // Longest-path level assignment (BFS from roots)
        var level = new Dictionary<Guid, int>();
        var roots = nodes.Where(n => inAdj[n.Id].Count == 0).ToList();
        if (roots.Count == 0)
            roots = [nodes.OrderByDescending(n => outAdj[n.Id].Count + inAdj[n.Id].Count).First()];

        var queue = new Queue<Guid>();
        foreach (var r in roots) { level[r.Id] = 0; queue.Enqueue(r.Id); }

        while (queue.Count > 0)
        {
            var id = queue.Dequeue();
            foreach (var tgt in outAdj[id])
            {
                var newLevel = level[id] + 1;
                if (!level.TryGetValue(tgt, out var existing) || existing < newLevel)
                {
                    level[tgt] = newLevel;
                    queue.Enqueue(tgt);
                }
            }
        }

        foreach (var n in nodes)
            if (!level.ContainsKey(n.Id)) level[n.Id] = 0;

        // Group by level, sorted by connection degree within each level
        var byLevel = nodes
            .GroupBy(n => level[n.Id])
            .OrderBy(g => g.Key)
            .Select(g => g.OrderByDescending(n => outAdj[n.Id].Count + inAdj[n.Id].Count).ToList())
            .ToList();

        float y = startY;
        float componentRight = startX;

        foreach (var row in byLevel)
        {
            float rowWidth = row.Sum(n => n.Width) + HGap * (row.Count - 1);
            float x = startX;
            float rowHeight = row.Max(n => n.Height);

            foreach (var node in row)
            {
                node.X = x;
                node.Y = y;
                x += node.Width + HGap;
            }

            componentRight = Math.Max(componentRight, startX + rowWidth);
            y += rowHeight + VGap;
        }

        var minX = nodes.Min(n => n.X);
        var maxX = nodes.Max(n => n.X + n.Width);
        var minY = nodes.Min(n => n.Y);
        var maxY = nodes.Max(n => n.Y + n.Height);
        return new RectangleF(minX, minY, maxX - minX, maxY - minY);
    }
}
