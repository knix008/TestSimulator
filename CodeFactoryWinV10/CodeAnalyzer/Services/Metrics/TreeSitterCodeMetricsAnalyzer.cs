using CodeAnalyzer.Models;
using TreeSitter;

namespace CodeAnalyzer.Services.Metrics;

public sealed class TreeSitterCodeMetricsAnalyzer : ICodeMetricsAnalyzer
{
    private readonly TreeSitterMetricsConfig _config;

    public TreeSitterCodeMetricsAnalyzer(TreeSitterMetricsConfig config)
    {
        _config = config;
    }

    public string LanguageId => _config.LanguageId;

    public async Task<CodeMetricsResult> AnalyzeAsync(
        IReadOnlyList<string> sourceFiles,
        AnalysisProgressTracker? progress = null,
        CancellationToken cancellationToken = default)
    {
        if (sourceFiles.Count == 0)
        {
            return new CodeMetricsResult();
        }

        var functions = new List<FunctionMetric>();
        var label = _config.DisplayPrefix.Trim('[', ']');

        var byGrammar = sourceFiles.GroupBy(
            file => _config.ResolveGrammarName?.Invoke(file) ?? _config.DefaultGrammarName,
            StringComparer.Ordinal);

        foreach (var group in byGrammar)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var queryPattern = _config.FuncDefQueryPattern;
            if (_config.ResolveFuncDefQuery is not null)
            {
                var resolved = _config.ResolveFuncDefQuery(group.Key);
                if (!string.IsNullOrWhiteSpace(resolved))
                {
                    queryPattern = resolved;
                }
            }

            using var language = new Language(group.Key);
            using var parser = new Parser(language);
            using var funcQuery = new Query(language, queryPattern);

            foreach (var file in group)
            {
                cancellationToken.ThrowIfCancellationRequested();

                try
                {
                    var source = await File.ReadAllTextAsync(file, cancellationToken).ConfigureAwait(false);
                    functions.AddRange(ParseFunctions(file, source, parser, funcQuery, cancellationToken));
                    progress?.Report($"{label}: {Path.GetFileName(file)}");
                }
                catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
                {
                    progress?.Report($"{label} 건너뜀: {Path.GetFileName(file)}");
                }
            }
        }

        return CodeMetricsBuilder.Build([], functions);
    }

    private IEnumerable<FunctionMetric> ParseFunctions(
        string filePath,
        string source,
        Parser parser,
        Query funcQuery,
        CancellationToken cancellationToken)
    {
        using var tree = parser.Parse(source);
        if (tree is null)
        {
            yield break;
        }

        foreach (var match in funcQuery.Execute(tree.RootNode).Matches)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var nameCapture = match.Captures.FirstOrDefault(c => c.Name == "name");
            var defCapture = match.Captures.FirstOrDefault(c => c.Name == "def");
            if (nameCapture is null)
            {
                continue;
            }

            var funcName = nameCapture.Node.Text;
            if (string.IsNullOrWhiteSpace(funcName))
            {
                continue;
            }

            var rangeNode = defCapture?.Node ?? nameCapture.Node;
            var startLine = rangeNode.StartPosition.Row + 1;
            var endLine = rangeNode.EndPosition.Row + 1;
            var lineCount = Math.Max(1, endLine - startLine + 1);
            var cyclomatic = CyclomaticCounter.FromSyntaxTree(rangeNode, _config.ExtraDecisionNodeTypes);
            var (cognitive, maxNesting, returnCount) = FunctionComplexityMetrics.FromSyntaxTree(
                rangeNode,
                _config.ExtraDecisionNodeTypes);
            var bodyText = rangeNode.Text;
            var magic = FunctionComplexityMetrics.CountMagicNumbersFromText(bodyText);
            var signals = FunctionQualitySignals.FromSyntaxTree(rangeNode);

            yield return new FunctionMetric
            {
                Id = $"{_config.LanguageId}:{filePath}::{funcName}",
                LanguageId = _config.LanguageId,
                DisplayName = funcName,
                FullName = $"{_config.DisplayPrefix} {Path.GetFileName(filePath)}::{funcName}",
                FilePath = filePath,
                StartLine = startLine,
                EndLine = endLine,
                LineCount = lineCount,
                CyclomaticComplexity = cyclomatic,
                CognitiveComplexity = cognitive,
                MaxNestingDepth = maxNesting,
                ParameterCount = 0,
                ReturnCount = returnCount,
                MagicNumberCount = magic,
                MaintenanceIndex = FunctionComplexityMetrics.ComputeMaintenanceIndex(
                    lineCount, cyclomatic, cognitive, 0),
                Precision = MetricsPrecision.Syntax,
                StatementCount = signals.StatementCount,
                SwitchCaseCount = signals.SwitchCaseCount,
                EmptyCatchCount = signals.EmptyCatchCount,
                BroadCatchCount = signals.BroadCatchCount,
                IsAsyncVoid = signals.IsAsyncVoid,
                HalsteadVolume = signals.HalsteadVolume,
                WeightedMethodComplexity = signals.WeightedMethodCount
            };
        }
    }
}
