using CodeAnalyzer.Models;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace CodeAnalyzer.Services;

public sealed class CSharpCallGraphAnalyzer
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

        var parseOptions = new CSharpParseOptions(LanguageVersion.Latest);
        var syntaxTrees = new List<SyntaxTree>();

        foreach (var file in sourceFiles)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var sourceText = await File.ReadAllTextAsync(file, cancellationToken).ConfigureAwait(false);
            syntaxTrees.Add(CSharpSyntaxTree.ParseText(sourceText, parseOptions, file, cancellationToken: cancellationToken));
            progress?.Report($"C#: {Path.GetFileName(file)}");
        }

        var compilation = CSharpCompilation.Create(
            assemblyName: "CodeAnalyzerScratchCSharp",
            syntaxTrees: syntaxTrees,
            references: MetadataReferenceProvider.CreateReferences(),
            options: new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

        var nodes = new Dictionary<string, CallGraphNode>(StringComparer.Ordinal);
        var edges = new HashSet<(string CallerId, string CalleeId)>();

        foreach (var syntaxTree in syntaxTrees)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var semanticModel = compilation.GetSemanticModel(syntaxTree);
            var root = await syntaxTree.GetRootAsync(cancellationToken).ConfigureAwait(false);

            foreach (var methodDeclaration in root.DescendantNodes().OfType<BaseMethodDeclarationSyntax>())
            {
                var methodSymbol = semanticModel.GetDeclaredSymbol(methodDeclaration, cancellationToken);
                if (methodSymbol is null || methodSymbol.IsImplicitlyDeclared)
                {
                    continue;
                }

                var callerId = GetMethodId(methodSymbol);
                nodes.TryAdd(callerId, CreateNode(methodSymbol, syntaxTree.FilePath));

                foreach (var invocation in methodDeclaration.DescendantNodes().OfType<InvocationExpressionSyntax>())
                {
                    var calleeSymbol = ResolveInvocation(compilation, semanticModel, invocation, cancellationToken);
                    if (calleeSymbol is null)
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

    private static IMethodSymbol? ResolveInvocation(
        Compilation compilation,
        SemanticModel semanticModel,
        InvocationExpressionSyntax invocation,
        CancellationToken cancellationToken)
    {
        var symbolInfo = semanticModel.GetSymbolInfo(invocation, cancellationToken);
        var resolved = ResolveInvokedMethod(symbolInfo.Symbol);
        if (resolved is not null)
        {
            return resolved;
        }

        string? methodName = invocation.Expression switch
        {
            MemberAccessExpressionSyntax memberAccess => memberAccess.Name.Identifier.Text,
            IdentifierNameSyntax identifierName => identifierName.Identifier.Text,
            _ => null
        };

        if (string.IsNullOrWhiteSpace(methodName))
        {
            return null;
        }

        var candidates = compilation.GetSymbolsWithName(methodName, SymbolFilter.Member)
            .OfType<IMethodSymbol>()
            .Where(method => method.MethodKind == MethodKind.Ordinary && method.Locations.Any(location => location.IsInSource))
            .ToList();

        if (candidates.Count == 1)
        {
            return candidates[0];
        }

        if (invocation.Expression is MemberAccessExpressionSyntax memberAccessExpression)
        {
            var receiverType = semanticModel.GetTypeInfo(memberAccessExpression.Expression, cancellationToken).Type;
            if (receiverType is not null)
            {
                var member = receiverType.GetMembers(methodName).OfType<IMethodSymbol>().ToList();
                if (member.Count == 1)
                {
                    return member[0];
                }
            }
        }

        return null;
    }

    private static IMethodSymbol? ResolveInvokedMethod(ISymbol? symbol)
    {
        return symbol switch
        {
            IMethodSymbol method => method.ReducedFrom ?? method,
            IPropertySymbol { GetMethod: not null } property => property.GetMethod,
            _ => null
        };
    }

    private static string GetMethodId(IMethodSymbol methodSymbol)
    {
        return "csharp:" + methodSymbol.OriginalDefinition.ToDisplayString(SymbolDisplayFormat.FullyQualifiedFormat);
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
            FullName = "[C#] " + methodSymbol.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat),
            FilePath = resolvedPath,
            LineNumber = lineNumber
        };
    }
}
