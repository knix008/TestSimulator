using System.ComponentModel;

namespace MyUML20WinV10.Models;

public sealed class UmlAssociationClass : UmlRelationship
{
    [Category("연관 클래스")]
    [DisplayName("클래스 이름")]
    public string ClassName { get; set; } = "AssociationClass";

    public override string RelationshipKind => "AssociationClass";

    public override string DisplayLabel => string.IsNullOrWhiteSpace(ClassName) ? "AssociationClass" : ClassName;
}
