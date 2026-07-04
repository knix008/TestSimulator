namespace MyWorkspace.Win.Forms;



public partial class MainForm

{

    private SaveStatusKind _saveStatusKind = SaveStatusKind.None;



    private void ApplyModernTheme()

    {

        ApplyStartupTheme();

        if (_ctxEditor != null)
            AppTheme.StyleContextMenu(_ctxEditor);
        if (_ctxEditorImage != null)
            AppTheme.StyleContextMenu(_ctxEditorImage);

        RefreshToolbarIcons();

        _ = RefreshEditorChromeAsync();
    }

    private void ApplyStartupTheme()
    {
        AppTheme.ApplyFormChrome(this);
        FramelessWindowHelper.ApplyShellChrome(this);
        titleBar.ApplyTheme();
        AppTheme.StyleBorderedPanel(titleBar, PanelEdges.None);
        UpdateTitleBarCaption();

        pnlRoot.BackColor = AppTheme.Background;
        pnlShellBody.BackColor = AppTheme.Sidebar;
        pnlMainContent.BackColor = AppTheme.Sidebar;
        pnlMainContent.Padding = Padding.Empty;

        AppTheme.ApplyMenuStrip(menuStrip1);
        AppTheme.ApplyVerticalToolbar(toolStripMarkdown);
        toolStripMarkdown.Padding = new Padding(4, 8, 4, 8);
        AppTheme.StyleVerticalToolbarItems(toolStripMarkdown.Items);
        AppTheme.ConfigureVerticalToolbarOverflow(toolStripMarkdown);
        AppTheme.ApplyStatusStrip(statusStrip1);
        AppTheme.StyleContextMenu(ctxTree);
        AppTheme.StyleContextMenu(ctxAppSettings);
        AppTheme.StyleTreeView(treeWorkspace);
        AppTheme.StyleTreeView(treeOutline);

        pnlWorkspaceSidebar.BackColor = AppTheme.Sidebar;
        pnlWorkspaceSidebar.Padding = new Padding(NavWorkspaceGap, WorkspaceTopGap + 1, 0, 1);
        AppTheme.StyleBorderedPanel(pnlWorkspaceSidebar, PanelEdges.None);

        pnlOutlineSidebar.BackColor = AppTheme.Sidebar;
        pnlOutlineSidebar.Padding = new Padding(NavWorkspaceGap, WorkspaceTopGap + 1, 0, 1);
        AppTheme.StyleBorderedPanel(pnlOutlineSidebar, PanelEdges.None);

        pnlEditorColumn.BackColor = AppTheme.EditorBackground;
        pnlEditorColumn.Padding = Padding.Empty;
        pnlEditorColumn.Margin = Padding.Empty;
        AppTheme.StyleBorderedPanel(pnlEditorColumn, PanelEdges.None);

        pnlEditorHost.BackColor = AppTheme.EditorBackground;
        pnlEditorHost.Padding = new Padding(0);
        pnlEditorHost.Margin = Padding.Empty;
        AppTheme.StyleBorderedPanel(pnlEditorHost, PanelEdges.None);

        editorAreaSplit.Panel1.Padding = Padding.Empty;
        editorAreaSplit.Panel2.Padding = Padding.Empty;
        outerSplit.Panel2.Padding = Padding.Empty;

        AppTheme.StyleGrabSplitContainer(outerSplit);
        AppTheme.StyleGrabSplitContainer(editorAreaSplit);

        lblStatus.ForeColor = AppTheme.TextSecondary;
        lblSaveStatus.ForeColor = AppTheme.TextMuted;

        ApplyEditorHostTheme();
        ApplyCommentsTheme();
        UpdateEditorEmptySurface();
        RefreshNavRailTheme();
        UpdateTitleBarEditorRegion();
    }

    private void UpdateTitleBarEditorRegion()
    {
        if (!IsHandleCreated || titleBar.IsDisposed || pnlEditorColumn.IsDisposed)
            return;

        var clientOrigin = titleBar.PointToClient(pnlEditorColumn.PointToScreen(Point.Empty));
        titleBar.SetEditorRegionLeft(clientOrigin.X);
    }



    private void ApplyLocalization()

    {

        UpdateTitleBarCaption();



        menuFile.Text = Localization.Get(K.MenuFile);

        menuSavePage.Text = Localization.Get(K.MenuSavePage);

        menuPageHistory.Text = Localization.Get(K.MenuPageHistory);

        menuRefreshTree.Text = Localization.Get(K.MenuRefreshTree);

        if (menuNewProject != null)
            menuNewProject.Text = Localization.Get(K.MenuNewProject);

        if (menuSaveWorkspace != null)

            menuSaveWorkspace.Text = Localization.Get(K.MenuSaveWorkspace);

        if (menuLoadWorkspace != null)

            menuLoadWorkspace.Text = Localization.Get(K.MenuLoadWorkspace);

        ApplyRecentProjectsMenuLocalization();

        if (menuExport != null)
            menuExport.Text = Localization.Get(K.MenuExport);

        if (menuExportPage != null)
            menuExportPage.Text = Localization.Get(K.MenuExportPage);

        if (menuExportWorkspace != null)
            menuExportWorkspace.Text = Localization.Get(K.MenuExportWorkspace);

        if (menuProfile != null)
            menuProfile.Text = Localization.Get(K.MenuProfile);

        titleBar.SetMarkTooltip(Localization.Get(K.TipAppSettingsMark));
        menuPreferences.Text = Localization.Get(K.MenuPreferences);

        if (menuTitleBarPageSearch != null)
            menuTitleBarPageSearch.Text = Localization.Get(K.MenuTitleBarPageSearch);

        menuLogin.Text = Localization.Get(K.MenuLogin);

        menuLogout.Text = Localization.Get(K.MenuLogout);

        menuAbout.Text = Localization.Get(K.MenuAbout);

        menuExit.Text = Localization.Get(K.MenuExit);

        menuWorkspace.Text = Localization.Get(K.MenuWorkspace);

        menuNewRootWorkspace.Text = Localization.Get(K.MenuNewRootWorkspace);

        menuNewSubWorkspace.Text = Localization.Get(K.MenuNewSubWorkspace);

        menuNewPage.Text = Localization.Get(K.MenuNewPage);

        menuRename.Text = Localization.Get(K.MenuRename);

        menuDelete.Text = Localization.Get(K.MenuDelete);

        menuWorkspaceMembers.Text = Localization.Get(K.MenuWorkspaceMembers);

        menuView.Text = Localization.Get(K.MenuView);

        menuWorkspacePanel.Text = Localization.Get(K.MenuWorkspacePanel);

        ApplyOutlineNavLocalization();
        ApplyCommentsLocalization();

        menuAdmin.Text = Localization.Get(K.MenuAdmin);

        menuAdminUserManagement.Text = Localization.Get(K.MenuAdminUsers);

        menuAdminDatabaseSettings.Text = Localization.Get(K.MenuAdminDatabase);

        menuAdminEmailSettings.Text = Localization.Get(K.MenuAdminEmail);

        menuEditProfile.Text = Localization.Get(K.MenuEditProfile);

        menuChangePassword.Text = Localization.Get(K.MenuChangePassword);

        menuNotificationSettings.Text = Localization.Get(K.MenuNotificationSettings);



        ctxNewRootWorkspace.Text = Localization.Get(K.MenuNewRootWorkspace);

        ctxNewSubWorkspace.Text = Localization.Get(K.CtxNewSubWorkspace);

        ctxNewPage.Text = Localization.Get(K.CtxNewPage);

        ctxRename.Text = Localization.Get(K.CtxRename);

        ctxDelete.Text = Localization.Get(K.CtxDelete);

        ctxMembers.Text = Localization.Get(K.CtxMembers);

        UpdateWorkspaceToggleButtonText();



        SetupEditorContextMenuTexts();

        SetupWysiwygToolbar();

        ApplyUiTooltips();

        RefreshNavRailTooltips();

        RefreshStatusTexts();

    }



    private void RefreshStatusTexts()

    {

        if (!SessionContext.IsLoggedIn)

        {

            lblStatus.Text = Localization.Get(K.StatusLoginRequired);

            return;

        }



        if (_currentPageId.HasValue && !string.IsNullOrWhiteSpace(_currentPageTitle))

            lblStatus.Text = Localization.Format(K.StatusPage, _currentPageTitle.Trim());

        else

            lblStatus.Text = SessionContext.IsAdmin

                ? Localization.Get(K.StatusAdmin)

                : Localization.Get(K.StatusUser);



        SetSaveStatus(_saveStatusKind, refreshTextOnly: true);

    }



    private void SetSaveStatus(SaveStatusKind kind, bool refreshTextOnly = false)

    {

        _saveStatusKind = kind;

        lblSaveStatus.Text = kind switch

        {

            SaveStatusKind.Modified => Localization.Get(K.SaveStatusModified),

            SaveStatusKind.Saved => Localization.Get(K.SaveStatusSaved),

            SaveStatusKind.AutoSaved => Localization.Get(K.SaveStatusAutoSaved),

            SaveStatusKind.OfflineSaved => Localization.Get(K.SaveStatusOfflineSaved),

            SaveStatusKind.Failed => Localization.Get(K.SaveStatusFailed),

            _ => string.Empty

        };

        lblSaveStatus.ForeColor = AppTheme.GetSaveStatusColor(kind);



        if (refreshTextOnly)

            return;



        if (kind is SaveStatusKind.Saved or SaveStatusKind.AutoSaved or SaveStatusKind.OfflineSaved &&

            _currentPageId.HasValue &&

            SessionContext.IsLoggedIn &&

            !string.IsNullOrWhiteSpace(_currentPageTitle))

            lblStatus.Text = Localization.Format(K.StatusPage, _currentPageTitle.Trim());

    }



    private async void menuPreferences_Click(object? sender, EventArgs e)

    {

        using var form = new PreferencesForm();

        if (form.ShowDialog(this) != DialogResult.OK)

            return;



        AppConfig.SaveUiSettings(form.SelectedSettings);

        ApplyLocalization();
        ApplyModernTheme();

        if (SessionContext.IsLoggedIn)
            LoadWorkspaceTree(_currentPageId, null);
        else
            ApplyLoggedOutState();
    }

    private void UpdateTitleBarCaption()
    {
        var appName = Localization.Get(K.AppName);
        titleBar.SetAppName(appName);
        Text = SessionContext.IsLoggedIn
            ? Localization.Format(K.AppTitleLoggedIn, SessionContext.CurrentUser.Username)
            : Localization.Get(K.AppTitleLoggedOut);
    }



    private async Task RefreshEditorChromeAsync()
    {
        ApplyEditorHostTheme();

        if (_editor == null || !_editor.IsReady)
            return;

        _editor.ResetScriptSuspension();
        await _editor.ApplyThemeChromeAsync();
    }

    private void ApplyEditorHostTheme()
    {
        webViewEditor.DefaultBackgroundColor = AppTheme.EditorBackground;
        pnlEditorEmptySurface.BackColor = AppTheme.EditorBackground;

        _editor?.ApplyWebViewChrome();
        if (_editor != null)
            _ = _editor.ApplyThemeChromeAsync();
    }
}

