namespace CodeAnalyzer.Models;

public enum BugRiskCategory
{
    ExceptionSwallowing,    // 빈 catch / 예외 무음 처리
    UnusedVariable,         // 선언 후 사용되지 않는 지역 변수
    DeadCode,               // 도달 불가 코드 (return/throw 이후)
    ConstantCondition,      // 항상 참 또는 거짓인 조건 (리터럴·null==null)
    AlwaysTrue,             // if(true) 등 항상 참
    AlwaysFalse,            // if(false) 등 항상 거짓
    CompareToSelf,          // x == x 자기 자신과 비교
    NullDereference,        // null 검사 없는 as-캐스트 결과 역참조
    ResourceLeak,           // IDisposable 객체를 using/Dispose 없이 생성
    HighComplexityNesting,  // 높은 복잡도 + 깊은 중첩 복합 위험
    DeadWrite,              // 할당 후 읽히지 않는 변수 쓰기
    EmptyBlock,             // 빈 else/try 블록
    DuplicateCondition,     // else-if 체인의 중복 조건
    AsyncVoidMethod,        // async void — 예외 전파 불가
    MagicNumberAbuse,       // 과도한 매직 넘버 사용
    PossiblyUnusedPrivate,  // 호출 그래프에서 참조 없는 함수
    LintViolation,          // 외부 Lint 도구 (ESLint / pylint / RuboCop 등)
}

public enum BugRiskSeverity
{
    Info = 0,
    Warning = 1,
    Critical = 2
}

public sealed class BugRiskFinding
{
    public required BugRiskCategory Category { get; init; }
    public required BugRiskSeverity Severity { get; init; }
    public required string Message { get; init; }
    public required string FilePath { get; init; }
    public int LineNumber { get; init; }
    public string FunctionName { get; init; } = string.Empty;
    public string Detail { get; init; } = string.Empty;
    public string Snippet { get; init; } = string.Empty;
    public string LanguageId { get; init; } = string.Empty;
}

public sealed class BugRiskResult
{
    public IReadOnlyList<BugRiskFinding> Findings { get; init; } = [];

    public IReadOnlyDictionary<BugRiskCategory, IReadOnlyList<BugRiskFinding>> ByCategory { get; init; }
        = new Dictionary<BugRiskCategory, IReadOnlyList<BugRiskFinding>>();

    public IReadOnlyDictionary<string, IReadOnlyList<BugRiskFinding>> ByFile { get; init; }
        = new Dictionary<string, IReadOnlyList<BugRiskFinding>>(StringComparer.OrdinalIgnoreCase);

    public static BugRiskResult Empty { get; } = new();

    public static BugRiskResult FromFindings(IEnumerable<BugRiskFinding> findings)
    {
        var list = findings
            .OrderBy(f => f.Severity == BugRiskSeverity.Critical ? 0
                        : f.Severity == BugRiskSeverity.Warning ? 1 : 2)
            .ThenBy(f => f.FilePath, StringComparer.OrdinalIgnoreCase)
            .ThenBy(f => f.LineNumber)
            .ToList();

        return new BugRiskResult
        {
            Findings = list,
            ByCategory = list
                .GroupBy(f => f.Category)
                .ToDictionary(g => g.Key, g => (IReadOnlyList<BugRiskFinding>)g.ToList()),
            ByFile = list
                .GroupBy(f => f.FilePath, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(
                    g => g.Key,
                    g => (IReadOnlyList<BugRiskFinding>)g.ToList(),
                    StringComparer.OrdinalIgnoreCase)
        };
    }
}
