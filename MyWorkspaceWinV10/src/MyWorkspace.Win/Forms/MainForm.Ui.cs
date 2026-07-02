namespace MyWorkspace.Win.Forms;



public partial class MainForm

{

    private SaveStatusKind _saveStatusKind = SaveStatusKind.None;



    private void ApplyModernTheme()

    {

        ApplyStartupTheme();

        if (_ctxEditor != null)
            AppTheme.StyleContextMenu(_ctxEditor);

        RefreshToolbarIcons();

        _ = RefreshEditorChromeAsync();
    }

    private void ApplyStartupTheme()
    {
        AppTheme.ApplyFormChrome(this);

        pnlMainContent.BackColor = AppTheme.Background;
        pnlMainContent.Padding = Padding.Empty;

        AppTheme.ApplyMenuStrip(menuStrip1);
        AppTheme.ApplyVerticalToolbar(toolStripMarkdown);
        toolStripMarkdown.Padding = new Padding(4, 8 + ToolbarTopGap, 4, 8);
        AppTheme.ApplyStatusStrip(statusStrip1);
        AppTheme.StyleContextMenu(ctxTree);
        AppTheme.StyleTreeView(treeWorkspace);
        AppTheme.StyleTreeView(treeOutline);

        pnlWorkspaceSidebar.BackColor = AppTheme.Sidebar;
        pnlWorkspaceSidebar.Padding = new Padding(NavWorkspaceGap, WorkspaceTopGap + 1, 0, 1);
        AppTheme.StyleBorderedPanel(pnlWorkspaceSidebar, PanelEdges.Top | PanelEdges.Bottom);

        pnlOutlineSidebar.BackColor = AppTheme.Sidebar;
        AppTheme.StyleBorderedPanel(pnlOutlineSidebar, PanelEdges.All);

        pnlEditorColumn.BackColor = AppTheme.Surface;
        pnlEditorColumn.Padding = Padding.Empty;
        pnlEditorColumn.Margin = Padding.Empty;
        AppTheme.StyleBorderedPanel(pnlEditorColumn, PanelEdges.Top | PanelEdges.Right | PanelEdges.Bottom);

        pnlEditorHost.BackColor = AppTheme.Surface;
        pnlEditorHost.Padding = new Padding(1);
        pnlEditorHost.Margin = Padding.Empty;
        AppTheme.StyleBorderedPanel(pnlEditorHost, PanelEdges.All);

        editorAreaSplit.Panel1.Padding = Padding.Empty;
        editorAreaSplit.Panel2.Padding = Padding.Empty;
        outerSplit.Panel2.Padding = Padding.Empty;

        AppTheme.StyleSplitContainer(outerSplit);
        AppTheme.StyleSplitContainer(editorAreaSplit);

        pnlOutlineHeader.Padding = new Padding(10, 0, 4, 0);
        pnlOutlineHeader.MinimumSize = new Size(0, 38);
        AppTheme.StylePanelTitleHeader(pnlOutlineHeader, lblOutline, PanelHeaderKind.Outline);
        AppTheme.StyleOutlineToggleButton(btnToggleOutline);
        btnToggleOutline.BackColor = Color.Transparent;

        lblStatus.ForeColor = AppTheme.TextSecondary;
        lblSaveStatus.ForeColor = AppTheme.TextMuted;

        ApplyEditorHostTheme();
        UpdateEditorEmptySurface();
        RefreshNavRailTheme();
    }



    private void ApplyLocalization()

    {

        Text = SessionContext.IsLoggedIn

            ? Localization.Format(K.AppTitleLoggedIn, SessionContext.CurrentUser.Username)

            : Localization.Get(K.AppTitleLoggedOut);



        menuFile.Text = Localization.Get(K.MenuFile);

        menuSavePage.Text = Localization.Get(K.MenuSavePage);

        menuPageHistory.Text = Localization.Get(K.MenuPageHistory);

        menuRefreshTree.Text = Localization.Get(K.MenuRefreshTree);

        if (menuSaveWorkspace != null)

            menuSaveWorkspace.Text = Localization.Get(K.MenuSaveWorkspace);

        if (menuLoadWorkspace != null)

            menuLoadWorkspace.Text = Localization.Get(K.MenuLoadWorkspace);

        if (menuExportWorkspace != null)

            menuExportWorkspace.Text = Localization.Get(K.MenuExportWorkspace);

        menuPreferences.Text = Localization.Get(K.MenuPreferences);

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

        menuDocumentStructure.Text = Localization.Get(K.MenuDocumentStructure);

        menuAdmin.Text = Localization.Get(K.MenuAdmin);

        menuAdminUserManagement.Text = Localization.Get(K.MenuAdminUsers);

        menuAdminDatabaseSettings.Text = Localization.Get(K.MenuAdminDatabase);

        menuAdminEmailSettings.Text = Localization.Get(K.MenuAdminEmail);

        menuAccount.Text = Localization.Get(K.MenuAccount);

        menuEditProfile.Text = Localization.Get(K.MenuEditProfile);

        menuChangePassword.Text = Localization.Get(K.MenuChangePassword);

        menuNotificationSettings.Text = Localization.Get(K.MenuNotificationSettings);



        ctxNewRootWorkspace.Text = Localization.Get(K.MenuNewRootWorkspace);

        ctxNewSubWorkspace.Text = Localization.Get(K.CtxNewSubWorkspace);

        ctxNewPage.Text = Localization.Get(K.CtxNewPage);

        ctxRename.Text = Localization.Get(K.CtxRename);

        ctxDelete.Text = Localization.Get(K.CtxDelete);

        ctxMembers.Text = Localization.Get(K.CtxMembers);



        lblOutline.Text = Localization.Get(K.LabelOutline);

        UpdateOutlineToggleButtonText();



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



    private void UpdateOutlineToggleButtonText()

    {

        var expandText = Localization.Get(K.OutlineExpand);

        var collapseText = Localization.Get(K.OutlineCollapse);

        var collapsed = editorAreaSplit.Panel1Collapsed;



        btnToggleOutline.Text = collapsed ? expandText : collapseText;



        if (_toolbarOutlineButton != null)

        {

            var tip = collapsed

                ? Localization.Get(K.OutlineExpand)

                : Localization.Get(K.OutlineCollapse);

            _toolbarOutlineButton.ToolTipText = tip;

        }



        ApplyToolbarTooltips();

    }



    private async void menuPreferences_Click(object? sender, EventArgs e)

    {

        using var form = new PreferencesForm();

        if (form.ShowDialog(this) != DialogResult.OK)

            return;



        AppConfig.SaveUiSettings(form.SelectedSettings);

        ApplyLocalization();



        if (SessionContext.IsLoggedIn)

            LoadWorkspaceTree(_currentPageId, null);

        else

            ApplyLoggedOutState();

    }



    private async Task RefreshEditorChromeAsync()
    {
        ApplyEditorHostTheme();

        if (_editor == null)
            return;

        var suppressLoading = _isLoadingPage;
        _isLoadingPage = true;
        try
        {
            _editor.ApplyWebViewChrome();
            _editor.ResetScriptSuspension();

            if (!_editor.IsReady)
                return;

            var markdown = await _editor.GetMarkdownAsync(_currentPageId);
            await _editor.LoadMarkdownAsync(markdown, _pipeline, _currentPageId);
        }
        finally
        {
            _isLoadingPage = suppressLoading;
        }
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

