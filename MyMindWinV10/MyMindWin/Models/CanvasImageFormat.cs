namespace MyMindWin.Models
{
    public enum CanvasImageFormat
    {
        Png,
        Jpeg,
        Gif,
        Webp,
        Avif
    }

    public static class CanvasImageFormatExtensions
    {
        public static bool SupportsTransparency(this CanvasImageFormat format) =>
            format is CanvasImageFormat.Png or CanvasImageFormat.Gif
                or CanvasImageFormat.Webp or CanvasImageFormat.Avif;

        public static string GetDisplayName(this CanvasImageFormat format) => format switch
        {
            CanvasImageFormat.Png => "PNG",
            CanvasImageFormat.Jpeg => "JPEG",
            CanvasImageFormat.Gif => "GIF",
            CanvasImageFormat.Webp => "WebP",
            CanvasImageFormat.Avif => "AVIF",
            _ => format.ToString()
        };

        public static string GetExtension(this CanvasImageFormat format) => format switch
        {
            CanvasImageFormat.Png => ".png",
            CanvasImageFormat.Jpeg => ".jpg",
            CanvasImageFormat.Gif => ".gif",
            CanvasImageFormat.Webp => ".webp",
            CanvasImageFormat.Avif => ".avif",
            _ => ".png"
        };

        public static CanvasImageFormat? FromExtension(string? extension)
        {
            if (string.IsNullOrWhiteSpace(extension))
                return null;

            return extension.Trim().TrimStart('.').ToLowerInvariant() switch
            {
                "png" => CanvasImageFormat.Png,
                "jpg" or "jpeg" => CanvasImageFormat.Jpeg,
                "gif" => CanvasImageFormat.Gif,
                "webp" => CanvasImageFormat.Webp,
                "avif" => CanvasImageFormat.Avif,
                _ => null
            };
        }
    }
}
