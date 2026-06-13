using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public static class SequenceDiagramBuilder
{
    public static SequenceDiagramResult Build(CallGraphResult callGraph, string? rootNodeId) =>
        Build(callGraph, string.IsNullOrWhiteSpace(rootNodeId) ? [] : [rootNodeId]);

    public static SequenceDiagramResult Build(CallGraphResult callGraph, IReadOnlyList<string> rootNodeIds)
    {
        var roots = rootNodeIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Where(id => callGraph.NodeMap.ContainsKey(id))
            .Distinct(StringComparer.Ordinal)
            .ToList();

        if (roots.Count == 0)
        {
            return new SequenceDiagramResult();
        }

        var messages = new List<SequenceMessage>();
        var participantOrder = new List<string>();
        var participantSet = new HashSet<string>(StringComparer.Ordinal);
        var truncatedMessages = false;
        var truncatedParticipants = false;
        var order = 0;

        foreach (var rootId in roots)
        {
            if (!TryAddParticipant(rootId, participantOrder, participantSet, ref truncatedParticipants))
            {
                continue;
            }

            var visitedOnPath = new HashSet<string>(StringComparer.Ordinal) { rootId };
            Traverse(
                callGraph,
                rootId,
                depth: 0,
                visitedOnPath,
                messages,
                participantOrder,
                participantSet,
                ref order,
                ref truncatedMessages,
                ref truncatedParticipants);
        }

        var map = participantOrder
            .Where(id => callGraph.NodeMap.ContainsKey(id))
            .ToDictionary(id => id, id => callGraph.NodeMap[id], StringComparer.Ordinal);

        var truncated = truncatedMessages || truncatedParticipants;
        string? note = null;
        if (truncated)
        {
            var parts = new List<string>();
            if (truncatedMessages)
            {
                parts.Add($"메시지 상한 {AnalysisScaleLimits.MaxSequenceDiagramMessages}건");
            }

            if (truncatedParticipants)
            {
                parts.Add($"참가자 상한 {AnalysisScaleLimits.MaxSequenceDiagramParticipants}개");
            }

            note =
                string.Join(" · ", parts) +
                " — 시작 함수를 하나로 좁히면 전체 흐름을 볼 수 있습니다.";
        }

        return new SequenceDiagramResult
        {
            ParticipantIds = participantOrder,
            Messages = messages,
            ParticipantMap = map,
            IsTruncated = truncated,
            TruncationNote = note
        };
    }

    private static void Traverse(
        CallGraphResult callGraph,
        string callerId,
        int depth,
        HashSet<string> visitedOnPath,
        List<SequenceMessage> messages,
        List<string> participantOrder,
        HashSet<string> participantSet,
        ref int order,
        ref bool truncatedMessages,
        ref bool truncatedParticipants)
    {
        if (depth >= AnalysisScaleLimits.MaxCallGraphVisualDepth)
        {
            truncatedMessages = true;
            return;
        }

        if (messages.Count >= AnalysisScaleLimits.MaxSequenceDiagramMessages)
        {
            truncatedMessages = true;
            return;
        }

        if (!callGraph.Outgoing.TryGetValue(callerId, out var callees) || callees.Count == 0)
        {
            return;
        }

        foreach (var calleeId in callees)
        {
            if (messages.Count >= AnalysisScaleLimits.MaxSequenceDiagramMessages)
            {
                truncatedMessages = true;
                return;
            }

            if (!callGraph.NodeMap.TryGetValue(calleeId, out var callee))
            {
                continue;
            }

            if (!TryAddParticipant(calleeId, participantOrder, participantSet, ref truncatedParticipants))
            {
                continue;
            }

            var isCycle = visitedOnPath.Contains(calleeId);
            messages.Add(new SequenceMessage
            {
                FromId = callerId,
                ToId = calleeId,
                Label = FormatMessageLabel(callee.DisplayName, isCycle),
                Order = order++
            });

            if (isCycle)
            {
                continue;
            }

            visitedOnPath.Add(calleeId);
            Traverse(
                callGraph,
                calleeId,
                depth + 1,
                visitedOnPath,
                messages,
                participantOrder,
                participantSet,
                ref order,
                ref truncatedMessages,
                ref truncatedParticipants);
            visitedOnPath.Remove(calleeId);
        }
    }

    private static bool TryAddParticipant(
        string participantId,
        List<string> participantOrder,
        HashSet<string> participantSet,
        ref bool truncatedParticipants)
    {
        if (participantSet.Contains(participantId))
        {
            return true;
        }

        if (participantSet.Count >= AnalysisScaleLimits.MaxSequenceDiagramParticipants)
        {
            truncatedParticipants = true;
            return false;
        }

        participantSet.Add(participantId);
        participantOrder.Add(participantId);
        return true;
    }

    private static string FormatMessageLabel(string displayName, bool isCycle)
    {
        var label = displayName.EndsWith(")", StringComparison.Ordinal)
            ? displayName
            : displayName + "()";

        return isCycle ? label + " ↺" : label;
    }
}
