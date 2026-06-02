using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public interface ICallGraphAnalyzer
{
    string LanguageId { get; }

    Task<CallGraphResult> AnalyzeAsync(
        IReadOnlyList<string> sourceFiles,
        AnalysisProgressTracker? progress = null,
        CancellationToken cancellationToken = default);
}
