using MyWorkspace.Core.Models;
using MyWorkspace.Data;

namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private string _currentPageTitle = string.Empty;
    private OfflinePageContext? _offlinePageContext;

    private void InitializeEditor()
    {
        webViewEditor.DefaultBackgroundColor = AppTheme.EditorBackground;
        webViewEditor.ImeMode = ImeMode.NoControl;
        UpdateEditorEmptySurface();

        _editor = new WebViewEditorController(webViewEditor);
        _editor.ContentChanged += OnEditorContentChanged;
        _editor.CaretMoved += OnEditorCaretMoved;
        _editor.ContextMenuRequested += OnEditorContextMenuRequested;
        _editor.OpenRequested += OnEditorOpenRequested;
        _editor.ConfigureFileDrop(
            HandleEditorFilesDroppedAsync,
            () => SessionContext.IsLoggedIn
                  && (_currentPageId.HasValue || _draftWorkspaceId.HasValue)
                  && CanEditActivePage(),
            pnlEditorHost);
        _editor.ConfigureImageDataDrop(HandleEditorImageDataDroppedAsync);
        _editor.ConfigurePasteHtmlClone(ClonePastedEditorHtml);
    }

    private string? ClonePastedEditorHtml(string html)
    {
        if (!_currentPageId.HasValue)
            return html;

        return PageAssetStore.CloneEmbeddedPageAssetHtml(html, _currentPageId.Value);
    }

    private void UpdateEditorEmptySurface()
    {
        var hasPage = SessionContext.IsLoggedIn && (_currentPageId.HasValue || _draftWorkspaceId.HasValue);
        pnlEditorEmptySurface.BackColor = AppTheme.EditorBackground;
        pnlEditorEmptySurface.Visible = !hasPage;
        webViewEditor.Visible = hasPage;

        if (!hasPage)
            pnlEditorEmptySurface.BringToFront();
        else
            webViewEditor.BringToFront();
    }

    private void OnEditorOpenRequested(string href)
    {
        try
        {
            if (EditorResourceOpener.TryOpen(href))
                return;

            MessageBox.Show(
                Localization.Get(K.OpenResourceFailed),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.OpenResourceFailed), ex);
        }
    }

    private void OnEditorContextMenuRequested(Point location)
    {
        if (!SessionContext.IsLoggedIn)
            return;

        if (!_currentPageId.HasValue && !_draftWorkspaceId.HasValue)
            return;

        if (_ctxEditor == null && _ctxEditorImage == null)
            return;

        _ = ShowEditorContextMenuAsync(location);
    }

    private async Task ShowEditorContextMenuAsync(Point location)
    {
        if (_editor == null)
            return;

        var context = await _editor.GetContextMenuContextAsync(location);
        _outlineUpdateTimer?.Stop();
        _outlineHighlightTimer?.Stop();
        _editor.SuspendScripts();

        if (context.IsImage && _ctxEditorImage != null)
        {
            _editorContextMenuImageSrc = context.ImageSrc ?? string.Empty;
            _editorContextMenuImageQuote = BuildImageCommentQuote(context.ImageSrc, context.ImageAlt);
            UpdateEditorChromeEnabled();
            _ctxEditorImage.Show(webViewEditor, location);
            return;
        }

        var selectedText = (await _editor.GetSelectedTextAsync()).Trim();
        _editorContextMenuSelectedText = selectedText;
        _editorContextMenuLineQuote = context.LineQuote?.Trim() ?? string.Empty;
        UpdateEditorCommentOnSelectionMenuItem();
        UpdateEditorCommentOnLineMenuItem();
        _ctxEditor!.Show(webViewEditor, location);
    }

    private void OpenEditorContextMenuImage()
    {
        if (string.IsNullOrWhiteSpace(_editorContextMenuImageSrc))
            return;

        OnEditorOpenRequested(_editorContextMenuImageSrc);
    }

    private static string BuildImageCommentQuote(string? src, string? alt)
    {
        if (string.IsNullOrWhiteSpace(src))
            return string.Empty;

        var safeSrc = src.Trim();
        var safeAlt = alt?.Trim() ?? string.Empty;
        return string.IsNullOrEmpty(safeAlt)
            ? $"![]({safeSrc})"
            : $"![{safeAlt}]({safeSrc})";
    }

    private async Task ReplaceSelectedImageAsync()
    {
        if (!CanEditActivePage() || !_currentPageId.HasValue)
            return;

        using var dialog = new OpenFileDialog
        {
            Title = Localization.Get(K.DialogImageFilePrompt),
            Filter = PageAssetStore.BuildOpenFileFilter(),
            Multiselect = false
        };

        if (dialog.ShowDialog() != DialogResult.OK)
            return;

        try
        {
            var fileName = PageAssetStore.ImportImage(_currentPageId.Value, dialog.FileName);
            var fileUri = PageAssetStore.BuildEditorUri(_currentPageId.Value, fileName);
            var alt = Path.GetFileNameWithoutExtension(dialog.FileName);
            await RunEditorAsync(async e =>
            {
                await e.ReplaceSelectedImageAsync(fileUri, alt);
                await e.FinalizeImageSizesAsync();
            });
            MarkPageDirty();
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.DialogImageTitle), ex);
        }
    }

    private async Task SyncPageTitleFromEditorAsync()
    {
        if (_editor == null || _isLoadingPage || _editor.IsScriptSuspended)
            return;

        var headings = await _editor.GetHeadingsAsync();
        var h1 = headings.FirstOrDefault(static h => h.Level == 1);
        var title = string.IsNullOrWhiteSpace(h1?.Text)
            ? Localization.Get(K.UntitledPageTitle)
            : h1.Text.Trim();

        if (_currentPageTitle == title)
            return;

        _currentPageTitle = title;
        lblStatus.Text = Localization.Format(K.StatusPage, title);
    }

    private async Task LoadPageAsync(int pageId)
    {
        if (_currentPageId == pageId)
        {
            SelectPageInTree(pageId);
            if (_editor != null)
                await _editor.FocusAsync();
            return;
        }

        await SaveCurrentPageAsync(refreshTree: false, force: true);

        var page = AppConfig.Services.Pages.GetById(SessionContext.CurrentUser, pageId);
        if (page == null)
        {
            MessageBox.Show(Localization.Get(K.PageLoadFailed), L.AppName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        _isLoadingPage = true;
        _currentPageId = page.Id;
        _draftWorkspaceId = null;
        _currentPageTitle = page.Title;
        UpdateEditorEmptySurface();
        RefreshWorkspaceEditState();

        try
        {
            var content = PageTitleHelper.EnsureTitleHeading(page.Title, page.Content);
            PageAssetStore.EnsureAssetsMaterialized(pageId, content);
            await _editor!.LoadMarkdownAsync(content, _pipeline, pageId);
            _offlinePageContext = OfflinePageContextBuilder.TryBuild(
                AppConfig.Services,
                SessionContext.CurrentUser,
                pageId);
            await _editor.FocusAsync();
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.PageLoadFailedTitle), ex);
        }
        finally
        {
            _isLoadingPage = false;
            _isDirty = false;
            SetSaveStatus(SaveStatusKind.Saved);
            UpdateEditorEmptySurface();
            await UpdateOutlineAsync();
            lblStatus.Text = Localization.Format(K.StatusPage, page.Title);
            RefreshWorkspaceEditState();
            SelectPageInTree(pageId);
            RecordCurrentPageForSession();
            await RefreshCommentsPanelAsync();
        }
    }

    private async Task PrepareWorkspaceDraftAsync(int workspaceId)
    {
        if (_draftWorkspaceId == workspaceId && !_currentPageId.HasValue)
        {
            SelectWorkspaceInTree(workspaceId);
            return;
        }

        if (_currentPageId.HasValue)
        {
            await SaveCurrentPageAsync(refreshTree: false, force: true);
            _currentPageId = null;
        }

        _draftWorkspaceId = workspaceId;
        _currentPageTitle = string.Empty;
        _offlinePageContext = null;
        _isLoadingPage = true;

        try
        {
            if (_editor != null)
                await _editor.ClearAsync(_pipeline);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.EditorClearFailed), ex);
        }
        finally
        {
            _isLoadingPage = false;
            _isDirty = false;
            SetSaveStatus(SaveStatusKind.None);
            ClearOutlinePanel();
            UpdateEditorEmptySurface();
            RefreshWorkspaceEditState();

            var title = FindWorkspaceNameInTree(workspaceId) ?? Localization.Get(K.LabelWorkspace);
            lblStatus.Text = Localization.Format(K.StatusWorkspace, title);
            LoadWorkspaceTree(selectWorkspaceId: workspaceId);
            await RefreshCommentsPanelAsync();
        }
    }

    private async Task ClearEditorAsync()
    {
        await SaveCurrentPageAsync(refreshTree: false, force: true);

        _currentPageId = null;
        _draftWorkspaceId = null;
        _currentPageTitle = string.Empty;
        _offlinePageContext = null;
        _isLoadingPage = true;
        UpdateEditorEmptySurface();

        try
        {
            if (_editor != null)
                await _editor.ClearAsync(_pipeline);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.EditorClearFailed), ex);
        }
        finally
        {
            _isLoadingPage = false;
            _isDirty = false;
            SetSaveStatus(SaveStatusKind.None);
            ClearOutlinePanel();
            UpdateEditorEmptySurface();
            UpdateEditorChromeEnabled();
            lblStatus.Text = SessionContext.IsLoggedIn
                ? SessionContext.IsAdmin ? Localization.Get(K.StatusAdmin) : Localization.Get(K.StatusUser)
                : Localization.Get(K.StatusLoginRequired);
            await RefreshCommentsPanelAsync();
        }
    }

    private async Task ClearEditorImmediateAsync()
    {
        _currentPageId = null;
        _draftWorkspaceId = null;
        _currentPageTitle = string.Empty;
        _offlinePageContext = null;
        _isLoadingPage = true;
        UpdateEditorEmptySurface();

        try
        {
            if (_editor != null)
                await _editor.ClearAsync(_pipeline);
        }
        catch
        {
            // Best effort while logging out or closing.
        }
        finally
        {
            _isLoadingPage = false;
            _isDirty = false;
            ClearOutlinePanel();
            UpdateEditorEmptySurface();
            await RefreshCommentsPanelAsync();
        }
    }

    private async Task ReloadCurrentPageAsync()
    {
        if (!_currentPageId.HasValue || _editor == null)
            return;

        var pageId = _currentPageId.Value;
        var page = AppConfig.Services.Pages.GetById(SessionContext.CurrentUser, pageId);
        if (page == null)
            return;

        _isLoadingPage = true;
        try
        {
            _currentPageTitle = page.Title;
            var content = PageTitleHelper.EnsureTitleHeading(page.Title, page.Content);
            PageAssetStore.EnsureAssetsMaterialized(pageId, content);
            await _editor.LoadMarkdownAsync(content, _pipeline, pageId);
            _offlinePageContext = OfflinePageContextBuilder.TryBuild(
                AppConfig.Services,
                SessionContext.CurrentUser,
                pageId);
            _isDirty = false;
            SetSaveStatus(SaveStatusKind.Saved);
            await UpdateOutlineAsync();
            lblStatus.Text = Localization.Format(K.StatusPage, page.Title);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.PageLoadFailedTitle), ex);
        }
        finally
        {
            _isLoadingPage = false;
        }
    }

    private async Task<bool> SaveCurrentPageAsync(
        bool showStatus = false,
        bool refreshTree = false,
        bool force = false,
        bool autoSaveToSqliteOnly = false)
    {
        if ((!_isDirty && !force) || !_currentPageId.HasValue || _saveInProgress || _editor == null)
            return true;

        if (!CanEditActivePage())
            return false;

        if (_editor.IsScriptSuspended)
        {
            saveTimer.Stop();
            saveTimer.Start();
            return false;
        }

        _saveInProgress = true;
        try
        {
            var content = await _editor.GetMarkdownAsync(_currentPageId);
            var title = PageTitleHelper.ExtractTitleFromMarkdown(content);
            var titleChanged = !string.Equals(_currentPageTitle, title, StringComparison.Ordinal);
            var saveResult = AppConfigPageSave.TrySavePage(
                SessionContext.CurrentUser,
                _currentPageId.Value,
                title,
                content,
                _offlinePageContext,
                autoSaveToSqliteOnly);

            _currentPageTitle = title;
            _isDirty = false;
            if (showStatus)
            {
                SetSaveStatus(saveResult switch
                {
                    PageSaveResult.OfflineFallback => SaveStatusKind.OfflineSaved,
                    _ => SaveStatusKind.AutoSaved
                });
                lblStatus.Text = saveResult == PageSaveResult.OfflineFallback
                    ? Localization.Format(K.StatusPageOfflineSaved, title)
                    : Localization.Format(K.StatusPage, title);
            }

            if (refreshTree || titleChanged)
                LoadWorkspaceTree(selectPageId: _currentPageId);

            return true;
        }
        catch (Exception ex)
        {
            SetSaveStatus(SaveStatusKind.Failed);
            if (showStatus)
                ErrorDetailForm.Show(this, Localization.Get(K.SaveFailed), ex);

            return false;
        }
        finally
        {
            _saveInProgress = false;
        }
    }
}
