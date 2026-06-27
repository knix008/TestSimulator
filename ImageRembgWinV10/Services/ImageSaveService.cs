using ImageRembgWinV10.Localization;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace ImageRembgWinV10.Services;

public static class ImageSaveService
{
    private static readonly HashSet<string> TransparentExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".png",
        ".webp",
        ".gif",
        ".tif",
        ".tiff"
    };

    public static bool SupportsTransparency(string? extension)
    {
        if (string.IsNullOrWhiteSpace(extension))
        {
            return true;
        }

        return TransparentExtensions.Contains(NormalizeExtension(extension));
    }

    public static string CreateDefaultFileName(string? sourceFilePath)
    {
        var baseName = string.IsNullOrWhiteSpace(sourceFilePath)
            ? "result"
            : Path.GetFileNameWithoutExtension(sourceFilePath) + "_nobg";

        return baseName + ".png";
    }

    public static void Save(Bitmap source, string filePath)
    {
        var extension = Path.GetExtension(filePath);
        if (string.IsNullOrWhiteSpace(extension))
        {
            filePath += ".png";
            extension = ".png";
        }

        using var image = ToImageSharp(source);
        if (SupportsTransparency(extension))
        {
            SaveWithTransparency(image, filePath, extension);
            return;
        }

        using var flattened = FlattenOnWhite(image);
        SaveWithoutTransparency(flattened, filePath, extension);
    }

    private static Image<Rgba32> ToImageSharp(Bitmap bitmap)
    {
        using var memoryStream = new MemoryStream();
        bitmap.Save(memoryStream, System.Drawing.Imaging.ImageFormat.Png);
        memoryStream.Position = 0;
        return SixLabors.ImageSharp.Image.Load<Rgba32>(memoryStream);
    }

    private static Image<Rgba32> FlattenOnWhite(Image<Rgba32> source)
    {
        var flattened = new Image<Rgba32>(
            source.Width,
            source.Height,
            new Rgba32(255, 255, 255, 255));

        flattened.Mutate(context => context.DrawImage(source, 1f));
        return flattened;
    }

    private static void SaveWithTransparency(Image<Rgba32> image, string filePath, string extension)
    {
        switch (NormalizeExtension(extension))
        {
            case ".png":
                image.SaveAsPng(filePath);
                break;
            case ".webp":
                image.SaveAsWebp(
                    filePath,
                    new WebpEncoder
                    {
                        FileFormat = WebpFileFormatType.Lossless,
                        Method = WebpEncodingMethod.Level4
                    });
                break;
            case ".gif":
                image.SaveAsGif(filePath);
                break;
            case ".tif":
            case ".tiff":
                image.SaveAsTiff(filePath);
                break;
            default:
                image.SaveAsPng(filePath);
                break;
        }
    }

    private static void SaveWithoutTransparency(Image<Rgba32> image, string filePath, string extension)
    {
        switch (NormalizeExtension(extension))
        {
            case ".jpg":
            case ".jpeg":
                image.SaveAsJpeg(
                    filePath,
                    new JpegEncoder
                    {
                        Quality = 92
                    });
                break;
            case ".bmp":
                image.SaveAsBmp(filePath);
                break;
            default:
                throw new NotSupportedException(
                    L.F("Exception.UnsupportedTransparentSave", extension));
        }
    }

    private static string NormalizeExtension(string extension)
    {
        extension = extension.Trim();
        if (!extension.StartsWith('.'))
        {
            extension = "." + extension;
        }

        return extension.ToLowerInvariant();
    }
}
