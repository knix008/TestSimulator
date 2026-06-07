using System.ComponentModel;

namespace MyUML20WinV10.Models;

public sealed class UmlEnumeration : UmlClassifier
{
    public UmlEnumeration()
    {
        Name = "Enum1";
    }

    [Category("기본")]
    [DisplayName("리터럴")]
    public string LiteralsText
    {
        get => string.Join(", ", Literals);
        set => Literals = value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
    }

    [Browsable(false)]
    public List<string> Literals { get; set; } = ["Value1", "Value2"];

    public override string NotationKeyword => "enumeration";

    public override UmlClassifier CloneClassifier() => new UmlEnumeration
    {
        Id = Id,
        Name = Name,
        IsAbstract = IsAbstract,
        Stereotype = Stereotype,
        Properties = Properties.Select(p => p.Clone()).ToList(),
        Operations = Operations.Select(o => o.Clone()).ToList(),
        Literals = [.. Literals],
    };
}
