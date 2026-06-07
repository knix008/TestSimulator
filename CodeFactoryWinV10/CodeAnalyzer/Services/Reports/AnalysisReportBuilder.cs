using CodeAnalyzer.Models;
using CodeAnalyzer.Services;
using CodeAnalyzer.Services.Metrics;

namespace CodeAnalyzer.Services.Reports;

public static class AnalysisReportBuilder
{
    private const int MaxFunctionRows = 60;
    private const int MaxFileRows = 50;
    private const int MaxTypeRows = 40;
    private const int MaxPackageRows = 30;
    private const int MaxDuplicateGroups = 25;
    private const int MaxGlobalVariableAccessRows = 300;
    private const int MaxArchitectureInsights = 40;
    private const int MaxPriorityActions = 12;

    public static AnalysisReportDocument Build(AnalysisResult analysis, string rootDirectory)
    {
        var generatedAt = DateTime.Now;
        var root = string.IsNullOrWhiteSpace(rootDirectory) ? "(미지정)" : rootDirectory.Trim();
        var thresholds = analysis.QualityThresholds;
        var insights = ArchitectureMetricsBuilder.BuildInsights(
            analysis.Metrics,
            analysis.CallGraph,
            analysis.FileRelations,
            analysis.DirectoryRelations,
            analysis.Structure,
            analysis.Duplicates,
            thresholds,
            analysis.GlobalVariables,
            analysis.DatabaseSchema);

        var sections = new List<ReportSection>
        {
            BuildOverviewSection(analysis, root, generatedAt),
            BuildThresholdSection(thresholds),
            BuildQualityFindingsSection(analysis.Metrics.Summary, thresholds),
            BuildPriorityActionsSection(analysis, insights, root, thresholds),
            BuildFunctionMetricsSection(analysis.Metrics.Functions, root, thresholds),
            BuildFileMetricsSection(analysis.Metrics, root, thresholds),
            BuildTypeMetricsSection(analysis, root, thresholds),
            BuildPackageMetricsSection(analysis.Metrics.Packages, thresholds),
            BuildDuplicateSection(analysis.Duplicates, root),
            BuildGlobalVariablesSection(analysis.GlobalVariables, root),
            BuildArchitectureSection(insights),
            BuildMetricGlossarySection()
        };

        return new AnalysisReportDocument
        {
            Title = "Code Analyzer 분석 보고서",
            RootDirectory = root,
            GeneratedAt = generatedAt,
            Sections = sections,
            FooterNote =
                "본 보고서는 정적 분석·휴리스틱 기반 추정입니다. 권장 조치는 우선순위 가이드이며, " +
                "도메인·팀 규칙에 맞게 조정하세요. 목록은 상위·경고 항목 위주로 제한될 수 있습니다."
        };
    }

    private static ReportSection BuildOverviewSection(
        AnalysisResult analysis,
        string root,
        DateTime generatedAt)
    {
        var graph = analysis.CallGraph;
        var summary = analysis.Metrics.Summary;
        var globals = analysis.GlobalVariables;
        var totalAccessors = globals.Accesses.Select(access => access.FunctionId).Distinct(StringComparer.Ordinal).Count();
        var paragraphs = new List<string>
        {
            $"생성 시각: {generatedAt:yyyy-MM-dd HH:mm:ss}",
            $"루트 디렉터리: {root}",
            $"함수(호출 그래프): {graph.Nodes.Count:N0}개 · 호출 관계: {graph.Edges.Count:N0}개",
            $"분석 파일: {analysis.Metrics.Files.Count:N0}개 · 메트릭 함수: {analysis.Metrics.Functions.Count:N0}개",
            $"타입: {analysis.Structure.Types.Count:N0}개 · 패키지: {analysis.Metrics.Packages.Count:N0}개",
            $"중복 코드 그룹: {analysis.Duplicates.Groups.Count:N0}건 · 순환 호출: {summary.CircularCallChainCount:N0}건",
            $"전역 변수: {globals.Variables.Count:N0}개 · 접근 관계: {globals.Accesses.Count:N0}건 · 접근 함수: {totalAccessors:N0}개",
            "아래 섹션은 측정 수치, 결과 해석, 권장 조치를 함께 제공합니다."
        };

        return new ReportSection
        {
            Heading = "1. 개요",
            Level = 2,
            Paragraphs = paragraphs
        };
    }

    private static ReportSection BuildThresholdSection(UserAnalysisSettings thresholds)
    {
        var rows = new List<ReportTableRow>();
        foreach (var option in MetricInspectionCatalog.Options)
        {
            if (!MetricInspectionScope.IsEnabled(thresholds.EnabledInspections, option.Kind))
            {
                continue;
            }

            var thresholdText = FormatThresholdForKind(option.Kind, thresholds);
            rows.Add(new ReportTableRow
            {
                Cells = [option.Group, option.Label, "포함", thresholdText]
            });
        }

        return new ReportSection
        {
            Heading = "2. 분석 설정·임계값",
            Level = 2,
            Paragraphs =
            [
                "분석 실행 시 적용된 검사 항목과 경고 임계값입니다.",
                $"중복 코드 최소 줄 수: {thresholds.MinDuplicateLines}줄"
            ],
            Table = rows.Count > 0
                ? new ReportTable
                {
                    Headers = ["그룹", "검사 항목", "상태", "임계값"],
                    Rows = rows
                }
                : null
        };
    }

    private static string FormatThresholdForKind(MetricInspectionKind kind, UserAnalysisSettings settings)
    {
        if (!MetricInspectionThresholdCatalog.TryGetSpec(kind, out var spec))
        {
            return "—";
        }

        var value = spec.GetValue(settings);
        var prefix = MetricInspectionThresholdCatalog.FormatComparisonPrefix(spec.Comparison);
        var formatted = spec.DecimalPlaces > 0
            ? value.ToString($"F{spec.DecimalPlaces}")
            : ((int)value).ToString();
        return string.IsNullOrEmpty(prefix) ? formatted : $"{prefix} {formatted}";
    }

    private static ReportSection BuildQualityFindingsSection(
        CodeQualitySummary summary,
        UserAnalysisSettings thresholds)
    {
        var metrics = new (string Key, string Label, string Value, WarningLevel Severity)[]
        {
            ("duplicate", "프로젝트 중복률",
                $"{summary.ProjectDuplicateLinePercent:F1}% ({summary.DuplicateLineCount:N0}/{summary.TotalCodeLines:N0}줄)",
                summary.ProjectDuplicateLinePercent >= 5 ? WarningLevel.Warning : WarningLevel.None),
            ("circular", "순환 호출", $"{summary.CircularCallChainCount:N0}건",
                summary.CircularCallChainCount > 0 ? WarningLevel.Warning : WarningLevel.None),
            ("cc", "고복잡도(CC)", $"{summary.HighCyclomaticCount:N0}함수",
                summary.HighCyclomaticCount > 0 ? WarningLevel.Warning : WarningLevel.None),
            ("cognitive", "고인지 복잡도", $"{summary.HighCognitiveCount:N0}함수",
                summary.HighCognitiveCount > 0 ? WarningLevel.Warning : WarningLevel.None),
            ("nesting", "깊은 중첩", $"{summary.DeepNestingCount:N0}함수",
                summary.DeepNestingCount > 0 ? WarningLevel.Warning : WarningLevel.None),
            ("fanout", "높은 Fan-out", $"{summary.HighFanOutCount:N0}함수",
                summary.HighFanOutCount > 0 ? WarningLevel.Warning : WarningLevel.None),
            ("mi", "낮은 MI", $"{summary.LowMaintenanceIndexCount:N0}함수",
                summary.LowMaintenanceIndexCount > 0 ? WarningLevel.Warning : WarningLevel.None),
            ("todo", "TODO 표식", $"{summary.TotalTodoMarkers:N0}개 / 고밀도 파일 {summary.HighTodoDensityFileCount:N0}개",
                summary.HighTodoDensityFileCount > 0 ? WarningLevel.Warning : WarningLevel.None),
            ("godfile", "God file", $"{summary.GodFileCount:N0}파일",
                summary.GodFileCount > 0 ? WarningLevel.Warning : WarningLevel.None),
            ("comment", "주석 부족", $"{summary.LowCommentFileCount:N0}파일",
                summary.LowCommentFileCount > 0 ? WarningLevel.Warning : WarningLevel.None),
            ("security", "보안 smell", $"{summary.SecuritySmellFileCount:N0}파일",
                summary.SecuritySmellFileCount > 0 ? WarningLevel.Warning : WarningLevel.None),
            ("git", "Git 핫스팟", $"{summary.GitHotspotFileCount:N0}파일",
                summary.GitHotspotFileCount > 0 ? WarningLevel.Warning : WarningLevel.None),
            ("unused", "미사용 가능", $"{summary.PossiblyUnusedCount:N0}건",
                summary.PossiblyUnusedCount > 0 ? WarningLevel.Warning : WarningLevel.None),
            ("catch", "catch 품질",
                $"빈 {summary.EmptyCatchFunctionCount:N0} · 광범위 {summary.BroadCatchFunctionCount:N0}",
                summary.EmptyCatchFunctionCount + summary.BroadCatchFunctionCount > 0 ? WarningLevel.Warning : WarningLevel.None),
            ("asyncvoid", "async void", $"{summary.AsyncVoidCount:N0}건",
                summary.AsyncVoidCount > 0 ? WarningLevel.Warning : WarningLevel.None),
            ("test", "테스트 코드 비율", $"{summary.TestCodeLinePercent:F1}%",
                summary.TestCodeLinePercent < thresholds.WarnMinTestCodePercent ? WarningLevel.Warning : WarningLevel.None),
            ("instability", "불안정 패키지", $"{summary.HighInstabilityPackageCount:N0}개",
                summary.HighInstabilityPackageCount > 0 ? WarningLevel.Warning : WarningLevel.None),
            ("layer", "계층 위반", $"{summary.LayerViolationCount:N0}건",
                summary.LayerViolationCount > 0 ? WarningLevel.Warning : WarningLevel.None),
            ("lcom", "응집도 부족 타입", $"{summary.LowCohesionTypeCount:N0}개",
                summary.LowCohesionTypeCount > 0 ? WarningLevel.Warning : WarningLevel.None),
            ("dit", "깊은 상속 타입", $"{summary.DeepInheritanceTypeCount:N0}개",
                summary.DeepInheritanceTypeCount > 0 ? WarningLevel.Warning : WarningLevel.None)
        };

        var rows = metrics
            .Select(metric =>
            {
                var (meaning, action) = AnalysisReportRemediationTexts.ForQualityMetric(
                    metric.Key, summary, thresholds);
                return new ReportTableRow
                {
                    Cells =
                    [
                        metric.Label,
                        metric.Value,
                        meaning,
                        action,
                        AnalysisReportRemediationTexts.FormatStatus(metric.Severity)
                    ],
                    RiskScore = AnalysisReportRemediationTexts.RiskScoreFromWarning(metric.Severity)
                };
            })
            .ToList();

        return new ReportSection
        {
            Heading = "3. 품질 요약 — 수치·의미·권장 조치",
            Level = 2,
            Paragraphs =
            [
                "프로젝트 전체 집계입니다. 각 행은 측정 결과, 의미, 권장 조치를 함께 보여 줍니다."
            ],
            Table = new ReportTable
            {
                Headers = ["지표", "측정 결과", "의미", "권장 조치", "상태"],
                Rows = rows
            }
        };
    }

    private static ReportSection BuildPriorityActionsSection(
        AnalysisResult analysis,
        IReadOnlyList<ArchitectureInsight> insights,
        string root,
        UserAnalysisSettings thresholds)
    {
        var bullets = new List<string>();

        foreach (var func in analysis.Metrics.Functions
                     .Select(f => (Func: f, Level: FileMetricsAggregator.GetFunctionWarningLevel(f, thresholds)))
                     .Where(x => x.Level >= WarningLevel.Warning)
                     .OrderByDescending(x => x.Level)
                     .ThenByDescending(x => x.Func.CyclomaticComplexity)
                     .Take(5))
        {
            bullets.Add(
                $"[{AnalysisReportRemediationTexts.FormatStatus(func.Level)}] 함수 {func.Func.DisplayName} " +
                $"({ReportFormatting.FormatFileName(func.Func.FilePath, root)}:{func.Func.StartLine}) — " +
                FileMetricsAggregator.BuildFunctionDescription(func.Func, thresholds));
        }

        foreach (var insight in insights
                     .Where(i => i.Severity >= WarningLevel.Warning && i.Kind != ArchitectureInsightKind.Summary)
                     .Take(5))
        {
            bullets.Add(
                $"[{AnalysisReportRemediationTexts.FormatStatus(insight.Severity)}] {insight.Category}: " +
                $"{Truncate(insight.Description, 120)} → {AnalysisReportRemediationTexts.ForInsight(insight)}");
        }

        if (analysis.Metrics.Summary.CircularCallChainCount > 0)
        {
            bullets.Add(
                $"순환 호출 {analysis.Metrics.Summary.CircularCallChainCount}건: " +
                AnalysisReportRemediationTexts.ForQualityMetric("circular", analysis.Metrics.Summary, thresholds).Action);
        }

        if (analysis.Metrics.Summary.ProjectDuplicateLinePercent >= 5)
        {
            bullets.Add(
                $"중복률 {analysis.Metrics.Summary.ProjectDuplicateLinePercent:F1}%: " +
                AnalysisReportRemediationTexts.ForQualityMetric("duplicate", analysis.Metrics.Summary, thresholds).Action);
        }

        if (bullets.Count == 0)
        {
            bullets.Add("현재 설정 기준으로 즉시 조치가 필요한 항목이 없습니다. 정기 분석으로 추세를 모니터링하세요.");
        }

        return new ReportSection
        {
            Heading = "4. 우선 조치 로드맵",
            Level = 2,
            Paragraphs =
            [
                "경고·심각 항목과 아키텍처 인사이트를 바탕으로 한 권장 작업 순서입니다(최대 " +
                $"{MaxPriorityActions}건 권장)."
            ],
            BulletItems = bullets.Take(MaxPriorityActions).ToList()
        };
    }

    private static ReportSection BuildFunctionMetricsSection(
        IReadOnlyList<FunctionMetric> functions,
        string root,
        UserAnalysisSettings thresholds)
    {
        var rows = functions
            .Select(func => (Func: func, Level: FileMetricsAggregator.GetFunctionWarningLevel(func, thresholds)))
            .OrderByDescending(x => x.Level)
            .ThenByDescending(x => x.Func.CyclomaticComplexity)
            .ThenByDescending(x => x.Func.CognitiveComplexity)
            .Take(MaxFunctionRows)
            .Select(x => new ReportTableRow
            {
                Cells =
                [
                    x.Func.DisplayName,
                    ReportFormatting.FormatFileName(x.Func.FilePath, root),
                    x.Func.StartLine.ToString(),
                    x.Func.CyclomaticComplexity.ToString(),
                    x.Func.CognitiveComplexity.ToString(),
                    x.Func.MaxNestingDepth.ToString(),
                    x.Func.FanOut.ToString(),
                    x.Func.MaintenanceIndex.ToString("F1"),
                    AnalysisReportRemediationTexts.FormatStatus(x.Level),
                    Truncate(FileMetricsAggregator.BuildFunctionDescription(x.Func, thresholds), 200)
                ],
                RiskScore = AnalysisReportRemediationTexts.RiskScoreFromWarning(x.Level)
            })
            .ToList();

        return new ReportSection
        {
            Heading = "5. 함수 메트릭 — 상세·조치",
            Level = 2,
            Paragraphs =
            [
                $"전체 {functions.Count:N0}개 중 경고 우선·CC 상위 {rows.Count}개.",
                $"경고 기준: CC≥{thresholds.WarnCyclomaticComplexity}, 인지≥{thresholds.WarnCognitiveComplexity}, " +
                $"MI<{thresholds.WarnMaintenanceIndex:F0}."
            ],
            Table = new ReportTable
            {
                Headers = ["함수", "파일", "줄", "CC", "인지", "중첩", "FanOut", "MI", "상태", "권장 조치"],
                Rows = rows
            }
        };
    }

    private static ReportSection BuildFileMetricsSection(
        CodeMetricsResult metrics,
        string root,
        UserAnalysisSettings thresholds)
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
                FunctionCount = 0,
                MinMaintenanceIndex = 100,
                CommentPercentPer100Code = file.CommentPercentPer100Code,
                PublicApiCount = file.PublicApiCount,
                SecuritySmellCount = file.SecuritySmellCount,
                GitChangeLineCount = file.GitChangeLineCount
            }).ToList();

        var rows = fileRows
            .Select(file => (File: file, Level: FileMetricsAggregator.GetFileWarningLevel(file, thresholds)))
            .OrderByDescending(x => x.Level)
            .ThenByDescending(x => x.File.MaxCyclomaticComplexity)
            .ThenByDescending(x => x.File.WarningFunctionCount)
            .Take(MaxFileRows)
            .Select(x => new ReportTableRow
            {
                Cells =
                [
                    ReportFormatting.FormatFileName(x.File.FilePath, root),
                    x.File.CodeLines.ToString(),
                    x.File.FunctionCount.ToString(),
                    x.File.MaxCyclomaticComplexity.ToString(),
                    x.File.MinMaintenanceIndex.ToString("F1"),
                    x.File.TodoMarkerCount.ToString(),
                    x.File.DuplicateLineCount.ToString(),
                    x.File.GitChangeLineCount.ToString(),
                    AnalysisReportRemediationTexts.FormatStatus(x.Level),
                    Truncate(FileMetricsAggregator.BuildFileDescription(x.File, thresholds), 200)
                ],
                RiskScore = AnalysisReportRemediationTexts.RiskScoreFromWarning(x.Level)
            })
            .ToList();

        return new ReportSection
        {
            Heading = "6. 파일 메트릭 — 상세·조치",
            Level = 2,
            Paragraphs = [$"파일 {fileRows.Count:N0}개 중 경고 우선·복잡도 상위 {rows.Count}개."],
            Table = new ReportTable
            {
                Headers = ["파일", "코드줄", "함수", "MaxCC", "MinMI", "TODO", "중복줄", "Git줄", "상태", "권장 조치"],
                Rows = rows
            }
        };
    }

    private static ReportSection BuildTypeMetricsSection(
        AnalysisResult analysis,
        string root,
        UserAnalysisSettings thresholds)
    {
        if (analysis.Structure.Types.Count == 0)
        {
            return new ReportSection
            {
                Heading = "7. 타입 메트릭 — 상세·조치",
                Level = 2,
                Paragraphs = ["분석된 타입이 없습니다."]
            };
        }

        var typeMetrics = TypeMetricsBuilder.Build(
            analysis.Structure,
            analysis.Metrics.Functions,
            thresholds);

        var rows = typeMetrics
            .Select(type => (Type: type, Level: FileMetricsAggregator.GetTypeWarningLevel(type, thresholds)))
            .OrderByDescending(x => x.Level)
            .ThenByDescending(x => x.Type.LackOfCohesion)
            .ThenByDescending(x => x.Type.MemberCount + x.Type.OperationCount)
            .Take(MaxTypeRows)
            .Select(x => new ReportTableRow
            {
                Cells =
                [
                    x.Type.DisplayName,
                    ReportFormatting.FormatFileName(x.Type.FilePath, root),
                    (x.Type.MemberCount + x.Type.OperationCount).ToString(),
                    x.Type.LackOfCohesion.ToString("F2"),
                    x.Type.DepthOfInheritance.ToString(),
                    x.Type.NumberOfChildren.ToString(),
                    x.Type.MaxCyclomaticComplexity.ToString(),
                    AnalysisReportRemediationTexts.FormatStatus(x.Level),
                    Truncate(FileMetricsAggregator.BuildTypeDescription(x.Type, thresholds), 200)
                ],
                RiskScore = AnalysisReportRemediationTexts.RiskScoreFromWarning(x.Level)
            })
            .ToList();

        return new ReportSection
        {
            Heading = "7. 타입 메트릭 — 상세·조치",
            Level = 2,
            Paragraphs = [$"타입 {typeMetrics.Count:N0}개 중 경고 우선·LCOM 상위 {rows.Count}개."],
            Table = new ReportTable
            {
                Headers = ["타입", "파일", "멤버+연산", "LCOM", "DIT", "NOC", "MaxCC", "상태", "권장 조치"],
                Rows = rows
            }
        };
    }

    private static ReportSection BuildPackageMetricsSection(
        IReadOnlyList<PackageMetric> packages,
        UserAnalysisSettings thresholds)
    {
        if (packages.Count == 0)
        {
            return new ReportSection
            {
                Heading = "8. 패키지 메트릭 — 상세·조치",
                Level = 2,
                Paragraphs = ["패키지(디렉터리) 단위 메트릭이 없습니다."]
            };
        }

        var rows = packages
            .OrderByDescending(pkg => pkg.Instability)
            .ThenByDescending(pkg => pkg.EfferentCoupling)
            .Take(MaxPackageRows)
            .Select(pkg =>
            {
                var level = pkg.Instability >= thresholds.WarnInstability
                    ? WarningLevel.Warning
                    : WarningLevel.None;
                var (meaning, action) = AnalysisReportRemediationTexts.ForPackage(pkg, thresholds);
                return new ReportTableRow
                {
                    Cells =
                    [
                        pkg.DirectoryPath,
                        pkg.AfferentCoupling.ToString(),
                        pkg.EfferentCoupling.ToString(),
                        pkg.Instability.ToString("F2"),
                        pkg.Abstractness.ToString("F2"),
                        pkg.DistanceFromMainSequence.ToString("F2"),
                        Truncate(meaning, 80),
                        Truncate(action, 160),
                        AnalysisReportRemediationTexts.FormatStatus(level)
                    ],
                    RiskScore = AnalysisReportRemediationTexts.RiskScoreFromWarning(level)
                };
            })
            .ToList();

        return new ReportSection
        {
            Heading = "8. 패키지 메트릭 — 상세·조치",
            Level = 2,
            Paragraphs =
            [
                $"패키지 {packages.Count:N0}개 중 불안정성(I) 상위 {rows.Count}개.",
                $"경고 기준: I≥{thresholds.WarnInstability:F2}."
            ],
            Table = new ReportTable
            {
                Headers = ["디렉터리", "Ca", "Ce", "I", "A", "D", "의미", "권장 조치", "상태"],
                Rows = rows
            }
        };
    }

    private static ReportSection BuildDuplicateSection(DuplicateCodeResult duplicates, string root)
    {
        var rows = duplicates.Groups
            .OrderByDescending(group => group.LineCount * group.Fragments.Count)
            .Take(MaxDuplicateGroups)
            .Select(group =>
            {
                var locations = string.Join("; ",
                    group.Fragments.Take(4).Select(fragment =>
                        $"{ReportFormatting.FormatFileName(fragment.FilePath, root)}:{fragment.StartLine}-{fragment.EndLine}"));
                if (group.Fragments.Count > 4)
                {
                    locations += $" (+{group.Fragments.Count - 4})";
                }

                var sample = group.SampleLines.Count > 0
                    ? string.Join(" / ", group.SampleLines.Take(2).Select(line => Truncate(line, 60)))
                    : string.Empty;

                return new ReportTableRow
                {
                    Cells =
                    [
                        group.LineCount.ToString(),
                        group.Fragments.Count.ToString(),
                        locations,
                        sample,
                        "공통 함수·모듈로 추출하고, 한 곳만 수정해도 전체에 반영되게 하세요."
                    ]
                };
            })
            .ToList();

        return new ReportSection
        {
            Heading = "9. 중복 코드",
            Level = 2,
            Paragraphs =
            [
                $"최소 연속 줄 수: {duplicates.MinDuplicateLines}",
                $"그룹 {duplicates.Groups.Count:N0}건 중 상위 {rows.Count}건.",
                "중복은 버그 수정 누락·동작 불일치의 주요 원인입니다. 우선순위는 (줄 수 × 위치 수)가 큰 그룹부터입니다."
            ],
            Table = rows.Count > 0
                ? new ReportTable
                {
                    Headers = ["줄수", "위치수", "위치", "샘플", "권장 조치"],
                    Rows = rows
                }
                : null
        };
    }

    private static ReportSection BuildGlobalVariablesSection(GlobalVariableResult globals, string root)
    {
        if (globals.Variables.Count == 0)
        {
            return new ReportSection
            {
                Heading = "10. 전역 변수 — 접근 함수",
                Level = 2,
                Paragraphs = ["분석된 전역 변수가 없습니다."]
            };
        }

        var rows = new List<ReportTableRow>();
        foreach (var variable in globals.Variables
                     .OrderByDescending(variable => globals.GetAccessesFor(variable.Id).Count)
                     .ThenBy(variable => variable.Name, StringComparer.OrdinalIgnoreCase))
        {
            var accesses = globals.GetAccessesFor(variable.Id);
            if (accesses.Count == 0)
            {
                rows.Add(new ReportTableRow
                {
                    Cells =
                    [
                        variable.Name,
                        FormatGlobalScope(variable.Scope),
                        ReportFormatting.FormatFileName(variable.FilePath, root),
                        variable.LineNumber.ToString(),
                        "-",
                        "-",
                        "-",
                        "-",
                        "접근 함수 없음. 미사용·외부 참조·동적 접근 가능성을 확인하세요."
                    ]
                });
                continue;
            }

            foreach (var access in accesses)
            {
                rows.Add(new ReportTableRow
                {
                    Cells =
                    [
                        variable.Name,
                        FormatGlobalScope(variable.Scope),
                        ReportFormatting.FormatFileName(variable.FilePath, root),
                        variable.LineNumber.ToString(),
                        access.FunctionDisplayName,
                        ReportFormatting.FormatFileName(access.FunctionFilePath, root),
                        access.FunctionLineNumber.ToString(),
                        FormatGlobalAccessKind(access.Kind),
                        BuildGlobalAccessAction(variable, access)
                    ]
                });

                if (rows.Count >= MaxGlobalVariableAccessRows)
                {
                    break;
                }
            }

            if (rows.Count >= MaxGlobalVariableAccessRows)
            {
                break;
            }
        }

        var uniqueFunctions = globals.Accesses
            .Select(access => access.FunctionId)
            .Distinct(StringComparer.Ordinal)
            .Count();

        return new ReportSection
        {
            Heading = "10. 전역 변수 — 접근 함수",
            Level = 2,
            Paragraphs =
            [
                $"전역 변수 {globals.Variables.Count:N0}개 · 접근 관계 {globals.Accesses.Count:N0}건 · 접근 함수 {uniqueFunctions:N0}개.",
                rows.Count >= MaxGlobalVariableAccessRows
                    ? $"표시는 상위 {MaxGlobalVariableAccessRows}건으로 제한됩니다."
                    : "각 행은 전역 변수와 이를 읽거나 쓰는 함수의 관계입니다.",
                "권장: 공유 상태를 줄이고, DI·스코프 제한 객체·지역 상태로 대체하세요."
            ],
            Table = rows.Count > 0
                ? new ReportTable
                {
                    Headers =
                    [
                        "변수", "범위", "선언 파일", "선언 줄",
                        "접근 함수", "함수 파일", "함수 줄", "접근", "권장 조치"
                    ],
                    Rows = rows
                }
                : null
        };
    }

    private static string FormatGlobalScope(GlobalVariableScope scope) => scope switch
    {
        GlobalVariableScope.File => "파일",
        GlobalVariableScope.Module => "모듈",
        GlobalVariableScope.ClassStatic => "static",
        _ => scope.ToString()
    };

    private static string FormatGlobalAccessKind(GlobalVariableAccessKind kind) => kind switch
    {
        GlobalVariableAccessKind.Write => "쓰기",
        GlobalVariableAccessKind.ReadWrite => "읽기/쓰기",
        _ => "읽기"
    };

    private static string BuildGlobalAccessAction(GlobalVariableItem variable, GlobalVariableAccess access)
    {
        if (variable.IsReadOnly && access.Kind == GlobalVariableAccessKind.Read)
        {
            return "읽기 전용 전역입니다. 변경이 필요하면 const/readonly 정책을 검토하세요.";
        }

        return access.Kind switch
        {
            GlobalVariableAccessKind.Write or GlobalVariableAccessKind.ReadWrite =>
                "쓰기 접근이 있습니다. 전역 변경은 부작용·테스트 어려움을 유발하므로 지역화·캡슐화를 검토하세요.",
            _ =>
                "읽기 접근입니다. 의존을 줄이려면 값 주입·컨텍스트 객체로 대체하세요."
        };
    }

    private static ReportSection BuildArchitectureSection(IReadOnlyList<ArchitectureInsight> insights)
    {
        var rows = insights
            .Where(insight => insight.Kind != ArchitectureInsightKind.Summary)
            .Take(MaxArchitectureInsights)
            .Select(insight => new ReportTableRow
            {
                Cells =
                [
                    insight.Category,
                    Truncate(insight.Description, 160),
                    Truncate(AnalysisReportRemediationTexts.ForInsight(insight), 200),
                    AnalysisReportRemediationTexts.FormatStatus(insight.Severity)
                ],
                RiskScore = AnalysisReportRemediationTexts.RiskScoreFromWarning(insight.Severity)
            })
            .ToList();

        return new ReportSection
        {
            Heading = "11. 아키텍처 인사이트 — 결과·조치",
            Level = 2,
            Paragraphs =
            [
                $"아키텍처 탭과 동일한 인사이트 목록입니다(최대 {MaxArchitectureInsights}건).",
                "각 항목에 대해 결과 설명과 권장 조치를 함께 기록했습니다."
            ],
            Table = rows.Count > 0
                ? new ReportTable
                {
                    Headers = ["유형", "결과", "권장 조치", "상태"],
                    Rows = rows
                }
                : null
        };
    }

    private static ReportSection BuildMetricGlossarySection()
    {
        return new ReportSection
        {
            Heading = "부록. 주요 지표 설명",
            Level = 2,
            Paragraphs =
            [
                "보고서에 등장하는 핵심 지표의 간략 설명입니다. 상세 해석은 저장소의 CodeAnalysisGuide.md를 참고하세요."
            ],
            BulletItems =
            [
                "CC(순환 복잡도): 분기·루프 수. 높을수록 테스트·리팩터링 우선.",
                "인지 복잡도: 중첩 가중 난이도. 실제 읽기 어려움에 가깝습니다.",
                "MI(유지보수 지수): 0~171, 높을수록 유지보수 용이.",
                "Fan-in/out: 호출받음/호출함 수. 결합·허브 판단.",
                "LCOM: 응집도 부족(0~1). 높을수록 타입 분리 검토.",
                "DIT/NOC: 상속 깊이/자식 수. 설계 복잡도·변경 영향.",
                "Ca/Ce/I: 패키지 결합·불안정성. I가 높으면 변경 파급 위험.",
                "Git 핫스팟: 최근 6개월 변경 줄 합. 결함·리팩터링 우선 후보."
            ]
        };
    }

    private static string Truncate(string value, int maxLength)
    {
        if (string.IsNullOrEmpty(value) || value.Length <= maxLength)
        {
            return value;
        }

        return value[..maxLength] + "…";
    }
}
