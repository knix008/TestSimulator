namespace SuperResolutionApp;

public sealed class SuperResolutionService
{
    private readonly Dictionary<SrAlgorithm, ISuperResolutionEngine> _engines;

    public SuperResolutionService()
    {
        _engines = new Dictionary<SrAlgorithm, ISuperResolutionEngine>
        {
            [SrAlgorithm.ESRGAN] = new BicubicFallbackEngine(SrAlgorithm.ESRGAN),
            [SrAlgorithm.SwinIR] = new BicubicFallbackEngine(SrAlgorithm.SwinIR),
            [SrAlgorithm.AuraSR] = new BicubicFallbackEngine(SrAlgorithm.AuraSR)
        };
    }

    public Task<Bitmap> RunAsync(Bitmap input, SrOptions options)
    {
        if (string.IsNullOrWhiteSpace(options.ModelPath))
        {
            return _engines[options.Algorithm].UpscaleAsync(input, options);
        }

        if (!File.Exists(options.ModelPath))
        {
            throw new FileNotFoundException("Model file not found.", options.ModelPath);
        }

        // Placeholder branch for future ONNX runtime engine.
        return _engines[options.Algorithm].UpscaleAsync(input, options);
    }
}
