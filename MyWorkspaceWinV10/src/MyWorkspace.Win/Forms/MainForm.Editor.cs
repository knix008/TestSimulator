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
        {
            pnlEditorEmptySurface.BringToFront();
            _pageTabBar?.SendToBack();
        }
        else
        {
            webViewEditor.BringToFront();
            _pageTabBar?.SendToBack();
        }
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
        await _pageLoadLock.WaitAsync();
        try
        {
            await LoadPageCoreAsync(pageId);
        }
        finally
        {
            _pageLoadLock.Release();
        }
    }

    private async Task LoadPageCoreAsync(int pageId)
    {
        if (_currentPageId == pageId && _editorDisplayedPageId == pageId)
        {
            EnsurePageTabOpen(pageId);
            RefreshPageTabBar();
            SelectPageInTree(pageId);
            if (_editor != null)
                await _editor.FocusAsync();
            return;
        }

        var snapshotTask = SnapshotCurrentPageBeforeNavigateAsync();
        var page = AppConfig.Services.Pages.GetById(SessionContext.CurrentUser, pageId);
        if (!await snapshotTask)
            return;

        if (page == null)
        {
            RemovePageTab(pageId);
            RefreshPageTabBar();
            MessageBox.Show(Localization.Get(K.PageLoadFailed), L.AppName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        _isLoadingPage = true;
        _editorDisplayedPageId = null;
        _currentPageId = page.Id;
        _draftWorkspaceId = null;
        _currentPageTitle = page.Title;
        UpdateEditorEmptySurface();
        RefreshWorkspaceEditState();

        var loaded = false;
        var loadedTitle = page.Title;
        try
        {
            var resolved = PageContentCache.Resolve(pageId, page);
            loadedTitle = resolved.Title;
            var content = PageTitleHelper.EnsureTitleHeading(resolved.Title, resolved.Content);

            if (resolved.Source == PageContentCache.ContentSource.CacheSession)
                ScheduleBackgroundPagePersist(pageId);
            PageAssetStore.EnsureAssetsMaterialized(pageId, content);
            await _editor!.LoadMarkdownAsync(content, _pipeline, pageId);
            _editorDisplayedPageId = pageId;
            _offlinePageContext = OfflinePageContextBuilder.TryBuild(
                AppConfig.Services,
                SessionContext.CurrentUser,
                pageId);
            loaded = true;
        }
        catch (Exception ex)
        {
            _editorDisplayedPageId = null;
            ErrorDetailForm.Show(this, Localization.Get(K.PageLoadFailedTitle), ex);
        }
        finally
        {
            _isLoadingPage = false;
            UpdateEditorEmptySurface();
        }

        if (!loaded)
        {
            _currentPageId = null;
            _currentPageTitle = string.Empty;
            _offlinePageContext = null;
            _ = RefreshCommentsPanelAsync();
            return;
        }

        _isDirty = false;
        SetSaveStatus(
            PageContentCache.IsPendingPrimaryFlush(pageId)
                ? SaveStatusKind.Modified
                : SaveStatusKind.Saved);
        lblStatus.Text = Localization.Format(K.StatusPage, loadedTitle);
        RefreshWorkspaceEditState();
        SelectPageInTree(pageId);
        RecordCurrentPageForSession();
        EnsurePageTabOpen(pageId);
        RememberTabTitle(pageId, loadedTitle);
        RefreshPageTabBar();
        _ = UpdateOutlineAsync();
        _ = RefreshCommentsPanelAsync();
        _ = _editor!.FocusAsync();
    }

    private async Task<bool> SnapshotCurrentPageBeforeNavigateAsync()
    {
        if (!_currentPageId.HasValue || _editor == null)
            return true;

        if (_isLoadingPage)
            return true;

        if (_editorDisplayedPageId != _currentPageId)
            return true;

        if (!CanEditActivePage())
            return true;

        if (!_isDirty)
        {
            saveTimer.Stop();
            return true;
        }

        var pageId = _currentPageId.Value;

        if (_liveCacheDirtyGeneration == _dirtyGeneration
            && PageContentCache.TryGet(pageId) != null)
        {
            FinishPageSnapshot(pageId);
            return true;
        }

        if (_editor.IsScriptSuspended)
            return true;

        try
        {
            if (_editor.IsReady)
                await _editor.FinalizeImageSizesAsync();

            var content = await _editor.GetMarkdownAsync(pageId);
            var title = PageTitleHelper.ExtractTitleFromMarkdown(content);
            var dirtyGenerationAtStart = _dirtyGeneration;

            PageContentCache.Put(
                pageId,
                new PageContentCache.Draft(title, content, _offlinePageContext, DateTime.UtcNow),
                markPendingPrimaryFlush: false);
            _liveCacheDirtyGeneration = dirtyGenerationAtStart;
            RememberTabTitle(pageId, title);
            _currentPageTitle = title;

            if (dirtyGenerationAtStart == _dirtyGeneration)
                FinishPageSnapshot(pageId);

            return true;
        }
        catch
        {
            return false;
        }
    }

    private void FinishPageSnapshot(int pageId)
    {
        _isDirty = false;
        saveTimer.Stop();
        PageContentCache.CommitForPrimaryFlush(pageId);
        ScheduleBackgroundPagePersist(pageId);
        RefreshPageTabBar();
    }

    private async Task RefreshLivePageCacheAsync()
    {
        if (_liveCacheUpdateInProgress
            || _isLoadingPage
            || !_currentPageId.HasValue
            || _editor == null
            || !_isDirty)
        {
            return;
        }

        if (_editor.IsScriptSuspended || !CanEditActivePage())
            return;

        _liveCacheUpdateInProgress = true;
        var pageId = _currentPageId.Value;
        var context = _offlinePageContext;
        var dirtyGenerationAtStart = _dirtyGeneration;

        try
        {
            if (_editor.IsReady)
                await _editor.FinalizeImageSizesAsync();

            var content = await _editor.GetMarkdownAsync(pageId);
            var title = PageTitleHelper.ExtractTitleFromMarkdown(content);

            PageContentCache.Put(
                pageId,
                new PageContentCache.Draft(title, content, context, DateTime.UtcNow),
                markPendingPrimaryFlush: false);
            _liveCacheDirtyGeneration = dirtyGenerationAtStart;
            RememberTabTitle(pageId, title);
        }
        catch
        {
            // Live cache is best-effort; tab switch falls back to a direct snapshot.
        }
        finally
        {
            _liveCacheUpdateInProgress = false;
        }
    }

    private void ScheduleBackgroundPagePersist(int pageId)
    {
        var user = SessionContext.CurrentUser;
        if (user == null)
            return;

        _ = Task.Run(() =>
        {
            try
            {
                var draft = PageContentCache.TryGet(pageId);
                if (draft?.Context == null)
                    return;

                AppConfigPageSave.TrySavePage(
                    user,
                    pageId,
                    draft.Title,
                    draft.Content,
                    draft.Context,
                    autoSaveToSqliteOnly: true);
            }
            catch
            {
                // Local SQLite backup is best-effort.
            }
        });

        ScheduleCachedPagePrimaryFlush(pageId);
    }

    private async Task<bool> SaveCurrentPageBeforeNavigateAsync() =>
        await SnapshotCurrentPageBeforeNavigateAsync();

    private async Task<bool> PersistPageTabToDatabaseAsync(int pageId)
    {
        if (!SessionContext.IsLoggedIn)
            return true;

        if (AppConfig.Services.Pages.GetById(SessionContext.CurrentUser, pageId) == null)
            return true;

        if (!CanEditPage(pageId))
        {
            PageContentCache.Remove(pageId);
            return true;
        }

        if (!ShouldPersistCacheOnShutdown())
        {
            PageContentCache.Remove(pageId);
            return true;
        }

        if (_currentPageId == pageId && _editor != null)
        {
            if (_isDirty || PageContentCache.IsPendingPrimaryFlush(pageId))
            {
                if (!await SaveCurrentPageAsync(force: true, refreshTree: false))
                    return false;
            }

            PageContentCache.Remove(pageId);
            return true;
        }

        if (!PageContentCache.IsPendingPrimaryFlush(pageId))
        {
            PageContentCache.Remove(pageId);
            return true;
        }

        await PagePrimaryFlushService.Instance.FlushNowAsync(pageId, FlushCachedPageToPrimaryAsync);
        if (PageContentCache.IsPendingPrimaryFlush(pageId))
        {
            var result = await FlushCachedPageToPrimaryAsync(pageId);
            if (result is not PageSaveResult.Primary and not PageSaveResult.OfflineFallback)
                return false;
        }

        PageContentCache.Remove(pageId);
        return true;
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
            await SnapshotCurrentPageBeforeNavigateAsync();
            _currentPageId = null;
            _editorDisplayedPageId = null;
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
        await SaveCurrentPageBeforeNavigateAsync();

        _currentPageId = null;
        _draftWorkspaceId = null;
        _currentPageTitle = string.Empty;
        _offlinePageContext = null;
        _editorDisplayedPageId = null;
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
            RefreshPageTabBar();
        }
    }

    private async Task ClearEditorImmediateAsync()
    {
        _currentPageId = null;
        _draftWorkspaceId = null;
        _currentPageTitle = string.Empty;
        _offlinePageContext = null;
        _editorDisplayedPageId = null;
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
            RefreshPageTabBar();
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
            var resolved = PageContentCache.Resolve(pageId, page);
            _currentPageTitle = resolved.Title;
            var content = PageTitleHelper.EnsureTitleHeading(resolved.Title, resolved.Content);
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
        bool autoSaveToSqliteOnly = false,
        SaveProgressScope? progress = null)
    {
        await _saveGate.WaitAsync();
        try
        {
            return await SaveCurrentPageCoreAsync(showStatus, refreshTree, force, autoSaveToSqliteOnly, progress);
        }
        finally
        {
            _saveGate.Release();
        }
    }

    private async Task<bool> SaveCurrentPageCoreAsync(
        bool showStatus = false,
        bool refreshTree = false,
        bool force = false,
        bool autoSaveToSqliteOnly = false,
        SaveProgressScope? progress = null)
    {
        if ((!_isDirty && !force) || !_currentPageId.HasValue || _editor == null)
            return true;

        if (_isLoadingPage && !force)
            return true;

        var pageId = _currentPageId.Value;
        if (!force
            && _editorDisplayedPageId.HasValue
            && _editorDisplayedPageId.Value != pageId)
            return true;

        if (!CanEditActivePage())
            return false;

        if (_editor.IsScriptSuspended)
        {
            saveTimer.Stop();
            saveTimer.Start();
            return false;
        }

        var dirtyGenerationAtStart = _dirtyGeneration;

        var ownsProgress = progress == null;
        progress ??= SaveProgressScope.Begin(this);

        try
        {
            await progress.RunStageAsync(
                Localization.Get(K.SaveProgressPrepareEditor),
                15,
                async () =>
                {
                    if (_editor.IsReady && !_editor.IsScriptSuspended)
                        await _editor.FinalizeImageSizesAsync();
                });

            var content = string.Empty;
            await progress.RunStageAsync(
                Localization.Get(K.SaveProgressExtractContent),
                45,
                async () => content = await _editor.GetMarkdownAsync(pageId));

            var title = PageTitleHelper.ExtractTitleFromMarkdown(content);
            var titleChanged = !string.Equals(_currentPageTitle, title, StringComparison.Ordinal);

            progress.ReportIndeterminate(Localization.Get(K.SaveProgressWritingDatabase));
            var saveResult = AppConfigPageSave.TrySavePage(
                SessionContext.CurrentUser,
                pageId,
                title,
                content,
                _offlinePageContext,
                autoSaveToSqliteOnly);

            PageContentCache.Put(
                pageId,
                new PageContentCache.Draft(title, content, _offlinePageContext, DateTime.UtcNow),
                markPendingPrimaryFlush: false);
            if (saveResult is PageSaveResult.Primary or PageSaveResult.OfflineFallback)
                PageContentCache.MarkPrimarySynced(pageId);

            _currentPageTitle = title;
            if (dirtyGenerationAtStart == _dirtyGeneration)
                _isDirty = false;
            RememberTabTitle(pageId, title);
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
            {
                progress.ReportDeterminate(90, Localization.Get(K.SaveProgressFinishing));
                LoadWorkspaceTree(selectPageId: pageId);
            }

            progress.ReportDeterminate(100, Localization.Get(K.SaveProgressFinishing));
            RefreshPageTabBar();
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
            if (ownsProgress)
                progress.Dispose();
        }
    }

    private void ScheduleCachedPagePrimaryFlush(int pageId)
    {
        PagePrimaryFlushService.Instance.Schedule(
            pageId,
            FlushCachedPageToPrimaryAsync,
            () =>
            {
                if (IsDisposed)
                    return;

                BeginInvoke(() =>
                {
                    RefreshPageTabBar();
                    if (_currentPageId == pageId
                        && !PageContentCache.IsPendingPrimaryFlush(pageId)
                        && !_isDirty)
                    {
                        SetSaveStatus(SaveStatusKind.AutoSaved);
                    }
                });
            });
    }

    private async Task<PageSaveResult> FlushCachedPageToPrimaryAsync(int pageId)
    {
        if (!SessionContext.IsLoggedIn)
            return PageSaveResult.Failed;

        if (!PageContentCache.IsPendingPrimaryFlush(pageId))
            return PageSaveResult.Primary;

        var draft = PageContentCache.TryGet(pageId);
        if (draft == null)
            return PageSaveResult.Primary;

        var context = draft.Context
            ?? OfflinePageContextBuilder.TryBuild(AppConfig.Services, SessionContext.CurrentUser, pageId);
        if (context == null)
            return PageSaveResult.Failed;

        await _saveGate.WaitAsync();
        try
        {
            if (!PageContentCache.IsPendingPrimaryFlush(pageId))
                return PageSaveResult.Primary;

            var latest = PageContentCache.TryGet(pageId) ?? draft;
            var result = AppConfigPageSave.TrySavePage(
                SessionContext.CurrentUser,
                pageId,
                latest.Title,
                latest.Content,
                context,
                autoSaveToSqliteOnly: false);

            return result;
        }
        finally
        {
            _saveGate.Release();
        }
    }

    private async Task FlushAllPendingPagesAsync()
    {
        await PagePrimaryFlushService.Instance.FlushAllPendingAsync(FlushCachedPageToPrimaryAsync);
    }

    private static bool ShouldPersistCacheOnShutdown() =>
        SessionContext.IsLoggedIn
        && !AppConfig.IsDatabaseConnectionDisabled
        && AppConfig.Services != null;

    private async Task<bool> EnsureCachePersistedToDatabaseOnShutdownAsync()
    {
        if (!ShouldPersistCacheOnShutdown())
            return true;

        _liveCacheTimer?.Stop();
        saveTimer.Stop();
        PagePrimaryFlushService.Instance.BeginShutdown();

        if (_currentPageId.HasValue && _editor != null)
        {
            if (_isDirty)
                await SnapshotCurrentPageBeforeNavigateAsync();

            if (_isDirty && !await SaveCurrentPageAsync(force: true, refreshTree: false))
                return false;
        }

        return await PagePrimaryFlushService.Instance.FlushAllPendingForShutdownAsync(FlushCachedPageToPrimaryAsync);
    }

    private async Task<bool> TryPersistCacheOnShutdownAsync()
    {
        if (!await EnsureCachePersistedToDatabaseOnShutdownAsync())
        {
            return MessageBox.Show(
                       Localization.Get(K.ConfirmExitWithUnsavedCache),
                       L.AppName,
                       MessageBoxButtons.YesNo,
                       MessageBoxIcon.Warning) == DialogResult.Yes;
        }

        return true;
    }
}
