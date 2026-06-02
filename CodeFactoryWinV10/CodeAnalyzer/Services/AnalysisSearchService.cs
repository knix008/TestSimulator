using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public static class AnalysisSearchService
{
    private const int MaxResults = 50;

    public static IReadOnlyList<SearchResultItem> Search(AnalysisResult? analysis, string query)
    {
        if (analysis is null || string.IsNullOrWhiteSpace(query))
        {
            return [];
        }

        var results = new List<SearchResultItem>();

        foreach (var node in CallGraphNodeSearch.FindNodes(analysis.CallGraph, query))
        {
            results.Add(new SearchResultItem
            {
                Kind = SearchResultKind.Function,
                Id = node.Id,
                Title = node.FullName,
                Detail = $"{Path.GetFileName(node.FilePath)}:{node.LineNumber}"
            });

            if (results.Count >= MaxResults)
            {
                return results;
            }
        }

        foreach (var type in analysis.Structure.Types)
        {
            if (!MatchesType(type, query))
            {
                continue;
            }

            results.Add(new SearchResultItem
            {
                Kind = SearchResultKind.Type,
                Id = type.Id,
                Title = type.FullName,
                Detail = $"{type.Kind} · {Path.GetFileName(type.FilePath)}:{type.LineNumber}"
            });

            if (results.Count >= MaxResults)
            {
                return results;
            }
        }

        foreach (var file in analysis.FileRelations.Files)
        {
            if (!MatchesFile(file, query))
            {
                continue;
            }

            results.Add(new SearchResultItem
            {
                Kind = SearchResultKind.File,
                Id = file.Id,
                Title = file.FullName,
                Detail = $"{file.FunctionCount}개 함수"
            });

            if (results.Count >= MaxResults)
            {
                return results;
            }
        }

        foreach (var directory in analysis.DirectoryRelations.Directories)
        {
            if (!MatchesDirectory(directory, query))
            {
                continue;
            }

            results.Add(new SearchResultItem
            {
                Kind = SearchResultKind.Directory,
                Id = directory.Id,
                Title = directory.FullName,
                Detail = $"{directory.FileCount}개 파일 · {directory.FunctionCount}개 함수"
            });

            if (results.Count >= MaxResults)
            {
                break;
            }
        }

        return results;
    }

    private static bool MatchesDirectory(DirectoryRelationNode directory, string query) =>
        directory.FullName.Contains(query, StringComparison.OrdinalIgnoreCase)
        || directory.DisplayName.Contains(query, StringComparison.OrdinalIgnoreCase);

    private static bool MatchesFile(FileRelationNode file, string query) =>
        file.FullName.Contains(query, StringComparison.OrdinalIgnoreCase)
        || file.DisplayName.Contains(query, StringComparison.OrdinalIgnoreCase);

    private static bool MatchesType(StructureTypeNode type, string query)
    {
        return type.FullName.Contains(query, StringComparison.OrdinalIgnoreCase)
            || type.DisplayName.Contains(query, StringComparison.OrdinalIgnoreCase)
            || type.Members.Any(member => member.Contains(query, StringComparison.OrdinalIgnoreCase))
            || Path.GetFileName(type.FilePath).Contains(query, StringComparison.OrdinalIgnoreCase);
    }
}
