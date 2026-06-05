using CodeAnalyzer.Services;

namespace CodeAnalyzer.Models;

public sealed class UserAnalysisSettings
{
    public const int MinDuplicateLinesFloor = 2;
    public const int MinDuplicateLinesCeiling = 200;

    private static UserAnalysisSettings _designerDefaults = CreateBuiltInDefaults();

    public static int DefaultMinDuplicateLines => _designerDefaults.MinDuplicateLines;

    /// <summary>분석·보내기용 — 저장값 0/누락은 <see cref="RegisterDesignerDefaults"/>로 등록한 디자이너 기본값으로 대체합니다.</summary>
    public static UserAnalysisSettings ResolveForAnalysis(UserAnalysisSettings? source)
    {
        var defaults = _designerDefaults;
        if (source is null)
        {
            return CloneThresholds(defaults);
        }

        return new UserAnalysisSettings
        {
            LastRootDirectory = source.LastRootDirectory,
            MinDuplicateLines = NormalizeMinDuplicateLines(source.MinDuplicateLines),
            WarnCyclomaticComplexity = ResolvePositiveInt(source.WarnCyclomaticComplexity, defaults.WarnCyclomaticComplexity, 1, 200),
            WarnCognitiveComplexity = ResolvePositiveInt(source.WarnCognitiveComplexity, defaults.WarnCognitiveComplexity, 1, 200),
            WarnMaxNestingDepth = ResolvePositiveInt(source.WarnMaxNestingDepth, defaults.WarnMaxNestingDepth, 1, 50),
            WarnParameterCount = ResolvePositiveInt(source.WarnParameterCount, defaults.WarnParameterCount, 1, 50),
            WarnFanOut = ResolvePositiveInt(source.WarnFanOut, defaults.WarnFanOut, 1, 500),
            WarnMaintenanceIndex = ResolvePositiveDouble(source.WarnMaintenanceIndex, defaults.WarnMaintenanceIndex, 0, 171),
            WarnTodoDensityPer100Lines = ResolvePositiveDouble(source.WarnTodoDensityPer100Lines, defaults.WarnTodoDensityPer100Lines, 0, 100),
            WarnReturnCount = ResolvePositiveInt(source.WarnReturnCount, defaults.WarnReturnCount, 1, 50),
            WarnMagicNumbers = ResolvePositiveInt(source.WarnMagicNumbers, defaults.WarnMagicNumbers, 1, 100),
            WarnGodFileCodeLines = ResolvePositiveInt(source.WarnGodFileCodeLines, defaults.WarnGodFileCodeLines, 100, 50_000),
            WarnMinCommentPercent = ResolvePositiveDouble(source.WarnMinCommentPercent, defaults.WarnMinCommentPercent, 0, 100),
            WarnGodTypeMemberCount = ResolvePositiveInt(source.WarnGodTypeMemberCount, defaults.WarnGodTypeMemberCount, 5, 500),
            WarnStatementCount = ResolvePositiveInt(source.WarnStatementCount, defaults.WarnStatementCount, 10, 500),
            WarnSwitchCaseCount = ResolvePositiveInt(source.WarnSwitchCaseCount, defaults.WarnSwitchCaseCount, 3, 200),
            WarnPublicApiCount = ResolvePositiveInt(source.WarnPublicApiCount, defaults.WarnPublicApiCount, 5, 500),
            WarnMinTestCodePercent = ResolvePositiveDouble(source.WarnMinTestCodePercent, defaults.WarnMinTestCodePercent, 0, 100),
            WarnInstability = ResolvePositiveDouble(source.WarnInstability, defaults.WarnInstability, 0, 1),
            WarnLackOfCohesion = ResolvePositiveDouble(source.WarnLackOfCohesion, defaults.WarnLackOfCohesion, 0, 1),
            WarnInheritanceDepth = ResolvePositiveInt(source.WarnInheritanceDepth, defaults.WarnInheritanceDepth, 2, 20),
            WarnGitChangeLines = ResolvePositiveInt(source.WarnGitChangeLines, defaults.WarnGitChangeLines, 50, 1_000_000),
            WarnSecuritySmellCount = ResolvePositiveInt(source.WarnSecuritySmellCount, defaults.WarnSecuritySmellCount, 1, 100),
            EnabledInspections = MetricInspectionCatalog.NormalizeScope(
                source.EnabledInspections == 0 ? defaults.EnabledInspections : source.EnabledInspections),
            EnabledAnalysisScope = ResolveAnalysisScopeFromInspections(source),
            IncludedDirectoryPaths = [],
            ExcludedDirectoryPaths = ClonePathList(source.ExcludedDirectoryPaths)
        };
    }

    private static List<string> ClonePathList(IReadOnlyList<string>? paths) =>
        paths is null || paths.Count == 0 ? [] : paths.ToList();

    public static int NormalizeMinDuplicateLines(int value) =>
        value <= 0
            ? DefaultMinDuplicateLines
            : Math.Clamp(value, MinDuplicateLinesFloor, MinDuplicateLinesCeiling);

    private static int ResolvePositiveInt(int value, int designerDefault, int min, int max) =>
        Math.Clamp(value > 0 ? value : designerDefault, min, max);

    private static double ResolvePositiveDouble(double value, double designerDefault, double min, double max) =>
        Math.Clamp(value > 0 ? value : designerDefault, min, max);

    private static AnalysisScopeKind ResolveAnalysisScopeFromInspections(UserAnalysisSettings source)
    {
        var inspections = source.EnabledInspections == 0
            ? MetricInspectionKind.All
            : source.EnabledInspections;
        return AnalysisScopeResolver.Resolve(inspections);
    }
    public static int DefaultWarnCyclomaticComplexity => _designerDefaults.WarnCyclomaticComplexity;
    public static int DefaultWarnCognitiveComplexity => _designerDefaults.WarnCognitiveComplexity;
    public static int DefaultWarnMaxNestingDepth => _designerDefaults.WarnMaxNestingDepth;
    public static int DefaultWarnParameterCount => _designerDefaults.WarnParameterCount;
    public static int DefaultWarnFanOut => _designerDefaults.WarnFanOut;
    public static double DefaultWarnMaintenanceIndex => _designerDefaults.WarnMaintenanceIndex;
    public static double DefaultWarnTodoDensityPer100Lines => _designerDefaults.WarnTodoDensityPer100Lines;
    public static int DefaultWarnReturnCount => _designerDefaults.WarnReturnCount;
    public static int DefaultWarnMagicNumbers => _designerDefaults.WarnMagicNumbers;
    public static int DefaultWarnGodFileCodeLines => _designerDefaults.WarnGodFileCodeLines;
    public static double DefaultWarnMinCommentPercent => _designerDefaults.WarnMinCommentPercent;
    public static int DefaultWarnGodTypeMemberCount => _designerDefaults.WarnGodTypeMemberCount;
    public static int DefaultWarnStatementCount => _designerDefaults.WarnStatementCount;
    public static int DefaultWarnSwitchCaseCount => _designerDefaults.WarnSwitchCaseCount;
    public static int DefaultWarnPublicApiCount => _designerDefaults.WarnPublicApiCount;
    public static double DefaultWarnMinTestCodePercent => _designerDefaults.WarnMinTestCodePercent;
    public static double DefaultWarnInstability => _designerDefaults.WarnInstability;
    public static double DefaultWarnLackOfCohesion => _designerDefaults.WarnLackOfCohesion;
    public static int DefaultWarnInheritanceDepth => _designerDefaults.WarnInheritanceDepth;
    public static int DefaultWarnGitChangeLines => _designerDefaults.WarnGitChangeLines;
    public static int DefaultWarnSecuritySmellCount => _designerDefaults.WarnSecuritySmellCount;

    public string? LastRootDirectory { get; set; }

    public int MinDuplicateLines { get; set; }
    public int WarnCyclomaticComplexity { get; set; }
    public int WarnCognitiveComplexity { get; set; }
    public int WarnMaxNestingDepth { get; set; }
    public int WarnParameterCount { get; set; }
    public int WarnFanOut { get; set; }
    public double WarnMaintenanceIndex { get; set; }
    public double WarnTodoDensityPer100Lines { get; set; }
    public int WarnReturnCount { get; set; }
    public int WarnMagicNumbers { get; set; }
    public int WarnGodFileCodeLines { get; set; }
    public double WarnMinCommentPercent { get; set; }
    public int WarnGodTypeMemberCount { get; set; }
    public int WarnStatementCount { get; set; } = 50;
    public int WarnSwitchCaseCount { get; set; } = 10;
    public int WarnPublicApiCount { get; set; } = 30;
    public double WarnMinTestCodePercent { get; set; } = 10;
    public double WarnInstability { get; set; } = 0.7;
    public double WarnLackOfCohesion { get; set; } = 0.6;
    public int WarnInheritanceDepth { get; set; } = 5;
    public int WarnGitChangeLines { get; set; } = 500;
    public int WarnSecuritySmellCount { get; set; } = 1;

    public int SchemaVersion { get; set; }

    public MetricInspectionKind EnabledInspections { get; set; } = MetricInspectionKind.All;

    public AnalysisScopeKind EnabledAnalysisScope { get; set; } = AnalysisScopeKind.All;

    public List<string> IncludedDirectoryPaths { get; set; } = [];

    public List<string> ExcludedDirectoryPaths { get; set; } = [];

    public UserAnalysisSettings()
    {
        CopyThresholdsFrom(_designerDefaults);
    }

    /// <summary>정적 기본값 초기화 전용 — <see cref="CopyThresholdsFrom"/> 호출 없음.</summary>
    private UserAnalysisSettings(bool initializingBuiltInDefaults)
    {
        _ = initializingBuiltInDefaults;
    }

    /// <summary>MainForm Designer 컨트롤 값을 앱 전역 기본값으로 등록합니다.</summary>
    public static void RegisterDesignerDefaults(UserAnalysisSettings settings)
    {
        if (settings is null)
        {
            return;
        }

        _designerDefaults = CloneThresholds(settings);
    }

    public static UserAnalysisSettings CreateDefaults() => CloneThresholds(_designerDefaults);

    public static UserAnalysisSettings CloneThresholds(UserAnalysisSettings source)
    {
        if (source is null)
        {
            return CreateBuiltInDefaults();
        }

        return new UserAnalysisSettings
        {
            LastRootDirectory = source.LastRootDirectory,
            MinDuplicateLines = source.MinDuplicateLines,
            WarnCyclomaticComplexity = source.WarnCyclomaticComplexity,
            WarnCognitiveComplexity = source.WarnCognitiveComplexity,
            WarnMaxNestingDepth = source.WarnMaxNestingDepth,
            WarnParameterCount = source.WarnParameterCount,
            WarnFanOut = source.WarnFanOut,
            WarnMaintenanceIndex = source.WarnMaintenanceIndex,
            WarnTodoDensityPer100Lines = source.WarnTodoDensityPer100Lines,
            WarnReturnCount = source.WarnReturnCount,
            WarnMagicNumbers = source.WarnMagicNumbers,
            WarnGodFileCodeLines = source.WarnGodFileCodeLines,
            WarnMinCommentPercent = source.WarnMinCommentPercent,
            WarnGodTypeMemberCount = source.WarnGodTypeMemberCount,
            WarnStatementCount = source.WarnStatementCount,
            WarnSwitchCaseCount = source.WarnSwitchCaseCount,
            WarnPublicApiCount = source.WarnPublicApiCount,
            WarnMinTestCodePercent = source.WarnMinTestCodePercent,
            WarnInstability = source.WarnInstability,
            WarnLackOfCohesion = source.WarnLackOfCohesion,
            WarnInheritanceDepth = source.WarnInheritanceDepth,
            WarnGitChangeLines = source.WarnGitChangeLines,
            WarnSecuritySmellCount = source.WarnSecuritySmellCount,
            EnabledInspections = MetricInspectionScope.Normalize(source.EnabledInspections),
            EnabledAnalysisScope = AnalysisScopeResolver.Resolve(
                MetricInspectionScope.Normalize(source.EnabledInspections)),
            IncludedDirectoryPaths = ClonePathList(source.IncludedDirectoryPaths),
            ExcludedDirectoryPaths = ClonePathList(source.ExcludedDirectoryPaths)
        };
    }

    private void CopyThresholdsFrom(UserAnalysisSettings? source)
    {
        if (source is null)
        {
            source = CreateBuiltInDefaults();
        }

        MinDuplicateLines = source.MinDuplicateLines;
        WarnCyclomaticComplexity = source.WarnCyclomaticComplexity;
        WarnCognitiveComplexity = source.WarnCognitiveComplexity;
        WarnMaxNestingDepth = source.WarnMaxNestingDepth;
        WarnParameterCount = source.WarnParameterCount;
        WarnFanOut = source.WarnFanOut;
        WarnMaintenanceIndex = source.WarnMaintenanceIndex;
        WarnTodoDensityPer100Lines = source.WarnTodoDensityPer100Lines;
        WarnReturnCount = source.WarnReturnCount;
        WarnMagicNumbers = source.WarnMagicNumbers;
        WarnGodFileCodeLines = source.WarnGodFileCodeLines;
        WarnMinCommentPercent = source.WarnMinCommentPercent;
        WarnGodTypeMemberCount = source.WarnGodTypeMemberCount;
        WarnStatementCount = source.WarnStatementCount;
        WarnSwitchCaseCount = source.WarnSwitchCaseCount;
        WarnPublicApiCount = source.WarnPublicApiCount;
        WarnMinTestCodePercent = source.WarnMinTestCodePercent;
        WarnInstability = source.WarnInstability;
        WarnLackOfCohesion = source.WarnLackOfCohesion;
        WarnInheritanceDepth = source.WarnInheritanceDepth;
        WarnGitChangeLines = source.WarnGitChangeLines;
        WarnSecuritySmellCount = source.WarnSecuritySmellCount;
        EnabledInspections = MetricInspectionScope.Normalize(source.EnabledInspections);
        EnabledAnalysisScope = AnalysisScopeResolver.Resolve(
            MetricInspectionScope.Normalize(source.EnabledInspections));
        IncludedDirectoryPaths = ClonePathList(source.IncludedDirectoryPaths);
        ExcludedDirectoryPaths = ClonePathList(source.ExcludedDirectoryPaths);
    }

    /// <summary>MainForm 생성 전 플레이스홀더. 실제 기본값은 Designer + <see cref="RegisterDesignerDefaults"/>.</summary>
    private static UserAnalysisSettings CreateBuiltInDefaults() => new(initializingBuiltInDefaults: true)
    {
        EnabledInspections = MetricInspectionKind.All,
        EnabledAnalysisScope = AnalysisScopeKind.All,
        WarnStatementCount = 50,
        WarnSwitchCaseCount = 10,
        WarnPublicApiCount = 30,
        WarnMinTestCodePercent = 10,
        WarnInstability = 0.7,
        WarnLackOfCohesion = 0.6,
        WarnInheritanceDepth = 5,
        WarnGitChangeLines = 500,
        WarnSecuritySmellCount = 1
    };
}
