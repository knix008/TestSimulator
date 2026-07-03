namespace MyWorkspace.Win.Forms;



public partial class MainForm

{

    private void ApplyUiTooltips()

    {

        menuStrip1.ShowItemToolTips = true;

        toolStripMarkdown.ShowItemToolTips = true;

        ctxTree.ShowItemToolTips = true;

        _ctxEditor?.ShowItemToolTips = true;
        if (_ctxEditorImage != null)
            _ctxEditorImage.ShowItemToolTips = true;



        SetTip(menuFile, K.TipMenuFile);

        SetTip(menuSavePage, K.TipMenuSavePage);

        SetTip(menuPageHistory, K.ToolbarHistory);

        SetTip(menuRefreshTree, K.TipMenuRefreshTree);

        if (menuNewProject != null)
            SetTip(menuNewProject, K.TipMenuNewProject);

        if (menuSaveWorkspace != null)

            SetTip(menuSaveWorkspace, K.TipMenuSaveProject);

        if (menuLoadWorkspace != null)

            SetTip(menuLoadWorkspace, K.TipMenuOpenProject);

        if (menuRecentProjects != null)

            SetTip(menuRecentProjects, K.TipMenuRecentProjects);

        if (menuExport != null)
            SetTip(menuExport, K.TipMenuExport);

        if (menuExportPage != null)
            SetTip(menuExportPage, K.MenuExportPage);

        if (menuExportWorkspace != null)
            SetTip(menuExportWorkspace, K.MenuExportWorkspace);

        if (menuProfile != null)
            SetTip(menuProfile, K.TipMenuProfile);

        SetTip(menuPreferences, K.TipMenuPreferences);

        if (menuTitleBarPageSearch != null)
            SetTip(menuTitleBarPageSearch, K.TipMenuTitleBarPageSearch);

        SetTip(menuLogin, K.TipMenuLogin);

        SetTip(menuLogout, K.TipMenuLogout);

        SetTip(menuAbout, K.ToolbarAbout);

        SetTip(menuExit, K.TipMenuExit);



        SetTip(menuWorkspace, K.TipMenuWorkspace);

        SetTip(menuNewRootWorkspace, K.TipMenuNewRootWorkspace);

        SetTip(menuNewSubWorkspace, K.TipMenuNewSubWorkspace);

        SetTip(menuNewPage, K.TipMenuNewPage);

        SetTip(menuRename, K.TipMenuRename);

        SetTip(menuDelete, K.TipMenuDelete);

        SetTip(menuWorkspaceMembers, K.TipMenuWorkspaceMembers);



        SetTip(menuView, K.TipMenuView);

        SetTip(menuDocumentStructure, K.ToolbarDocumentStructure);



        SetTip(menuAdmin, K.TipMenuAdmin);

        SetTip(menuAdminUserManagement, K.TipMenuAdminUsers);

        SetTip(menuAdminDatabaseSettings, K.TipMenuAdminDatabase);

        SetTip(menuAdminEmailSettings, K.TipMenuAdminEmail);

        SetTip(menuEditProfile, K.TipMenuEditProfile);

        SetTip(menuChangePassword, K.TipMenuChangePassword);

        SetTip(menuNotificationSettings, K.TipMenuNotificationSettings);



        SetTip(ctxNewRootWorkspace, K.TipMenuNewRootWorkspace);

        SetTip(ctxNewSubWorkspace, K.TipMenuNewSubWorkspace);

        SetTip(ctxNewPage, K.TipMenuNewPage);

        SetTip(ctxRename, K.TipMenuRename);

        SetTip(ctxDelete, K.TipMenuDelete);

        SetTip(ctxMembers, K.TipMenuWorkspaceMembers);

        SetTip(ctxToggleFavorite, K.TipCtxToggleFavoriteAdd);



        ApplyEditorContextMenuTooltips();

        ApplyToolbarTooltips();

    }



    private void ApplyToolbarTooltips()

    {

        foreach (ToolStripItem item in toolStripMarkdown.Items)

        {

            if (item is not ToolStripButton button || string.IsNullOrEmpty(button.Name))

                continue;



            button.ToolTipText = button.Name switch

            {

                "toolbar_history" => Localization.Get(K.ToolbarHistory),

                "toolbar_log" => Localization.Get(K.ToolbarPageLog),

                "toolbar_h1" => Localization.Get(K.ToolbarHeading1),

                "toolbar_h2" => Localization.Get(K.ToolbarHeading2),

                "toolbar_h3" => Localization.Get(K.ToolbarHeading3),

                "toolbar_h4" => Localization.Get(K.ToolbarHeading4),

                "toolbar_h5" => Localization.Get(K.ToolbarHeading5),

                "toolbar_h6" => Localization.Get(K.ToolbarHeading6),

                "toolbar_bold" => Localization.Get(K.ToolbarBold),

                "toolbar_italic" => Localization.Get(K.ToolbarItalic),

                "toolbar_strike" => Localization.Get(K.ToolbarStrike),

                "toolbar_code" => Localization.Get(K.ToolbarInlineCode),

                "toolbar_codeblock" => Localization.Get(K.ToolbarCodeBlock),

                "toolbar_link" => Localization.Get(K.ToolbarLink),

                "toolbar_image" => Localization.Get(K.ToolbarImage),

                "toolbar_attach" => Localization.Get(K.ToolbarAttachFile),

                "toolbar_ul" => Localization.Get(K.ToolbarBulletList),

                "toolbar_ol" => Localization.Get(K.ToolbarNumberList),

                "toolbar_quote" => Localization.Get(K.ToolbarQuote),

                "toolbar_hr" => Localization.Get(K.ToolbarHorizontalRule),

                "toolbar_table" => Localization.Get(K.ToolbarTable),

                "toolbar_undo" => Localization.Get(K.ToolbarUndo),

                "toolbar_redo" => Localization.Get(K.ToolbarRedo),

                "toolbar_outline" => editorAreaSplit.Panel1Collapsed

                    ? Localization.Get(K.OutlineExpand)

                    : Localization.Get(K.OutlineCollapse),

                "toolbar_comments" => commentsEditorSplit.Panel2Collapsed
                    ? Localization.Get(K.CommentsExpand)
                    : Localization.Get(K.CommentsCollapse),

                "toolbar_info" => Localization.Get(K.ToolbarAbout),

                _ => button.ToolTipText

            };

        }

        toolStripMarkdown.OverflowButton.ToolTipText = Localization.Get(K.TipToolbarMoreTools);
    }



    private void ApplyEditorContextMenuTooltips()

    {

        if (_ctxEditor == null)

            return;



        foreach (ToolStripItem item in _ctxEditor.Items)

        {

            if (item.Tag is not string key)

                continue;



            item.ToolTipText = key switch

            {

                K.EditorCut => Localization.Get(K.TipEditorCut),

                K.EditorCopy => Localization.Get(K.TipEditorCopy),

                K.EditorPaste => Localization.Get(K.TipEditorPaste),

                K.EditorCommentOnSelection => Localization.Get(K.TipEditorCommentOnSelection),

                K.EditorCommentOnLine => Localization.Get(K.TipEditorCommentOnLine),

                K.EditorSelectAll => Localization.Get(K.TipEditorSelectAll),

                K.EditorBold => Localization.Get(K.TipEditorBold),

                K.EditorItalic => Localization.Get(K.TipEditorItalic),

                K.ToolbarUndo => Localization.Get(K.ToolbarUndo),

                K.ToolbarRedo => Localization.Get(K.ToolbarRedo),

                K.ToolbarStrike => Localization.Get(K.ToolbarStrike),

                K.ToolbarInlineCode => Localization.Get(K.ToolbarInlineCode),

                K.ToolbarCodeBlock => Localization.Get(K.ToolbarCodeBlock),

                K.ToolbarLink => Localization.Get(K.ToolbarLink),

                K.ToolbarImage => Localization.Get(K.ToolbarImage),

                K.ToolbarBulletList => Localization.Get(K.ToolbarBulletList),

                K.ToolbarNumberList => Localization.Get(K.ToolbarNumberList),

                K.ToolbarQuote => Localization.Get(K.ToolbarQuote),

                K.ToolbarHorizontalRule => Localization.Get(K.ToolbarHorizontalRule),

                K.ToolbarTable => Localization.Get(K.ToolbarTable),

                K.ToolbarDocumentStructure => Localization.Get(K.ToolbarDocumentStructure),

                K.ToolbarHeading1 => Localization.Get(K.ToolbarHeading1),

                K.ToolbarHeading2 => Localization.Get(K.ToolbarHeading2),

                K.ToolbarHeading3 => Localization.Get(K.ToolbarHeading3),

                K.ToolbarHeading4 => Localization.Get(K.ToolbarHeading4),

                K.ToolbarHeading5 => Localization.Get(K.ToolbarHeading5),

                K.ToolbarHeading6 => Localization.Get(K.ToolbarHeading6),

                _ => item.ToolTipText

            };

        }

        if (_ctxEditorImage == null)
            return;

        foreach (ToolStripItem item in _ctxEditorImage.Items)
        {
            if (item.Tag is not string key)
                continue;

            item.ToolTipText = key switch
            {
                K.EditorImageOpen => Localization.Get(K.TipEditorImageOpen),
                K.EditorCommentOnSelection => Localization.Get(K.TipEditorCommentOnSelection),
                K.EditorCut => Localization.Get(K.TipEditorCut),
                K.EditorCopy => Localization.Get(K.TipEditorCopy),
                K.EditorImageReplace => Localization.Get(K.TipEditorImageReplace),
                K.EditorImageDelete => Localization.Get(K.TipEditorImageDelete),
                _ => item.ToolTipText
            };
        }

    }



    private static void SetTip(ToolStripItem item, string key) =>

        item.ToolTipText = Localization.Get(key);

}

