using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Metrics;

public interface ICodeMetricsAnalyzer
{
    string LanguageId { get; }

    Task<CodeMetricsResult> AnalyzeAsync(
        IReadOnlyList<string> sourceFiles,
        AnalysisProgressTracker? progress = null,
        CancellationToken cancellationToken = default);
}
