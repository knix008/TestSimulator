using ImageRembgWinV10.Localization;
using HeyRed.ImageSharp.Heif.Formats.Avif;
using HeyRed.ImageSharp.Heif.Formats.Heif;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.PixelFormats;

namespace ImageRembgWinV10.Services;

public static class ImageLoaderService
{
    private static readonly HashSet<string> SupportedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".webp",
        ".avif",
        ".png",
        ".gif",
        ".jpg",
        ".jpeg",
        ".bmp",
        ".tif",
        ".tiff",
        ".heic",
        ".heif"
    };

    private static readonly DecoderOptions DecoderOptions = CreateDecoderOptions();

    public static bool IsSupported(string filePath)
    {
        return SupportedExtensions.Contains(Path.GetExtension(filePath));
    }

    public static Bitmap Load(string filePath)
    {
        if (!File.Exists(filePath))
        {
            throw new FileNotFoundException(L.Get("Exception.FileNotFound"), filePath);
        }

        if (!IsSupported(filePath))
        {
            throw new NotSupportedException(
                L.F("Exception.UnsupportedExtension", Path.GetExtension(filePath)));
        }

        using var stream = File.OpenRead(filePath);
        using var image = SixLabors.ImageSharp.Image.Load<Rgba32>(DecoderOptions, stream);
        return ToBitmap(image);
    }

    private static DecoderOptions CreateDecoderOptions()
    {
        var configuration = Configuration.Default.Clone();
        configuration.Configure(new AvifConfigurationModule());
        configuration.Configure(new HeifConfigurationModule());

        return new DecoderOptions
        {
            Configuration = configuration,
            MaxFrames = 1
        };
    }

    private static Bitmap ToBitmap(Image<Rgba32> source)
    {
        using var memoryStream = new MemoryStream();
        source.SaveAsPng(memoryStream);
        memoryStream.Position = 0;
        using var bitmap = new Bitmap(memoryStream);
        return new Bitmap(bitmap, bitmap.Width, bitmap.Height);
    }
}
