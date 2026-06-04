namespace CodeAnalyzer.Models;

public sealed class UserAnalysisSettings
{
    public const int MinDuplicateLinesFloor = 2;
    public const int MinDuplicateLinesCeiling = 200;

    private static UserAnalysisSettings _designerDefaults = CreateBuiltInDefaults();

    public static int DefaultMinDuplicateLines => _designerDefaults.MinDuplicateLines;
    public static int DefaultWarnCyclomaticComplexity => _designerDefaults.WarnCyclomaticComplexity;
    public static int DefaultWarnCognitiveComplexity => _designerDefaults.WarnCognitiveComplexity;
    public static int DefaultWarnMaxNestingDepth => _designerDefaults.WarnMaxNestingDepth;
    public static int DefaultWarnParameterCount => _designerDefaults.WarnParameterCount;
    public static int DefaultWarnFanOut => _designerDefaults.WarnFanOut;
    public static double DefaultWarnMaintenanceIndex => _designerDefaults.WarnMaintenanceIndex;
    public static double DefaultWarnTodoDensityPer100Lines => _designerDefaults.WarnTodoDensityPer100Lines;

    public string? LastRootDirectory { get; set; }

    public int MinDuplicateLines { get; set; }
    public int WarnCyclomaticComplexity { get; set; }
    public int WarnCognitiveComplexity { get; set; }
    public int WarnMaxNestingDepth { get; set; }
    public int WarnParameterCount { get; set; }
    public int WarnFanOut { get; set; }
    public double WarnMaintenanceIndex { get; set; }
    public double WarnTodoDensityPer100Lines { get; set; }

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
            WarnTodoDensityPer100Lines = source.WarnTodoDensityPer100Lines
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
    }

    /// <summary>Designer 초기값과 동일한 내장 fallback (MainForm 생성 전용).</summary>
    private static UserAnalysisSettings CreateBuiltInDefaults() => new(initializingBuiltInDefaults: true)
    {
        MinDuplicateLines = 10,
        WarnCyclomaticComplexity = 15,
        WarnCognitiveComplexity = 15,
        WarnMaxNestingDepth = 4,
        WarnParameterCount = 7,
        WarnFanOut = 10,
        WarnMaintenanceIndex = 65,
        WarnTodoDensityPer100Lines = 2.0
    };
}
