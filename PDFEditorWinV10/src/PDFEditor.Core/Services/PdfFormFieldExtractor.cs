using iText.Forms;
using iText.Forms.Fields;
using iText.Kernel.Geom;
using iText.Kernel.Pdf;
using iText.Kernel.Pdf.Annot;
using PDFEditor.Core.Models;

namespace PDFEditor.Core.Services;

public sealed class PdfFormFieldExtractor
{
    public IList<FormFieldModel> Extract(PdfDocument pdfDoc)
    {
        var fields = new List<FormFieldModel>();
        var acroForm = PdfAcroForm.GetAcroForm(pdfDoc, false);
        if (acroForm is null)
        {
            return fields;
        }

        var counter = 0;
        foreach (var entry in acroForm.GetAllFormFields())
        {
            var name = entry.Key;
            var field = entry.Value;
            if (field is null)
            {
                continue;
            }

            var fieldType = field.GetFormType()?.GetValue()?.TrimStart('/') ?? "Unknown";
            var pageIndex = -1;
            PdfBounds? bounds = null;

            foreach (var widget in field.GetWidgets())
            {
                if (widget is null)
                {
                    continue;
                }

                var page = widget.GetPage();
                if (page is not null)
                {
                    pageIndex = pdfDoc.GetPageNumber(page) - 1;
                }

                bounds = WidgetRectToBounds(widget.GetRectangle());
                break;
            }

            var value = field.GetValueAsString();
            bool? isChecked = null;

            if (field is PdfButtonFormField buttonField &&
                string.Equals(fieldType, "Btn", StringComparison.OrdinalIgnoreCase))
            {
                isChecked = IsCheckboxChecked(buttonField, value);
            }

            fields.Add(new FormFieldModel
            {
                Id = $"field-{counter++}",
                Name = name,
                FieldType = fieldType,
                PageIndex = pageIndex,
                Bounds = bounds,
                Value = value,
                OriginalValue = value,
                IsChecked = isChecked,
                OriginalIsChecked = isChecked
            });
        }

        return fields;
    }

    private static bool IsCheckboxChecked(PdfButtonFormField buttonField, string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        if (value.Equals("Off", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var states = buttonField.GetAppearanceStates();
        return states.Any(state =>
            state.Equals(value, StringComparison.OrdinalIgnoreCase) &&
            !state.Equals("Off", StringComparison.OrdinalIgnoreCase));
    }

    private static PdfBounds WidgetRectToBounds(PdfArray? rect)
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

    private static PdfBounds ToBounds(Rectangle? rect)
    {
        if (rect is null)
        {
            return new PdfBounds();
        }

        return new PdfBounds
        {
            Left = rect.GetX(),
            Bottom = rect.GetY(),
            Right = rect.GetRight(),
            Top = rect.GetTop()
        };
    }
}
