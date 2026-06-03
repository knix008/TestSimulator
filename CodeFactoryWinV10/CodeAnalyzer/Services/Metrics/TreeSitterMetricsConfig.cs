namespace CodeAnalyzer.Services.Metrics;

public sealed class TreeSitterMetricsConfig
{
    public required string LanguageId { get; init; }
    public required string DisplayPrefix { get; init; }
    public required string DefaultGrammarName { get; init; }
    public required string FuncDefQueryPattern { get; init; }
    public Func<string, string>? ResolveGrammarName { get; init; }
    public Func<string, string>? ResolveFuncDefQuery { get; init; }
    public IReadOnlySet<string>? ExtraDecisionNodeTypes { get; init; }
}
