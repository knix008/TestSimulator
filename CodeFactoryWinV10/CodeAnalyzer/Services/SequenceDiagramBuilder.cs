using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public static class SequenceDiagramBuilder
{
    private const int MaxMessages = 40;

    public static SequenceDiagramResult Build(CallGraphResult callGraph, string? rootNodeId)
    {
        if (string.IsNullOrWhiteSpace(rootNodeId) || !callGraph.NodeMap.TryGetValue(rootNodeId, out var root))
        {
            return new SequenceDiagramResult();
        }

        var messages = new List<SequenceMessage>();
        var visitedCalls = new HashSet<(string Caller, string Callee)>();
        var order = 0;

        void Walk(string callerId, int depth)
        {
            if (depth > 8 || messages.Count >= MaxMessages)
            {
                return;
            }

            if (!callGraph.Outgoing.TryGetValue(callerId, out var callees))
            {
                return;
            }

            foreach (var calleeId in callees)
            {
                if (!callGraph.NodeMap.TryGetValue(calleeId, out var callee))
                {
                    continue;
                }

                if (!visitedCalls.Add((callerId, calleeId)))
                {
                    continue;
                }

                messages.Add(new SequenceMessage
                {
                    FromId = callerId,
                    ToId = calleeId,
                    Label = FormatMessageLabel(callee.DisplayName),
                    Order = order++
                });

                Walk(calleeId, depth + 1);
                if (messages.Count >= MaxMessages)
                {
                    return;
                }
            }
        }

        Walk(rootNodeId, 0);

        var participantIds = new List<string> { rootNodeId };
        foreach (var message in messages)
        {
            if (!participantIds.Contains(message.FromId))
            {
                participantIds.Add(message.FromId);
            }

            if (!participantIds.Contains(message.ToId))
            {
                participantIds.Add(message.ToId);
            }
        }

        var map = participantIds
            .Where(id => callGraph.NodeMap.ContainsKey(id))
            .ToDictionary(id => id, id => callGraph.NodeMap[id], StringComparer.Ordinal);

        return new SequenceDiagramResult
        {
            ParticipantIds = participantIds,
            Messages = messages,
            ParticipantMap = map
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
