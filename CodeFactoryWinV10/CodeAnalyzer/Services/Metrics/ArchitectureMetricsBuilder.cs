using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Services.Metrics;

public static class ArchitectureMetricsBuilder
{
    private const int MaxCycleSearchDepth = 64;

    public static IReadOnlyList<ArchitectureInsight> BuildInsights(
        CodeMetricsResult metrics,
        CallGraphResult callGraph,
        FileRelationGraphResult fileRelations,
        DirectoryRelationGraphResult directoryRelations,
        ProjectStructureResult structure,
        DuplicateCodeResult duplicates,
        UserAnalysisSettings thresholds)
    {
        var insights = new List<ArchitectureInsight>();
        var summary = metrics.Summary;
        var maxPerCategory = AnalysisScaleLimits.MaxArchitectureUiItemsPerCategory;
        var maxTotal = AnalysisScaleLimits.MaxArchitectureUiInsights;

        insights.Add(new ArchitectureInsight
        {
            Kind = ArchitectureInsightKind.Summary,
            Category = "요약",
            Description =
                $"호출 그래프 {callGraph.NodeMap.Count:N0}함수 · {callGraph.Edges.Count:N0}호출 · " +
                $"파일 연관 {fileRelations.Files.Count:N0}파일 · {fileRelations.Edges.Count:N0}연결 · " +
                $"디렉터리 {directoryRelations.Directories.Count:N0}개 · {directoryRelations.Edges.Count:N0}연결 · " +
                $"중복 {summary.ProjectDuplicateLinePercent:F1}% ({summary.DuplicateLineCount:N0}줄) · " +
                $"순환 {summary.CircularCallChainCount}건 · TODO {summary.TotalTodoMarkers:N0}개"
        });

        if (structure.Types.Count > 0)
        {
            var inheritanceCount = structure.Relations.Count(relation =>
                relation.Kind is StructureRelationKind.Inheritance or StructureRelationKind.Implementation);
            var dependencyCount = structure.Relations.Count(relation =>
                relation.Kind == StructureRelationKind.Dependency);

            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.TypeStructure,
                Category = "타입 구조",
                Description =
                    $"타입 {structure.Types.Count:N0}개 · 상속/구현 {inheritanceCount:N0} · 의존 {dependencyCount:N0}"
            });
        }

        foreach (var chain in summary.CircularCallChains.Take(maxPerCategory))
        {
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.CircularCall,
                Category = "순환 호출",
                Description = chain.DisplayText,
                Severity = WarningLevel.Critical,
                NavigationTag = chain
            });
        }

        if (summary.CircularCallChainCount == 0)
        {
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.CircularCall,
                Category = "순환 호출",
                Description = "검출된 순환 호출 체인이 없습니다."
            });
        }
        else if (summary.CircularCallChainCount > maxPerCategory)
        {
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.CircularCall,
                Category = "순환 호출",
                Description = $"외 {summary.CircularCallChainCount - maxPerCategory:N0}건 더 있음 (상위 {maxPerCategory}건만 표시)",
                Severity = WarningLevel.Warning
            });
        }

        AddFileCouplingInsights(insights, fileRelations, maxPerCategory);
        AddDirectoryCouplingInsights(insights, directoryRelations, maxPerCategory);
        AddHubInsights(insights, metrics.Functions, thresholds, maxPerCategory);
        AddIsolatedFunctionInsights(insights, metrics.Functions, maxPerCategory);
        AddDuplicateInsights(insights, duplicates, maxPerCategory);

        return insights.Count <= maxTotal
            ? insights
            : insights.Take(maxTotal).ToList();
    }

    private static void AddFileCouplingInsights(
        List<ArchitectureInsight> insights,
        FileRelationGraphResult fileRelations,
        int maxPerCategory)
    {
        if (fileRelations.Edges.Count == 0)
        {
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.FileCoupling,
                Category = "파일 연관",
                Description = "파일 간 호출 관계가 없습니다."
            });
            return;
        }

        var topOutgoing = fileRelations.Files
            .Select(file => new
            {
                File = file,
                OutCount = fileRelations.Outgoing.TryGetValue(file.Id, out var outgoing) ? outgoing.Count : 0
            })
            .OrderByDescending(entry => entry.OutCount)
            .ThenBy(entry => entry.File.DisplayName, StringComparer.CurrentCultureIgnoreCase)
            .Take(maxPerCategory)
            .ToList();

        insights.Add(new ArchitectureInsight
        {
            Kind = ArchitectureInsightKind.FileCoupling,
            Category = "파일 연관",
            Description =
                $"파일 {fileRelations.Files.Count:N0}개 · 호출 연결 {fileRelations.Edges.Count:N0}건 · " +
                $"최다 호출 {fileRelations.Edges.Max(edge => edge.CallCount):N0}회"
        });

        foreach (var edge in fileRelations.Edges
                     .OrderByDescending(edge => edge.CallCount)
                     .ThenBy(edge => edge.FromFileId, StringComparer.OrdinalIgnoreCase)
                     .Take(maxPerCategory))
        {
            var fromName = ResolveFileName(fileRelations, edge.FromFileId);
            var toName = ResolveFileName(fileRelations, edge.ToFileId);
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.FileCoupling,
                Category = "파일 연관",
                Description = $"{fromName} → {toName} ({edge.CallCount:N0}회)",
                Severity = edge.CallCount >= 20 ? WarningLevel.Warning : WarningLevel.None,
                NavigationTag = edge
            });
        }

        if (topOutgoing.Count > 0 && topOutgoing[0].OutCount > 0)
        {
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.FileCoupling,
                Category = "파일 허브",
                Description =
                    "다수 파일을 호출: " +
                    string.Join(" · ", topOutgoing
                        .Where(entry => entry.OutCount > 0)
                        .Select(entry => $"{entry.File.DisplayName}({entry.OutCount})")),
                Severity = topOutgoing[0].OutCount >= 10 ? WarningLevel.Warning : WarningLevel.None
            });
        }
    }

    private static void AddDirectoryCouplingInsights(
        List<ArchitectureInsight> insights,
        DirectoryRelationGraphResult directoryRelations,
        int maxPerCategory)
    {
        if (directoryRelations.Directories.Count == 0)
        {
            return;
        }

        if (directoryRelations.Edges.Count == 0)
        {
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.DirectoryCoupling,
                Category = "디렉터리 연관",
                Description = $"디렉터리 {directoryRelations.Directories.Count:N0}개 · 디렉터리 간 호출 관계 없음"
            });
            return;
        }

        insights.Add(new ArchitectureInsight
        {
            Kind = ArchitectureInsightKind.DirectoryCoupling,
            Category = "디렉터리 연관",
            Description =
                $"디렉터리 {directoryRelations.Directories.Count:N0}개 · 연결 {directoryRelations.Edges.Count:N0}건 · " +
                $"최다 호출 {directoryRelations.Edges.Max(edge => edge.CallCount):N0}회"
        });

        foreach (var edge in directoryRelations.Edges
                     .OrderByDescending(edge => edge.CallCount)
                     .ThenBy(edge => edge.FromDirectoryId, StringComparer.OrdinalIgnoreCase)
                     .Take(maxPerCategory))
        {
            var fromName = ResolveDirectoryName(directoryRelations, edge.FromDirectoryId);
            var toName = ResolveDirectoryName(directoryRelations, edge.ToDirectoryId);
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.DirectoryCoupling,
                Category = "디렉터리 연관",
                Description = $"{fromName} → {toName} ({edge.CallCount:N0}회)",
                Severity = edge.CallCount >= 10 ? WarningLevel.Warning : WarningLevel.None,
                NavigationTag = edge
            });
        }
    }

    private static void AddHubInsights(
        List<ArchitectureInsight> insights,
        IReadOnlyList<FunctionMetric> functions,
        UserAnalysisSettings thresholds,
        int maxPerCategory)
    {
        if (functions.Count == 0)
        {
            return;
        }

        var fanOutHubs = functions
            .Where(func => func.FanOut >= thresholds.WarnFanOut)
            .OrderByDescending(func => func.FanOut)
            .ThenByDescending(func => func.FanIn)
            .ThenBy(func => func.DisplayName, StringComparer.CurrentCultureIgnoreCase)
            .Take(maxPerCategory)
            .ToList();

        if (fanOutHubs.Count > 0)
        {
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.FanOutHub,
                Category = "Fan-Out 허브",
                Description = $"기준 {thresholds.WarnFanOut} 이상 {functions.Count(func => func.FanOut >= thresholds.WarnFanOut):N0}개",
                Severity = WarningLevel.Warning
            });

            foreach (var func in fanOutHubs)
            {
                insights.Add(new ArchitectureInsight
                {
                    Kind = ArchitectureInsightKind.FanOutHub,
                    Category = "Fan-Out 허브",
                    Description =
                        $"{func.DisplayName} · Out {func.FanOut} · In {func.FanIn} · {Path.GetFileName(func.FilePath)}",
                    Severity = func.FanOut >= thresholds.WarnFanOut * 2
                        ? WarningLevel.Critical
                        : WarningLevel.Warning,
                    NavigationTag = func
                });
            }
        }

        var fanInHubs = functions
            .Where(func => func.FanIn >= Math.Max(thresholds.WarnFanOut, 3))
            .OrderByDescending(func => func.FanIn)
            .ThenByDescending(func => func.FanOut)
            .ThenBy(func => func.DisplayName, StringComparer.CurrentCultureIgnoreCase)
            .Take(maxPerCategory)
            .ToList();

        if (fanInHubs.Count > 0)
        {
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.FanInHub,
                Category = "Fan-In 허브",
                Description = $"다수 호출을 받는 함수 {fanInHubs.Count:N0}개 (상위 표시)",
                Severity = WarningLevel.None
            });

            foreach (var func in fanInHubs)
            {
                insights.Add(new ArchitectureInsight
                {
                    Kind = ArchitectureInsightKind.FanInHub,
                    Category = "Fan-In 허브",
                    Description =
                        $"{func.DisplayName} · In {func.FanIn} · Out {func.FanOut} · {Path.GetFileName(func.FilePath)}",
                    NavigationTag = func
                });
            }
        }
    }

    private static void AddIsolatedFunctionInsights(
        List<ArchitectureInsight> insights,
        IReadOnlyList<FunctionMetric> functions,
        int maxPerCategory)
    {
        var isolated = functions
            .Where(func => func.FanIn == 0 && func.FanOut == 0)
            .OrderByDescending(func => func.LineCount)
            .ThenBy(func => func.DisplayName, StringComparer.CurrentCultureIgnoreCase)
            .ToList();

        if (isolated.Count == 0)
        {
            return;
        }

        insights.Add(new ArchitectureInsight
        {
            Kind = ArchitectureInsightKind.IsolatedFunction,
            Category = "고립 함수",
            Description =
                $"호출 그래프에서 In/Out 모두 0인 함수 {isolated.Count:N0}개 (미사용·진입점·분석 누락 가능)",
            Severity = isolated.Count >= 20 ? WarningLevel.Warning : WarningLevel.None
        });

        foreach (var func in isolated.Take(maxPerCategory))
        {
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.IsolatedFunction,
                Category = "고립 함수",
                Description =
                    $"{func.DisplayName} · {func.LineCount}줄 · {Path.GetFileName(func.FilePath)}:{func.StartLine}",
                NavigationTag = func
            });
        }

        if (isolated.Count > maxPerCategory)
        {
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.IsolatedFunction,
                Category = "고립 함수",
                Description = $"외 {isolated.Count - maxPerCategory:N0}개 더 있음"
            });
        }
    }

    private static void AddDuplicateInsights(
        List<ArchitectureInsight> insights,
        DuplicateCodeResult duplicates,
        int maxPerCategory)
    {
        if (duplicates.Groups.Count == 0)
        {
            return;
        }

        var totalFragments = duplicates.Groups.Sum(group => group.Fragments.Count);
        insights.Add(new ArchitectureInsight
        {
            Kind = ArchitectureInsightKind.DuplicateCode,
            Category = "중복 코드",
            Description =
                $"그룹 {duplicates.Groups.Count:N0}건 · 위치 {totalFragments:N0}곳 · 최소 {duplicates.MinDuplicateLines}줄 기준",
            Severity = WarningLevel.Warning
        });

        foreach (var group in duplicates.Groups
                     .OrderByDescending(group => group.LineCount * Math.Max(1, group.Fragments.Count))
                     .ThenByDescending(group => group.LineCount)
                     .Take(maxPerCategory))
        {
            var locations = string.Join(", ",
                group.Fragments
                    .Take(3)
                    .Select(fragment => $"{Path.GetFileName(fragment.FilePath)}:{fragment.StartLine}"));

            if (group.Fragments.Count > 3)
            {
                locations += $" 외 {group.Fragments.Count - 3}곳";
            }

            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.DuplicateCode,
                Category = "중복 코드",
                Description = $"{group.LineCount}줄 × {group.Fragments.Count}곳 · {locations}",
                Severity = group.LineCount >= duplicates.MinDuplicateLines * 2
                    ? WarningLevel.Critical
                    : WarningLevel.Warning,
                NavigationTag = group
            });
        }

        if (duplicates.Groups.Count > maxPerCategory)
        {
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.DuplicateCode,
                Category = "중복 코드",
                Description = $"외 {duplicates.Groups.Count - maxPerCategory:N0}그룹 더 있음"
            });
        }
    }

    private static string ResolveFileName(FileRelationGraphResult fileRelations, string fileId)
    {
        if (fileRelations.FileMap.TryGetValue(fileId, out var file))
        {
            return file.DisplayName;
        }

        return fileId;
    }

    private static string ResolveDirectoryName(DirectoryRelationGraphResult directoryRelations, string directoryId)
    {
        if (directoryRelations.DirectoryMap.TryGetValue(directoryId, out var directory))
        {
            return directory.DisplayName;
        }

        return directoryId;
    }

    public static IReadOnlyList<CircularCallChain> FindCircularCallChains(CallGraphResult callGraph, int maxChains = 20)
    {
        if (callGraph.NodeMap.Count == 0
            || callGraph.NodeMap.Count > AnalysisScaleLimits.MaxNodesForCircularCallDetection)
        {
            return [];
        }

        var cycles = new List<CircularCallChain>();
        var visited = new HashSet<string>(StringComparer.Ordinal);
        var stack = new HashSet<string>(StringComparer.Ordinal);
        var path = new List<string>();
        var reportedKeys = new HashSet<string>(StringComparer.Ordinal);

        foreach (var nodeId in callGraph.NodeMap.Keys.OrderBy(id => id, StringComparer.Ordinal))
        {
            if (visited.Contains(nodeId))
            {
                continue;
            }

            Dfs(nodeId, 0);
            if (cycles.Count >= maxChains)
            {
                break;
            }
        }

        return cycles;

        void Dfs(string nodeId, int depth)
        {
            if (cycles.Count >= maxChains)
            {
                return;
            }

            visited.Add(nodeId);
            stack.Add(nodeId);
            path.Add(nodeId);

            if (depth < MaxCycleSearchDepth
                && callGraph.Outgoing.TryGetValue(nodeId, out var children))
            {
                foreach (var child in children.OrderBy(id => id, StringComparer.Ordinal))
                {
                    if (stack.Contains(child))
                    {
                        var cycleStart = path.IndexOf(child);
                        if (cycleStart >= 0)
                        {
                            var cycleIds = path.Skip(cycleStart).Append(child).ToList();
                            var key = string.Join("|", cycleIds);
                            if (reportedKeys.Add(key))
                            {
                                cycles.Add(new CircularCallChain
                                {
                                    DisplayText = string.Join(" → ", cycleIds.Select(FormatNode)),
                                    NodeIds = cycleIds
                                });
                            }
                        }

                        continue;
                    }

                    if (!visited.Contains(child))
                    {
                        Dfs(child, depth + 1);
                        if (cycles.Count >= maxChains)
                        {
                            break;
                        }
                    }
                }
            }

            stack.Remove(nodeId);
            path.RemoveAt(path.Count - 1);
        }

        string FormatNode(string id)
        {
            if (callGraph.NodeMap.TryGetValue(id, out var node))
            {
                return node.DisplayName;
            }

            return id;
        }
    }
}
