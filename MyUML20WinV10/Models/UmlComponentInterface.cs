using System.ComponentModel;

namespace MyUML20WinV10.Models;

public enum UmlComponentInterfaceKind
{
    Provided,
    Required,
}

public sealed class UmlComponentInterface : UmlNamedElement
{
    [Category("기본")]
    [DisplayName("종류")]
    public UmlComponentInterfaceKind InterfaceKind { get; set; } = UmlComponentInterfaceKind.Provided;

    public UmlComponentInterface()
    {
        Name = "Interface";
    }
}
