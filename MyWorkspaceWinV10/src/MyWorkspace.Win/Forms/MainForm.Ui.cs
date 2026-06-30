namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private SaveStatusKind _saveStatusKind = SaveStatusKind.None;

    private void ApplyModernTheme()
    {
        AppTheme.ApplyMainShell(
            menuStrip1,
            toolStripMarkdown,
            statusStrip1,
            ctxTree,
            treeWorkspace,
            treeOutline,
            pnlOutlineSidebar,
            pnlOutlineHeader,
            lblOutline,
            btnToggleOutline,
            pnlTitle,
            lblTitleCaption,
            txtTitle,
            outerSplit.Panel1,
            rightPanel,
            outerSplit,
            editorAreaSplit,
            webViewEditor,
            lblStatus,
            lblSaveStatus);

        if (_ctxEditor != null)
            AppTheme.StyleContextMenu(_ctxEditor);

        RefreshToolbarIcons();
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
        menuPreferences.Text = Localization.Get(K.MenuPreferences);
        menuLogin.Text = Localization.Get(K.MenuLogin);
        menuLogout.Text = Localization.Get(K.MenuLogout);
        menuAccountLogout.Text = Localization.Get(K.MenuLogout);
        menuBarLogin.Text = Localization.Get(K.MenuBarLogin);
        menuBarLogout.Text = Localization.Get(K.MenuBarLogout);
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

        lblTitleCaption.Text = Localization.Get(K.LabelTitle);
        lblOutline.Text = Localization.Get(K.LabelOutline);
        UpdateOutlineToggleButtonText();

        SetupEditorContextMenuTexts();
        SetupWysiwygToolbar();
        ApplyUiTooltips();
        UpdateMenuBarSession();
        RefreshStatusTexts();
    }

    private void RefreshStatusTexts()
    {
        if (!SessionContext.IsLoggedIn)
        {
            lblStatus.Text = Localization.Get(K.StatusLoginRequired);
            return;
        }

        if (_currentPageId.HasValue && !string.IsNullOrWhiteSpace(txtTitle.Text))
            lblStatus.Text = Localization.Format(K.StatusPage, txtTitle.Text.Trim());
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
            SessionContext.IsLoggedIn)
            lblStatus.Text = Localization.Format(K.StatusPage, txtTitle.Text.Trim());
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

        await RefreshEditorChromeAsync();
    }

    private async Task RefreshEditorChromeAsync()
    {
        if (!SessionContext.IsLoggedIn || !_currentPageId.HasValue)
        {
            await _editor.ClearAsync(_pipeline);
            return;
        }

        var page = AppConfig.Services.Pages.GetById(SessionContext.CurrentUser, _currentPageId.Value);
        if (page == null)
            return;

        _isLoadingPage = true;
        try
        {
            await _editor.LoadMarkdownAsync(page.Content, _pipeline, _currentPageId);
        }
        finally
        {
            _isLoadingPage = false;
        }
    }
}
