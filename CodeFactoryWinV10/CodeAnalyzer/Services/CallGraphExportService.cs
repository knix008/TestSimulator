using System.Text.Json;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public static class CallGraphExportService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public static void SaveToFile(CallGraphResult result, string rootDirectory, string filePath)
    {
        var document = new CallGraphDocument
        {
            RootDirectory = rootDirectory,
            SavedAtUtc = DateTime.UtcNow,
            Nodes = result.Nodes
                .Select(node => new CallGraphNodeRecord
                {
                    Id = node.Id,
                    DisplayName = node.DisplayName,
                    FullName = node.FullName,
                    FilePath = node.FilePath,
                    LineNumber = node.LineNumber
                })
                .ToList(),
            Edges = result.Edges
                .Select(edge => new CallGraphEdgeRecord
                {
                    CallerId = edge.CallerId,
                    CalleeId = edge.CalleeId
                })
                .ToList()
        };

        var json = JsonSerializer.Serialize(document, JsonOptions);
        File.WriteAllText(filePath, json);
    }

    private sealed class CallGraphDocument
    {
        public string Version { get; set; } = "1";
        public string RootDirectory { get; set; } = string.Empty;
        public DateTime SavedAtUtc { get; set; }
        public List<CallGraphNodeRecord> Nodes { get; set; } = [];
        public List<CallGraphEdgeRecord> Edges { get; set; } = [];
    }

    private sealed class CallGraphNodeRecord
    {
        public string Id { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string FilePath { get; set; } = string.Empty;
        public int LineNumber { get; set; }
    }

    private sealed class CallGraphEdgeRecord
    {
        public string CallerId { get; set; } = string.Empty;
        public string CalleeId { get; set; } = string.Empty;
    }
}
