namespace PDFEditor.Core.Models;

public sealed class FormFieldModel
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required string FieldType { get; init; }
    public int PageIndex { get; init; } = -1;
    public PdfBounds? Bounds { get; set; }
    public string? Value { get; set; }
    public string? OriginalValue { get; set; }
    public bool? IsChecked { get; set; }
    public bool? OriginalIsChecked { get; set; }

    public bool IsCheckbox => FieldType.Equals("Btn", StringComparison.OrdinalIgnoreCase) ||
                              FieldType.Equals("Checkbox", StringComparison.OrdinalIgnoreCase);

    public bool IsModified =>
        !string.Equals(Value, OriginalValue, StringComparison.Ordinal) ||
        IsChecked != OriginalIsChecked;
}
