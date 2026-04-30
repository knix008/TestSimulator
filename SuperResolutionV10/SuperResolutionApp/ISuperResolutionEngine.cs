namespace SuperResolutionApp;

public interface ISuperResolutionEngine
{
    SrAlgorithm Algorithm { get; }
    string LastRuntimeDevice { get; }
    Task<Bitmap> UpscaleAsync(Bitmap input, SrOptions options, IProgress<int>? progress = null);
}
