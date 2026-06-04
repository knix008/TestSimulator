using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Metrics;

public static class FileMetricsAggregator
{
    public const int MinCodeLinesForCommentWarning = 50;

    public static IReadOnlyList<FileAggregateMetric> Build(
        IReadOnlyList<FileLineMetric> files,
        IReadOnlyList<FunctionMetric> functions,
        UserAnalysisSettings thresholds,
        IReadOnlyDictionary<string, int>? duplicateLinesByFile = null)
    {
        var functionsByFile = functions
            .GroupBy(func => func.FilePath, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.ToList(), StringComparer.OrdinalIgnoreCase);

        var aggregates = new List<FileAggregateMetric>(files.Count);

        foreach (var file in files.OrderBy(f => f.FilePath, StringComparer.OrdinalIgnoreCase))
        {
            functionsByFile.TryGetValue(file.FilePath, out var fileFunctions);
            fileFunctions ??= [];
            var duplicateLineCount = duplicateLinesByFile is not null
                && duplicateLinesByFile.TryGetValue(file.FilePath, out var dupCount)
                ? dupCount
                : 0;

            if (fileFunctions.Count == 0)
            {
                aggregates.Add(new FileAggregateMetric
                {
                    FilePath = file.FilePath,
                    LanguageId = file.LanguageId,
                    PhysicalLines = file.PhysicalLines,
                    CodeLines = file.CodeLines,
                    TodoMarkerCount = file.TodoMarkerCount,
                    TodoDensityPer100Lines = file.TodoDensityPer100Lines,
                    CommentPercentPer100Code = file.CommentPercentPer100Code,
                    DuplicateLineCount = duplicateLineCount,
                    FunctionCount = 0,
                    MinMaintenanceIndex = 100
                });
                continue;
            }

            aggregates.Add(new FileAggregateMetric
            {
                FilePath = file.FilePath,
                LanguageId = file.LanguageId,
                PhysicalLines = file.PhysicalLines,
                CodeLines = file.CodeLines,
                TodoMarkerCount = file.TodoMarkerCount,
                TodoDensityPer100Lines = file.TodoDensityPer100Lines,
                CommentPercentPer100Code = file.CommentPercentPer100Code,
                DuplicateLineCount = duplicateLineCount,
                FunctionCount = fileFunctions.Count,
                MaxCyclomaticComplexity = fileFunctions.Max(func => func.CyclomaticComplexity),
                MaxCognitiveComplexity = fileFunctions.Max(func => func.CognitiveComplexity),
                MaxNestingDepth = fileFunctions.Max(func => func.MaxNestingDepth),
                MaxFanIn = fileFunctions.Max(func => func.FanIn),
                MaxFanOut = fileFunctions.Max(func => func.FanOut),
                MaxReturnCount = fileFunctions.Max(func => func.ReturnCount),
                AvgCyclomaticComplexity = Math.Round(fileFunctions.Average(func => func.CyclomaticComplexity), 1),
                AvgCognitiveComplexity = Math.Round(fileFunctions.Average(func => func.CognitiveComplexity), 1),
                AvgMaintenanceIndex = Math.Round(fileFunctions.Average(func => func.MaintenanceIndex), 1),
                MinMaintenanceIndex = Math.Round(fileFunctions.Min(func => func.MaintenanceIndex), 1),
                TotalMagicNumbers = fileFunctions.Sum(func => func.MagicNumberCount),
                WarningFunctionCount = fileFunctions.Count(func => ExceedsThreshold(func, thresholds))
            });
        }

        return aggregates;
    }

    public static bool ExceedsThreshold(FunctionMetric func, UserAnalysisSettings thresholds)
    {
        var scope = thresholds.EnabledInspections;
        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.CyclomaticComplexity)
            && func.CyclomaticComplexity >= thresholds.WarnCyclomaticComplexity)
        {
            return true;
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.CognitiveComplexity)
            && func.CognitiveComplexity >= thresholds.WarnCognitiveComplexity)
        {
            return true;
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.NestingDepth)
            && func.MaxNestingDepth >= thresholds.WarnMaxNestingDepth)
        {
            return true;
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.ParameterCount)
            && func.ParameterCount >= thresholds.WarnParameterCount)
        {
            return true;
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.FanOut)
            && func.FanOut >= thresholds.WarnFanOut)
        {
            return true;
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.MaintenanceIndex)
            && func.MaintenanceIndex < thresholds.WarnMaintenanceIndex)
        {
            return true;
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.ReturnCount)
            && func.ReturnCount >= thresholds.WarnReturnCount)
        {
            return true;
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.MagicNumbers)
            && func.MagicNumberCount >= thresholds.WarnMagicNumbers)
        {
            return true;
        }

        return false;
    }

    public static bool ExceedsFileThreshold(FileAggregateMetric file, UserAnalysisSettings thresholds)
    {
        var scope = thresholds.EnabledInspections;
        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.CyclomaticComplexity)
            && file.MaxCyclomaticComplexity >= thresholds.WarnCyclomaticComplexity)
        {
            return true;
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.CognitiveComplexity)
            && file.MaxCognitiveComplexity >= thresholds.WarnCognitiveComplexity)
        {
            return true;
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.NestingDepth)
            && file.MaxNestingDepth >= thresholds.WarnMaxNestingDepth)
        {
            return true;
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.FanOut)
            && file.MaxFanOut >= thresholds.WarnFanOut)
        {
            return true;
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.MaintenanceIndex)
            && file.MinMaintenanceIndex < thresholds.WarnMaintenanceIndex)
        {
            return true;
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.TodoDensity)
            && file.TodoDensityPer100Lines >= thresholds.WarnTodoDensityPer100Lines)
        {
            return true;
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.ReturnCount)
            && file.MaxReturnCount >= thresholds.WarnReturnCount)
        {
            return true;
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.MagicNumbers)
            && file.TotalMagicNumbers >= thresholds.WarnMagicNumbers)
        {
            return true;
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.GodFile)
            && IsGodFile(file, thresholds))
        {
            return true;
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.LowCommentRatio)
            && IsLowCommentFile(file, thresholds))
        {
            return true;
        }

        return false;
    }

    public static bool IsLowCommentFile(FileAggregateMetric file, UserAnalysisSettings thresholds) =>
        MetricInspectionScope.IsEnabled(thresholds.EnabledInspections, MetricInspectionKind.LowCommentRatio)
        && file.CodeLines >= MinCodeLinesForCommentWarning
        && file.CommentPercentPer100Code < thresholds.WarnMinCommentPercent;

    public static bool IsGodFile(FileAggregateMetric file, UserAnalysisSettings thresholds) =>
        MetricInspectionScope.IsEnabled(thresholds.EnabledInspections, MetricInspectionKind.GodFile)
        && file.CodeLines >= thresholds.WarnGodFileCodeLines;

    public static WarningLevel GetFunctionWarningLevel(FunctionMetric func, UserAnalysisSettings t)
    {
        var scope = t.EnabledInspections;
        if ((MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.CyclomaticComplexity)
                && func.CyclomaticComplexity >= t.WarnCyclomaticComplexity * 2)
            || (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.CognitiveComplexity)
                && func.CognitiveComplexity >= t.WarnCognitiveComplexity * 2)
            || (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.NestingDepth)
                && func.MaxNestingDepth >= t.WarnMaxNestingDepth * 2)
            || (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.ParameterCount)
                && func.ParameterCount >= t.WarnParameterCount + 5)
            || (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.FanOut)
                && func.FanOut >= t.WarnFanOut * 2)
            || (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.MaintenanceIndex)
                && func.MaintenanceIndex < t.WarnMaintenanceIndex * 0.6)
            || (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.ReturnCount)
                && func.ReturnCount >= t.WarnReturnCount * 2)
            || (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.MagicNumbers)
                && func.MagicNumberCount >= t.WarnMagicNumbers * 3))
        {
            return WarningLevel.Critical;
        }

        if (ExceedsThreshold(func, t))
        {
            return WarningLevel.Warning;
        }

        return WarningLevel.None;
    }

    public static WarningLevel GetFileWarningLevel(FileAggregateMetric file, UserAnalysisSettings t)
    {
        var scope = t.EnabledInspections;
        if ((MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.CyclomaticComplexity)
                && file.MaxCyclomaticComplexity >= t.WarnCyclomaticComplexity * 2)
            || (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.CognitiveComplexity)
                && file.MaxCognitiveComplexity >= t.WarnCognitiveComplexity * 2)
            || (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.NestingDepth)
                && file.MaxNestingDepth >= t.WarnMaxNestingDepth * 2)
            || (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.FanOut)
                && file.MaxFanOut >= t.WarnFanOut * 2)
            || (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.MaintenanceIndex)
                && file.MinMaintenanceIndex < t.WarnMaintenanceIndex * 0.6)
            || (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.TodoDensity)
                && file.TodoDensityPer100Lines >= t.WarnTodoDensityPer100Lines * 3)
            || (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.ReturnCount)
                && file.MaxReturnCount >= t.WarnReturnCount * 2)
            || (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.MagicNumbers)
                && file.TotalMagicNumbers >= t.WarnMagicNumbers * 5)
            || (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.GodFile)
                && file.CodeLines >= t.WarnGodFileCodeLines * 2))
        {
            return WarningLevel.Critical;
        }

        if (ExceedsFileThreshold(file, t))
        {
            return WarningLevel.Warning;
        }

        return WarningLevel.None;
    }

    public static WarningLevel GetTypeWarningLevel(TypeMetric type, UserAnalysisSettings t)
    {
        var scope = t.EnabledInspections;
        var memberOps = type.MemberCount + type.OperationCount;
        if ((MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.GodType)
                && memberOps >= t.WarnGodTypeMemberCount * 2)
            || (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.CyclomaticComplexity)
                && type.MaxCyclomaticComplexity >= t.WarnCyclomaticComplexity * 2)
            || (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.CognitiveComplexity)
                && type.MaxCognitiveComplexity >= t.WarnCognitiveComplexity * 2))
        {
            return WarningLevel.Critical;
        }

        if ((MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.GodType)
                && memberOps >= t.WarnGodTypeMemberCount)
            || (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.CyclomaticComplexity)
                && type.MaxCyclomaticComplexity >= t.WarnCyclomaticComplexity)
            || (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.CognitiveComplexity)
                && type.MaxCognitiveComplexity >= t.WarnCognitiveComplexity)
            || (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.MaintenanceIndex)
                && type.MinMaintenanceIndex < t.WarnMaintenanceIndex))
        {
            return WarningLevel.Warning;
        }

        return WarningLevel.None;
    }

    public static string BuildFunctionDescription(FunctionMetric func, UserAnalysisSettings t)
    {
        var actions = new List<string>();
        var scope = t.EnabledInspections;
        var isCritical = GetFunctionWarningLevel(func, t) == WarningLevel.Critical;

        var ccHigh = MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.CyclomaticComplexity)
            && func.CyclomaticComplexity >= t.WarnCyclomaticComplexity;
        var cognitiveHigh = MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.CognitiveComplexity)
            && func.CognitiveComplexity >= t.WarnCognitiveComplexity;
        var nestingHigh = MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.NestingDepth)
            && func.MaxNestingDepth >= t.WarnMaxNestingDepth;

        if (ccHigh || cognitiveHigh || nestingHigh)
        {
            actions.Add(isCritical
                ? "복잡도가 매우 높습니다. 즉시 함수를 분리하고, early return으로 중첩·분기를 줄이세요."
                : "복잡도 개선: 함수 분리, 조건 단순화, 중첩 if 축소를 검토하세요.");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.ParameterCount)
            && func.ParameterCount >= t.WarnParameterCount)
        {
            actions.Add(isCritical || func.ParameterCount >= t.WarnParameterCount + 5
                ? "매개변수가 과다합니다. 옵션 객체로 묶거나 함수 책임을 나누세요."
                : "매개변수가 많습니다. 관련 인자를 객체로 묶는 방안을 검토하세요.");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.ReturnCount)
            && func.ReturnCount >= t.WarnReturnCount)
        {
            actions.Add(isCritical || func.ReturnCount >= t.WarnReturnCount * 2
                ? "return 지점이 많습니다. 단일 출구 패턴·조기 return 정리로 흐름을 단순화하세요."
                : "return이 많습니다. 분기 통합·헬퍼 추출로 출구를 줄이세요.");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.MagicNumbers)
            && func.MagicNumberCount >= t.WarnMagicNumbers)
        {
            actions.Add(isCritical || func.MagicNumberCount >= t.WarnMagicNumbers * 3
                ? "매직 넘버가 많습니다. named constant·enum으로 치환하세요."
                : "매직 넘버가 있습니다. 의미 있는 상수 이름으로 바꾸세요.");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.FanOut)
            && func.FanOut >= t.WarnFanOut)
        {
            actions.Add(isCritical || func.FanOut >= t.WarnFanOut * 2
                ? "호출 대상이 과다합니다. 파사드·중간 계층을 두어 직접 의존을 줄이세요."
                : "Fan-Out이 높습니다. 호출 대상을 줄이거나 역할별 하위 함수로 분리하세요.");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.MaintenanceIndex)
            && func.MaintenanceIndex < t.WarnMaintenanceIndex)
        {
            actions.Add(isCritical || func.MaintenanceIndex < t.WarnMaintenanceIndex * 0.6
                ? "유지보수성이 낮습니다. 함수 크기·복잡도·결합도를 함께 낮추는 리팩터링이 필요합니다."
                : "유지보수 지수가 낮습니다. 길이·복잡도·의존성을 줄여 가독성을 높이세요.");
        }

        if (func.FanIn == 0 && func.FanOut == 0)
        {
            actions.Add("다른 코드에서 호출되지 않습니다. 사용처 연결, 테스트 추가, 또는 미사용 코드 제거를 검토하세요.");
        }

        if (actions.Count == 0)
        {
            return "품질 기준 이내. 추가 조치 불필요.";
        }

        return string.Join(" ", actions);
    }

    public static string BuildFileDescription(FileAggregateMetric file, UserAnalysisSettings t)
    {
        var scope = t.EnabledInspections;
        if (file.FunctionCount == 0)
        {
            if (IsGodFile(file, t))
            {
                return $"코드 줄이 {file.CodeLines:N0}줄로 매우 큽니다. 파일 분리·모듈화를 검토하세요.";
            }

            return file.TodoMarkerCount > 0
                ? "분석된 함수가 없습니다. TODO를 이슈로 등록·처리하고 파일 역할(설정·리소스 등)을 확인하세요."
                : "분석된 함수가 없습니다. 분석 대상 파일인지, dead code인지 확인하세요.";
        }

        var actions = new List<string>();
        var isCritical = GetFileWarningLevel(file, t) == WarningLevel.Critical;

        var complexityHigh =
            (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.CyclomaticComplexity)
                && file.MaxCyclomaticComplexity >= t.WarnCyclomaticComplexity)
            || (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.CognitiveComplexity)
                && file.MaxCognitiveComplexity >= t.WarnCognitiveComplexity)
            || (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.NestingDepth)
                && file.MaxNestingDepth >= t.WarnMaxNestingDepth);

        if (complexityHigh)
        {
            actions.Add(isCritical
                ? "파일 내 복잡 함수가 있습니다. CC·인지·중첩이 큰 함수부터 즉시 분리·단순화하세요."
                : "복잡도가 높은 함수가 있습니다. 해당 함수부터 분리·조건 단순화를 진행하세요.");
        }

        if (IsGodFile(file, t))
        {
            actions.Add(isCritical || file.CodeLines >= t.WarnGodFileCodeLines * 2
                ? $"God file({file.CodeLines:N0}줄): 책임별로 파일·네임스페이스를 분리하세요."
                : $"파일 크기가 큽니다({file.CodeLines:N0}줄). 논리 단위로 분할을 검토하세요.");
        }

        if (IsLowCommentFile(file, t))
        {
            actions.Add($"주석 비율이 낮습니다({file.CommentPercentPer100Code:F1}%). 공개 API·복잡 로직에 설명 주석을 보강하세요.");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.FileDuplicateLines)
            && file.DuplicateLineCount > 0)
        {
            actions.Add($"중복 코드 구간에 {file.DuplicateLineCount:N0}줄 참여. 공통 함수·모듈로 추출하세요.");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.ReturnCount)
            && file.MaxReturnCount >= t.WarnReturnCount)
        {
            actions.Add("return이 많은 함수가 있습니다. 해당 함수의 제어 흐름을 단순화하세요.");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.MagicNumbers)
            && file.TotalMagicNumbers >= t.WarnMagicNumbers)
        {
            actions.Add("매직 넘버가 많습니다. 상수·설정으로 의미를 드러내세요.");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.FanOut)
            && file.MaxFanOut >= t.WarnFanOut)
        {
            actions.Add(isCritical || file.MaxFanOut >= t.WarnFanOut * 2
                ? "허브 함수가 있습니다. 책임을 분리하고 파사드로 호출 관계를 정리하세요."
                : "Fan-Out이 높은 함수가 있습니다. 호출 대상 축소·역할 분리를 검토하세요.");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.MaintenanceIndex)
            && file.MinMaintenanceIndex < t.WarnMaintenanceIndex)
        {
            actions.Add(isCritical || file.MinMaintenanceIndex < t.WarnMaintenanceIndex * 0.6
                ? "유지보수성이 낮은 함수가 있습니다. 우선순위를 정해 구조 개선 리팩터링을 진행하세요."
                : "Min MI가 낮습니다. 낮은 MI 함수의 크기·복잡도·결합도를 줄이세요.");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.TodoDensity)
            && file.TodoDensityPer100Lines >= t.WarnTodoDensityPer100Lines)
        {
            actions.Add(isCritical || file.TodoDensityPer100Lines >= t.WarnTodoDensityPer100Lines * 3
                ? "TODO가 많습니다. 이슈 트래커에 등록하고 해결·삭제하여 기술 부채를 줄이세요."
                : "TODO 밀도가 높습니다. TODO를 정리하고 우선순위에 따라 처리하세요.");
        }

        if (file.WarningFunctionCount > 0 && actions.Count == 0)
        {
            actions.Add($"경고 함수 {file.WarningFunctionCount}개가 있습니다. 목록에서 해당 함수를 열어 순차적으로 개선하세요.");
        }
        else if (file.WarningFunctionCount > 0)
        {
            actions.Add($"경고 함수 {file.WarningFunctionCount}개를 우선 점검하세요.");
        }

        if (actions.Count == 0)
        {
            return "품질 기준 이내. 추가 조치 불필요.";
        }

        return string.Join(" ", actions);
    }

    public static string BuildTypeDescription(TypeMetric type, UserAnalysisSettings t)
    {
        var actions = new List<string>();
        var scope = t.EnabledInspections;
        var memberOps = type.MemberCount + type.OperationCount;
        var isCritical = GetTypeWarningLevel(type, t) == WarningLevel.Critical;

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.GodType)
            && memberOps >= t.WarnGodTypeMemberCount)
        {
            actions.Add(isCritical
                ? $"God type(멤버·연산 {memberOps}개): 책임을 분리하고 작은 타입으로 나누세요."
                : $"타입 규모가 큽니다(멤버 {type.MemberCount}, 연산 {type.OperationCount}). 역할별 분리를 검토하세요.");
        }

        if ((MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.CyclomaticComplexity)
                && type.MaxCyclomaticComplexity >= t.WarnCyclomaticComplexity)
            || (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.CognitiveComplexity)
                && type.MaxCognitiveComplexity >= t.WarnCognitiveComplexity))
        {
            actions.Add("타입 내 복잡한 메서드가 있습니다. 해당 메서드부터 리팩터링하세요.");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.MaintenanceIndex)
            && type.MinMaintenanceIndex < t.WarnMaintenanceIndex)
        {
            actions.Add("유지보수 지수가 낮은 메서드가 있습니다.");
        }

        if (type.DependencyOutCount >= 8)
        {
            actions.Add($"외부 타입 의존이 많습니다({type.DependencyOutCount}건). 결합도를 줄이세요.");
        }

        if (actions.Count == 0)
        {
            return "타입 구조 기준 이내.";
        }

        return string.Join(" ", actions);
    }
}
