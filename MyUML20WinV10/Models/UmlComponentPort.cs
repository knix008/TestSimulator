using System.ComponentModel;

namespace MyUML20WinV10.Models;

public sealed class UmlComponentPort : UmlNamedElement
{
    [Category("기본")]
    [DisplayName("인터페이스 방향")]
    public UmlComponentInterfaceKind? InterfaceKind { get; set; }

    [Category("기본")]
    [DisplayName("인터페이스 이름")]
    public string InterfaceName { get; set; } = string.Empty;

    public UmlComponentPort()
    {
        Name = "Port";
    }
}
