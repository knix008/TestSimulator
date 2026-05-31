namespace OCRWinV10.Ocr;

/// <summary>
/// OCR 입력 이미지 좌표 → 원본 이미지 좌표 변환 (균일 스케일 + 기울기 보정 역변환).
/// </summary>
public sealed record OcrBoxTransform(
    int OcrWidth,
    int OcrHeight,
    int OriginalWidth,
    int OriginalHeight,
    float DeskewDegrees)
{
    public static OcrBoxTransform Identity(Bitmap image) =>
        new(image.Width, image.Height, image.Width, image.Height, 0f);

    public static OcrBoxTransform FromSizes(
        int ocrWidth, int ocrHeight, int originalWidth, int originalHeight, float deskewDegrees = 0f) =>
        new(ocrWidth, ocrHeight, originalWidth, originalHeight, deskewDegrees);

    public RectangleF MapRectToOriginal(RectangleF rectInOcrSpace)
    {
        if (OcrWidth <= 0 || OcrHeight <= 0)
            return RectangleF.Empty;

        var corners = new[]
        {
            new PointF(rectInOcrSpace.Left, rectInOcrSpace.Top),
            new PointF(rectInOcrSpace.Right, rectInOcrSpace.Top),
            new PointF(rectInOcrSpace.Right, rectInOcrSpace.Bottom),
            new PointF(rectInOcrSpace.Left, rectInOcrSpace.Bottom)
        };

        var mapped = corners.Select(MapPointToOriginal).ToArray();
        var bounds = RectangleF.FromLTRB(
            mapped.Min(p => p.X),
            mapped.Min(p => p.Y),
            mapped.Max(p => p.X),
            mapped.Max(p => p.Y));

        return ClampToOriginal(bounds);
    }

    private PointF MapPointToOriginal(PointF ocrPoint)
    {
        float scaleX = (float)OriginalWidth / OcrWidth;
        float scaleY = (float)OriginalHeight / OcrHeight;

        if (Math.Abs(DeskewDegrees) < 0.01f)
            return new PointF(ocrPoint.X * scaleX, ocrPoint.Y * scaleY);

        var center = new PointF(OcrWidth / 2f, OcrHeight / 2f);
        var unskewed = RotateAround(ocrPoint, center, -DeskewDegrees);
        return new PointF(unskewed.X * scaleX, unskewed.Y * scaleY);
    }

    private static PointF RotateAround(PointF point, PointF center, float degrees)
    {
        float rad = degrees * MathF.PI / 180f;
        float cos = MathF.Cos(rad);
        float sin = MathF.Sin(rad);
        float dx = point.X - center.X;
        float dy = point.Y - center.Y;
        return new PointF(
            center.X + dx * cos - dy * sin,
            center.Y + dx * sin + dy * cos);
    }

    private RectangleF ClampToOriginal(RectangleF rect)
    {
        float maxW = OriginalWidth;
        float maxH = OriginalHeight;
        float left = Math.Clamp(rect.Left, 0, maxW);
        float top = Math.Clamp(rect.Top, 0, maxH);
        float right = Math.Clamp(rect.Right, 0, maxW);
        float bottom = Math.Clamp(rect.Bottom, 0, maxH);
        if (right <= left || bottom <= top)
            return RectangleF.Empty;
        return RectangleF.FromLTRB(left, top, right, bottom);
    }
}
