using System.ComponentModel;

namespace MyUML20WinV10.Models;

public sealed class UmlProperty : UmlNamedElement
{
    [Category("기본")]
    [DisplayName("타입")]
    public string TypeName { get; set; } = "string";

    [Category("기본")]
    [DisplayName("가시성")]
    public UmlVisibility Visibility { get; set; } = UmlVisibility.Private;

    [Category("기본")]
    [DisplayName("정적")]
    public bool IsStatic { get; set; }

    [Category("기본")]
    [DisplayName("읽기 전용")]
    public bool IsReadOnly { get; set; }

    public string SignatureText => $"{Visibility.ToSymbol()}{Name}: {TypeName}";

    public UmlProperty Clone() => new()
    {
        Id = Id,
        Name = Name,
        TypeName = TypeName,
        Visibility = Visibility,
        IsStatic = IsStatic,
        IsReadOnly = IsReadOnly,
    };
}
