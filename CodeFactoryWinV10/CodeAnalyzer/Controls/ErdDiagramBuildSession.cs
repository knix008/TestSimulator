using CodeAnalyzer.Models;

namespace CodeAnalyzer.Controls;

internal sealed class ErdDiagramBuildSession
{
    public DatabaseSchemaResult? Schema { get; init; }
    public int LayoutWidth { get; init; } = 480;

    public List<DiagramBoxNode> Boxes { get; } = [];
    public List<DatabaseRelation> Relations { get; } = [];
    public Dictionary<string, DiagramBoxNode> BoxMap { get; } = new(StringComparer.Ordinal);
    public Size ContentSize { get; set; } = new(480, 320);
    public bool BuildError { get; set; }
    public Exception? Error { get; set; }
}
