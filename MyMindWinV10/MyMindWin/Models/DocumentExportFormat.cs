namespace MyMindWin.Models
{
    public enum DocumentExportFormat
    {
        Markdown,
        Word,
        Pdf
    }

    public static class DocumentExportFormatExtensions
    {
        public static string GetDisplayName(this DocumentExportFormat format) => format switch
        {
            DocumentExportFormat.Markdown => "Markdown",
            DocumentExportFormat.Word => "Word",
            DocumentExportFormat.Pdf => "PDF",
            _ => format.ToString()
        };

        public static string GetExtension(this DocumentExportFormat format) => format switch
        {
            DocumentExportFormat.Markdown => ".md",
            DocumentExportFormat.Word => ".docx",
            DocumentExportFormat.Pdf => ".pdf",
            _ => ".txt"
        };

        public static string GetSaveFileFilter(this DocumentExportFormat format) => format switch
        {
            DocumentExportFormat.Markdown => "Markdown (*.md)|*.md",
            DocumentExportFormat.Word => "Word 문서 (*.docx)|*.docx",
            DocumentExportFormat.Pdf => "PDF (*.pdf)|*.pdf",
            _ => "All Files (*.*)|*.*"
        };

        public static DocumentExportFormat? FromExtension(string? extension)
        {
            if (string.IsNullOrWhiteSpace(extension))
                return null;

            return extension.TrimStart('.').ToLowerInvariant() switch
            {
                "md" or "markdown" => DocumentExportFormat.Markdown,
                "docx" => DocumentExportFormat.Word,
                "pdf" => DocumentExportFormat.Pdf,
                _ => null
            };
        }
    }
}
