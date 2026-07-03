using System.Globalization;
using PDFEditor.Core.Models;

namespace PDFEditor.Core.Services;

public interface IOcrEngine
{
    ExternalToolInfo ToolInfo { get; }
    IReadOnlyList<OcrTextBlock> Recognize(string imagePath, string languages);
}

public sealed class TesseractCliOcrEngine : IOcrEngine
{
    public ExternalToolInfo ToolInfo { get; } = ExternalToolLocator.LocateTesseract();

    public IReadOnlyList<OcrTextBlock> Recognize(string imagePath, string languages)
    {
        if (!ToolInfo.IsAvailable)
        {
            throw new InvalidOperationException(
                "Tesseract OCR is not installed or not found on PATH. Install from https://github.com/tesseract-ocr/tesseract");
        }

        var startInfo = new System.Diagnostics.ProcessStartInfo
        {
            FileName = ToolInfo.ResolvedPath!,
            Arguments = $"\"{imagePath}\" stdout -l {languages} tsv",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = System.Diagnostics.Process.Start(startInfo)
                              ?? throw new InvalidOperationException("Failed to start Tesseract process.");

        var output = process.StandardOutput.ReadToEnd();
        var error = process.StandardError.ReadToEnd();
        process.WaitForExit();

        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException(
                $"Tesseract OCR failed (exit {process.ExitCode}): {error}".Trim());
        }

        return ParseTsv(output);
    }

    internal static List<OcrTextBlock> ParseTsv(string tsv)
    {
        var blocks = new List<OcrTextBlock>();
        var lines = tsv.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        if (lines.Length <= 1)
        {
            return blocks;
        }

        for (var i = 1; i < lines.Length; i++)
        {
            var columns = lines[i].Split('\t');
            if (columns.Length < 12)
            {
                continue;
            }

            if (!int.TryParse(columns[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out var level) || level != 5)
            {
                continue;
            }

            var text = columns[11].Trim();
            if (string.IsNullOrWhiteSpace(text))
            {
                continue;
            }

            if (!double.TryParse(columns[6], NumberStyles.Float, CultureInfo.InvariantCulture, out var left) ||
                !double.TryParse(columns[7], NumberStyles.Float, CultureInfo.InvariantCulture, out var top) ||
                !double.TryParse(columns[8], NumberStyles.Float, CultureInfo.InvariantCulture, out var width) ||
                !double.TryParse(columns[9], NumberStyles.Float, CultureInfo.InvariantCulture, out var height) ||
                !double.TryParse(columns[10], NumberStyles.Float, CultureInfo.InvariantCulture, out var confidence))
            {
                continue;
            }

            blocks.Add(new OcrTextBlock
            {
                Text = text,
                Confidence = confidence,
                ImageLeft = left,
                ImageTop = top,
                ImageWidth = width,
                ImageHeight = height
            });
        }

        return blocks;
    }
}
