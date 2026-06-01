using System;
using System.IO;

namespace MyMindWin.Services
{
    internal static class MindMapExportImageHelper
    {
        public static byte[]? TryDecode(string? base64)
        {
            if (string.IsNullOrWhiteSpace(base64))
                return null;

            try
            {
                return Convert.FromBase64String(base64.Trim());
            }
            catch
            {
                return null;
            }
        }

        public static string NormalizeMime(string? mime) =>
            string.IsNullOrWhiteSpace(mime) ? "image/png" : mime.Trim().ToLowerInvariant();

        public static string GetImageExtension(string mime) => mime switch
        {
            "image/jpeg" => ".jpg",
            "image/gif" => ".gif",
            "image/bmp" => ".bmp",
            "image/webp" => ".webp",
            _ => ".png"
        };
    }
}
