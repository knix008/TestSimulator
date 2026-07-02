namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private ToolStripMenuItem? menuSavePageAsMarkdown;

    private void EnsurePageExportMenuItems()
    {
        if (menuSavePageAsMarkdown != null)
            return;

        menuSavePageAsMarkdown = new ToolStripMenuItem
        {
            Name = "menuSavePageAsMarkdown",
            Image = IconAssets.Load(16, "page")
        };
        menuSavePageAsMarkdown.Click += menuSavePageAsMarkdown_Click;

        var insertIndex = menuFile.DropDownItems.IndexOf(menuSavePage) + 1;
        menuFile.DropDownItems.Insert(insertIndex, menuSavePageAsMarkdown);
    }

    private async void menuSavePageAsMarkdown_Click(object? sender, EventArgs e) =>
        await SaveCurrentPageAsMarkdownAsync();

    private async Task SaveCurrentPageAsMarkdownAsync()
    {
        if (!SessionContext.IsLoggedIn)
            return;

        if (!await EnsurePageCreatedAsync() || !_currentPageId.HasValue || _editor == null)
        {
            MessageBox.Show(
                Localization.Get(K.SelectPageToSave),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        if (!await SaveCurrentPageAsync(refreshTree: false, force: true))
            return;

        await SavePageAsMarkdownAsync(_currentPageId.Value, await _editor.GetMarkdownAsync(_currentPageId));
    }

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

    private async Task SavePageAsMarkdownAsync(int pageId, string content)
    {
        var title = GetPageTitleForExport(
            _currentPageId == pageId ? _currentPageTitle : AppConfig.Services.Pages.GetById(SessionContext.CurrentUser, pageId)?.Title);

        using var saveDialog = new SaveFileDialog
        {
            Title = Localization.Get(K.MenuSavePageAsMarkdown),
            Filter = BuildExportFileFilter(PageExportFormat.Markdown),
            DefaultExt = "md",
            FileName = PageDocumentBuilder.SanitizeFileName(title) + ".md"
        };
        DialogPathHelper.ApplyExportDirectory(saveDialog);

        if (saveDialog.ShowDialog(this) != DialogResult.OK)
            return;

        DialogPathHelper.RememberExportPath(saveDialog.FileName);

        try
        {
            PageExportService.ExportMarkdown(title, content, saveDialog.FileName, pageId);
            MessageBox.Show(
                FormatExportSavedMessage(K.SaveMarkdownSucceeded, saveDialog.FileName),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.SaveMarkdownFailed), ex);
        }
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
