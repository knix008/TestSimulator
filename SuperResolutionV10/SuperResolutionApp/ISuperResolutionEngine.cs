namespace SuperResolutionApp;

public interface ISuperResolutionEngine
{
    SrAlgorithm Algorithm { get; }
    Task<Bitmap> UpscaleAsync(Bitmap input, SrOptions options);
}
