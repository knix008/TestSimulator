using System.ComponentModel;

namespace MyUML20WinV10.Models;

public sealed class UmlComponent : UmlNamedElement
{
    [Category("표시")]
    [DisplayName("배경색")]
    [Description("ARGB hex (#AARRGGBB) 또는 RGB hex (#RRGGBB)")]
    public string FillColor { get; set; } = "#FFF8FCFF";

    public UmlComponent()
    {
        Name = "Component";
    }
}
