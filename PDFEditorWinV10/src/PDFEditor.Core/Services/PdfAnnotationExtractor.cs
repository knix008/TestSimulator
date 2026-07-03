using iText.Kernel.Geom;
using iText.Kernel.Pdf;
using iText.Kernel.Pdf.Annot;
using PDFEditor.Core.Models;

namespace PDFEditor.Core.Services;

public sealed class PdfAnnotationExtractor
{
    public IList<AnnotationModel> ExtractPage(PdfPage page, int pageIndex)
    {
        var annotations = new List<AnnotationModel>();
        var counter = 0;

        foreach (var annotation in page.GetAnnotations())
        {
            if (annotation is null)
            {
                continue;
            }

            var subtype = annotation.GetSubtype()?.GetValue() ?? "Unknown";
            var refId = annotation.GetPdfObject()?.GetIndirectReference()?.ToString() ?? $"{pageIndex}-{counter}";
            var bounds = ToBounds(annotation.GetRectangle());

            var contents = annotation.GetContents()?.GetValue();
            var subject = annotation.GetPdfObject().GetAsString(PdfName.Subj)?.GetValue();

            annotations.Add(new AnnotationModel
            {
                Id = $"p{pageIndex}-ann{counter++}",
                PageIndex = pageIndex,
                Subtype = subtype.TrimStart('/'),
                PdfRefId = refId,
                Bounds = bounds,
                Contents = contents,
                OriginalContents = contents,
                Subject = subject,
                OriginalSubject = subject
            });
        }

        return annotations;
    }

    private static PdfBounds ToBounds(PdfArray? rect)
    {
        if (rect is null || rect.Size() < 4)
        {
            return new PdfBounds();
        }

        return new PdfBounds
        {
            Left = rect.GetAsNumber(0).DoubleValue(),
            Bottom = rect.GetAsNumber(1).DoubleValue(),
            Right = rect.GetAsNumber(2).DoubleValue(),
            Top = rect.GetAsNumber(3).DoubleValue()
        };
    }
}
