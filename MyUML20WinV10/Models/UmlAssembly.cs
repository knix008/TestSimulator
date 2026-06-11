using System.ComponentModel;

namespace MyUML20WinV10.Models;

public sealed class UmlAssembly : UmlRelationship
{
    [Category("기본")]
    [DisplayName("인터페이스 이름")]
    public string? InterfaceName { get; set; }

    [Category("기본")]
    [DisplayName("소스가 요구자")]
    [Description("소스가 인터페이스를 요구(소켓)하면 참. 제공(포트만)이면 거짓.")]
    public bool SourceIsRequirer { get; set; } = true;

    public override string RelationshipKind => "Assembly";

    public override string DisplayLabel =>
        string.IsNullOrWhiteSpace(InterfaceName) ? "Assembly" : InterfaceName!;
}
