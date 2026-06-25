using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using System.Text;

namespace HWP2DocWinV10.Export;

internal static class MarkdownDocxExporter
{
    public static void ExportPreviewHtml(string previewHtml, string outputPath)
    {
        using var document = WordprocessingDocument.Create(outputPath, WordprocessingDocumentType.Document);
        var mainPart = document.AddMainDocumentPart();
        mainPart.Document = new Document(new Body());

        const string altChunkId = "HWP2DocHtmlChunk";
        var chunkPart = mainPart.AddAlternativeFormatImportPart(
            AlternativeFormatImportPartType.Html,
            altChunkId);

        using (var stream = new MemoryStream())
        {
            using (var writer = new StreamWriter(stream, new UTF8Encoding(encoderShouldEmitUTF8Identifier: true), leaveOpen: true))
                writer.Write(previewHtml);
            stream.Position = 0;
            chunkPart.FeedData(stream);
        }

        mainPart.Document.Body!.AppendChild(new AltChunk { Id = altChunkId });
        mainPart.Document.Save();
    }
}
