namespace PDFEditor.Core.Models;

public sealed class EditorDocument
{
    public const int SchemaVersion = 4;

    public required int Version { get; init; }
    public required string SourcePdfPath { get; init; }
    public required string WorkingPdfPath { get; init; }
    public PdfMetadataModel? Metadata { get; init; }
    public bool LazyImages { get; init; }
    public bool IsEncrypted { get; set; }
    public string? Password { get; set; }
    public string OcrLanguages { get; set; } = "eng+kor";
    public IList<FontModel> Fonts { get; init; } = new List<FontModel>();
    public IList<PageModel> Pages { get; init; } = new List<PageModel>();
    public IList<FormFieldModel> FormFields { get; init; } = new List<FormFieldModel>();
    public IList<TextEditRecord> PendingEdits { get; init; } = new List<TextEditRecord>();

    public IReadOnlyList<PageMetadata> PageMetadata =>
        Pages.Select(p => p.ToMetadata()).ToList();

    public bool IsDirty =>
        Pages.SelectMany(p => p.TextElements).Any(e => e.Text != e.OriginalText) ||
        Pages.SelectMany(p => p.ImageElements).Any(i => i.IsModified) ||
        Pages.SelectMany(p => p.Annotations).Any(a => a.IsModified) ||
        FormFields.Any(f => f.IsModified) ||
        PendingEdits.Count > 0;
}
