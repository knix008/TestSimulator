using System;
using System.IO;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using MyMindWin.Models;
using NeoSolve.ImageSharp.AVIF;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SkiaSharp;

namespace MyMindWin.Services
{
    public static class CanvasImageExporter
    {
        public const string SaveFileFilter =
            "PNG (투명 가능)|*.png|" +
            "JPEG|*.jpg;*.jpeg|" +
            "GIF (투명 가능)|*.gif|" +
            "WebP (투명 가능)|*.webp|" +
            "AVIF (투명 가능)|*.avif";

        public static CanvasImageExportOptions CreateOptionsForFormat(
            CanvasImageFormat format,
            bool includeHeading,
            string? heading = null)
        {
            string? resolvedHeading = includeHeading && !string.IsNullOrWhiteSpace(heading)
                ? heading.Trim()
                : null;

            return new()
            {
                Format = format,
                TransparentBackground = format.SupportsTransparency(),
                Scale = 2.0,
                IncludeHeading = includeHeading && resolvedHeading != null,
                Heading = resolvedHeading
            };
        }

        public static void Save(BitmapSource bitmap, string filePath, CanvasImageExportOptions options)
        {
            if (bitmap == null) throw new ArgumentNullException(nameof(bitmap));
            if (string.IsNullOrWhiteSpace(filePath)) throw new ArgumentException("파일 경로가 비어 있습니다.", nameof(filePath));

            switch (options.Format)
            {
                case CanvasImageFormat.Webp:
                    SaveAsWebp(bitmap, filePath, options);
                    break;
                case CanvasImageFormat.Avif:
                    SaveAsAvif(bitmap, filePath, options);
                    break;
                default:
                    SaveWithWpfEncoder(bitmap, filePath, options);
                    break;
            }
        }

        private static void SaveWithWpfEncoder(BitmapSource bitmap, string filePath, CanvasImageExportOptions options)
        {
            BitmapSource output = bitmap;

            if (!options.TransparentBackground || options.Format == CanvasImageFormat.Jpeg)
                output = FlattenToOpaque(bitmap, options.OpaqueBackgroundColor);

            BitmapEncoder encoder = options.Format switch
            {
                CanvasImageFormat.Jpeg => new JpegBitmapEncoder { QualityLevel = ClampQuality(options.JpegQuality) },
                CanvasImageFormat.Gif => new GifBitmapEncoder(),
                _ => new PngBitmapEncoder()
            };

            encoder.Frames.Add(BitmapFrame.Create(output));
            using var stream = File.Create(filePath);
            encoder.Save(stream);
        }

        private static void SaveAsWebp(BitmapSource bitmap, string filePath, CanvasImageExportOptions options)
        {
            using var skBitmap = BitmapSourceToSkBitmap(bitmap, options);
            using var image = SKImage.FromBitmap(skBitmap);
            using var data = image.Encode(SKEncodedImageFormat.Webp, ClampQuality(options.WebpQuality));
            if (data == null)
                throw new InvalidOperationException("WebP 인코딩에 실패했습니다.");

            using var stream = File.OpenWrite(filePath);
            data.SaveTo(stream);
        }

        private static void SaveAsAvif(BitmapSource bitmap, string filePath, CanvasImageExportOptions options)
        {
            using Image<Rgba32> image = BitmapSourceToImageSharpImage(bitmap, options);
            image.Save(filePath, new AVIFEncoder());
        }

        private static SKBitmap BitmapSourceToSkBitmap(BitmapSource source, CanvasImageExportOptions options)
        {
            var bgra = EnsureBgra32(source);
            int width = bgra.PixelWidth;
            int height = bgra.PixelHeight;
            int stride = width * 4;
            var pixels = new byte[stride * height];
            bgra.CopyPixels(pixels, stride, 0);

            var info = new SKImageInfo(width, height, SKColorType.Bgra8888, SKAlphaType.Premul);
            var skBitmap = new SKBitmap(info);
            System.Runtime.InteropServices.Marshal.Copy(
                pixels, 0, skBitmap.GetPixels(), pixels.Length);

            if (!options.TransparentBackground)
            {
                var flattened = new SKBitmap(info);
                using (var canvas = new SKCanvas(flattened))
                {
                    canvas.Clear(ToSkColor(options.OpaqueBackgroundColor));
                    canvas.DrawBitmap(skBitmap, 0, 0);
                }

                skBitmap.Dispose();
                return flattened;
            }

            return skBitmap;
        }

        private static Image<Rgba32> BitmapSourceToImageSharpImage(BitmapSource source, CanvasImageExportOptions options)
        {
            var bgra = EnsureBgra32(source);
            int width = bgra.PixelWidth;
            int height = bgra.PixelHeight;
            int stride = width * 4;
            var pixels = new byte[stride * height];
            bgra.CopyPixels(pixels, stride, 0);
            var image = Image.LoadPixelData<Rgba32>(pixels, width, height);

            if (!options.TransparentBackground)
                FlattenOntoBackground(image, options.OpaqueBackgroundColor);

            return image;
        }

        private static BitmapSource EnsureBgra32(BitmapSource source)
        {
            if (source.Format == PixelFormats.Bgra32)
                return source;

            var converted = new FormatConvertedBitmap(source, PixelFormats.Bgra32, null, 0);
            converted.Freeze();
            return converted;
        }

        private static BitmapSource FlattenToOpaque(BitmapSource source, System.Windows.Media.Color background)
        {
            var visual = new DrawingVisual();
            using (var dc = visual.RenderOpen())
            {
                dc.DrawRectangle(new SolidColorBrush(background), null,
                    new Rect(0, 0, source.PixelWidth, source.PixelHeight));
                dc.DrawImage(source, new Rect(0, 0, source.PixelWidth, source.PixelHeight));
            }

            var flattened = new RenderTargetBitmap(
                source.PixelWidth,
                source.PixelHeight,
                source.DpiX,
                source.DpiY,
                PixelFormats.Pbgra32);
            flattened.Render(visual);
            flattened.Freeze();
            return flattened;
        }

        private static void FlattenOntoBackground(Image<Rgba32> image, System.Windows.Media.Color background)
        {
            var bg = new Rgba32(background.R, background.G, background.B, 255);
            image.ProcessPixelRows(accessor =>
            {
                for (int y = 0; y < accessor.Height; y++)
                {
                    var row = accessor.GetRowSpan(y);
                    for (int x = 0; x < row.Length; x++)
                    {
                        ref var pixel = ref row[x];
                        byte a = pixel.A;
                        if (a >= 255) continue;

                        float alpha = a / 255f;
                        float inv = 1f - alpha;
                        pixel.R = (byte)(pixel.R * alpha + bg.R * inv);
                        pixel.G = (byte)(pixel.G * alpha + bg.G * inv);
                        pixel.B = (byte)(pixel.B * alpha + bg.B * inv);
                        pixel.A = 255;
                    }
                }
            });
        }

        private static SKColor ToSkColor(System.Windows.Media.Color color) => new(color.R, color.G, color.B, color.A);

        private static int ClampQuality(int quality) => Math.Clamp(quality, 1, 100);
    }
}
