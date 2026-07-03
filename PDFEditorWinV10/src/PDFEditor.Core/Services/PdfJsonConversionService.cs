using iText.Kernel.Pdf;
using PDFEditor.Core.Models;

namespace PDFEditor.Core.Services;

/// <summary>
/// Stirling-PDF style PDF ↔ JSON conversion service.
/// Preserves content streams for lossless round-trip of non-edited content.
/// </summary>
public sealed class PdfJsonConversionService
{
    private readonly PdfTextExtractor _extractor = new();
    private readonly PdfAnnotationExtractor _annotationExtractor = new();
    private readonly PdfFormFieldExtractor _formFieldExtractor = new();
    private readonly PdfTextApplier _textApplier = new();
    private readonly PdfImageApplier _imageApplier = new();
    private readonly PdfAnnotationApplier _annotationApplier = new();
    private readonly PdfFormFieldApplier _formFieldApplier = new();

    public PageModel ConvertPageToModel(PdfPage page, int pageIndex)
    {
        var pageSize = page.GetPageSize();
        var (textElements, imageElements) = _extractor.ExtractPage(page, pageIndex);
        var annotations = _annotationExtractor.ExtractPage(page, pageIndex);
        var streamBytes = PdfContentStreamReader.ReadPageStreams(page);

        var contentStreams = streamBytes
            .Select((data, index) => new ContentStreamModel
            {
                Index = index,
                DataBase64 = PdfContentStreamReader.ToBase64(data),
                Preserved = true
            })
            .ToList();

        return new PageModel
        {
            Index = pageIndex,
            Width = pageSize.GetWidth(),
            Height = pageSize.GetHeight(),
            Rotation = page.GetRotation(),
            IsLoaded = true,
            TextElements = textElements.ToList(),
            ImageElements = imageElements.ToList(),
            Annotations = annotations.ToList(),
            ContentStreams = contentStreams
        };
    }

    public EditorDocument ConvertPdfToDocument(
        string sourcePdfPath,
        string workingPdfPath,
        string? password = null,
        bool lazyLoadPages = true)
    {
        using var reader = PdfEncryptionHelper.OpenReader(workingPdfPath, password);
        using var pdfDoc = new PdfDocument(reader);

        var metadata = ExtractMetadata(pdfDoc);
        var fonts = PdfFontExtractor.ExtractDocumentFonts(pdfDoc);
        var formFields = _formFieldExtractor.Extract(pdfDoc);
        var pageCount = pdfDoc.GetNumberOfPages();
        var pages = new List<PageModel>();

        for (var i = 1; i <= pageCount; i++)
        {
            var pageIndex = i - 1;
            var page = pdfDoc.GetPage(i);

            if (lazyLoadPages && pageIndex > 0)
            {
                var pageSize = page.GetPageSize();
                pages.Add(new PageModel
                {
                    Index = pageIndex,
                    Width = pageSize.GetWidth(),
                    Height = pageSize.GetHeight(),
                    Rotation = page.GetRotation(),
                    IsLoaded = false
                });
            }
            else
            {
                pages.Add(ConvertPageToModel(page, pageIndex));
            }
        }

        return new EditorDocument
        {
            Version = EditorDocument.SchemaVersion,
            SourcePdfPath = Path.GetFullPath(sourcePdfPath),
            WorkingPdfPath = workingPdfPath,
            Metadata = metadata,
            LazyImages = true,
            IsEncrypted = PdfEncryptionHelper.IsEncrypted(workingPdfPath),
            Password = password,
            Fonts = fonts,
            FormFields = formFields,
            Pages = pages
        };
    }

    public void EnsurePageLoaded(EditorDocument document, int pageIndex)
    {
        if (pageIndex < 0 || pageIndex >= document.Pages.Count)
        {
            return;
        }

        var page = document.Pages[pageIndex];
        if (page.IsLoaded)
        {
            return;
        }

        using var reader = PdfEncryptionHelper.OpenReader(document.WorkingPdfPath, document.Password);
        using var pdfDoc = new PdfDocument(reader);
        var pdfPage = pdfDoc.GetPage(pageIndex + 1);
        var loaded = ConvertPageToModel(pdfPage, pageIndex);

        page.IsLoaded = true;
        foreach (var item in loaded.TextElements)
        {
            page.TextElements.Add(item);
        }

        foreach (var item in loaded.ImageElements)
        {
            page.ImageElements.Add(item);
        }

        foreach (var item in loaded.Annotations)
        {
            page.Annotations.Add(item);
        }

        foreach (var item in loaded.ContentStreams)
        {
            page.ContentStreams.Add(item);
        }
    }

    public int ConvertDocumentToPdf(EditorDocument document, string destinationPath)
    {
        var tempPath = Path.Combine(
            Path.GetDirectoryName(document.WorkingPdfPath)!,
            $"export_{Guid.NewGuid():N}.pdf");

        try
        {
            using (var reader = PdfEncryptionHelper.OpenReader(document.WorkingPdfPath, document.Password))
            using (var writer = PdfEncryptionHelper.CreateWriter(tempPath, document))
            using (var pdfDoc = new PdfDocument(reader, writer))
            {
                var textApplied = _textApplier.ApplyFromDocument(pdfDoc, document);
                var imageApplied = _imageApplier.ApplyFromDocument(pdfDoc, document);
                var annotationApplied = _annotationApplier.ApplyFromDocument(pdfDoc, document);
                var formApplied = _formFieldApplier.ApplyFromDocument(pdfDoc, document);
                pdfDoc.Close();

                File.Copy(tempPath, destinationPath, overwrite: true);
                File.Copy(tempPath, document.WorkingPdfPath, overwrite: true);
                PdfTextApplier.ResetOriginalText(document);
                PdfImageApplier.ResetOriginalState(document);
                PdfAnnotationApplier.ResetOriginalState(document);
                PdfFormFieldApplier.ResetOriginalState(document);
                document.PendingEdits.Clear();
                return textApplied + imageApplied + annotationApplied + formApplied;
            }
        }
        finally
        {
            if (File.Exists(tempPath))
            {
                File.Delete(tempPath);
            }
        }
    }

    public int ConvertPartialPagesToPdf(EditorDocument document, string destinationPath, IReadOnlyList<int> changedPageIndexes)
    {
        if (changedPageIndexes.Count == 0)
        {
            File.Copy(document.WorkingPdfPath, destinationPath, overwrite: true);
            return 0;
        }

        return ConvertDocumentToPdf(document, destinationPath);
    }

    private static PdfMetadataModel ExtractMetadata(PdfDocument pdfDoc)
    {
        var info = pdfDoc.GetDocumentInfo();
        return new PdfMetadataModel
        {
            Title = info.GetTitle(),
            Author = info.GetAuthor(),
            Subject = info.GetSubject(),
            Creator = info.GetCreator(),
            Producer = info.GetProducer()
        };
    }
}
