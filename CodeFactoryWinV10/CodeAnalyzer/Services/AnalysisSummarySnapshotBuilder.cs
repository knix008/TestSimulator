using CodeAnalyzer.Models;
using CodeAnalyzer.Services.Metrics;

namespace CodeAnalyzer.Services;

public static class AnalysisSummarySnapshotBuilder
{
    public static AnalysisSummarySnapshot Build(AnalysisResult analysis)
    {
        var inspections = analysis.QualityThresholds.EnabledInspections;
        var areas = new List<AnalysisSummaryArea>();

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Overview, inspections))
        {
            areas.Add(BuildOverview(analysis, inspections));
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.CallGraph, inspections))
        {
            areas.Add(BuildCallGraph(analysis));
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Quality, inspections))
        {
            areas.Add(BuildQuality(analysis));
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Duplicates, inspections))
        {
            areas.Add(BuildDuplicates(analysis));
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Structure, inspections))
        {
            areas.Add(BuildStructure(analysis));
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Relations, inspections))
        {
            areas.Add(BuildRelations(analysis));
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Globals, inspections))
        {
            areas.Add(BuildGlobals(analysis));
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Database, inspections))
        {
            areas.Add(BuildDatabase(analysis));
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.BugRisk, inspections))
        {
            areas.Add(BuildBugRisk(analysis));
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Issues, inspections) && analysis.Issues.Count > 0)
        {
            areas.Add(BuildIssues(analysis));
        }

        return new AnalysisSummarySnapshot
        {
            RadarAxes = AnalysisSummaryRadarBuilder.Build(analysis, inspections),
            Areas = areas
        };
    }

    private static AnalysisSummaryArea BuildOverview(AnalysisResult analysis, MetricInspectionKind inspections)
    {
        var summary = analysis.Metrics.Summary;
        var metricRows = new List<AnalysisSummaryMetricRow>();
        var summaryParts = new List<string>();
        var qualityScore = AnalysisSummaryRadarBuilder.ComputeAverageScore(analysis, inspections);

        metricRows.Add(new AnalysisSummaryMetricRow { Label = "품질 점수", Value = qualityScore });
        summaryParts.Add($"품질 점수 {qualityScore:0.#}점");

        if (AnalysisScopeResolver.RequiresCodeMetrics(inspections))
        {
            var (none, warn, critical) = CountFunctionWarningLevels(analysis);
            metricRows.Add(new AnalysisSummaryMetricRow { Label = "정상 함수", Value = none });
            metricRows.Add(new AnalysisSummaryMetricRow { Label = "경고 함수", Value = warn });
            metricRows.Add(new AnalysisSummaryMetricRow { Label = "심각 함수", Value = critical });
            summaryParts.Add($"개선 필요 {warn + critical:N0}함수");

            AddQualityIssueMetrics(metricRows, summary, inspections);
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.BugRisk, inspections))
        {
            var bugCritical = analysis.BugRisk.Findings.Count(f => f.Severity == BugRiskSeverity.Critical);
            metricRows.Add(new AnalysisSummaryMetricRow { Label = "버그 위험", Value = analysis.BugRisk.Findings.Count });
            metricRows.Add(new AnalysisSummaryMetricRow { Label = "Critical 버그", Value = bugCritical });
            summaryParts.Add($"버그 위험 {analysis.BugRisk.Findings.Count:N0}건");
        }

        return new AnalysisSummaryArea
        {
            Kind = SummaryAreaKind.Overview,
            Title = "품질 총괄",
            SummaryText = summaryParts.Count > 0
                ? string.Join(" · ", summaryParts)
                : "선택된 분석 범위의 품질 요약",
            Metrics = metricRows
        };
    }

    private static AnalysisSummaryArea BuildCallGraph(AnalysisResult analysis)
    {
        var summary = analysis.Metrics.Summary;
        var bucketCounts = new int[4];
        foreach (var node in analysis.CallGraph.Nodes)
        {
            var fanOut = analysis.CallGraph.Edges.Count(edge =>
                string.Equals(edge.CallerId, node.Id, StringComparison.Ordinal));
            var index = fanOut switch
            {
                <= 2 => 0,
                <= 5 => 1,
                <= 10 => 2,
                _ => 3
            };
            bucketCounts[index]++;
        }

        var topRiskFiles = analysis.Metrics.FileAggregates
            .Where(file => file.WarningFunctionCount > 0)
            .OrderByDescending(file => file.WarningFunctionCount)
            .ThenByDescending(file => file.MaxFanOut)
            .Take(5)
            .Select(file => new AnalysisSummaryMetricRow
            {
                Label = Truncate(Path.GetFileName(file.FilePath), 36),
                Value = file.WarningFunctionCount,
                Detail = $"Fan-out 최대 {file.MaxFanOut} · {file.FilePath}"
            })
            .ToList();

        var metrics = new List<AnalysisSummaryMetricRow>
        {
            new() { Label = "순환 호출", Value = summary.CircularCallChainCount },
            new() { Label = "고 Fan-out", Value = summary.HighFanOutCount },
            new() { Label = "미사용 의심", Value = summary.PossiblyUnusedCount },
            new() { Label = "Fan-out 11+", Value = bucketCounts[3] },
            new() { Label = "Fan-out 6-10", Value = bucketCounts[2] },
            new() { Label = "Fan-out 3-5", Value = bucketCounts[1] },
            new() { Label = "Fan-out 1-2", Value = bucketCounts[0] }
        };
        metrics.AddRange(topRiskFiles);

        return new AnalysisSummaryArea
        {
            Kind = SummaryAreaKind.CallGraph,
            Title = "호출 구조 품질",
            SummaryText =
                $"순환 {summary.CircularCallChainCount:N0} · 고 Fan-out {summary.HighFanOutCount:N0} · " +
                $"미사용 의심 {summary.PossiblyUnusedCount:N0}",
            Metrics = metrics
        };
    }

    private static AnalysisSummaryArea BuildQuality(AnalysisResult analysis)
    {
        var thresholds = analysis.QualityThresholds;
        var none = 0;
        var warn = 0;
        var critical = 0;
        foreach (var function in analysis.Metrics.Functions)
        {
            switch (FileMetricsAggregator.GetFunctionWarningLevel(function, thresholds))
            {
                case WarningLevel.Critical:
                    critical++;
                    break;
                case WarningLevel.Warning:
                    warn++;
                    break;
                default:
                    none++;
                    break;
            }
        }

        var summary = analysis.Metrics.Summary;
        return new AnalysisSummaryArea
        {
            Kind = SummaryAreaKind.Quality,
            Title = "메트릭 경고",
            SummaryText =
                $"경고 {warn:N0} · 심각 {critical:N0} · 순환 {summary.CircularCallChainCount:N0} · " +
                $"God file {summary.GodFileCount:N0} · 보안 smell {summary.SecuritySmellFileCount:N0}",
            Metrics =
            [
                new AnalysisSummaryMetricRow { Label = "정상 함수", Value = none },
                new AnalysisSummaryMetricRow { Label = "경고 함수", Value = warn },
                new AnalysisSummaryMetricRow { Label = "심각 함수", Value = critical },
                new AnalysisSummaryMetricRow { Label = "고 CC", Value = summary.HighCyclomaticCount },
                new AnalysisSummaryMetricRow { Label = "고 인지 복잡도", Value = summary.HighCognitiveCount },
                new AnalysisSummaryMetricRow { Label = "깊은 중첩", Value = summary.DeepNestingCount },
                new AnalysisSummaryMetricRow { Label = "낮은 MI", Value = summary.LowMaintenanceIndexCount },
                new AnalysisSummaryMetricRow { Label = "God file", Value = summary.GodFileCount },
                new AnalysisSummaryMetricRow { Label = "TODO 과다 파일", Value = summary.HighTodoDensityFileCount },
                new AnalysisSummaryMetricRow { Label = "보안 smell", Value = summary.SecuritySmellFileCount },
                new AnalysisSummaryMetricRow { Label = "빈 catch", Value = summary.EmptyCatchFunctionCount },
                new AnalysisSummaryMetricRow { Label = "미사용 의심", Value = summary.PossiblyUnusedCount }
            ]
        };
    }

    private static AnalysisSummaryArea BuildDuplicates(AnalysisResult analysis)
    {
        var summary = analysis.Metrics.Summary;
        var duplicateLines = summary.DuplicateLineCount;
        var uniqueLines = Math.Max(0, summary.TotalCodeLines - duplicateLines);
        var topGroups = analysis.Duplicates.Groups
            .OrderByDescending(group => group.LineCount)
            .Take(5)
            .Select(group => new AnalysisSummaryMetricRow
            {
                Label = Truncate(group.SampleLines.FirstOrDefault() ?? group.DuplicateLines.FirstOrDefault() ?? group.Id, 40),
                Value = group.LineCount,
                Detail = $"{group.Fragments.Count}개 위치"
            })
            .ToList();

        var metrics = new List<AnalysisSummaryMetricRow>
        {
            new() { Label = "중복률(%)", Value = summary.ProjectDuplicateLinePercent },
            new() { Label = "중복 줄", Value = duplicateLines },
            new() { Label = "고유 줄", Value = uniqueLines },
            new() { Label = "중복 그룹", Value = analysis.Duplicates.Groups.Count }
        };
        metrics.AddRange(topGroups);

        return new AnalysisSummaryArea
        {
            Kind = SummaryAreaKind.Duplicates,
            Title = "중복 · DRY",
            SummaryText =
                $"중복률 {summary.ProjectDuplicateLinePercent:F1}% · 그룹 {analysis.Duplicates.Groups.Count:N0}건 · " +
                $"중복 {duplicateLines:N0}줄 · 기준 ≥{analysis.Duplicates.MinDuplicateLines}줄",
            Metrics = metrics
        };
    }

    private static AnalysisSummaryArea BuildStructure(AnalysisResult analysis)
    {
        var summary = analysis.Metrics.Summary;
        var metrics = new List<AnalysisSummaryMetricRow>
        {
            new() { Label = "낮은 응집도", Value = summary.LowCohesionTypeCount },
            new() { Label = "깊은 상속", Value = summary.DeepInheritanceTypeCount },
            new() { Label = "레이어 위반", Value = summary.LayerViolationCount },
            new() { Label = "고 불안정 패키지", Value = summary.HighInstabilityPackageCount }
        };

        return new AnalysisSummaryArea
        {
            Kind = SummaryAreaKind.Structure,
            Title = "설계 · 응집",
            SummaryText =
                $"응집도 낮음 {summary.LowCohesionTypeCount:N0} · 깊은 상속 {summary.DeepInheritanceTypeCount:N0} · " +
                $"레이어 위반 {summary.LayerViolationCount:N0}",
            Metrics = metrics
        };
    }

    private static AnalysisSummaryArea BuildRelations(AnalysisResult analysis)
    {
        var summary = analysis.Metrics.Summary;
        var topCoupledFiles = analysis.FileRelations.Files
            .Select(file => new
            {
                file.DisplayName,
                Count = analysis.FileRelations.Edges.Count(edge =>
                    string.Equals(edge.FromFileId, file.Id, StringComparison.OrdinalIgnoreCase))
            })
            .Where(item => item.Count > 0)
            .OrderByDescending(item => item.Count)
            .Take(5)
            .Select(item => new AnalysisSummaryMetricRow
            {
                Label = Truncate(item.DisplayName, 36),
                Value = item.Count,
                Detail = "나가는 결합"
            })
            .ToList();

        var metrics = new List<AnalysisSummaryMetricRow>
        {
            new() { Label = "레이어 위반", Value = summary.LayerViolationCount },
            new() { Label = "고 불안정 패키지", Value = summary.HighInstabilityPackageCount },
            new() { Label = "God file", Value = summary.GodFileCount }
        };
        metrics.AddRange(topCoupledFiles);

        return new AnalysisSummaryArea
        {
            Kind = SummaryAreaKind.Relations,
            Title = "결합 · 레이어",
            SummaryText =
                $"레이어 위반 {summary.LayerViolationCount:N0} · God file {summary.GodFileCount:N0} · " +
                $"고결합 파일 {topCoupledFiles.Count:N0}개",
            Metrics = metrics
        };
    }

    private static AnalysisSummaryArea BuildGlobals(AnalysisResult analysis)
    {
        var globals = analysis.GlobalVariables;
        var readOnlyVariables = globals.Variables.Count(variable =>
        {
            var accesses = globals.Accesses
                .Where(access => string.Equals(access.GlobalVariableId, variable.Id, StringComparison.Ordinal))
                .ToList();
            return accesses.Count > 0
                && accesses.All(access => access.Kind == GlobalVariableAccessKind.Read);
        });
        var writableVariables = globals.Variables.Count - readOnlyVariables;
        var writes = globals.Accesses.Count(access =>
            access.Kind is GlobalVariableAccessKind.Write or GlobalVariableAccessKind.ReadWrite);
        var multiAccessorVariables = globals.Variables.Count(variable =>
            globals.Accesses
                .Where(access => string.Equals(access.GlobalVariableId, variable.Id, StringComparison.Ordinal))
                .Select(access => access.FunctionId)
                .Distinct(StringComparer.Ordinal)
                .Count() >= 3);

        return new AnalysisSummaryArea
        {
            Kind = SummaryAreaKind.Globals,
            Title = "전역 상태",
            SummaryText =
                $"쓰기 가능 {writableVariables:N0} · 읽기 전용 {readOnlyVariables:N0} · " +
                $"다중 접근 {multiAccessorVariables:N0} · 쓰기 접근 {writes:N0}건",
            Metrics =
            [
                new AnalysisSummaryMetricRow { Label = "쓰기 가능", Value = writableVariables },
                new AnalysisSummaryMetricRow { Label = "읽기 전용", Value = readOnlyVariables },
                new AnalysisSummaryMetricRow { Label = "다중 접근", Value = multiAccessorVariables },
                new AnalysisSummaryMetricRow { Label = "쓰기 접근", Value = writes },
                new AnalysisSummaryMetricRow { Label = "읽기 접근", Value = globals.Accesses.Count - writes }
            ]
        };
    }

    private static AnalysisSummaryArea BuildDatabase(AnalysisResult analysis)
    {
        var schema = analysis.DatabaseSchema;
        var referencedTables = schema.Tables.Count(table =>
            schema.Accesses.Any(access => string.Equals(access.TableId, table.Id, StringComparison.Ordinal)));
        var orphanTables = schema.Tables.Count - referencedTables;
        var topRiskTables = schema.Tables
            .Select(table => new
            {
                table.Name,
                Count = schema.Accesses.Count(access => string.Equals(access.TableId, table.Id, StringComparison.Ordinal))
            })
            .OrderByDescending(item => item.Count)
            .Take(5)
            .Select(item => new AnalysisSummaryMetricRow
            {
                Label = Truncate(item.Name, 36),
                Value = item.Count,
                Detail = item.Count == 0 ? "미참조" : "접근 횟수"
            })
            .ToList();

        var metrics = new List<AnalysisSummaryMetricRow>
        {
            new() { Label = "미참조 테이블", Value = orphanTables },
            new() { Label = "참조 테이블", Value = referencedTables }
        };
        metrics.AddRange(topRiskTables);

        return new AnalysisSummaryArea
        {
            Kind = SummaryAreaKind.Database,
            Title = "DB 접근",
            SummaryText =
                $"미참조 {orphanTables:N0} · 참조 {referencedTables:N0} · 접근 {schema.Accesses.Count:N0}건",
            Metrics = metrics
        };
    }

    private static AnalysisSummaryArea BuildBugRisk(AnalysisResult analysis)
    {
        var result = analysis.BugRisk;
        var critical = result.Findings.Count(f => f.Severity == BugRiskSeverity.Critical);
        var warning = result.Findings.Count(f => f.Severity == BugRiskSeverity.Warning);
        var info = result.Findings.Count(f => f.Severity == BugRiskSeverity.Info);

        var topCategories = result.Findings
            .GroupBy(finding => finding.Category)
            .OrderByDescending(group => group.Count())
            .Take(5)
            .Select(group => new AnalysisSummaryMetricRow
            {
                Label = CategoryLabel(group.Key),
                Value = group.Count()
            })
            .ToList();

        var metrics = new List<AnalysisSummaryMetricRow>
        {
            new() { Label = "Critical", Value = critical },
            new() { Label = "Warning", Value = warning },
            new() { Label = "Info", Value = info },
            new() { Label = "전체", Value = result.Findings.Count }
        };
        metrics.AddRange(topCategories);

        return new AnalysisSummaryArea
        {
            Kind = SummaryAreaKind.BugRisk,
            Title = "버그 · 결함",
            SummaryText = $"전체 {result.Findings.Count:N0}건 · Critical {critical:N0} · Warning {warning:N0} · Info {info:N0}",
            Metrics = metrics
        };
    }

    private static AnalysisSummaryArea BuildIssues(AnalysisResult analysis) =>
        new()
        {
            Kind = SummaryAreaKind.Issues,
            Title = "분석 주의",
            SummaryText = $"{analysis.Issues.Count:N0}개 단계에서 오류가 발생했습니다. 일부 결과만 포함될 수 있습니다.",
            Metrics = analysis.Issues
                .Take(10)
                .Select(issue => new AnalysisSummaryMetricRow
                {
                    Label = issue.Stage,
                    Value = 1,
                    Detail = issue.Message
                })
                .ToList()
        };

    private static string CategoryLabel(BugRiskCategory category) => category switch
    {
        BugRiskCategory.LintViolation => "Lint",
        BugRiskCategory.PossiblyUnusedPrivate => "미사용",
        BugRiskCategory.HighComplexityNesting => "복잡·중첩",
        BugRiskCategory.ExceptionSwallowing => "예외 무음",
        BugRiskCategory.ResourceLeak => "리소스 누수",
        _ => category.ToString()
    };

    private static string Truncate(string value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "(없음)";
        }

        return value.Length <= maxLength ? value : value[..(maxLength - 3)] + "...";
    }

    private static (int none, int warn, int critical) CountFunctionWarningLevels(AnalysisResult analysis)
    {
        var thresholds = analysis.QualityThresholds;
        var none = 0;
        var warn = 0;
        var critical = 0;
        foreach (var function in analysis.Metrics.Functions)
        {
            switch (FileMetricsAggregator.GetFunctionWarningLevel(function, thresholds))
            {
                case WarningLevel.Critical:
                    critical++;
                    break;
                case WarningLevel.Warning:
                    warn++;
                    break;
                default:
                    none++;
                    break;
            }
        }

        return (none, warn, critical);
    }

    private static void AddQualityIssueMetrics(
        List<AnalysisSummaryMetricRow> metrics,
        CodeQualitySummary summary,
        MetricInspectionKind inspections)
    {
        metrics.Add(new AnalysisSummaryMetricRow { Label = "순환 호출", Value = summary.CircularCallChainCount });
        metrics.Add(new AnalysisSummaryMetricRow { Label = "God file", Value = summary.GodFileCount });
        metrics.Add(new AnalysisSummaryMetricRow { Label = "고 CC", Value = summary.HighCyclomaticCount });

        if (AnalysisScopeResolver.RequiresDuplicateDetection(inspections))
        {
            metrics.Add(new AnalysisSummaryMetricRow { Label = "중복률(%)", Value = summary.ProjectDuplicateLinePercent });
        }

        if (AnalysisScopeResolver.RequiresTypeStructure(inspections))
        {
            metrics.Add(new AnalysisSummaryMetricRow { Label = "낮은 응집도", Value = summary.LowCohesionTypeCount });
        }
    }
}
