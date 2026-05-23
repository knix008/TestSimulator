using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using System.Text;

namespace EasyMDV10;

internal static class MarkdownDocxExporter
{
    /// <summary>
    /// 미리보기와 동일한 HTML을 Word 문서로 저장합니다.
    /// </summary>
    public static void ExportPreviewHtml(string previewHtml, string outputPath)
    {
        using var document = WordprocessingDocument.Create(outputPath, WordprocessingDocumentType.Document);
        var mainPart = document.AddMainDocumentPart();
        mainPart.Document = new Document(new Body());

        const string altChunkId = "EasyMDHtmlChunk";
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
