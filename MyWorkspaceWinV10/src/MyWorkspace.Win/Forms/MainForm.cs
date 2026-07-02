using Markdig;
using MyWorkspace.Core.Enums;
using MyWorkspace.Core.Models;
using MyWorkspace.Data;

namespace MyWorkspace.Win.Forms;

public partial class MainForm : Form
{
    private readonly MarkdownPipeline _pipeline = new MarkdownPipelineBuilder().UseAdvancedExtensions().Build();

    private WebViewEditorController? _editor;
    private ImageList _toolbarIcons = null!;

    private int? _currentPageId;
    private int? _draftWorkspaceId;
    private bool _isLoadingPage;
    private bool _isDirty;
    private bool _suppressOutlineNavigation;
    private bool _suppressWorkspaceSelection;
    private TreeNode? _workspaceContextMenuNode;
    private bool _pageCreateInProgress;
    private string _lastActiveHeadingId = string.Empty;
    private int _savedOutlineWidth = OutlineDefaultWidth;

    private const int MaxOutlineLevel = 6;

    private System.Windows.Forms.Timer? _outlineHighlightTimer;
    private System.Windows.Forms.Timer? _outlineUpdateTimer;
    private int _outlineUpdateGeneration;
    private bool _outlineUpdateInProgress;
    private bool _saveInProgress;
    private bool _isClosing;
    private bool _initialLoginPromptShown;
    private string? _pendingWspImportPath;

    private ToolStripButton? _toolbarInfoButton;
    private ToolStripButton? _toolbarOutlineButton;

    private ContextMenuStrip? _ctxEditor;

    public MainForm(string[]? args = null)
    {
        _pendingWspImportPath = StartupArguments.TryGetWspImportPath(args);
        InitializeComponent();
        FramelessWindowHelper.Configure(this);
        titleBar.Attach(this);
        ApplyLayoutConstraints();
        KeyPreview = true;
        ApplyStartupTheme();
        AppTheme.Changed += OnAppThemeChanged;
        Localization.Changed += OnLocalizationChanged;
        FormClosed += (_, _) =>
        {
            AppTheme.Changed -= OnAppThemeChanged;
            Localization.Changed -= OnLocalizationChanged;
        };
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        ApplyLayoutConstraints();
        ApplyStartupTheme();
    }

    private void OnAppThemeChanged()
    {
        if (IsDisposed)
            return;

        if (InvokeRequired)
        {
            BeginInvoke(ApplyModernTheme);
            return;
        }

        ApplyModernTheme();
    }

    private void OnLocalizationChanged()
    {
        if (IsDisposed)
            return;

        if (InvokeRequired)
        {
            BeginInvoke(ApplyLocalization);
            return;
        }

        ApplyLocalization();
    }

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);

        if (_initialLoginPromptShown)
            return;

        _initialLoginPromptShown = true;
        BeginInvoke(ShowLoginDialog);
    }

    protected override void OnDeactivate(EventArgs e)
    {
        base.OnDeactivate(e);
        if (_navMenuOpen || _openEditorOverlayCount > 0)
            return;

        _editor?.ResetScriptSuspension();
    }

    private async void MainForm_Load(object sender, EventArgs e)
    {
        treeWorkspace.ImageList = TreeIcons.CreateImageList();
        treeOutline.ImageList = OutlineIcons.CreateImageList();

        AppIcons.ApplyMenuIcons(
            menuSavePage, menuPageHistory, menuRefreshTree, menuLogin, menuLogout, menuAbout, menuExit,
            menuPreferences, menuDocumentStructure, menuNewRootWorkspace, menuNewSubWorkspace, menuNewPage, menuRename, menuDelete,
            menuWorkspaceMembers, menuAdminUserManagement, menuAdminDatabaseSettings,
            menuAdminEmailSettings, menuEditProfile, menuChangePassword, menuNotificationSettings,
            ctxNewRootWorkspace, ctxNewSubWorkspace, ctxNewPage, ctxRename, ctxDelete, ctxToggleFavorite,
            ctxToggleWorkspaceLock, ctxTogglePageLock, ctxMembers);

        EnsureWorkspaceArchiveMenuItems();
        EnsureWorkspaceExportMenuItems();

        menuView.Image = menuDocumentStructure.Image;

        InitializeEditor();
        InitializeNavRail();
        InitializeAppSettingsMenu();
        SetupEditorContextMenu();
        HookMenuScriptSuspension();

        menuFile.Image = AppIcons.LoadMenuIcon("file");
        menuWorkspace.Image = menuNewRootWorkspace.Image;
        menuAdmin.Image = menuAdminUserManagement.Image;

        SetupWysiwygToolbar();

        SetupTreeDragDrop();

        treeWorkspace.RightNodeClick += treeWorkspace_RightNodeClick;

        editorAreaSplit.SplitterMoved += (_, _) =>
        {
            if (!editorAreaSplit.Panel1Collapsed)
                _savedOutlineWidth = editorAreaSplit.SplitterDistance;
        };

        _outlineUpdateTimer = new System.Windows.Forms.Timer(components) { Interval = 450 };
        _outlineUpdateTimer.Tick += async (_, _) =>
        {
            _outlineUpdateTimer!.Stop();
            if (_editor == null || _editor.IsScriptSuspended || _outlineUpdateInProgress)
            {
                ScheduleOutlineUpdate();
                return;
            }

            _outlineUpdateInProgress = true;
            try
            {
                await UpdateOutlineAsync();
            }
            finally
            {
                _outlineUpdateInProgress = false;
            }
        };

        _outlineHighlightTimer = new System.Windows.Forms.Timer(components) { Interval = 350 };
        _outlineHighlightTimer.Tick += async (_, _) =>
        {
            _outlineHighlightTimer!.Stop();
            if (_editor == null || _editor.IsScriptSuspended)
            {
                ScheduleOutlineHighlight();
                return;
            }

            await HighlightActiveOutlineAsync();
        };

        saveTimer.Tick += async (_, _) =>
        {
            saveTimer.Stop();
            await SaveCurrentPageAsync(showStatus: true, refreshTree: true);
        };

        try
        {
            await _editor!.InitializeAsync(_pipeline);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.EditorInitFailed), ex);
        }

        ApplyModernTheme();
        ApplyLocalization();
        ApplyLoggedOutState();
    }

    private void ShowLoginDialog()
    {
        using var loginForm = new LoginForm();
        loginForm.StartPosition = FormStartPosition.CenterParent;
        if (loginForm.ShowDialog(this) == DialogResult.OK && loginForm.LoggedInUser != null)
        {
            SessionContext.SetUser(loginForm.LoggedInUser);
            ApplyLoggedInState();
        }
    }

    private void menuLogin_Click(object? sender, EventArgs e) => ShowLoginDialog();

    private void ApplyLoggedOutState()
    {
        _ = ClearEditorImmediateAsync();
        SessionContext.Clear();
        UpdateTitleBarCaption();
        lblStatus.Text = Localization.Get(K.StatusLoginRequired);
        SetSaveStatus(SaveStatusKind.None);

        treeWorkspace.Nodes.Clear();
        ClearOutlinePanel();
        _currentPageId = null;
        _draftWorkspaceId = null;
        _currentPageTitle = string.Empty;
        _isDirty = false;

        SetShellEnabled(false);
        UpdateEditorChromeEnabled();
        UpdateMenuForLoginState(false);
        ApplyStartupTheme();
        ApplyEditorHostTheme();
        UpdateEditorEmptySurface();
    }

    private void ApplyLoggedInState()
    {
        UpdateTitleBarCaption();
        lblStatus.Text = AppConfig.IsOfflineFallbackActive
            ? Localization.Get(K.StatusOfflineFallbackMode)
            : SessionContext.IsAdmin
                ? Localization.Get(K.StatusAdmin)
                : Localization.Get(K.StatusUser);

        SetShellEnabled(true);
        UpdateEditorChromeEnabled();
        UpdateMenuForLoginState(true);

        var hadPendingImport = !string.IsNullOrWhiteSpace(_pendingWspImportPath);
        var lastPageId = TryResolveRestorableLastPageId();

        _suppressWorkspaceSelection = true;
        try
        {
            LoadWorkspaceTree(selectPageId: lastPageId);
        }
        finally
        {
            _suppressWorkspaceSelection = false;
        }

        TryImportPendingWspIfAny();

        if (!hadPendingImport && lastPageId.HasValue)
            _ = RestoreLastActivePageAsync(lastPageId.Value);
    }

    private int? TryResolveRestorableLastPageId()
    {
        if (!SessionContext.IsLoggedIn)
            return null;

        var pageId = AppConfig.GetLastActivePageId(SessionContext.CurrentUser.Id);
        if (!pageId.HasValue)
            return null;

        return AppConfig.Services.Pages.GetById(SessionContext.CurrentUser, pageId.Value)?.Id;
    }

    private async Task RestoreLastActivePageAsync(int pageId)
    {
        if (_editor == null || _currentPageId == pageId)
            return;

        await LoadPageAsync(pageId);
    }

    private void RecordCurrentPageForSession()
    {
        if (!SessionContext.IsLoggedIn || !_currentPageId.HasValue)
            return;

        AppConfig.RecordLastActivePage(SessionContext.CurrentUser.Id, _currentPageId.Value);
    }

    private void SetShellEnabled(bool enabled)
    {
        foreach (ToolStripItem item in toolStripMarkdown.Items)
        {
            if (ReferenceEquals(item, _toolbarInfoButton) || ReferenceEquals(item, _toolbarOutlineButton))
            {
                item.Enabled = true;
                continue;
            }

            item.Enabled = enabled;
        }
    }

    private void UpdateEditorChromeEnabled()
    {
        var enabled = SessionContext.IsLoggedIn
                      && (_currentPageId.HasValue || _draftWorkspaceId.HasValue)
                      && CanEditActivePage();
        foreach (ToolStripItem item in toolStripMarkdown.Items)
        {
            if (ReferenceEquals(item, _toolbarInfoButton) || ReferenceEquals(item, _toolbarOutlineButton))
            {
                item.Enabled = true;
                continue;
            }

            item.Enabled = enabled;
        }

        if (_ctxEditor == null)
            return;

        foreach (ToolStripItem item in _ctxEditor.Items)
        {
            if (item is ToolStripSeparator)
                continue;

            if (item.Tag is string key && key == K.ToolbarDocumentStructure)
            {
                item.Enabled = true;
                continue;
            }

            item.Enabled = enabled;
        }
    }

    private void UpdateMenuForLoginState(bool loggedIn)
    {
        menuSavePage.Visible = loggedIn;
        menuPageHistory.Visible = loggedIn;
        menuRefreshTree.Visible = loggedIn;
        if (menuSepWorkspaceArchive != null)
            menuSepWorkspaceArchive.Visible = loggedIn;
        if (menuSaveWorkspace != null)
            menuSaveWorkspace.Visible = loggedIn;
        if (menuLoadWorkspace != null)
            menuLoadWorkspace.Visible = loggedIn;
        if (menuExportWorkspace != null)
            menuExportWorkspace.Visible = loggedIn;
        menuSepFile1.Visible = loggedIn;
        menuLogin.Visible = !loggedIn;
        menuLogout.Visible = loggedIn;
        menuSepAccount1.Visible = loggedIn;
        menuEditProfile.Visible = loggedIn;
        menuChangePassword.Visible = loggedIn;
        menuNotificationSettings.Visible = loggedIn;
        menuWorkspace.Visible = loggedIn;
        menuView.Visible = true;
        menuDocumentStructure.Visible = true;
        menuDocumentStructure.Enabled = true;

        menuAdmin.Visible = loggedIn && SessionContext.IsAdmin;
        menuAdminUserManagement.Visible = loggedIn && SessionContext.IsAdmin;
        menuAdminDatabaseSettings.Visible = loggedIn && SessionContext.IsAdmin;
        menuAdminEmailSettings.Visible = loggedIn && SessionContext.IsAdmin;
        UpdateNavRailForLoginState(loggedIn);
        RefreshMenuTheme();
    }

    private void RefreshMenuTheme()
    {
        AppTheme.ApplyMenuStrip(menuStrip1);
        AppTheme.StyleContextMenu(ctxTree);
        AppTheme.StyleContextMenu(ctxAppSettings);
        if (_ctxEditor != null)
            AppTheme.StyleContextMenu(_ctxEditor);

        AppIcons.ApplyMenuIcons(
            menuSavePage, menuPageHistory, menuRefreshTree, menuLogin, menuLogout, menuAbout, menuExit,
            menuPreferences, menuDocumentStructure, menuNewRootWorkspace, menuNewSubWorkspace, menuNewPage, menuRename, menuDelete,
            menuWorkspaceMembers, menuAdminUserManagement, menuAdminDatabaseSettings,
            menuAdminEmailSettings, menuEditProfile, menuChangePassword, menuNotificationSettings,
            ctxNewRootWorkspace, ctxNewSubWorkspace, ctxNewPage, ctxRename, ctxDelete, ctxToggleFavorite,
            ctxToggleWorkspaceLock, ctxTogglePageLock, ctxMembers);
    }

    private void OnEditorContentChanged()
    {
        if (InvokeRequired)
        {
            BeginInvoke(OnEditorContentChanged);
            return;
        }

        _ = OnEditorContentChangedAsync();
    }

    private async Task OnEditorContentChangedAsync()
    {
        await SyncPageTitleFromEditorAsync();
        await MarkPageDirtyAsync();
        ScheduleOutlineUpdate();
    }

    private void OnEditorCaretMoved()
    {
        if (_editor == null || _editor.IsScriptSuspended)
            return;

        ScheduleOutlineHighlight();
    }

    private void HookMenuScriptSuspension()
    {
        HookDropDownScriptSuspension(ctxTree);
    }

    private int _openEditorOverlayCount;

    private void EnterEditorOverlay()
    {
        _openEditorOverlayCount++;
        _editor?.SuspendScripts();
    }

    private void ExitEditorOverlay()
    {
        if (_openEditorOverlayCount > 0)
            _openEditorOverlayCount--;

        _editor?.ResumeScripts();
        ScheduleOutlineUpdate();
        ScheduleOutlineHighlight();
    }

    private void HookDropDownScriptSuspension(ToolStripDropDown dropDown)
    {
        dropDown.Opening += (_, _) => EnterEditorOverlay();
        dropDown.Closed += (_, _) => ExitEditorOverlay();

        foreach (ToolStripItem item in dropDown.Items)
        {
            if (item is ToolStripMenuItem menuItem && menuItem.HasDropDownItems)
                HookDropDownScriptSuspension(menuItem.DropDown);
        }
    }

    private void SetupEditorContextMenu()
    {
        _ctxEditor = new ContextMenuStrip(components);
        _ctxEditor.Opening += (_, _) => EnterEditorOverlay();
        _ctxEditor.Closed += (_, _) => ExitEditorOverlay();

        AddEditorMenuItem(K.EditorCut, Keys.Control | Keys.X, async (_, _) => await RunEditorAsync(e => e.CutAsync()), "cut");
        AddEditorMenuItem(K.EditorCopy, Keys.Control | Keys.C, async (_, _) => await RunEditorAsync(e => e.CopyAsync()), "copy");
        AddEditorMenuItem(K.EditorPaste, Keys.Control | Keys.V, async (_, _) => await RunEditorAsync(e => e.PasteAsync()), "paste");
        _ctxEditor.Items.Add(new ToolStripSeparator());
        AddEditorMenuItem(K.EditorSelectAll, Keys.Control | Keys.A, async (_, _) => await RunEditorAsync(e => e.SelectAllAsync()), "selectall");
        _ctxEditor.Items.Add(new ToolStripSeparator());
        AddEditorMenuItem(K.ToolbarUndo, Keys.Control | Keys.Z, async (_, _) => await RunEditorAsync(e => e.UndoAsync()), "undo");
        AddEditorMenuItem(K.ToolbarRedo, Keys.Control | Keys.Y, async (_, _) => await RunEditorAsync(e => e.RedoAsync()), "redo");
        _ctxEditor.Items.Add(new ToolStripSeparator());
        AddEditorMenuItem(K.ToolbarHeading1, null, async (_, _) => await RunEditorAsync(e => e.ApplyHeadingAsync(1)), "h1");
        AddEditorMenuItem(K.ToolbarHeading2, null, async (_, _) => await RunEditorAsync(e => e.ApplyHeadingAsync(2)), "h2");
        AddEditorMenuItem(K.ToolbarHeading3, null, async (_, _) => await RunEditorAsync(e => e.ApplyHeadingAsync(3)), "h3");
        AddEditorMenuItem(K.ToolbarHeading4, null, async (_, _) => await RunEditorAsync(e => e.ApplyHeadingAsync(4)), "h4");
        AddEditorMenuItem(K.ToolbarHeading5, null, async (_, _) => await RunEditorAsync(e => e.ApplyHeadingAsync(5)), "h5");
        AddEditorMenuItem(K.ToolbarHeading6, null, async (_, _) => await RunEditorAsync(e => e.ApplyHeadingAsync(6)), "h6");
        _ctxEditor.Items.Add(new ToolStripSeparator());
        AddEditorMenuItem(K.EditorBold, Keys.Control | Keys.B, async (_, _) => await RunEditorAsync(e => e.ApplyFormatAsync("bold")), "bold");
        AddEditorMenuItem(K.EditorItalic, Keys.Control | Keys.I, async (_, _) => await RunEditorAsync(e => e.ApplyFormatAsync("italic")), "italic");
        AddEditorMenuItem(K.ToolbarStrike, null, async (_, _) => await RunEditorAsync(e => e.ApplyFormatAsync("strikeThrough")), "strike");
        _ctxEditor.Items.Add(new ToolStripSeparator());
        AddEditorMenuItem(K.ToolbarInlineCode, null, async (_, _) => await RunEditorAsync(e => e.WrapInlineCodeAsync()), "code");
        AddEditorMenuItem(K.ToolbarCodeBlock, null, async (_, _) =>
            await RunEditorAsync(e => e.InsertHtmlAsync($"<pre><code>{Localization.Get(K.DefaultCodeText)}</code></pre><p><br></p>")), "codeblock");
        _ctxEditor.Items.Add(new ToolStripSeparator());
        AddEditorMenuItem(K.ToolbarLink, null, async (_, _) => await InsertLinkAsync(), "link");
        AddEditorMenuItem(K.ToolbarImage, null, async (_, _) => await InsertImageAsync(), "image");
        AddEditorMenuItem(K.ToolbarAttachFile, null, async (_, _) => await InsertFileAsync(), "attach");
        _ctxEditor.Items.Add(new ToolStripSeparator());
        AddEditorMenuItem(K.ToolbarBulletList, null, async (_, _) => await RunEditorAsync(e => e.ApplyFormatAsync("insertUnorderedList")), "ul");
        AddEditorMenuItem(K.ToolbarNumberList, null, async (_, _) => await RunEditorAsync(e => e.ApplyFormatAsync("insertOrderedList")), "ol");
        AddEditorMenuItem(K.ToolbarQuote, null, async (_, _) => await RunEditorAsync(e => e.ApplyBlockquoteAsync()), "quote");
        _ctxEditor.Items.Add(new ToolStripSeparator());
        AddEditorMenuItem(K.ToolbarHorizontalRule, null, async (_, _) => await RunEditorAsync(e => e.InsertHtmlAsync("<hr/><p><br></p>")), "hr");
        AddEditorMenuItem(K.ToolbarTable, null, async (_, _) =>
            await RunEditorAsync(e => e.InsertHtmlAsync(
                $"""<table><thead><tr><th>{Localization.Get(K.TableHeader1)}</th><th>{Localization.Get(K.TableHeader2)}</th></tr></thead><tbody><tr><td></td><td></td></tr></tbody></table><p><br></p>""")), "table");
        _ctxEditor.Items.Add(new ToolStripSeparator());
        AddEditorMenuItem(K.ToolbarDocumentStructure, null, (_, _) => ToggleOutlinePanel(), "outline");

        AppTheme.StyleContextMenu(_ctxEditor);
    }

    private void SetupEditorContextMenuTexts()
    {
        if (_ctxEditor == null)
            return;

        foreach (ToolStripItem item in _ctxEditor.Items)
        {
            if (item.Tag is string key)
                item.Text = Localization.Get(key);
        }
    }

    private void AddEditorMenuItem(string textKey, Keys? shortcut, EventHandler click, string? iconName = null)
    {
        var item = new ToolStripMenuItem(Localization.Get(textKey))
        {
            Tag = textKey,
            ShowShortcutKeys = shortcut.HasValue
        };
        if (shortcut.HasValue)
            item.ShortcutKeys = shortcut.Value;
        if (!string.IsNullOrEmpty(iconName))
        {
            item.Name = $"ctx_{iconName}";
            item.Image = IconAssets.LoadMonochrome(16, iconName);
        }

        item.Click += click;
        _ctxEditor!.Items.Add(item);
    }

    private void RefreshEditorContextMenuIcons()
    {
        if (_ctxEditor == null)
            return;

        foreach (ToolStripItem item in _ctxEditor.Items)
        {
            if (item is not ToolStripMenuItem menuItem
                || string.IsNullOrEmpty(menuItem.Name)
                || !menuItem.Name.StartsWith("ctx_", StringComparison.Ordinal))
                continue;

            var iconName = menuItem.Name["ctx_".Length..];
            menuItem.Image?.Dispose();
            menuItem.Image = IconAssets.LoadMonochrome(16, iconName);
        }
    }

    private void ScheduleOutlineUpdate()
    {
        if (_isLoadingPage || !_currentPageId.HasValue || _editor == null || _editor.IsScriptSuspended)
            return;

        _outlineUpdateTimer!.Stop();
        _outlineUpdateTimer.Start();
    }

    private void ScheduleOutlineHighlight()
    {
        if (_isLoadingPage || _suppressOutlineNavigation || _editor == null || _editor.IsScriptSuspended)
            return;

        _outlineHighlightTimer!.Stop();
        _outlineHighlightTimer.Start();
    }

    private void MarkPageDirty()
    {
        if (_isLoadingPage)
            return;

        _ = MarkPageDirtyAsync();
    }

    private async Task MarkPageDirtyAsync()
    {
        if (_isLoadingPage)
            return;

        if (!await EnsurePageCreatedAsync())
            return;

        if (!_currentPageId.HasValue)
            return;

        _isDirty = true;
        SetSaveStatus(SaveStatusKind.Modified);
        saveTimer.Stop();
        saveTimer.Start();
    }

    private void LoadWorkspaceTree(int? selectPageId = null, int? selectWorkspaceId = null)
    {
        if (!SessionContext.IsLoggedIn)
            return;

        treeWorkspace.BeginUpdate();
        try
        {
            treeWorkspace.Nodes.Clear();

            var favorites = AppConfig.Services.Workspaces.GetFavoriteWorkspaceTree(SessionContext.CurrentUser);
            if (favorites.Count > 0)
            {
                var favoritesRoot = new TreeNode(Localization.Get(K.FavoritesRoot))
                {
                    Tag = new TreeNodeData { Kind = TreeNodeKind.FavoritesRoot, Id = 0 },
                    ImageKey = "favorite",
                    SelectedImageKey = "favorite"
                };

                foreach (var item in favorites)
                    favoritesRoot.Nodes.Add(CreateTreeNode(item));

                treeWorkspace.Nodes.Add(favoritesRoot);
            }

            var items = AppConfig.Services.Workspaces.GetWorkspaceTree(SessionContext.CurrentUser);
            foreach (var item in items)
                treeWorkspace.Nodes.Add(CreateTreeNode(item));

            treeWorkspace.ExpandAll();

            var target = selectPageId.HasValue
                ? FindNode(treeWorkspace.Nodes, TreeNodeKind.Page, selectPageId.Value)
                : selectWorkspaceId.HasValue
                    ? FindNode(treeWorkspace.Nodes, TreeNodeKind.Workspace, selectWorkspaceId.Value)
                    : null;

            if (target != null && !ReferenceEquals(treeWorkspace.SelectedNode, target))
                treeWorkspace.SelectedNode = target;
        }
        finally
        {
            treeWorkspace.EndUpdate();
            treeWorkspace.CommitHorizontalScrollbarSuppression();
        }
    }

    private static TreeNode CreateTreeNode(WorkspaceTreeItem item)
    {
        var isWorkspace = item.Kind == TreeNodeKind.Workspace;
        var imageKey = isWorkspace
            ? TreeIcons.ResolveWorkspaceIconKey(item.IsFavorite, item.IsLocked)
            : TreeIcons.ResolvePageIconKey(item.IsLocked);

        var node = new TreeNode(item.Name)
        {
            Tag = new TreeNodeData
            {
                Kind = item.Kind,
                Id = item.Id,
                WorkspaceId = item.Kind == TreeNodeKind.Page ? item.ParentWorkspaceId : item.Id
            },
            ImageKey = imageKey,
            SelectedImageKey = imageKey
        };

        foreach (var child in item.Children)
            node.Nodes.Add(CreateTreeNode(child));

        return node;
    }

    private static TreeNode? FindNode(TreeNodeCollection nodes, TreeNodeKind kind, int id)
    {
        foreach (TreeNode node in nodes)
        {
            if (node.Tag is TreeNodeData data && data.Kind == kind && data.Id == id)
                return node;

            var found = FindNode(node.Nodes, kind, id);
            if (found != null)
                return found;
        }

        return null;
    }

    private void treeWorkspace_NodeMouseDoubleClick(object? sender, TreeNodeMouseClickEventArgs e)
    {
        if (e.Button != MouseButtons.Left || e.Node?.Tag is not TreeNodeData data)
            return;

        if (data.Kind is not (TreeNodeKind.Page or TreeNodeKind.Workspace))
            return;

        treeWorkspace.SelectedNode = e.Node;
        menuRename_Click(this, EventArgs.Empty);
    }

    private void treeWorkspace_AfterSelect(object sender, TreeViewEventArgs e)
    {
        if (_suppressWorkspaceSelection)
            return;

        if (e.Node?.Tag is not TreeNodeData data)
            return;

        if (data.Kind == TreeNodeKind.FavoritesRoot)
        {
            _ = ClearEditorAsync();
            return;
        }

        if (data.Kind == TreeNodeKind.Page)
        {
            if (_currentPageId == data.Id)
                return;

            _ = LoadPageAsync(data.Id);
            return;
        }

        if (data.Kind == TreeNodeKind.Workspace)
            return;
    }

    private async Task<bool> EnsurePageCreatedAsync()
    {
        if (_currentPageId.HasValue)
            return true;

        if (!_draftWorkspaceId.HasValue || !SessionContext.IsLoggedIn)
            return false;

        if (!CanEditWorkspace(_draftWorkspaceId))
            return false;

        if (_pageCreateInProgress)
            return false;

        _pageCreateInProgress = true;
        try
        {
            var content = _editor == null
                ? string.Empty
                : await _editor.GetMarkdownAsync();
            if (string.IsNullOrWhiteSpace(content))
                content = PageTitleHelper.CreateInitialMarkdown(Localization.Get(K.UntitledPageTitle));

            var title = PageTitleHelper.ExtractTitleFromMarkdown(content);

            var page = AppConfig.Services.Pages.CreatePage(
                SessionContext.CurrentUser,
                _draftWorkspaceId.Value,
                title,
                content);

            _currentPageId = page.Id;
            _draftWorkspaceId = null;
            _currentPageTitle = title;
            _isDirty = false;

            _suppressWorkspaceSelection = true;
            try
            {
                LoadWorkspaceTree(selectPageId: page.Id);
            }
            finally
            {
                _suppressWorkspaceSelection = false;
            }

            lblStatus.Text = Localization.Format(K.StatusPage, title);
            await UpdateOutlineAsync();
            RecordCurrentPageForSession();
            return true;
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, L.AppName, ex);
            return false;
        }
        finally
        {
            _pageCreateInProgress = false;
        }
    }

    private void ClearOutlinePanel()
    {
        treeOutline.SetActiveNodeKey(null);
        treeOutline.BeginUpdate();
        try
        {
            treeOutline.Nodes.Clear();
        }
        finally
        {
            treeOutline.EndUpdate();
            treeOutline.CommitHorizontalScrollbarSuppression();
        }
    }

    private async Task UpdateOutlineAsync()
    {
        if (!_currentPageId.HasValue || _editor == null || !_editor.IsReady)
        {
            ClearOutlinePanel();
            return;
        }

        if (_editor.IsScriptSuspended)
        {
            ScheduleOutlineUpdate();
            return;
        }

        var generation = ++_outlineUpdateGeneration;
        var headings = await _editor.GetHeadingsAsync();
        if (generation != _outlineUpdateGeneration)
            return;

        var preserveId = (treeOutline.SelectedNode?.Tag as OutlineTarget)?.HeadingId
                         ?? _lastActiveHeadingId;

        if (TryUpdateOutlineInPlace(headings, preserveId))
        {
            if (!string.IsNullOrWhiteSpace(preserveId))
                treeOutline.SetActiveNodeKey(preserveId);
            return;
        }

        _suppressOutlineNavigation = true;
        treeOutline.BeginUpdate();
        treeOutline.Nodes.Clear();

        var stack = new List<(int level, TreeNode? node)>();
        foreach (var heading in headings)
        {
            if (heading.Level > MaxOutlineLevel)
                continue;

            var label = string.IsNullOrWhiteSpace(heading.Text)
                ? Localization.Get(K.OutlineUntitled)
                : heading.Text.Trim();

            while (stack.Count > 0 && stack[^1].level >= heading.Level)
                stack.RemoveAt(stack.Count - 1);

            var key = OutlineIcons.LevelToKey(heading.Level);
            var node = new TreeNode(label)
            {
                Tag = new OutlineTarget(heading.Id),
                ImageKey = key,
                SelectedImageKey = key
            };

            TreeNode? parent = null;
            for (var s = stack.Count - 1; s >= 0; s--)
            {
                if (stack[s].node is TreeNode p)
                {
                    parent = p;
                    break;
                }
            }

            if (parent == null)
                treeOutline.Nodes.Add(node);
            else
                parent.Nodes.Add(node);

            stack.Add((heading.Level, node));
        }

        treeOutline.ExpandAll();

        if (!string.IsNullOrWhiteSpace(preserveId))
        {
            var node = FindOutlineNode(treeOutline.Nodes, preserveId);
            if (node != null && !ReferenceEquals(treeOutline.SelectedNode, node))
                treeOutline.SelectedNode = node;
            treeOutline.SetActiveNodeKey(preserveId);
        }

        treeOutline.EndUpdate();
        treeOutline.CommitHorizontalScrollbarSuppression();
        _suppressOutlineNavigation = false;
    }

    private bool TryUpdateOutlineInPlace(IReadOnlyList<EditorHeading> headings, string? preserveId)
    {
        var filtered = headings.Where(static h => h.Level <= MaxOutlineLevel).ToList();
        var existing = FlattenOutlineNodes(treeOutline.Nodes);
        if (existing.Count != filtered.Count)
            return false;

        for (var i = 0; i < filtered.Count; i++)
        {
            if (existing[i].Tag is not OutlineTarget target ||
                !string.Equals(target.HeadingId, filtered[i].Id, StringComparison.Ordinal))
            {
                return false;
            }
        }

        treeOutline.BeginUpdate();
        try
        {
            for (var i = 0; i < filtered.Count; i++)
            {
                var label = string.IsNullOrWhiteSpace(filtered[i].Text)
                    ? Localization.Get(K.OutlineUntitled)
                    : filtered[i].Text.Trim();
                if (existing[i].Text != label)
                    existing[i].Text = label;
            }
        }
        finally
        {
            treeOutline.EndUpdate();
            treeOutline.CommitHorizontalScrollbarSuppression();
        }

        return true;
    }

    private static List<TreeNode> FlattenOutlineNodes(TreeNodeCollection nodes)
    {
        var list = new List<TreeNode>();
        CollectOutlineNodes(nodes, list);
        return list;
    }

    private static void CollectOutlineNodes(TreeNodeCollection nodes, List<TreeNode> destination)
    {
        foreach (TreeNode node in nodes)
        {
            destination.Add(node);
            CollectOutlineNodes(node.Nodes, destination);
        }
    }

    private void treeOutline_AfterSelect(object? sender, TreeViewEventArgs e)
    {
        if (_suppressOutlineNavigation)
            return;

        if (e.Node?.Tag is OutlineTarget target)
        {
            _lastActiveHeadingId = target.HeadingId;
            treeOutline.SetActiveNodeKey(target.HeadingId);
            _ = NavigateToOutlineTargetAsync(target);
        }
    }

    private async Task NavigateToOutlineTargetAsync(OutlineTarget target)
    {
        if (string.IsNullOrWhiteSpace(target.HeadingId))
            return;

        _lastActiveHeadingId = target.HeadingId;
        if (_editor != null)
            await _editor.ScrollToHeadingAsync(target.HeadingId);
    }

    private async Task HighlightActiveOutlineAsync()
    {
        if (_editor == null || !_editor.IsReady || _suppressOutlineNavigation || _editor.IsScriptSuspended)
            return;

        var activeId = await _editor.GetActiveHeadingIdAsync();
        if (string.IsNullOrWhiteSpace(activeId) || activeId == _lastActiveHeadingId)
            return;

        _lastActiveHeadingId = activeId;
        treeOutline.SetActiveNodeKey(activeId);

        var node = FindOutlineNode(treeOutline.Nodes, activeId);
        node?.EnsureVisible();
    }

    private static TreeNode? FindOutlineNode(TreeNodeCollection nodes, string headingId)
    {
        foreach (TreeNode node in nodes)
        {
            if (node.Tag is OutlineTarget target && target.HeadingId == headingId)
                return node;

            var found = FindOutlineNode(node.Nodes, headingId);
            if (found != null)
                return found;
        }

        return null;
    }

    private void ShowAboutDialog()
    {
        using var form = new AboutForm();
        form.ShowDialog(this);
    }

    private void menuAbout_Click(object? sender, EventArgs e) => ShowAboutDialog();

    private void ToggleOutlinePanel()
    {
        if (editorAreaSplit.Panel1Collapsed)
        {
            editorAreaSplit.Panel1Collapsed = false;
            BeginInvoke(() =>
            {
                if (_savedOutlineWidth < editorAreaSplit.Panel1MinSize)
                    _savedOutlineWidth = editorAreaSplit.Panel1MinSize;
                editorAreaSplit.SplitterDistance = _savedOutlineWidth;
            });
        }
        else
        {
            _savedOutlineWidth = editorAreaSplit.SplitterDistance;
            editorAreaSplit.Panel1Collapsed = true;
        }

        UpdateOutlineToggleButtonText();
        UpdateLayoutConstraints(includeOutlinePanel: !editorAreaSplit.Panel1Collapsed);
    }

    private void menuPageHistory_Click(object sender, EventArgs e)
    {
        if (!_currentPageId.HasValue)
        {
            MessageBox.Show(Localization.Get(K.SelectPage), L.AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        _ = OpenPageHistoryAsync();
    }

    private async Task OpenPageHistoryAsync()
    {
        await SaveCurrentPageAsync(refreshTree: false);

        var pageTitle = string.IsNullOrWhiteSpace(_currentPageTitle)
            ? Localization.Get(K.UntitledPageTitle)
            : _currentPageTitle.Trim();
        using var form = new PageHistoryForm(_currentPageId!.Value, pageTitle);
        if (form.ShowDialog() == DialogResult.OK && form.Restored && _currentPageId.HasValue)
            await ReloadCurrentPageAsync();
    }

    private void SaveCurrentPage(bool showStatus = false, bool refreshTree = false) =>
        _ = SaveCurrentPageAsync(showStatus, refreshTree);

    private TreeNodeData? GetSelectedNodeData() =>
        treeWorkspace.SelectedNode?.Tag as TreeNodeData;

    private TreeNodeData? GetWorkspaceContextMenuNodeData() =>
        (_workspaceContextMenuNode ?? treeWorkspace.SelectedNode)?.Tag as TreeNodeData;

    private int? GetSelectedWorkspaceId()
    {
        var data = GetSelectedNodeData();
        if (data == null)
            return null;

        return data.Kind == TreeNodeKind.Workspace ? data.Id : data.WorkspaceId;
    }

    private async void menuSavePage_Click(object sender, EventArgs e)
    {
        if (!await EnsurePageCreatedAsync() || !_currentPageId.HasValue)
        {
            MessageBox.Show(Localization.Get(K.SelectPageToSave), L.AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        await SaveCurrentPageAsync(showStatus: true, refreshTree: true);
        SetSaveStatus(SaveStatusKind.Saved);
    }

    private void menuNewRootWorkspace_Click(object sender, EventArgs e) =>
        CreateWorkspace(null);

    private void menuNewSubWorkspace_Click(object sender, EventArgs e)
    {
        var data = GetSelectedNodeData();
        if (data?.Kind != TreeNodeKind.Workspace)
        {
            MessageBox.Show(
                Localization.Get(K.SelectWorkspaceForSub),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        CreateWorkspace(data.Id);
    }

    private void CreateWorkspace(int? parentId)
    {
        using var dialog = new InputDialogForm(
            parentId.HasValue ? Localization.Get(K.NewSubWorkspace) : Localization.Get(K.NewWorkspace),
            Localization.Get(K.WorkspaceNamePrompt));
        if (dialog.ShowDialog() != DialogResult.OK)
            return;

        try
        {
            var workspace = AppConfig.Services.Workspaces.CreateWorkspace(SessionContext.CurrentUser, dialog.InputText, parentId);
            LoadWorkspaceTree(selectWorkspaceId: workspace.Id);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, L.AppName, ex);
        }
    }

    private void menuNewPage_Click(object sender, EventArgs e)
    {
        var workspaceId = GetSelectedWorkspaceId();
        if (!workspaceId.HasValue)
        {
            MessageBox.Show(Localization.Get(K.SelectWorkspaceForPage), L.AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var dialog = new NewPageForm();
        if (dialog.ShowDialog() != DialogResult.OK)
            return;

        try
        {
            var page = AppConfig.Services.Pages.CreatePage(
                SessionContext.CurrentUser,
                workspaceId.Value,
                dialog.PageTitle,
                dialog.PageContent);
            LoadWorkspaceTree(selectPageId: page.Id);
            _ = LoadPageAsync(page.Id);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, L.AppName, ex);
        }
    }

    private async void menuRename_Click(object sender, EventArgs e)
    {
        var data = GetSelectedNodeData();
        if (data == null)
        {
            MessageBox.Show(Localization.Get(K.SelectWorkspaceOrPage), L.AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (data.Kind == TreeNodeKind.Workspace)
        {
            using var dialog = new InputDialogForm(
                Localization.Get(K.RenameWorkspaceTitle),
                Localization.Get(K.NewNamePrompt),
                treeWorkspace.SelectedNode?.Text);
            if (dialog.ShowDialog() != DialogResult.OK)
                return;

            try
            {
                AppConfig.Services.Workspaces.RenameWorkspace(SessionContext.CurrentUser, data.Id, dialog.InputText);
                LoadWorkspaceTree(selectWorkspaceId: data.Id);
            }
            catch (Exception ex)
            {
                ErrorDetailForm.Show(this, L.AppName, ex);
            }

            return;
        }

        using var pageDialog = new InputDialogForm(
            Localization.Get(K.RenamePageTitle),
            Localization.Get(K.NewTitlePrompt),
            treeWorkspace.SelectedNode?.Text);
        if (pageDialog.ShowDialog() != DialogResult.OK)
            return;

        try
        {
            var newTitle = pageDialog.InputText.Trim();
            string content;
            if (_currentPageId == data.Id && _editor != null)
            {
                await _editor.SetFirstHeadingTitleAsync(newTitle);
                content = await _editor.GetMarkdownAsync(data.Id);
            }
            else
            {
                var page = AppConfig.Services.Pages.GetById(SessionContext.CurrentUser, data.Id);
                content = PageTitleHelper.ReplaceFirstHeadingTitle(page?.Content ?? string.Empty, newTitle);
            }

            AppConfigPageSave.TrySavePage(
                SessionContext.CurrentUser,
                data.Id,
                newTitle,
                content,
                _currentPageId == data.Id ? _offlinePageContext : OfflinePageContextBuilder.TryBuild(
                    AppConfig.Services,
                    SessionContext.CurrentUser,
                    data.Id));

            if (_currentPageId == data.Id)
            {
                _currentPageTitle = newTitle;
                _isDirty = false;
            }

            LoadWorkspaceTree(selectPageId: data.Id);
            lblStatus.Text = Localization.Format(K.StatusPage, newTitle);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, L.AppName, ex);
        }
    }

    private void menuDelete_Click(object sender, EventArgs e)
    {
        var data = GetSelectedNodeData();
        if (data?.Kind is not (TreeNodeKind.Page or TreeNodeKind.Workspace))
            return;

        if (!CanDeleteTreeNode(data))
            return;

        if (data.Kind == TreeNodeKind.Page)
        {
            if (MessageBox.Show(
                    Localization.Get(K.ConfirmDeletePage),
                    Localization.Get(K.Confirm),
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question) != DialogResult.Yes)
                return;

            try
            {
                SaveCurrentPage(refreshTree: false);
                AppConfig.Services.Pages.DeletePage(SessionContext.CurrentUser, data.Id);
                if (_currentPageId == data.Id)
                    _ = ClearEditorImmediateAsync();
                LoadWorkspaceTree();
            }
            catch (Exception ex)
            {
                ErrorDetailForm.Show(this, L.AppName, ex);
            }

            return;
        }

        if (MessageBox.Show(
                Localization.Get(K.ConfirmDeleteWorkspace),
                Localization.Get(K.Confirm),
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question) != DialogResult.Yes)
            return;

        try
        {
            AppConfig.Services.Workspaces.DeleteWorkspace(SessionContext.CurrentUser, data.Id);
            _ = ClearEditorAsync();
            LoadWorkspaceTree();
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, L.AppName, ex);
        }
    }

    private void menuWorkspaceMembers_Click(object sender, EventArgs e)
    {
        var workspaceId = GetSelectedWorkspaceId();
        if (!workspaceId.HasValue)
        {
            MessageBox.Show(Localization.Get(K.SelectWorkspace), L.AppName, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var form = new WorkspaceMemberForm(workspaceId.Value);
        form.ShowDialog();
    }

    private void menuAdminUserManagement_Click(object sender, EventArgs e)
    {
        using var form = new AdminUserForm();
        form.ShowDialog();
    }

    private void menuEditProfile_Click(object sender, EventArgs e)
    {
        using var form = new AccountProfileForm();
        if (form.ShowDialog() == DialogResult.OK)
            UpdateTitleBarCaption();
    }

    private void menuChangePassword_Click(object sender, EventArgs e)
    {
        using var form = new ChangePasswordForm();
        form.ShowDialog();
    }

    private void menuNotificationSettings_Click(object sender, EventArgs e)
    {
        using var form = new NotificationSettingsForm();
        form.ShowDialog();
    }

    private void menuAdminEmailSettings_Click(object sender, EventArgs e)
    {
        using var form = new EmailSettingsForm();
        form.ShowDialog();
    }

    private void treeWorkspace_RightNodeClick(object? sender, TreeViewRightClickEventArgs e) =>
        ShowWorkspaceContextMenu(e.Node, e.Location);

    private void ShowWorkspaceContextMenu(TreeNode? node, Point location)
    {
        if (!SessionContext.IsLoggedIn)
            return;

        _workspaceContextMenuNode = node;

        if (node != null && !ReferenceEquals(treeWorkspace.SelectedNode, node))
        {
            _suppressWorkspaceSelection = true;
            try
            {
                treeWorkspace.SelectedNode = node;
            }
            finally
            {
                _suppressWorkspaceSelection = false;
            }
        }
        else if (node == null)
        {
            _suppressWorkspaceSelection = true;
            try
            {
                treeWorkspace.SelectedNode = null;
            }
            finally
            {
                _suppressWorkspaceSelection = false;
            }
        }

        ConfigureWorkspaceContextMenu();
        ctxTree.Show(treeWorkspace, location);
    }

    private void ctxTree_Closed(object? sender, ToolStripDropDownClosedEventArgs e) =>
        _workspaceContextMenuNode = null;

    private void ConfigureWorkspaceContextMenu()
    {
        var data = GetWorkspaceContextMenuNodeData();
        var isEmptyArea = data == null;
        var isFavoritesRoot = data?.Kind == TreeNodeKind.FavoritesRoot;
        var isWorkspace = data?.Kind == TreeNodeKind.Workspace;
        var isPageOrWorkspace = data?.Kind is TreeNodeKind.Workspace or TreeNodeKind.Page;

        ctxNewRootWorkspace.Visible = isEmptyArea || isFavoritesRoot;
        ctxNewSubWorkspace.Visible = isWorkspace;
        ctxNewPage.Visible = isPageOrWorkspace;
        ctxRename.Visible = isPageOrWorkspace;
        ctxDelete.Visible = isPageOrWorkspace;
        ctxSep1.Visible = isPageOrWorkspace;
        ctxSep2.Visible = isPageOrWorkspace;
        ctxMembers.Visible = isWorkspace;

        var canFavorite = false;
        if (isWorkspace && data!.Id > 0)
        {
            try
            {
                canFavorite = AppConfig.Services.Workspaces.CanFavoriteWorkspace(SessionContext.CurrentUser, data.Id);
            }
            catch
            {
                canFavorite = false;
            }
        }

        ctxToggleFavorite.Visible = canFavorite;
        ctxSep3.Visible = canFavorite;

        var workspaceId = GetContextWorkspaceId(data);
        var canEditWorkspace = CanEditWorkspace(workspaceId);
        var isPage = data?.Kind == TreeNodeKind.Page;
        var canEditPage = isPage && CanEditPage(data!.Id);
        var canEditTarget = isPage ? canEditPage : isWorkspace && canEditWorkspace;

        ctxNewSubWorkspace.Enabled = isWorkspace && canEditWorkspace;
        ctxNewPage.Enabled = isPageOrWorkspace && canEditWorkspace;
        ctxRename.Enabled = isPageOrWorkspace && canEditTarget;
        ctxDelete.Enabled = isPageOrWorkspace && canEditTarget;
        ctxMembers.Enabled = isWorkspace && canEditWorkspace;

        var showLockMenu = false;
        if (isWorkspace && data!.Id > 0)
        {
            try
            {
                var workspaces = AppConfig.Services.Workspaces;
                if (workspaces.IsWorkspaceLocked(data.Id))
                    showLockMenu = workspaces.CanUnlockWorkspace(SessionContext.CurrentUser, data.Id);
                else
                    showLockMenu = workspaces.CanLockWorkspace(SessionContext.CurrentUser, data.Id);
            }
            catch
            {
                showLockMenu = false;
            }
        }

        ctxToggleWorkspaceLock.Visible = showLockMenu;
        ctxSep4.Visible = showLockMenu;
        if (showLockMenu)
        {
            var isLocked = AppConfig.Services.Workspaces.IsWorkspaceLocked(data!.Id);
            ctxToggleWorkspaceLock.Text = isLocked
                ? Localization.Get(K.CtxUnlockWorkspace)
                : Localization.Get(K.CtxLockWorkspace);
            ctxToggleWorkspaceLock.Image = AppIcons.LoadMenuIcon(isLocked ? "unlock" : "lock");
            ctxToggleWorkspaceLock.ToolTipText = isLocked
                ? Localization.Get(K.TipCtxUnlockWorkspace)
                : Localization.Get(K.TipCtxLockWorkspace);
        }

        var showPageLockMenu = false;
        if (isPage && data!.Id > 0)
        {
            try
            {
                var pages = AppConfig.Services.Pages;
                if (pages.IsPageLocked(data.Id))
                    showPageLockMenu = pages.CanUnlockPage(SessionContext.CurrentUser, data.Id);
                else
                    showPageLockMenu = pages.CanLockPage(SessionContext.CurrentUser, data.Id);
            }
            catch
            {
                showPageLockMenu = false;
            }
        }

        ctxTogglePageLock.Visible = showPageLockMenu;
        ctxSep5.Visible = showPageLockMenu;
        if (showPageLockMenu)
        {
            var isPageLocked = AppConfig.Services.Pages.IsPageLocked(data!.Id);
            ctxTogglePageLock.Text = isPageLocked
                ? Localization.Get(K.CtxUnlockPage)
                : Localization.Get(K.CtxLockPage);
            ctxTogglePageLock.Image = AppIcons.LoadMenuIcon(isPageLocked ? "unlock" : "lock");
            ctxTogglePageLock.ToolTipText = isPageLocked
                ? Localization.Get(K.TipCtxUnlockPage)
                : Localization.Get(K.TipCtxLockPage);
        }

        if (canFavorite)
        {
            try
            {
                var isFavorite = AppConfig.Services.Workspaces.IsFavorite(SessionContext.CurrentUser, data!.Id);
                ctxToggleFavorite.Text = isFavorite
                    ? Localization.Get(K.CtxToggleFavoriteRemove)
                    : Localization.Get(K.CtxToggleFavoriteAdd);
            }
            catch
            {
                ctxToggleFavorite.Visible = false;
                ctxSep3.Visible = false;
            }
        }

        if (!ctxTree.Items.Cast<ToolStripItem>().Any(item => item.Visible && item is not ToolStripSeparator))
            ctxNewRootWorkspace.Visible = true;
    }

    private void ctxTree_Opening(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        if (!SessionContext.IsLoggedIn)
        {
            e.Cancel = true;
            return;
        }

        ConfigureWorkspaceContextMenu();
    }

    private void ctxToggleFavorite_Click(object sender, EventArgs e)
    {
        var data = GetSelectedNodeData();
        if (data?.Kind != TreeNodeKind.Workspace)
            return;

        try
        {
            var isFavorite = AppConfig.Services.Workspaces.IsFavorite(SessionContext.CurrentUser, data.Id);
            AppConfig.Services.Workspaces.SetFavorite(SessionContext.CurrentUser, data.Id, !isFavorite);
            LoadWorkspaceTree(_currentPageId, data.Id);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, L.AppName, ex);
        }
    }

    private void menuDatabaseSettings_Click(object sender, EventArgs e)
    {
        if (!SessionContext.IsAdmin)
        {
            MessageBox.Show(
                Localization.Get(K.DbSettingsAdminOnly),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        using var form = new DatabaseSettingsForm();
        if (form.ShowDialog() != DialogResult.OK)
            return;

        var username = SessionContext.CurrentUser.Username;
        var refreshed = AppConfig.Services.Users.GetByUsername(username);
        if (refreshed == null)
        {
            MessageBox.Show(
                Localization.Get(K.DbSavedReloginRequired),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            ApplyLoggedOutState();
            ShowLoginDialog();
            return;
        }

        SessionContext.SetUser(refreshed);
        var lastPageId = TryResolveRestorableLastPageId();

        _suppressWorkspaceSelection = true;
        try
        {
            LoadWorkspaceTree(selectPageId: lastPageId);
        }
        finally
        {
            _suppressWorkspaceSelection = false;
        }

        if (lastPageId.HasValue)
            _ = RestoreLastActivePageAsync(lastPageId.Value);
        lblStatus.Text = SessionContext.IsAdmin
            ? Localization.Get(K.StatusAdmin)
            : Localization.Get(K.StatusUser);
    }

    private void menuRefreshTree_Click(object sender, EventArgs e)
    {
        SaveCurrentPage(refreshTree: false);
        LoadWorkspaceTree(_currentPageId, null);
    }

    private async void menuLogout_Click(object sender, EventArgs e)
    {
        if (!SessionContext.IsLoggedIn)
            return;

        if (MessageBox.Show(
                Localization.Get(K.ConfirmLogout),
                Localization.Get(K.Confirm),
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question) != DialogResult.Yes)
            return;

        await SaveCurrentPageAsync(refreshTree: false);
        RecordCurrentPageForSession();
        ApplyLoggedOutState();
        ShowLoginDialog();
    }

    private async void menuExit_Click(object sender, EventArgs e)
    {
        if (SessionContext.IsLoggedIn)
            await SaveCurrentPageAsync(refreshTree: false);

        _isClosing = true;
        Close();
    }

    private async void MainForm_FormClosing(object sender, FormClosingEventArgs e)
    {
        if (_isClosing)
            return;

        RecordCurrentPageForSession();

        if (!SessionContext.IsLoggedIn || !_currentPageId.HasValue)
            return;

        e.Cancel = true;
        _outlineUpdateTimer?.Stop();
        _outlineHighlightTimer?.Stop();
        saveTimer.Stop();

        try
        {
            await SaveCurrentPageAsync(force: true);
        }
        finally
        {
            _isClosing = true;
            Close();
        }
    }

    private void ctxNewRootWorkspace_Click(object sender, EventArgs e) => menuNewRootWorkspace_Click(sender, e);
    private void ctxNewSubWorkspace_Click(object sender, EventArgs e) => menuNewSubWorkspace_Click(sender, e);
    private void ctxNewPage_Click(object sender, EventArgs e) => menuNewPage_Click(sender, e);
    private void ctxRename_Click(object sender, EventArgs e) => menuRename_Click(sender, e);
    private void ctxDelete_Click(object sender, EventArgs e) => menuDelete_Click(sender, e);
    private void ctxMembers_Click(object sender, EventArgs e) => menuWorkspaceMembers_Click(sender, e);

    private void menuDocumentStructure_Click(object? sender, EventArgs e)
    {
        if (IsDisposed)
            return;

        BeginInvoke(ToggleOutlinePanel);
    }

    private void RefreshToolbarIcons()
    {
        _toolbarIcons?.Dispose();
        _toolbarIcons = AppIcons.CreateToolbarImageList();
        toolStripMarkdown.ImageList = _toolbarIcons;
        RefreshEditorContextMenuIcons();
        RefreshTreeIcons();
        AppIcons.ApplyMenuIcons(
            menuSavePage,
            menuPageHistory,
            menuRefreshTree,
            menuLogin,
            menuLogout,
            menuAbout,
            menuExit,
            menuPreferences,
            menuDocumentStructure,
            menuNewRootWorkspace,
            menuNewSubWorkspace,
            menuNewPage,
            menuRename,
            menuDelete,
            menuWorkspaceMembers,
            menuAdminUserManagement,
            menuAdminDatabaseSettings,
            menuAdminEmailSettings,
            menuEditProfile,
            menuChangePassword,
            menuNotificationSettings,
            ctxNewRootWorkspace,
            ctxNewSubWorkspace,
            ctxNewPage,
            ctxRename,
            ctxDelete,
            ctxToggleFavorite,
            ctxToggleWorkspaceLock,
            ctxTogglePageLock,
            ctxMembers);
        navRail.RefreshIcons();
    }

    private void RefreshTreeIcons()
    {
        treeWorkspace.ImageList?.Dispose();
        treeOutline.ImageList?.Dispose();
        treeWorkspace.ImageList = TreeIcons.CreateImageList();
        treeOutline.ImageList = OutlineIcons.CreateImageList();
        treeWorkspace.Invalidate();
        treeOutline.Invalidate();
    }

    private async Task RunEditorAsync(Func<WebViewEditorController, Task> action)
    {
        if (_editor == null)
            return;

        await action(_editor);
    }

    private void SetupWysiwygToolbar()
    {
        RefreshToolbarIcons();
        AppTheme.ApplyVerticalToolbar(toolStripMarkdown);
        toolStripMarkdown.Padding = new Padding(4, 8 + ToolbarTopGap, 4, 8);
        toolStripMarkdown.Items.Clear();

        AddToolbarButton("undo", Localization.Get(K.ToolbarUndo), async (_, _) => await RunEditorAsync(e => e.UndoAsync()));
        AddToolbarButton("redo", Localization.Get(K.ToolbarRedo), async (_, _) => await RunEditorAsync(e => e.RedoAsync()));
        toolStripMarkdown.Items.Add(new ToolStripSeparator());
        AddToolbarButton("h1", Localization.Get(K.ToolbarHeading1), async (_, _) => await RunEditorAsync(e => e.ApplyHeadingAsync(1)));
        AddToolbarButton("h2", Localization.Get(K.ToolbarHeading2), async (_, _) => await RunEditorAsync(e => e.ApplyHeadingAsync(2)));
        AddToolbarButton("h3", Localization.Get(K.ToolbarHeading3), async (_, _) => await RunEditorAsync(e => e.ApplyHeadingAsync(3)));
        AddToolbarButton("h4", Localization.Get(K.ToolbarHeading4), async (_, _) => await RunEditorAsync(e => e.ApplyHeadingAsync(4)));
        AddToolbarButton("h5", Localization.Get(K.ToolbarHeading5), async (_, _) => await RunEditorAsync(e => e.ApplyHeadingAsync(5)));
        AddToolbarButton("h6", Localization.Get(K.ToolbarHeading6), async (_, _) => await RunEditorAsync(e => e.ApplyHeadingAsync(6)));
        toolStripMarkdown.Items.Add(new ToolStripSeparator());
        AddToolbarButton("bold", Localization.Get(K.ToolbarBold), async (_, _) => await RunEditorAsync(e => e.ApplyFormatAsync("bold")));
        AddToolbarButton("italic", Localization.Get(K.ToolbarItalic), async (_, _) => await RunEditorAsync(e => e.ApplyFormatAsync("italic")));
        AddToolbarButton("strike", Localization.Get(K.ToolbarStrike), async (_, _) => await RunEditorAsync(e => e.ApplyFormatAsync("strikeThrough")));
        toolStripMarkdown.Items.Add(new ToolStripSeparator());
        AddToolbarButton("code", Localization.Get(K.ToolbarInlineCode), async (_, _) => await RunEditorAsync(e => e.WrapInlineCodeAsync()));
        AddToolbarButton("codeblock", Localization.Get(K.ToolbarCodeBlock), async (_, _) =>
            await RunEditorAsync(e => e.InsertHtmlAsync($"<pre><code>{Localization.Get(K.DefaultCodeText)}</code></pre><p><br></p>")));
        toolStripMarkdown.Items.Add(new ToolStripSeparator());
        AddToolbarButton("link", Localization.Get(K.ToolbarLink), async (_, _) => await InsertLinkAsync());
        AddToolbarButton("image", Localization.Get(K.ToolbarImage), async (_, _) => await InsertImageAsync());
        AddToolbarButton("attach", Localization.Get(K.ToolbarAttachFile), async (_, _) => await InsertFileAsync());
        toolStripMarkdown.Items.Add(new ToolStripSeparator());
        AddToolbarButton("ul", Localization.Get(K.ToolbarBulletList), async (_, _) => await RunEditorAsync(e => e.ApplyFormatAsync("insertUnorderedList")));
        AddToolbarButton("ol", Localization.Get(K.ToolbarNumberList), async (_, _) => await RunEditorAsync(e => e.ApplyFormatAsync("insertOrderedList")));
        AddToolbarButton("quote", Localization.Get(K.ToolbarQuote), async (_, _) => await RunEditorAsync(e => e.ApplyBlockquoteAsync()));
        toolStripMarkdown.Items.Add(new ToolStripSeparator());
        AddToolbarButton("hr", Localization.Get(K.ToolbarHorizontalRule), async (_, _) => await RunEditorAsync(e => e.InsertHtmlAsync("<hr/><p><br></p>")));
        AddToolbarButton("table", Localization.Get(K.ToolbarTable), async (_, _) =>
            await RunEditorAsync(e => e.InsertHtmlAsync(
                $"""<table><thead><tr><th>{Localization.Get(K.TableHeader1)}</th><th>{Localization.Get(K.TableHeader2)}</th></tr></thead><tbody><tr><td></td><td></td></tr></tbody></table><p><br></p>""")));
        _toolbarOutlineButton = AddToolbarButton(
            "outline",
            Localization.Get(K.ToolbarDocumentStructure),
            (_, _) => ToggleOutlinePanel());
        toolStripMarkdown.Items.Add(new ToolStripSeparator());
        _toolbarInfoButton = AddToolbarButton("info", Localization.Get(K.ToolbarAbout), (_, _) => ShowAboutDialog(), ToolStripItemAlignment.Right);
        SetShellEnabled(SessionContext.IsLoggedIn);
    }

    private ToolStripButton AddToolbarButton(string imageKey, string toolTip, EventHandler click, ToolStripItemAlignment alignment = ToolStripItemAlignment.Left)
    {
        var btn = new ToolStripButton(toolTip)
        {
            ToolTipText = toolTip,
            DisplayStyle = ToolStripItemDisplayStyle.Image,
            ImageKey = imageKey,
            Alignment = alignment,
            Name = $"toolbar_{imageKey}"
        };
        btn.Click += click;
        toolStripMarkdown.Items.Add(btn);
        return btn;
    }

    private async Task InsertLinkAsync()
    {
        var selectedText = string.Empty;
        if (_editor != null && _editor.IsReady && !_editor.IsScriptSuspended)
            selectedText = await _editor.GetSelectedTextAsync();

        using var dialog = new LinkDialogForm(selectedText);
        if (dialog.ShowDialog() != DialogResult.OK)
            return;

        var url = dialog.LinkUrl;
        if (string.IsNullOrWhiteSpace(url))
            return;

        var text = dialog.LinkText;
        if (string.IsNullOrWhiteSpace(text))
            text = url;

        await RunEditorAsync(e => e.CreateLinkAsync(text, url));
    }

    private async Task<int?> EnsurePageIdForAssetsAsync()
    {
        if (!_currentPageId.HasValue && !_draftWorkspaceId.HasValue)
        {
            MessageBox.Show(
                Localization.Get(K.AttachmentRequiresPage),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return null;
        }

        if (!await EnsurePageCreatedAsync())
            return null;

        return _currentPageId;
    }

    private async Task InsertImageAsync()
    {
        using var dialog = new OpenFileDialog
        {
            Title = Localization.Get(K.DialogImageFilePrompt),
            Filter = PageAssetStore.BuildOpenFileFilter(),
            Multiselect = false
        };

        if (dialog.ShowDialog() != DialogResult.OK)
            return;

        var pageId = await EnsurePageIdForAssetsAsync();
        if (!pageId.HasValue)
            return;

        try
        {
            await ImportAndInsertAssetAsync(pageId.Value, dialog.FileName);
            MarkPageDirty();
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.DialogImageTitle), ex);
        }
    }

    private async Task InsertFileAsync()
    {
        using var dialog = new OpenFileDialog
        {
            Title = Localization.Get(K.DialogAttachFilePrompt),
            Filter = PageAssetStore.BuildOpenAttachmentFilter(),
            Multiselect = false
        };

        if (dialog.ShowDialog() != DialogResult.OK)
            return;

        var pageId = await EnsurePageIdForAssetsAsync();
        if (!pageId.HasValue)
            return;

        try
        {
            await ImportAndInsertAssetAsync(pageId.Value, dialog.FileName);
            MarkPageDirty();
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.ToolbarAttachFile), ex);
        }
    }

    private async Task HandleEditorFilesDroppedAsync(string[] paths, Point clientPoint)
    {
        if (_editor == null || !CanEditActivePage())
            return;

        var pageId = await EnsurePageIdForAssetsAsync();
        if (!pageId.HasValue)
            return;

        await _editor.FocusCaretAtPointAsync(clientPoint);

        foreach (var path in paths)
        {
            if (string.IsNullOrWhiteSpace(path) || Directory.Exists(path))
                continue;

            try
            {
                await ImportAndInsertAssetAsync(pageId.Value, path);
            }
            catch (Exception ex)
            {
                ErrorDetailForm.Show(this, Path.GetFileName(path), ex);
            }
        }

        MarkPageDirty();
    }

    private async Task ImportAndInsertAssetAsync(int pageId, string sourcePath)
    {
        var extension = Path.GetExtension(sourcePath);
        if (PageAssetStore.IsSupportedImageExtension(extension))
        {
            var fileName = PageAssetStore.ImportImage(pageId, sourcePath);
            var fileUri = PageAssetStore.ToEditorUri(pageId, fileName);
            var alt = Path.GetFileNameWithoutExtension(sourcePath);
            await RunEditorAsync(e => e.InsertImageAsync(fileUri, alt));
            return;
        }

        var attachmentName = PageAssetStore.ImportFile(pageId, sourcePath);
        var attachmentUri = PageAssetStore.ToEditorUri(pageId, attachmentName);
        var displayName = Path.GetFileName(sourcePath);
        await RunEditorAsync(e => e.InsertFileAttachmentAsync(attachmentUri, displayName));
    }

    private void SetupTreeDragDrop()
    {
        treeWorkspace.AllowDrop = true;
        treeWorkspace.KeyDown += treeWorkspace_KeyDown;
        treeWorkspace.ItemDrag += treeWorkspace_ItemDrag;
        treeWorkspace.DragEnter += treeWorkspace_DragEnter;
        treeWorkspace.DragOver += treeWorkspace_DragOver;
        treeWorkspace.DragDrop += treeWorkspace_DragDrop;
    }

    private void treeWorkspace_KeyDown(object? sender, KeyEventArgs e)
    {
        if (e.KeyCode != Keys.Delete)
            return;

        var data = GetSelectedNodeData();
        if (data?.Kind is not (TreeNodeKind.Page or TreeNodeKind.Workspace))
            return;

        if (!CanDeleteTreeNode(data))
        {
            e.Handled = true;
            e.SuppressKeyPress = true;
            return;
        }

        e.Handled = true;
        e.SuppressKeyPress = true;
        menuDelete_Click(this, e);
    }

    private bool CanDeleteTreeNode(TreeNodeData data) =>
        data.Kind switch
        {
            TreeNodeKind.Page => CanEditPage(data.Id),
            TreeNodeKind.Workspace => CanEditWorkspace(data.Id),
            _ => false
        };

    private void treeWorkspace_ItemDrag(object? sender, ItemDragEventArgs e)
    {
        if (e.Item is not TreeNode node || node.Tag is not TreeNodeData data)
            return;

        if (!CanDragNode(data))
            return;

        DoDragDrop(node, DragDropEffects.Move);
    }

    private bool CanDragNode(TreeNodeData data)
    {
        if (data.Kind == TreeNodeKind.FavoritesRoot)
            return false;

        if (data.Kind == TreeNodeKind.Workspace)
            return AppConfig.Services.Workspaces.CanEditWorkspaceContent(SessionContext.CurrentUser, data.Id);

        return data.WorkspaceId.HasValue && CanEditPage(data.Id);
    }

    private void treeWorkspace_DragEnter(object? sender, DragEventArgs e)
    {
        if (CanAcceptMarkdownFileDrop(e))
        {
            e.Effect = DragDropEffects.Copy;
            return;
        }

        e.Effect = GetDragEffect(e) ? DragDropEffects.Move : DragDropEffects.None;
    }

    private void treeWorkspace_DragOver(object? sender, DragEventArgs e)
    {
        if (CanAcceptMarkdownFileDrop(e))
        {
            e.Effect = DragDropEffects.Copy;
            var clientPoint = treeWorkspace.PointToClient(new Point(e.X, e.Y));
            var targetNode = treeWorkspace.GetNodeAt(clientPoint);
            if (targetNode != null)
                treeWorkspace.SelectedNode = targetNode;
            return;
        }

        e.Effect = GetDragEffect(e) ? DragDropEffects.Move : DragDropEffects.None;
    }

    private bool GetDragEffect(DragEventArgs e)
    {
        if (e.Data?.GetData(typeof(TreeNode)) is not TreeNode sourceNode || sourceNode.Tag is not TreeNodeData sourceData)
            return false;

        var clientPoint = treeWorkspace.PointToClient(new Point(e.X, e.Y));
        var targetNode = treeWorkspace.GetNodeAt(clientPoint);
        if (targetNode?.Tag is not TreeNodeData targetData)
            return false;

        if (sourceData.Kind == TreeNodeKind.Page)
        {
            if (targetData.Kind != TreeNodeKind.Workspace)
                return false;

            if (!AppConfig.Services.Pages.CanEditPageContent(SessionContext.CurrentUser, sourceData.Id))
                return false;

            return AppConfig.Services.Workspaces.CanEditWorkspaceContent(SessionContext.CurrentUser, targetData.Id);
        }

        if (sourceData.Kind == TreeNodeKind.Workspace)
        {
            if (targetData.Kind != TreeNodeKind.Workspace)
                return false;

            if (sourceData.Id == targetData.Id)
                return false;

            return AppConfig.Services.Workspaces.CanEditWorkspaceContent(SessionContext.CurrentUser, targetData.Id);
        }

        return false;
    }

    private void treeWorkspace_DragDrop(object? sender, DragEventArgs e)
    {
        if (CanAcceptMarkdownFileDrop(e) &&
            e.Data?.GetData(DataFormats.FileDrop) is string[] markdownPaths)
        {
            ImportMarkdownFilesFromDrop(markdownPaths, e);
            return;
        }

        if (e.Data?.GetData(typeof(TreeNode)) is not TreeNode sourceNode || sourceNode.Tag is not TreeNodeData sourceData)
            return;

        var clientPoint = treeWorkspace.PointToClient(new Point(e.X, e.Y));
        var targetNode = treeWorkspace.GetNodeAt(clientPoint);
        if (targetNode?.Tag is not TreeNodeData targetData)
            return;

        try
        {
            if (sourceData.Kind == TreeNodeKind.Page && targetData.Kind == TreeNodeKind.Workspace)
            {
                AppConfig.Services.Pages.MovePage(SessionContext.CurrentUser, sourceData.Id, targetData.Id);
                LoadWorkspaceTree(selectPageId: sourceData.Id);
                return;
            }

            if (sourceData.Kind == TreeNodeKind.Workspace && targetData.Kind == TreeNodeKind.Workspace)
            {
                AppConfig.Services.Workspaces.MoveWorkspace(SessionContext.CurrentUser, sourceData.Id, targetData.Id);
                LoadWorkspaceTree(selectWorkspaceId: sourceData.Id);
            }
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, L.AppName, ex);
        }
    }
}
