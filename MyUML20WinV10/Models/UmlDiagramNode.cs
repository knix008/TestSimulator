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

    [Browsable(false)]
    public Guid? AttachedComponentNodeId { get; set; }

    [Browsable(false)]
    public UmlComponentAttachmentEdge AttachmentEdge { get; set; } = UmlComponentAttachmentEdge.None;

    /// <summary>0..1 위치 along the attached component edge.</summary>
    [Browsable(false)]
    public float AttachmentT { get; set; } = 0.5f;

    /// <summary>Required/Provided 선 끝(소켓·롤리팝 중심). 미설정 시 bounds에서 유도합니다.</summary>
    [Browsable(false)]
    public float? InterfaceOutwardX { get; set; }

    [Browsable(false)]
    public float? InterfaceOutwardY { get; set; }

    public RectangleF Bounds => new(X, Y, Width, Height);
}
