using System.ComponentModel;

namespace MyUML20WinV10.Models;

public abstract class UmlNamedElement : UmlElement
{
    [Category("기본")]
    [DisplayName("이름")]
    public string Name { get; set; } = "Unnamed";

    public override string DisplayLabel => string.IsNullOrWhiteSpace(Name) ? GetType().Name : Name;
}
