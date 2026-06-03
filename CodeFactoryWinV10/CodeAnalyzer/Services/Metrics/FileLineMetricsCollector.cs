using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Metrics;

public static class FileLineMetricsCollector
{
    public static async Task<IReadOnlyList<FileLineMetric>> CollectAsync(
        IReadOnlyList<string> sourceFiles,
        CancellationToken cancellationToken = default)
    {
        var metrics = new List<FileLineMetric>(sourceFiles.Count);

        foreach (var file in sourceFiles)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var language = LanguageRegistry.FindByExtension(Path.GetExtension(file));
            if (language is null)
            {
                continue;
            }

            try
            {
                var text = await File.ReadAllTextAsync(file, cancellationToken).ConfigureAwait(false);
                var (physical, code, blank) = SourceLineCounter.Count(text);
                metrics.Add(new FileLineMetric
                {
                    FilePath = file,
                    LanguageId = language.Id,
                    PhysicalLines = physical,
                    CodeLines = code,
                    BlankLines = blank
                });
            }
            catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
            {
                // skip unreadable file
            }
        }

        FileQualityScanner.ApplyTodoMetrics(metrics);
        return metrics;
    }
}
