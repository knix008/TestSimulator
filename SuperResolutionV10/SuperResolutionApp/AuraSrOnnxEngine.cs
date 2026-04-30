namespace SuperResolutionApp;

public sealed class AuraSrOnnxEngine : OnnxSuperResolutionEngine
{
    public override SrAlgorithm Algorithm => SrAlgorithm.AuraSR;
}
