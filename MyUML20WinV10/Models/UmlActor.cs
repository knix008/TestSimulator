using System.ComponentModel;

namespace MyUML20WinV10.Models;

public sealed class UmlActor : UmlNamedElement
{
    [Category("표기")]
    [DisplayName("사각형 표기")]
    public bool UseRectangleNotation { get; set; }

    public UmlActor()
    {
        Name = "Actor";
    }
}
