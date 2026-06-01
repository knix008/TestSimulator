using System;
using System.IO;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace MyMindWin.Controls
{
    internal static class NodeImageHelper
    {
        public const int MaxFileBytes = 3 * 1024 * 1024;

        public static bool TryReadImageFile(string path, out string base64, out string mimeType, out string errorMessage)
        {
            base64 = string.Empty;
            mimeType = "image/png";
            errorMessage = string.Empty;

            try
            {
                var info = new FileInfo(path);
                if (!info.Exists)
                {
                    errorMessage = "파일을 찾을 수 없습니다.";
                    return false;
                }

                if (info.Length > MaxFileBytes)
                {
                    errorMessage = $"이미지는 {MaxFileBytes / (1024 * 1024)}MB 이하여야 합니다.";
                    return false;
                }

                var bytes = File.ReadAllBytes(path);
                mimeType = GetMimeFromPath(path);
                base64 = Convert.ToBase64String(bytes);
                return true;
            }
            catch (Exception ex)
            {
                errorMessage = ex.Message;
                return false;
            }
        }

        public static BitmapImage? CreateBitmap(string? base64)
        {
            if (string.IsNullOrWhiteSpace(base64))
                return null;

            try
            {
                var bytes = Convert.FromBase64String(base64.Trim());
                using var stream = new MemoryStream(bytes);
                var image = new BitmapImage();
                image.BeginInit();
                image.StreamSource = stream;
                image.CacheOption = BitmapCacheOption.OnLoad;
                image.EndInit();
                image.Freeze();
                return image;
            }
            catch
            {
                return null;
            }
        }

        public static string GetMimeFromPath(string path) =>
            Path.GetExtension(path).ToLowerInvariant() switch
            {
                ".jpg" or ".jpeg" => "image/jpeg",
                ".gif" => "image/gif",
                ".bmp" => "image/bmp",
                ".webp" => "image/webp",
                _ => "image/png"
            };
    }
}
