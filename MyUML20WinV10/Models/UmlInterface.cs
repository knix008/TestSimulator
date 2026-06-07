namespace MyUML20WinV10.Models;

public sealed class UmlInterface : UmlClassifier
{
    public UmlInterface()
    {
        Name = "IInterface";
    }

    public override string NotationKeyword => "interface";

    public override UmlClassifier CloneClassifier() => new UmlInterface
    {
        Id = Id,
        Name = Name,
        IsAbstract = IsAbstract,
        Stereotype = Stereotype,
        Properties = Properties.Select(p => p.Clone()).ToList(),
        Operations = Operations.Select(o => o.Clone()).ToList(),
    };
}
