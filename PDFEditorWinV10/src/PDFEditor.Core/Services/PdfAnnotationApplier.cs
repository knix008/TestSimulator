using iText.Kernel.Pdf;
using iText.Kernel.Pdf.Annot;
using PDFEditor.Core.Models;

namespace PDFEditor.Core.Services;

public sealed class PdfAnnotationApplier
{
    public int ApplyFromDocument(PdfDocument pdfDoc, EditorDocument document)
    {
        var modified = document.Pages
            .SelectMany(page => page.Annotations)
            .Where(annotation => annotation.IsModified)
            .ToList();

        if (modified.Count == 0)
        {
            return 0;
        }

        var applied = 0;

        foreach (var group in modified.GroupBy(annotation => annotation.PageIndex))
        {
            var pageNumber = group.Key + 1;
            if (pageNumber < 1 || pageNumber > pdfDoc.GetNumberOfPages())
            {
                continue;
            }

            var page = pdfDoc.GetPage(pageNumber);
            var pageAnnotations = page.GetAnnotations();

            foreach (var model in group)
            {
                var annotation = FindAnnotation(pageAnnotations, model.PdfRefId);
                if (annotation is null)
                {
                    continue;
                }

                if (model.Contents is not null)
                {
                    annotation.SetContents(new PdfString(model.Contents));
                }

                if (model.Subject is not null)
                {
                    annotation.GetPdfObject().Put(PdfName.Subj, new PdfString(model.Subject));
                }

                applied++;
            }
        }

        return applied;
    }

    private static PdfAnnotation? FindAnnotation(IList<PdfAnnotation> annotations, string pdfRefId)
    {
        foreach (var annotation in annotations)
        {
            var refId = annotation.GetPdfObject()?.GetIndirectReference()?.ToString();
            if (string.Equals(refId, pdfRefId, StringComparison.Ordinal))
            {
                return annotation;
            }
        }

        return null;
    }

    public static void ResetOriginalState(EditorDocument document)
    {
        foreach (var annotation in document.Pages.SelectMany(page => page.Annotations))
        {
            annotation.OriginalContents = annotation.Contents;
            annotation.OriginalSubject = annotation.Subject;
        }
    }
}
