using System.ComponentModel;

namespace MyUML20WinV10.Models;

public sealed class UmlNote : UmlNamedElement
{
    public UmlNote()
    {
        Name = "Note";
    }

    [Category("기본")]
    [DisplayName("내용")]
    public string Body { get; set; } = "Note text";
}
