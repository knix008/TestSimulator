using CodeAnalyzer.Models;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.VisualBasic;
using Microsoft.CodeAnalysis.VisualBasic.Syntax;

namespace CodeAnalyzer.Services;

public sealed class VisualBasicCallGraphAnalyzer
{
    public async Task<CallGraphResult> AnalyzeAsync(
        IReadOnlyList<string> sourceFiles,
        AnalysisProgressTracker? progress = null,
        CancellationToken cancellationToken = default)
    {
        if (sourceFiles.Count == 0)
        {
            return new CallGraphResult();
        }

        var nodes = new Dictionary<string, CallGraphNode>(StringComparer.Ordinal);
        var edges = new HashSet<(string CallerId, string CalleeId)>();
        var references = MetadataReferenceProvider.CreateReferences();

        await ProcessFileRangeAsync(
            sourceFiles,
            references,
            nodes,
            edges,
            progress,
            cancellationToken,
            RoslynAnalysisOptions.FilesPerCompilation).ConfigureAwait(false);

        return CallGraphBuilder.Build(
            nodes.Values.ToList(),
            edges.Select(edge => new CallGraphEdge { CallerId = edge.CallerId, CalleeId = edge.CalleeId }).ToList());
    }

    private static async Task ProcessFileRangeAsync(
        IReadOnlyList<string> files,
        IReadOnlyList<MetadataReference> references,
        Dictionary<string, CallGraphNode> nodes,
        HashSet<(string CallerId, string CalleeId)> edges,
        AnalysisProgressTracker? progress,
        CancellationToken cancellationToken,
        int chunkSize)
    {
        if (files.Count == 0)
        {
            return;
        }

        if (files.Count == 1)
        {
            await ProcessSingleFileSafeAsync(files[0], references, nodes, edges, progress, cancellationToken).ConfigureAwait(false);
            return;
        }

        foreach (var chunk in files.Chunk(Math.Max(1, chunkSize)))
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                await ProcessCompilationChunkAsync(chunk, references, nodes, edges, progress, cancellationToken).ConfigureAwait(false);
            }
            catch (OutOfMemoryException)
            {
                var nextSize = Math.Max(1, chunkSize / 2);
                await ProcessFileRangeAsync(chunk, references, nodes, edges, progress, cancellationToken, nextSize).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception) when (chunk.Length > 1)
            {
                var nextSize = Math.Max(1, chunkSize / 2);
                await ProcessFileRangeAsync(chunk, references, nodes, edges, progress, cancellationToken, nextSize).ConfigureAwait(false);
            }
            catch (Exception)
            {
                foreach (var file in chunk)
                {
                    await ProcessSingleFileSafeAsync(file, references, nodes, edges, progress, cancellationToken).ConfigureAwait(false);
                }
            }
        }
    }

    private static async Task ProcessCompilationChunkAsync(
        IReadOnlyList<string> chunk,
        IReadOnlyList<MetadataReference> references,
        Dictionary<string, CallGraphNode> nodes,
        HashSet<(string CallerId, string CalleeId)> edges,
        AnalysisProgressTracker? progress,
        CancellationToken cancellationToken)
    {
        var parseOptions = VisualBasicParseOptions.Default;
        var syntaxTrees = new List<SyntaxTree>();

        foreach (var file in chunk)
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                var sourceText = await File.ReadAllTextAsync(file, cancellationToken).ConfigureAwait(false);
                syntaxTrees.Add(VisualBasicSyntaxTree.ParseText(sourceText, parseOptions, file, cancellationToken: cancellationToken));
                progress?.Report($"VB.NET: {Path.GetFileName(file)}");
            }
            catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
            {
                ReportParseSkipped(progress, file);
            }
        }

        if (syntaxTrees.Count == 0)
        {
            return;
        }

        cancellationToken.ThrowIfCancellationRequested();

        var compilation = VisualBasicCompilation.Create(
            assemblyName: $"CodeAnalyzerScratchVisualBasic_{Guid.NewGuid():N}",
            syntaxTrees: syntaxTrees,
            references: references,
            options: new VisualBasicCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

        progress?.Report("VB.NET: 의미 분석 준비 중...", stepDelta: 0);

        foreach (var syntaxTree in syntaxTrees)
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                var semanticModel = compilation.GetSemanticModel(syntaxTree);
                var root = await syntaxTree.GetRootAsync(cancellationToken).ConfigureAwait(false);
                AnalyzeSyntaxTree(semanticModel, root, syntaxTree.FilePath, nodes, edges, cancellationToken);
                progress?.Report($"VB.NET 의미 분석: {Path.GetFileName(syntaxTree.FilePath)}");
            }
            catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
            {
                progress?.Report($"VB.NET 의미 분석 건너뜀: {Path.GetFileName(syntaxTree.FilePath)}");
            }
        }
    }

    private static async Task ProcessSingleFileSafeAsync(
        string file,
        IReadOnlyList<MetadataReference> references,
        Dictionary<string, CallGraphNode> nodes,
        HashSet<(string CallerId, string CalleeId)> edges,
        AnalysisProgressTracker? progress,
        CancellationToken cancellationToken)
    {
        try
        {
            await ProcessCompilationChunkAsync([file], references, nodes, edges, progress, cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception)
        {
            ReportParseSkipped(progress, file);
        }
    }

    private static void AnalyzeSyntaxTree(
        SemanticModel semanticModel,
        SyntaxNode root,
        string? filePath,
        Dictionary<string, CallGraphNode> nodes,
        HashSet<(string CallerId, string CalleeId)> edges,
        CancellationToken cancellationToken)
    {
        foreach (var methodBlock in root.DescendantNodes().OfType<MethodBlockSyntax>())
        {
            cancellationToken.ThrowIfCancellationRequested();

            var methodSymbol = semanticModel.GetDeclaredSymbol(methodBlock, cancellationToken);
            if (methodSymbol is null || methodSymbol.IsImplicitlyDeclared)
            {
                continue;
            }

            var callerId = GetMethodId(methodSymbol);
            nodes.TryAdd(callerId, CreateNode(methodSymbol, filePath));

            foreach (var invocation in methodBlock.DescendantNodes().OfType<InvocationExpressionSyntax>())
            {
                cancellationToken.ThrowIfCancellationRequested();

                var symbolInfo = semanticModel.GetSymbolInfo(invocation, cancellationToken);
                if (symbolInfo.Symbol is not IMethodSymbol calleeSymbol)
                {
                    continue;
                }

                var calleeId = GetMethodId(calleeSymbol);
                nodes.TryAdd(calleeId, CreateNode(calleeSymbol, GetSourcePath(calleeSymbol, filePath ?? string.Empty)));
                edges.Add((callerId, calleeId));
            }
        }
    }

    private static void ReportParseSkipped(AnalysisProgressTracker? progress, string file)
    {
        progress?.Report($"VB.NET 건너뜀: {Path.GetFileName(file)}");
    }

    private static string GetMethodId(IMethodSymbol methodSymbol)
    {
        return "vbnet:" + methodSymbol.OriginalDefinition.ToDisplayString(SymbolDisplayFormat.FullyQualifiedFormat);
    }

    private static string GetSourcePath(IMethodSymbol methodSymbol, string fallbackPath)
    {
        return methodSymbol.Locations.FirstOrDefault(location => location.IsInSource)?.SourceTree?.FilePath ?? fallbackPath;
    }

    private static CallGraphNode CreateNode(IMethodSymbol methodSymbol, string? filePath)
    {
        var location = methodSymbol.Locations.FirstOrDefault(location => location.IsInSource);
        var resolvedPath = location?.SourceTree?.FilePath ?? filePath ?? string.Empty;
        var lineNumber = location?.GetLineSpan().StartLinePosition.Line + 1 ?? 0;

        return new CallGraphNode
        {
            Id = GetMethodId(methodSymbol),
            DisplayName = methodSymbol.Name,
            FullName = "[VB.NET] " + methodSymbol.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat),
            FilePath = resolvedPath,
            LineNumber = lineNumber
        };
    }
}
