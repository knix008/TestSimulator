namespace SuperResolutionApp;

public sealed class BicubicFallbackEngine : ISuperResolutionEngine
{
    public BicubicFallbackEngine(SrAlgorithm algorithm)
    {
        Algorithm = algorithm;
    }

    public SrAlgorithm Algorithm { get; }

    public Task<Bitmap> UpscaleAsync(Bitmap input, SrOptions options, IProgress<int>? progress = null)
    {
        if (options.Scale < 2)
        {
            throw new ArgumentOutOfRangeException(nameof(options.Scale), "Scale must be >= 2.");
        }
        progress?.Report(5);

        var width = input.Width * options.Scale;
        var height = input.Height * options.Scale;

        var output = new Bitmap(width, height);
        using var graphics = Graphics.FromImage(output);
        graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
        graphics.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
        graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
        graphics.CompositingQuality = System.Drawing.Drawing2D.CompositingQuality.HighQuality;
        graphics.DrawImage(input, new Rectangle(0, 0, width, height));
        progress?.Report(100);

        return Task.FromResult(output);
    }
}
