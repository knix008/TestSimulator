using iText.Forms;
using iText.Forms.Fields;
using iText.Kernel.Pdf;
using PDFEditor.Core.Models;

namespace PDFEditor.Core.Services;

public sealed class PdfFormFieldApplier
{
    public int ApplyFromDocument(PdfDocument pdfDoc, EditorDocument document)
    {
        var modified = document.FormFields.Where(field => field.IsModified).ToList();
        if (modified.Count == 0)
        {
            return 0;
        }

        var acroForm = PdfAcroForm.GetAcroForm(pdfDoc, true);
        if (acroForm is null)
        {
            return 0;
        }

        var applied = 0;

        foreach (var model in modified)
        {
            var field = acroForm.GetField(model.Name);
            if (field is null)
            {
                continue;
            }

            if (field is PdfButtonFormField buttonField && model.IsChecked.HasValue)
            {
                SetCheckboxValue(buttonField, model.IsChecked.Value);
                applied++;
                continue;
            }

            if (model.Value is not null)
            {
                field.SetValue(model.Value);
                applied++;
            }
        }

        return applied;
    }

    private static void SetCheckboxValue(PdfButtonFormField buttonField, bool isChecked)
    {
        if (!isChecked)
        {
            buttonField.SetValue("Off");
            return;
        }

        var onState = buttonField.GetAppearanceStates()
            .FirstOrDefault(state => !state.Equals("Off", StringComparison.OrdinalIgnoreCase));

        buttonField.SetValue(onState ?? "Yes");
    }

    public static void ResetOriginalState(EditorDocument document)
    {
        foreach (var field in document.FormFields)
        {
            field.OriginalValue = field.Value;
            field.OriginalIsChecked = field.IsChecked;
        }
    }
}
