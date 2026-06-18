namespace CodeAnalyzer.Models;

public enum StructureRelationKind
{
    Inheritance,
    Implementation,
    Dependency
}

public sealed class StructureTypeNode
{
    public required string Id { get; init; }
    public required string DisplayName { get; init; }
    public required string FullName { get; init; }
    public required string FilePath { get; init; }
    public int LineNumber { get; init; }
    public string Kind { get; init; } = "class";
    public IReadOnlyList<string> Members { get; init; } = [];
    public IReadOnlyList<string> Attributes { get; init; } = [];
    public IReadOnlyList<string> Operations { get; init; } = [];
    public bool IsAbstract { get; init; }
}

public sealed class StructureRelationEdge
{
    public required string FromId { get; init; }
    public required string ToId { get; init; }
    public StructureRelationKind Kind { get; init; }
}

public sealed class ProjectStructureResult
{
    public IReadOnlyList<StructureTypeNode> Types { get; init; } = [];
    public IReadOnlyList<StructureRelationEdge> Relations { get; init; } = [];

    public IReadOnlyDictionary<string, StructureTypeNode> TypeMap { get; init; }
        = new Dictionary<string, StructureTypeNode>(StringComparer.Ordinal);
}

public sealed class SequenceMessage
{
    public required string FromId { get; init; }
    public required string ToId { get; init; }
    public required string Label { get; init; }
    public int Order { get; init; }
}

public sealed class SequenceDiagramResult
{
    public IReadOnlyList<string> ParticipantIds { get; init; } = [];
    public IReadOnlyList<SequenceMessage> Messages { get; init; } = [];
    public IReadOnlyDictionary<string, CallGraphNode> ParticipantMap { get; init; }
        = new Dictionary<string, CallGraphNode>(StringComparer.Ordinal);
    public bool IsTruncated { get; init; }
    public string? TruncationNote { get; init; }
    public int MessageIndexOffset { get; init; }
    public string? PageNote { get; init; }
}

public sealed class SequenceDiagramParticipantLayoutData
{
    public required string Id { get; init; }
    public required string DisplayName { get; init; }
    public Rectangle HeaderBounds { get; init; }
    public int LifelineX { get; init; }
    public IReadOnlyList<Rectangle> Activations { get; init; } = [];
}

public sealed class SequenceDiagramMessageLayoutData
{
    public required SequenceMessage Message { get; init; }
    public int FromIndex { get; init; }
    public int ToIndex { get; init; }
    public int Y { get; init; }
    public bool IsSelfCall { get; init; }
}

public sealed class SequenceDiagramLayoutData
{
    public Size DiagramSize { get; init; }
    public int LifelineBottomY { get; init; }
    public IReadOnlyList<SequenceDiagramParticipantLayoutData> Participants { get; init; } = [];
    public IReadOnlyList<SequenceDiagramMessageLayoutData> Messages { get; init; } = [];
}

public sealed class SequenceDiagramPanel
{
    public required string RootId { get; init; }
    public required string Title { get; init; }
    public required SequenceDiagramResult Diagram { get; init; }
    public Size LayoutSize { get; init; }
    public SequenceDiagramLayoutData? Layout { get; init; }
}

public sealed class SequenceDiagramDocument
{
    public IReadOnlyList<SequenceDiagramPanel> Panels { get; init; } = [];
    public bool IsTruncated { get; init; }
    public string? TruncationNote { get; init; }
}

public sealed class DataFlowEdge
{
    public required string FromId { get; init; }
    public required string ToId { get; init; }
    public required string Label { get; init; }
}

public sealed class DataFlowDiagramResult
{
    public IReadOnlyList<string> RootIds { get; init; } = [];
    public IReadOnlyList<CallGraphNode> Nodes { get; init; } = [];
    public IReadOnlyList<DataFlowEdge> Edges { get; init; } = [];
    public IReadOnlyDictionary<string, CallGraphNode> NodeMap { get; init; }
        = new Dictionary<string, CallGraphNode>(StringComparer.Ordinal);
    public IReadOnlyDictionary<string, List<string>> Outgoing { get; init; }
        = new Dictionary<string, List<string>>(StringComparer.Ordinal);
    public IReadOnlyDictionary<string, int> DepthById { get; init; }
        = new Dictionary<string, int>(StringComparer.Ordinal);
}

public sealed class AnalysisResult
{
    public CallGraphResult CallGraph { get; init; } = new();
    public FileRelationGraphResult FileRelations { get; init; } = new();
    public DirectoryRelationGraphResult DirectoryRelations { get; init; } = new();
    public ProjectStructureResult Structure { get; init; } = new();
    public CodeMetricsResult Metrics { get; init; } = new();
    public DuplicateCodeResult Duplicates { get; init; } = new();
    public GlobalVariableResult GlobalVariables { get; init; } = new();
    public DatabaseSchemaResult DatabaseSchema { get; init; } = new();
    public BugRiskResult BugRisk { get; init; } = BugRiskResult.Empty;
    public SecurityAnalysisResult Security { get; init; } = SecurityAnalysisResult.Empty;
    public UserAnalysisSettings QualityThresholds { get; init; } = new();
    public IReadOnlyList<AnalysisIssue> Issues { get; init; } = [];
}
