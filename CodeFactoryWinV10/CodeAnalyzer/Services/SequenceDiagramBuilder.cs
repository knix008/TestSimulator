using System.Diagnostics;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

/// <summary>
/// 호출 그래프의 진입점(<see cref="CallGraphResult.ConventionEntryPointIds"/>)을 기준으로
/// 시퀀스 다이어그램을 구성합니다. 진입점마다 별도 패널을 만들고, 각 패널은 해당 진입점에서
/// 시작하는 호출 흐름만 펼칩니다.
/// </summary>
public static class SequenceDiagramBuilder
{
    public static SequenceDiagramDocument BuildDocument(
        CallGraphResult callGraph,
        IReadOnlyList<string> rootNodeIds,
        IProgress<AnalysisProgressReport>? progress = null)
    {
        var roots = ResolveSequenceEntryRoots(callGraph, rootNodeIds);
        if (roots.Count == 0)
        {
            return new SequenceDiagramDocument();
        }

        var panels = new List<SequenceDiagramPanel>();
        var stopwatch = Stopwatch.StartNew();

        for (var index = 0; index < roots.Count; index++)
        {
            var rootId = roots[index];
            ReportBuildProgress(progress, stopwatch, index, roots.Count);

            var diagram = BuildSingleRoot(callGraph, rootId);
            if (diagram.ParticipantIds.Count == 0)
            {
                continue;
            }

            panels.Add(new SequenceDiagramPanel
            {
                RootId = rootId,
                Title = FormatPanelTitle(callGraph, rootId),
                Diagram = diagram
            });
        }

        ReportBuildProgress(progress, stopwatch, roots.Count, roots.Count);

        string? note = roots.Count > AnalysisScaleLimits.MaxEntryPointTabsPerPage
            ? $"진입점 {roots.Count:N0}개 — 상단 페이지 선택(예: 0–9, 10–19)으로 나누어 표시합니다."
            : null;

        return new SequenceDiagramDocument
        {
            Panels = panels,
            IsTruncated = false,
            TruncationNote = note
        };
    }

    public static SequenceDiagramResult Build(CallGraphResult callGraph, IReadOnlyList<string> rootNodeIds)
    {
        var roots = ResolveSequenceEntryRoots(callGraph, rootNodeIds);
        if (roots.Count == 0)
        {
            return new SequenceDiagramResult();
        }

        if (roots.Count == 1)
        {
            return BuildSingleRoot(callGraph, roots[0]);
        }

        var messages = new List<SequenceMessage>();
        var participantOrder = new List<string>();
        var participantSet = new HashSet<string>(StringComparer.Ordinal);
        var order = 0;
        var isTruncated = false;

        foreach (var rootId in roots)
        {
            if (!TryAddParticipant(rootId, participantOrder, participantSet))
            {
                continue;
            }

            TraverseFromRoot(
                callGraph,
                rootId,
                messages,
                participantOrder,
                participantSet,
                ref order,
                ref isTruncated);

            if (isTruncated)
            {
                break;
            }
        }

        var map = participantOrder
            .Where(id => callGraph.NodeMap.ContainsKey(id))
            .ToDictionary(id => id, id => callGraph.NodeMap[id], StringComparer.Ordinal);

        return new SequenceDiagramResult
        {
            ParticipantIds = participantOrder,
            Messages = messages,
            ParticipantMap = map,
            IsTruncated = isTruncated,
            TruncationNote = isTruncated
                ? $"메시지 {AnalysisScaleLimits.MaxSequenceDiagramMessagesTotal:N0}개까지만 수집했습니다. 호출이 더 있습니다."
                : null
        };
    }

    public static SequenceDiagramResult BuildSingleRoot(CallGraphResult callGraph, string rootId)
    {
        if (string.IsNullOrWhiteSpace(rootId) || !callGraph.NodeMap.ContainsKey(rootId))
        {
            return new SequenceDiagramResult();
        }

        var messages = new List<SequenceMessage>();
        var participantOrder = new List<string>();
        var participantSet = new HashSet<string>(StringComparer.Ordinal);
        var order = 0;
        var isTruncated = false;

        if (!TryAddParticipant(rootId, participantOrder, participantSet))
        {
            return new SequenceDiagramResult();
        }

        TraverseFromRoot(
            callGraph,
            rootId,
            messages,
            participantOrder,
            participantSet,
            ref order,
            ref isTruncated);

        var map = participantOrder
            .Where(id => callGraph.NodeMap.ContainsKey(id))
            .ToDictionary(id => id, id => callGraph.NodeMap[id], StringComparer.Ordinal);

        return new SequenceDiagramResult
        {
            ParticipantIds = participantOrder,
            Messages = messages,
            ParticipantMap = map,
            IsTruncated = isTruncated,
            TruncationNote = isTruncated
                ? $"메시지 {AnalysisScaleLimits.MaxSequenceDiagramMessagesTotal:N0}개까지만 수집했습니다. 호출이 더 있습니다."
                : null
        };
    }

    /// <summary>
    /// 시퀀스 다이어그램 패널 기준 루트 목록을 반환합니다.
    /// 기본값은 호출 그래프 분석 시 저장된 진입점이며, 단일 함수가 선택된 경우에만 한 진입점으로 제한합니다.
    /// </summary>
    public static IReadOnlyList<string> ResolveSequenceEntryRoots(
        CallGraphResult callGraph,
        IReadOnlyList<string> selectedRootIds)
    {
        var entryPointIds = CallGraphEntryPointResolver.GetConventionEntryPointIds(callGraph);

        var explicitRoots = selectedRootIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Where(id => callGraph.NodeMap.ContainsKey(id))
            .Distinct(StringComparer.Ordinal)
            .ToList();

        if (explicitRoots.Count == 1)
        {
            return explicitRoots;
        }

        if (explicitRoots.Count > 1)
        {
            return OrderByEntryPointSequence(explicitRoots, entryPointIds);
        }

        if (entryPointIds.Count > 0)
        {
            return entryPointIds.ToList();
        }

        var fallback = CallGraphEntryPointResolver.FindFallbackRoot(callGraph);
        return fallback is null ? [] : [fallback.Id];
    }

    private static List<string> OrderByEntryPointSequence(
        IReadOnlyList<string> roots,
        IReadOnlyList<string> entryPointOrder)
    {
        if (entryPointOrder.Count == 0)
        {
            return roots.ToList();
        }

        var rootSet = roots.ToHashSet(StringComparer.Ordinal);
        var ordered = entryPointOrder.Where(rootSet.Contains).ToList();

        foreach (var root in roots)
        {
            if (!ordered.Contains(root))
            {
                ordered.Add(root);
            }
        }

        return ordered;
    }

    private static string FormatPanelTitle(CallGraphResult callGraph, string rootId)
    {
        if (!callGraph.NodeMap.TryGetValue(rootId, out var node))
        {
            return rootId;
        }

        return string.IsNullOrWhiteSpace(node.FullName) ? node.DisplayName : node.FullName;
    }

    private readonly record struct TraverseFrame(
        string CallerId,
        int Depth,
        int NextCalleeIndex,
        HashSet<string> Path);

    private static void TraverseFromRoot(
        CallGraphResult callGraph,
        string rootId,
        List<SequenceMessage> messages,
        List<string> participantOrder,
        HashSet<string> participantSet,
        ref int order,
        ref bool isTruncated)
    {
        var stack = new Stack<TraverseFrame>();
        stack.Push(new TraverseFrame(rootId, 0, 0, new HashSet<string>(StringComparer.Ordinal) { rootId }));

        while (stack.Count > 0)
        {
            var frame = stack.Pop();
            if (frame.Depth >= AnalysisScaleLimits.MaxSequenceDiagramDepth)
            {
                continue;
            }

            if (!callGraph.Outgoing.TryGetValue(frame.CallerId, out var callees) || callees.Count == 0)
            {
                continue;
            }

            var resumePushed = false;

            for (var index = frame.NextCalleeIndex; index < callees.Count; index++)
            {
                if (order >= AnalysisScaleLimits.MaxSequenceDiagramMessagesTotal)
                {
                    isTruncated = true;
                    return;
                }

                var calleeId = callees[index];
                if (!callGraph.NodeMap.TryGetValue(calleeId, out var callee))
                {
                    continue;
                }

                if (!TryAddParticipant(calleeId, participantOrder, participantSet))
                {
                    continue;
                }

                var isCycle = frame.Path.Contains(calleeId);
                messages.Add(new SequenceMessage
                {
                    FromId = frame.CallerId,
                    ToId = calleeId,
                    Label = FormatMessageLabel(callee.DisplayName, isCycle),
                    Order = order++
                });

                if (isCycle)
                {
                    continue;
                }

                if (!resumePushed)
                {
                    stack.Push(new TraverseFrame(frame.CallerId, frame.Depth, index + 1, frame.Path));
                    resumePushed = true;
                }

                var childPath = new HashSet<string>(frame.Path, StringComparer.Ordinal) { calleeId };
                stack.Push(new TraverseFrame(calleeId, frame.Depth + 1, 0, childPath));
                break;
            }
        }
    }

    private static bool TryAddParticipant(
        string participantId,
        List<string> participantOrder,
        HashSet<string> participantSet)
    {
        if (participantSet.Contains(participantId))
        {
            return true;
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

    private static void ReportBuildProgress(
        IProgress<AnalysisProgressReport>? progress,
        Stopwatch stopwatch,
        int processedRoots,
        int totalRoots)
    {
        if (progress is null || totalRoots <= 0)
        {
            return;
        }

        var current = Math.Min(processedRoots + 1, totalRoots);
        var percent = processedRoots >= totalRoots
            ? 70
            : (int)(processedRoots * 70.0 / totalRoots);
        var message = processedRoots >= totalRoots
            ? "진입점 분석 완료"
            : $"진입점 분석 중 ({current}/{totalRoots})...";

        progress.Report(new AnalysisProgressReport
        {
            Percent = percent,
            Message = message,
            Elapsed = stopwatch.Elapsed
        });
    }
}
