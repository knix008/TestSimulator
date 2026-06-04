using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public static class SequenceDiagramBuilder
{
    public static SequenceDiagramResult Build(CallGraphResult callGraph, string? rootNodeId)
    {
        if (string.IsNullOrWhiteSpace(rootNodeId) || !callGraph.NodeMap.TryGetValue(rootNodeId, out _))
        {
            return new SequenceDiagramResult();
        }

        var messages = new List<SequenceMessage>();
        var visitedCalls = new HashSet<(string Caller, string Callee)>();
        var participantOrder = new List<string> { rootNodeId };
        var participantSet = new HashSet<string>(StringComparer.Ordinal) { rootNodeId };
        var truncatedMessages = false;
        var truncatedParticipants = false;
        var order = 0;

        var stack = new Stack<(string CallerId, int Depth)>();
        stack.Push((rootNodeId, 0));

        while (stack.Count > 0)
        {
            var (callerId, depth) = stack.Pop();

            if (depth >= AnalysisScaleLimits.MaxCallGraphVisualDepth)
            {
                truncatedMessages = true;
                continue;
            }

            if (messages.Count >= AnalysisScaleLimits.MaxSequenceDiagramMessages)
            {
                truncatedMessages = true;
                break;
            }

            if (!callGraph.Outgoing.TryGetValue(callerId, out var callees) || callees.Count == 0)
            {
                continue;
            }

            for (var index = callees.Count - 1; index >= 0; index--)
            {
                if (messages.Count >= AnalysisScaleLimits.MaxSequenceDiagramMessages)
                {
                    truncatedMessages = true;
                    break;
                }

                var calleeId = callees[index];
                if (!callGraph.NodeMap.TryGetValue(calleeId, out var callee))
                {
                    continue;
                }

                if (!visitedCalls.Add((callerId, calleeId)))
                {
                    continue;
                }

                if (!participantSet.Contains(calleeId))
                {
                    if (participantSet.Count >= AnalysisScaleLimits.MaxSequenceDiagramParticipants)
                    {
                        truncatedParticipants = true;
                        continue;
                    }

                    participantSet.Add(calleeId);
                    participantOrder.Add(calleeId);
                }

                messages.Add(new SequenceMessage
                {
                    FromId = callerId,
                    ToId = calleeId,
                    Label = FormatMessageLabel(callee.DisplayName),
                    Order = order++
                });

                stack.Push((calleeId, depth + 1));
            }
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
                " — 루트 메서드를 더 좁게 선택하면 전체 흐름을 볼 수 있습니다.";
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

    private static string FormatMessageLabel(string displayName)
    {
        if (displayName.EndsWith(')'))
        {
            return displayName;
        }

        return displayName + "()";
    }
}
