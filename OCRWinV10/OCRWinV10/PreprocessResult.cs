using OCRWinV10.Ocr;

namespace OCRWinV10;

public sealed class PreprocessResult : IDisposable
{
    public PreprocessResult(Bitmap image, OcrBoxTransform transform)
    {
        Image = image;
        Transform = transform;
    }

    public Bitmap Image { get; }
    public OcrBoxTransform Transform { get; }

    public void Dispose() => Image.Dispose();
}
