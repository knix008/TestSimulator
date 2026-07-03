using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Gif;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.PixelFormats;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace MyProject.Models
{
    public enum GanttImageFormat
    {
        Png,
        Jpeg,
        Gif,
        WebP
    }

    public static class GanttImageExporter
    {
        public static bool SupportsTransparentBackground(GanttImageFormat format) =>
            format is GanttImageFormat.Png or GanttImageFormat.WebP;

        public static GanttImageFormat FormatFromExtension(string path)
        {
            string ext = Path.GetExtension(path).ToLowerInvariant();
            return ext switch
            {
                ".png" => GanttImageFormat.Png,
                ".jpg" or ".jpeg" => GanttImageFormat.Jpeg,
                ".gif" => GanttImageFormat.Gif,
                ".webp" => GanttImageFormat.WebP,
                _ => GanttImageFormat.Png
            };
        }

        public static void Save(Bitmap bitmap, string path, GanttImageFormat format, bool transparentBackground)
        {
            bool useTransparency = transparentBackground && SupportsTransparentBackground(format);

            if (format == GanttImageFormat.Png)
            {
                if (useTransparency)
                    bitmap.Save(path, ImageFormat.Png);
                else
                {
                    using var flat = Flatten(bitmap, System.Drawing.Color.White);
                    flat.Save(path, ImageFormat.Png);
                }
                return;
            }

            if (format == GanttImageFormat.Jpeg)
            {
                using var flat = Flatten(bitmap, System.Drawing.Color.White);
                flat.Save(path, ImageFormat.Jpeg);
                return;
            }

            if (format == GanttImageFormat.Gif)
            {
                using var flat = useTransparency ? bitmap : Flatten(bitmap, System.Drawing.Color.White);
                flat.Save(path, ImageFormat.Gif);
                return;
            }

            using var image = ToImageSharp(bitmap);
            switch (format)
            {
                case GanttImageFormat.WebP:
                    image.Save(path, new WebpEncoder
                    {
                        FileFormat = WebpFileFormatType.Lossless,
                        NearLossless = true
                    });
                    break;
                case GanttImageFormat.Gif:
                    image.Save(path, new GifEncoder());
                    break;
                case GanttImageFormat.Jpeg:
                    image.Save(path, new JpegEncoder { Quality = 92 });
                    break;
            }
        }

        private static Bitmap Flatten(Bitmap source, System.Drawing.Color background)
        {
            var flat = new Bitmap(source.Width, source.Height, PixelFormat.Format24bppRgb);
            using var g = Graphics.FromImage(flat);
            g.Clear(background);
            g.DrawImage(source, 0, 0);
            return flat;
        }

        private static SixLabors.ImageSharp.Image<Rgba32> ToImageSharp(Bitmap bitmap)
        {
            var rect = new System.Drawing.Rectangle(0, 0, bitmap.Width, bitmap.Height);
            var data = bitmap.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            try
            {
                int width = bitmap.Width;
                int height = bitmap.Height;
                int stride = Math.Abs(data.Stride);
                byte[] pixels = new byte[width * height * 4];
                for (int y = 0; y < height; y++)
                    Marshal.Copy(data.Scan0 + y * stride, pixels, y * width * 4, width * 4);

                return SixLabors.ImageSharp.Image.LoadPixelData<Bgra32>(pixels, width, height).CloneAs<Rgba32>();
            }
            finally
            {
                bitmap.UnlockBits(data);
            }
        }
    }
}
