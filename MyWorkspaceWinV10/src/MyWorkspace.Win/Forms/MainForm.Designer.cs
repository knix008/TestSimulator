using Microsoft.Web.WebView2.WinForms;
using MyWorkspace.Win;

namespace MyWorkspace.Win.Forms;

partial class MainForm
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
            components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(MainForm));
        menuStrip1 = new MenuStrip();
        menuFile = new ToolStripMenuItem();
        menuSavePage = new ToolStripMenuItem();
        menuPageHistory = new ToolStripMenuItem();
        menuRefreshTree = new ToolStripMenuItem();
        menuSepFile1 = new ToolStripSeparator();
        menuPreferences = new ToolStripMenuItem();
        menuSepFilePref = new ToolStripSeparator();
        menuLogin = new ToolStripMenuItem();
        menuLogout = new ToolStripMenuItem();
        menuSepFileAbout = new ToolStripSeparator();
        menuAbout = new ToolStripMenuItem();
        menuExit = new ToolStripMenuItem();
        menuWorkspace = new ToolStripMenuItem();
        menuNewRootWorkspace = new ToolStripMenuItem();
        menuNewSubWorkspace = new ToolStripMenuItem();
        menuNewPage = new ToolStripMenuItem();
        menuSepWs1 = new ToolStripSeparator();
        menuRename = new ToolStripMenuItem();
        menuDelete = new ToolStripMenuItem();
        menuSepWs2 = new ToolStripSeparator();
        menuWorkspaceMembers = new ToolStripMenuItem();
        menuView = new ToolStripMenuItem();
        menuDocumentStructure = new ToolStripMenuItem();
        menuAdmin = new ToolStripMenuItem();
        menuAdminUserManagement = new ToolStripMenuItem();
        menuAdminDatabaseSettings = new ToolStripMenuItem();
        menuAdminEmailSettings = new ToolStripMenuItem();
        menuAccount = new ToolStripMenuItem();
        menuEditProfile = new ToolStripMenuItem();
        menuChangePassword = new ToolStripMenuItem();
        menuSepAccount1 = new ToolStripSeparator();
        menuNotificationSettings = new ToolStripMenuItem();
        ctxTree = new ContextMenuStrip(components);
        ctxNewSubWorkspace = new ToolStripMenuItem();
        ctxNewPage = new ToolStripMenuItem();
        ctxSep1 = new ToolStripSeparator();
        ctxRename = new ToolStripMenuItem();
        ctxDelete = new ToolStripMenuItem();
        ctxSep2 = new ToolStripSeparator();
        ctxToggleFavorite = new ToolStripMenuItem();
        ctxSep3 = new ToolStripSeparator();
        ctxMembers = new ToolStripMenuItem();
        toolStripMarkdown = new ToolStrip();
        pnlEditorColumn = new Panel();
        editorAreaSplit = new SplitContainer();
        pnlOutlineSidebar = new Panel();
        treeOutline = new ThemedTreeView();
        pnlOutlineHeader = new Panel();
        lblOutline = new Label();
        btnToggleOutline = new Button();
        pnlEditorHost = new Panel();
        pnlEditorHeader = new Panel();
        lblEditor = new Label();
        tabPageEditors = new CloseableTabControl();
        outerSplit = new SplitContainer();
        pnlWorkspaceSidebar = new Panel();
        treeWorkspace = new ThemedTreeView();
        pnlWorkspaceHeader = new Panel();
        lblWorkspace = new Label();
        statusStrip1 = new StatusStrip();
        lblStatus = new ToolStripStatusLabel();
        lblSaveStatus = new ToolStripStatusLabel();
        saveTimer = new System.Windows.Forms.Timer(components);
        menuStrip1.SuspendLayout();
        ctxTree.SuspendLayout();
        pnlEditorColumn.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)editorAreaSplit).BeginInit();
        editorAreaSplit.Panel1.SuspendLayout();
        editorAreaSplit.Panel2.SuspendLayout();
        editorAreaSplit.SuspendLayout();
        pnlOutlineSidebar.SuspendLayout();
        pnlOutlineHeader.SuspendLayout();
        pnlEditorHost.SuspendLayout();
        pnlEditorHeader.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)outerSplit).BeginInit();
        outerSplit.Panel1.SuspendLayout();
        outerSplit.Panel2.SuspendLayout();
        outerSplit.SuspendLayout();
        pnlWorkspaceSidebar.SuspendLayout();
        pnlWorkspaceHeader.SuspendLayout();
        statusStrip1.SuspendLayout();
        SuspendLayout();
        // 
        // menuStrip1
        // 
        menuStrip1.Items.AddRange(new ToolStripItem[] { menuFile, menuWorkspace, menuView, menuAdmin, menuAccount });
        menuStrip1.Location = new Point(0, 0);
        menuStrip1.Name = "menuStrip1";
        menuStrip1.Size = new Size(1384, 24);
        menuStrip1.TabIndex = 2;
        // 
        // menuFile
        // 
        menuFile.DropDownItems.AddRange(new ToolStripItem[] { menuSavePage, menuPageHistory, menuRefreshTree, menuSepFile1, menuPreferences, menuSepFilePref, menuLogin, menuLogout, menuSepFileAbout, menuAbout, menuExit });
        menuFile.Name = "menuFile";
        menuFile.Size = new Size(57, 20);
        menuFile.Text = "파일(&F)";
        // 
        // menuSavePage
        // 
        menuSavePage.Name = "menuSavePage";
        menuSavePage.ShortcutKeys = Keys.Control | Keys.S;
        menuSavePage.Size = new Size(185, 22);
        menuSavePage.Text = "Page 저장(&S)";
        menuSavePage.Click += menuSavePage_Click;
        // 
        // menuPageHistory
        // 
        menuPageHistory.Name = "menuPageHistory";
        menuPageHistory.Size = new Size(185, 22);
        menuPageHistory.Text = "버전 이력(&H)";
        menuPageHistory.Click += menuPageHistory_Click;
        // 
        // menuRefreshTree
        // 
        menuRefreshTree.Name = "menuRefreshTree";
        menuRefreshTree.ShortcutKeys = Keys.F5;
        menuRefreshTree.Size = new Size(185, 22);
        menuRefreshTree.Text = "트리 새로고침(&R)";
        menuRefreshTree.Click += menuRefreshTree_Click;
        // 
        // menuSepFile1
        // 
        menuSepFile1.Name = "menuSepFile1";
        menuSepFile1.Size = new Size(182, 6);
        // 
        // menuPreferences
        // 
        menuPreferences.Name = "menuPreferences";
        menuPreferences.Size = new Size(185, 22);
        menuPreferences.Click += menuPreferences_Click;
        // 
        // menuSepFilePref
        // 
        menuSepFilePref.Name = "menuSepFilePref";
        menuSepFilePref.Size = new Size(182, 6);
        // 
        // menuLogin
        // 
        menuLogin.Name = "menuLogin";
        menuLogin.Size = new Size(185, 22);
        menuLogin.Text = "로그인(&L)...";
        menuLogin.Click += menuLogin_Click;
        // 
        // menuLogout
        // 
        menuLogout.Name = "menuLogout";
        menuLogout.Size = new Size(185, 22);
        menuLogout.Text = "로그아웃(&L)";
        menuLogout.Click += menuLogout_Click;
        // 
        // menuSepFileAbout
        // 
        menuSepFileAbout.Name = "menuSepFileAbout";
        menuSepFileAbout.Size = new Size(182, 6);
        // 
        // menuAbout
        // 
        menuAbout.Name = "menuAbout";
        menuAbout.Size = new Size(185, 22);
        menuAbout.Text = "프로그램 정보(&A)...";
        menuAbout.Click += menuAbout_Click;
        // 
        // menuExit
        // 
        menuExit.Name = "menuExit";
        menuExit.Size = new Size(185, 22);
        menuExit.Text = "종료(&X)";
        menuExit.Click += menuExit_Click;
        // 
        // menuWorkspace
        // 
        menuWorkspace.DropDownItems.AddRange(new ToolStripItem[] { menuNewRootWorkspace, menuNewSubWorkspace, menuNewPage, menuSepWs1, menuRename, menuDelete, menuSepWs2, menuWorkspaceMembers });
        menuWorkspace.Name = "menuWorkspace";
        menuWorkspace.Size = new Size(96, 20);
        menuWorkspace.Text = "Workspace(&W)";
        // 
        // menuNewRootWorkspace
        // 
        menuNewRootWorkspace.Name = "menuNewRootWorkspace";
        menuNewRootWorkspace.Size = new Size(161, 22);
        menuNewRootWorkspace.Text = "새 Workspace";
        menuNewRootWorkspace.Click += menuNewRootWorkspace_Click;
        // 
        // menuNewSubWorkspace
        // 
        menuNewSubWorkspace.Name = "menuNewSubWorkspace";
        menuNewSubWorkspace.Size = new Size(161, 22);
        menuNewSubWorkspace.Text = "하위 Workspace";
        menuNewSubWorkspace.Click += menuNewSubWorkspace_Click;
        // 
        // menuNewPage
        // 
        menuNewPage.Name = "menuNewPage";
        menuNewPage.Size = new Size(161, 22);
        menuNewPage.Text = "새 Page (양식)...";
        menuNewPage.Click += menuNewPage_Click;
        // 
        // menuSepWs1
        // 
        menuSepWs1.Name = "menuSepWs1";
        menuSepWs1.Size = new Size(158, 6);
        // 
        // menuRename
        // 
        menuRename.Name = "menuRename";
        menuRename.Size = new Size(161, 22);
        menuRename.Text = "이름 변경";
        menuRename.Click += menuRename_Click;
        // 
        // menuDelete
        // 
        menuDelete.Name = "menuDelete";
        menuDelete.Size = new Size(161, 22);
        menuDelete.Text = "삭제";
        menuDelete.Click += menuDelete_Click;
        // 
        // menuSepWs2
        // 
        menuSepWs2.Name = "menuSepWs2";
        menuSepWs2.Size = new Size(158, 6);
        // 
        // menuWorkspaceMembers
        // 
        menuWorkspaceMembers.Name = "menuWorkspaceMembers";
        menuWorkspaceMembers.Size = new Size(161, 22);
        menuWorkspaceMembers.Text = "멤버 관리";
        menuWorkspaceMembers.Click += menuWorkspaceMembers_Click;
        // 
        // menuView
        // 
        menuView.DropDownItems.AddRange(new ToolStripItem[] { menuDocumentStructure });
        menuView.Name = "menuView";
        menuView.Size = new Size(59, 20);
        menuView.Text = "보기(&V)";
        // 
        // menuDocumentStructure
        // 
        menuDocumentStructure.Name = "menuDocumentStructure";
        menuDocumentStructure.Size = new Size(159, 22);
        menuDocumentStructure.Text = "문서 구조 (Info)";
        menuDocumentStructure.Click += menuDocumentStructure_Click;
        // 
        // menuAdmin
        // 
        menuAdmin.DropDownItems.AddRange(new ToolStripItem[] { menuAdminUserManagement, menuAdminDatabaseSettings, menuAdminEmailSettings });
        menuAdmin.Name = "menuAdmin";
        menuAdmin.Size = new Size(59, 20);
        menuAdmin.Text = "관리(&A)";
        // 
        // menuAdminUserManagement
        // 
        menuAdminUserManagement.Name = "menuAdminUserManagement";
        menuAdminUserManagement.Size = new Size(166, 22);
        menuAdminUserManagement.Text = "사용자 관리";
        menuAdminUserManagement.Click += menuAdminUserManagement_Click;
        // 
        // menuAdminDatabaseSettings
        // 
        menuAdminDatabaseSettings.Name = "menuAdminDatabaseSettings";
        menuAdminDatabaseSettings.Size = new Size(166, 22);
        menuAdminDatabaseSettings.Text = "DB 연결 설정...";
        menuAdminDatabaseSettings.Click += menuDatabaseSettings_Click;
        // 
        // menuAdminEmailSettings
        // 
        menuAdminEmailSettings.Name = "menuAdminEmailSettings";
        menuAdminEmailSettings.Size = new Size(166, 22);
        menuAdminEmailSettings.Text = "이메일 서버 설정";
        menuAdminEmailSettings.Click += menuAdminEmailSettings_Click;
        // 
        // menuAccount
        // 
        menuAccount.DropDownItems.AddRange(new ToolStripItem[] { menuEditProfile, menuChangePassword, menuSepAccount1, menuNotificationSettings });
        menuAccount.Name = "menuAccount";
        menuAccount.Size = new Size(59, 20);
        menuAccount.Text = "계정(&C)";
        // 
        // menuEditProfile
        // 
        menuEditProfile.Name = "menuEditProfile";
        menuEditProfile.Size = new Size(150, 22);
        menuEditProfile.Text = "프로필 수정";
        menuEditProfile.Click += menuEditProfile_Click;
        // 
        // menuChangePassword
        // 
        menuChangePassword.Name = "menuChangePassword";
        menuChangePassword.Size = new Size(150, 22);
        menuChangePassword.Text = "비밀번호 변경";
        menuChangePassword.Click += menuChangePassword_Click;
        // 
        // menuSepAccount1
        // 
        menuSepAccount1.Name = "menuSepAccount1";
        menuSepAccount1.Size = new Size(147, 6);
        // 
        // menuNotificationSettings
        // 
        menuNotificationSettings.Name = "menuNotificationSettings";
        menuNotificationSettings.Size = new Size(150, 22);
        menuNotificationSettings.Text = "알림 설정";
        menuNotificationSettings.Click += menuNotificationSettings_Click;
        // 
        // ctxTree
        // 
        ctxTree.Items.AddRange(new ToolStripItem[] { ctxNewSubWorkspace, ctxNewPage, ctxSep1, ctxRename, ctxDelete, ctxSep2, ctxToggleFavorite, ctxSep3, ctxMembers });
        ctxTree.Name = "ctxTree";
        ctxTree.Size = new Size(189, 154);
        ctxTree.Opening += ctxTree_Opening;
        // 
        // ctxNewSubWorkspace
        // 
        ctxNewSubWorkspace.Name = "ctxNewSubWorkspace";
        ctxNewSubWorkspace.Size = new Size(188, 22);
        ctxNewSubWorkspace.Text = "하위 Workspace 추가";
        ctxNewSubWorkspace.Click += ctxNewSubWorkspace_Click;
        // 
        // ctxNewPage
        // 
        ctxNewPage.Name = "ctxNewPage";
        ctxNewPage.Size = new Size(188, 22);
        ctxNewPage.Text = "새 Page (양식)...";
        ctxNewPage.Click += ctxNewPage_Click;
        // 
        // ctxSep1
        // 
        ctxSep1.Name = "ctxSep1";
        ctxSep1.Size = new Size(185, 6);
        // 
        // ctxRename
        // 
        ctxRename.Name = "ctxRename";
        ctxRename.Size = new Size(188, 22);
        ctxRename.Text = "이름 변경";
        ctxRename.Click += ctxRename_Click;
        // 
        // ctxDelete
        // 
        ctxDelete.Name = "ctxDelete";
        ctxDelete.Size = new Size(188, 22);
        ctxDelete.Text = "삭제";
        ctxDelete.Click += ctxDelete_Click;
        // 
        // ctxSep2
        // 
        ctxSep2.Name = "ctxSep2";
        ctxSep2.Size = new Size(185, 6);
        // 
        // ctxToggleFavorite
        // 
        ctxToggleFavorite.Name = "ctxToggleFavorite";
        ctxToggleFavorite.Size = new Size(188, 22);
        ctxToggleFavorite.Text = "즐겨찾기 추가";
        ctxToggleFavorite.Click += ctxToggleFavorite_Click;
        // 
        // ctxSep3
        // 
        ctxSep3.Name = "ctxSep3";
        ctxSep3.Size = new Size(185, 6);
        // 
        // ctxMembers
        // 
        ctxMembers.Name = "ctxMembers";
        ctxMembers.Size = new Size(188, 22);
        ctxMembers.Text = "멤버 관리";
        ctxMembers.Click += ctxMembers_Click;
        // 
        // toolStripMarkdown
        // 
        toolStripMarkdown.ImageScalingSize = new Size(20, 20);
        toolStripMarkdown.Location = new Point(0, 0);
        toolStripMarkdown.Name = "toolStripMarkdown";
        toolStripMarkdown.Padding = new Padding(4, 2, 4, 2);
        toolStripMarkdown.Size = new Size(1148, 25);
        toolStripMarkdown.TabIndex = 1;
        // 
        // pnlEditorColumn
        // 
        pnlEditorColumn.Controls.Add(editorAreaSplit);
        pnlEditorColumn.Controls.Add(toolStripMarkdown);
        pnlEditorColumn.Dock = DockStyle.Fill;
        pnlEditorColumn.Location = new Point(0, 0);
        pnlEditorColumn.Margin = new Padding(0);
        pnlEditorColumn.Name = "pnlEditorColumn";
        pnlEditorColumn.Size = new Size(1148, 715);
        pnlEditorColumn.TabIndex = 0;
        // 
        // editorAreaSplit
        // 
        editorAreaSplit.Dock = DockStyle.Fill;
        editorAreaSplit.Location = new Point(0, 25);
        editorAreaSplit.Name = "editorAreaSplit";
        // 
        // editorAreaSplit.Panel1
        // 
        editorAreaSplit.Panel1.Controls.Add(pnlOutlineSidebar);
        editorAreaSplit.Panel1MinSize = 72;
        // 
        // editorAreaSplit.Panel2
        // 
        editorAreaSplit.Panel2.Controls.Add(pnlEditorHost);
        editorAreaSplit.Size = new Size(1148, 690);
        editorAreaSplit.SplitterDistance = 329;
        editorAreaSplit.TabIndex = 0;
        // 
        // pnlOutlineSidebar
        // 
        pnlOutlineSidebar.Controls.Add(treeOutline);
        pnlOutlineSidebar.Controls.Add(pnlOutlineHeader);
        pnlOutlineSidebar.Dock = DockStyle.Fill;
        pnlOutlineSidebar.Location = new Point(0, 0);
        pnlOutlineSidebar.Name = "pnlOutlineSidebar";
        pnlOutlineSidebar.Size = new Size(329, 690);
        pnlOutlineSidebar.TabIndex = 0;
        // 
        // treeOutline
        // 
        treeOutline.Dock = DockStyle.Fill;
        treeOutline.Font = new Font("Segoe UI", 8.25F);
        treeOutline.HideSelection = false;
        treeOutline.Location = new Point(0, 36);
        treeOutline.Name = "treeOutline";
        treeOutline.Size = new Size(329, 654);
        treeOutline.TabIndex = 0;
        treeOutline.AfterSelect += treeOutline_AfterSelect;
        // 
        // pnlOutlineHeader
        // 
        pnlOutlineHeader.Controls.Add(lblOutline);
        pnlOutlineHeader.Controls.Add(btnToggleOutline);
        pnlOutlineHeader.Dock = DockStyle.Top;
        pnlOutlineHeader.Location = new Point(0, 0);
        pnlOutlineHeader.Name = "pnlOutlineHeader";
        pnlOutlineHeader.Padding = new Padding(4);
        pnlOutlineHeader.Size = new Size(329, 36);
        pnlOutlineHeader.TabIndex = 1;
        // 
        // lblOutline
        // 
        lblOutline.Dock = DockStyle.Fill;
        lblOutline.Font = new Font("Segoe UI", 8.25F);
        lblOutline.Location = new Point(4, 4);
        lblOutline.Name = "lblOutline";
        lblOutline.Size = new Size(237, 28);
        lblOutline.TabIndex = 0;
        lblOutline.Text = "문서 구조";
        lblOutline.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // btnToggleOutline
        // 
        btnToggleOutline.Dock = DockStyle.Right;
        btnToggleOutline.Location = new Point(241, 4);
        btnToggleOutline.Margin = new Padding(0);
        btnToggleOutline.MinimumSize = new Size(84, 24);
        btnToggleOutline.Name = "btnToggleOutline";
        btnToggleOutline.Size = new Size(84, 28);
        btnToggleOutline.TabIndex = 1;
        btnToggleOutline.Text = "◀ 접기";
        btnToggleOutline.UseVisualStyleBackColor = true;
        btnToggleOutline.Click += btnToggleOutline_Click;
        // 
        // pnlEditorHost
        // 
        pnlEditorHost.Controls.Add(pnlEditorHeader);
        pnlEditorHost.Controls.Add(tabPageEditors);
        pnlEditorHost.Dock = DockStyle.Fill;
        pnlEditorHost.Location = new Point(0, 0);
        pnlEditorHost.Margin = new Padding(0);
        pnlEditorHost.Name = "pnlEditorHost";
        pnlEditorHost.Size = new Size(815, 690);
        pnlEditorHost.TabIndex = 0;
        // 
        // pnlEditorHeader
        // 
        pnlEditorHeader.Controls.Add(lblEditor);
        pnlEditorHeader.Location = new Point(0, 0);
        pnlEditorHeader.Name = "pnlEditorHeader";
        pnlEditorHeader.Padding = new Padding(4);
        pnlEditorHeader.Size = new Size(815, 36);
        pnlEditorHeader.TabIndex = 1;
        // 
        // lblEditor
        // 
        lblEditor.Dock = DockStyle.Fill;
        lblEditor.Font = new Font("Segoe UI", 8.25F);
        lblEditor.Location = new Point(4, 4);
        lblEditor.Name = "lblEditor";
        lblEditor.Size = new Size(807, 28);
        lblEditor.TabIndex = 0;
        lblEditor.Text = "Markdown 편집";
        lblEditor.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // tabPageEditors
        // 
        tabPageEditors.DrawMode = TabDrawMode.OwnerDrawFixed;
        tabPageEditors.ItemSize = new Size(0, 28);
        tabPageEditors.Location = new Point(0, 36);
        tabPageEditors.Name = "tabPageEditors";
        tabPageEditors.Padding = new Point(8, 4);
        tabPageEditors.SelectedIndex = 0;
        tabPageEditors.Size = new Size(812, 654);
        tabPageEditors.TabIndex = 0;
        tabPageEditors.SelectedIndexChanged += tabPageEditors_SelectedIndexChanged;
        // 
        // outerSplit
        // 
        outerSplit.Dock = DockStyle.Fill;
        outerSplit.Location = new Point(0, 24);
        outerSplit.Name = "outerSplit";
        // 
        // outerSplit.Panel1
        // 
        outerSplit.Panel1.Controls.Add(pnlWorkspaceSidebar);
        outerSplit.Panel1MinSize = 140;
        // 
        // outerSplit.Panel2
        // 
        outerSplit.Panel2.Controls.Add(pnlEditorColumn);
        outerSplit.Size = new Size(1384, 715);
        outerSplit.SplitterDistance = 232;
        outerSplit.TabIndex = 0;
        // 
        // pnlWorkspaceSidebar
        // 
        pnlWorkspaceSidebar.Controls.Add(treeWorkspace);
        pnlWorkspaceSidebar.Controls.Add(pnlWorkspaceHeader);
        pnlWorkspaceSidebar.Dock = DockStyle.Fill;
        pnlWorkspaceSidebar.Location = new Point(0, 0);
        pnlWorkspaceSidebar.Name = "pnlWorkspaceSidebar";
        pnlWorkspaceSidebar.Size = new Size(232, 715);
        pnlWorkspaceSidebar.TabIndex = 0;
        // 
        // treeWorkspace
        // 
        treeWorkspace.ContextMenuStrip = ctxTree;
        treeWorkspace.Dock = DockStyle.Fill;
        treeWorkspace.HideSelection = false;
        treeWorkspace.Location = new Point(0, 36);
        treeWorkspace.Name = "treeWorkspace";
        treeWorkspace.Size = new Size(232, 679);
        treeWorkspace.TabIndex = 0;
        treeWorkspace.AfterSelect += treeWorkspace_AfterSelect;
        treeWorkspace.NodeMouseDoubleClick += treeWorkspace_NodeMouseDoubleClick;
        // 
        // pnlWorkspaceHeader
        // 
        pnlWorkspaceHeader.Controls.Add(lblWorkspace);
        pnlWorkspaceHeader.Dock = DockStyle.Top;
        pnlWorkspaceHeader.Location = new Point(0, 0);
        pnlWorkspaceHeader.Name = "pnlWorkspaceHeader";
        pnlWorkspaceHeader.Padding = new Padding(4);
        pnlWorkspaceHeader.Size = new Size(232, 36);
        pnlWorkspaceHeader.TabIndex = 1;
        // 
        // lblWorkspace
        // 
        lblWorkspace.Dock = DockStyle.Fill;
        lblWorkspace.Font = new Font("Segoe UI", 8.25F);
        lblWorkspace.Location = new Point(4, 4);
        lblWorkspace.Name = "lblWorkspace";
        lblWorkspace.Size = new Size(224, 28);
        lblWorkspace.TabIndex = 0;
        lblWorkspace.Text = "Workspace";
        lblWorkspace.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // statusStrip1
        // 
        statusStrip1.Items.AddRange(new ToolStripItem[] { lblStatus, lblSaveStatus });
        statusStrip1.Location = new Point(0, 739);
        statusStrip1.Name = "statusStrip1";
        statusStrip1.Size = new Size(1384, 22);
        statusStrip1.TabIndex = 1;
        // 
        // lblStatus
        // 
        lblStatus.Name = "lblStatus";
        lblStatus.Size = new Size(1249, 17);
        lblStatus.Spring = true;
        lblStatus.Text = "Ready";
        lblStatus.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // lblSaveStatus
        // 
        lblSaveStatus.AutoSize = false;
        lblSaveStatus.Name = "lblSaveStatus";
        lblSaveStatus.Size = new Size(120, 17);
        lblSaveStatus.TextAlign = ContentAlignment.MiddleRight;
        // 
        // saveTimer
        // 
        saveTimer.Interval = 2000;
        // 
        // MainForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1384, 761);
        Controls.Add(outerSplit);
        Controls.Add(statusStrip1);
        Controls.Add(menuStrip1);
        Icon = (Icon)resources.GetObject("$this.Icon");
        MainMenuStrip = menuStrip1;
        Name = "MainForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "MyWorkspace";
        FormClosing += MainForm_FormClosing;
        Load += MainForm_Load;
        menuStrip1.ResumeLayout(false);
        menuStrip1.PerformLayout();
        ctxTree.ResumeLayout(false);
        pnlEditorColumn.ResumeLayout(false);
        pnlEditorColumn.PerformLayout();
        editorAreaSplit.Panel1.ResumeLayout(false);
        editorAreaSplit.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)editorAreaSplit).EndInit();
        editorAreaSplit.ResumeLayout(false);
        pnlOutlineSidebar.ResumeLayout(false);
        pnlOutlineHeader.ResumeLayout(false);
        pnlEditorHost.ResumeLayout(false);
        pnlEditorHeader.ResumeLayout(false);
        outerSplit.Panel1.ResumeLayout(false);
        outerSplit.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)outerSplit).EndInit();
        outerSplit.ResumeLayout(false);
        pnlWorkspaceSidebar.ResumeLayout(false);
        pnlWorkspaceHeader.ResumeLayout(false);
        statusStrip1.ResumeLayout(false);
        statusStrip1.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }

    private MenuStrip menuStrip1;
    private ToolStripMenuItem menuFile;
    private ToolStripMenuItem menuSavePage;
    private ToolStripMenuItem menuPageHistory;
    private ToolStripMenuItem menuRefreshTree;
    private ToolStripSeparator menuSepFile1;
    private ToolStripMenuItem menuPreferences;
    private ToolStripSeparator menuSepFilePref;
    private ToolStripMenuItem menuLogin;
    private ToolStripMenuItem menuLogout;
    private ToolStripSeparator menuSepFileAbout;
    private ToolStripMenuItem menuAbout;
    private ToolStripMenuItem menuExit;
    private ToolStripMenuItem menuView;
    private ToolStripMenuItem menuDocumentStructure;
    private ToolStripMenuItem menuWorkspace;
    private ToolStripMenuItem menuNewRootWorkspace;
    private ToolStripMenuItem menuNewSubWorkspace;
    private ToolStripMenuItem menuNewPage;
    private ToolStripSeparator menuSepWs1;
    private ToolStripMenuItem menuRename;
    private ToolStripMenuItem menuDelete;
    private ToolStripSeparator menuSepWs2;
    private ToolStripMenuItem menuWorkspaceMembers;
    private ToolStripMenuItem menuAdmin;
    private ToolStripMenuItem menuAdminUserManagement;
    private ToolStripMenuItem menuAdminDatabaseSettings;
    private ToolStripMenuItem menuAdminEmailSettings;
    private ToolStripMenuItem menuAccount;
    private ToolStripMenuItem menuEditProfile;
    private ToolStripMenuItem menuChangePassword;
    private ToolStripSeparator menuSepAccount1;
    private ToolStripMenuItem menuNotificationSettings;
    private ContextMenuStrip ctxTree;
    private ToolStripMenuItem ctxNewSubWorkspace;
    private ToolStripMenuItem ctxNewPage;
    private ToolStripSeparator ctxSep1;
    private ToolStripMenuItem ctxRename;
    private ToolStripMenuItem ctxDelete;
    private ToolStripSeparator ctxSep2;
    private ToolStripMenuItem ctxToggleFavorite;
    private ToolStripSeparator ctxSep3;
    private ToolStripMenuItem ctxMembers;
    private ToolStrip toolStripMarkdown;
    private Panel pnlEditorColumn;
    private SplitContainer editorAreaSplit;
    private Panel pnlOutlineSidebar;
    private Panel pnlOutlineHeader;
    private Label lblOutline;
    private Button btnToggleOutline;
    private ThemedTreeView treeOutline;
    private SplitContainer outerSplit;
    private Panel pnlWorkspaceSidebar;
    private Panel pnlWorkspaceHeader;
    private Label lblWorkspace;
    private ThemedTreeView treeWorkspace;
    private Panel pnlEditorHost;
    private Panel pnlEditorHeader;
    private Label lblEditor;
    private CloseableTabControl tabPageEditors;
    private StatusStrip statusStrip1;
    private ToolStripStatusLabel lblStatus;
    private ToolStripStatusLabel lblSaveStatus;
    private System.Windows.Forms.Timer saveTimer;
}
