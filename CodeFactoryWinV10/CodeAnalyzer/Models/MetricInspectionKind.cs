namespace CodeAnalyzer.Models;

/// <summary>코드 메트릭·아키텍처 탭에서 수행할 검사·표시 항목. 기본값 <see cref="All"/>.</summary>
[Flags]
public enum MetricInspectionKind : ulong
{
    None = 0,

    ShowFilesTab = 1UL << 0,
    ShowFunctionsTab = 1UL << 1,
    ShowTypesTab = 1UL << 2,
    ShowArchitectureTab = 1UL << 3,

    CyclomaticComplexity = 1UL << 4,
    CognitiveComplexity = 1UL << 5,
    NestingDepth = 1UL << 6,
    ParameterCount = 1UL << 7,
    ReturnCount = 1UL << 8,
    MagicNumbers = 1UL << 9,
    FanOut = 1UL << 10,
    MaintenanceIndex = 1UL << 11,
    TodoDensity = 1UL << 12,
    GodFile = 1UL << 13,
    LowCommentRatio = 1UL << 14,
    FileDuplicateLines = 1UL << 15,
    GodType = 1UL << 16,

    CircularCalls = 1UL << 17,
    FileCoupling = 1UL << 18,
    DirectoryCoupling = 1UL << 19,
    FanOutHub = 1UL << 20,
    FanInHub = 1UL << 21,
    IsolatedFunctions = 1UL << 22,
    GlobalVariables = 1UL << 23,
    DatabaseSchema = 1UL << 24,
    DuplicateCodeGroups = 1UL << 25,
    TypeStructure = 1UL << 26,

    All = ShowFilesTab
        | ShowFunctionsTab
        | ShowTypesTab
        | ShowArchitectureTab
        | CyclomaticComplexity
        | CognitiveComplexity
        | NestingDepth
        | ParameterCount
        | ReturnCount
        | MagicNumbers
        | FanOut
        | MaintenanceIndex
        | TodoDensity
        | GodFile
        | LowCommentRatio
        | FileDuplicateLines
        | GodType
        | CircularCalls
        | FileCoupling
        | DirectoryCoupling
        | FanOutHub
        | FanInHub
        | IsolatedFunctions
        | GlobalVariables
        | DatabaseSchema
        | DuplicateCodeGroups
        | TypeStructure
}
