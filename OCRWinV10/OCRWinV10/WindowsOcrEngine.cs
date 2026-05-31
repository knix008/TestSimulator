using Windows.Globalization;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage.Streams;
using System.Drawing.Imaging;

namespace OCRWinV10;

public class WindowsOcrEngine
{
    private OcrEngine? _engine;

    public string? CurrentLanguageTag { get; private set; }

    public static IReadOnlyList<string> GetAvailableLanguageTags() =>
        OcrEngine.AvailableRecognizerLanguages
            .Select(l => l.LanguageTag)
            .ToList();

    public static bool IsLanguageAvailable(string tag) =>
        OcrEngine.AvailableRecognizerLanguages
            .Any(l => l.LanguageTag.StartsWith(tag, StringComparison.OrdinalIgnoreCase));

    public bool Initialize(string languageTag)
    {
        var lang = new Language(languageTag);
        _engine = OcrEngine.TryCreateFromLanguage(lang);
        CurrentLanguageTag = _engine != null ? languageTag : null;
        return _engine != null;
    }

    public async Task<OcrResult> RecognizeAsync(Bitmap bitmap, CancellationToken cancellationToken = default)
    {
        if (_engine == null)
            throw new InvalidOperationException("OCR 엔진이 초기화되지 않았습니다.");

        cancellationToken.ThrowIfCancellationRequested();

        var softwareBitmap = await ToSoftwareBitmapAsync(bitmap);
        using (softwareBitmap)
        {
            var winResult = await _engine.RecognizeAsync(softwareBitmap);

            cancellationToken.ThrowIfCancellationRequested();

            var lines = winResult.Lines
                .Select(l => new OcrLine(
                    l.Text,
                    l.Words.Select(w => new OcrWord(
                        w.Text,
                        new RectangleF(
                            (float)w.BoundingRect.X, (float)w.BoundingRect.Y,
                            (float)w.BoundingRect.Width, (float)w.BoundingRect.Height)))
                    .ToList()))
                .ToList();

            return new OcrResult(winResult.Text, lines);
        }
    }

    /// <summary>
    /// PNG 대신 무손실 BMP로 전달해 손글씨 획 손실을 줄입니다.
    /// </summary>
    private static async Task<SoftwareBitmap> ToSoftwareBitmapAsync(Bitmap bitmap)
    {
        using var ms = new MemoryStream();
        bitmap.Save(ms, ImageFormat.Bmp);
        var bytes = ms.ToArray();

        using var ras = new InMemoryRandomAccessStream();
        using var outputStream = ras.GetOutputStreamAt(0);
        var writer = new DataWriter(outputStream);
        writer.WriteBytes(bytes);
        await writer.StoreAsync();
        writer.DetachStream();

        ras.Seek(0);
        var decoder = await BitmapDecoder.CreateAsync(ras);
        return await decoder.GetSoftwareBitmapAsync(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied);
    }
}
