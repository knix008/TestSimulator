using Markdig;
using MyWorkspace.Core.Enums;
using MyWorkspace.Core.Models;

namespace MyWorkspace.Win.Forms;

public partial class MainForm : Form
{
    private readonly MarkdownPipeline _pipeline = new MarkdownPipelineBuilder().UseAdvancedExtensions().Build();

    private WebViewEditorController _editor = null!;
    private ImageList _toolbarIcons = null!;

    private int? _currentPageId;
    private bool _isLoadingPage;
    private bool _isDirty;
    private bool _suppressOutlineNavigation;
    private string _lastActiveHeadingId = string.Empty;
    private int _savedOutlineWidth = 110;

    private const int MaxOutlineLevel = 3;

    private System.Windows.Forms.Timer? _outlineHighlightTimer;
    private System.Windows.Forms.Timer? _outlineUpdateTimer;
    private int _outlineUpdateGeneration;
    private bool _outlineUpdateInProgress;
    private bool _saveInProgress;
    private bool _isClosing;
    private bool _initialLoginPromptShown;

    private ToolStripButton? _toolbarInfoButton;
    private ToolStripButton? _toolbarOutlineButton;

    private ContextMenuStrip? _ctxEditor;

    public MainForm()
    {
        InitializeComponent();
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
        _editor?.ResetScriptSuspension();
    }

    private async void MainForm_Load(object sender, EventArgs e)
    {
        treeWorkspace.ImageList = TreeIcons.CreateImageList();
        treeOutline.ImageList = OutlineIcons.CreateImageList();

        AppIcons.ApplyMenuIcons(
            menuSavePage, menuPageHistory, menuRefreshTree, menuLogin, menuLogout, menuExit,
            menuPreferences, menuDocumentStructure, menuNewRootWorkspace, menuNewSubWorkspace, menuNewPage, menuRename, menuDelete,
            menuWorkspaceMembers, menuAdminUserManagement, menuAdminDatabaseSettings,
            menuAdminEmailSettings, menuEditProfile, menuChangePassword, menuNotificationSettings,
            ctxNewSubWorkspace, ctxNewPage, ctxRename, ctxDelete, ctxToggleFavorite, ctxMembers);

        menuView.Image = menuDocumentStructure.Image;

        _editor = new WebViewEditorController(webViewEditor);
        _editor.ContentChanged += OnEditorContentChanged;
        _editor.CaretMoved += OnEditorCaretMoved;
        _editor.ContextMenuRequested += OnEditorContextMenuRequested;
        SetupEditorContextMenu();
        HookMenuScriptSuspension();

        menuFile.Image = menuSavePage.Image;
        menuWorkspace.Image = menuNewRootWorkspace.Image;
        menuAdmin.Image = menuAdminUserManagement.Image;
        menuAccount.Image = menuEditProfile.Image;

        _toolbarIcons = AppIcons.CreateToolbarImageList();
        toolStripMarkdown.ImageList = _toolbarIcons;
        SetupWysiwygToolbar();

        SetupTreeDragDrop();

        editorAreaSplit.SplitterMoved += (_, _) =>
        {
            if (!editorAreaSplit.Panel1Collapsed)
                _savedOutlineWidth = editorAreaSplit.SplitterDistance;
        };

        _outlineUpdateTimer = new System.Windows.Forms.Timer(components) { Interval = 300 };
        _outlineUpdateTimer.Tick += async (_, _) =>
        {
            _outlineUpdateTimer!.Stop();
            if (_editor.IsScriptSuspended || _outlineUpdateInProgress)
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

        _outlineHighlightTimer = new System.Windows.Forms.Timer(components) { Interval = 250 };
        _outlineHighlightTimer.Tick += async (_, _) =>
        {
            _outlineHighlightTimer!.Stop();
            if (_editor.IsScriptSuspended)
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

        txtTitle.TextChanged += (_, _) => MarkPageDirty();

        try
        {
            await _editor.InitializeAsync(_pipeline);
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
        SessionContext.Clear();
        Text = Localization.Get(K.AppTitleLoggedOut);
        lblStatus.Text = Localization.Get(K.StatusLoginRequired);
        SetSaveStatus(SaveStatusKind.None);

        treeWorkspace.Nodes.Clear();
        treeOutline.Nodes.Clear();
        txtTitle.Clear();
        _currentPageId = null;
        _isDirty = false;

        _ = _editor.ClearAsync(_pipeline);

        SetShellEnabled(false);
        UpdateMenuForLoginState(false);
    }

    private void ApplyLoggedInState()
    {
        Text = Localization.Format(K.AppTitleLoggedIn, SessionContext.CurrentUser.Username);
        lblStatus.Text = SessionContext.IsAdmin
            ? Localization.Get(K.StatusAdmin)
            : Localization.Get(K.StatusUser);

        SetShellEnabled(true);
        UpdateMenuForLoginState(true);
        LoadWorkspaceTree();
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

        txtTitle.Enabled = enabled;
    }

    private void UpdateMenuForLoginState(bool loggedIn)
    {
        menuSavePage.Visible = loggedIn;
        menuPageHistory.Visible = loggedIn;
        menuRefreshTree.Visible = loggedIn;
        menuSepFile1.Visible = loggedIn;
        menuPreferences.Visible = true;
        menuSepFilePref.Visible = true;
        menuLogin.Visible = !loggedIn;
        menuLogout.Visible = loggedIn;
        menuWorkspace.Visible = loggedIn;
        menuView.Visible = true;
        menuDocumentStructure.Visible = true;
        menuDocumentStructure.Enabled = true;
        menuAccount.Visible = loggedIn;

        menuAdmin.Visible = loggedIn && SessionContext.IsAdmin;
        menuAdminUserManagement.Visible = loggedIn && SessionContext.IsAdmin;
        menuAdminDatabaseSettings.Visible = loggedIn && SessionContext.IsAdmin;
        menuAdminEmailSettings.Visible = loggedIn && SessionContext.IsAdmin;
        RefreshMenuTheme();
    }

    private void RefreshMenuTheme()
    {
        AppTheme.ApplyMenuStrip(menuStrip1);
        AppTheme.StyleContextMenu(ctxTree);
        if (_ctxEditor != null)
            AppTheme.StyleContextMenu(_ctxEditor);
    }

    private void OnEditorContentChanged()
    {
        if (InvokeRequired)
        {
            BeginInvoke(OnEditorContentChanged);
            return;
        }

        MarkPageDirty();
        ScheduleOutlineUpdate();
    }

    private void OnEditorCaretMoved()
    {
        if (_editor.IsScriptSuspended)
            return;

        ScheduleOutlineHighlight();
    }

    private void OnEditorContextMenuRequested(Point location)
    {
        if (_ctxEditor == null || !_currentPageId.HasValue || !SessionContext.IsLoggedIn)
            return;

        _outlineUpdateTimer?.Stop();
        _outlineHighlightTimer?.Stop();
        _editor.SuspendScripts();
        _ctxEditor.Show(webViewEditor, location);
    }

    private void HookMenuScriptSuspension()
    {
        foreach (ToolStripItem item in menuStrip1.Items)
        {
            if (item is ToolStripMenuItem menuItem)
                HookDropDownScriptSuspension(menuItem.DropDown);
        }

        HookDropDownScriptSuspension(ctxTree);
    }

    private void HookDropDownScriptSuspension(ToolStripDropDown dropDown)
    {
        dropDown.Opening += (_, _) => _editor.SuspendScripts();
        dropDown.Closed += (_, _) => OnDropDownClosed();

        foreach (ToolStripItem item in dropDown.Items)
        {
            if (item is ToolStripMenuItem menuItem && menuItem.HasDropDownItems)
                HookDropDownScriptSuspension(menuItem.DropDown);
        }
    }

    private void OnDropDownClosed()
    {
        _editor.ResumeScripts();
        ScheduleOutlineUpdate();
        ScheduleOutlineHighlight();
    }

    private void SetupEditorContextMenu()
    {
        _ctxEditor = new ContextMenuStrip(components);
        _ctxEditor.Closed += (_, _) => OnDropDownClosed();

        AddEditorMenuItem(K.EditorCut, Keys.Control | Keys.X, async (_, _) => await _editor.CutAsync());
        AddEditorMenuItem(K.EditorCopy, Keys.Control | Keys.C, async (_, _) => await _editor.CopyAsync());
        AddEditorMenuItem(K.EditorPaste, Keys.Control | Keys.V, async (_, _) => await _editor.PasteAsync());
        _ctxEditor.Items.Add(new ToolStripSeparator());
        AddEditorMenuItem(K.EditorSelectAll, Keys.Control | Keys.A, async (_, _) => await _editor.SelectAllAsync());
        _ctxEditor.Items.Add(new ToolStripSeparator());
        AddEditorMenuItem(K.EditorBold, Keys.Control | Keys.B, async (_, _) => await _editor.ApplyFormatAsync("bold"));
        AddEditorMenuItem(K.EditorItalic, Keys.Control | Keys.I, async (_, _) => await _editor.ApplyFormatAsync("italic"));
        _ctxEditor.Items.Add(new ToolStripSeparator());
        AddEditorMenuItem(K.ToolbarHeading1, null, async (_, _) => await _editor.ApplyHeadingAsync(1));
        AddEditorMenuItem(K.ToolbarHeading2, null, async (_, _) => await _editor.ApplyHeadingAsync(2));
        AddEditorMenuItem(K.ToolbarHeading3, null, async (_, _) => await _editor.ApplyHeadingAsync(3));
        AddEditorMenuItem(K.ToolbarHeading4, null, async (_, _) => await _editor.ApplyHeadingAsync(4));
        AddEditorMenuItem(K.ToolbarHeading5, null, async (_, _) => await _editor.ApplyHeadingAsync(5));
        AddEditorMenuItem(K.ToolbarHeading6, null, async (_, _) => await _editor.ApplyHeadingAsync(6));
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

    private void AddEditorMenuItem(string textKey, Keys? shortcut, EventHandler click)
    {
        var item = new ToolStripMenuItem(Localization.Get(textKey))
        {
            Tag = textKey,
            ShowShortcutKeys = shortcut.HasValue
        };
        if (shortcut.HasValue)
            item.ShortcutKeys = shortcut.Value;
        item.Click += click;
        _ctxEditor!.Items.Add(item);
    }

    private void ScheduleOutlineUpdate()
    {
        if (_isLoadingPage || !_currentPageId.HasValue || _editor.IsScriptSuspended)
            return;

        _outlineUpdateTimer!.Stop();
        _outlineUpdateTimer.Start();
    }

    private void ScheduleOutlineHighlight()
    {
        if (_isLoadingPage || _suppressOutlineNavigation || _editor.IsScriptSuspended)
            return;

        _outlineHighlightTimer!.Stop();
        _outlineHighlightTimer.Start();
    }

    private void MarkPageDirty()
    {
        if (_isLoadingPage || !_currentPageId.HasValue)
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

        treeWorkspace.EndUpdate();
        treeWorkspace.ExpandAll();

        treeWorkspace.BeginUpdate();
        try
        {
            var target = selectPageId.HasValue
                ? FindNode(treeWorkspace.Nodes, TreeNodeKind.Page, selectPageId.Value)
                : selectWorkspaceId.HasValue
                    ? FindNode(treeWorkspace.Nodes, TreeNodeKind.Workspace, selectWorkspaceId.Value)
                    : null;

            if (target != null)
                treeWorkspace.SelectedNode = target;
        }
        finally
        {
            treeWorkspace.EndUpdate();
        }
    }

    private static TreeNode CreateTreeNode(WorkspaceTreeItem item)
    {
        var isWorkspace = item.Kind == TreeNodeKind.Workspace;
        var imageKey = isWorkspace
            ? item.IsFavorite ? "workspace_fav" : "workspace"
            : "page";

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

    private void treeWorkspace_AfterSelect(object sender, TreeViewEventArgs e)
    {
        if (e.Node?.Tag is not TreeNodeData data)
            return;

        if (data.Kind == TreeNodeKind.FavoritesRoot)
        {
            _ = ClearEditorAsync();
            return;
        }

        if (data.Kind == TreeNodeKind.Page)
            _ = LoadPageAsync(data.Id);
        else
            _ = ClearEditorAsync();
    }

    private async Task LoadPageAsync(int pageId)
    {
        await SaveCurrentPageAsync(refreshTree: false);

        var page = AppConfig.Services.Pages.GetById(SessionContext.CurrentUser, pageId);
        if (page == null)
        {
            MessageBox.Show(Localization.Get(K.PageLoadFailed), L.AppName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        _isLoadingPage = true;
        _currentPageId = page.Id;
        txtTitle.Text = page.Title;

        try
        {
            await _editor.LoadMarkdownAsync(page.Content, _pipeline);
            await _editor.FocusAsync();
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.PageLoadFailedTitle), ex);
        }

        _isLoadingPage = false;
        _isDirty = false;
        SetSaveStatus(SaveStatusKind.Saved);
        await UpdateOutlineAsync();
        lblStatus.Text = Localization.Format(K.StatusPage, page.Title);
    }

    private async Task ClearEditorAsync()
    {
        await SaveCurrentPageAsync(refreshTree: false);
        _currentPageId = null;
        _isLoadingPage = true;
        txtTitle.Clear();

        try
        {
            await _editor.ClearAsync(_pipeline);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.EditorClearFailed), ex);
        }

        _isLoadingPage = false;
        _isDirty = false;
        SetSaveStatus(SaveStatusKind.None);
        treeOutline.Nodes.Clear();
        lblStatus.Text = SessionContext.IsAdmin
            ? Localization.Get(K.StatusAdmin)
            : Localization.Get(K.StatusUser);
    }

    private async Task UpdateOutlineAsync()
    {
        if (!_currentPageId.HasValue || !_editor.IsReady)
        {
            treeOutline.Nodes.Clear();
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
            if (node != null)
                treeOutline.SelectedNode = node;
        }

        treeOutline.EndUpdate();
        _suppressOutlineNavigation = false;
    }

    private void treeOutline_AfterSelect(object? sender, TreeViewEventArgs e)
    {
        if (_suppressOutlineNavigation)
            return;

        if (e.Node?.Tag is OutlineTarget target)
            _ = NavigateToOutlineTargetAsync(target);
    }

    private async Task NavigateToOutlineTargetAsync(OutlineTarget target)
    {
        if (string.IsNullOrWhiteSpace(target.HeadingId))
            return;

        _lastActiveHeadingId = target.HeadingId;
        await _editor.ScrollToHeadingAsync(target.HeadingId);
    }

    private async Task HighlightActiveOutlineAsync()
    {
        if (!_editor.IsReady || _suppressOutlineNavigation || _editor.IsScriptSuspended)
            return;

        var activeId = await _editor.GetActiveHeadingIdAsync();
        if (string.IsNullOrWhiteSpace(activeId) || activeId == _lastActiveHeadingId)
            return;

        _lastActiveHeadingId = activeId;
        var node = FindOutlineNode(treeOutline.Nodes, activeId);
        if (node != null && node != treeOutline.SelectedNode)
        {
            _suppressOutlineNavigation = true;
            treeOutline.BeginUpdate();
            try
            {
                treeOutline.SelectedNode = node;
            }
            finally
            {
                treeOutline.EndUpdate();
                _suppressOutlineNavigation = false;
            }
        }
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

    private void btnToggleOutline_Click(object? sender, EventArgs e) => ToggleOutlinePanel();

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

        using var form = new PageHistoryForm(_currentPageId!.Value, txtTitle.Text.Trim());
        if (form.ShowDialog() == DialogResult.OK && form.Restored)
            await LoadPageAsync(_currentPageId.Value);
    }

    private async Task SaveCurrentPageAsync(bool showStatus = false, bool refreshTree = false)
    {
        if (!_isDirty || !_currentPageId.HasValue || _saveInProgress)
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
            var content = await _editor.GetMarkdownAsync();
            AppConfig.Services.Pages.UpdatePage(
                SessionContext.CurrentUser,
                _currentPageId.Value,
                txtTitle.Text,
                content);
            _isDirty = false;
            if (showStatus)
            {
                SetSaveStatus(SaveStatusKind.AutoSaved);
                lblStatus.Text = Localization.Format(K.StatusPage, txtTitle.Text.Trim());
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

    private void SaveCurrentPage(bool showStatus = false, bool refreshTree = false) =>
        _ = SaveCurrentPageAsync(showStatus, refreshTree);

    private TreeNodeData? GetSelectedNodeData() =>
        treeWorkspace.SelectedNode?.Tag as TreeNodeData;

    private int? GetSelectedWorkspaceId()
    {
        var data = GetSelectedNodeData();
        if (data == null)
            return null;

        return data.Kind == TreeNodeKind.Workspace ? data.Id : data.WorkspaceId;
    }

    private async void menuSavePage_Click(object sender, EventArgs e)
    {
        if (!_currentPageId.HasValue)
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
            var content = await _editor.GetMarkdownAsync();
            AppConfig.Services.Pages.UpdatePage(
                SessionContext.CurrentUser,
                data.Id,
                pageDialog.InputText,
                content);
            txtTitle.Text = pageDialog.InputText;
            _isDirty = false;
            LoadWorkspaceTree(selectPageId: data.Id);
            lblStatus.Text = Localization.Format(K.StatusPage, pageDialog.InputText);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, L.AppName, ex);
        }
    }

    private void menuDelete_Click(object sender, EventArgs e)
    {
        var data = GetSelectedNodeData();
        if (data == null)
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
                _ = ClearEditorAsync();
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
            Text = $"MyWorkspace - {SessionContext.CurrentUser.Username}";
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

    private void ctxTree_Opening(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        var data = GetSelectedNodeData();
        var isWorkspace = data?.Kind == TreeNodeKind.Workspace;
        var isPageOrWorkspace = data?.Kind is TreeNodeKind.Workspace or TreeNodeKind.Page;

        ctxNewSubWorkspace.Visible = isWorkspace;
        ctxNewPage.Visible = isPageOrWorkspace;
        ctxRename.Visible = isPageOrWorkspace;
        ctxDelete.Visible = isPageOrWorkspace;
        ctxSep1.Visible = isPageOrWorkspace;
        ctxSep2.Visible = isPageOrWorkspace;
        ctxMembers.Visible = isWorkspace;

        var canFavorite = isWorkspace &&
                          data!.Id > 0 &&
                          AppConfig.Services.Workspaces.CanFavoriteWorkspace(SessionContext.CurrentUser, data.Id);

        ctxToggleFavorite.Visible = canFavorite;
        ctxSep3.Visible = canFavorite;

        if (canFavorite)
        {
            var isFavorite = AppConfig.Services.Workspaces.IsFavorite(SessionContext.CurrentUser, data!.Id);
            ctxToggleFavorite.Text = isFavorite
                ? Localization.Get(K.CtxToggleFavoriteRemove)
                : Localization.Get(K.CtxToggleFavoriteAdd);
        }
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
        using var form = new DatabaseSettingsForm();
        form.ShowDialog();
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

        await SaveCurrentPageAsync(refreshTree: false);
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

        if (!SessionContext.IsLoggedIn || !_isDirty)
            return;

        e.Cancel = true;
        _outlineUpdateTimer?.Stop();
        _outlineHighlightTimer?.Stop();
        saveTimer.Stop();

        try
        {
            await SaveCurrentPageAsync();
        }
        finally
        {
            _isClosing = true;
            Close();
        }
    }

    private void ctxNewSubWorkspace_Click(object sender, EventArgs e) => menuNewSubWorkspace_Click(sender, e);
    private void ctxNewPage_Click(object sender, EventArgs e) => menuNewPage_Click(sender, e);
    private void ctxRename_Click(object sender, EventArgs e) => menuRename_Click(sender, e);
    private void ctxDelete_Click(object sender, EventArgs e) => menuDelete_Click(sender, e);
    private void ctxMembers_Click(object sender, EventArgs e) => menuWorkspaceMembers_Click(sender, e);

    private void menuDocumentStructure_Click(object? sender, EventArgs e) => ToggleOutlinePanel();

    private void SetupWysiwygToolbar()
    {
        toolStripMarkdown.GripStyle = ToolStripGripStyle.Hidden;
        toolStripMarkdown.Items.Clear();

        AddToolbarButton("h1", Localization.Get(K.ToolbarHeading1), async (_, _) => await _editor.ApplyHeadingAsync(1));
        AddToolbarButton("h2", Localization.Get(K.ToolbarHeading2), async (_, _) => await _editor.ApplyHeadingAsync(2));
        AddToolbarButton("h3", Localization.Get(K.ToolbarHeading3), async (_, _) => await _editor.ApplyHeadingAsync(3));
        AddToolbarButton("h4", Localization.Get(K.ToolbarHeading4), async (_, _) => await _editor.ApplyHeadingAsync(4));
        AddToolbarButton("h5", Localization.Get(K.ToolbarHeading5), async (_, _) => await _editor.ApplyHeadingAsync(5));
        AddToolbarButton("h6", Localization.Get(K.ToolbarHeading6), async (_, _) => await _editor.ApplyHeadingAsync(6));
        toolStripMarkdown.Items.Add(new ToolStripSeparator());
        AddToolbarButton("bold", Localization.Get(K.ToolbarBold), async (_, _) => await _editor.ApplyFormatAsync("bold"));
        AddToolbarButton("italic", Localization.Get(K.ToolbarItalic), async (_, _) => await _editor.ApplyFormatAsync("italic"));
        AddToolbarButton("strike", Localization.Get(K.ToolbarStrike), async (_, _) => await _editor.ApplyFormatAsync("strikeThrough"));
        toolStripMarkdown.Items.Add(new ToolStripSeparator());
        AddToolbarButton("code", Localization.Get(K.ToolbarInlineCode), async (_, _) => await _editor.WrapInlineCodeAsync());
        AddToolbarButton("codeblock", Localization.Get(K.ToolbarCodeBlock), async (_, _) =>
            await _editor.InsertHtmlAsync($"<pre><code>{Localization.Get(K.DefaultCodeText)}</code></pre><p><br></p>"));
        toolStripMarkdown.Items.Add(new ToolStripSeparator());
        AddToolbarButton("link", Localization.Get(K.ToolbarLink), async (_, _) => await InsertLinkAsync());
        AddToolbarButton("image", Localization.Get(K.ToolbarImage), async (_, _) => await InsertImageAsync());
        toolStripMarkdown.Items.Add(new ToolStripSeparator());
        AddToolbarButton("ul", Localization.Get(K.ToolbarBulletList), async (_, _) => await _editor.ApplyFormatAsync("insertUnorderedList"));
        AddToolbarButton("ol", Localization.Get(K.ToolbarNumberList), async (_, _) => await _editor.ApplyFormatAsync("insertOrderedList"));
        AddToolbarButton("quote", Localization.Get(K.ToolbarQuote), async (_, _) => await _editor.ApplyBlockquoteAsync());
        toolStripMarkdown.Items.Add(new ToolStripSeparator());
        AddToolbarButton("hr", Localization.Get(K.ToolbarHorizontalRule), async (_, _) => await _editor.InsertHtmlAsync("<hr/><p><br></p>"));
        AddToolbarButton("table", Localization.Get(K.ToolbarTable), async (_, _) =>
            await _editor.InsertHtmlAsync(
                $"""<table><thead><tr><th>{Localization.Get(K.TableHeader1)}</th><th>{Localization.Get(K.TableHeader2)}</th></tr></thead><tbody><tr><td></td><td></td></tr></tbody></table><p><br></p>"""));
        toolStripMarkdown.Items.Add(new ToolStripSeparator());
        _toolbarOutlineButton = AddToolbarButton(
            "outline",
            Localization.Get(K.ToolbarDocumentStructure),
            (_, _) => ToggleOutlinePanel(),
            ToolStripItemAlignment.Right);
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
        using var dialog = new InputDialogForm(
            Localization.Get(K.DialogLinkTitle),
            Localization.Get(K.DialogUrlPrompt),
            "https://");
        if (dialog.ShowDialog() != DialogResult.OK)
            return;

        var url = dialog.InputText.Trim();
        if (string.IsNullOrWhiteSpace(url))
            return;

        await _editor.CreateLinkAsync(url);
    }

    private async Task InsertImageAsync()
    {
        using var dialog = new InputDialogForm(
            Localization.Get(K.DialogImageTitle),
            Localization.Get(K.DialogUrlPrompt),
            "https://");
        if (dialog.ShowDialog() != DialogResult.OK)
            return;

        var url = dialog.InputText.Trim();
        if (string.IsNullOrWhiteSpace(url))
            return;

        await _editor.InsertHtmlAsync($"""<img src="{url}" alt="{Localization.Get(K.DefaultImageAlt)}"/>""");
    }

    private void SetupTreeDragDrop()
    {
        treeWorkspace.AllowDrop = true;
        treeWorkspace.ItemDrag += treeWorkspace_ItemDrag;
        treeWorkspace.DragEnter += treeWorkspace_DragEnter;
        treeWorkspace.DragOver += treeWorkspace_DragOver;
        treeWorkspace.DragDrop += treeWorkspace_DragDrop;
    }

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
            return AppConfig.Services.Workspaces.CanManageWorkspace(SessionContext.CurrentUser, data.Id);

        return data.WorkspaceId.HasValue &&
               AppConfig.Services.Workspaces.CanManageWorkspace(SessionContext.CurrentUser, data.WorkspaceId.Value);
    }

    private void treeWorkspace_DragEnter(object? sender, DragEventArgs e)
    {
        e.Effect = GetDragEffect(e) ? DragDropEffects.Move : DragDropEffects.None;
    }

    private void treeWorkspace_DragOver(object? sender, DragEventArgs e)
    {
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
            return targetData.Kind == TreeNodeKind.Workspace;

        if (sourceData.Kind == TreeNodeKind.Workspace)
        {
            if (targetData.Kind != TreeNodeKind.Workspace)
                return false;

            if (sourceData.Id == targetData.Id)
                return false;

            return !AppConfig.Services.Workspaces.HasPages(targetData.Id);
        }

        return false;
    }

    private void treeWorkspace_DragDrop(object? sender, DragEventArgs e)
    {
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
