using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public enum ThresholdComparisonKind
{
    None,
    GreaterOrEqual,
    LessThan
}

public sealed record InspectionThresholdSpec(
    ThresholdComparisonKind Comparison,
    decimal Minimum,
    decimal Maximum,
    decimal DefaultValue,
    int DecimalPlaces,
    Func<UserAnalysisSettings, decimal> GetValue,
    Action<UserAnalysisSettings, decimal> SetValue,
    string ToolTip);

public static class MetricInspectionThresholdCatalog
{
    private static readonly Dictionary<MetricInspectionKind, InspectionThresholdSpec> Specs =
        new()
        {
            [MetricInspectionKind.CyclomaticComplexity] = IntSpec(
                1, 200, 15,
                s => s.WarnCyclomaticComplexity,
                (s, v) => s.WarnCyclomaticComplexity = (int)v,
                QualityThresholdToolTipTexts.Cyclomatic),
            [MetricInspectionKind.CognitiveComplexity] = IntSpec(
                1, 200, 15,
                s => s.WarnCognitiveComplexity,
                (s, v) => s.WarnCognitiveComplexity = (int)v,
                QualityThresholdToolTipTexts.Cognitive),
            [MetricInspectionKind.NestingDepth] = IntSpec(
                1, 50, 4,
                s => s.WarnMaxNestingDepth,
                (s, v) => s.WarnMaxNestingDepth = (int)v,
                QualityThresholdToolTipTexts.Nesting),
            [MetricInspectionKind.ParameterCount] = IntSpec(
                1, 50, 6,
                s => s.WarnParameterCount,
                (s, v) => s.WarnParameterCount = (int)v,
                QualityThresholdToolTipTexts.ParameterCount),
            [MetricInspectionKind.ReturnCount] = IntSpec(
                1, 50, 5,
                s => s.WarnReturnCount,
                (s, v) => s.WarnReturnCount = (int)v,
                QualityThresholdToolTipTexts.ReturnCount),
            [MetricInspectionKind.MagicNumbers] = IntSpec(
                1, 100, 5,
                s => s.WarnMagicNumbers,
                (s, v) => s.WarnMagicNumbers = (int)v,
                QualityThresholdToolTipTexts.MagicNumbers),
            [MetricInspectionKind.FanOut] = IntSpec(
                1, 500, 10,
                s => s.WarnFanOut,
                (s, v) => s.WarnFanOut = (int)v,
                QualityThresholdToolTipTexts.FanOut),
            [MetricInspectionKind.MaintenanceIndex] = LessThanSpec(
                0, 171, 65, 0,
                s => (decimal)s.WarnMaintenanceIndex,
                (s, v) => s.WarnMaintenanceIndex = (double)v,
                QualityThresholdToolTipTexts.MaintenanceIndex),
            [MetricInspectionKind.TodoDensity] = GreaterOrEqualSpec(
                0, 100, 3, 1,
                s => (decimal)s.WarnTodoDensityPer100Lines,
                (s, v) => s.WarnTodoDensityPer100Lines = (double)v,
                QualityThresholdToolTipTexts.TodoDensity),
            [MetricInspectionKind.GodFile] = IntSpec(
                100, 50_000, 800,
                s => s.WarnGodFileCodeLines,
                (s, v) => s.WarnGodFileCodeLines = (int)v,
                QualityThresholdToolTipTexts.GodFile),
            [MetricInspectionKind.LowCommentRatio] = LessThanSpec(
                0, 100, 10, 0,
                s => (decimal)s.WarnMinCommentPercent,
                (s, v) => s.WarnMinCommentPercent = (double)v,
                QualityThresholdToolTipTexts.CommentPercent),
            [MetricInspectionKind.GodType] = IntSpec(
                5, 500, 20,
                s => s.WarnGodTypeMemberCount,
                (s, v) => s.WarnGodTypeMemberCount = (int)v,
                QualityThresholdToolTipTexts.GodType),
            [MetricInspectionKind.DuplicateCodeGroups] = IntSpec(
                UserAnalysisSettings.MinDuplicateLinesFloor,
                UserAnalysisSettings.MinDuplicateLinesCeiling,
                10,
                s => s.MinDuplicateLines,
                (s, v) => s.MinDuplicateLines = (int)v,
                QualityThresholdToolTipTexts.MinDuplicateLines),
            [MetricInspectionKind.StatementCount] = IntSpec(
                10, 500, 50,
                s => s.WarnStatementCount,
                (s, v) => s.WarnStatementCount = (int)v,
                "함수 문장 수가 이 값 이상이면 경고합니다."),
            [MetricInspectionKind.SwitchCaseCount] = IntSpec(
                3, 200, 10,
                s => s.WarnSwitchCaseCount,
                (s, v) => s.WarnSwitchCaseCount = (int)v,
                "switch/case 수가 이 값 이상이면 경고합니다."),
            [MetricInspectionKind.PublicApiDensity] = IntSpec(
                5, 500, 30,
                s => s.WarnPublicApiCount,
                (s, v) => s.WarnPublicApiCount = (int)v,
                "파일 public API 수가 이 값 이상이면 경고합니다."),
            [MetricInspectionKind.TestCodeRatio] = LessThanSpec(
                0, 100, 10, 0,
                s => (decimal)s.WarnMinTestCodePercent,
                (s, v) => s.WarnMinTestCodePercent = (double)v,
                "테스트 코드 LOC 비율(근사)이 이 값 미만이면 경고합니다."),
            [MetricInspectionKind.PackageInstability] = GreaterOrEqualSpec(
                0, 1, 0.7m, 2,
                s => (decimal)s.WarnInstability,
                (s, v) => s.WarnInstability = (double)v,
                "패키지 불안정성(I)이 이 값 이상이면 경고합니다."),
            [MetricInspectionKind.TypeCohesion] = GreaterOrEqualSpec(
                0, 1, 0.6m, 2,
                s => (decimal)s.WarnLackOfCohesion,
                (s, v) => s.WarnLackOfCohesion = (double)v,
                "LCOM(응집도 부족)이 이 값 이상이면 경고합니다."),
            [MetricInspectionKind.InheritanceDepth] = IntSpec(
                2, 20, 5,
                s => s.WarnInheritanceDepth,
                (s, v) => s.WarnInheritanceDepth = (int)v,
                "상속 깊이(DIT)가 이 값 이상이면 경고합니다."),
            [MetricInspectionKind.GitHotspot] = IntSpec(
                50, 1_000_000, 500,
                s => s.WarnGitChangeLines,
                (s, v) => s.WarnGitChangeLines = (int)v,
                "최근 Git 변경 줄 수가 이 값 이상이면 핫스팟으로 표시합니다."),
            [MetricInspectionKind.SecuritySmells] = IntSpec(
                1, 100, 1,
                s => s.WarnSecuritySmellCount,
                (s, v) => s.WarnSecuritySmellCount = (int)v,
                "보안 smell 패턴이 이 개수 이상이면 경고합니다.")
        };

    public static bool TryGetSpec(MetricInspectionKind kind, out InspectionThresholdSpec spec) =>
        Specs.TryGetValue(kind, out spec!);

    public static string FormatComparisonPrefix(ThresholdComparisonKind comparison) => comparison switch
    {
        ThresholdComparisonKind.GreaterOrEqual => "≥",
        ThresholdComparisonKind.LessThan => "<",
        _ => string.Empty
    };

    private static InspectionThresholdSpec IntSpec(
        int min,
        int max,
        int defaultValue,
        Func<UserAnalysisSettings, int> get,
        Action<UserAnalysisSettings, int> set,
        string toolTip) =>
        new(
            ThresholdComparisonKind.GreaterOrEqual,
            min,
            max,
            defaultValue,
            0,
            s => get(s),
            (s, v) => set(s, (int)v),
            toolTip);

    private static InspectionThresholdSpec GreaterOrEqualSpec(
        decimal min,
        decimal max,
        decimal defaultValue,
        int decimalPlaces,
        Func<UserAnalysisSettings, decimal> get,
        Action<UserAnalysisSettings, decimal> set,
        string toolTip) =>
        new(ThresholdComparisonKind.GreaterOrEqual, min, max, defaultValue, decimalPlaces, get, set, toolTip);

    private static InspectionThresholdSpec LessThanSpec(
        decimal min,
        decimal max,
        decimal defaultValue,
        int decimalPlaces,
        Func<UserAnalysisSettings, decimal> get,
        Action<UserAnalysisSettings, decimal> set,
        string toolTip) =>
        new(ThresholdComparisonKind.LessThan, min, max, defaultValue, decimalPlaces, get, set, toolTip);
}
