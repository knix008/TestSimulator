using System.Drawing;

namespace YOLO11BrainV10.Inference;

public sealed class BrainDetection
{
    public RectangleF Box { get; init; }
    public int ClassId { get; init; }
    public float Confidence { get; init; }
    public string Label { get; init; } = "";

    /// <summary>True when the ONNX model is instance-segmentation style and this instance has mask coefficients.</summary>
    public bool HasMask { get; init; }
}
