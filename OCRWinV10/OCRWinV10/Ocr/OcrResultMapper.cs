using OpenCvSharp;
using Sdcb.PaddleOCR;

namespace OCRWinV10.Ocr;

public static class OcrResultMapper
{
    public static OcrResult FromPaddle(PaddleOcrResult result)
    {
        if (result.Regions.Length == 0)
            return new OcrResult("", []);

        const float lineMergeThreshold = 15f;

        var words = result.Regions
            .Select(r => new WordEntry(
                r.Text,
                RotatedRectToBounds(r.Rect),
                r.Rect.Center.Y))
            .Where(w => !string.IsNullOrWhiteSpace(w.Text))
            .OrderBy(w => w.CenterY)
            .ThenBy(w => w.Bounds.Left)
            .ToList();

        var lines = new List<OcrLine>();
        var current = new List<OcrWord>();
        float? currentLineY = null;

        foreach (var w in words)
        {
            if (currentLineY == null || Math.Abs(w.CenterY - currentLineY.Value) > lineMergeThreshold)
            {
                if (current.Count > 0)
                    lines.Add(BuildLine(current));

                current = [new OcrWord(w.Text, w.Bounds)];
                currentLineY = w.CenterY;
            }
            else
            {
                current.Add(new OcrWord(w.Text, w.Bounds));
            }
        }

        if (current.Count > 0)
            lines.Add(BuildLine(current));

        var text = string.Join(Environment.NewLine, lines.Select(l => l.Text));
        return new OcrResult(text, lines);
    }

    private static OcrLine BuildLine(List<OcrWord> words)
    {
        var ordered = words.OrderBy(w => w.BoundingRect.Left).ToList();
        var lineText = string.Join(" ", ordered.Select(w => w.Text));
        return new OcrLine(lineText, ordered);
    }

    private static RectangleF RotatedRectToBounds(RotatedRect rect)
    {
        var points = rect.Points();
        float minX = points.Min(p => p.X);
        float minY = points.Min(p => p.Y);
        float maxX = points.Max(p => p.X);
        float maxY = points.Max(p => p.Y);
        return RectangleF.FromLTRB(minX, minY, maxX, maxY);
    }

    private sealed record WordEntry(string Text, RectangleF Bounds, float CenterY);
}
