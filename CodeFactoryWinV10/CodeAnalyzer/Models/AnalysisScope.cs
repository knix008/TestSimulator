namespace CodeAnalyzer.Models;

public static class AnalysisScope
{
    public static AnalysisScopeKind Normalize(AnalysisScopeKind scope) =>
        scope == 0 ? AnalysisScopeKind.All : scope;

    public static bool IsEnabled(AnalysisScopeKind scope, AnalysisScopeKind flag) =>
        (Normalize(scope) & flag) != 0;

    public static AnalysisScopeKind FromCheckedKinds(IEnumerable<AnalysisScopeKind> kinds)
    {
        AnalysisScopeKind combined = 0;
        foreach (var kind in kinds)
        {
            combined |= kind;
        }

        return Normalize(combined);
    }
}
