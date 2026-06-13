using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public sealed class ProjectStructureAnalyzer
{
    private readonly CSharpStructureExtractor _csharpExtractor = new();
    private readonly PatternStructureExtractor _patternExtractor = new();

    public async Task<ProjectStructureResult> AnalyzeAsync(
        Dictionary<string, List<string>> filesByLanguage,
        HashSet<string> enabledLanguageIds,
        CallGraphResult callGraph,
        CancellationToken cancellationToken = default)
    {
        var types = new Dictionary<string, StructureTypeNode>(StringComparer.Ordinal);
        var relations = new List<StructureRelationEdge>();

        if (filesByLanguage.TryGetValue("csharp", out var csharpFiles) && csharpFiles.Count > 0)
        {
            var (csharpTypes, csharpRelations) = await _csharpExtractor.ExtractAsync(csharpFiles, cancellationToken).ConfigureAwait(false);
            MergeStructure(csharpTypes, csharpRelations, types, relations);
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

            var prefix = $"[{language.DisplayName}]";
            var (patternTypes, patternRelations) = _patternExtractor.Extract(language.Id, prefix, files, cancellationToken);
            MergeStructure(patternTypes, patternRelations, types, relations);
        }

        cancellationToken.ThrowIfCancellationRequested();
        AddCallDependencies(callGraph, types, relations, cancellationToken);

        var typeList = types.Values.OrderBy(type => type.FullName, StringComparer.OrdinalIgnoreCase).ToList();
        return new ProjectStructureResult
        {
            Types = typeList,
            Relations = relations,
            TypeMap = typeList.ToDictionary(type => type.Id, StringComparer.Ordinal)
        };
    }

    private static void MergeStructure(
        IEnumerable<StructureTypeNode> newTypes,
        IEnumerable<StructureRelationEdge> newRelations,
        Dictionary<string, StructureTypeNode> types,
        List<StructureRelationEdge> relations)
    {
        foreach (var type in newTypes)
        {
            if (types.TryGetValue(type.Id, out var existing))
            {
                types[type.Id] = StructureTypeNodeMerger.Merge(existing, type);
            }
            else
            {
                types[type.Id] = type;
            }
        }

        var existingEdges = new HashSet<(string From, string To, StructureRelationKind Kind)>(
            relations.Select(edge => (edge.FromId, edge.ToId, edge.Kind)));

        foreach (var relation in newRelations)
        {
            if (existingEdges.Add((relation.FromId, relation.ToId, relation.Kind)))
            {
                relations.Add(relation);
            }
        }
    }

    private static void AddCallDependencies(
        CallGraphResult callGraph,
        Dictionary<string, StructureTypeNode> types,
        List<StructureRelationEdge> relations,
        CancellationToken cancellationToken)
    {
        var methodToType = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var node in callGraph.Nodes)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var typeName = GuessTypeName(node);
            if (string.IsNullOrWhiteSpace(typeName))
            {
                continue;
            }

            var languageId = StructureTypeIdResolver.GetLanguageIdFromCallGraphNodeId(node.Id);
            var typeId = languageId is not null
                ? StructureTypeIdResolver.FindByDisplayName(types.Values, languageId, typeName)
                  ?? StructureTypeIdResolver.FindByDisplayNameAny(types.Values, typeName)
                : StructureTypeIdResolver.FindByDisplayNameAny(types.Values, typeName);

            if (typeId is null)
            {
                continue;
            }

            methodToType[node.Id] = typeId;
        }

        var existing = new HashSet<(string, string)>(
            relations.Where(r => r.Kind == StructureRelationKind.Dependency).Select(r => (r.FromId, r.ToId)));

        foreach (var edge in callGraph.Edges)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (!methodToType.TryGetValue(edge.CallerId, out var fromType))
            {
                continue;
            }

            if (!methodToType.TryGetValue(edge.CalleeId, out var toType) || fromType == toType)
            {
                continue;
            }

            if (existing.Add((fromType, toType)))
            {
                relations.Add(new StructureRelationEdge
                {
                    FromId = fromType,
                    ToId = toType,
                    Kind = StructureRelationKind.Dependency
                });
            }
        }
    }

    private static string? GuessTypeName(CallGraphNode node)
    {
        var fullName = node.FullName;

        // TreeSitter format: "[Lang] filename.ext::funcName" — function name ≠ class name; skip.
        if (fullName.Contains("::", StringComparison.Ordinal))
        {
            return null;
        }

        // Roslyn format: "[C#] Namespace.ClassName.MethodName(params)"
        var prefixEnd = fullName.IndexOf("] ", StringComparison.Ordinal);
        if (prefixEnd >= 0)
        {
            var afterPrefix = fullName[(prefixEnd + 2)..];
            var parenIdx = afterPrefix.IndexOf('(');
            var qualifiedName = parenIdx >= 0 ? afterPrefix[..parenIdx] : afterPrefix;
            var lastDot = qualifiedName.LastIndexOf('.');
            if (lastDot > 0)
            {
                var typePart = qualifiedName[..lastDot];
                var typeDot = typePart.LastIndexOf('.');
                return typeDot >= 0 ? typePart[(typeDot + 1)..] : typePart;
            }
            return qualifiedName;
        }

        var dot = node.DisplayName.Contains('.') ? node.DisplayName.Split('.').Reverse().Skip(1).FirstOrDefault() : null;
        return dot ?? node.DisplayName;
    }
}
