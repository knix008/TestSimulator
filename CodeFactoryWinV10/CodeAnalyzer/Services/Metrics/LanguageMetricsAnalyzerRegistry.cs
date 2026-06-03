namespace CodeAnalyzer.Services.Metrics;

public static class LanguageMetricsAnalyzerRegistry
{
    private static readonly IReadOnlyDictionary<string, ICodeMetricsAnalyzer> Analyzers = BuildRegistry();

    private static IReadOnlyDictionary<string, ICodeMetricsAnalyzer> BuildRegistry()
    {
        var list = new List<ICodeMetricsAnalyzer>
        {
            new RoslynCodeMetricsAnalyzer("csharp", "[C#]", isVisualBasic: false),
            new RoslynCodeMetricsAnalyzer("vbnet", "[VB.NET]", isVisualBasic: true)
        };

        foreach (var config in TreeSitterMetricsConfigs.All)
        {
            list.Add(new TreeSitterCodeMetricsAnalyzer(config));
        }

        list.Add(PatternCodeMetricsAnalyzer.Kotlin);

        return list.ToDictionary(analyzer => analyzer.LanguageId, StringComparer.OrdinalIgnoreCase);
    }

    public static ICodeMetricsAnalyzer? GetAnalyzer(string languageId)
        => Analyzers.GetValueOrDefault(languageId);

    public static IReadOnlyCollection<ICodeMetricsAnalyzer> All => Analyzers.Values.ToList();
}
