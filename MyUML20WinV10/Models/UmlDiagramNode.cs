using System.ComponentModel;

namespace MyUML20WinV10.Models;

public sealed class UmlDiagramNode
{
    [Browsable(false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Browsable(false)]
    public Guid ModelElementId { get; set; }

    [Category("기본")]
    [DisplayName("표기 종류")]
    public UmlNodePresentation Presentation { get; set; } = UmlNodePresentation.Classifier;

    [Category("레이아웃")]
    [DisplayName("X")]
    public float X { get; set; }

    [Category("레이아웃")]
    [DisplayName("Y")]
    public float Y { get; set; }

    [Category("레이아웃")]
    [DisplayName("너비")]
    public float Width { get; set; } = 160;

    [Category("레이아웃")]
    [DisplayName("높이")]
    public float Height { get; set; } = 120;

    [Category("레이아웃")]
    [DisplayName("구획 표시")]
    public bool ShowCompartments { get; set; } = true;

    public RectangleF Bounds => new(X, Y, Width, Height);
}
