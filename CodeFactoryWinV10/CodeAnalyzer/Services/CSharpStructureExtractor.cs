using CodeAnalyzer.Models;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace CodeAnalyzer.Services;

public sealed class CSharpStructureExtractor
{
    public async Task<(List<StructureTypeNode> Types, List<StructureRelationEdge> Relations)> ExtractAsync(
        IReadOnlyList<string> sourceFiles,
        CancellationToken cancellationToken = default)
    {
        var types = new Dictionary<string, StructureTypeNode>(StringComparer.Ordinal);
        var relations = new List<StructureRelationEdge>();
        var references = MetadataReferenceProvider.CreateReferences();

        await ExtractInChunksAsync(sourceFiles, references, types, relations, sourceFiles.Count, cancellationToken).ConfigureAwait(false);

        return (types.Values.ToList(), relations);
    }

    private static async Task ExtractInChunksAsync(
        IReadOnlyList<string> files,
        IReadOnlyList<MetadataReference> references,
        Dictionary<string, StructureTypeNode> types,
        List<StructureRelationEdge> relations,
        int chunkSize,
        CancellationToken cancellationToken)
    {
        if (files.Count == 0)
        {
            return;
        }

        foreach (var chunk in files.Chunk(Math.Max(1, chunkSize)))
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                await ExtractChunkAsync(chunk, references, types, relations, cancellationToken).ConfigureAwait(false);
            }
            catch (OutOfMemoryException) when (chunk.Length > 1)
            {
                await ExtractInChunksAsync(chunk, references, types, relations, Math.Max(1, chunkSize / 2), cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception) when (chunk.Length > 1)
            {
                await ExtractInChunksAsync(chunk, references, types, relations, Math.Max(1, chunkSize / 2), cancellationToken).ConfigureAwait(false);
            }
            catch (Exception)
            {
                // single-file chunk failed — skip it
            }
        }
    }

    private static async Task ExtractChunkAsync(
        IReadOnlyList<string> chunk,
        IReadOnlyList<MetadataReference> references,
        Dictionary<string, StructureTypeNode> types,
        List<StructureRelationEdge> relations,
        CancellationToken cancellationToken)
    {
        var syntaxTrees = new List<SyntaxTree>();
        foreach (var file in chunk)
        {
            try
            {
                var text = await File.ReadAllTextAsync(file, cancellationToken).ConfigureAwait(false);
                syntaxTrees.Add(CSharpSyntaxTree.ParseText(text, path: file, cancellationToken: cancellationToken));
            }
            catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
            {
                // skip file
            }
        }

        if (syntaxTrees.Count == 0)
        {
            return;
        }

        var compilation = CSharpCompilation.Create(
            $"StructureCSharp_{Guid.NewGuid():N}",
            syntaxTrees,
            references,
            new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

        foreach (var tree in syntaxTrees)
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                var model = compilation.GetSemanticModel(tree);
                var root = await tree.GetRootAsync(cancellationToken).ConfigureAwait(false);
                ExtractFromRoot(root, model, tree.FilePath ?? string.Empty, types, relations, cancellationToken);
            }
            catch (Exception ex) when (!AnalysisCancellation.IsCancellation(ex))
            {
                // skip tree
            }
        }
    }

    private static void ExtractFromRoot(
        SyntaxNode root,
        SemanticModel model,
        string filePath,
        Dictionary<string, StructureTypeNode> types,
        List<StructureRelationEdge> relations,
        CancellationToken cancellationToken)
    {
        foreach (var typeDecl in root.DescendantNodes().OfType<TypeDeclarationSyntax>())
        {
            cancellationToken.ThrowIfCancellationRequested();

            var symbol = model.GetDeclaredSymbol(typeDecl, cancellationToken) as INamedTypeSymbol;
            if (symbol is null || symbol.IsImplicitlyDeclared)
            {
                continue;
            }

            var id = GetTypeId(symbol);
            var (attributes, operations) = UmlMemberExtractor.FromSymbol(symbol);
            var members = attributes.Concat(operations).Take(8).ToList();

            types.TryAdd(id, new StructureTypeNode
            {
                Id = id,
                DisplayName = symbol.Name,
                FullName = "[C#] " + symbol.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat),
                FilePath = filePath,
                LineNumber = typeDecl.GetLocation().GetLineSpan().StartLinePosition.Line + 1,
                Kind = symbol.TypeKind switch
                {
                    TypeKind.Interface => "interface",
                    TypeKind.Struct => "struct",
                    TypeKind.Enum => "enum",
                    _ => "class"
                },
                Members = members,
                Attributes = attributes,
                Operations = operations,
                IsAbstract = symbol.IsAbstract
            });

            if (symbol.BaseType is not null && symbol.BaseType.SpecialType != SpecialType.System_Object)
            {
                var baseId = GetTypeId(symbol.BaseType);
                EnsurePlaceholderType(symbol.BaseType, types);
                relations.Add(new StructureRelationEdge
                {
                    FromId = id,
                    ToId = baseId,
                    Kind = symbol.TypeKind == TypeKind.Interface ? StructureRelationKind.Implementation : StructureRelationKind.Inheritance
                });
            }

            foreach (var iface in symbol.Interfaces)
            {
                var ifaceId = GetTypeId(iface);
                EnsurePlaceholderType(iface, types);
                relations.Add(new StructureRelationEdge
                {
                    FromId = id,
                    ToId = ifaceId,
                    Kind = StructureRelationKind.Implementation
                });
            }
        }
    }

    private static void EnsurePlaceholderType(INamedTypeSymbol symbol, Dictionary<string, StructureTypeNode> types)
    {
        var id = GetTypeId(symbol);
        types.TryAdd(id, new StructureTypeNode
        {
            Id = id,
            DisplayName = symbol.Name,
            FullName = "[C#] " + symbol.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat),
            FilePath = symbol.Locations.FirstOrDefault(l => l.IsInSource)?.SourceTree?.FilePath ?? string.Empty,
            LineNumber = 0,
            Kind = symbol.TypeKind switch
            {
                TypeKind.Interface => "interface",
                TypeKind.Struct => "struct",
                _ => "class"
            }
        });
    }

    private static string GetTypeId(INamedTypeSymbol symbol)
    {
        return "csharp-type:" + symbol.ToDisplayString(SymbolDisplayFormat.FullyQualifiedFormat);
    }
}
