namespace MyUML20WinV10.Models;

public sealed class UmlClassNesting : UmlRelationship
{
    public override string RelationshipKind => "ClassNesting";

    public override string DisplayLabel => "«nested»";
}
