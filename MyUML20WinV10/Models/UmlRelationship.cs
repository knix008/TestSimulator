using System.ComponentModel;
using System.Text.Json.Serialization;

namespace MyUML20WinV10.Models;

[JsonPolymorphic(TypeDiscriminatorPropertyName = "relationshipKind")]
[JsonDerivedType(typeof(UmlAssociation), "association")]
[JsonDerivedType(typeof(UmlGeneralization), "generalization")]
[JsonDerivedType(typeof(UmlDependency), "dependency")]
[JsonDerivedType(typeof(UmlRealization), "realization")]
[JsonDerivedType(typeof(UmlInclude), "include")]
[JsonDerivedType(typeof(UmlExtend), "extend")]
public abstract class UmlRelationship : UmlElement
{
    [Browsable(false)]
    public Guid SourceClassifierId { get; set; }

    [Browsable(false)]
    public Guid TargetClassifierId { get; set; }

    [Category("기본")]
    [DisplayName("이름")]
    public string? Name { get; set; }

    public abstract string RelationshipKind { get; }
}
