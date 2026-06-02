namespace CodeAnalyzer.Services;

internal static class RoslynAnalysisOptions
{
    // 32 files per chunk balances cancellation responsiveness with cross-file symbol resolution.
    // Per-invocation cancellation checks in AnalyzeSyntaxTree already handle fine-grained responsiveness.
    public const int FilesPerCompilation = 32;
}
