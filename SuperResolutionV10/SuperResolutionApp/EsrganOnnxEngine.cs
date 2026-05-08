namespace SuperResolutionApp;

public sealed class EsrganOnnxEngine : OnnxSuperResolutionEngine
{
    public override SrAlgorithm Algorithm => SrAlgorithm.ESRGAN;
}
