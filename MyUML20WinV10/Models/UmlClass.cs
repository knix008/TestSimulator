namespace MyUML20WinV10.Models;

public sealed class UmlClass : UmlClassifier
{
    public UmlClass()
    {
        Name = "Class1";
    }

    public override string NotationKeyword => IsAbstract ? "abstract class" : "class";

    public override UmlClassifier CloneClassifier() => new UmlClass
    {
        Id = Id,
        Name = Name,
        IsAbstract = IsAbstract,
        Stereotype = Stereotype,
        Properties = Properties.Select(p => p.Clone()).ToList(),
        Operations = Operations.Select(o => o.Clone()).ToList(),
    };
}
