using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Metrics;

public static class FileMetricsAggregator
{
    public static IReadOnlyList<FileAggregateMetric> Build(
        IReadOnlyList<FileLineMetric> files,
        IReadOnlyList<FunctionMetric> functions,
        UserAnalysisSettings thresholds)
    {
        var functionsByFile = functions
            .GroupBy(func => func.FilePath, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.ToList(), StringComparer.OrdinalIgnoreCase);

        var aggregates = new List<FileAggregateMetric>(files.Count);

        foreach (var file in files.OrderBy(f => f.FilePath, StringComparer.OrdinalIgnoreCase))
        {
            functionsByFile.TryGetValue(file.FilePath, out var fileFunctions);
            fileFunctions ??= [];

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
                FunctionCount = fileFunctions.Count,
                MaxCyclomaticComplexity = fileFunctions.Max(func => func.CyclomaticComplexity),
                MaxCognitiveComplexity = fileFunctions.Max(func => func.CognitiveComplexity),
                MaxNestingDepth = fileFunctions.Max(func => func.MaxNestingDepth),
                MaxFanIn = fileFunctions.Max(func => func.FanIn),
                MaxFanOut = fileFunctions.Max(func => func.FanOut),
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

    public static bool ExceedsThreshold(FunctionMetric func, UserAnalysisSettings thresholds) =>
        func.CyclomaticComplexity >= thresholds.WarnCyclomaticComplexity
        || func.CognitiveComplexity >= thresholds.WarnCognitiveComplexity
        || func.MaxNestingDepth >= thresholds.WarnMaxNestingDepth
        || func.ParameterCount >= thresholds.WarnParameterCount
        || func.FanOut >= thresholds.WarnFanOut
        || func.MaintenanceIndex < thresholds.WarnMaintenanceIndex;

    public static bool ExceedsFileThreshold(FileAggregateMetric file, UserAnalysisSettings thresholds) =>
        file.MaxCyclomaticComplexity >= thresholds.WarnCyclomaticComplexity
        || file.MaxCognitiveComplexity >= thresholds.WarnCognitiveComplexity
        || file.MaxNestingDepth >= thresholds.WarnMaxNestingDepth
        || file.MaxFanOut >= thresholds.WarnFanOut
        || file.MinMaintenanceIndex < thresholds.WarnMaintenanceIndex
        || file.TodoDensityPer100Lines >= thresholds.WarnTodoDensityPer100Lines;

    public static WarningLevel GetFunctionWarningLevel(FunctionMetric func, UserAnalysisSettings t)
    {
        if (func.CyclomaticComplexity >= t.WarnCyclomaticComplexity * 2
            || func.CognitiveComplexity >= t.WarnCognitiveComplexity * 2
            || func.MaxNestingDepth >= t.WarnMaxNestingDepth * 2
            || func.ParameterCount >= t.WarnParameterCount + 5
            || func.FanOut >= t.WarnFanOut * 2
            || func.MaintenanceIndex < t.WarnMaintenanceIndex * 0.6)
            return WarningLevel.Critical;

        if (ExceedsThreshold(func, t))
            return WarningLevel.Warning;

        return WarningLevel.None;
    }

    public static WarningLevel GetFileWarningLevel(FileAggregateMetric file, UserAnalysisSettings t)
    {
        if (file.MaxCyclomaticComplexity >= t.WarnCyclomaticComplexity * 2
            || file.MaxCognitiveComplexity >= t.WarnCognitiveComplexity * 2
            || file.MaxNestingDepth >= t.WarnMaxNestingDepth * 2
            || file.MaxFanOut >= t.WarnFanOut * 2
            || file.MinMaintenanceIndex < t.WarnMaintenanceIndex * 0.6
            || file.TodoDensityPer100Lines >= t.WarnTodoDensityPer100Lines * 3)
            return WarningLevel.Critical;

        if (ExceedsFileThreshold(file, t))
            return WarningLevel.Warning;

        return WarningLevel.None;
    }

    public static string BuildFunctionDescription(FunctionMetric func, UserAnalysisSettings t)
    {
        var actions = new List<string>();
        var isCritical = GetFunctionWarningLevel(func, t) == WarningLevel.Critical;

        var ccHigh = func.CyclomaticComplexity >= t.WarnCyclomaticComplexity;
        var cognitiveHigh = func.CognitiveComplexity >= t.WarnCognitiveComplexity;
        var nestingHigh = func.MaxNestingDepth >= t.WarnMaxNestingDepth;

        if (ccHigh || cognitiveHigh || nestingHigh)
        {
            actions.Add(isCritical
                ? "복잡도가 매우 높습니다. 즉시 함수를 분리하고, early return으로 중첩·분기를 줄이세요."
                : "복잡도 개선: 함수 분리, 조건 단순화, 중첩 if 축소를 검토하세요.");
        }

        if (func.ParameterCount >= t.WarnParameterCount)
        {
            actions.Add(isCritical || func.ParameterCount >= t.WarnParameterCount + 5
                ? "매개변수가 과다합니다. 옵션 객체로 묶거나 함수 책임을 나누세요."
                : "매개변수가 많습니다. 관련 인자를 객체로 묶는 방안을 검토하세요.");
        }

        if (func.FanOut >= t.WarnFanOut)
        {
            actions.Add(isCritical || func.FanOut >= t.WarnFanOut * 2
                ? "호출 대상이 과다합니다. 파사드·중간 계층을 두어 직접 의존을 줄이세요."
                : "Fan-Out이 높습니다. 호출 대상을 줄이거나 역할별 하위 함수로 분리하세요.");
        }

        if (func.MaintenanceIndex < t.WarnMaintenanceIndex)
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
        if (file.FunctionCount == 0)
        {
            return file.TodoMarkerCount > 0
                ? "분석된 함수가 없습니다. TODO를 이슈로 등록·처리하고 파일 역할(설정·리소스 등)을 확인하세요."
                : "분석된 함수가 없습니다. 분석 대상 파일인지, dead code인지 확인하세요.";
        }

        var actions = new List<string>();
        var isCritical = GetFileWarningLevel(file, t) == WarningLevel.Critical;

        var complexityHigh = file.MaxCyclomaticComplexity >= t.WarnCyclomaticComplexity
            || file.MaxCognitiveComplexity >= t.WarnCognitiveComplexity
            || file.MaxNestingDepth >= t.WarnMaxNestingDepth;

        if (complexityHigh)
        {
            actions.Add(isCritical
                ? "파일 내 복잡 함수가 있습니다. CC·인지·중첩이 큰 함수부터 즉시 분리·단순화하세요."
                : "복잡도가 높은 함수가 있습니다. 해당 함수부터 분리·조건 단순화를 진행하세요.");
        }

        if (file.MaxFanOut >= t.WarnFanOut)
        {
            actions.Add(isCritical || file.MaxFanOut >= t.WarnFanOut * 2
                ? "허브 함수가 있습니다. 책임을 분리하고 파사드로 호출 관계를 정리하세요."
                : "Fan-Out이 높은 함수가 있습니다. 호출 대상 축소·역할 분리를 검토하세요.");
        }

        if (file.MinMaintenanceIndex < t.WarnMaintenanceIndex)
        {
            actions.Add(isCritical || file.MinMaintenanceIndex < t.WarnMaintenanceIndex * 0.6
                ? "유지보수성이 낮은 함수가 있습니다. 우선순위를 정해 구조 개선 리팩터링을 진행하세요."
                : "Min MI가 낮습니다. 낮은 MI 함수의 크기·복잡도·결합도를 줄이세요.");
        }

        if (file.TodoDensityPer100Lines >= t.WarnTodoDensityPer100Lines)
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
}
