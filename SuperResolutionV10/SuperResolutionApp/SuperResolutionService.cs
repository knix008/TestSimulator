namespace SuperResolutionApp;

public sealed class SuperResolutionService
{
    private readonly Dictionary<SrAlgorithm, ISuperResolutionEngine> _engines;

    public SuperResolutionService()
    {
        _engines = new Dictionary<SrAlgorithm, ISuperResolutionEngine>
        {
            [SrAlgorithm.Bicubic] = new BicubicFallbackEngine(SrAlgorithm.Bicubic),
            [SrAlgorithm.ESRGAN] = new EsrganOnnxEngine(),
            [SrAlgorithm.SwinIR] = new SwinIrOnnxEngine(),
            [SrAlgorithm.AuraSR] = new AuraSrOnnxEngine()
        };
    }

    public Task<Bitmap> RunAsync(Bitmap input, SrOptions options, IProgress<int>? progress = null)
    {
        if (!_engines.TryGetValue(options.Algorithm, out var engine))
        {
            throw new NotSupportedException($"Unsupported algorithm: {options.Algorithm}");
        }

        if (options.Algorithm == SrAlgorithm.Bicubic)
        {
            return engine.UpscaleAsync(input, options, progress);
        }

        if (string.IsNullOrWhiteSpace(options.ModelPath))
        {
            throw new InvalidOperationException($"{options.Algorithm} requires an ONNX model path.");
        }

        return engine.UpscaleAsync(input, options, progress);
    }
}
