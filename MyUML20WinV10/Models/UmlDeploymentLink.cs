namespace MyUML20WinV10.Models;

public sealed class UmlDeploymentLink : UmlRelationship
{
    public override string RelationshipKind => "Deployment";

    public override string DisplayLabel => string.IsNullOrWhiteSpace(Name) ? "«deploy»" : Name!;
}
