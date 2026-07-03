namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private ToolStripMenuItem? menuExport;
    private ToolStripMenuItem? menuExportPage;
    private ToolStripMenuItem? menuExportWorkspace;

    private void EnsurePageExportMenuItems()
    {
        if (menuExport != null)
            return;

        menuExportPage = new ToolStripMenuItem
        {
            Name = "menuExportPage",
            Image = IconAssets.Load(16, "export")
        };
        menuExportPage.Click += menuExportPage_Click;

        menuExportWorkspace = new ToolStripMenuItem
        {
            Name = "menuExportWorkspace",
            Image = IconAssets.Load(16, "export")
        };
        menuExportWorkspace.Click += menuExportWorkspace_Click;

        menuExport = new ToolStripMenuItem
        {
            Name = "menuExport",
            Image = IconAssets.Load(16, "export")
        };
        menuExport.DropDownItems.Add(menuExportPage);
        menuExport.DropDownItems.Add(menuExportWorkspace);

        var insertIndex = menuFile.DropDownItems.IndexOf(menuSavePage) + 1;
        menuFile.DropDownItems.Insert(insertIndex, menuExport);
    }

    private async void menuExportPage_Click(object? sender, EventArgs e) =>
        await ExportCurrentPageAsync();

    private async Task ExportPageAsync(int pageId)
    {
        if (!SessionContext.IsLoggedIn)
            return;

        using var formatDialog = new ExportPageForm();
        if (formatDialog.ShowDialog(this) != DialogResult.OK)
            return;

        string title;
        string content;

        if (_currentPageId == pageId && _editor != null)
        {
            if (!await SaveCurrentPageAsync(refreshTree: false, force: true))
                return;

            content = await _editor.GetMarkdownAsync(_currentPageId);
            title = GetPageTitleForExport(_currentPageTitle);
        }
        else
        {
            var page = AppConfig.Services.Pages.GetById(SessionContext.CurrentUser, pageId);
            if (page == null)
            {
                MessageBox.Show(
                    Localization.Get(K.SelectPageToSave),
                    L.AppName,
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                return;
            }

            title = GetPageTitleForExport(page.Title);
            content = page.Content;
        }

        var format = formatDialog.SelectedFormat;
        var extension = format switch
        {
            PageExportFormat.Word => ".docx",
            PageExportFormat.Pdf => ".pdf",
            _ => ".md"
        };

        using var saveDialog = new SaveFileDialog
        {
            Title = Localization.Get(K.ExportPageTitle),
            Filter = BuildExportFileFilter(format),
            DefaultExt = extension.TrimStart('.'),
            FileName = PageDocumentBuilder.SanitizeFileName(title) + extension
        };
        DialogPathHelper.ApplyExportDirectory(saveDialog);

        if (saveDialog.ShowDialog(this) != DialogResult.OK)
            return;

        DialogPathHelper.RememberExportPath(saveDialog.FileName);

        try
        {
            var outputPath = saveDialog.FileName;

            switch (format)
            {
                case PageExportFormat.Markdown:
                    PageExportService.ExportMarkdown(title, content, outputPath, pageId);
                    break;
                case PageExportFormat.Word:
                    PageExportService.ExportWord(title, content, outputPath, _pipeline, pageId);
                    break;
                case PageExportFormat.Pdf:
                    await PageExportService.ExportPdfAsync(title, content, outputPath, _pipeline, pageId);
                    break;
            }

            MessageBox.Show(
                FormatExportSavedMessage(K.ExportSucceeded, outputPath),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.ExportFailed), ex);
        }
    }

    private async Task ExportCurrentPageAsync()
    {
        if (!await EnsurePageCreatedAsync() || !_currentPageId.HasValue)
        {
            MessageBox.Show(
                Localization.Get(K.SelectPageToSave),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        await ExportPageAsync(_currentPageId.Value);
    }

    private static string FormatExportSavedMessage(string messageKey, string outputPath)
    {
        var fileName = Path.GetFileName(outputPath);
        var directory = Path.GetDirectoryName(outputPath) ?? string.Empty;
        return Localization.Format(messageKey, fileName, directory);
    }

    private string GetPageTitleForExport(string? title)
    {
        var trimmed = title?.Trim() ?? string.Empty;
        return string.IsNullOrEmpty(trimmed)
            ? Localization.Get(K.UntitledPageTitle)
            : trimmed;
    }

    private static string BuildExportFileFilter(PageExportFormat format)
    {
        return format switch
        {
            PageExportFormat.Word =>
                $"{Localization.Get(K.WordFileFilterLabel)}|*.docx",
            PageExportFormat.Pdf =>
                $"{Localization.Get(K.PdfFileFilterLabel)}|*.pdf",
            _ =>
                $"{Localization.Get(K.MarkdownFileFilterLabel)}|*.md"
        };
    }
}
