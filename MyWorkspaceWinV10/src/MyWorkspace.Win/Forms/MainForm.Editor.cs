namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private string _currentPageTitle = string.Empty;

    private void InitializeEditor()
    {
        webViewEditor.DefaultBackgroundColor = AppTheme.EditorBackground;
        UpdateEditorEmptySurface();

        _editor = new WebViewEditorController(webViewEditor);
        _editor.ContentChanged += OnEditorContentChanged;
        _editor.CaretMoved += OnEditorCaretMoved;
        _editor.ContextMenuRequested += OnEditorContextMenuRequested;
        _editor.ConfigureFileDrop(
            pnlEditorHost,
            HandleEditorFilesDroppedAsync,
            () => SessionContext.IsLoggedIn
                  && (_currentPageId.HasValue || _draftWorkspaceId.HasValue)
                  && CanEditActivePage());
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

    private void OnEditorContextMenuRequested(Point location)
    {
        if (_ctxEditor == null || !SessionContext.IsLoggedIn)
            return;

        if (!_currentPageId.HasValue && !_draftWorkspaceId.HasValue)
            return;

        _outlineUpdateTimer?.Stop();
        _outlineHighlightTimer?.Stop();
        _editor?.SuspendScripts();
        _ctxEditor.Show(webViewEditor, location);
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
            if (_editor != null)
                await _editor.FocusAsync();
            return;
        }

        await SaveCurrentPageAsync(refreshTree: false);

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
        }
    }

    private async Task ClearEditorAsync()
    {
        await SaveCurrentPageAsync(refreshTree: false);

        _currentPageId = null;
        _draftWorkspaceId = null;
        _currentPageTitle = string.Empty;
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
            treeOutline.Nodes.Clear();
            UpdateEditorEmptySurface();
            UpdateEditorChromeEnabled();
            lblStatus.Text = SessionContext.IsLoggedIn
                ? SessionContext.IsAdmin ? Localization.Get(K.StatusAdmin) : Localization.Get(K.StatusUser)
                : Localization.Get(K.StatusLoginRequired);
        }
    }

    private async Task ClearEditorImmediateAsync()
    {
        _currentPageId = null;
        _draftWorkspaceId = null;
        _currentPageTitle = string.Empty;
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
            treeOutline.Nodes.Clear();
            UpdateEditorEmptySurface();
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

    private async Task SaveCurrentPageAsync(bool showStatus = false, bool refreshTree = false)
    {
        if (!_isDirty || !_currentPageId.HasValue || _saveInProgress || _editor == null)
            return;

        if (!CanEditActivePage())
            return;

        if (_editor.IsScriptSuspended)
        {
            saveTimer.Stop();
            saveTimer.Start();
            return;
        }

        _saveInProgress = true;
        try
        {
            var content = await _editor.GetMarkdownAsync(_currentPageId);
            var title = PageTitleHelper.ExtractTitleFromMarkdown(content);
            AppConfig.Services.Pages.UpdatePage(
                SessionContext.CurrentUser,
                _currentPageId.Value,
                title,
                content);

            PageAssetStore.SyncAssetsWithContent(_currentPageId.Value, content);

            _currentPageTitle = title;
            _isDirty = false;
            if (showStatus)
            {
                SetSaveStatus(SaveStatusKind.AutoSaved);
                lblStatus.Text = Localization.Format(K.StatusPage, title);
            }

            if (refreshTree)
                LoadWorkspaceTree(selectPageId: _currentPageId);
        }
        catch (Exception ex)
        {
            SetSaveStatus(SaveStatusKind.Failed);
            if (showStatus)
                ErrorDetailForm.Show(this, Localization.Get(K.SaveFailed), ex);
        }
        finally
        {
            _saveInProgress = false;
        }
    }
}
