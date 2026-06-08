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
        UserAnalysisSettings thresholds,
        GlobalVariableResult? globalVariables = null,
        DatabaseSchemaResult? databaseSchema = null)
    {
        var insights = new List<ArchitectureInsight>();
        var scope = MetricInspectionScope.Normalize(thresholds.EnabledInspections);
        var summary = metrics.Summary;
        var maxPerCategory = AnalysisScaleLimits.MaxArchitectureUiItemsPerCategory;
        var maxTotal = AnalysisScaleLimits.MaxArchitectureUiInsights;

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.ShowArchitectureTab))
        {
            insights.Add(new ArchitectureInsight
        {
            Kind = ArchitectureInsightKind.Summary,
            Category = "요약",
            IsCategorySummary = true,
            Description =
                $"호출 그래프 {callGraph.NodeMap.Count:N0}함수 · {callGraph.Edges.Count:N0}호출 · " +
                $"파일 연관 {fileRelations.Files.Count:N0}파일 · {fileRelations.Edges.Count:N0}연결 · " +
                $"디렉터리 {directoryRelations.Directories.Count:N0}개 · {directoryRelations.Edges.Count:N0}연결 · " +
                $"중복 {summary.ProjectDuplicateLinePercent:F1}% ({summary.DuplicateLineCount:N0}줄) · " +
                $"순환 {summary.CircularCallChainCount}건 · TODO {summary.TotalTodoMarkers:N0}개"
            });
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.TypeStructure)
            && structure.Types.Count > 0)
        {
            var inheritanceCount = structure.Relations.Count(relation =>
                relation.Kind is StructureRelationKind.Inheritance or StructureRelationKind.Implementation);
            var dependencyCount = structure.Relations.Count(relation =>
                relation.Kind == StructureRelationKind.Dependency);

            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.TypeStructure,
                Category = "타입 구조",
                IsCategorySummary = true,
                Description =
                    $"타입 {structure.Types.Count:N0}개 · 상속/구현 {inheritanceCount:N0} · 의존 {dependencyCount:N0}"
            });
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.CircularCalls))
        {
            AddCircularCallInsights(insights, summary, maxPerCategory);
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.FileCoupling))
        {
            AddFileCouplingInsights(insights, fileRelations, maxPerCategory);
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.DirectoryCoupling))
        {
            AddDirectoryCouplingInsights(insights, directoryRelations, maxPerCategory);
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.FanOutHub)
            || MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.FanInHub))
        {
            AddHubInsights(insights, metrics.Functions, thresholds, maxPerCategory, scope);
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.IsolatedFunctions))
        {
            AddIsolatedFunctionInsights(insights, metrics.Functions, maxPerCategory);
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.GlobalVariables))
        {
            AddGlobalVariableInsights(insights, globalVariables, maxPerCategory);
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.DatabaseSchema))
        {
            AddDatabaseSchemaInsights(insights, databaseSchema);
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.FileDuplicateLines))
        {
            AddFileDuplicateInsights(insights, metrics, duplicates, maxPerCategory);
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.GodFile)
            || MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.LowCommentRatio))
        {
            AddGodFileAndCommentInsights(insights, metrics, thresholds, maxPerCategory, scope);
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.DuplicateCodeGroups))
        {
            AddDuplicateInsights(insights, duplicates);
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.PossiblyUnusedCode))
        {
            AddPossiblyUnusedInsights(insights, metrics.Functions, maxPerCategory);
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.CatchQuality))
        {
            AddCatchQualityInsights(insights, metrics.Functions, maxPerCategory);
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.AsyncVoid))
        {
            AddAsyncVoidInsights(insights, metrics.Functions, maxPerCategory);
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.TestCodeRatio))
        {
            AddTestCoverageInsights(insights, summary);
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.PackageInstability))
        {
            AddPackageInstabilityInsights(insights, metrics.Packages, thresholds, maxPerCategory);
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.LayerViolation))
        {
            AddLayerViolationInsights(insights, fileRelations, maxPerCategory);
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.SecuritySmells))
        {
            AddSecuritySmellInsights(insights, metrics, thresholds, maxPerCategory);
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.GitHotspot))
        {
            AddGitHotspotInsights(insights, metrics, thresholds, maxPerCategory);
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.TypeCohesion)
            || MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.InheritanceDepth))
        {
            AddTypeQualityInsights(insights, structure, metrics.Functions, thresholds, maxPerCategory, scope);
        }

        var duplicateInsights = insights
            .Where(insight => insight.Kind == ArchitectureInsightKind.DuplicateCode
                && insight.NavigationTag is DuplicateCodeGroup)
            .ToList();
        var otherInsights = insights
            .Where(insight => insight.Kind != ArchitectureInsightKind.DuplicateCode
                || insight.NavigationTag is not DuplicateCodeGroup)
            .ToList();

        if (otherInsights.Count > maxTotal)
        {
            otherInsights = otherInsights.Take(maxTotal).ToList();
        }

        return otherInsights.Concat(duplicateInsights).ToList();
    }

    private static void AddCircularCallInsights(
        List<ArchitectureInsight> insights,
        CodeQualitySummary summary,
        int maxPerCategory)
    {
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
                IsCategorySummary = true,
                Description = "검출된 순환 호출 체인이 없습니다."
            });
        }
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
                IsCategorySummary = true,
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
            IsCategorySummary = true,
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
                IsCategorySummary = true,
                Description = $"디렉터리 {directoryRelations.Directories.Count:N0}개 · 디렉터리 간 호출 관계 없음"
            });
            return;
        }

        insights.Add(new ArchitectureInsight
        {
            Kind = ArchitectureInsightKind.DirectoryCoupling,
            Category = "디렉터리 연관",
            IsCategorySummary = true,
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
        int maxPerCategory,
        MetricInspectionKind scope)
    {
        if (functions.Count == 0)
        {
            return;
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.FanOutHub))
        {
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
                IsCategorySummary = true,
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
        }

        if (!MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.FanInHub))
        {
            return;
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
                IsCategorySummary = true,
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
            IsCategorySummary = true,
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

    }

    private static void AddGlobalVariableInsights(
        List<ArchitectureInsight> insights,
        GlobalVariableResult? globalVariables,
        int maxPerCategory)
    {
        if (globalVariables is null || globalVariables.Variables.Count == 0)
        {
            return;
        }

        var mutablePublic = globalVariables.Variables.Count(IsPublicMutable);

        insights.Add(new ArchitectureInsight
        {
            Kind = ArchitectureInsightKind.GlobalVariable,
            Category = "전역 변수",
            IsCategorySummary = true,
            Description =
                $"전역 {globalVariables.Variables.Count:N0}개 · public mutable {mutablePublic:N0}개",
            Severity = mutablePublic >= 5 ? WarningLevel.Warning : WarningLevel.None
        });

        foreach (var variable in globalVariables.Variables
                     .OrderByDescending(variable => IsPublicAccess(variable) ? 1 : 0)
                     .ThenBy(variable => variable.Name, StringComparer.CurrentCultureIgnoreCase)
                     .Take(maxPerCategory))
        {
            var isPublicMutable = IsPublicMutable(variable);
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.GlobalVariable,
                Category = "전역 변수",
                Description =
                    $"{variable.Name} · {variable.Scope} · 접근 {globalVariables.GetAccessesFor(variable.Id).Count}함수 · " +
                    $"{Path.GetFileName(variable.FilePath)}:{variable.LineNumber}",
                Severity = isPublicMutable ? WarningLevel.Warning : WarningLevel.None,
                NavigationTag = variable
            });
        }

    }

    private static void AddDatabaseSchemaInsights(
        List<ArchitectureInsight> insights,
        DatabaseSchemaResult? databaseSchema)
    {
        if (databaseSchema is null || databaseSchema.Tables.Count == 0)
        {
            return;
        }

        var withoutFk = databaseSchema.Tables.Count(table =>
            !table.Columns.Any(column => column.IsForeignKey)
            && databaseSchema.Relations.All(relation => relation.FromTableId != table.Id));

        insights.Add(new ArchitectureInsight
        {
            Kind = ArchitectureInsightKind.DatabaseSchema,
            Category = "DB 스키마",
            IsCategorySummary = true,
            Description =
                $"테이블 {databaseSchema.Tables.Count:N0} · 관계 {databaseSchema.Relations.Count:N0} · FK 없음 {withoutFk:N0}",
            Severity = databaseSchema.Tables.Count >= 30 ? WarningLevel.Warning : WarningLevel.None
        });

        foreach (var table in databaseSchema.Tables
                     .OrderByDescending(table => table.Columns.Count))
        {
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.DatabaseSchema,
                Category = "DB 스키마",
                Description =
                    $"{table.Name} · 컬럼 {table.Columns.Count} · {Path.GetFileName(table.FilePath)}",
                NavigationTag = table
            });
        }
    }

    private static void AddFileDuplicateInsights(
        List<ArchitectureInsight> insights,
        CodeMetricsResult metrics,
        DuplicateCodeResult duplicates,
        int maxPerCategory)
    {
        if (duplicates.Groups.Count == 0)
        {
            return;
        }

        var byFile = DuplicateLinesByFileIndex.Build(duplicates);
        var fileRows = metrics.FileAggregates.Count > 0
            ? metrics.FileAggregates
            : metrics.Files.Select(file => new FileAggregateMetric
            {
                FilePath = file.FilePath,
                LanguageId = file.LanguageId,
                PhysicalLines = file.PhysicalLines,
                CodeLines = file.CodeLines,
                TodoMarkerCount = file.TodoMarkerCount,
                TodoDensityPer100Lines = file.TodoDensityPer100Lines,
                CommentPercentPer100Code = file.CommentPercentPer100Code,
                DuplicateLineCount = byFile.GetValueOrDefault(file.FilePath),
                FunctionCount = 0,
                MinMaintenanceIndex = 100
            }).ToList();

        var top = fileRows
            .Where(file => file.DuplicateLineCount > 0)
            .OrderByDescending(file => file.DuplicateLineCount)
            .Take(maxPerCategory)
            .ToList();

        if (top.Count == 0)
        {
            return;
        }

        insights.Add(new ArchitectureInsight
        {
            Kind = ArchitectureInsightKind.FileDuplicate,
            Category = "파일별 중복",
            IsCategorySummary = true,
            Description = $"중복 구간에 참여한 파일 {byFile.Count:N0}개 (상위 표시)",
            Severity = WarningLevel.Warning
        });

        foreach (var file in top)
        {
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.FileDuplicate,
                Category = "파일별 중복",
                Description =
                    $"{Path.GetFileName(file.FilePath)} · 중복 참여 {file.DuplicateLineCount:N0}줄 · 코드 {file.CodeLines:N0}줄",
                Severity = file.DuplicateLineCount >= 80 ? WarningLevel.Critical : WarningLevel.Warning,
                NavigationTag = file
            });
        }
    }

    private static void AddGodFileAndCommentInsights(
        List<ArchitectureInsight> insights,
        CodeMetricsResult metrics,
        UserAnalysisSettings thresholds,
        int maxPerCategory,
        MetricInspectionKind scope)
    {
        var fileRows = metrics.FileAggregates.Count > 0
            ? metrics.FileAggregates
            : metrics.Files.Select(file => new FileAggregateMetric
            {
                FilePath = file.FilePath,
                LanguageId = file.LanguageId,
                PhysicalLines = file.PhysicalLines,
                CodeLines = file.CodeLines,
                TodoMarkerCount = file.TodoMarkerCount,
                TodoDensityPer100Lines = file.TodoDensityPer100Lines,
                CommentPercentPer100Code = file.CommentPercentPer100Code,
                FunctionCount = 0,
                MinMaintenanceIndex = 100
            }).ToList();

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.GodFile))
        {
        var godFiles = fileRows
            .Where(file => FileMetricsAggregator.IsGodFile(file, thresholds))
            .OrderByDescending(file => file.CodeLines)
            .Take(maxPerCategory)
            .ToList();

        if (godFiles.Count > 0)
        {
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.GodFile,
                Category = "God file",
                IsCategorySummary = true,
                Description =
                    $"코드 줄 ≥{thresholds.WarnGodFileCodeLines} 인 파일 {fileRows.Count(f => FileMetricsAggregator.IsGodFile(f, thresholds)):N0}개",
                Severity = WarningLevel.Warning
            });

            foreach (var file in godFiles)
            {
                insights.Add(new ArchitectureInsight
                {
                    Kind = ArchitectureInsightKind.GodFile,
                    Category = "God file",
                    Description = $"{Path.GetFileName(file.FilePath)} · {file.CodeLines:N0}줄",
                    Severity = file.CodeLines >= thresholds.WarnGodFileCodeLines * 2
                        ? WarningLevel.Critical
                        : WarningLevel.Warning,
                    NavigationTag = file
                });
            }
        }
        }

        if (!MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.LowCommentRatio))
        {
            return;
        }

        var lowComment = fileRows
            .Where(file => FileMetricsAggregator.IsLowCommentFile(file, thresholds))
            .OrderBy(file => file.CommentPercentPer100Code)
            .Take(maxPerCategory)
            .ToList();

        if (lowComment.Count == 0)
        {
            return;
        }

        insights.Add(new ArchitectureInsight
        {
            Kind = ArchitectureInsightKind.LowComment,
            Category = "주석 부족",
            IsCategorySummary = true,
            Description =
                $"주석 비율 <{thresholds.WarnMinCommentPercent:F0}% (코드 {FileMetricsAggregator.MinCodeLinesForCommentWarning}줄 이상) · {lowComment.Count:N0}파일",
            Severity = WarningLevel.None
        });

        foreach (var file in lowComment)
        {
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.LowComment,
                Category = "주석 부족",
                Description =
                    $"{Path.GetFileName(file.FilePath)} · 주석 {file.CommentPercentPer100Code:F1}% · 코드 {file.CodeLines:N0}줄",
                NavigationTag = file
            });
        }
    }

    private static void AddDuplicateInsights(
        List<ArchitectureInsight> insights,
        DuplicateCodeResult duplicates)
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
            IsCategorySummary = true,
            Description =
                $"그룹 {duplicates.Groups.Count:N0}건 · 위치 {totalFragments:N0}곳 · 최소 {duplicates.MinDuplicateLines}줄 기준",
            Severity = WarningLevel.Warning
        });

        foreach (var group in duplicates.Groups
                     .OrderByDescending(group => group.LineCount * Math.Max(1, group.Fragments.Count))
                     .ThenByDescending(group => group.LineCount))
        {
            var locations = string.Join(", ",
                group.Fragments
                    .Select(fragment => $"{Path.GetFileName(fragment.FilePath)}:{fragment.StartLine}"));

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
    }

    private static bool IsPublicAccess(GlobalVariableItem variable) =>
        !string.IsNullOrEmpty(variable.AccessModifier)
        && variable.AccessModifier.Contains("public", StringComparison.OrdinalIgnoreCase);

    private static bool IsPublicMutable(GlobalVariableItem variable) =>
        IsPublicAccess(variable) && !variable.IsReadOnly && !variable.IsConst;

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

    private static void AddPossiblyUnusedInsights(
        List<ArchitectureInsight> insights,
        IReadOnlyList<FunctionMetric> functions,
        int maxPerCategory)
    {
        var unused = functions
            .Where(func => func.IsPossiblyUnused)
            .OrderByDescending(func => func.LineCount)
            .ToList();

        if (unused.Count == 0)
        {
            return;
        }

        insights.Add(new ArchitectureInsight
        {
            Kind = ArchitectureInsightKind.PossiblyUnusedCode,
            Category = "미사용 가능",
            IsCategorySummary = true,
            Description = $"private·미호출 함수 {unused.Count:N0}개",
            Severity = unused.Count >= 10 ? WarningLevel.Warning : WarningLevel.None
        });

        foreach (var func in unused.Take(maxPerCategory))
        {
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.PossiblyUnusedCode,
                Category = "미사용 가능",
                Description = $"{func.DisplayName} · {func.LineCount}줄 · {Path.GetFileName(func.FilePath)}:{func.StartLine}",
                NavigationTag = func
            });
        }
    }

    private static void AddCatchQualityInsights(
        List<ArchitectureInsight> insights,
        IReadOnlyList<FunctionMetric> functions,
        int maxPerCategory)
    {
        var targets = functions
            .Where(func => func.EmptyCatchCount > 0 || func.BroadCatchCount > 0)
            .OrderByDescending(func => func.EmptyCatchCount + func.BroadCatchCount)
            .ToList();

        if (targets.Count == 0)
        {
            return;
        }

        insights.Add(new ArchitectureInsight
        {
            Kind = ArchitectureInsightKind.CatchQuality,
            Category = "catch 품질",
            IsCategorySummary = true,
            Description = $"빈/광범위 catch 함수 {targets.Count:N0}개",
            Severity = WarningLevel.Warning
        });

        foreach (var func in targets.Take(maxPerCategory))
        {
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.CatchQuality,
                Category = "catch 품질",
                Description =
                    $"{func.DisplayName} · 빈 {func.EmptyCatchCount} · 광범위 {func.BroadCatchCount} · {Path.GetFileName(func.FilePath)}:{func.StartLine}",
                NavigationTag = func
            });
        }
    }

    private static void AddAsyncVoidInsights(
        List<ArchitectureInsight> insights,
        IReadOnlyList<FunctionMetric> functions,
        int maxPerCategory)
    {
        var asyncVoid = functions.Where(func => func.IsAsyncVoid).ToList();
        if (asyncVoid.Count == 0)
        {
            return;
        }

        insights.Add(new ArchitectureInsight
        {
            Kind = ArchitectureInsightKind.AsyncVoid,
            Category = "async void",
            IsCategorySummary = true,
            Description = $"async void 함수 {asyncVoid.Count:N0}개",
            Severity = WarningLevel.Warning
        });

        foreach (var func in asyncVoid.Take(maxPerCategory))
        {
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.AsyncVoid,
                Category = "async void",
                Description = $"{func.DisplayName} · {Path.GetFileName(func.FilePath)}:{func.StartLine}",
                NavigationTag = func
            });
        }
    }

    private static void AddTestCoverageInsights(
        List<ArchitectureInsight> insights,
        CodeQualitySummary summary)
    {
        insights.Add(new ArchitectureInsight
        {
            Kind = ArchitectureInsightKind.TestCoverage,
            Category = "테스트 비율",
            IsCategorySummary = true,
            Description = $"테스트 코드 LOC 비율(근사): {summary.TestCodeLinePercent:F1}%",
            Severity = summary.TestCodeLinePercent < 10 ? WarningLevel.Warning : WarningLevel.None
        });
    }

    private static void AddPackageInstabilityInsights(
        List<ArchitectureInsight> insights,
        IReadOnlyList<PackageMetric> packages,
        UserAnalysisSettings thresholds,
        int maxPerCategory)
    {
        var unstable = packages
            .Where(package => package.Instability >= thresholds.WarnInstability)
            .OrderByDescending(package => package.Instability)
            .ToList();

        if (unstable.Count == 0)
        {
            return;
        }

        insights.Add(new ArchitectureInsight
        {
            Kind = ArchitectureInsightKind.PackageInstability,
            Category = "패키지 불안정성",
            IsCategorySummary = true,
            Description = $"I ≥ {thresholds.WarnInstability:F2} 패키지 {unstable.Count:N0}개",
            Severity = WarningLevel.Warning
        });

        foreach (var package in unstable.Take(maxPerCategory))
        {
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.PackageInstability,
                Category = "패키지 불안정성",
                Description =
                    $"{package.DirectoryPath} · I={package.Instability:F2} · Ce={package.EfferentCoupling} · Ca={package.AfferentCoupling} · D={package.DistanceFromMainSequence:F2}"
            });
        }
    }

    private static void AddLayerViolationInsights(
        List<ArchitectureInsight> insights,
        FileRelationGraphResult fileRelations,
        int maxPerCategory)
    {
        var violations = LayerViolationDetector.Detect(fileRelations);
        if (violations.Count == 0)
        {
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.LayerViolation,
                Category = "계층 위반",
                IsCategorySummary = true,
                Description = "폴더명 휴리스틱 기준 계층 위반 없음"
            });
            return;
        }

        insights.Add(new ArchitectureInsight
        {
            Kind = ArchitectureInsightKind.LayerViolation,
            Category = "계층 위반",
            IsCategorySummary = true,
            Description = $"파일 의존 계층 위반 {violations.Count:N0}건",
            Severity = WarningLevel.Warning
        });

        foreach (var violation in violations.Take(maxPerCategory))
        {
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.LayerViolation,
                Category = "계층 위반",
                Description =
                    $"{violation.Description} · {Path.GetFileName(violation.FromFile)} → {Path.GetFileName(violation.ToFile)}"
            });
        }
    }

    private static void AddSecuritySmellInsights(
        List<ArchitectureInsight> insights,
        CodeMetricsResult metrics,
        UserAnalysisSettings thresholds,
        int maxPerCategory)
    {
        var files = metrics.FileAggregates.Count > 0
            ? metrics.FileAggregates.Where(file => file.SecuritySmellCount >= thresholds.WarnSecuritySmellCount).ToList()
            : metrics.Files.Where(file => file.SecuritySmellCount >= thresholds.WarnSecuritySmellCount)
                .Select(file => new FileAggregateMetric
                {
                    FilePath = file.FilePath,
                    LanguageId = file.LanguageId,
                    PhysicalLines = file.PhysicalLines,
                    CodeLines = file.CodeLines,
                    SecuritySmellCount = file.SecuritySmellCount
                }).ToList();

        if (files.Count == 0)
        {
            return;
        }

        insights.Add(new ArchitectureInsight
        {
            Kind = ArchitectureInsightKind.SecuritySmell,
            Category = "보안 smell",
            IsCategorySummary = true,
            Description = $"의심 패턴 파일 {files.Count:N0}개",
            Severity = WarningLevel.Warning
        });

        foreach (var file in files
                     .OrderByDescending(file => file.SecuritySmellCount)
                     .Take(maxPerCategory))
        {
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.SecuritySmell,
                Category = "보안 smell",
                Description = $"{Path.GetFileName(file.FilePath)} · {file.SecuritySmellCount}건",
                NavigationTag = file
            });
        }
    }

    private static void AddGitHotspotInsights(
        List<ArchitectureInsight> insights,
        CodeMetricsResult metrics,
        UserAnalysisSettings thresholds,
        int maxPerCategory)
    {
        var files = metrics.FileAggregates.Count > 0
            ? metrics.FileAggregates.Where(file => file.GitChangeLineCount >= thresholds.WarnGitChangeLines).ToList()
            : metrics.Files.Where(file => file.GitChangeLineCount >= thresholds.WarnGitChangeLines)
                .Select(file => new FileAggregateMetric
                {
                    FilePath = file.FilePath,
                    LanguageId = file.LanguageId,
                    PhysicalLines = file.PhysicalLines,
                    CodeLines = file.CodeLines,
                    GitChangeLineCount = file.GitChangeLineCount,
                    MaxCyclomaticComplexity = 0
                }).ToList();

        if (files.Count == 0)
        {
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.GitHotspot,
                Category = "Git 핫스팟",
                IsCategorySummary = true,
                Description = "최근 6개월 Git 변경 상한 미만 (또는 Git 저장소 없음)"
            });
            return;
        }

        insights.Add(new ArchitectureInsight
        {
            Kind = ArchitectureInsightKind.GitHotspot,
            Category = "Git 핫스팟",
            IsCategorySummary = true,
            Description = $"변경 줄 ≥{thresholds.WarnGitChangeLines:N0} 파일 {files.Count:N0}개",
            Severity = WarningLevel.Warning
        });

        foreach (var file in files
                     .OrderByDescending(file => file.GitChangeLineCount)
                     .Take(maxPerCategory))
        {
            insights.Add(new ArchitectureInsight
            {
                Kind = ArchitectureInsightKind.GitHotspot,
                Category = "Git 핫스팟",
                Description =
                    $"{Path.GetFileName(file.FilePath)} · 변경 {file.GitChangeLineCount:N0}줄 · CC↑ {file.MaxCyclomaticComplexity}",
                NavigationTag = file
            });
        }
    }

    private static void AddTypeQualityInsights(
        List<ArchitectureInsight> insights,
        ProjectStructureResult structure,
        IReadOnlyList<FunctionMetric> functions,
        UserAnalysisSettings thresholds,
        int maxPerCategory,
        MetricInspectionKind scope)
    {
        if (structure.Types.Count == 0)
        {
            return;
        }

        var typeMetrics = TypeMetricsBuilder.Build(structure, functions, thresholds);

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.TypeCohesion))
        {
            var lowCohesion = typeMetrics
                .Where(type => type.LackOfCohesion >= thresholds.WarnLackOfCohesion)
                .OrderByDescending(type => type.LackOfCohesion)
                .ToList();

            if (lowCohesion.Count > 0)
            {
                insights.Add(new ArchitectureInsight
                {
                    Kind = ArchitectureInsightKind.TypeCohesion,
                    Category = "타입 응집도",
                    IsCategorySummary = true,
                    Description = $"LCOM ≥ {thresholds.WarnLackOfCohesion:F2} 타입 {lowCohesion.Count:N0}개",
                    Severity = WarningLevel.Warning
                });

                foreach (var type in lowCohesion.Take(maxPerCategory))
                {
                    insights.Add(new ArchitectureInsight
                    {
                        Kind = ArchitectureInsightKind.TypeCohesion,
                        Category = "타입 응집도",
                        Description = $"{type.DisplayName} · LCOM {type.LackOfCohesion:F2} · WMC {type.WeightedMethodCount}",
                        NavigationTag = type
                    });
                }
            }
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.InheritanceDepth))
        {
            var deepTypes = typeMetrics
                .Where(type => type.DepthOfInheritance >= thresholds.WarnInheritanceDepth)
                .OrderByDescending(type => type.DepthOfInheritance)
                .ToList();

            if (deepTypes.Count > 0)
            {
                insights.Add(new ArchitectureInsight
                {
                    Kind = ArchitectureInsightKind.InheritanceMetrics,
                    Category = "상속 구조",
                    IsCategorySummary = true,
                    Description = $"DIT ≥ {thresholds.WarnInheritanceDepth} 타입 {deepTypes.Count:N0}개",
                    Severity = WarningLevel.Warning
                });

                foreach (var type in deepTypes.Take(maxPerCategory))
                {
                    insights.Add(new ArchitectureInsight
                    {
                        Kind = ArchitectureInsightKind.InheritanceMetrics,
                        Category = "상속 구조",
                        Description =
                            $"{type.DisplayName} · DIT {type.DepthOfInheritance} · NOC {type.NumberOfChildren} · RFC {type.ResponseForClass}",
                        NavigationTag = type
                    });
                }
            }
        }
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
