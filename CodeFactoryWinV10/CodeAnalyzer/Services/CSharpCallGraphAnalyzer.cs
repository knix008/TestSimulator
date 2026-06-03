using CodeAnalyzer.Models;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace CodeAnalyzer.Services;

public sealed class CSharpCallGraphAnalyzer : ICallGraphAnalyzer
{
    public string LanguageId => "csharp";

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

        // Try to compile all files together for best cross-file call resolution.
        // OOM handler in ProcessFileRangeAsync will split into smaller chunks automatically.
        await ProcessFileRangeAsync(
            sourceFiles,
            references,
            nodes,
            edges,
            progress,
            cancellationToken,
            sourceFiles.Count).ConfigureAwait(false);

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
        var parseOptions = new CSharpParseOptions(LanguageVersion.Latest);
        var syntaxTrees = new List<SyntaxTree>();

        foreach (var file in chunk)
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                var sourceText = await File.ReadAllTextAsync(file, cancellationToken).ConfigureAwait(false);
                syntaxTrees.Add(CSharpSyntaxTree.ParseText(sourceText, parseOptions, file, cancellationToken: cancellationToken));
                progress?.Report($"C#: {Path.GetFileName(file)}");
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

        var compilation = CSharpCompilation.Create(
            assemblyName: $"CodeAnalyzerScratchCSharp_{Guid.NewGuid():N}",
            syntaxTrees: syntaxTrees,
            references: references,
            options: new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

        progress?.Report("C#: 의미 분석 준비 중...", stepDelta: 0);

        foreach (var syntaxTree in syntaxTrees)
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                var semanticModel = compilation.GetSemanticModel(syntaxTree);
                var root = await syntaxTree.GetRootAsync(cancellationToken).ConfigureAwait(false);
                AnalyzeSyntaxTree(compilation, semanticModel, root, syntaxTree.FilePath, nodes, edges, cancellationToken);
                progress?.Report($"C# 의미 분석: {Path.GetFileName(syntaxTree.FilePath)}");
            }
            catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
            {
                progress?.Report($"C# 의미 분석 건너뜀: {Path.GetFileName(syntaxTree.FilePath)}");
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
        Compilation compilation,
        SemanticModel semanticModel,
        SyntaxNode root,
        string? filePath,
        Dictionary<string, CallGraphNode> nodes,
        HashSet<(string CallerId, string CalleeId)> edges,
        CancellationToken cancellationToken)
    {
        var scopes = new List<(SyntaxNode Syntax, IMethodSymbol Symbol)>();

        foreach (var method in root.DescendantNodes().OfType<BaseMethodDeclarationSyntax>())
        {
            cancellationToken.ThrowIfCancellationRequested();
            var symbol = semanticModel.GetDeclaredSymbol(method, cancellationToken);
            if (symbol is null || symbol.IsImplicitlyDeclared)
            {
                continue;
            }
            scopes.Add((method, symbol));
            nodes.TryAdd(GetMethodId(symbol), CreateNode(symbol, filePath));
        }

        foreach (var localFunc in root.DescendantNodes().OfType<LocalFunctionStatementSyntax>())
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (semanticModel.GetDeclaredSymbol(localFunc, cancellationToken) is not IMethodSymbol symbol)
            {
                continue;
            }
            scopes.Add((localFunc, symbol));
            nodes.TryAdd(GetMethodId(symbol), CreateNode(symbol, filePath));
        }

        foreach (var (scopeSyntax, callerSymbol) in scopes)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var callerId = GetMethodId(callerSymbol);

            foreach (var invocation in GetDirectInvocations(scopeSyntax, cancellationToken))
            {
                cancellationToken.ThrowIfCancellationRequested();

                var calleeSymbol = ResolveInvocation(compilation, semanticModel, invocation, cancellationToken);
                if (calleeSymbol is null || !calleeSymbol.Locations.Any(loc => loc.IsInSource))
                {
                    continue;
                }

                var calleeId = GetMethodId(calleeSymbol);
                nodes.TryAdd(calleeId, CreateNode(calleeSymbol, GetSourcePath(calleeSymbol, filePath)));
                edges.Add((callerId, calleeId));
            }

            foreach (var creation in GetObjectCreations(scopeSyntax, cancellationToken))
            {
                cancellationToken.ThrowIfCancellationRequested();

                var symbolInfo = semanticModel.GetSymbolInfo(creation, cancellationToken);
                if (symbolInfo.Symbol is not IMethodSymbol calleeSymbol
                    || !calleeSymbol.Locations.Any(loc => loc.IsInSource))
                {
                    continue;
                }

                var calleeId = GetMethodId(calleeSymbol);
                nodes.TryAdd(calleeId, CreateNode(calleeSymbol, GetSourcePath(calleeSymbol, filePath)));
                edges.Add((callerId, calleeId));
            }
        }
    }

    private static IEnumerable<InvocationExpressionSyntax> GetDirectInvocations(SyntaxNode scope, CancellationToken cancellationToken)
    {
        foreach (var child in scope.ChildNodes())
        {
            foreach (var invocation in GetDirectInvocationsCore(child, cancellationToken))
            {
                yield return invocation;
            }
        }
    }

    private static IEnumerable<BaseObjectCreationExpressionSyntax> GetObjectCreations(SyntaxNode scope, CancellationToken cancellationToken)
    {
        foreach (var child in scope.ChildNodes())
        {
            foreach (var creation in GetObjectCreationsCore(child, cancellationToken))
            {
                yield return creation;
            }
        }
    }

    private static IEnumerable<BaseObjectCreationExpressionSyntax> GetObjectCreationsCore(SyntaxNode node, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (node is BaseObjectCreationExpressionSyntax creation)
        {
            yield return creation;
        }

        if (node is LocalFunctionStatementSyntax or AnonymousFunctionExpressionSyntax)
        {
            yield break;
        }

        foreach (var child in node.ChildNodes())
        {
            foreach (var c in GetObjectCreationsCore(child, cancellationToken))
            {
                yield return c;
            }
        }
    }

    private static IEnumerable<InvocationExpressionSyntax> GetDirectInvocationsCore(SyntaxNode node, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (node is InvocationExpressionSyntax invocation)
        {
            yield return invocation;
        }

        // Stop at nested scope boundaries — local functions and lambdas are their own scopes
        if (node is LocalFunctionStatementSyntax or AnonymousFunctionExpressionSyntax)
        {
            yield break;
        }

        foreach (var child in node.ChildNodes())
        {
            foreach (var inv in GetDirectInvocationsCore(child, cancellationToken))
            {
                yield return inv;
            }
        }
    }

    private static void ReportParseSkipped(AnalysisProgressTracker? progress, string file)
    {
        progress?.Report($"C# 건너뜀: {Path.GetFileName(file)}");
    }

    private static IMethodSymbol? ResolveInvocation(
        Compilation compilation,
        SemanticModel semanticModel,
        InvocationExpressionSyntax invocation,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

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

        var candidates = new List<IMethodSymbol>();
        foreach (var symbol in compilation.GetSymbolsWithName(methodName, SymbolFilter.Member))
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (symbol is not IMethodSymbol method
                || method.MethodKind != MethodKind.Ordinary
                || !method.Locations.Any(location => location.IsInSource))
            {
                continue;
            }

            candidates.Add(method);
            if (candidates.Count > 32)
            {
                // Enough candidates means ambiguous resolution; stop scanning early.
                break;
            }
        }

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

    private static string GetSourcePath(IMethodSymbol methodSymbol, string? fallbackPath)
    {
        return methodSymbol.Locations.FirstOrDefault(location => location.IsInSource)?.SourceTree?.FilePath ?? fallbackPath ?? string.Empty;
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
