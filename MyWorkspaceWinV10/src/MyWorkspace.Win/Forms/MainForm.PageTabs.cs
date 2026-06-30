using Microsoft.Web.WebView2.WinForms;
using MyWorkspace.Core.Enums;

namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private readonly List<PageEditorSession> _pageSessions = [];
    private PageEditorSession? _activePageSession;
    private bool _suppressTabSelection;
    private ContextMenuStrip? _ctxPageTabs;
    private ToolStripMenuItem? menuClosePageTab;

    private void EnsurePageTabMenuItems()
    {
        if (menuClosePageTab != null)
            return;

        menuClosePageTab = new ToolStripMenuItem
        {
            Name = "menuClosePageTab",
            ShortcutKeys = Keys.Control | Keys.W,
            Image = IconAssets.Load(16, "exit")
        };
        menuClosePageTab.Click += (_, _) => _ = CloseActivePageTabAsync();

        var insertIndex = menuFile.DropDownItems.IndexOf(menuSavePage) + 1;
        menuFile.DropDownItems.Insert(insertIndex, menuClosePageTab);
    }

    private void InitializePageTabs()
    {
        EnsurePageTabMenuItems();

        _ctxPageTabs = new ContextMenuStrip(components);
        var closeItem = new ToolStripMenuItem();
        closeItem.Click += (_, _) => _ = CloseActivePageTabAsync();
        _ctxPageTabs.Items.Add(closeItem);
        _ctxPageTabs.Opening += (_, _) =>
        {
            closeItem.Text = Localization.Get(K.MenuClosePageTab);
            closeItem.Enabled = _activePageSession != null;
        };

        AppTheme.StyleTabControl(tabPageEditors);
        tabPageEditors.Dock = DockStyle.None;
        tabPageEditors.Anchor = AnchorStyles.None;
        pnlEditorHost.Layout += (_, _) => UpdateEditorHostTabLayout();
        pnlEditorHost.Resize += (_, _) => UpdateEditorHostTabLayout();
        UpdateEditorHostTabLayout();

        tabPageEditors.ContextMenuStrip = _ctxPageTabs;
        tabPageEditors.TabCloseRequested += (_, e) =>
        {
            var session = GetSessionByTab(e.TabPage);
            if (session != null)
                _ = ClosePageTabAsync(session);
        };
    }

    private void UpdateEditorHostTabLayout()
    {
        if (pnlEditorHost.ClientSize.Width <= 0)
            return;

        var headerHeight = pnlEditorHeader.Height;
        var width = pnlEditorHost.ClientSize.Width;
        var height = Math.Max(0, pnlEditorHost.ClientSize.Height - headerHeight);

        var headerBounds = new Rectangle(0, 0, width, headerHeight);
        if (pnlEditorHeader.Bounds != headerBounds)
            pnlEditorHeader.Bounds = headerBounds;

        var targetBounds = new Rectangle(0, headerHeight, width, height);
        if (tabPageEditors.Bounds != targetBounds)
            tabPageEditors.Bounds = targetBounds;
    }

    private void tabPageEditors_SelectedIndexChanged(object? sender, EventArgs e) =>
        _ = OnPageTabSelectedAsync();

    private async Task OnPageTabSelectedAsync()
    {
        if (_suppressTabSelection)
            return;

        var session = GetActiveTabSession();
        if (ReferenceEquals(session, _activePageSession))
            return;

        PersistActiveSessionFromUi();
        if (_activePageSession != null)
            await SavePageSessionAsync(_activePageSession, showStatus: false, refreshTree: false);

        ApplyActivePageSession(session);
        if (session != null)
        {
            await UpdateOutlineAsync();
            if (session.PageId is int pageId)
                SelectTreePage(pageId);
        }
        else
        {
            treeOutline.Nodes.Clear();
            _currentPageId = null;
            _draftWorkspaceId = null;
            _isDirty = false;
            SetSaveStatus(SaveStatusKind.None);
            lblStatus.Text = SessionContext.IsLoggedIn
                ? SessionContext.IsAdmin ? Localization.Get(K.StatusAdmin) : Localization.Get(K.StatusUser)
                : Localization.Get(K.StatusLoginRequired);
        }
    }

    private void ApplyActivePageSession(PageEditorSession? session)
    {
        _activePageSession = session;
        _editor = session?.Editor ?? null!;

        if (session == null)
        {
            _currentPageId = null;
            _draftWorkspaceId = null;
            _isLoadingPage = false;
            _isDirty = false;
            UpdateEditorChromeEnabled();
            return;
        }

        _currentPageId = session.PageId;
        _draftWorkspaceId = session.DraftWorkspaceId;
        _isLoadingPage = session.IsLoading;
        _isDirty = session.IsDirty;

        SetSaveStatus(session.IsDirty ? SaveStatusKind.Modified :
            session.PageId.HasValue ? SaveStatusKind.Saved : SaveStatusKind.None);

        if (!string.IsNullOrWhiteSpace(session.Title))
            lblStatus.Text = Localization.Format(K.StatusPage, session.Title.Trim());

        UpdateEditorChromeEnabled();
    }

    private void PersistActiveSessionFromUi()
    {
        if (_activePageSession == null)
            return;

        _activePageSession.IsDirty = _isDirty;
        UpdatePageTabCaption(_activePageSession);
    }

    private async Task SyncPageTitleFromEditorAsync(PageEditorSession? session)
    {
        if (session == null || session.IsLoading || session.Editor.IsScriptSuspended)
            return;

        var headings = await session.Editor.GetHeadingsAsync();
        var h1 = headings.FirstOrDefault(static h => h.Level == 1);
        var title = string.IsNullOrWhiteSpace(h1?.Text)
            ? Localization.Get(K.UntitledPageTitle)
            : h1.Text.Trim();

        if (session.Title == title)
            return;

        session.Title = title;
        UpdatePageTabCaption(session);

        if (ReferenceEquals(session, _activePageSession))
            lblStatus.Text = Localization.Format(K.StatusPage, title);
    }

    private PageEditorSession? GetActiveTabSession()
    {
        if (tabPageEditors.SelectedTab == null)
            return null;

        return GetSessionByTab(tabPageEditors.SelectedTab);
    }

    private PageEditorSession? GetSessionByTab(TabPage tab) =>
        _pageSessions.FirstOrDefault(session => ReferenceEquals(session.TabPage, tab));

    private PageEditorSession? FindSessionByPageId(int pageId) =>
        _pageSessions.FirstOrDefault(session => session.PageId == pageId);

    private PageEditorSession? FindDraftSession(int workspaceId) =>
        _pageSessions.FirstOrDefault(session => session.IsDraft && session.DraftWorkspaceId == workspaceId);

    private async Task<PageEditorSession> CreatePageSessionAsync(string title, int? pageId, int? draftWorkspaceId)
    {
        var tabPage = new TabPage(FormatTabCaption(title, false))
        {
            BackColor = AppTheme.EditorBackground,
            Padding = new Padding(0),
            UseVisualStyleBackColor = false
        };

        var webView = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = AppTheme.EditorBackground,
            AllowExternalDrop = true
        };

        tabPage.Controls.Add(webView);
        tabPageEditors.TabPages.Add(tabPage);

        var editor = new WebViewEditorController(webView);
        var session = new PageEditorSession(tabPage, webView, editor)
        {
            PageId = pageId,
            DraftWorkspaceId = draftWorkspaceId,
            Title = title
        };

        editor.ContentChanged += () => OnPageSessionContentChanged(session);
        editor.CaretMoved += OnEditorCaretMoved;
        editor.ContextMenuRequested += location => OnPageSessionContextMenuRequested(session, location);

        _pageSessions.Add(session);

        try
        {
            await editor.InitializeAsync(_pipeline);
        }
        catch (Exception ex)
        {
            _pageSessions.Remove(session);
            tabPageEditors.TabPages.Remove(tabPage);
            session.Dispose();
            throw new InvalidOperationException(Localization.Get(K.EditorInitFailed), ex);
        }

        return session;
    }

    private void OnPageSessionContentChanged(PageEditorSession session)
    {
        if (!ReferenceEquals(session, _activePageSession))
        {
            session.IsDirty = true;
            _ = SyncPageTitleFromEditorAsync(session);
            UpdatePageTabCaption(session);
            return;
        }

        OnEditorContentChanged();
    }

    private void OnPageSessionContextMenuRequested(PageEditorSession session, Point location)
    {
        if (_ctxEditor == null || !SessionContext.IsLoggedIn)
            return;

        if (!ReferenceEquals(session, _activePageSession))
        {
            SelectPageSession(session);
            return;
        }

        if (!session.PageId.HasValue && !session.IsDraft)
            return;

        _outlineUpdateTimer?.Stop();
        _outlineHighlightTimer?.Stop();
        session.Editor.SuspendScripts();
        _ctxEditor.Show(session.WebView, location);
    }

    private void SelectPageSession(PageEditorSession session)
    {
        _suppressTabSelection = true;
        try
        {
            tabPageEditors.SelectedTab = session.TabPage;
        }
        finally
        {
            _suppressTabSelection = false;
        }

        ApplyActivePageSession(session);
    }

    private async Task OpenPageTabAsync(int pageId)
    {
        var existing = FindSessionByPageId(pageId);
        if (existing != null)
        {
            if (!ReferenceEquals(existing, _activePageSession))
            {
                PersistActiveSessionFromUi();
                if (_activePageSession != null)
                    await SavePageSessionAsync(_activePageSession, showStatus: false, refreshTree: false);

                SelectPageSession(existing);
                await UpdateOutlineAsync();
                SelectTreePage(pageId);
            }

            await existing.Editor.FocusAsync();
            return;
        }

        PersistActiveSessionFromUi();
        if (_activePageSession != null)
            await SavePageSessionAsync(_activePageSession, showStatus: false, refreshTree: false);

        var page = AppConfig.Services.Pages.GetById(SessionContext.CurrentUser, pageId);
        if (page == null)
        {
            MessageBox.Show(Localization.Get(K.PageLoadFailed), L.AppName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        PageEditorSession session;
        try
        {
            session = await CreatePageSessionAsync(page.Title, pageId, draftWorkspaceId: null);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.PageLoadFailedTitle), ex);
            return;
        }

        session.IsLoading = true;
        SelectPageSession(session);
        _isLoadingPage = true;

        try
        {
            var content = PageTitleHelper.EnsureTitleHeading(page.Title, page.Content);
            await session.Editor.LoadMarkdownAsync(content, _pipeline, pageId);
            await session.Editor.FocusAsync();
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.PageLoadFailedTitle), ex);
        }
        finally
        {
            session.IsLoading = false;
            _isLoadingPage = false;
            session.IsDirty = false;
            _isDirty = false;
            SetSaveStatus(SaveStatusKind.Saved);
            UpdatePageTabCaption(session);
            await UpdateOutlineAsync();
            lblStatus.Text = Localization.Format(K.StatusPage, page.Title);
        }
    }

    private async Task OpenDraftPageTabAsync(int workspaceId)
    {
        var existing = FindDraftSession(workspaceId);
        if (existing != null)
        {
            if (!ReferenceEquals(existing, _activePageSession))
            {
                PersistActiveSessionFromUi();
                if (_activePageSession != null)
                    await SavePageSessionAsync(_activePageSession, showStatus: false, refreshTree: false);

                SelectPageSession(existing);
                await existing.Editor.FocusAsync();
            }

            return;
        }

        PersistActiveSessionFromUi();
        if (_activePageSession != null)
            await SavePageSessionAsync(_activePageSession, showStatus: false, refreshTree: false);

        var title = Localization.Get(K.UntitledPageTitle);
        PageEditorSession session;
        try
        {
            session = await CreatePageSessionAsync(title, pageId: null, draftWorkspaceId: workspaceId);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.EditorInitFailed), ex);
            return;
        }

        session.IsLoading = true;
        SelectPageSession(session);
        _isLoadingPage = true;

        try
        {
            var initialContent = PageTitleHelper.CreateInitialMarkdown(title);
            await session.Editor.LoadMarkdownAsync(initialContent, _pipeline);
            await session.Editor.FocusAsync();
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.EditorClearFailed), ex);
        }
        finally
        {
            session.IsLoading = false;
            _isLoadingPage = false;
            session.IsDirty = false;
            _isDirty = false;
            SetSaveStatus(SaveStatusKind.None);
            treeOutline.Nodes.Clear();
            lblStatus.Text = Localization.Format(K.StatusPage, title);
        }
    }

    private async Task CloseAllPageTabsAsync()
    {
        PersistActiveSessionFromUi();
        await SaveAllDirtyPageTabsAsync(showStatus: false, refreshTree: false);

        CloseAllPageTabsImmediate();
    }

    private void CloseAllPageTabsImmediate()
    {
        foreach (var session in _pageSessions.ToList())
            RemovePageSession(session, selectAnother: false);

        ApplyActivePageSession(null);
        treeOutline.Nodes.Clear();
        _currentPageId = null;
        _draftWorkspaceId = null;
        _isDirty = false;
        SetSaveStatus(SaveStatusKind.None);
        UpdateEditorChromeEnabled();
    }

    private async Task CloseActivePageTabAsync()
    {
        if (_activePageSession != null)
            await ClosePageTabAsync(_activePageSession);
    }

    private async Task ClosePageTabAsync(PageEditorSession session)
    {
        PersistActiveSessionFromUi();

        if (session.IsDirty)
        {
            var result = MessageBox.Show(
                Localization.Get(K.ConfirmCloseDirtyPageTab),
                L.AppName,
                MessageBoxButtons.YesNoCancel,
                MessageBoxIcon.Question);

            if (result == DialogResult.Cancel)
                return;

            if (result == DialogResult.Yes)
            {
                if (ReferenceEquals(session, _activePageSession))
                    await SaveCurrentPageAsync(refreshTree: false);
                else
                    await SavePageSessionAsync(session, showStatus: false, refreshTree: false);
            }
        }

        var wasActive = ReferenceEquals(session, _activePageSession);
        RemovePageSession(session, selectAnother: true);

        if (wasActive)
        {
            ApplyActivePageSession(GetActiveTabSession());
            if (_activePageSession != null)
                await UpdateOutlineAsync();
            else
            {
                treeOutline.Nodes.Clear();
                _currentPageId = null;
                _draftWorkspaceId = null;
                _isDirty = false;
                SetSaveStatus(SaveStatusKind.None);
            }
        }
    }

    private void ClosePageTabByPageId(int pageId)
    {
        var session = FindSessionByPageId(pageId);
        if (session != null)
            _ = ClosePageTabAsync(session);
    }

    private void RemovePageSession(PageEditorSession session, bool selectAnother)
    {
        _pageSessions.Remove(session);
        _suppressTabSelection = true;
        try
        {
            tabPageEditors.TabPages.Remove(session.TabPage);
        }
        finally
        {
            _suppressTabSelection = false;
        }

        session.Dispose();

        if (selectAnother && tabPageEditors.TabCount > 0 && _activePageSession == null)
            tabPageEditors.SelectedIndex = Math.Max(0, tabPageEditors.TabCount - 1);
    }

    private async Task SavePageSessionAsync(
        PageEditorSession session,
        bool showStatus = false,
        bool refreshTree = false)
    {
        if (!session.IsDirty || _saveInProgress)
            return;

        if (session.IsDraft)
        {
            if (!ReferenceEquals(session, _activePageSession))
                return;

            if (!await EnsurePageCreatedAsync())
                return;

            session.PageId = _currentPageId;
            session.DraftWorkspaceId = null;
            session.IsDirty = _isDirty;
        }

        if (!session.PageId.HasValue || session.Editor.IsScriptSuspended)
            return;

        _saveInProgress = true;
        try
        {
            var content = await session.Editor.GetMarkdownAsync(session.PageId);
            var title = PageTitleHelper.ExtractTitleFromMarkdown(content);
            AppConfig.Services.Pages.UpdatePage(
                SessionContext.CurrentUser,
                session.PageId.Value,
                title,
                content);

            session.Title = title;
            session.IsDirty = false;
            UpdatePageTabCaption(session);

            if (ReferenceEquals(session, _activePageSession))
            {
                _isDirty = false;
                if (showStatus)
                {
                    SetSaveStatus(SaveStatusKind.AutoSaved);
                    lblStatus.Text = Localization.Format(K.StatusPage, session.Title.Trim());
                }
            }

            if (refreshTree)
                LoadWorkspaceTree(selectPageId: session.PageId);
        }
        catch (Exception ex)
        {
            if (ReferenceEquals(session, _activePageSession))
            {
                SetSaveStatus(SaveStatusKind.Failed);
                if (showStatus)
                    ErrorDetailForm.Show(this, Localization.Get(K.SaveFailed), ex);
            }
        }
        finally
        {
            _saveInProgress = false;
        }
    }

    private async Task SaveAllDirtyPageTabsAsync(bool showStatus = false, bool refreshTree = false)
    {
        PersistActiveSessionFromUi();

        foreach (var session in _pageSessions.Where(static s => s.IsDirty).ToList())
            await SavePageSessionAsync(session, showStatus, refreshTree);
    }

    private bool AnyDirtyPageTab()
    {
        PersistActiveSessionFromUi();
        return _pageSessions.Any(static session => session.IsDirty);
    }

    private static void UpdatePageTabCaption(PageEditorSession session)
    {
        session.TabPage.Text = FormatTabCaption(session.Title, session.IsDirty);
        if (session.TabPage.Parent is CloseableTabControl tabs)
            tabs.RefreshTabLayout();
    }

    private static string FormatTabCaption(string title, bool isDirty)
    {
        var trimmed = string.IsNullOrWhiteSpace(title)
            ? Localization.Get(K.UntitledPageTitle)
            : title.Trim();

        if (trimmed.Length > 28)
            trimmed = trimmed[..25] + "...";

        return isDirty ? $"{trimmed} *" : trimmed;
    }

    private void SelectTreePage(int pageId)
    {
        _suppressWorkspaceSelection = true;
        try
        {
            var node = FindNode(treeWorkspace.Nodes, TreeNodeKind.Page, pageId);
            if (node != null)
                treeWorkspace.SelectedNode = node;
        }
        finally
        {
            _suppressWorkspaceSelection = false;
        }
    }

    private void RefreshOpenPageTabTitles()
    {
        foreach (var session in _pageSessions.Where(static s => s.PageId.HasValue))
        {
            var page = AppConfig.Services.Pages.GetById(SessionContext.CurrentUser, session.PageId!.Value);
            if (page == null)
                continue;

            session.Title = page.Title;
            UpdatePageTabCaption(session);
        }
    }
}
