using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;

namespace YOLO26V10
{
    internal static class ImageResultSaver
    {
        private const long JpegQuality = 92L;

        public static void Save(Bitmap bitmap, string filePath)
        {
            if (bitmap == null)
                throw new ArgumentNullException(nameof(bitmap));
            if (string.IsNullOrWhiteSpace(filePath))
                throw new ArgumentException("寃쎈줈媛 鍮꾩뼱 ?덉뒿?덈떎.", nameof(filePath));

            var full = Path.GetFullPath(filePath);
            var dir = Path.GetDirectoryName(full);
            if (!string.IsNullOrEmpty(dir))
                Directory.CreateDirectory(dir);

            var ext = (Path.GetExtension(full) ?? "").ToLowerInvariant();

            if (ext == ".jpg" || ext == ".jpeg")
            {
                var jpegCodec = ImageCodecInfo.GetImageEncoders()
                    .FirstOrDefault(c => c.FormatID == ImageFormat.Jpeg.Guid);
                if (jpegCodec != null)
                {
                    using (var ep = new EncoderParameters(1))
                    {
                        ep.Param[0] = new EncoderParameter(Encoder.Quality, JpegQuality);
                        bitmap.Save(full, jpegCodec, ep);
                    }

                    return;
                }
            }

            bitmap.Save(full, FormatFromExtension(ext));
        }

        private static ImageFormat FormatFromExtension(string ext)
        {
            switch (ext)
            {
                case ".png":
                    return ImageFormat.Png;
                case ".bmp":
                    return ImageFormat.Bmp;
                case ".gif":
                    return ImageFormat.Gif;
                case ".tif":
                case ".tiff":
                    return ImageFormat.Tiff;
                case ".jpg":
                case ".jpeg":
                default:
                    return ImageFormat.Jpeg;
            }
        }
    }
}

