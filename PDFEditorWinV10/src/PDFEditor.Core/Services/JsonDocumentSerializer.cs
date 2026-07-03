using System.Text.Json;
using System.Text.Json.Serialization;
using PDFEditor.Core.Models;

namespace PDFEditor.Core.Services;

public sealed class JsonDocumentSerializer
{
    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public void Save(EditorDocument document, string jsonPath)
    {
        var dto = ToDto(document);
        var json = JsonSerializer.Serialize(dto, Options);
        File.WriteAllText(jsonPath, json);
    }

    public EditorDocument Load(string jsonPath)
    {
        var json = File.ReadAllText(jsonPath);
        using var doc = JsonDocument.Parse(json);
        var version = doc.RootElement.TryGetProperty("version", out var v) ? v.GetInt32() : 1;
        var dto = JsonSerializer.Deserialize<EditorDocumentDto>(json, Options)
                  ?? throw new InvalidOperationException("Invalid JSON document.");

        return version < 2 ? MigrateFromV1(dto) : FromDto(dto);
    }

    private static EditorDocumentDto ToDto(EditorDocument document) =>
        new()
        {
            Version = document.Version,
            SourcePdfPath = document.SourcePdfPath,
            WorkingPdfPath = document.WorkingPdfPath,
            LazyImages = document.LazyImages,
            IsEncrypted = document.IsEncrypted,
            OcrLanguages = document.OcrLanguages,
            Metadata = document.Metadata is null
                ? null
                : new PdfMetadataDto
                {
                    Title = document.Metadata.Title,
                    Author = document.Metadata.Author,
                    Subject = document.Metadata.Subject,
                    Creator = document.Metadata.Creator,
                    Producer = document.Metadata.Producer
                },
            Fonts = document.Fonts.Select(font => new FontDto
            {
                Id = font.Id,
                Name = font.Name,
                Embedded = font.Embedded,
                Encoding = font.Encoding
            }).ToList(),
            FormFields = document.FormFields.Select(field => new FormFieldDto
            {
                Id = field.Id,
                Name = field.Name,
                FieldType = field.FieldType,
                PageIndex = field.PageIndex,
                Bounds = field.Bounds is null ? null : PdfBounds.Clone(field.Bounds),
                Value = field.Value,
                OriginalValue = field.OriginalValue,
                IsChecked = field.IsChecked,
                OriginalIsChecked = field.OriginalIsChecked
            }).ToList(),
            Pages = document.Pages.Select(page => new PageDto
            {
                Index = page.Index,
                Width = page.Width,
                Height = page.Height,
                Rotation = page.Rotation,
                IsLoaded = page.IsLoaded,
                TextElements = page.TextElements.Select(element => new TextElementDto
                {
                    Id = element.Id,
                    PageIndex = element.PageIndex,
                    Text = element.Text,
                    OriginalText = element.OriginalText,
                    Bounds = element.Bounds,
                    FontName = element.FontName,
                    FontRefId = element.FontRefId,
                    FontSize = element.FontSize,
                    ContentStreamIndex = element.ContentStreamIndex
                }).ToList(),
                ImageElements = page.ImageElements.Select(image => new ImageElementDto
                {
                    Id = image.Id,
                    PageIndex = image.PageIndex,
                    XObjectName = image.XObjectName,
                    Bounds = PdfBounds.Clone(image.Bounds),
                    OriginalBounds = PdfBounds.Clone(image.OriginalBounds),
                    Transform = image.Transform,
                    OriginalTransform = image.OriginalTransform,
                    ReplacementImagePath = image.ReplacementImagePath,
                    ContentStreamIndex = image.ContentStreamIndex
                }).ToList(),
                Annotations = page.Annotations.Select(annotation => new AnnotationDto
                {
                    Id = annotation.Id,
                    PageIndex = annotation.PageIndex,
                    Subtype = annotation.Subtype,
                    PdfRefId = annotation.PdfRefId,
                    Bounds = PdfBounds.Clone(annotation.Bounds),
                    Contents = annotation.Contents,
                    OriginalContents = annotation.OriginalContents,
                    Subject = annotation.Subject,
                    OriginalSubject = annotation.OriginalSubject
                }).ToList(),
                ContentStreams = page.ContentStreams.Select(stream => new ContentStreamDto
                {
                    Index = stream.Index,
                    DataBase64 = stream.DataBase64,
                    Preserved = stream.Preserved
                }).ToList()
            }).ToList(),
            PendingEdits = document.PendingEdits.Select(edit => new TextEditRecordDto
            {
                ElementId = edit.ElementId,
                PageIndex = edit.PageIndex,
                OriginalText = edit.OriginalText,
                NewText = edit.NewText
            }).ToList()
        };

    private static EditorDocument FromDto(EditorDocumentDto dto)
    {
        var pages = dto.Pages.Select(page => new PageModel
        {
            Index = page.Index,
            Width = page.Width,
            Height = page.Height,
            Rotation = page.Rotation,
            IsLoaded = page.IsLoaded,
            TextElements = page.TextElements.Select(element => new TextElement
            {
                Id = element.Id,
                PageIndex = element.PageIndex,
                Text = element.Text,
                OriginalText = element.OriginalText,
                Bounds = element.Bounds,
                FontName = element.FontName,
                FontRefId = element.FontRefId,
                FontSize = element.FontSize,
                ContentStreamIndex = element.ContentStreamIndex
            }).ToList(),
            ImageElements = page.ImageElements.Select(image => new ImageElementModel
            {
                Id = image.Id,
                PageIndex = image.PageIndex,
                XObjectName = image.XObjectName,
                Bounds = PdfBounds.Clone(image.Bounds),
                OriginalBounds = PdfBounds.Clone(
                    image.OriginalBounds.Width > 0 ? image.OriginalBounds : image.Bounds),
                Transform = image.Transform.Length > 0 ? image.Transform : [1, 0, 0, 1, 0, 0],
                OriginalTransform = image.OriginalTransform.Length > 0
                    ? image.OriginalTransform
                    : image.Transform,
                ReplacementImagePath = image.ReplacementImagePath,
                ContentStreamIndex = image.ContentStreamIndex
            }).ToList(),
            Annotations = page.Annotations.Select(annotation => new AnnotationModel
            {
                Id = annotation.Id,
                PageIndex = annotation.PageIndex,
                Subtype = annotation.Subtype,
                PdfRefId = annotation.PdfRefId,
                Bounds = PdfBounds.Clone(annotation.Bounds),
                Contents = annotation.Contents,
                OriginalContents = annotation.OriginalContents,
                Subject = annotation.Subject,
                OriginalSubject = annotation.OriginalSubject
            }).ToList(),
            ContentStreams = page.ContentStreams.Select(stream => new ContentStreamModel
            {
                Index = stream.Index,
                DataBase64 = stream.DataBase64,
                Preserved = stream.Preserved
            }).ToList()
        }).ToList();

        return new EditorDocument
        {
            Version = dto.Version,
            SourcePdfPath = dto.SourcePdfPath ?? string.Empty,
            WorkingPdfPath = dto.WorkingPdfPath ?? string.Empty,
            LazyImages = dto.LazyImages,
            IsEncrypted = dto.IsEncrypted,
            Password = null,
            OcrLanguages = string.IsNullOrWhiteSpace(dto.OcrLanguages) ? "eng+kor" : dto.OcrLanguages,
            Metadata = dto.Metadata is null
                ? null
                : new PdfMetadataModel
                {
                    Title = dto.Metadata.Title,
                    Author = dto.Metadata.Author,
                    Subject = dto.Metadata.Subject,
                    Creator = dto.Metadata.Creator,
                    Producer = dto.Metadata.Producer
                },
            Fonts = dto.Fonts.Select(font => new FontModel
            {
                Id = font.Id,
                Name = font.Name,
                Embedded = font.Embedded,
                Encoding = font.Encoding
            }).ToList(),
            FormFields = dto.FormFields.Select(field => new FormFieldModel
            {
                Id = field.Id,
                Name = field.Name,
                FieldType = field.FieldType,
                PageIndex = field.PageIndex,
                Bounds = field.Bounds is null ? null : PdfBounds.Clone(field.Bounds),
                Value = field.Value,
                OriginalValue = field.OriginalValue,
                IsChecked = field.IsChecked,
                OriginalIsChecked = field.OriginalIsChecked
            }).ToList(),
            Pages = pages,
            PendingEdits = dto.PendingEdits.Select(edit => new TextEditRecord
            {
                ElementId = edit.ElementId,
                PageIndex = edit.PageIndex,
                OriginalText = edit.OriginalText,
                NewText = edit.NewText
            }).ToList()
        };
    }

    private static EditorDocument MigrateFromV1(EditorDocumentDto dto) =>
        FromDto(new EditorDocumentDto
        {
            Version = EditorDocument.SchemaVersion,
            SourcePdfPath = dto.SourcePdfPath,
            WorkingPdfPath = dto.WorkingPdfPath,
            Pages = dto.Pages,
            PendingEdits = dto.PendingEdits
        });
}
