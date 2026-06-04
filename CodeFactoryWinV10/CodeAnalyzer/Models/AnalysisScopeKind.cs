namespace CodeAnalyzer.Models;

/// <summary>백그라운드 분석 파이프라인에 포함할 단계. 기본값 <see cref="All"/>.</summary>
[Flags]
public enum AnalysisScopeKind : uint
{
    None = 0,
    CallGraph = 1 << 0,
    TypeStructure = 1 << 1,
    CodeMetrics = 1 << 2,
    DuplicateCode = 1 << 3,
    GlobalVariables = 1 << 4,
    DatabaseSchema = 1 << 5,

    All = CallGraph
        | TypeStructure
        | CodeMetrics
        | DuplicateCode
        | GlobalVariables
        | DatabaseSchema
}
