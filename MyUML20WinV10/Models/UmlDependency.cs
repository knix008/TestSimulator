using System.ComponentModel;

namespace MyUML20WinV10.Models;

public sealed class UmlDependency : UmlRelationship
{
    [Category("기본")]
    [DisplayName("스테레오타입")]
    public string Stereotype { get; set; } = string.Empty;

    public override string RelationshipKind => "Dependency";

    public override string DisplayLabel => string.IsNullOrWhiteSpace(Stereotype) ? "Dependency" : $"«{Stereotype}»";
}
