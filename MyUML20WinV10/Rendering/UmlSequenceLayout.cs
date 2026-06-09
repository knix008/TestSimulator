using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

public static class UmlSequenceLayout
{
    public const float MessageSpacing = 48f;
    public const float MinActivationHeight = 44f;
    public const float ActivationHalfWidth = 8f;
    public const float BottomPadding = 48f;
    public const float SelfMessageLoopWidth = 52f;
    public const float SelfMessageLoopHeight = 36f;
    // Header box height is fixed so it doesn't balloon as the lifeline node gets taller.
    public const float HeaderHeight = 40f;

    public static void Prepare(UmlProject project, UmlDiagram diagram)
    {
        if (diagram.Kind != UmlDiagramKind.SequenceDiagram)
            return;

        AssignMissingSequenceY(diagram, project);
        EnsureLifelinesFitDiagram(project, diagram);
    }

    public static float GetHeaderBottom(RectangleF bounds) =>
        bounds.Top + HeaderHeight;

    public static float GetLifelineCenterX(RectangleF bounds) =>
        bounds.Left + bounds.Width / 2f;

    public static bool IsLifeline(UmlProject project, UmlDiagramNode node) =>
        project.FindElement(node.ModelElementId) is UmlBehaviorNode { Kind: UmlBehaviorNodeKind.Lifeline };

    public static bool IsSequenceMessage(UmlProject project, UmlDiagram diagram, UmlDiagramEdge edge) =>
        diagram.Kind == UmlDiagramKind.SequenceDiagram
        && project.FindRelationship(edge.ModelElementId) is UmlBehaviorConnector { Kind: UmlBehaviorConnectorKind.Message };

    public static UmlMessageKind GetMessageKind(UmlProject project, UmlDiagramEdge edge)
    {
        if (project.FindRelationship(edge.ModelElementId) is UmlBehaviorConnector { Kind: UmlBehaviorConnectorKind.Message } connector)
            return connector.MessageKind;

        return UmlMessageKind.Synchronous;
    }

    public static bool IsSelfMessage(UmlProject project, UmlDiagramEdge edge) =>
        GetMessageKind(project, edge) == UmlMessageKind.SelfCall
        || edge.SourceNodeId == edge.TargetNodeId;

    public static float GetMessageY(UmlDiagram diagram, UmlDiagramEdge edge)
    {
        if (edge.SequenceY > 0f)
            return edge.SequenceY;

        return GetHeaderBottom(GetLifelineBounds(diagram, edge.SourceNodeId)) + MessageSpacing;
    }

    public static float GetMessageBottom(UmlProject project, UmlDiagram diagram, UmlDiagramEdge edge)
    {
        var y = GetMessageY(diagram, edge);
        return IsSelfMessage(project, edge) ? y + SelfMessageLoopHeight : y;
    }

    public static (PointF Start, PointF End) GetMessageEndpoints(UmlDiagram diagram, UmlDiagramEdge edge, float messageY)
    {
        var source = diagram.FindNode(edge.SourceNodeId)
            ?? throw new InvalidOperationException("Message source node not found.");
        var target = diagram.FindNode(edge.TargetNodeId)
            ?? throw new InvalidOperationException("Message target node not found.");

        var srcCx = GetLifelineCenterX(source.Bounds);
        var tgtCx = GetLifelineCenterX(target.Bounds);

        // Connect to the surface of the activation bar, not the lifeline center line.
        float startX, endX;
        if (srcCx < tgtCx)
        {
            startX = srcCx + ActivationHalfWidth;
            endX   = tgtCx - ActivationHalfWidth;
        }
        else if (srcCx > tgtCx)
        {
            startX = srcCx - ActivationHalfWidth;
            endX   = tgtCx + ActivationHalfWidth;
        }
        else
        {
            startX = srcCx;
            endX   = tgtCx;
        }

        return (new PointF(startX, messageY), new PointF(endX, messageY));
    }

    public static IEnumerable<(PointF Start, PointF End)> GetMessageSegments(
        UmlProject project,
        UmlDiagram diagram,
        UmlDiagramEdge edge)
    {
        var messageY = GetMessageY(diagram, edge);
        if (!IsSelfMessage(project, edge))
        {
            var (start, end) = GetMessageEndpoints(diagram, edge, messageY);
            yield return (start, end);
            yield break;
        }

        var node = diagram.FindNode(edge.SourceNodeId);
        if (node is null)
            yield break;

        // Self-message loop starts from the right surface of the activation bar.
        var cx = GetLifelineCenterX(node.Bounds);
        var barRight = cx + ActivationHalfWidth;
        var right = cx + SelfMessageLoopWidth;
        var bottom = messageY + SelfMessageLoopHeight;
        yield return (new PointF(barRight, messageY), new PointF(right, messageY));
        yield return (new PointF(right, messageY), new PointF(right, bottom));
        yield return (new PointF(right, bottom), new PointF(barRight, bottom));
    }

    public static float GetMinimumMessageY(UmlProject project, UmlDiagram diagram) =>
        diagram.Nodes
            .Where(n => IsLifeline(project, n))
            .Select(n => GetHeaderBottom(n.Bounds) + MessageSpacing * 0.5f)
            .DefaultIfEmpty(80f)
            .Max();

    /// <summary>
    /// Resolves a message Y from the pointer/click position for preview and drag snapping.
    /// </summary>
    public static float ResolveMessageY(UmlProject project, UmlDiagram diagram, float preferredY, bool snapToGrid = true)
    {
        var minY = GetMinimumMessageY(project, diagram);
        var y = Math.Max(minY, preferredY);
        if (!snapToGrid)
            return y;

        var steps = Math.Round((y - minY) / MessageSpacing);
        return minY + (float)steps * MessageSpacing;
    }

    /// <summary>
    /// Inserts a new sequence message at the click position and reflows all messages with uniform spacing.
    /// </summary>
    public static void InsertMessageAndReflow(
        UmlProject project,
        UmlDiagram diagram,
        UmlDiagramEdge newEdge,
        float preferredY) =>
        ReorderMessageAtPreferredY(project, diagram, newEdge, preferredY);

    /// <summary>
    /// Moves an existing message to a new vertical slot and reflows all messages with uniform spacing.
    /// </summary>
    public static void RepositionMessageAndReflow(
        UmlProject project,
        UmlDiagram diagram,
        UmlDiagramEdge movedEdge,
        float preferredY) =>
        ReorderMessageAtPreferredY(project, diagram, movedEdge, preferredY);

    private static void ReorderMessageAtPreferredY(
        UmlProject project,
        UmlDiagram diagram,
        UmlDiagramEdge edge,
        float preferredY)
    {
        if (diagram.Kind != UmlDiagramKind.SequenceDiagram)
            return;

        var messages = diagram.Edges
            .Where(e => IsSequenceMessage(project, diagram, e) && e.Id != edge.Id)
            .OrderBy(e => GetMessageY(diagram, e))
            .ThenBy(e => e.Id)
            .ToList();

        var insertIndex = FindMessageInsertIndex(project, diagram, messages, preferredY);
        messages.Insert(insertIndex, edge);
        ApplyUniformMessageLayout(project, diagram, messages);
        FitLifelinesToDiagram(project, diagram);
    }

    private static int FindMessageInsertIndex(
        UmlProject project,
        UmlDiagram diagram,
        IReadOnlyList<UmlDiagramEdge> orderedMessages,
        float preferredY)
    {
        if (orderedMessages.Count == 0)
            return 0;

        var firstY = GetMessageY(diagram, orderedMessages[0]);
        if (preferredY < firstY)
            return 0;

        for (var i = 0; i < orderedMessages.Count - 1; i++)
        {
            var gapMid = (GetMessageBottom(project, diagram, orderedMessages[i])
                + GetMessageY(diagram, orderedMessages[i + 1])) / 2f;
            if (preferredY < gapMid)
                return i + 1;
        }

        return orderedMessages.Count;
    }

    private static void ApplyUniformMessageLayout(
        UmlProject project,
        UmlDiagram diagram,
        IReadOnlyList<UmlDiagramEdge> orderedMessages)
    {
        if (orderedMessages.Count == 0)
            return;

        var y = GetBaseMessageY(project, diagram);
        foreach (var edge in orderedMessages)
        {
            edge.SequenceY = y;
            y = GetMessageBottom(project, diagram, edge) + MessageSpacing;
        }
    }

    private static float GetBaseMessageY(UmlProject project, UmlDiagram diagram) =>
        diagram.Nodes
            .Where(n => IsLifeline(project, n))
            .Select(n => GetHeaderBottom(n.Bounds) + MessageSpacing)
            .DefaultIfEmpty(80f)
            .Max();

    public static void EnsureLifelinesFitMessage(UmlProject project, UmlDiagram diagram, UmlDiagramEdge edge)
    {
        var bottom = GetMessageBottom(project, diagram, edge) + MinActivationHeight + BottomPadding;
        EnsureLifelinesFitBottom(project, diagram, bottom);
    }

    public static void EnsureLifelinesFitMessage(UmlProject project, UmlDiagram diagram, float messageY)
    {
        var requiredBottom = messageY + MinActivationHeight + BottomPadding;
        EnsureLifelinesFitBottom(project, diagram, requiredBottom);
    }

    public static IEnumerable<(RectangleF Rect, UmlDiagramNode Node)> GetActivationBars(UmlProject project, UmlDiagram diagram)
    {
        foreach (var lifeline in diagram.Nodes.Where(n => IsLifeline(project, n)))
        {
            foreach (var interval in BuildActivationIntervals(project, diagram, lifeline.Id))
            {
                var cx = GetLifelineCenterX(lifeline.Bounds);
                yield return (
                    new RectangleF(
                        cx - ActivationHalfWidth,
                        interval.Top,
                        ActivationHalfWidth * 2f,
                        interval.Bottom - interval.Top),
                    lifeline);
            }
        }
    }

    private static void EnsureLifelinesFitBottom(UmlProject project, UmlDiagram diagram, float requiredBottom)
    {
        foreach (var node in diagram.Nodes.Where(n => IsLifeline(project, n)))
        {
            var bottom = node.Y + node.Height;
            if (requiredBottom > bottom)
                node.Height = requiredBottom - node.Y;
        }
    }

    private static void AssignMissingSequenceY(UmlDiagram diagram, UmlProject project)
    {
        var missing = diagram.Edges
            .Where(e => IsSequenceMessage(project, diagram, e) && e.SequenceY <= 0f)
            .ToList();

        if (missing.Count == 0)
            return;

        var ordered = diagram.Edges
            .Where(e => IsSequenceMessage(project, diagram, e) && e.SequenceY > 0f)
            .OrderBy(e => e.SequenceY)
            .ThenBy(e => e.Id)
            .ToList();

        ordered.AddRange(missing);
        ApplyUniformMessageLayout(project, diagram, ordered);
        FitLifelinesToDiagram(project, diagram);
    }

    private static void EnsureLifelinesFitDiagram(UmlProject project, UmlDiagram diagram) =>
        FitLifelinesToDiagram(project, diagram);

    private static void FitLifelinesToDiagram(UmlProject project, UmlDiagram diagram)
    {
        const float minBodyBelowHeader = 160f;
        var contentBottom = diagram.Edges
            .Where(e => IsSequenceMessage(project, diagram, e))
            .Select(e => GetMessageBottom(project, diagram, e))
            .DefaultIfEmpty(0f)
            .Max();

        foreach (var node in diagram.Nodes.Where(n => IsLifeline(project, n)))
        {
            var headerBottom = GetHeaderBottom(node.Bounds);
            var minHeight = headerBottom - node.Y + minBodyBelowHeader;
            var fitHeight = contentBottom > 0f
                ? contentBottom - node.Y + MinActivationHeight + BottomPadding
                : minHeight;
            node.Height = Math.Max(minHeight, fitHeight);
        }
    }

    private static RectangleF GetLifelineBounds(UmlDiagram diagram, Guid nodeId)
    {
        var node = diagram.FindNode(nodeId);
        return node?.Bounds ?? RectangleF.Empty;
    }

    private static IEnumerable<(float Top, float Bottom)> BuildActivationIntervals(
        UmlProject project,
        UmlDiagram diagram,
        Guid lifelineNodeId)
    {
        var events = CollectLifelineMessages(project, diagram, lifelineNodeId)
            .OrderBy(e => e.Y)
            .ThenBy(e => e.Edge.Id)
            .ToList();

        if (events.Count == 0)
            yield break;

        var intervals = new List<(float Top, float Bottom)>();

        foreach (var evt in events)
        {
            if (evt.Kind == UmlMessageKind.SelfCall)
            {
                intervals.Add((evt.Y, evt.Y + SelfMessageLoopHeight));
                continue;
            }

            if (evt.TargetId == lifelineNodeId && evt.Kind is UmlMessageKind.Synchronous or UmlMessageKind.Asynchronous)
            {
                var end = FindMatchingReturnY(project, diagram, lifelineNodeId, evt.SourceId, evt.Y)
                    ?? FindNextLifelineEventY(events, lifelineNodeId, evt.Y)
                    ?? evt.Y + MinActivationHeight;
                intervals.Add((evt.Y, Math.Max(end, evt.Y + MinActivationHeight)));
            }

            if (evt.SourceId == lifelineNodeId && evt.Kind is UmlMessageKind.Synchronous or UmlMessageKind.Asynchronous)
            {
                var end = FindMatchingReturnY(project, diagram, evt.TargetId, lifelineNodeId, evt.Y)
                    ?? FindNextLifelineEventY(events, lifelineNodeId, evt.Y)
                    ?? evt.Y + MinActivationHeight;
                intervals.Add((evt.Y, Math.Max(end, evt.Y + MinActivationHeight)));
            }
        }

        foreach (var merged in MergeIntervals(intervals))
            yield return merged;
    }

    private static IEnumerable<(UmlDiagramEdge Edge, float Y, UmlMessageKind Kind, Guid SourceId, Guid TargetId)> CollectLifelineMessages(
        UmlProject project,
        UmlDiagram diagram,
        Guid lifelineNodeId)
    {
        foreach (var edge in diagram.Edges.Where(e => IsSequenceMessage(project, diagram, e)))
        {
            if (edge.SourceNodeId != lifelineNodeId && edge.TargetNodeId != lifelineNodeId)
                continue;

            yield return (
                edge,
                GetMessageY(diagram, edge),
                GetMessageKind(project, edge),
                edge.SourceNodeId,
                edge.TargetNodeId);
        }
    }

    private static float? FindMatchingReturnY(
        UmlProject project,
        UmlDiagram diagram,
        Guid fromNodeId,
        Guid toNodeId,
        float afterY)
    {
        return diagram.Edges
            .Where(e => IsSequenceMessage(project, diagram, e))
            .Where(e => GetMessageKind(project, e) == UmlMessageKind.Return)
            .Where(e => e.SourceNodeId == fromNodeId && e.TargetNodeId == toNodeId)
            .Select(e => GetMessageY(diagram, e))
            .Where(y => y > afterY + 0.5f)
            .OrderBy(y => y)
            .Cast<float?>()
            .FirstOrDefault();
    }

    private static float? FindNextLifelineEventY(
        IReadOnlyList<(UmlDiagramEdge Edge, float Y, UmlMessageKind Kind, Guid SourceId, Guid TargetId)> events,
        Guid lifelineNodeId,
        float afterY)
    {
        return events
            .Where(e => e.Y > afterY + 0.5f)
            .Select(e => (float?)e.Y)
            .FirstOrDefault();
    }

    private static IEnumerable<(float Top, float Bottom)> MergeIntervals(IReadOnlyList<(float Top, float Bottom)> intervals)
    {
        if (intervals.Count == 0)
            yield break;

        var ordered = intervals.OrderBy(i => i.Top).ToList();
        var top = ordered[0].Top;
        var bottom = ordered[0].Bottom;

        for (var i = 1; i < ordered.Count; i++)
        {
            var next = ordered[i];
            if (next.Top <= bottom + 2f)
            {
                bottom = Math.Max(bottom, next.Bottom);
                continue;
            }

            yield return (top, bottom);
            top = next.Top;
            bottom = next.Bottom;
        }

        yield return (top, bottom);
    }
}
