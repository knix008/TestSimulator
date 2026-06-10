using System.ComponentModel;

namespace MyUML20WinV10.Models;

public sealed class UmlExtend : UmlRelationship
{
    public override string RelationshipKind => "Extend";

    public override string DisplayLabel => "«extend»";

    [Category("기본")]
    [DisplayName("확장 조건")]
    public string Condition { get; set; } = string.Empty;
}
