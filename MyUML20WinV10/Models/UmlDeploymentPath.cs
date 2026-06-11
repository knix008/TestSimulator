using System.ComponentModel;

namespace MyUML20WinV10.Models;

public sealed class UmlDeploymentPath : UmlRelationship
{
    [Category("기본")]
    [DisplayName("스테레오타입")]
    public string Stereotype { get; set; } = string.Empty;

    [Category("기본")]
    [DisplayName("대역폭")]
    public string Bandwidth { get; set; } = string.Empty;

    public override string RelationshipKind => "DeploymentPath";

    public override string DisplayLabel
    {
        get
        {
            var parts = new List<string>();
            if (!string.IsNullOrWhiteSpace(Stereotype))
                parts.Add($"«{Stereotype}»");
            if (!string.IsNullOrWhiteSpace(Bandwidth))
                parts.Add(Bandwidth);
            if (parts.Count > 0)
                return string.Join(" ", parts);
            return string.IsNullOrWhiteSpace(Name) ? "path" : Name!;
        }
    }
}
