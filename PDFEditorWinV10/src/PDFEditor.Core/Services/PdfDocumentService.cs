using PDFEditor.Core.Models;

namespace PDFEditor.Core.Services;

public interface IPdfDocumentService
{
    bool IsEncrypted(string sourcePdfPath);
    EditorDocument Open(string sourcePdfPath, string? password = null, string? workingDirectory = null);
    void EnsurePageLoaded(EditorDocument document, int pageIndex);
    int SavePdf(EditorDocument document, string destinationPath);
    void SaveJson(EditorDocument document, string jsonPath);
    EditorDocument LoadJson(string jsonPath);
    int FindAndReplace(EditorDocument document, string searchText, string replacement, bool matchCase = false);
    int RunOcrOnPage(EditorDocument document, int pageIndex, string imagePath, double imageWidth, double imageHeight);
    int RunOcrOnAllPages(EditorDocument document, Func<int, PageImageInfo?> getPageImage);
    ExternalToolInfo GetTesseractInfo();
}

public sealed class PageImageInfo
{
    public required string ImagePath { get; init; }
    public required double Width { get; init; }
    public required double Height { get; init; }
}

public sealed class PdfDocumentService : IPdfDocumentService
{
    private readonly PdfJsonConversionService _conversionService = new();
    private readonly JsonDocumentSerializer _jsonSerializer = new();
    private readonly PdfTextReplaceService _textReplaceService = new();
    private readonly PdfPageOcrService _ocrService = new();
    private readonly IOcrEngine _ocrEngine = new TesseractCliOcrEngine();

    public bool IsEncrypted(string sourcePdfPath) => PdfEncryptionHelper.IsEncrypted(sourcePdfPath);

    public ExternalToolInfo GetTesseractInfo() => _ocrEngine.ToolInfo;

    public EditorDocument Open(string sourcePdfPath, string? password = null, string? workingDirectory = null)
    {
        if (!File.Exists(sourcePdfPath))
        {
            throw new FileNotFoundException("PDF file not found.", sourcePdfPath);
        }

        workingDirectory ??= Path.Combine(
            Path.GetTempPath(),
            "PDFEditorWinV10",
            Guid.NewGuid().ToString("N"));

        Directory.CreateDirectory(workingDirectory);

        var workingPdfPath = Path.Combine(workingDirectory, Path.GetFileName(sourcePdfPath));
        File.Copy(sourcePdfPath, workingPdfPath, overwrite: true);

        return _conversionService.ConvertPdfToDocument(sourcePdfPath, workingPdfPath, password, lazyLoadPages: true);
    }

    public void EnsurePageLoaded(EditorDocument document, int pageIndex) =>
        _conversionService.EnsurePageLoaded(document, pageIndex);

    public int SavePdf(EditorDocument document, string destinationPath)
    {
        foreach (var page in document.Pages)
        {
            if (!page.IsLoaded)
            {
                EnsurePageLoaded(document, page.Index);
            }
        }

        return _conversionService.ConvertDocumentToPdf(document, destinationPath);
    }

    public void SaveJson(EditorDocument document, string jsonPath)
    {
        foreach (var page in document.Pages.Where(p => !p.IsLoaded))
        {
            EnsurePageLoaded(document, page.Index);
        }

        _jsonSerializer.Save(document, jsonPath);
    }

    public EditorDocument LoadJson(string jsonPath) =>
        _jsonSerializer.Load(jsonPath);

    public int FindAndReplace(EditorDocument document, string searchText, string replacement, bool matchCase = false)
    {
        foreach (var page in document.Pages.Where(p => !p.IsLoaded))
        {
            EnsurePageLoaded(document, page.Index);
        }

        return _textReplaceService.ReplaceAll(document, searchText, replacement, matchCase);
    }

    public int RunOcrOnPage(EditorDocument document, int pageIndex, string imagePath, double imageWidth, double imageHeight)
    {
        EnsurePageLoaded(document, pageIndex);
        var page = document.Pages[pageIndex];
        var blocks = _ocrEngine.Recognize(imagePath, document.OcrLanguages);
        return _ocrService.ApplyOcrResults(page, blocks, imageWidth, imageHeight);
    }

    public int RunOcrOnAllPages(EditorDocument document, Func<int, PageImageInfo?> getPageImage)
    {
        var total = 0;

        for (var i = 0; i < document.Pages.Count; i++)
        {
            EnsurePageLoaded(document, i);
            var page = document.Pages[i];

            if (!PdfPageOcrService.IsLikelyScanned(page) && page.TextElements.Count > 0)
            {
                continue;
            }

            var image = getPageImage(i);
            if (image is null)
            {
                continue;
            }

            total += RunOcrOnPage(document, i, image.ImagePath, image.Width, image.Height);
        }

        return total;
    }
}
