using System.Drawing.Imaging;
using OpenCvSharp;
using OpenCvSharp.Extensions;

namespace OCRWinV10;

/// <summary>
/// OCR 결과 저장 시 원본 파일 확장자를 따릅니다. PDF 원본은 박스 이미지를 PNG로 저장합니다.
/// </summary>
public static class ResultSaveHelper
{
    private const string PdfExtension = ".pdf";
    private const string DefaultImageExtension = ".png";

    /// <summary>
    /// 박스 이미지 저장 확장자. PDF·미지원 형식은 PNG.
    /// </summary>
    public static string GetBoxesImageExtension(string? sourceFilePath)
    {
        if (string.IsNullOrWhiteSpace(sourceFilePath))
            return DefaultImageExtension;

        var ext = Path.GetExtension(sourceFilePath).ToLowerInvariant();
        if (ext == PdfExtension)
            return DefaultImageExtension;

        // 저장 API로 다시 쓰기 어려운 형식은 PNG로 (원본이 PDF일 때와 동일하게 이미지로 저장)
        if (ext is ".heic" or ".heif" or ".avif")
            return DefaultImageExtension;

        if (CanSaveAsImageExtension(ext))
            return NormalizeImageExtension(ext);

        return DefaultImageExtension;
    }

    public static string BuildBoxesFileName(string baseName, string? sourceFilePath) =>
        baseName + "_boxes" + GetBoxesImageExtension(sourceFilePath);

    public static string GetBoxesSaveFileDialogFilter(string extension)
    {
        extension = NormalizeImageExtension(extension);
        return extension switch
        {
            ".jpg" => "JPEG 이미지|*.jpg|PNG 이미지|*.png|모든 파일|*.*",
            ".jpeg" => "JPEG 이미지|*.jpeg|PNG 이미지|*.png|모든 파일|*.*",
            ".png" => "PNG 이미지|*.png|JPEG 이미지|*.jpg;*.jpeg|모든 파일|*.*",
            ".bmp" => "비트맵 이미지|*.bmp|PNG 이미지|*.png|모든 파일|*.*",
            ".gif" => "GIF 이미지|*.gif|PNG 이미지|*.png|모든 파일|*.*",
            ".tif" or ".tiff" => "TIFF 이미지|*.tiff;*.tif|PNG 이미지|*.png|모든 파일|*.*",
            ".webp" => "WebP 이미지|*.webp|PNG 이미지|*.png|모든 파일|*.*",
            ".avif" => "AVIF 이미지|*.avif|PNG 이미지|*.png|모든 파일|*.*",
            ".heic" or ".heif" => "HEIC 이미지|*.heic;*.heif|PNG 이미지|*.png|모든 파일|*.*",
            _ => "PNG 이미지|*.png|JPEG 이미지|*.jpg;*.jpeg|모든 파일|*.*"
        };
    }

    public static void SaveBitmap(Image image, string path)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();

        if (ext == ".webp")
        {
            SaveViaOpenCv(image, path);
            return;
        }

        var format = ext switch
        {
            ".jpg" or ".jpeg" or ".jpe" or ".jfif" or ".pjpeg" or ".pjp" => ImageFormat.Jpeg,
            ".bmp" or ".dib" => ImageFormat.Bmp,
            ".gif" => ImageFormat.Gif,
            ".tif" or ".tiff" => ImageFormat.Tiff,
            _ => ImageFormat.Png
        };

        if (format == ImageFormat.Jpeg && image is Bitmap bmp)
        {
            using var clone = new Bitmap(bmp.Width, bmp.Height, PixelFormat.Format24bppRgb);
            using (var g = Graphics.FromImage(clone))
                g.DrawImage(bmp, 0, 0);
            clone.Save(path, format);
            return;
        }

        image.Save(path, format);
    }

    private static void SaveViaOpenCv(Image image, string path)
    {
        using var bitmap = image as Bitmap ?? new Bitmap(image);
        using var mat = BitmapConverter.ToMat(bitmap);
        if (!Cv2.ImWrite(path, mat))
            throw new InvalidOperationException($"이미지를 저장할 수 없습니다: {Path.GetFileName(path)}");
    }

    private static bool CanSaveAsImageExtension(string ext) =>
        ext == PdfExtension
        || ImageFileLoader.SupportedExtensions.Contains(ext)
        || ext is ".jpg" or ".jpeg" or ".jpe" or ".jfif" or ".pjpeg" or ".pjp" or ".dib";

    private static string NormalizeImageExtension(string ext) => ext switch
    {
        ".jpe" or ".jfif" or ".pjpeg" or ".pjp" => ".jpg",
        ".dib" => ".bmp",
        _ => ext
    };
}
