using System.Diagnostics.CodeAnalysis;
using System.Drawing;
using FellowOakDicom.Imaging;

namespace YOLO11BrainV10.Services;

/// <summary>Loads brain CT slices from raster files or single-frame DICOM for YOLO input.</summary>
internal static class BrainCtSliceLoader
{
    private static readonly HashSet<string> DicomExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".dcm",
        ".dic",
        ".dicom",
    };

    public static bool IsProbablyDicomPath(string path) =>
        DicomExtensions.Contains(Path.GetExtension(path));

    public static bool TryLoad(string path, [NotNullWhen(true)] out Bitmap? bitmap, out string? error)
    {
        error = null;
        bitmap = null;
        FoDicomBootstrap.EnsureConfigured();

        try
        {
            if (IsProbablyDicomPath(path))
            {
                var dicomImage = new DicomImage(path);
                if (dicomImage.NumberOfFrames < 1)
                {
                    error = "DICOM에 이미지 프레임이 없습니다.";
                    return false;
                }

                using var rendered = dicomImage.RenderImage(0);
                bitmap = rendered.AsClonedBitmap();
                return true;
            }

            bitmap = new Bitmap(path);
            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            bitmap?.Dispose();
            bitmap = null;
            return false;
        }
    }
}
