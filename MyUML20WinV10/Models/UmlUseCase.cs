using System.ComponentModel;

namespace MyUML20WinV10.Models;

public sealed class UmlUseCase : UmlNamedElement
{
    [Category("정의")]
    [DisplayName("확장 포인트")]
    public List<string> ExtensionPoints { get; set; } = [];

    [Category("정의")]
    [DisplayName("요구사항")]
    public string Requirements { get; set; } = string.Empty;

    [Category("정의")]
    [DisplayName("제약")]
    public string Constraints { get; set; } = string.Empty;

    [Category("정의")]
    [DisplayName("시나리오")]
    public string Scenario { get; set; } = string.Empty;

    public UmlUseCase()
    {
        Name = "UseCase";
    }
}
