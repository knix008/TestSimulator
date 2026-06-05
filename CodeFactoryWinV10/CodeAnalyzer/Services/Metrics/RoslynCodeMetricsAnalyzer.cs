using CodeAnalyzer.Models;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.VisualBasic;
using Microsoft.CodeAnalysis.VisualBasic.Syntax;

namespace CodeAnalyzer.Services.Metrics;

public sealed class RoslynCodeMetricsAnalyzer : ICodeMetricsAnalyzer
{
    private readonly string _languageId;
    private readonly string _displayPrefix;
    private readonly bool _isVisualBasic;

    public RoslynCodeMetricsAnalyzer(string languageId, string displayPrefix, bool isVisualBasic)
    {
        _languageId = languageId;
        _displayPrefix = displayPrefix;
        _isVisualBasic = isVisualBasic;
    }

    public string LanguageId => _languageId;

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
        var label = _displayPrefix.Trim('[', ']');
        var references = MetadataReferenceProvider.CreateReferences();

        await ProcessFileRangeAsync(
            sourceFiles,
            references,
            functions,
            progress,
            label,
            cancellationToken,
            RoslynAnalysisOptions.FilesPerCompilation).ConfigureAwait(false);

        return CodeMetricsBuilder.Build([], functions);
    }

    private async Task ProcessFileRangeAsync(
        IReadOnlyList<string> files,
        IReadOnlyList<MetadataReference> references,
        List<FunctionMetric> functions,
        AnalysisProgressTracker? progress,
        string label,
        CancellationToken cancellationToken,
        int chunkSize)
    {
        if (files.Count == 0)
        {
            return;
        }

        if (files.Count == 1)
        {
            await AnalyzeSingleFileAsync(files[0], references, functions, progress, label, cancellationToken)
                .ConfigureAwait(false);
            return;
        }

        foreach (var chunk in files.Chunk(Math.Max(1, chunkSize)))
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                await AnalyzeChunkAsync(chunk, references, functions, progress, label, cancellationToken)
                    .ConfigureAwait(false);
            }
            catch (OutOfMemoryException)
            {
                var nextSize = Math.Max(1, chunkSize / 2);
                await ProcessFileRangeAsync(chunk, references, functions, progress, label, cancellationToken, nextSize)
                    .ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception) when (chunk.Length > 1)
            {
                var nextSize = Math.Max(1, chunkSize / 2);
                await ProcessFileRangeAsync(chunk, references, functions, progress, label, cancellationToken, nextSize)
                    .ConfigureAwait(false);
            }
        }
    }

    private async Task AnalyzeSingleFileAsync(
        string file,
        IReadOnlyList<MetadataReference> references,
        List<FunctionMetric> functions,
        AnalysisProgressTracker? progress,
        string label,
        CancellationToken cancellationToken)
    {
        try
        {
            await AnalyzeChunkAsync([file], references, functions, progress, label, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
        {
            progress?.Report($"{label} 건너뜀: {Path.GetFileName(file)}");
        }
    }

    private async Task AnalyzeChunkAsync(
        IReadOnlyList<string> chunk,
        IReadOnlyList<MetadataReference> references,
        List<FunctionMetric> functions,
        AnalysisProgressTracker? progress,
        string label,
        CancellationToken cancellationToken)
    {
        var trees = new List<SyntaxTree>();
        foreach (var file in chunk)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                var text = await File.ReadAllTextAsync(file, cancellationToken).ConfigureAwait(false);
                if (_isVisualBasic)
                {
                    trees.Add(VisualBasicSyntaxTree.ParseText(text, path: file, cancellationToken: cancellationToken));
                }
                else
                {
                    trees.Add(CSharpSyntaxTree.ParseText(
                        text,
                        new CSharpParseOptions(Microsoft.CodeAnalysis.CSharp.LanguageVersion.Latest),
                        file,
                        cancellationToken: cancellationToken));
                }
            }
            catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
            {
                progress?.Report($"{label} 건너뜀: {Path.GetFileName(file)}");
            }
        }

        if (trees.Count == 0)
        {
            return;
        }

        if (_isVisualBasic)
        {
            var compilation = VisualBasicCompilation.Create(
                $"MetricsVB_{Guid.NewGuid():N}",
                trees,
                references,
                new VisualBasicCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

            var seenFunctionIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (var tree in trees)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var model = compilation.GetSemanticModel(tree);
                var root = await tree.GetRootAsync(cancellationToken).ConfigureAwait(false);
                ExtractFromTree(root, model, tree.FilePath ?? string.Empty, functions, seenFunctionIds);
                progress?.Report($"{label}: {Path.GetFileName(tree.FilePath)}");
            }

            return;
        }

        {
            var compilation = CSharpCompilation.Create(
                $"MetricsCS_{Guid.NewGuid():N}",
                trees,
                references,
                new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

            var seenFunctionIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (var tree in trees)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var model = compilation.GetSemanticModel(tree);
                var root = await tree.GetRootAsync(cancellationToken).ConfigureAwait(false);
                ExtractFromTree(root, model, tree.FilePath ?? string.Empty, functions, seenFunctionIds);
                progress?.Report($"{label}: {Path.GetFileName(tree.FilePath)}");
            }
        }
    }

    private void ExtractFromTree(
        SyntaxNode root,
        SemanticModel model,
        string filePath,
        List<FunctionMetric> functions,
        HashSet<string> seenFunctionIds)
    {
        if (_isVisualBasic)
        {
            foreach (var method in root.DescendantNodes().OfType<MethodBlockBaseSyntax>())
            {
                AddMethodMetric(method, method, model, filePath, functions, seenFunctionIds);
            }

            return;
        }

        foreach (var method in root.DescendantNodes().OfType<MethodDeclarationSyntax>())
        {
            AddMethodMetric(method, method, model, filePath, functions, seenFunctionIds);
        }

        foreach (var op in root.DescendantNodes().OfType<OperatorDeclarationSyntax>())
        {
            AddMethodMetric(op, op, model, filePath, functions, seenFunctionIds);
        }

        foreach (var local in root.DescendantNodes().OfType<LocalFunctionStatementSyntax>())
        {
            AddMethodMetric(local, local, model, filePath, functions, seenFunctionIds);
        }
    }

    private void AddMethodMetric(
        SyntaxNode spanNode,
        SyntaxNode nameNode,
        SemanticModel model,
        string filePath,
        List<FunctionMetric> functions,
        HashSet<string> seenFunctionIds)
    {
        var symbol = model.GetDeclaredSymbol(spanNode) as IMethodSymbol;
        if (symbol is null || symbol.IsImplicitlyDeclared)
        {
            return;
        }

        var functionId = BuildFunctionId(symbol);
        if (!seenFunctionIds.Add(functionId))
        {
            return;
        }

        var span = spanNode.Span;
        var lineSpan = spanNode.SyntaxTree?.GetLineSpan(span);
        var startLine = (lineSpan?.StartLinePosition.Line ?? 0) + 1;
        var endLine = (lineSpan?.EndLinePosition.Line ?? startLine - 1) + 1;
        var lineCount = Math.Max(1, endLine - startLine + 1);
        var cyclomatic = ComputeCyclomatic(spanNode, _isVisualBasic);
        var (cognitive, maxNesting, returnCount) = _isVisualBasic
            ? FunctionComplexityMetrics.FromSourceText(spanNode.ToString())
            : FunctionComplexityMetrics.FromCSharpMethod(spanNode);
        var magic = _isVisualBasic
            ? FunctionComplexityMetrics.CountMagicNumbersFromText(spanNode.ToString())
            : FunctionComplexityMetrics.CountMagicNumbersFromCSharp(spanNode);
        var signals = _isVisualBasic
            ? FunctionQualitySignals.FromSourceText(spanNode.ToString())
            : FunctionQualitySignals.FromCSharpMethod(spanNode, symbol);

        functions.Add(new FunctionMetric
        {
            Id = functionId,
            LanguageId = _languageId,
            DisplayName = symbol.Name,
            FullName = $"{_displayPrefix} {symbol.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat)}",
            FilePath = symbol.Locations.FirstOrDefault(l => l.IsInSource)?.SourceTree?.FilePath ?? filePath,
            StartLine = startLine,
            EndLine = endLine,
            LineCount = lineCount,
            CyclomaticComplexity = cyclomatic,
            CognitiveComplexity = cognitive,
            MaxNestingDepth = maxNesting,
            ParameterCount = symbol.Parameters.Length,
            ReturnCount = returnCount,
            MagicNumberCount = magic,
            MaintenanceIndex = FunctionComplexityMetrics.ComputeMaintenanceIndex(
                lineCount, cyclomatic, cognitive, symbol.Parameters.Length),
            Precision = MetricsPrecision.Semantic,
            StatementCount = signals.StatementCount,
            SwitchCaseCount = signals.SwitchCaseCount,
            EmptyCatchCount = signals.EmptyCatchCount,
            BroadCatchCount = signals.BroadCatchCount,
            IsAsyncVoid = signals.IsAsyncVoid,
            IsPublic = symbol.DeclaredAccessibility == Microsoft.CodeAnalysis.Accessibility.Public,
            HalsteadVolume = signals.HalsteadVolume,
            WeightedMethodComplexity = signals.WeightedMethodCount
        });
    }

    private string BuildFunctionId(IMethodSymbol symbol)
        => $"{_languageId}:{symbol.OriginalDefinition.ToDisplayString(SymbolDisplayFormat.FullyQualifiedFormat)}";

    private static int ComputeCyclomatic(SyntaxNode methodBody, bool isVisualBasic)
    {
        if (isVisualBasic)
        {
            return 1 + MetricsDecisionPatterns.KeywordDecisionRegex.Matches(methodBody.ToString()).Count;
        }

        var complexity = 1;

        foreach (var node in methodBody.DescendantNodes())
        {
            if (node is Microsoft.CodeAnalysis.CSharp.Syntax.IfStatementSyntax
                or Microsoft.CodeAnalysis.CSharp.Syntax.ForStatementSyntax
                or Microsoft.CodeAnalysis.CSharp.Syntax.ForEachStatementSyntax
                or Microsoft.CodeAnalysis.CSharp.Syntax.WhileStatementSyntax
                or Microsoft.CodeAnalysis.CSharp.Syntax.DoStatementSyntax
                or Microsoft.CodeAnalysis.CSharp.Syntax.SwitchStatementSyntax
                or Microsoft.CodeAnalysis.CSharp.Syntax.CaseSwitchLabelSyntax
                or Microsoft.CodeAnalysis.CSharp.Syntax.CatchClauseSyntax
                or Microsoft.CodeAnalysis.CSharp.Syntax.ConditionalExpressionSyntax)
            {
                complexity++;
                continue;
            }

            if (node is Microsoft.CodeAnalysis.CSharp.Syntax.BinaryExpressionSyntax binary
                && (binary.IsKind(Microsoft.CodeAnalysis.CSharp.SyntaxKind.LogicalAndExpression)
                    || binary.IsKind(Microsoft.CodeAnalysis.CSharp.SyntaxKind.LogicalOrExpression)))
            {
                complexity++;
            }
        }

        return complexity;
    }
}
