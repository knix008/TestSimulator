using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.GlobalVariables;

public sealed class GlobalVariableAnalyzer
{
    private readonly CSharpGlobalVariableExtractor _csharpExtractor = new();
    private readonly VisualBasicGlobalVariableExtractor _vbExtractor = new();
    private readonly PatternGlobalVariableExtractor _patternExtractor = new();

    public async Task<GlobalVariableResult> AnalyzeAsync(
        Dictionary<string, List<string>> filesByLanguage,
        HashSet<string> enabledLanguageIds,
        CancellationToken cancellationToken = default)
    {
        var variables = new Dictionary<string, GlobalVariableItem>(StringComparer.OrdinalIgnoreCase);

        if (filesByLanguage.TryGetValue("csharp", out var csharpFiles)
            && enabledLanguageIds.Contains("csharp")
            && csharpFiles.Count > 0)
        {
            Merge(await _csharpExtractor.ExtractAsync(csharpFiles, cancellationToken).ConfigureAwait(false), variables);
        }

        if (filesByLanguage.TryGetValue("vbnet", out var vbFiles)
            && enabledLanguageIds.Contains("vbnet")
            && vbFiles.Count > 0)
        {
            Merge(await _vbExtractor.ExtractAsync(vbFiles, cancellationToken).ConfigureAwait(false), variables);
        }

        foreach (var language in LanguageRegistry.All)
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (language.Id is "csharp" or "vbnet")
            {
                continue;
            }

            if (!enabledLanguageIds.Contains(language.Id))
            {
                continue;
            }

            if (!filesByLanguage.TryGetValue(language.Id, out var files) || files.Count == 0)
            {
                continue;
            }

            Merge(_patternExtractor.Extract(language.Id, files, cancellationToken), variables);
        }

        return new GlobalVariableResult
        {
            Variables = variables.Values
                .OrderBy(variable => variable.FilePath, StringComparer.OrdinalIgnoreCase)
                .ThenBy(variable => variable.LineNumber)
                .ThenBy(variable => variable.Name, StringComparer.OrdinalIgnoreCase)
                .ToList()
        };
    }

    private static void Merge(
        IEnumerable<GlobalVariableItem> items,
        Dictionary<string, GlobalVariableItem> variables)
    {
        foreach (var item in items)
        {
            variables.TryAdd(item.Id, item);
        }
    }
}
