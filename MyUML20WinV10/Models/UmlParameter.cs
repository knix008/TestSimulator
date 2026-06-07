using System.ComponentModel;

namespace MyUML20WinV10.Models;

public sealed class UmlParameter
{
    [DisplayName("이름")]
    public string Name { get; set; } = "param";

    [DisplayName("타입")]
    public string TypeName { get; set; } = "string";

    public string SignatureText => $"{Name}: {TypeName}";
}
