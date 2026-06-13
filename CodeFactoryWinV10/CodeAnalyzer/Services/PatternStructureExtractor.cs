using System.Text.RegularExpressions;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public sealed class PatternStructureExtractor
{
    private static readonly Regex CommentRegex = new("//.*$|/\\*.*?\\*/|#.*$", RegexOptions.Compiled | RegexOptions.Multiline);

    public (List<StructureTypeNode> Types, List<StructureRelationEdge> Relations) Extract(
        string languageId,
        string displayPrefix,
        IReadOnlyList<string> sourceFiles,
        CancellationToken cancellationToken = default)
    {
        var types = new Dictionary<string, StructureTypeNode>(StringComparer.Ordinal);
        var relations = new List<StructureRelationEdge>();

        foreach (var file in sourceFiles)
        {
            cancellationToken.ThrowIfCancellationRequested();

            string content;
            try
            {
                content = File.ReadAllText(file);
                cancellationToken.ThrowIfCancellationRequested();
            }
            catch (Exception)
            {
                continue;
            }

            content = CommentRegex.Replace(content, match => new string(' ', match.Length));
            ExtractFile(languageId, displayPrefix, file, content, types, relations, cancellationToken);
        }

        RelinkPlaceholderRelations(types, relations);

        return (types.Values.ToList(), relations);
    }

    private static void RelinkPlaceholderRelations(
        Dictionary<string, StructureTypeNode> types,
        List<StructureRelationEdge> relations)
    {
        for (var index = 0; index < relations.Count; index++)
        {
            var relation = relations[index];
            if (!StructureTypeIdResolver.IsShortPlaceholderId(relation.ToId, out var languageId, out var displayName))
            {
                continue;
            }

            var resolvedId = StructureTypeIdResolver.FindByDisplayName(types.Values, languageId, displayName);
            if (resolvedId is null || string.Equals(resolvedId, relation.ToId, StringComparison.Ordinal))
            {
                continue;
            }

            relations[index] = new StructureRelationEdge
            {
                FromId = relation.FromId,
                ToId = resolvedId,
                Kind = relation.Kind
            };
        }
    }

    private static void ExtractFile(
        string languageId,
        string displayPrefix,
        string filePath,
        string content,
        Dictionary<string, StructureTypeNode> types,
        List<StructureRelationEdge> relations,
        CancellationToken cancellationToken)
    {
        var patterns = GetPatterns(languageId);
        if (patterns.Count == 0)
        {
            return;
        }

        var lines = content.Split('\n');
        for (var lineIndex = 0; lineIndex < lines.Length; lineIndex++)
        {
            if (lineIndex % 64 == 0)
            {
                cancellationToken.ThrowIfCancellationRequested();
            }

            var line = lines[lineIndex];
            foreach (var pattern in patterns)
            {
                var match = pattern.Regex.Match(line);
                if (!match.Success)
                {
                    continue;
                }

                var typeName = match.Groups["name"].Value;
                if (string.IsNullOrWhiteSpace(typeName))
                {
                    continue;
                }

                var id = $"{languageId}-type:{filePath}::{typeName}";
                var (attributes, operations) = PatternStructureMemberExtractor.Extract(
                    languageId,
                    lines,
                    lineIndex,
                    typeName);
                var members = attributes.Concat(operations).Take(8).ToList();

                types.TryAdd(id, new StructureTypeNode
                {
                    Id = id,
                    DisplayName = typeName,
                    FullName = $"{displayPrefix} {Path.GetFileName(filePath)}::{typeName}",
                    FilePath = filePath,
                    LineNumber = lineIndex + 1,
                    Kind = pattern.Kind,
                    Members = members,
                    Attributes = attributes,
                    Operations = operations
                });

                foreach (var (baseName, relationKind) in pattern.ExtractBaseRelations(match))
                {
                    if (string.IsNullOrWhiteSpace(baseName))
                    {
                        continue;
                    }

                    var baseId = StructureTypeIdResolver.ResolveOrCreatePlaceholder(
                        languageId,
                        displayPrefix,
                        baseName,
                        pattern.BaseKind,
                        types);

                    relations.Add(new StructureRelationEdge
                    {
                        FromId = id,
                        ToId = baseId,
                        Kind = relationKind
                    });
                }
            }
        }
    }

    private static IReadOnlyList<TypePattern> GetPatterns(string languageId)
    {
        return languageId switch
        {
            "java" =>
            [
                new TypePattern(
                    new Regex(@"^\s*(?:public|private|protected|\s)*class\s+(?<name>[A-Za-z_]\w*)(?:\s+extends\s+(?<base>[A-Za-z_][\w.]*)|\s+implements\s+(?<iface>[A-Za-z_][\w.,\s]*))?", RegexOptions.Compiled),
                    StructureRelationKind.Inheritance,
                    "class",
                    "class")
            ],
            "kotlin" =>
            [
                new TypePattern(
                    new Regex(@"^\s*(?:open|abstract|data|\s)*class\s+(?<name>[A-Za-z_]\w*)(?:\s*\(\s*[^)]*\))?\s*(?::\s*(?<base>[A-Za-z_][\w.]*)|\s+where\s+)?", RegexOptions.Compiled),
                    StructureRelationKind.Inheritance,
                    "class",
                    "class")
            ],
            "python" =>
            [
                new TypePattern(
                    new Regex(@"^\s*class\s+(?<name>[A-Za-z_]\w*)\s*(?:\((?<base>[^)]*)\))?", RegexOptions.Compiled),
                    StructureRelationKind.Inheritance,
                    "class",
                    "class")
            ],
            "cpp" =>
            [
                new TypePattern(
                    new Regex(@"^\s*(?:class|struct)\s+(?<name>[A-Za-z_]\w*)(?:\s*:\s*(?:(?:public|protected|private|virtual)\s+)*(?<base>[A-Za-z_][\w:]*)|\s*\{|\s*;)?", RegexOptions.Compiled),
                    StructureRelationKind.Inheritance,
                    "class",
                    "class")
            ],
            "javascript" =>
            [
                new TypePattern(
                    new Regex(@"^\s*class\s+(?<name>[A-Za-z_$]\w*)(?:\s+extends\s+(?<base>[A-Za-z_$][\w.$]*))?", RegexOptions.Compiled),
                    StructureRelationKind.Inheritance,
                    "class",
                    "class")
            ],
            "csharp" => [],
            "vbnet" => [],
            _ => []
        };
    }

    private sealed class TypePattern(
        Regex regex,
        StructureRelationKind relationKind,
        string baseKind,
        string typeKind)
    {
        public string Kind { get; } = typeKind;
        public Regex Regex { get; } = regex;
        public StructureRelationKind RelationKind { get; } = relationKind;
        public string BaseKind { get; } = baseKind;

        public IEnumerable<(string Name, StructureRelationKind Kind)> ExtractBaseRelations(Match match)
        {
            if (match.Groups["base"].Success)
            {
                var raw = match.Groups["base"].Value;
                foreach (var part in raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                {
                    var name = part.Split(' ', StringSplitOptions.RemoveEmptyEntries).LastOrDefault() ?? part;
                    name = name.Trim().TrimEnd('{');
                    if (name is not ("object" or "Object"))
                    {
                        yield return (name, RelationKind);
                    }
                }
            }

            if (match.Groups["iface"].Success)
            {
                foreach (var part in match.Groups["iface"].Value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                {
                    yield return (part, StructureRelationKind.Implementation);
                }
            }
        }
    }
}
