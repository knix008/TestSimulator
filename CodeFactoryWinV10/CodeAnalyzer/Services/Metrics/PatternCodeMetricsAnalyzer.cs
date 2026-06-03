using System.Text.RegularExpressions;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Metrics;

/// <summary>
/// Tree-sitter 미지원 언어(Kotlin 등)용 근사 메트릭.
/// </summary>
public sealed class PatternCodeMetricsAnalyzer : ICodeMetricsAnalyzer
{
    private static readonly Regex KotlinFunRegex = new(
        @"^\s*(?:(?:private|protected|public|internal|open|override|suspend|inline|infix|operator|tailrec|external)\s+)*fun\s+(?:<[^>]+>\s+)?(?:[\w.`]+\.)*(\w+)\s*\(",
        RegexOptions.Compiled | RegexOptions.Multiline);


    private readonly string _languageId;
    private readonly string _displayPrefix;
    private readonly Regex _functionRegex;

    public PatternCodeMetricsAnalyzer(string languageId, string displayPrefix, Regex functionRegex)
    {
        _languageId = languageId;
        _displayPrefix = displayPrefix;
        _functionRegex = functionRegex;
    }

    public static PatternCodeMetricsAnalyzer Kotlin { get; } = new(
        "kotlin",
        "[Kotlin]",
        KotlinFunRegex);

    public string LanguageId => _languageId;

    public async Task<CodeMetricsResult> AnalyzeAsync(
        IReadOnlyList<string> sourceFiles,
        AnalysisProgressTracker? progress = null,
        CancellationToken cancellationToken = default)
    {
        var functions = new List<FunctionMetric>();
        var label = _displayPrefix.Trim('[', ']');

        foreach (var file in sourceFiles)
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                var text = await File.ReadAllTextAsync(file, cancellationToken).ConfigureAwait(false);
                functions.AddRange(ExtractFunctions(file, text));
                progress?.Report($"{label}: {Path.GetFileName(file)}");
            }
            catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
            {
                progress?.Report($"{label} 건너뜀: {Path.GetFileName(file)}");
            }
        }

        return CodeMetricsBuilder.Build([], functions);
    }

    private IEnumerable<FunctionMetric> ExtractFunctions(string filePath, string content)
    {
        var lines = content.Split('\n');
        var matches = _functionRegex.Matches(content);
        var starts = new List<(int Line, string Name)>();

        foreach (Match match in matches)
        {
            if (!match.Success || match.Groups.Count < 2)
            {
                continue;
            }

            var name = match.Groups[1].Value;
            if (string.IsNullOrWhiteSpace(name))
            {
                continue;
            }

            var line = content.AsSpan(0, match.Index).Count('\n') + 1;
            starts.Add((line, name));
        }

        starts.Sort((a, b) => a.Line.CompareTo(b.Line));

        for (var i = 0; i < starts.Count; i++)
        {
            var (startLine, name) = starts[i];
            var endLine = i + 1 < starts.Count ? starts[i + 1].Line - 1 : lines.Length;
            endLine = Math.Max(startLine, endLine);

            var body = string.Join('\n', lines.AsSpan(startLine - 1, endLine - startLine + 1).ToArray());
            var cyclomatic = 1 + MetricsDecisionPatterns.KeywordDecisionRegex.Matches(body).Count;
            var (cognitive, maxNesting, returnCount) = FunctionComplexityMetrics.FromSourceText(body);
            var lineCount = Math.Max(1, endLine - startLine + 1);
            var signature = matches[i].Value;
            var parameterCount = CountParametersFromSignature(signature);
            var magic = FunctionComplexityMetrics.CountMagicNumbersFromText(body);

            yield return new FunctionMetric
            {
                Id = $"{_languageId}:{filePath}::{name}",
                LanguageId = _languageId,
                DisplayName = name,
                FullName = $"{_displayPrefix} {Path.GetFileName(filePath)}::{name}",
                FilePath = filePath,
                StartLine = startLine,
                EndLine = endLine,
                LineCount = lineCount,
                CyclomaticComplexity = cyclomatic,
                CognitiveComplexity = cognitive,
                MaxNestingDepth = maxNesting,
                ParameterCount = parameterCount,
                ReturnCount = returnCount,
                MagicNumberCount = magic,
                MaintenanceIndex = FunctionComplexityMetrics.ComputeMaintenanceIndex(
                    lineCount, cyclomatic, cognitive, parameterCount),
                Precision = MetricsPrecision.Approximate
            };
        }
    }

    private static int CountParametersFromSignature(string signature)
    {
        var start = signature.IndexOf('(');
        var end = signature.IndexOf(')');
        if (start < 0 || end <= start)
        {
            return 0;
        }

        var inner = signature[(start + 1)..end].Trim();
        if (inner.Length == 0)
        {
            return 0;
        }

        return inner.Split(',').Length;
    }
}
