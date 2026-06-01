using MyMindWin.Models;

namespace MyMindWin.Services
{
    public static class MindMapDocumentExporter
    {
        public const string CombinedSaveFileFilter =
            "Markdown (*.md)|*.md|Word 문서 (*.docx)|*.docx|PDF (*.pdf)|*.pdf|모든 파일 (*.*)|*.*";

        public static void Export(
            MindMapNode root,
            string title,
            string filePath,
            DocumentExportFormat format,
            MindMapExportOptions? options = null)
        {
            options ??= new MindMapExportOptions();
            var safeTitle = string.IsNullOrWhiteSpace(title) ? "마인드맵" : title.Trim();

            var resolvedFormat = DocumentExportFormatExtensions.FromExtension(System.IO.Path.GetExtension(filePath))
                                 ?? format;

            switch (resolvedFormat)
            {
                case DocumentExportFormat.Markdown:
                    MindMapMarkdownExporter.Export(root, safeTitle, filePath, options);
                    break;
                case DocumentExportFormat.Word:
                    MindMapWordExporter.Export(root, safeTitle, filePath, options);
                    break;
                case DocumentExportFormat.Pdf:
                    MindMapPdfExporter.Export(root, safeTitle, filePath, options);
                    break;
                default:
                    throw new System.NotSupportedException($"지원하지 않는 형식입니다: {resolvedFormat}");
            }
        }
    }
}
