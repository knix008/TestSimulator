using System.ComponentModel;

namespace MyUML20WinV10.Models;

public enum UmlAggregationKind
{
    None,
    Shared,
    Composite,
}

public sealed class UmlAssociation : UmlRelationship
{
    [Category("연관")]
    [DisplayName("시작 이름")]
    public string SourceEndName { get; set; } = string.Empty;

    [Category("연관")]
    [DisplayName("끝 이름")]
    public string TargetEndName { get; set; } = string.Empty;

    [Category("연관")]
    [DisplayName("시작 다중성")]
    public string SourceMultiplicity { get; set; } = "1";

    [Category("연관")]
    [DisplayName("끝 다중성")]
    public string TargetMultiplicity { get; set; } = "1";

    [Category("연관")]
    [DisplayName("집합 종류")]
    public UmlAggregationKind Aggregation { get; set; } = UmlAggregationKind.None;

    [Category("연관")]
    [DisplayName("방향 표시")]
    public bool IsDirected { get; set; }

    public override string RelationshipKind => "Association";

    public override string DisplayLabel => string.IsNullOrWhiteSpace(Name) ? "Association" : Name!;
}
