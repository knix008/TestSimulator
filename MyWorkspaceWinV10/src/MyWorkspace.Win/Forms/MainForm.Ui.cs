namespace MyWorkspace.Win.Forms;



public partial class MainForm

{

    private SaveStatusKind _saveStatusKind = SaveStatusKind.None;



    private void ApplyModernTheme()

    {

        AppTheme.ApplyFormChrome(this);

        AppTheme.ApplyMenuStrip(menuStrip1);

        AppTheme.ApplyToolbar(toolStripMarkdown);

        AppTheme.ApplyStatusStrip(statusStrip1);

        AppTheme.StyleContextMenu(ctxTree);

        AppTheme.StyleTreeView(treeWorkspace);

        AppTheme.StyleTreeView(treeOutline);

        AppTheme.StyleSplitContainer(outerSplit);

        AppTheme.StyleSplitContainer(editorAreaSplit);

        AppTheme.StyleTabControl(tabPageEditors);
        ApplyEditorHostTheme();



        pnlWorkspaceSidebar.BackColor = AppTheme.Sidebar;

        AppTheme.StyleBorderedPanel(pnlWorkspaceSidebar, PanelEdges.All);

        pnlWorkspaceHeader.Padding = new Padding(10, 0, 4, 0);

        pnlWorkspaceHeader.MinimumSize = new Size(0, 38);

        AppTheme.StylePanelTitleHeader(pnlWorkspaceHeader, lblWorkspace, PanelHeaderKind.Workspace);



        pnlOutlineSidebar.BackColor = AppTheme.Sidebar;

        AppTheme.StyleBorderedPanel(pnlOutlineSidebar, PanelEdges.All);

        pnlOutlineHeader.Padding = new Padding(10, 0, 4, 0);

        pnlOutlineHeader.MinimumSize = new Size(0, 38);

        AppTheme.StylePanelTitleHeader(pnlOutlineHeader, lblOutline, PanelHeaderKind.Outline);

        AppTheme.StyleOutlineToggleButton(btnToggleOutline);

        btnToggleOutline.BackColor = Color.Transparent;



        pnlEditorColumn.BackColor = AppTheme.Surface;
        pnlEditorColumn.Padding = Padding.Empty;
        pnlEditorColumn.Margin = Padding.Empty;
        AppTheme.StyleBorderedPanel(pnlEditorColumn, PanelEdges.Top | PanelEdges.Right | PanelEdges.Bottom);

        pnlEditorHost.BackColor = AppTheme.EditorBackground;
        pnlEditorHost.Padding = Padding.Empty;
        pnlEditorHost.Margin = Padding.Empty;

        editorAreaSplit.Panel1.Padding = Padding.Empty;
        editorAreaSplit.Panel2.Padding = Padding.Empty;
        outerSplit.Panel2.Padding = Padding.Empty;

        pnlEditorHeader.Padding = new Padding(10, 0, 4, 0);

        pnlEditorHeader.MinimumSize = new Size(0, 38);

        AppTheme.StylePanelTitleHeader(pnlEditorHeader, lblEditor, PanelHeaderKind.Editor);

        UpdateEditorHostTabLayout();



        if (_ctxEditor != null)

            AppTheme.StyleContextMenu(_ctxEditor);



        RefreshToolbarIcons();

        _ = RefreshEditorChromeAsync();
    }



    private void ApplyLocalization()

    {

        Text = SessionContext.IsLoggedIn

            ? Localization.Format(K.AppTitleLoggedIn, SessionContext.CurrentUser.Username)

            : Localization.Get(K.AppTitleLoggedOut);



        menuFile.Text = Localization.Get(K.MenuFile);

        menuSavePage.Text = Localization.Get(K.MenuSavePage);

        if (menuClosePageTab != null)
            menuClosePageTab.Text = Localization.Get(K.MenuClosePageTab);

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



        ctxNewSubWorkspace.Text = Localization.Get(K.CtxNewSubWorkspace);

        ctxNewPage.Text = Localization.Get(K.CtxNewPage);

        ctxRename.Text = Localization.Get(K.CtxRename);

        ctxDelete.Text = Localization.Get(K.CtxDelete);

        ctxMembers.Text = Localization.Get(K.CtxMembers);



        lblWorkspace.Text = Localization.Get(K.LabelWorkspace);

        lblOutline.Text = Localization.Get(K.LabelOutline);

        lblEditor.Text = Localization.Get(K.LabelMarkdownEditor);

        UpdateOutlineToggleButtonText();



        SetupEditorContextMenuTexts();

        SetupWysiwygToolbar();

        ApplyUiTooltips();

        RefreshStatusTexts();

    }



    private void RefreshStatusTexts()

    {

        if (!SessionContext.IsLoggedIn)

        {

            lblStatus.Text = Localization.Get(K.StatusLoginRequired);

            return;

        }



        if (_currentPageId.HasValue && _activePageSession != null && !string.IsNullOrWhiteSpace(_activePageSession.Title))

            lblStatus.Text = Localization.Format(K.StatusPage, _activePageSession.Title.Trim());

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

            SaveStatusKind.Failed => Localization.Get(K.SaveStatusFailed),

            _ => string.Empty

        };

        lblSaveStatus.ForeColor = AppTheme.GetSaveStatusColor(kind);



        if (refreshTextOnly)

            return;



        if (kind is SaveStatusKind.Saved or SaveStatusKind.AutoSaved &&

            _currentPageId.HasValue &&

            SessionContext.IsLoggedIn &&

            _activePageSession != null)

            lblStatus.Text = Localization.Format(K.StatusPage, _activePageSession.Title.Trim());

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

        ApplyModernTheme();

        ApplyLocalization();



        if (SessionContext.IsLoggedIn)

            LoadWorkspaceTree(_currentPageId, null);

        else

            ApplyLoggedOutState();

    }



    private async Task RefreshEditorChromeAsync()
    {
        ApplyEditorHostTheme();

        if (_pageSessions.Count == 0)
            return;

        var suppressLoading = _isLoadingPage;
        _isLoadingPage = true;
        try
        {
            foreach (var session in _pageSessions)
            {
                session.Editor.ApplyWebViewChrome();
                session.Editor.ResetScriptSuspension();

                if (!session.Editor.IsReady)
                    continue;

                var markdown = await session.Editor.GetMarkdownAsync(session.PageId);
                await session.Editor.LoadMarkdownAsync(markdown, _pipeline, session.PageId);
            }
        }
        finally
        {
            _isLoadingPage = suppressLoading;
        }
    }

    private void ApplyEditorHostTheme()
    {
        tabPageEditors.BackColor = AppTheme.EditorBackground;

        foreach (TabPage page in tabPageEditors.TabPages)
            page.BackColor = AppTheme.EditorBackground;

        foreach (var session in _pageSessions)
            session.Editor.ApplyWebViewChrome();
    }
}

