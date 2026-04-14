using System.Drawing;

namespace YOLO26BrainV10.Inference;

public sealed class BrainDetection
{
    public RectangleF Box { get; init; }
    public int ClassId { get; init; }
    public float Confidence { get; init; }
    public string Label { get; init; } = "";
}
