namespace CodeAnalyzer.Models;

public sealed class UserAnalysisSettings
{
    public const int DefaultMinDuplicateLines = 3;
    public const int MinDuplicateLinesFloor = 2;
    public const int MinDuplicateLinesCeiling = 200;

    public const int DefaultWarnCyclomaticComplexity = 15;
    public const int DefaultWarnCognitiveComplexity = 15;
    public const int DefaultWarnMaxNestingDepth = 4;
    public const int DefaultWarnParameterCount = 7;
    public const int DefaultWarnFanOut = 10;
    public const double DefaultWarnMaintenanceIndex = 65;
    public const double DefaultWarnTodoDensityPer100Lines = 2.0;

    public string? LastRootDirectory { get; set; }
    public int MinDuplicateLines { get; set; } = DefaultMinDuplicateLines;

    public int WarnCyclomaticComplexity { get; set; } = DefaultWarnCyclomaticComplexity;
    public int WarnCognitiveComplexity { get; set; } = DefaultWarnCognitiveComplexity;
    public int WarnMaxNestingDepth { get; set; } = DefaultWarnMaxNestingDepth;
    public int WarnParameterCount { get; set; } = DefaultWarnParameterCount;
    public int WarnFanOut { get; set; } = DefaultWarnFanOut;
    public double WarnMaintenanceIndex { get; set; } = DefaultWarnMaintenanceIndex;
    public double WarnTodoDensityPer100Lines { get; set; } = DefaultWarnTodoDensityPer100Lines;
}
