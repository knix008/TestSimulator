using System.Drawing.Imaging;
using SkiaSharp;
using Svg.Skia;

namespace MyWorkspace.Win;

internal static class ImageRasterizer
{
    public static bool TryRasterizeToPng(string assetPath, out MemoryStream pngStream)
    {
        pngStream = new MemoryStream();
        var extension = Path.GetExtension(assetPath);

        if (extension.Equals(".svg", StringComparison.OrdinalIgnoreCase))
            return TryRasterizeSvg(assetPath, pngStream);

        try
        {
            using var image = Image.FromFile(assetPath);
            image.Save(pngStream, ImageFormat.Png);
            pngStream.Position = 0;
            return true;
        }
        catch
        {
            pngStream.Dispose();
            pngStream = null!;
            return false;
        }
    }

    private static bool TryRasterizeSvg(string assetPath, MemoryStream pngStream)
    {
        try
        {
            using var svg = new SKSvg();
            var picture = svg.Load(assetPath);
            if (picture == null)
                return false;

            var bounds = picture.CullRect;
            var width = (int)Math.Max(1, Math.Ceiling(bounds.Width));
            var height = (int)Math.Max(1, Math.Ceiling(bounds.Height));

            using var bitmap = new SKBitmap(width, height);
            using var canvas = new SKCanvas(bitmap);
            canvas.Clear(SKColors.White);
            canvas.DrawPicture(picture);

            using var image = SKImage.FromBitmap(bitmap);
            using var data = image.Encode(SKEncodedImageFormat.Png, 100);
            if (data == null)
                return false;

            data.SaveTo(pngStream);
            pngStream.Position = 0;
            return true;
        }
        catch
        {
            pngStream.SetLength(0);
            return false;
        }
    }
}
