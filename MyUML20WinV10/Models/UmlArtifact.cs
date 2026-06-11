using System.ComponentModel;

namespace MyUML20WinV10.Models;

public sealed class UmlArtifact : UmlNamedElement
{
    [Category("표기")]
    [DisplayName("인스턴스 표기")]
    public bool IsInstance { get; set; }

    public UmlArtifact()
    {
        Name = "artifact.war";
    }
}
