using System.ComponentModel;

namespace MyUML20WinV10.Models;

public sealed class UmlObjectInstance : UmlNamedElement
{
    public UmlObjectInstance()
    {
        Name = "obj";
    }

    [Category("기본")]
    [DisplayName("타입")]
    public string TypeName { get; set; } = "Class";
}
