namespace SuperResolutionApp;

public sealed class SuperResolutionService
{
    private readonly Dictionary<SrAlgorithm, ISuperResolutionEngine> _engines;
    public string LastRuntimeDevice { get; private set; } = "CPU";

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

    public async Task<Bitmap> RunAsync(Bitmap input, SrOptions options, IProgress<int>? progress = null)
    {
        if (!_engines.TryGetValue(options.Algorithm, out var engine))
        {
            throw new NotSupportedException($"Unsupported algorithm: {options.Algorithm}");
        }

        if (options.Algorithm != SrAlgorithm.Bicubic && string.IsNullOrWhiteSpace(options.ModelPath))
        {
            throw new InvalidOperationException($"{options.Algorithm} requires an ONNX model path.");
        }

        var result = await engine.UpscaleAsync(input, options, progress);
        LastRuntimeDevice = engine.LastRuntimeDevice;
        return result;
    }
}
