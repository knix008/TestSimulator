using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

internal sealed class StructureDiagramBuildSession
{
    public DiagramViewKind ViewKind { get; init; }
    public AnalysisResult? Analysis { get; init; }
    public IReadOnlyList<string> FunctionRootIds { get; init; } = [];
    public IReadOnlyList<string> FileRootOverride { get; init; } = [];
    public IReadOnlyList<string> DirectoryRootOverride { get; init; } = [];
    public string? DataFlowRootOverride { get; init; }
    public string? ProjectRootDirectory { get; init; }
    public GraphLayoutDirection LayoutDirection { get; init; }
    public string? FocusedTypeId { get; init; }

    public List<DiagramBoxNode> Boxes { get; } = [];
    public List<DiagramEdge> Edges { get; } = [];
    public Dictionary<string, DiagramBoxNode> BoxMap { get; } = new(StringComparer.Ordinal);
    public HashSet<string> FileEntryRootIds { get; } = new(StringComparer.OrdinalIgnoreCase);
    public Size ContentSize { get; set; } = new(400, 300);
    public bool BuildError { get; set; }
    public Exception? Error { get; set; }

    public void ApplyBoxContentSize(Size layoutSize)
    {
        ContentSize = DiagramZoomController.InflateContentSize(
            layoutSize,
            Boxes.Select(box => box.Bounds));
    }
}
