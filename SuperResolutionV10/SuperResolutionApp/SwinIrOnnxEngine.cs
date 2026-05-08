namespace SuperResolutionApp;

public sealed class SwinIrOnnxEngine : OnnxSuperResolutionEngine
{
    public override SrAlgorithm Algorithm => SrAlgorithm.SwinIR;
}
