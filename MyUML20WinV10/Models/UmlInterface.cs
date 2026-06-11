using System.ComponentModel;

namespace MyUML20WinV10.Models;

public sealed class UmlInterface : UmlClassifier
{
    public UmlInterface()
    {
        Name = "IInterface";
    }

    public override string NotationKeyword => "interface";

    [Category("표시")]
    [DisplayName("원형 표기")]
    [Description("Interface를 원(circle) 표기로 그립니다.")]
    public bool UseCircleNotation { get; set; }

    public override UmlClassifier CloneClassifier() => new UmlInterface
    {
        Id = Id,
        Name = Name,
        IsAbstract = IsAbstract,
        Stereotype = Stereotype,
        UseCircleNotation = UseCircleNotation,
        Properties = Properties.Select(p => p.Clone()).ToList(),
        Operations = Operations.Select(o => o.Clone()).ToList(),
    };
}
