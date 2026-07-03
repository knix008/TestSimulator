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
        titleBar = new CustomTitleBar();
        pnlRoot = new FramelessRootPanel();
        pnlShellBody = new Panel();
        menuStrip1 = new MenuStrip();
        menuFile = new ToolStripMenuItem();
        menuSavePage = new ToolStripMenuItem();
        menuPageHistory = new ToolStripMenuItem();
        menuRefreshTree = new ToolStripMenuItem();
        menuSepFile1 = new ToolStripSeparator();
        menuPreferences = new ToolStripMenuItem();
        ctxAppSettings = new ContextMenuStrip(components);
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
        menuEditProfile = new ToolStripMenuItem();
        menuChangePassword = new ToolStripMenuItem();
        menuSepAccount1 = new ToolStripSeparator();
        menuNotificationSettings = new ToolStripMenuItem();
        menuSepAccount2 = new ToolStripSeparator();
        ctxTree = new ContextMenuStrip(components);
        ctxNewRootWorkspace = new ToolStripMenuItem();
        ctxNewSubWorkspace = new ToolStripMenuItem();
        ctxNewPage = new ToolStripMenuItem();
        ctxSep1 = new ToolStripSeparator();
        ctxRename = new ToolStripMenuItem();
        ctxDelete = new ToolStripMenuItem();
        ctxSep2 = new ToolStripSeparator();
        ctxToggleFavorite = new ToolStripMenuItem();
        ctxSep3 = new ToolStripSeparator();
        ctxToggleWorkspaceLock = new ToolStripMenuItem();
        ctxSep4 = new ToolStripSeparator();
        ctxTogglePageLock = new ToolStripMenuItem();
        ctxSep5 = new ToolStripSeparator();
        ctxMembers = new ToolStripMenuItem();
        toolStripMarkdown = new ToolStrip();
        pnlMainContent = new Panel();
        outerSplit = new SplitContainer();
        pnlWorkspaceSidebar = new Panel();
        treeWorkspace = new ThemedTreeView();
        pnlEditorColumn = new Panel();
        editorAreaSplit = new SplitContainer();
        pnlOutlineSidebar = new Panel();
        treeOutline = new ThemedTreeView();
        pnlEditorHost = new Panel();
        webViewEditor = new WebView2();
        pnlEditorEmptySurface = new Panel();
        navRail = new VerticalNavRail();
        statusStrip1 = new StatusStrip();
        lblStatus = new ToolStripStatusLabel();
        lblSaveStatus = new ToolStripStatusLabel();
        saveTimer = new System.Windows.Forms.Timer(components);
        menuStrip1.SuspendLayout();
        ctxTree.SuspendLayout();
        pnlRoot.SuspendLayout();
        pnlShellBody.SuspendLayout();
        pnlMainContent.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)outerSplit).BeginInit();
        outerSplit.Panel1.SuspendLayout();
        outerSplit.Panel2.SuspendLayout();
        outerSplit.SuspendLayout();
        pnlWorkspaceSidebar.SuspendLayout();
        pnlEditorColumn.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)editorAreaSplit).BeginInit();
        editorAreaSplit.Panel1.SuspendLayout();
        editorAreaSplit.Panel2.SuspendLayout();
        editorAreaSplit.SuspendLayout();
        pnlOutlineSidebar.SuspendLayout();
        pnlEditorHost.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)webViewEditor).BeginInit();
        statusStrip1.SuspendLayout();
        SuspendLayout();
        // 
        // menuStrip1
        // 
        menuStrip1.Dock = DockStyle.None;
        menuStrip1.Items.AddRange(new ToolStripItem[] { menuFile, menuWorkspace, menuView, menuAdmin });
        menuStrip1.Location = new Point(0, 0);
        menuStrip1.Name = "menuStrip1";
        menuStrip1.Size = new Size(338, 24);
        menuStrip1.TabIndex = 2;
        menuStrip1.Visible = false;
        // 
        // menuFile
        // 
        menuFile.DropDownItems.AddRange(new ToolStripItem[] { menuSavePage, menuPageHistory, menuRefreshTree, menuSepFile1, menuLogin, menuSepFileAbout, menuAbout, menuExit });
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
        // ctxAppSettings
        // 
        ctxAppSettings.Name = "ctxAppSettings";
        ctxAppSettings.Size = new Size(61, 4);
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
        menuAdmin.DropDownItems.AddRange(new ToolStripItem[] { menuAdminUserManagement });
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
        // menuSepAccount2
        // 
        menuSepAccount2.Name = "menuSepAccount2";
        menuSepAccount2.Size = new Size(147, 6);
        // 
        // ctxTree
        // 
        ctxTree.Items.AddRange(new ToolStripItem[] { ctxNewRootWorkspace, ctxNewSubWorkspace, ctxNewPage, ctxSep1, ctxRename, ctxDelete, ctxSep2, ctxToggleFavorite, ctxSep3, ctxToggleWorkspaceLock, ctxSep4, ctxTogglePageLock, ctxSep5, ctxMembers });
        ctxTree.Name = "ctxTree";
        ctxTree.Size = new Size(189, 176);
        ctxTree.Closed += ctxTree_Closed;
        ctxTree.Opening += ctxTree_Opening;
        // 
        // ctxNewRootWorkspace
        // 
        ctxNewRootWorkspace.Name = "ctxNewRootWorkspace";
        ctxNewRootWorkspace.Size = new Size(188, 22);
        ctxNewRootWorkspace.Text = "새 Workspace";
        ctxNewRootWorkspace.Click += ctxNewRootWorkspace_Click;
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
        // ctxToggleWorkspaceLock
        // 
        ctxToggleWorkspaceLock.Name = "ctxToggleWorkspaceLock";
        ctxToggleWorkspaceLock.Size = new Size(188, 22);
        ctxToggleWorkspaceLock.Text = "Workspace 잠금";
        ctxToggleWorkspaceLock.Click += ctxToggleWorkspaceLock_Click;
        // 
        // ctxSep4
        // 
        ctxSep4.Name = "ctxSep4";
        ctxSep4.Size = new Size(185, 6);
        // 
        // ctxTogglePageLock
        // 
        ctxTogglePageLock.Name = "ctxTogglePageLock";
        ctxTogglePageLock.Size = new Size(188, 22);
        ctxTogglePageLock.Text = "Page 잠금";
        ctxTogglePageLock.Click += ctxTogglePageLock_Click;
        // 
        // ctxSep5
        // 
        ctxSep5.Name = "ctxSep5";
        ctxSep5.Size = new Size(185, 6);
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
        toolStripMarkdown.AutoSize = false;
        toolStripMarkdown.Dock = DockStyle.Right;
        toolStripMarkdown.ImageScalingSize = new Size(20, 20);
        toolStripMarkdown.LayoutStyle = ToolStripLayoutStyle.VerticalStackWithOverflow;
        toolStripMarkdown.Location = new Point(1044, 0);
        toolStripMarkdown.Name = "toolStripMarkdown";
        toolStripMarkdown.Padding = new Padding(4, 8, 4, 8);
        toolStripMarkdown.Size = new Size(52, 899);
        toolStripMarkdown.TabIndex = 1;
        // 
        // pnlRoot
        // 
        pnlRoot.Controls.Add(pnlShellBody);
        pnlRoot.Controls.Add(titleBar);
        pnlRoot.Controls.Add(statusStrip1);
        pnlRoot.Dock = DockStyle.Fill;
        pnlRoot.Name = "pnlRoot";
        pnlRoot.Size = new Size(1384, 921);
        pnlRoot.TabIndex = 6;
        // 
        // titleBar
        // 
        titleBar.Dock = DockStyle.Top;
        titleBar.Name = "titleBar";
        titleBar.TabIndex = 4;
        // 
        // pnlMainContent
        // 
        pnlMainContent.Controls.Add(outerSplit);
        pnlMainContent.Dock = DockStyle.Fill;
        pnlMainContent.Location = new Point(52, 0);
        pnlMainContent.Name = "pnlMainContent";
        pnlMainContent.Padding = new Padding(0, 0, 0, 0);
        pnlMainContent.Size = new Size(1332, 899);
        pnlMainContent.TabIndex = 0;
        // 
        // outerSplit
        // 
        outerSplit.Dock = DockStyle.Fill;
        outerSplit.Location = new Point(0, 0);
        outerSplit.Name = "outerSplit";
        // 
        // outerSplit.Panel1
        // 
        outerSplit.Panel1.Controls.Add(pnlWorkspaceSidebar);
        outerSplit.Panel1MinSize = 160;
        // 
        // outerSplit.Panel2
        // 
        outerSplit.Panel2.Controls.Add(pnlEditorColumn);
        outerSplit.Size = new Size(1332, 899);
        outerSplit.SplitterDistance = 232;
        outerSplit.TabIndex = 0;
        // 
        // pnlWorkspaceSidebar
        // 
        pnlWorkspaceSidebar.Controls.Add(treeWorkspace);
        pnlWorkspaceSidebar.Dock = DockStyle.Fill;
        pnlWorkspaceSidebar.Location = new Point(0, 0);
        pnlWorkspaceSidebar.Name = "pnlWorkspaceSidebar";
        pnlWorkspaceSidebar.Padding = new Padding(8, 9, 0, 1);
        pnlWorkspaceSidebar.Size = new Size(232, 899);
        pnlWorkspaceSidebar.TabIndex = 0;
        // 
        // treeWorkspace
        // 
        treeWorkspace.Dock = DockStyle.Fill;
        treeWorkspace.HideSelection = false;
        treeWorkspace.Location = new Point(0, 0);
        treeWorkspace.Name = "treeWorkspace";
        treeWorkspace.Size = new Size(232, 899);
        treeWorkspace.SuppressHorizontalScrollbar = true;
        treeWorkspace.TabIndex = 0;
        treeWorkspace.AfterSelect += treeWorkspace_AfterSelect;
        treeWorkspace.NodeMouseDoubleClick += treeWorkspace_NodeMouseDoubleClick;
        // 
        // pnlEditorColumn
        // 
        pnlEditorColumn.Controls.Add(editorAreaSplit);
        pnlEditorColumn.Controls.Add(toolStripMarkdown);
        pnlEditorColumn.Dock = DockStyle.Fill;
        pnlEditorColumn.Location = new Point(0, 0);
        pnlEditorColumn.Margin = new Padding(0);
        pnlEditorColumn.Name = "pnlEditorColumn";
        pnlEditorColumn.Size = new Size(1096, 899);
        pnlEditorColumn.TabIndex = 0;
        // 
        // editorAreaSplit
        // 
        editorAreaSplit.Dock = DockStyle.Fill;
        editorAreaSplit.Location = new Point(0, 0);
        editorAreaSplit.Name = "editorAreaSplit";
        // 
        // editorAreaSplit.Panel1
        // 
        editorAreaSplit.Panel1.Controls.Add(pnlOutlineSidebar);
        editorAreaSplit.Panel1Collapsed = true;
        editorAreaSplit.Panel1MinSize = 180;
        // 
        // editorAreaSplit.Panel2
        // 
        editorAreaSplit.Panel2.Controls.Add(pnlEditorHost);
        editorAreaSplit.Size = new Size(1044, 899);
        editorAreaSplit.SplitterDistance = 219;
        editorAreaSplit.TabIndex = 0;
        // 
        // pnlOutlineSidebar
        // 
        pnlOutlineSidebar.Controls.Add(treeOutline);
        pnlOutlineSidebar.Dock = DockStyle.Fill;
        pnlOutlineSidebar.Location = new Point(0, 0);
        pnlOutlineSidebar.Name = "pnlOutlineSidebar";
        pnlOutlineSidebar.Size = new Size(219, 100);
        pnlOutlineSidebar.TabIndex = 0;
        // 
        // treeOutline
        // 
        treeOutline.Dock = DockStyle.Fill;
        treeOutline.Font = new Font("Segoe UI", 8.25F);
        treeOutline.HideSelection = false;
        treeOutline.Location = new Point(0, 0);
        treeOutline.Name = "treeOutline";
        treeOutline.Size = new Size(219, 100);
        treeOutline.SuppressHorizontalScrollbar = true;
        treeOutline.TabIndex = 0;
        treeOutline.AfterSelect += treeOutline_AfterSelect;
        // 
        // pnlEditorHost
        // 
        pnlEditorHost.Controls.Add(webViewEditor);
        pnlEditorHost.Controls.Add(pnlEditorEmptySurface);
        pnlEditorHost.Dock = DockStyle.Fill;
        pnlEditorHost.Location = new Point(0, 0);
        pnlEditorHost.Margin = new Padding(0);
        pnlEditorHost.Name = "pnlEditorHost";
        pnlEditorHost.Size = new Size(1044, 899);
        pnlEditorHost.TabIndex = 0;
        // 
        // webViewEditor
        // 
        webViewEditor.AllowExternalDrop = true;
        webViewEditor.CreationProperties = null;
        webViewEditor.DefaultBackgroundColor = Color.White;
        webViewEditor.Dock = DockStyle.Fill;
        webViewEditor.Location = new Point(0, 0);
        webViewEditor.Name = "webViewEditor";
        webViewEditor.Size = new Size(1044, 899);
        webViewEditor.TabIndex = 0;
        webViewEditor.ZoomFactor = 1D;
        // 
        // pnlEditorEmptySurface
        // 
        pnlEditorEmptySurface.Dock = DockStyle.Fill;
        pnlEditorEmptySurface.Location = new Point(0, 0);
        pnlEditorEmptySurface.Name = "pnlEditorEmptySurface";
        pnlEditorEmptySurface.Size = new Size(1044, 863);
        pnlEditorEmptySurface.TabIndex = 2;
        pnlEditorEmptySurface.Visible = false;
        // 
        // navRail
        // 
        navRail.Dock = DockStyle.Left;
        navRail.Location = new Point(0, 0);
        navRail.MinimumSize = new Size(56, 0);
        navRail.Name = "navRail";
        navRail.Padding = new Padding(4, 8, 4, 8);
        navRail.Size = new Size(56, 863);
        navRail.TabIndex = 1;
        // 
        // pnlShellBody
        // 
        pnlShellBody.Controls.Add(pnlMainContent);
        pnlShellBody.Controls.Add(navRail);
        pnlShellBody.Dock = DockStyle.Fill;
        pnlShellBody.Location = new Point(0, 36);
        pnlShellBody.Name = "pnlShellBody";
        pnlShellBody.Size = new Size(1384, 863);
        pnlShellBody.TabIndex = 5;
        // 
        // statusStrip1
        // 
        statusStrip1.Dock = DockStyle.Bottom;
        statusStrip1.Items.AddRange(new ToolStripItem[] { lblStatus, lblSaveStatus });
        statusStrip1.Location = new Point(0, 899);
        statusStrip1.Name = "statusStrip1";
        statusStrip1.Size = new Size(1384, 22);
        statusStrip1.TabIndex = 2;
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
        ClientSize = new Size(1384, 921);
        Controls.Add(pnlRoot);
        Controls.Add(menuStrip1);
        FormBorderStyle = FormBorderStyle.None;
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
        pnlRoot.ResumeLayout(false);
        pnlRoot.PerformLayout();
        pnlShellBody.ResumeLayout(false);
        pnlMainContent.ResumeLayout(false);
        outerSplit.Panel1.ResumeLayout(false);
        outerSplit.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)outerSplit).EndInit();
        outerSplit.ResumeLayout(false);
        pnlWorkspaceSidebar.ResumeLayout(false);
        pnlEditorColumn.ResumeLayout(false);
        editorAreaSplit.Panel1.ResumeLayout(false);
        editorAreaSplit.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)editorAreaSplit).EndInit();
        editorAreaSplit.ResumeLayout(false);
        pnlOutlineSidebar.ResumeLayout(false);
        pnlEditorHost.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)webViewEditor).EndInit();
        statusStrip1.ResumeLayout(false);
        statusStrip1.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }

    private CustomTitleBar titleBar;
    private FramelessRootPanel pnlRoot;
    private Panel pnlShellBody;
    private MenuStrip menuStrip1;
    private Panel pnlMainContent;
    private VerticalNavRail navRail;
    private ToolStripMenuItem menuFile;
    private ToolStripMenuItem menuSavePage;
    private ToolStripMenuItem menuPageHistory;
    private ToolStripMenuItem menuRefreshTree;
    private ToolStripSeparator menuSepFile1;
    private ToolStripMenuItem menuPreferences;
    private ContextMenuStrip ctxAppSettings;
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
    private ToolStripMenuItem menuEditProfile;
    private ToolStripMenuItem menuChangePassword;
    private ToolStripSeparator menuSepAccount1;
    private ToolStripSeparator menuSepAccount2;
    private ToolStripMenuItem menuNotificationSettings;
    private ContextMenuStrip ctxTree;
    private ToolStripMenuItem ctxNewRootWorkspace;
    private ToolStripMenuItem ctxNewSubWorkspace;
    private ToolStripMenuItem ctxNewPage;
    private ToolStripSeparator ctxSep1;
    private ToolStripMenuItem ctxRename;
    private ToolStripMenuItem ctxDelete;
    private ToolStripSeparator ctxSep2;
    private ToolStripMenuItem ctxToggleFavorite;
    private ToolStripSeparator ctxSep3;
    private ToolStripMenuItem ctxToggleWorkspaceLock;
    private ToolStripSeparator ctxSep4;
    private ToolStripMenuItem ctxTogglePageLock;
    private ToolStripSeparator ctxSep5;
    private ToolStripMenuItem ctxMembers;
    private ToolStrip toolStripMarkdown;
    private Panel pnlEditorColumn;
    private SplitContainer editorAreaSplit;
    private Panel pnlOutlineSidebar;
    private ThemedTreeView treeOutline;
    private SplitContainer outerSplit;
    private Panel pnlWorkspaceSidebar;
    private ThemedTreeView treeWorkspace;
    private Panel pnlEditorHost;
    private WebView2 webViewEditor;
    private Panel pnlEditorEmptySurface;
    private StatusStrip statusStrip1;
    private ToolStripStatusLabel lblStatus;
    private ToolStripStatusLabel lblSaveStatus;
    private System.Windows.Forms.Timer saveTimer;
}
