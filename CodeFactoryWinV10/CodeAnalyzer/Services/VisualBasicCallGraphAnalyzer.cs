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

        var parseOptions = VisualBasicParseOptions.Default;
        var syntaxTrees = new List<SyntaxTree>();

        foreach (var file in sourceFiles)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var sourceText = await File.ReadAllTextAsync(file, cancellationToken).ConfigureAwait(false);
            syntaxTrees.Add(VisualBasicSyntaxTree.ParseText(sourceText, parseOptions, file, cancellationToken: cancellationToken));
            progress?.Report($"VB.NET: {Path.GetFileName(file)}");
        }

        var compilation = VisualBasicCompilation.Create(
            assemblyName: "CodeAnalyzerScratchVisualBasic",
            syntaxTrees: syntaxTrees,
            references: MetadataReferenceProvider.CreateReferences(),
            options: new VisualBasicCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

        var nodes = new Dictionary<string, CallGraphNode>(StringComparer.Ordinal);
        var edges = new HashSet<(string CallerId, string CalleeId)>();

        foreach (var syntaxTree in syntaxTrees)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var semanticModel = compilation.GetSemanticModel(syntaxTree);
            var root = await syntaxTree.GetRootAsync(cancellationToken).ConfigureAwait(false);

            foreach (var methodBlock in root.DescendantNodes().OfType<MethodBlockSyntax>())
            {
                var methodSymbol = semanticModel.GetDeclaredSymbol(methodBlock, cancellationToken);
                if (methodSymbol is null || methodSymbol.IsImplicitlyDeclared)
                {
                    continue;
                }

                var callerId = GetMethodId(methodSymbol);
                nodes.TryAdd(callerId, CreateNode(methodSymbol, syntaxTree.FilePath));

                foreach (var invocation in methodBlock.DescendantNodes().OfType<InvocationExpressionSyntax>())
                {
                    var symbolInfo = semanticModel.GetSymbolInfo(invocation, cancellationToken);
                    if (symbolInfo.Symbol is not IMethodSymbol calleeSymbol)
                    {
                        continue;
                    }

                    var calleeId = GetMethodId(calleeSymbol);
                    nodes.TryAdd(calleeId, CreateNode(calleeSymbol, GetSourcePath(calleeSymbol, syntaxTree.FilePath)));
                    edges.Add((callerId, calleeId));
                }
            }
        }

        return CallGraphBuilder.Build(
            nodes.Values.ToList(),
            edges.Select(edge => new CallGraphEdge { CallerId = edge.CallerId, CalleeId = edge.CalleeId }).ToList());
    }

    private static string GetMethodId(IMethodSymbol methodSymbol)
    {
        return "vbnet:" + methodSymbol.ToDisplayString(SymbolDisplayFormat.FullyQualifiedFormat);
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
