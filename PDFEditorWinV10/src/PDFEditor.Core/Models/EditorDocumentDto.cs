namespace PDFEditor.Core.Models;

public sealed class EditorDocumentDto
{
    public int Version { get; init; } = EditorDocument.SchemaVersion;
    public string? SourcePdfPath { get; init; }
    public string? WorkingPdfPath { get; init; }
    public bool LazyImages { get; init; }
    public bool IsEncrypted { get; init; }
    public string OcrLanguages { get; init; } = "eng+kor";
    public PdfMetadataDto? Metadata { get; init; }
    public List<FontDto> Fonts { get; init; } = [];
    public List<FormFieldDto> FormFields { get; init; } = [];
    public List<PageDto> Pages { get; init; } = [];
    public List<TextEditRecordDto> PendingEdits { get; init; } = [];
}

public sealed class PdfMetadataDto
{
    public string? Title { get; init; }
    public string? Author { get; init; }
    public string? Subject { get; init; }
    public string? Creator { get; init; }
    public string? Producer { get; init; }
}

public sealed class FontDto
{
    public string Id { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public bool Embedded { get; init; }
    public string? Encoding { get; init; }
}

public sealed class PageDto
{
    public int Index { get; init; }
    public double Width { get; init; }
    public double Height { get; init; }
    public int Rotation { get; init; }
    public bool IsLoaded { get; init; } = true;
    public List<TextElementDto> TextElements { get; init; } = [];
    public List<ImageElementDto> ImageElements { get; init; } = [];
    public List<AnnotationDto> Annotations { get; init; } = [];
    public List<ContentStreamDto> ContentStreams { get; init; } = [];
}

public sealed class TextElementDto
{
    public string Id { get; init; } = string.Empty;
    public int PageIndex { get; init; }
    public string Text { get; init; } = string.Empty;
    public string OriginalText { get; init; } = string.Empty;
    public PdfBounds Bounds { get; init; } = new();
    public string? FontName { get; init; }
    public string? FontRefId { get; init; }
    public double FontSize { get; init; }
    public int ContentStreamIndex { get; init; }
}

public sealed class ImageElementDto
{
    public string Id { get; init; } = string.Empty;
    public int PageIndex { get; init; }
    public string XObjectName { get; init; } = string.Empty;
    public PdfBounds Bounds { get; init; } = new();
    public PdfBounds OriginalBounds { get; init; } = new();
    public double[] Transform { get; init; } = [];
    public double[] OriginalTransform { get; init; } = [];
    public string? ReplacementImagePath { get; init; }
    public int ContentStreamIndex { get; init; }
}

public sealed class AnnotationDto
{
    public string Id { get; init; } = string.Empty;
    public int PageIndex { get; init; }
    public string Subtype { get; init; } = string.Empty;
    public string PdfRefId { get; init; } = string.Empty;
    public PdfBounds Bounds { get; init; } = new();
    public string? Contents { get; init; }
    public string? OriginalContents { get; init; }
    public string? Subject { get; init; }
    public string? OriginalSubject { get; init; }
}

public sealed class FormFieldDto
{
    public string Id { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string FieldType { get; init; } = string.Empty;
    public int PageIndex { get; init; } = -1;
    public PdfBounds? Bounds { get; init; }
    public string? Value { get; init; }
    public string? OriginalValue { get; init; }
    public bool? IsChecked { get; init; }
    public bool? OriginalIsChecked { get; init; }
}

public sealed class ContentStreamDto
{
    public int Index { get; init; }
    public string DataBase64 { get; init; } = string.Empty;
    public bool Preserved { get; init; } = true;
}

public sealed class TextEditRecordDto
{
    public string ElementId { get; init; } = string.Empty;
    public int PageIndex { get; init; }
    public string OriginalText { get; init; } = string.Empty;
    public string NewText { get; init; } = string.Empty;
}
