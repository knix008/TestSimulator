using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

public enum UmlConnectionSide
{
    Top,
    Right,
    Bottom,
    Left,
}

public static class UmlEdgeRouting
{
    private const float BridgeRadius = 7f;

    public static PointF[] BuildPathPoints(
        UmlProject project,
        UmlDiagram diagram,
        UmlDiagramEdge edge,
        PointF start,
        PointF end,
        UmlConnectionSide startSide,
        UmlConnectionSide endSide)
    {
        if (ShouldUseBentRouting(project, diagram, edge, start, end))
        {
            var bendEdge = edge.RoutingKind == UmlEdgeRoutingKind.Bent
                ? edge
                : CreateEphemeralBentEdge(project, diagram, edge, start, end, startSide, endSide);
            return BuildBentPoints(start, end, bendEdge, startSide, endSide);
        }

        return [start, end];
    }

    public static void RefreshAutoRouting(UmlProject project, UmlDiagram diagram)
    {
        if (diagram.Kind == UmlDiagramKind.SequenceDiagram)
            return;

        foreach (var edge in diagram.Edges)
            ApplyAutoRouting(project, diagram, edge);
    }

    public static void RefreshAutoRoutingForNode(UmlProject project, UmlDiagram diagram, Guid nodeId) =>
        RefreshAutoRouting(project, diagram);

    public static bool ShouldUseBentRouting(
        UmlProject project,
        UmlDiagram diagram,
        UmlDiagramEdge edge,
        PointF start,
        PointF end)
    {
        if (edge.RoutingKind == UmlEdgeRoutingKind.Bent)
            return true;

        return StraightSegmentObscuresShapes(
            project,
            diagram,
            edge.SourceNodeId,
            edge.TargetNodeId,
            start,
            end);
    }

    public static bool IsSelfRelationship(UmlDiagramNode? source, UmlDiagramNode? target) =>
        source is not null && target is not null && source.Id == target.Id;

    public static void ApplyAutoRouting(UmlProject project, UmlDiagram diagram, UmlDiagramEdge edge)
    {
        if (diagram.Kind == UmlDiagramKind.SequenceDiagram)
            return;

        var sourceNode = diagram.FindNode(edge.SourceNodeId);
        var targetNode = diagram.FindNode(edge.TargetNodeId);
        if (sourceNode is null || targetNode is null)
            return;

        if (IsSelfRelationship(sourceNode, targetNode))
        {
            edge.RoutingKind = UmlEdgeRoutingKind.Bent;
            edge.OrthoMidX = null;
            edge.OrthoMidY = null;
            return;
        }

        var start = UmlNodeConnectionGeometry.GetConnectionPoint(project, sourceNode, targetNode, out var startSide);
        var end = UmlNodeConnectionGeometry.GetConnectionPoint(project, targetNode, sourceNode, out var endSide);

        if (!EdgePathNeedsBendRouting(project, diagram, edge, start, end, startSide, endSide))
        {
            edge.RoutingKind = UmlEdgeRoutingKind.Straight;
            edge.OrthoMidX = null;
            edge.OrthoMidY = null;
            return;
        }

        edge.RoutingKind = UmlEdgeRoutingKind.Bent;
        ApplySmartBendPosition(project, diagram, edge, start, end, startSide, endSide);
    }

    private static bool EdgePathNeedsBendRouting(
        UmlProject project,
        UmlDiagram diagram,
        UmlDiagramEdge edge,
        PointF start,
        PointF end,
        UmlConnectionSide startSide,
        UmlConnectionSide endSide)
    {
        if (StraightSegmentObscuresShapes(project, diagram, edge.SourceNodeId, edge.TargetNodeId, start, end))
            return true;

        if (edge.RoutingKind != UmlEdgeRoutingKind.Bent)
            return false;

        var path = BuildBentPoints(start, end, edge, startSide, endSide);
        for (var i = 1; i < path.Length; i++)
        {
            if (SegmentObscuresShapes(
                    project,
                    diagram,
                    edge.SourceNodeId,
                    edge.TargetNodeId,
                    path[i - 1],
                    path[i]))
                return true;
        }

        return false;
    }

    public static void ApplyDefaultBendPosition(
        UmlDiagramEdge edge,
        PointF start,
        PointF end,
        UmlConnectionSide startSide,
        UmlConnectionSide endSide)
    {
        if (ShouldRouteVerticalFirst(start, end, edge, startSide, endSide))
        {
            edge.OrthoMidY = (start.Y + end.Y) / 2f;
            edge.OrthoMidX = null;
        }
        else
        {
            edge.OrthoMidX = (start.X + end.X) / 2f;
            edge.OrthoMidY = null;
        }
    }

    private static UmlDiagramEdge CreateEphemeralBentEdge(
        UmlProject project,
        UmlDiagram diagram,
        UmlDiagramEdge edge,
        PointF start,
        PointF end,
        UmlConnectionSide startSide,
        UmlConnectionSide endSide)
    {
        var temp = new UmlDiagramEdge
        {
            RoutingKind = UmlEdgeRoutingKind.Bent,
            OrthoMidX = edge.OrthoMidX,
            OrthoMidY = edge.OrthoMidY,
        };
        if (temp.OrthoMidX is null && temp.OrthoMidY is null)
            ApplySmartBendPosition(project, diagram, temp, start, end, startSide, endSide);

        return temp;
    }

    private static void ApplySmartBendPosition(
        UmlProject project,
        UmlDiagram diagram,
        UmlDiagramEdge edge,
        PointF start,
        PointF end,
        UmlConnectionSide startSide,
        UmlConnectionSide endSide)
    {
        var preferredVertical = ShouldRouteVerticalFirst(start, end, edge, startSide, endSide);
        var obstacles = CollectObstacleBounds(project, diagram, edge.SourceNodeId, edge.TargetNodeId);

        foreach (var verticalFirst in new[] { preferredVertical, !preferredVertical })
        {
            foreach (var mid in GenerateBendMidCandidates(start, end, verticalFirst, obstacles))
            {
                if (!BentPathObscuresShapes(
                        project,
                        diagram,
                        edge.SourceNodeId,
                        edge.TargetNodeId,
                        start,
                        end,
                        verticalFirst,
                        mid))
                {
                    SetBendMid(edge, verticalFirst, mid);
                    return;
                }
            }
        }

        ApplyDefaultBendPosition(edge, start, end, startSide, endSide);
    }

    private static void SetBendMid(UmlDiagramEdge edge, bool verticalFirst, float mid)
    {
        if (verticalFirst)
        {
            edge.OrthoMidY = mid;
            edge.OrthoMidX = null;
        }
        else
        {
            edge.OrthoMidX = mid;
            edge.OrthoMidY = null;
        }
    }

    private static List<RectangleF> CollectObstacleBounds(
        UmlProject project,
        UmlDiagram diagram,
        Guid sourceNodeId,
        Guid targetNodeId)
    {
        var obstacles = new List<RectangleF>();
        foreach (var node in diagram.Nodes)
        {
            if (node.Id == sourceNodeId || node.Id == targetNodeId)
                continue;

            var bounds = UmlNodeConnectionGeometry.GetLayoutBounds(project, node);
            bounds.Inflate(4f, 4f);
            obstacles.Add(bounds);
        }

        return obstacles;
    }

    private static IEnumerable<float> GenerateBendMidCandidates(
        PointF start,
        PointF end,
        bool verticalFirst,
        IReadOnlyList<RectangleF> obstacles)
    {
        const float routePadding = 14f;
        var center = verticalFirst ? (start.Y + end.Y) / 2f : (start.X + end.X) / 2f;
        yield return center;

        foreach (var obstacle in obstacles)
        {
            if (verticalFirst)
            {
                yield return obstacle.Top - routePadding;
                yield return obstacle.Bottom + routePadding;
            }
            else
            {
                yield return obstacle.Left - routePadding;
                yield return obstacle.Right + routePadding;
            }
        }

        if (verticalFirst)
        {
            yield return start.Y;
            yield return end.Y;
        }
        else
        {
            yield return start.X;
            yield return end.X;
        }
    }

    private static bool BentPathObscuresShapes(
        UmlProject project,
        UmlDiagram diagram,
        Guid sourceNodeId,
        Guid targetNodeId,
        PointF start,
        PointF end,
        bool verticalFirst,
        float mid)
    {
        PointF[] path = verticalFirst
            ? [start, new(start.X, mid), new(end.X, mid), end]
            : [start, new(mid, start.Y), new(mid, end.Y), end];

        path = SimplifyOrthogonalPath(path);
        for (var i = 1; i < path.Length; i++)
        {
            if (SegmentObscuresShapes(
                    project,
                    diagram,
                    sourceNodeId,
                    targetNodeId,
                    path[i - 1],
                    path[i]))
                return true;
        }

        return false;
    }

    private static bool SegmentObscuresShapes(
        UmlProject project,
        UmlDiagram diagram,
        Guid sourceNodeId,
        Guid targetNodeId,
        PointF start,
        PointF end) =>
        StraightSegmentObscuresShapes(project, diagram, sourceNodeId, targetNodeId, start, end);

    public static void ApplyDefaultBendPosition(UmlProject project, UmlDiagram diagram, UmlDiagramEdge edge)
    {
        var sourceNode = diagram.FindNode(edge.SourceNodeId);
        var targetNode = diagram.FindNode(edge.TargetNodeId);
        if (sourceNode is null || targetNode is null || IsSelfRelationship(sourceNode, targetNode))
            return;

        var start = UmlNodeConnectionGeometry.GetConnectionPoint(project, sourceNode, targetNode, out var startSide);
        var end = UmlNodeConnectionGeometry.GetConnectionPoint(project, targetNode, sourceNode, out var endSide);
        ApplyDefaultBendPosition(edge, start, end, startSide, endSide);
    }

    public static int? HitTestBendHandle(
        PointF location,
        PointF[] pathPoints,
        UmlEdgeRoutingKind routingKind,
        float zoom,
        float hitSize = 8f)
    {
        if (routingKind != UmlEdgeRoutingKind.Bent || pathPoints.Length < 3)
            return null;

        var threshold = Math.Max(hitSize / Math.Max(zoom, 0.25f), 6f);
        var thresholdSq = threshold * threshold;
        int? bestIndex = null;
        var bestDistSq = float.MaxValue;

        for (var i = 1; i < pathPoints.Length - 1; i++)
        {
            var dx = location.X - pathPoints[i].X;
            var dy = location.Y - pathPoints[i].Y;
            var distSq = dx * dx + dy * dy;
            if (distSq <= thresholdSq && distSq < bestDistSq)
            {
                bestIndex = i;
                bestDistSq = distSq;
            }
        }

        return bestIndex;
    }

    public static void GetBendHandleDragAxes(
        PointF[] pathPoints,
        int vertexIndex,
        out bool horizontal,
        out bool vertical)
    {
        horizontal = false;
        vertical = false;
        if (vertexIndex < 1 || vertexIndex >= pathPoints.Length - 1)
            return;

        var vertex = pathPoints[vertexIndex];
        var prev = pathPoints[vertexIndex - 1];
        var next = pathPoints[vertexIndex + 1];

        if (IsVerticalSegment(prev, vertex) || IsVerticalSegment(vertex, next))
            horizontal = true;
        if (IsHorizontalSegment(prev, vertex) || IsHorizontalSegment(vertex, next))
            vertical = true;
    }

    public static bool UsesVerticalBendFirst(
        UmlDiagramEdge edge,
        PointF start,
        PointF end,
        UmlConnectionSide startSide,
        UmlConnectionSide endSide) =>
        ShouldRouteVerticalFirst(start, end, edge, startSide, endSide);

    public static void SetBendVertex(UmlDiagramEdge edge, int vertexIndex, PointF canvasPoint, PointF[] pathPoints)
    {
        if (vertexIndex < 1 || vertexIndex >= pathPoints.Length - 1)
            return;

        var vertex = pathPoints[vertexIndex];
        var prev = pathPoints[vertexIndex - 1];
        var next = pathPoints[vertexIndex + 1];

        var incomingVertical = IsVerticalSegment(prev, vertex);
        var incomingHorizontal = IsHorizontalSegment(prev, vertex);
        var outgoingVertical = IsVerticalSegment(vertex, next);
        var outgoingHorizontal = IsHorizontalSegment(vertex, next);

        if (incomingVertical && outgoingHorizontal)
        {
            edge.OrthoMidY = canvasPoint.Y;
            if (Math.Abs(canvasPoint.X - prev.X) > 1.5f)
                edge.OrthoMidX = canvasPoint.X;
            else if (pathPoints.Length <= 4)
                edge.OrthoMidX = null;
        }
        else if (incomingHorizontal && outgoingVertical)
        {
            edge.OrthoMidY = canvasPoint.Y;
            if (Math.Abs(canvasPoint.X - vertex.X) > 1.5f)
                edge.OrthoMidX = canvasPoint.X;
            else if (pathPoints.Length <= 4)
                edge.OrthoMidX = null;
        }
        else if (incomingHorizontal && outgoingHorizontal)
        {
            edge.OrthoMidY = canvasPoint.Y;
            if (Math.Abs(canvasPoint.X - vertex.X) > 1.5f)
                edge.OrthoMidX = canvasPoint.X;
        }
        else if (incomingVertical && outgoingVertical)
        {
            edge.OrthoMidX = canvasPoint.X;
            if (Math.Abs(canvasPoint.Y - vertex.Y) > 1.5f)
                edge.OrthoMidY = canvasPoint.Y;
        }
        else
        {
            if (edge.OrthoMidY is not null || Math.Abs(vertex.X - prev.X) < 0.5f)
                edge.OrthoMidY = canvasPoint.Y;
            if (edge.OrthoMidX is not null || Math.Abs(vertex.Y - prev.Y) < 0.5f)
                edge.OrthoMidX = canvasPoint.X;
        }
    }

    public static PointF[] BuildSelfLoopPath(RectangleF bounds, UmlEdgeRoutingKind routingKind)
    {
        _ = routingKind;

        var loopOut = Math.Clamp(bounds.Width * 0.38f, 32f, 84f);
        var loopUp = Math.Clamp(bounds.Height * 0.42f, 28f, 72f);

        var start = new PointF(bounds.Right, bounds.Top + bounds.Height * 0.58f);
        var end = new PointF(bounds.Right - Math.Min(bounds.Width * 0.18f, 28f), bounds.Top);
        var elbow = new PointF(bounds.Right + loopOut, start.Y);
        var topCorner = new PointF(bounds.Right + loopOut, bounds.Top - loopUp);
        var aboveEnd = new PointF(end.X, bounds.Top - loopUp);

        return SimplifyOrthogonalPath([start, elbow, topCorner, aboveEnd, end]);
    }

    public static PointF[] FlattenForCrossingDetection(PointF[] points, UmlEdgeRoutingKind routingKind) => points;

    public static Dictionary<Guid, List<(float T, PointF Pt)>> ComputeCrossings(IReadOnlyList<(UmlDiagramEdge Edge, PointF[] FlatPoints)> edgeLines)
    {
        var crossingsMap = new Dictionary<Guid, List<(float T, PointF Pt)>>();
        for (var i = 0; i < edgeLines.Count; i++)
        {
            var (edge, myFlat) = edgeLines[i];
            var crossings = new List<(float T, PointF Pt)>();

            for (var j = 0; j < i; j++)
            {
                var otherFlat = edgeLines[j].FlatPoints;
                for (var si = 1; si < myFlat.Length; si++)
                {
                    for (var sj = 1; sj < otherFlat.Length; sj++)
                    {
                        var cross = SegmentIntersection(myFlat[si - 1], myFlat[si], otherFlat[sj - 1], otherFlat[sj]);
                        if (cross is null)
                            continue;

                        var dx = myFlat[si].X - myFlat[si - 1].X;
                        var dy = myFlat[si].Y - myFlat[si - 1].Y;
                        var segLen = MathF.Sqrt(dx * dx + dy * dy);
                        var distAlongSeg = MathF.Sqrt(
                            (cross.Value.X - myFlat[si - 1].X) * (cross.Value.X - myFlat[si - 1].X) +
                            (cross.Value.Y - myFlat[si - 1].Y) * (cross.Value.Y - myFlat[si - 1].Y));
                        var t = si - 1 + (segLen > 0.001f ? distAlongSeg / segLen : 0f);
                        crossings.Add((t, cross.Value));
                    }
                }
            }

            crossingsMap[edge.Id] = crossings;
        }

        return crossingsMap;
    }

    public static void DrawRoutedPath(
        Graphics g,
        Pen pen,
        PointF[] points,
        UmlEdgeRoutingKind routingKind,
        IReadOnlyList<(float T, PointF Pt)> crossings)
    {
        if (points.Length < 2)
            return;

        var flat = FlattenForCrossingDetection(points, routingKind);
        if (crossings.Count == 0)
        {
            DrawPolyline(g, pen, flat);
            return;
        }

        DrawPolylineWithBridges(g, pen, flat, crossings.OrderBy(c => c.T).ToList(), BridgeRadius);
    }

    public static void DrawRoutedPathSegment(
        Graphics g,
        Pen pen,
        PointF[] points,
        UmlEdgeRoutingKind routingKind,
        IReadOnlyList<(float T, PointF Pt)> crossings,
        float trimFromEnd)
    {
        if (points.Length < 2 || trimFromEnd <= 0.01f)
        {
            DrawRoutedPath(g, pen, points, routingKind, crossings);
            return;
        }

        var fullFlat = FlattenForCrossingDetection(points, routingKind);
        var segmentEnd = PointAtDistanceFromEnd(fullFlat, trimFromEnd);
        var clipped = TrimFlatPath(fullFlat, segmentEnd);
        var clippedCrossings = FilterCrossingsWithinFlatLength(clipped, crossings);
        if (clippedCrossings.Count == 0)
            DrawPolyline(g, pen, clipped);
        else
            DrawPolylineWithBridges(g, pen, clipped, clippedCrossings, BridgeRadius);
    }

    public static PointF GetPathEndDirection(PointF[] points, UmlEdgeRoutingKind routingKind)
    {
        var flat = FlattenForCrossingDetection(points, routingKind);
        if (flat.Length < 2)
            return new PointF(1f, 0f);

        var prev = flat[^2];
        var end = flat[^1];
        var fdx = end.X - prev.X;
        var fdy = end.Y - prev.Y;
        var flen = MathF.Sqrt(fdx * fdx + fdy * fdy);
        if (flen < 0.001f)
            return new PointF(1f, 0f);

        return new PointF(fdx / flen, fdy / flen);
    }

    public static PointF GetPathLabelPoint(PointF[] points, UmlEdgeRoutingKind routingKind)
    {
        if (points.Length < 2)
            return points[0];

        var flat = FlattenForCrossingDetection(points, routingKind);
        if (flat.Length == 2)
            return new PointF((flat[0].X + flat[1].X) / 2f, (flat[0].Y + flat[1].Y) / 2f);

        var total = 0f;
        for (var i = 1; i < flat.Length; i++)
            total += DistanceBetween(flat[i - 1], flat[i]);

        var half = total / 2f;
        var walked = 0f;
        for (var i = 1; i < flat.Length; i++)
        {
            var segLen = DistanceBetween(flat[i - 1], flat[i]);
            if (walked + segLen >= half)
            {
                var t = segLen > 0.001f ? (half - walked) / segLen : 0f;
                return new PointF(
                    flat[i - 1].X + (flat[i].X - flat[i - 1].X) * t,
                    flat[i - 1].Y + (flat[i].Y - flat[i - 1].Y) * t);
            }

            walked += segLen;
        }

        return flat[^1];
    }

    public static float DistanceToPath(PointF[] points, UmlEdgeRoutingKind routingKind, PointF point)
    {
        var flat = FlattenForCrossingDetection(points, routingKind);
        var best = float.MaxValue;
        for (var i = 1; i < flat.Length; i++)
            best = MathF.Min(best, DistanceToSegment(point, flat[i - 1], flat[i]));

        return best;
    }

    public static PointF ShortenPathEnd(PointF[] points, UmlEdgeRoutingKind routingKind, float distanceFromEnd)
    {
        if (distanceFromEnd <= 0.01f)
        {
            var flatEnd = FlattenForCrossingDetection(points, routingKind);
            return flatEnd[^1];
        }

        var flat = FlattenForCrossingDetection(points, routingKind);
        if (flat.Length < 2)
            return flat[0];

        return PointAtDistanceFromEnd(flat, distanceFromEnd);
    }

    private static PointF[] BuildBentPoints(
        PointF start,
        PointF end,
        UmlDiagramEdge edge,
        UmlConnectionSide startSide,
        UmlConnectionSide endSide)
    {
        if (ShouldRouteVerticalFirst(start, end, edge, startSide, endSide))
        {
            var midY = edge.OrthoMidY ?? (start.Y + end.Y) / 2f;
            if (edge.OrthoMidX is float midX)
                return SimplifyOrthogonalPath([start, new(start.X, midY), new(midX, midY), new(midX, end.Y), end]);

            return SimplifyOrthogonalPath([start, new(start.X, midY), new(end.X, midY), end]);
        }

        var corridorX = edge.OrthoMidX ?? (start.X + end.X) / 2f;
        if (edge.OrthoMidY is float corridorY)
            return SimplifyOrthogonalPath([start, new(corridorX, start.Y), new(corridorX, corridorY), new(end.X, corridorY), end]);

        return SimplifyOrthogonalPath([start, new(corridorX, start.Y), new(corridorX, end.Y), end]);
    }

    private static bool IsHorizontalSegment(PointF a, PointF b) =>
        Math.Abs(a.Y - b.Y) < 0.5f && Math.Abs(a.X - b.X) > 0.5f;

    private static bool IsVerticalSegment(PointF a, PointF b) =>
        Math.Abs(a.X - b.X) < 0.5f && Math.Abs(a.Y - b.Y) > 0.5f;

    private static bool StraightSegmentObscuresShapes(
        UmlProject project,
        UmlDiagram diagram,
        Guid sourceNodeId,
        Guid targetNodeId,
        PointF start,
        PointF end)
    {
        foreach (var node in diagram.Nodes)
        {
            if (node.Id == sourceNodeId || node.Id == targetNodeId)
                continue;

            var bounds = UmlNodeConnectionGeometry.GetLayoutBounds(project, node);
            bounds.Inflate(4f, 4f);
            if (SegmentIntersectsRectangle(start, end, bounds))
                return true;
        }

        foreach (var nodeId in new[] { sourceNodeId, targetNodeId })
        {
            var node = diagram.FindNode(nodeId);
            if (node is null)
                continue;

            var bounds = UmlNodeConnectionGeometry.GetLayoutBounds(project, node);
            if (SegmentCrossesAttachedShapeInterior(start, end, bounds))
                return true;
        }

        return false;
    }

    private static bool SegmentIntersectsRectangle(PointF start, PointF end, RectangleF rect)
    {
        if (SegmentCrossesAttachedShapeInterior(start, end, rect))
            return true;

        var left = rect.Left;
        var right = rect.Right;
        var top = rect.Top;
        var bottom = rect.Bottom;
        return SegmentsIntersect(start, end, new(left, top), new(right, top))
            || SegmentsIntersect(start, end, new(right, top), new(right, bottom))
            || SegmentsIntersect(start, end, new(right, bottom), new(left, bottom))
            || SegmentsIntersect(start, end, new(left, bottom), new(left, top));
    }

    private static bool SegmentCrossesAttachedShapeInterior(PointF start, PointF end, RectangleF rect)
    {
        const float endpointTolerance = 4f;
        if (DistanceFromPointToRectangle(start, rect) <= endpointTolerance
            || DistanceFromPointToRectangle(end, rect) <= endpointTolerance)
            return false;

        var samples = 12;
        for (var i = 1; i < samples; i++)
        {
            var t = (float)i / samples;
            var pt = new PointF(
                start.X + (end.X - start.X) * t,
                start.Y + (end.Y - start.Y) * t);
            if (rect.Contains(pt))
                return true;
        }

        return false;
    }

    private static bool SegmentsIntersect(PointF a1, PointF a2, PointF b1, PointF b2)
    {
        var adx = a2.X - a1.X;
        var ady = a2.Y - a1.Y;
        var bdx = b2.X - b1.X;
        var bdy = b2.Y - b1.Y;
        var denom = adx * bdy - ady * bdx;
        if (MathF.Abs(denom) < 0.0001f)
            return false;

        var t = ((b1.X - a1.X) * bdy - (b1.Y - a1.Y) * bdx) / denom;
        var u = ((b1.X - a1.X) * ady - (b1.Y - a1.Y) * adx) / denom;
        const float eps = 0.001f;
        return t >= eps && t <= 1f - eps && u >= eps && u <= 1f - eps;
    }

    private static float DistanceFromPointToRectangle(PointF point, RectangleF rect)
    {
        var dx = MathF.Max(rect.Left - point.X, 0f);
        dx = MathF.Max(dx, point.X - rect.Right);
        var dy = MathF.Max(rect.Top - point.Y, 0f);
        dy = MathF.Max(dy, point.Y - rect.Bottom);
        return MathF.Sqrt(dx * dx + dy * dy);
    }

    private static bool ShouldRouteVerticalFirst(
        PointF start,
        PointF end,
        UmlDiagramEdge edge,
        UmlConnectionSide startSide,
        UmlConnectionSide endSide)
    {
        if (edge.OrthoMidY is not null)
            return true;
        if (edge.OrthoMidX is not null)
            return false;

        if (startSide is UmlConnectionSide.Top or UmlConnectionSide.Bottom
            && endSide is UmlConnectionSide.Top or UmlConnectionSide.Bottom)
            return true;
        if (startSide is UmlConnectionSide.Left or UmlConnectionSide.Right
            && endSide is UmlConnectionSide.Left or UmlConnectionSide.Right)
            return false;

        return MathF.Abs(end.Y - start.Y) > MathF.Abs(end.X - start.X);
    }

    private static PointF[] SimplifyOrthogonalPath(PointF[] raw)
    {
        if (raw.Length == 0)
            return [];

        var simplified = new List<PointF> { raw[0] };
        for (var i = 1; i < raw.Length; i++)
        {
            var point = raw[i];
            var previous = simplified[^1];
            if (DistanceBetween(point, previous) < 0.5f)
                continue;

            if (simplified.Count >= 2)
            {
                var beforePrevious = simplified[^2];
                var sameColumn = MathF.Abs(beforePrevious.X - previous.X) < 0.5f
                    && MathF.Abs(previous.X - point.X) < 0.5f;
                var sameRow = MathF.Abs(beforePrevious.Y - previous.Y) < 0.5f
                    && MathF.Abs(previous.Y - point.Y) < 0.5f;
                if (sameColumn || sameRow)
                {
                    simplified[^1] = point;
                    continue;
                }
            }

            simplified.Add(point);
        }

        return simplified.Count >= 2 ? simplified.ToArray() : [raw[0], raw[^1]];
    }

    private static void DrawPolyline(Graphics g, Pen pen, PointF[] points)
    {
        if (points.Length == 2)
            g.DrawLine(pen, points[0], points[1]);
        else
            g.DrawLines(pen, points);
    }

    private static void DrawPolylineWithBridges(
        Graphics g,
        Pen pen,
        PointF[] points,
        List<(float T, PointF Pt)> crossings,
        float bridgeRadius)
    {
        var crossIdx = 0;
        for (var si = 1; si < points.Length; si++)
        {
            var segStart = points[si - 1];
            var segEnd = points[si];

            var segCrossings = new List<PointF>();
            while (crossIdx < crossings.Count && crossings[crossIdx].T <= si)
            {
                if (crossings[crossIdx].T >= si - 1)
                    segCrossings.Add(crossings[crossIdx].Pt);
                crossIdx++;
            }

            if (segCrossings.Count == 0)
            {
                g.DrawLine(pen, segStart, segEnd);
                continue;
            }

            var dx = segEnd.X - segStart.X;
            var dy = segEnd.Y - segStart.Y;
            var segLen = MathF.Sqrt(dx * dx + dy * dy);
            segCrossings.Sort((a, b) =>
            {
                var da = (a.X - segStart.X) * dx + (a.Y - segStart.Y) * dy;
                var db = (b.X - segStart.X) * dx + (b.Y - segStart.Y) * dy;
                return da.CompareTo(db);
            });

            var current = segStart;
            var ndx = segLen > 0.001f ? dx / segLen : 0f;
            var ndy = segLen > 0.001f ? dy / segLen : 0f;
            var angle = MathF.Atan2(ndy, ndx) * 180f / MathF.PI;

            foreach (var crossPt in segCrossings)
            {
                var beforePt = new PointF(crossPt.X - ndx * bridgeRadius, crossPt.Y - ndy * bridgeRadius);
                var afterPt = new PointF(crossPt.X + ndx * bridgeRadius, crossPt.Y + ndy * bridgeRadius);

                if (DistanceBetween(current, beforePt) > 0.5f)
                    g.DrawLine(pen, current, beforePt);

                var arcRect = new RectangleF(
                    crossPt.X - bridgeRadius,
                    crossPt.Y - bridgeRadius,
                    bridgeRadius * 2,
                    bridgeRadius * 2);
                g.DrawArc(pen, arcRect, angle + 180f, -180f);

                current = afterPt;
            }

            if (DistanceBetween(current, segEnd) > 0.5f)
                g.DrawLine(pen, current, segEnd);
        }
    }

    private static List<(float T, PointF Pt)> FilterCrossingsWithinFlatLength(
        PointF[] flat,
        IReadOnlyList<(float T, PointF Pt)> crossings)
    {
        if (crossings.Count == 0 || flat.Length < 2)
            return [];

        var maxT = flat.Length - 1;
        return crossings.Where(c => c.T >= 0.05f && c.T <= maxT - 0.05f).ToList();
    }

    private static PointF[] FlattenBezier(PointF p0, PointF p1, PointF p2, PointF p3, int steps = 32)
    {
        var pts = new PointF[steps + 1];
        for (var i = 0; i <= steps; i++)
        {
            var t = (float)i / steps;
            pts[i] = EvaluateBezier(p0, p1, p2, p3, t);
        }

        return pts;
    }

    private static PointF EvaluateBezier(PointF p0, PointF p1, PointF p2, PointF p3, float t)
    {
        var u = 1f - t;
        return new PointF(
            u * u * u * p0.X + 3f * u * u * t * p1.X + 3f * u * t * t * p2.X + t * t * t * p3.X,
            u * u * u * p0.Y + 3f * u * u * t * p1.Y + 3f * u * t * t * p2.Y + t * t * t * p3.Y);
    }

    private static PointF? SegmentIntersection(PointF a1, PointF a2, PointF b1, PointF b2)
    {
        var adx = a2.X - a1.X;
        var ady = a2.Y - a1.Y;
        var bdx = b2.X - b1.X;
        var bdy = b2.Y - b1.Y;
        var denom = adx * bdy - ady * bdx;
        if (MathF.Abs(denom) < 0.0001f)
            return null;

        var t = ((b1.X - a1.X) * bdy - (b1.Y - a1.Y) * bdx) / denom;
        var u = ((b1.X - a1.X) * ady - (b1.Y - a1.Y) * adx) / denom;
        if (t < 0.05f || t > 0.95f || u < 0.05f || u > 0.95f)
            return null;

        return new PointF(a1.X + t * adx, a1.Y + t * ady);
    }

    private static PointF ShortenToward(PointF from, PointF to, float distanceFromTo)
    {
        var dx = to.X - from.X;
        var dy = to.Y - from.Y;
        var len = MathF.Sqrt(dx * dx + dy * dy);
        if (len <= distanceFromTo || len < 0.001f)
            return from;

        var ratio = (len - distanceFromTo) / len;
        return new PointF(from.X + dx * ratio, from.Y + dy * ratio);
    }

    private static PointF PointAtDistanceFromEnd(PointF[] flat, float distanceFromEnd)
    {
        var remaining = distanceFromEnd;
        for (var i = flat.Length - 1; i >= 1; i--)
        {
            var segLen = DistanceBetween(flat[i - 1], flat[i]);
            if (segLen >= remaining)
                return ShortenToward(flat[i - 1], flat[i], remaining);

            remaining -= segLen;
        }

        return flat[0];
    }

    private static PointF[] TrimFlatPath(PointF[] flat, PointF segmentEnd)
    {
        const float eps = 0.75f;
        if (flat.Length < 2)
            return flat;

        if (DistanceBetween(flat[^1], segmentEnd) < eps)
        {
            var copy = (PointF[])flat.Clone();
            copy[^1] = segmentEnd;
            return copy;
        }

        var trimmed = new List<PointF> { flat[0] };
        for (var i = 1; i < flat.Length; i++)
        {
            var segStart = flat[i - 1];
            var segEnd = flat[i];
            var segLen = DistanceBetween(segStart, segEnd);
            if (segLen < eps)
                continue;

            var dStart = DistanceBetween(segmentEnd, segStart);
            var dEnd = DistanceBetween(segmentEnd, segEnd);
            if (MathF.Abs(dStart + dEnd - segLen) < 1.5f)
            {
                trimmed.Add(segmentEnd);
                return trimmed.ToArray();
            }

            trimmed.Add(segEnd);
        }

        trimmed.Add(segmentEnd);
        return trimmed.ToArray();
    }

    private static float FindBezierTrimParameterFromEnd(PointF p0, PointF p1, PointF p2, PointF p3, float distanceFromEnd)
    {
        var total = BezierArcLength(p0, p1, p2, p3, 0f, 1f);
        if (total <= distanceFromEnd)
            return 0f;

        var low = 0f;
        var high = 1f;
        for (var i = 0; i < 24; i++)
        {
            var mid = (low + high) * 0.5f;
            var tailLen = BezierArcLength(p0, p1, p2, p3, mid, 1f);
            if (tailLen > distanceFromEnd)
                low = mid;
            else
                high = mid;
        }

        return low;
    }

    private static float BezierArcLength(PointF p0, PointF p1, PointF p2, PointF p3, float t0, float t1, int steps = 20)
    {
        var length = 0f;
        var prev = EvaluateBezier(p0, p1, p2, p3, t0);
        for (var i = 1; i <= steps; i++)
        {
            var t = t0 + (t1 - t0) * i / steps;
            var pt = EvaluateBezier(p0, p1, p2, p3, t);
            length += DistanceBetween(prev, pt);
            prev = pt;
        }

        return length;
    }

    private static PointF[] GetBezierLeftSegment(PointF p0, PointF p1, PointF p2, PointF p3, float t)
    {
        var l01 = Lerp(p0, p1, t);
        var l12 = Lerp(p1, p2, t);
        var l23 = Lerp(p2, p3, t);
        var l012 = Lerp(l01, l12, t);
        var l123 = Lerp(l12, l23, t);
        var q3 = Lerp(l012, l123, t);
        return [p0, l01, l012, q3];
    }

    private static PointF Lerp(PointF a, PointF b, float t) =>
        new(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t);

    private static float DistanceBetween(PointF a, PointF b)
    {
        var dx = a.X - b.X;
        var dy = a.Y - b.Y;
        return MathF.Sqrt(dx * dx + dy * dy);
    }

    private static float DistanceToSegment(PointF p, PointF a, PointF b)
    {
        var dx = b.X - a.X;
        var dy = b.Y - a.Y;
        var lenSq = dx * dx + dy * dy;
        if (lenSq < 0.0001f)
            return DistanceBetween(p, a);

        var t = Math.Clamp(((p.X - a.X) * dx + (p.Y - a.Y) * dy) / lenSq, 0f, 1f);
        var proj = new PointF(a.X + t * dx, a.Y + t * dy);
        return DistanceBetween(p, proj);
    }
}
