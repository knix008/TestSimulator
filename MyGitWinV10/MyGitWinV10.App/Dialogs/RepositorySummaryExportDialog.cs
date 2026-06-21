using MyGitWinV10.App.Services;

namespace MyGitWinV10.App.Dialogs;

public static class RepositorySummaryExportDialog
{
    public static bool TryPickExportPath(
        IWin32Window owner,
        RepositorySummary summary,
        string format,
        out string? filePath)
    {
        string extension = format switch
        {
            "pdf" => ".pdf",
            "docx" => ".docx",
            "md" => ".md",
            _ => ".txt"
        };

        using var dialog = new SaveFileDialog
        {
            Title = "Export Repository Summary",
            Filter = format switch
            {
                "pdf" => "PDF document (*.pdf)|*.pdf",
                "docx" => "Word document (*.docx)|*.docx",
                "md" => "Markdown document (*.md)|*.md",
                _ => "All files (*.*)|*.*"
            },
            FileName = $"{summary.RepositoryName}-summary{extension}",
            DefaultExt = extension.TrimStart('.'),
            AddExtension = true,
            OverwritePrompt = true
        };

        if (dialog.ShowDialog(owner) != DialogResult.OK)
        {
            filePath = null;
            return false;
        }

        filePath = dialog.FileName;
        return true;
    }
}
