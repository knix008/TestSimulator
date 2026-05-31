namespace OCRWinV10;

public record OcrWord(string Text, RectangleF BoundingRect);
public record OcrLine(string Text, IReadOnlyList<OcrWord> Words);
public record OcrResult(string Text, IReadOnlyList<OcrLine> Lines);

public enum PreprocessMode
{
    None,
    Auto,
    Handwriting
}
