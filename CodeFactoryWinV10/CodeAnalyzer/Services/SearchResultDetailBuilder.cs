using System.Text;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public static class SearchResultDetailBuilder
{
    public static string BuildStatusSummary(AnalysisResult? analysis, SearchResultItem item)
    {
        var lines = BuildDetailLines(analysis, item);
        return lines.Count > 0
            ? $"선택: [{item.KindLabel}] {item.Title} · {lines[0]}"
            : $"선택: [{item.KindLabel}] {item.Title}";
    }

    public static string BuildDetailText(AnalysisResult? analysis, SearchResultItem item)
    {
        var lines = BuildDetailLines(analysis, item);
        if (lines.Count == 0)
        {
            return $"{item.Title}{Environment.NewLine}{item.Detail}";
        }

        var builder = new StringBuilder();
        builder.AppendLine($"[{item.KindLabel}] {item.Title}");
        builder.AppendLine(new string('─', 48));
        foreach (var line in lines)
        {
            builder.AppendLine(line);
        }

        return builder.ToString().TrimEnd();
    }

    private static List<string> BuildDetailLines(AnalysisResult? analysis, SearchResultItem item)
    {
        if (analysis is null)
        {
            return [item.Detail];
        }

        return item.Kind switch
        {
            SearchResultKind.Function => BuildFunctionLines(analysis, item),
            SearchResultKind.Type => BuildTypeLines(analysis, item),
            SearchResultKind.File => BuildFileLines(analysis, item),
            SearchResultKind.Directory => BuildDirectoryLines(analysis, item),
            _ => [item.Detail]
        };
    }

    private static List<string> BuildFunctionLines(AnalysisResult analysis, SearchResultItem item)
    {
        var lines = new List<string>();

        if (analysis.CallGraph.NodeMap.TryGetValue(item.Id, out var node))
        {
            lines.Add($"파일: {node.FilePath}");
            lines.Add($"위치: {node.LineNumber}줄");
            lines.Add($"표시 이름: {node.DisplayName}");

            var fanIn = analysis.CallGraph.Incoming.TryGetValue(node.Id, out var incoming) ? incoming.Count : 0;
            var fanOut = analysis.CallGraph.Outgoing.TryGetValue(node.Id, out var outgoing) ? outgoing.Count : 0;
            lines.Add($"호출 관계: Fan-In {fanIn} · Fan-Out {fanOut}");
        }
        else
        {
            lines.Add(item.Detail);
        }

        if (analysis.Metrics.FunctionMap.TryGetValue(item.Id, out var metric))
        {
            lines.Add(
                $"복잡도: CC {metric.CyclomaticComplexity} · 인지 {metric.CognitiveComplexity} · " +
                $"중첩 {metric.MaxNestingDepth} · 매개 {metric.ParameterCount}");
            lines.Add(
                $"메트릭: {metric.LineCount}줄 · MI {metric.MaintenanceIndex:F0} · " +
                $"매직 {metric.MagicNumberCount} · 정밀 {FormatPrecision(metric.Precision)}");
        }

        return lines;
    }

    private static List<string> BuildTypeLines(AnalysisResult analysis, SearchResultItem item)
    {
        var lines = new List<string>();

        if (!analysis.Structure.TypeMap.TryGetValue(item.Id, out var type))
        {
            lines.Add(item.Detail);
            return lines;
        }

        lines.Add($"종류: {type.Kind}{(type.IsAbstract ? " · abstract" : "")}");
        lines.Add($"파일: {type.FilePath}:{type.LineNumber}");

        if (type.Members.Count > 0)
        {
            lines.Add($"멤버 {type.Members.Count}개: {SummarizeList(type.Members, 3)}");
        }

        if (type.Attributes.Count > 0)
        {
            lines.Add($"필드 {type.Attributes.Count}개: {SummarizeList(type.Attributes, 3)}");
        }

        if (type.Operations.Count > 0)
        {
            lines.Add($"메서드 {type.Operations.Count}개: {SummarizeList(type.Operations, 3)}");
        }

        var incoming = analysis.Structure.Relations
            .Where(relation => relation.ToId == type.Id)
            .ToList();
        var outgoing = analysis.Structure.Relations
            .Where(relation => relation.FromId == type.Id)
            .ToList();

        if (incoming.Count > 0)
        {
            lines.Add(
                $"들어오는 관계 {incoming.Count}개: {SummarizeRelations(analysis, incoming, incoming: true, 2)}");
        }

        if (outgoing.Count > 0)
        {
            lines.Add(
                $"나가는 관계 {outgoing.Count}개: {SummarizeRelations(analysis, outgoing, incoming: false, 2)}");
        }

        return lines;
    }

    private static List<string> BuildFileLines(AnalysisResult analysis, SearchResultItem item)
    {
        var lines = new List<string>();

        if (!analysis.FileRelations.FileMap.TryGetValue(item.Id, out var file))
        {
            lines.Add(item.Detail);
            return lines;
        }

        lines.Add($"경로: {file.FilePath}");
        lines.Add($"함수 {file.FunctionCount}개");

        var outgoing = analysis.FileRelations.Outgoing.TryGetValue(file.Id, out var targets) ? targets.Count : 0;
        var incoming = analysis.FileRelations.Edges.Count(edge => edge.ToFileId == file.Id);
        lines.Add($"파일 호출: 나감 {outgoing} · 들어옴 {incoming}");

        var aggregate = analysis.Metrics.FileAggregates
            .FirstOrDefault(entry => string.Equals(entry.FilePath, file.FilePath, StringComparison.OrdinalIgnoreCase));
        if (aggregate is not null)
        {
            lines.Add(
                $"코드 {aggregate.CodeLines}줄 · CC↑ {aggregate.MaxCyclomaticComplexity} · " +
                $"인지↑ {aggregate.MaxCognitiveComplexity} · MI↓ {aggregate.MinMaintenanceIndex:F0}");
            lines.Add(
                $"TODO {aggregate.TodoMarkerCount}개 ({aggregate.TodoDensityPer100Lines:F1}/100줄) · " +
                $"경고 함수 {aggregate.WarningFunctionCount}개");
        }
        else if (analysis.Metrics.FileMap.TryGetValue(file.FilePath, out var fileMetric))
        {
            lines.Add(
                $"코드 {fileMetric.CodeLines}줄 · TODO {fileMetric.TodoMarkerCount}개 " +
                $"({fileMetric.TodoDensityPer100Lines:F1}/100줄)");
        }

        return lines;
    }

    private static List<string> BuildDirectoryLines(AnalysisResult analysis, SearchResultItem item)
    {
        var lines = new List<string>();

        if (!analysis.DirectoryRelations.DirectoryMap.TryGetValue(item.Id, out var directory))
        {
            lines.Add(item.Detail);
            return lines;
        }

        lines.Add($"경로: {directory.DirectoryPath}");
        lines.Add($"파일 {directory.FileCount}개 · 함수 {directory.FunctionCount}개");

        var outgoing = analysis.DirectoryRelations.Outgoing.TryGetValue(directory.Id, out var targets) ? targets.Count : 0;
        var incoming = analysis.DirectoryRelations.Edges.Count(edge => edge.ToDirectoryId == directory.Id);
        lines.Add($"디렉터리 호출: 나감 {outgoing} · 들어옴 {incoming}");

        var topEdges = analysis.DirectoryRelations.Edges
            .Where(edge => edge.FromDirectoryId == directory.Id || edge.ToDirectoryId == directory.Id)
            .OrderByDescending(edge => edge.CallCount)
            .Take(2)
            .Select(edge =>
            {
                var from = ResolveDirectoryName(analysis, edge.FromDirectoryId);
                var to = ResolveDirectoryName(analysis, edge.ToDirectoryId);
                return $"{from} → {to} ({edge.CallCount}회)";
            })
            .ToList();

        if (topEdges.Count > 0)
        {
            lines.Add($"주요 연관: {string.Join(" · ", topEdges)}");
        }

        return lines;
    }

    private static string SummarizeRelations(
        AnalysisResult analysis,
        IReadOnlyList<StructureRelationEdge> relations,
        bool incoming,
        int maxItems)
    {
        var labels = relations
            .Take(maxItems)
            .Select(relation =>
            {
                var otherId = incoming ? relation.FromId : relation.ToId;
                if (analysis.Structure.TypeMap.TryGetValue(otherId, out var other))
                {
                    return $"{FormatRelationKind(relation.Kind)} {other.DisplayName}";
                }

                return FormatRelationKind(relation.Kind);
            })
            .ToList();

        if (relations.Count > maxItems)
        {
            labels.Add($"외 {relations.Count - maxItems}개");
        }

        return string.Join(" · ", labels);
    }

    private static string ResolveDirectoryName(AnalysisResult analysis, string directoryId)
    {
        if (analysis.DirectoryRelations.DirectoryMap.TryGetValue(directoryId, out var directory))
        {
            return directory.DisplayName;
        }

        return directoryId;
    }

    private static string SummarizeList(IReadOnlyList<string> items, int maxItems)
    {
        if (items.Count <= maxItems)
        {
            return string.Join(", ", items);
        }

        return string.Join(", ", items.Take(maxItems)) + $" 외 {items.Count - maxItems}개";
    }

    private static string FormatRelationKind(StructureRelationKind kind) => kind switch
    {
        StructureRelationKind.Inheritance => "상속",
        StructureRelationKind.Implementation => "구현",
        _ => "의존"
    };

    private static string FormatPrecision(MetricsPrecision precision) => precision switch
    {
        MetricsPrecision.Semantic => "의미",
        MetricsPrecision.Syntax => "구문",
        _ => "근사"
    };
}
