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

    public static void SaveToFile(AnalysisResult analysis, string rootDirectory, string filePath)
    {
        var document = new AnalysisDocument
        {
            RootDirectory = rootDirectory,
            SavedAtUtc = DateTime.UtcNow,
            CallGraph = new CallGraphSection
            {
                Nodes = analysis.CallGraph.Nodes
                    .Select(n => new CallGraphNodeRecord
                    {
                        Id = n.Id,
                        DisplayName = n.DisplayName,
                        FullName = n.FullName,
                        FilePath = n.FilePath,
                        LineNumber = n.LineNumber
                    }).ToList(),
                Edges = analysis.CallGraph.Edges
                    .Select(e => new CallGraphEdgeRecord
                    {
                        CallerId = e.CallerId,
                        CalleeId = e.CalleeId
                    }).ToList()
            },
            FileRelations = new FileRelationsSection
            {
                Files = analysis.FileRelations.Files
                    .Select(f => new FileRelationNodeRecord
                    {
                        Id = f.Id,
                        FilePath = f.FilePath,
                        DisplayName = f.DisplayName,
                        FullName = f.FullName,
                        FunctionCount = f.FunctionCount
                    }).ToList(),
                Edges = analysis.FileRelations.Edges
                    .Select(e => new FileRelationEdgeRecord
                    {
                        FromFileId = e.FromFileId,
                        ToFileId = e.ToFileId,
                        CallCount = e.CallCount
                    }).ToList()
            },
            DirectoryRelations = new DirectoryRelationsSection
            {
                Directories = analysis.DirectoryRelations.Directories
                    .Select(d => new DirectoryRelationNodeRecord
                    {
                        Id = d.Id,
                        DirectoryPath = d.DirectoryPath,
                        DisplayName = d.DisplayName,
                        FullName = d.FullName,
                        FileCount = d.FileCount,
                        FunctionCount = d.FunctionCount
                    }).ToList(),
                Edges = analysis.DirectoryRelations.Edges
                    .Select(e => new DirectoryRelationEdgeRecord
                    {
                        FromDirectoryId = e.FromDirectoryId,
                        ToDirectoryId = e.ToDirectoryId,
                        CallCount = e.CallCount
                    }).ToList()
            },
            Structure = new StructureSection
            {
                Types = analysis.Structure.Types
                    .Select(t => new StructureTypeRecord
                    {
                        Id = t.Id,
                        DisplayName = t.DisplayName,
                        FullName = t.FullName,
                        FilePath = t.FilePath,
                        LineNumber = t.LineNumber,
                        Kind = t.Kind,
                        Members = t.Members.ToList(),
                        Attributes = t.Attributes.ToList(),
                        Operations = t.Operations.ToList(),
                        IsAbstract = t.IsAbstract
                    }).ToList(),
                Relations = analysis.Structure.Relations
                    .Select(r => new StructureRelationRecord
                    {
                        FromId = r.FromId,
                        ToId = r.ToId,
                        Kind = r.Kind.ToString()
                    }).ToList()
            }
        };

        var json = JsonSerializer.Serialize(document, JsonOptions);
        File.WriteAllText(filePath, json);
    }

    public static (AnalysisResult Analysis, string RootDirectory) LoadFromFile(string filePath)
    {
        var json = File.ReadAllText(filePath);

        using var doc = JsonDocument.Parse(json);
        var version = doc.RootElement.TryGetProperty("version", out var vProp)
            ? vProp.GetString()
            : "1";

        if (version == "2")
        {
            var document = JsonSerializer.Deserialize<AnalysisDocument>(json, JsonOptions)
                ?? throw new InvalidDataException("유효하지 않은 분석 결과 파일입니다.");
            return (BuildFromV2(document), document.RootDirectory);
        }
        else
        {
            var document = JsonSerializer.Deserialize<LegacyCallGraphDocument>(json, JsonOptions)
                ?? throw new InvalidDataException("유효하지 않은 분석 결과 파일입니다.");
            return (BuildFromV1(document), document.RootDirectory);
        }
    }

    private static AnalysisResult BuildFromV2(AnalysisDocument d)
    {
        var callGraph = CallGraphBuilder.Build(
            d.CallGraph.Nodes.Select(n => new CallGraphNode
            {
                Id = n.Id,
                DisplayName = n.DisplayName,
                FullName = n.FullName,
                FilePath = n.FilePath,
                LineNumber = n.LineNumber
            }).ToList(),
            d.CallGraph.Edges.Select(e => new CallGraphEdge
            {
                CallerId = e.CallerId,
                CalleeId = e.CalleeId
            }).ToList());

        var fileNodes = d.FileRelations.Files.Select(f => new FileRelationNode
        {
            Id = f.Id,
            FilePath = f.FilePath,
            DisplayName = f.DisplayName,
            FullName = f.FullName,
            FunctionCount = f.FunctionCount
        }).ToList();
        var fileEdges = d.FileRelations.Edges.Select(e => new FileRelationEdge
        {
            FromFileId = e.FromFileId,
            ToFileId = e.ToFileId,
            CallCount = e.CallCount
        }).ToList();

        var dirNodes = d.DirectoryRelations.Directories.Select(n => new DirectoryRelationNode
        {
            Id = n.Id,
            DirectoryPath = n.DirectoryPath,
            DisplayName = n.DisplayName,
            FullName = n.FullName,
            FileCount = n.FileCount,
            FunctionCount = n.FunctionCount
        }).ToList();
        var dirEdges = d.DirectoryRelations.Edges.Select(e => new DirectoryRelationEdge
        {
            FromDirectoryId = e.FromDirectoryId,
            ToDirectoryId = e.ToDirectoryId,
            CallCount = e.CallCount
        }).ToList();

        var types = d.Structure.Types.Select(t => new StructureTypeNode
        {
            Id = t.Id,
            DisplayName = t.DisplayName,
            FullName = t.FullName,
            FilePath = t.FilePath,
            LineNumber = t.LineNumber,
            Kind = t.Kind,
            Members = t.Members,
            Attributes = t.Attributes,
            Operations = t.Operations,
            IsAbstract = t.IsAbstract
        }).ToList();
        var relations = d.Structure.Relations.Select(r => new StructureRelationEdge
        {
            FromId = r.FromId,
            ToId = r.ToId,
            Kind = Enum.TryParse<StructureRelationKind>(r.Kind, out var k) ? k : StructureRelationKind.Dependency
        }).ToList();

        return new AnalysisResult
        {
            CallGraph = callGraph,
            FileRelations = BuildFileRelations(fileNodes, fileEdges),
            DirectoryRelations = BuildDirectoryRelations(dirNodes, dirEdges),
            Structure = new ProjectStructureResult
            {
                Types = types,
                Relations = relations,
                TypeMap = types.ToDictionary(t => t.Id, StringComparer.Ordinal)
            }
        };
    }

    private static AnalysisResult BuildFromV1(LegacyCallGraphDocument d)
    {
        var callGraph = CallGraphBuilder.Build(
            d.Nodes.Select(n => new CallGraphNode
            {
                Id = n.Id,
                DisplayName = n.DisplayName,
                FullName = n.FullName,
                FilePath = n.FilePath,
                LineNumber = n.LineNumber
            }).ToList(),
            d.Edges.Select(e => new CallGraphEdge
            {
                CallerId = e.CallerId,
                CalleeId = e.CalleeId
            }).ToList());

        return new AnalysisResult
        {
            CallGraph = callGraph,
            FileRelations = FileCallGraphBuilder.Build(callGraph),
            DirectoryRelations = DirectoryCallGraphBuilder.Build(callGraph),
            Structure = new ProjectStructureResult()
        };
    }

    private static FileRelationGraphResult BuildFileRelations(
        List<FileRelationNode> files, List<FileRelationEdge> edges)
    {
        var outgoing = files.ToDictionary(f => f.Id, _ => new List<string>(), StringComparer.OrdinalIgnoreCase);
        foreach (var e in edges)
        {
            if (outgoing.TryGetValue(e.FromFileId, out var list))
            {
                list.Add(e.ToFileId);
            }
        }

        return new FileRelationGraphResult
        {
            Files = files,
            Edges = edges,
            FileMap = files.ToDictionary(f => f.Id, StringComparer.OrdinalIgnoreCase),
            Outgoing = outgoing
        };
    }

    private static DirectoryRelationGraphResult BuildDirectoryRelations(
        List<DirectoryRelationNode> directories, List<DirectoryRelationEdge> edges)
    {
        var outgoing = directories.ToDictionary(d => d.Id, _ => new List<string>(), StringComparer.OrdinalIgnoreCase);
        foreach (var e in edges)
        {
            if (outgoing.TryGetValue(e.FromDirectoryId, out var list))
            {
                list.Add(e.ToDirectoryId);
            }
        }

        return new DirectoryRelationGraphResult
        {
            Directories = directories,
            Edges = edges,
            DirectoryMap = directories.ToDictionary(d => d.Id, StringComparer.OrdinalIgnoreCase),
            Outgoing = outgoing
        };
    }

    // ── Document models ─────────────────────────────────────────────────────

    private sealed class AnalysisDocument
    {
        public string Version { get; set; } = "2";
        public string RootDirectory { get; set; } = string.Empty;
        public DateTime SavedAtUtc { get; set; }
        public CallGraphSection CallGraph { get; set; } = new();
        public FileRelationsSection FileRelations { get; set; } = new();
        public DirectoryRelationsSection DirectoryRelations { get; set; } = new();
        public StructureSection Structure { get; set; } = new();
    }

    private sealed class LegacyCallGraphDocument
    {
        public string Version { get; set; } = "1";
        public string RootDirectory { get; set; } = string.Empty;
        public DateTime SavedAtUtc { get; set; }
        public List<CallGraphNodeRecord> Nodes { get; set; } = [];
        public List<CallGraphEdgeRecord> Edges { get; set; } = [];
    }

    private sealed class CallGraphSection
    {
        public List<CallGraphNodeRecord> Nodes { get; set; } = [];
        public List<CallGraphEdgeRecord> Edges { get; set; } = [];
    }

    private sealed class FileRelationsSection
    {
        public List<FileRelationNodeRecord> Files { get; set; } = [];
        public List<FileRelationEdgeRecord> Edges { get; set; } = [];
    }

    private sealed class DirectoryRelationsSection
    {
        public List<DirectoryRelationNodeRecord> Directories { get; set; } = [];
        public List<DirectoryRelationEdgeRecord> Edges { get; set; } = [];
    }

    private sealed class StructureSection
    {
        public List<StructureTypeRecord> Types { get; set; } = [];
        public List<StructureRelationRecord> Relations { get; set; } = [];
    }

    // ── Record types ─────────────────────────────────────────────────────────

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

    private sealed class FileRelationNodeRecord
    {
        public string Id { get; set; } = string.Empty;
        public string FilePath { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public int FunctionCount { get; set; }
    }

    private sealed class FileRelationEdgeRecord
    {
        public string FromFileId { get; set; } = string.Empty;
        public string ToFileId { get; set; } = string.Empty;
        public int CallCount { get; set; }
    }

    private sealed class DirectoryRelationNodeRecord
    {
        public string Id { get; set; } = string.Empty;
        public string DirectoryPath { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public int FileCount { get; set; }
        public int FunctionCount { get; set; }
    }

    private sealed class DirectoryRelationEdgeRecord
    {
        public string FromDirectoryId { get; set; } = string.Empty;
        public string ToDirectoryId { get; set; } = string.Empty;
        public int CallCount { get; set; }
    }

    private sealed class StructureTypeRecord
    {
        public string Id { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string FilePath { get; set; } = string.Empty;
        public int LineNumber { get; set; }
        public string Kind { get; set; } = "class";
        public List<string> Members { get; set; } = [];
        public List<string> Attributes { get; set; } = [];
        public List<string> Operations { get; set; } = [];
        public bool IsAbstract { get; set; }
    }

    private sealed class StructureRelationRecord
    {
        public string FromId { get; set; } = string.Empty;
        public string ToId { get; set; } = string.Empty;
        public string Kind { get; set; } = string.Empty;
    }
}
