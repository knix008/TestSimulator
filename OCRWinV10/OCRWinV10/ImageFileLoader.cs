using System.Runtime.InteropServices.WindowsRuntime;
using OpenCvSharp;
using OpenCvSharp.Extensions;
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;

namespace OCRWinV10;

/// <summary>
/// GDI+가 지원하지 않는 WebP 등 포함, 다양한 이미지 형식을 Bitmap으로 로드합니다.
/// </summary>
public static class ImageFileLoader
{
    public static readonly string[] SupportedExtensions =
    [
        ".jpg", ".jpeg", ".jpe", ".jfif", ".pjpeg", ".pjp",
        ".png", ".bmp", ".dib",
        ".tif", ".tiff",
        ".gif", ".webp", ".avif", ".heic", ".heif"
    ];

    public static readonly string OpenFileDialogFilter =
        "지원 파일|" + string.Join(";", SupportedExtensions.Select(e => "*" + e)) + ";*.pdf|" +
        "이미지 파일|" + string.Join(";", SupportedExtensions.Select(e => "*" + e)) + "|" +
        "PDF 파일|*.pdf|" +
        "모든 파일|*.*";

    private static readonly HashSet<string> GdiPreferred = new(StringComparer.OrdinalIgnoreCase)
    {
        ".bmp", ".gif", ".jpg", ".jpeg", ".png", ".tif", ".tiff"
    };

    public static bool IsSupportedImage(string filePath) =>
        SupportedExtensions.Contains(Path.GetExtension(filePath));

    public static Bitmap Load(string filePath)
    {
        if (!File.Exists(filePath))
            throw new FileNotFoundException("파일을 찾을 수 없습니다.", filePath);

        var ext = Path.GetExtension(filePath);

        if (GdiPreferred.Contains(ext))
        {
            try
            {
                return new Bitmap(filePath);
            }
            catch
            {
                // WebP 등 확장자 오인·손상 파일은 OpenCV/WIC로 재시도
            }
        }

        try
        {
            return LoadViaOpenCv(filePath);
        }
        catch
        {
            return LoadViaWindowsCodec(filePath);
        }
    }

    private static Bitmap LoadViaOpenCv(string filePath)
    {
        using var mat = Cv2.ImRead(filePath, ImreadModes.Color);
        if (mat.Empty())
            throw new InvalidOperationException($"이미지를 디코딩할 수 없습니다: {Path.GetFileName(filePath)}");

        var bitmap = BitmapConverter.ToBitmap(mat);
        if (bitmap.PixelFormat == System.Drawing.Imaging.PixelFormat.Format8bppIndexed)
        {
            var clone = new Bitmap(bitmap.Width, bitmap.Height, System.Drawing.Imaging.PixelFormat.Format24bppRgb);
            using (var g = Graphics.FromImage(clone))
                g.DrawImage(bitmap, 0, 0);
            bitmap.Dispose();
            return clone;
        }

        return bitmap;
    }

    private static Bitmap LoadViaWindowsCodec(string filePath)
    {
        var bytes = File.ReadAllBytes(filePath);

        using var input = new InMemoryRandomAccessStream();
        using (var output = input.GetOutputStreamAt(0))
        {
            var writer = new DataWriter(output);
            writer.WriteBytes(bytes);
            writer.StoreAsync().AsTask().GetAwaiter().GetResult();
            writer.DetachStream();
        }

        input.Seek(0);
        var decoder = BitmapDecoder.CreateAsync(input).AsTask().GetAwaiter().GetResult();
        using var softwareBitmap = decoder.GetSoftwareBitmapAsync(
            BitmapPixelFormat.Bgra8,
            BitmapAlphaMode.Premultiplied).AsTask().GetAwaiter().GetResult();

        using var encoded = new InMemoryRandomAccessStream();
        var encoder = BitmapEncoder.CreateAsync(BitmapEncoder.PngEncoderId, encoded)
            .AsTask().GetAwaiter().GetResult();
        encoder.SetSoftwareBitmap(softwareBitmap);
        encoder.FlushAsync().AsTask().GetAwaiter().GetResult();

        encoded.Seek(0);
        using var netStream = encoded.AsStreamForRead();
        return new Bitmap(netStream);
    }
}
