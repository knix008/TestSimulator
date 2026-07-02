using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Vml.Office;
using DocumentFormat.OpenXml.Wordprocessing;
using V = DocumentFormat.OpenXml.Vml;

namespace MyWorkspace.Win;

internal static class WordPackageEmbedder
{
    private static int _nextObjectId = 1_299_573_545;

    private static readonly byte[] PackageIconPng = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAADElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");

    public static void AppendEmbeddedFile(
        MainDocumentPart mainPart,
        Body body,
        string assetPath,
        string displayLabel)
    {
        if (string.IsNullOrWhiteSpace(assetPath) || !File.Exists(assetPath))
        {
            body.Append(new Paragraph(new Run(new Text(displayLabel) { Space = SpaceProcessingModeValues.Preserve })));
            return;
        }

        var extension = Path.GetExtension(assetPath);
        if (PageAssetStore.IsSupportedImageExtension(extension))
            return;

        var packagePart = mainPart.AddEmbeddedPackagePart(ResolvePackageContentType(extension), extension);
        using (var stream = File.OpenRead(assetPath))
            packagePart.FeedData(stream);

        var packageRelationshipId = mainPart.GetIdOfPart(packagePart);

        var iconPart = mainPart.AddImagePart(ImagePartType.Png);
        iconPart.FeedData(new MemoryStream(PackageIconPng, writable: false));
        var iconRelationshipId = mainPart.GetIdOfPart(iconPart);

        var shapeId = $"_x0000_i{1024 + _nextObjectId % 9000}";
        var objectId = $"_{_nextObjectId++}";

        body.Append(new Paragraph(new Run(
            new EmbeddedObject(
                new V.Shape(
                    new V.ImageData
                    {
                        Title = displayLabel,
                        RelationshipId = iconRelationshipId
                    })
                {
                    Id = shapeId,
                    Style = "width:32pt;height:32pt"
                },
                new OleObject
                {
                    Type = OleValues.Embed,
                    ProgId = "Package",
                    ShapeId = shapeId,
                    DrawAspect = OleDrawAspectValues.Icon,
                    ObjectId = objectId,
                    Id = packageRelationshipId
                }),
            new Text(" " + displayLabel) { Space = SpaceProcessingModeValues.Preserve })));
    }

    private static string ResolvePackageContentType(string extension) =>
        extension.ToLowerInvariant() switch
        {
            ".pdf" => "application/pdf",
            ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            ".zip" => "application/zip",
            ".txt" => "text/plain",
            ".csv" => "text/csv",
            ".json" => "application/json",
            ".xml" => "application/xml",
            _ => "application/octet-stream"
        };
}
