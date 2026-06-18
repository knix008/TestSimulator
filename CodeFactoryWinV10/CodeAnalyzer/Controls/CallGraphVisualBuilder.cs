using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

internal sealed class CallGraphVisualBuildSession
{
    public CallGraphResult? Graph { get; init; }
    public IReadOnlyList<string> RootNodeIds { get; init; } = [];
    public GraphLayoutDirection LayoutDirection { get; init; }
    public IReadOnlySet<string> CollapsedNodeIds { get; init; } = new HashSet<string>(StringComparer.Ordinal);
    public string? HubTargetNodeId { get; init; }

    public List<GraphVisualNode> Roots { get; } = [];
    public GraphVisualNode? HubTargetNode { get; set; }
    public int VisualNodeCount { get; set; }
    public bool VisualTreeTruncated { get; set; }
    public Size ContentSize { get; set; } = new(400, 300);
    public bool BuildError { get; set; }
    public Exception? Error { get; set; }
}

internal static class CallGraphVisualBuilder
{
    public static CallGraphVisualBuildSession Build(CallGraphVisualBuildSession session)
    {
        if (session.Graph is null)
        {
            return session;
        }

        if (!string.IsNullOrWhiteSpace(session.HubTargetNodeId))
        {
            BuildHubAccess(session);
            return session;
        }

        if (session.RootNodeIds.Count == 0)
        {
            return session;
        }

        try
        {
            ViewProgressReporter.Report(15, "호출 트리를 구성하는 중...");
            foreach (var rootNodeId in session.RootNodeIds)
            {
                if (!session.Graph.NodeMap.ContainsKey(rootNodeId))
                {
                    continue;
                }

                var visitedOnPath = new HashSet<string>(StringComparer.Ordinal);
                var rootVisual = BuildVisualNode(session, rootNodeId, visitedOnPath, depth: 0);
                if (rootVisual is not null)
                {
                    session.Roots.Add(rootVisual);
                }
            }

            if (session.Roots.Count == 0)
            {
                return session;
            }

            ViewProgressReporter.Report(85, "호출 그래프 레이아웃을 계산하는 중...");
            session.ContentSize = InflateGraphContentSize(
                CallGraphLayoutEngine.Layout(session.Roots, session.LayoutDirection),
                session.Roots,
                hubTargetNode: null);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
        {
            session.BuildError = true;
            session.Error = ex;
            session.Roots.Clear();
            session.HubTargetNode = null;
            session.ContentSize = new Size(400, 300);
        }

        return session;
    }

    private static void BuildHubAccess(CallGraphVisualBuildSession session)
    {
        if (!session.Graph!.NodeMap.TryGetValue(session.HubTargetNodeId!, out var targetData))
        {
            return;
        }

        try
        {
            foreach (var rootNodeId in session.RootNodeIds)
            {
                if (!session.Graph.NodeMap.TryGetValue(rootNodeId, out var accessorData))
                {
                    continue;
                }

                session.VisualNodeCount++;
                session.Roots.Add(new GraphVisualNode
                {
                    Data = accessorData,
                    HasChildren = false,
                    IsExpanded = true
                });
            }

            if (session.Roots.Count == 0)
            {
                session.VisualNodeCount++;
                session.Roots.Add(new GraphVisualNode
                {
                    Data = targetData,
                    HasChildren = false,
                    IsExpanded = true
                });
                session.ContentSize = InflateGraphContentSize(
                    CallGraphLayoutEngine.Layout(session.Roots, session.LayoutDirection),
                    session.Roots,
                    hubTargetNode: null);
            }
            else
            {
                session.VisualNodeCount++;
                session.HubTargetNode = new GraphVisualNode
                {
                    Data = targetData,
                    HasChildren = false,
                    IsExpanded = true
                };
                session.ContentSize = InflateGraphContentSize(
                    CallGraphLayoutEngine.LayoutHubAccess(
                        session.Roots,
                        session.HubTargetNode,
                        session.LayoutDirection),
                    session.Roots,
                    session.HubTargetNode);
            }
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
        {
            session.BuildError = true;
            session.Error = ex;
            session.Roots.Clear();
            session.HubTargetNode = null;
            session.ContentSize = new Size(400, 300);
        }
    }

    private static GraphVisualNode? BuildVisualNode(
        CallGraphVisualBuildSession session,
        string nodeId,
        HashSet<string> visitedOnPath,
        int depth)
    {
        if (session.VisualNodeCount >= AnalysisScaleLimits.MaxCallGraphVisualNodes
            || depth >= AnalysisScaleLimits.MaxCallGraphVisualDepth)
        {
            session.VisualTreeTruncated = true;
            return null;
        }

        if (!session.Graph!.NodeMap.TryGetValue(nodeId, out var data))
        {
            return null;
        }

        session.VisualNodeCount++;

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

        var childIds = session.Graph.Outgoing.TryGetValue(nodeId, out var outgoing) ? outgoing : [];
        var isExpanded = !session.CollapsedNodeIds.Contains(nodeId);

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
                var child = BuildVisualNode(session, childId, visitedOnPath, depth + 1);
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

    private static Size InflateGraphContentSize(
        Size layoutSize,
        List<GraphVisualNode> roots,
        GraphVisualNode? hubTargetNode)
    {
        var bounds = new List<Rectangle>();
        foreach (var node in CallGraphLayoutEngine.EnumerateNodes(roots))
        {
            bounds.Add(node.Bounds);
            if (!node.ToggleBounds.IsEmpty)
            {
                bounds.Add(node.ToggleBounds);
            }
        }

        if (hubTargetNode is not null)
        {
            bounds.Add(hubTargetNode.Bounds);
            if (!hubTargetNode.ToggleBounds.IsEmpty)
            {
                bounds.Add(hubTargetNode.ToggleBounds);
            }
        }

        return DiagramZoomController.InflateContentSize(layoutSize, bounds);
    }
}
