namespace MyUML20WinV10.Models;

public sealed class UmlInclude : UmlRelationship
{
    public override string RelationshipKind => "Include";

    public override string DisplayLabel => "«include»";
}
