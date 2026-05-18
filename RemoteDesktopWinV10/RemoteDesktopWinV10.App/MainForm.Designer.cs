namespace RemoteDesktopWinV10.App;

#nullable disable
public partial class MainForm
{
    private System.ComponentModel.IContainer components = null!;

    private MenuStrip mainMenuStrip;
    private Panel connectBarPanel;
    private ToolStrip connectInputToolStrip;
    private ToolStripLabel toolStripLabelProfile;
    private ToolStripComboBox profilesCombo;
    private ToolStripLabel toolStripLabelHistory;
    private ToolStripComboBox historyCombo;
    private ToolStripLabel toolStripLabelHost;
    private ToolStripTextBox hostText;
    private ToolStripLabel toolStripLabelPort;
    private ToolStripTextBox portText;
    private ToolStripLabel toolStripLabelPassword;
    private ToolStripTextBox passwordText;
    private Panel connectActionsPanel;
    private Button connectButton;
    private Button recordButton;
    private Button advancedSettingsButton;

    private ToolStripMenuItem fileToolStripMenuItem;
    private ToolStripMenuItem connectToolStripMenuItem;
    private ToolStripMenuItem advancedSettingsToolStripMenuItem;
    private ToolStripSeparator toolStripSeparatorFileConnect;
    private ToolStripMenuItem openDataFolderToolStripMenuItem;
    private ToolStripSeparator toolStripSeparatorFile;
    private ToolStripMenuItem exitToolStripMenuItem;
    private ToolStripMenuItem profileToolStripMenuItem;
    private ToolStripMenuItem manageProfilesToolStripMenuItem;
    private ToolStripMenuItem viewToolStripMenuItem;
    private ToolStripMenuItem fullScreenToolStripMenuItem;
    private ToolStripMenuItem settingsToolStripMenuItem;
    private ToolStripMenuItem appMenuVisibilityToolStripMenuItem;

    private Panel remotePanel;
    private Panel vncHostPanel;

    private StatusStrip statusStrip;
    private ToolStripStatusLabel toolStripStatusState;
    private ToolStripStatusLabel toolStripStatusConnection;
    private ToolStripStatusLabel toolStripStatusViewport;
    private ToolStripStatusLabel toolStripStatusOptions;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
        {
            components.Dispose();
        }
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(MainForm));
        mainMenuStrip = new MenuStrip();
        fileToolStripMenuItem = new ToolStripMenuItem();
        connectToolStripMenuItem = new ToolStripMenuItem();
        advancedSettingsToolStripMenuItem = new ToolStripMenuItem();
        toolStripSeparatorFileConnect = new ToolStripSeparator();
        openDataFolderToolStripMenuItem = new ToolStripMenuItem();
        toolStripSeparatorFile = new ToolStripSeparator();
        exitToolStripMenuItem = new ToolStripMenuItem();
        profileToolStripMenuItem = new ToolStripMenuItem();
        manageProfilesToolStripMenuItem = new ToolStripMenuItem();
        viewToolStripMenuItem = new ToolStripMenuItem();
        fullScreenToolStripMenuItem = new ToolStripMenuItem();
        settingsToolStripMenuItem = new ToolStripMenuItem();
        appMenuVisibilityToolStripMenuItem = new ToolStripMenuItem();
        connectBarPanel = new Panel();
        connectInputToolStrip = new ToolStrip();
        toolStripLabelProfile = new ToolStripLabel();
        profilesCombo = new ToolStripComboBox();
        toolStripLabelHistory = new ToolStripLabel();
        historyCombo = new ToolStripComboBox();
        toolStripLabelHost = new ToolStripLabel();
        hostText = new ToolStripTextBox();
        toolStripLabelPort = new ToolStripLabel();
        portText = new ToolStripTextBox();
        toolStripLabelPassword = new ToolStripLabel();
        passwordText = new ToolStripTextBox();
        connectActionsPanel = new Panel();
        connectButton = new Button();
        recordButton = new Button();
        advancedSettingsButton = new Button();
        remotePanel = new Panel();
        vncHostPanel = new Panel();
        statusStrip = new StatusStrip();
        toolStripStatusState = new ToolStripStatusLabel();
        toolStripStatusConnection = new ToolStripStatusLabel();
        toolStripStatusViewport = new ToolStripStatusLabel();
        toolStripStatusOptions = new ToolStripStatusLabel();
        mainMenuStrip.SuspendLayout();
        connectBarPanel.SuspendLayout();
        connectInputToolStrip.SuspendLayout();
        connectActionsPanel.SuspendLayout();
        remotePanel.SuspendLayout();
        statusStrip.SuspendLayout();
        SuspendLayout();

        mainMenuStrip.Items.AddRange(new ToolStripItem[] { fileToolStripMenuItem, profileToolStripMenuItem, viewToolStripMenuItem, settingsToolStripMenuItem });
        mainMenuStrip.Location = new Point(0, 0);
        mainMenuStrip.Name = "mainMenuStrip";
        mainMenuStrip.Size = new Size(1200, 24);
        mainMenuStrip.TabIndex = 0;

        fileToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[] { connectToolStripMenuItem, advancedSettingsToolStripMenuItem, toolStripSeparatorFileConnect, openDataFolderToolStripMenuItem, toolStripSeparatorFile, exitToolStripMenuItem });
        fileToolStripMenuItem.Name = "fileToolStripMenuItem";
        fileToolStripMenuItem.Size = new Size(57, 20);
        fileToolStripMenuItem.Text = "파일(&F)";

        connectToolStripMenuItem.Name = "connectToolStripMenuItem";
        connectToolStripMenuItem.ShortcutKeys = Keys.Control | Keys.N;
        connectToolStripMenuItem.Size = new Size(200, 22);
        connectToolStripMenuItem.Text = "연결(&N)";

        advancedSettingsToolStripMenuItem.Name = "advancedSettingsToolStripMenuItem";
        advancedSettingsToolStripMenuItem.Size = new Size(200, 22);
        advancedSettingsToolStripMenuItem.Text = "고급 설정(&A)...";

        toolStripSeparatorFileConnect.Name = "toolStripSeparatorFileConnect";
        toolStripSeparatorFileConnect.Size = new Size(197, 6);

        openDataFolderToolStripMenuItem.Name = "openDataFolderToolStripMenuItem";
        openDataFolderToolStripMenuItem.Size = new Size(200, 22);
        openDataFolderToolStripMenuItem.Text = "데이터 폴더 열기(&D)";
        openDataFolderToolStripMenuItem.Visible = false;

        toolStripSeparatorFile.Name = "toolStripSeparatorFile";
        toolStripSeparatorFile.Size = new Size(197, 6);

        exitToolStripMenuItem.Name = "exitToolStripMenuItem";
        exitToolStripMenuItem.Size = new Size(200, 22);
        exitToolStripMenuItem.Text = "종료(&X)";

        profileToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[] { manageProfilesToolStripMenuItem });
        profileToolStripMenuItem.Name = "profileToolStripMenuItem";
        profileToolStripMenuItem.Size = new Size(70, 20);
        profileToolStripMenuItem.Text = "프로필(&P)";

        manageProfilesToolStripMenuItem.Name = "manageProfilesToolStripMenuItem";
        manageProfilesToolStripMenuItem.Size = new Size(166, 22);
        manageProfilesToolStripMenuItem.Text = "프로필 관리(&M)...";

        viewToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[] { fullScreenToolStripMenuItem });
        viewToolStripMenuItem.Name = "viewToolStripMenuItem";
        viewToolStripMenuItem.Size = new Size(59, 20);
        viewToolStripMenuItem.Text = "보기(&V)";

        fullScreenToolStripMenuItem.Name = "fullScreenToolStripMenuItem";
        fullScreenToolStripMenuItem.ShortcutKeys = Keys.F11;
        fullScreenToolStripMenuItem.Size = new Size(167, 22);
        fullScreenToolStripMenuItem.Text = "전체 화면(&F)";

        settingsToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[] { appMenuVisibilityToolStripMenuItem });
        settingsToolStripMenuItem.Name = "settingsToolStripMenuItem";
        settingsToolStripMenuItem.Size = new Size(58, 20);
        settingsToolStripMenuItem.Text = "설정(&S)";

        appMenuVisibilityToolStripMenuItem.Name = "appMenuVisibilityToolStripMenuItem";
        appMenuVisibilityToolStripMenuItem.Size = new Size(235, 22);
        appMenuVisibilityToolStripMenuItem.Text = "메뉴 및 데이터 폴더 표시(&U)...";

        connectBarPanel.Controls.Add(connectInputToolStrip);
        connectBarPanel.Controls.Add(connectActionsPanel);
        connectBarPanel.Dock = DockStyle.Top;
        connectBarPanel.Location = new Point(0, 24);
        connectBarPanel.Name = "connectBarPanel";
        connectBarPanel.Padding = new Padding(4, 2, 4, 2);
        connectBarPanel.Size = new Size(1200, 44);
        connectBarPanel.TabIndex = 1;

        connectInputToolStrip.Dock = DockStyle.Fill;
        connectInputToolStrip.GripStyle = ToolStripGripStyle.Hidden;
        connectInputToolStrip.Items.AddRange(new ToolStripItem[]
        {
            toolStripLabelProfile, profilesCombo, toolStripLabelHistory, historyCombo,
            toolStripLabelHost, hostText, toolStripLabelPort, portText,
            toolStripLabelPassword, passwordText,
        });
        connectInputToolStrip.Location = new Point(4, 2);
        connectInputToolStrip.Name = "connectInputToolStrip";
        connectInputToolStrip.Padding = new Padding(0, 2, 4, 2);
        connectInputToolStrip.Size = new Size(884, 40);
        connectInputToolStrip.TabIndex = 0;

        toolStripLabelProfile.Name = "toolStripLabelProfile";
        toolStripLabelProfile.Size = new Size(39, 22);
        toolStripLabelProfile.Text = "프로필:";

        profilesCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        profilesCombo.Name = "profilesCombo";
        profilesCombo.Size = new Size(120, 27);

        toolStripLabelHistory.Name = "toolStripLabelHistory";
        toolStripLabelHistory.Size = new Size(34, 22);
        toolStripLabelHistory.Text = "최근:";

        historyCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        historyCombo.Name = "historyCombo";
        historyCombo.Size = new Size(120, 27);

        toolStripLabelHost.Name = "toolStripLabelHost";
        toolStripLabelHost.Size = new Size(34, 22);
        toolStripLabelHost.Text = "서버:";

        hostText.BorderStyle = BorderStyle.FixedSingle;
        hostText.Name = "hostText";
        hostText.Size = new Size(180, 27);
        hostText.ToolTipText = "호스트 이름 또는 IP";

        toolStripLabelPort.Name = "toolStripLabelPort";
        toolStripLabelPort.Size = new Size(34, 22);
        toolStripLabelPort.Text = "포트:";

        portText.BorderStyle = BorderStyle.FixedSingle;
        portText.Name = "portText";
        portText.Size = new Size(52, 27);
        portText.Text = "5900";

        toolStripLabelPassword.Name = "toolStripLabelPassword";
        toolStripLabelPassword.Size = new Size(58, 22);
        toolStripLabelPassword.Text = "VNC암호:";

        passwordText.BorderStyle = BorderStyle.FixedSingle;
        passwordText.Name = "passwordText";
        passwordText.Size = new Size(100, 27);

        connectActionsPanel.Controls.Add(connectButton);
        connectActionsPanel.Controls.Add(recordButton);
        connectActionsPanel.Controls.Add(advancedSettingsButton);
        connectActionsPanel.Dock = DockStyle.Right;
        connectActionsPanel.Location = new Point(888, 2);
        connectActionsPanel.Name = "connectActionsPanel";
        connectActionsPanel.Padding = new Padding(0);
        connectActionsPanel.Size = new Size(344, 40);
        connectActionsPanel.TabIndex = 1;

        connectButton.Anchor = AnchorStyles.Top | AnchorStyles.Left;
        connectButton.Font = new Font("맑은 고딕", 10F, FontStyle.Bold);
        connectButton.Location = new Point(8, 4);
        connectButton.Name = "connectButton";
        connectButton.Size = new Size(104, 32);
        connectButton.TabIndex = 0;
        connectButton.Text = "연결";
        connectButton.UseVisualStyleBackColor = true;

        recordButton.Anchor = AnchorStyles.Top | AnchorStyles.Left;
        recordButton.Location = new Point(120, 4);
        recordButton.Name = "recordButton";
        recordButton.Size = new Size(104, 32);
        recordButton.TabIndex = 1;
        recordButton.Text = "녹화";
        recordButton.UseVisualStyleBackColor = false;

        advancedSettingsButton.Anchor = AnchorStyles.Top | AnchorStyles.Left;
        advancedSettingsButton.Location = new Point(232, 4);
        advancedSettingsButton.Name = "advancedSettingsButton";
        advancedSettingsButton.Size = new Size(104, 32);
        advancedSettingsButton.TabIndex = 2;
        advancedSettingsButton.Text = "고급 설정";
        advancedSettingsButton.UseVisualStyleBackColor = true;

        remotePanel.Controls.Add(vncHostPanel);
        remotePanel.Dock = DockStyle.Fill;
        remotePanel.Location = new Point(0, 68);
        remotePanel.Name = "remotePanel";
        remotePanel.Padding = new Padding(4);
        remotePanel.Size = new Size(1200, 593);
        remotePanel.TabIndex = 2;

        vncHostPanel.Dock = DockStyle.Fill;
        vncHostPanel.Name = "vncHostPanel";
        vncHostPanel.TabIndex = 0;
        vncHostPanel.Visible = false;

        statusStrip.Items.AddRange(new ToolStripItem[] { toolStripStatusState, toolStripStatusConnection, toolStripStatusViewport, toolStripStatusOptions });
        statusStrip.Location = new Point(0, 661);
        statusStrip.Name = "statusStrip";
        statusStrip.Size = new Size(1200, 24);
        statusStrip.SizingGrip = false;
        statusStrip.TabIndex = 3;

        toolStripStatusState.Name = "toolStripStatusState";
        toolStripStatusState.Spring = true;
        toolStripStatusState.Text = "상태: 준비됨";
        toolStripStatusState.TextAlign = ContentAlignment.MiddleLeft;

        toolStripStatusConnection.AutoSize = false;
        toolStripStatusConnection.BorderSides = ToolStripStatusLabelBorderSides.Left;
        toolStripStatusConnection.Size = new Size(260, 20);
        toolStripStatusConnection.Text = "연결: —";

        toolStripStatusViewport.AutoSize = false;
        toolStripStatusViewport.BorderSides = ToolStripStatusLabelBorderSides.Left;
        toolStripStatusViewport.Size = new Size(280, 20);
        toolStripStatusViewport.Text = "원격 패널: —";

        toolStripStatusOptions.AutoSize = false;
        toolStripStatusOptions.BorderSides = ToolStripStatusLabelBorderSides.Left;
        toolStripStatusOptions.Size = new Size(320, 20);
        toolStripStatusOptions.Text = "옵션: —";

        AcceptButton = connectButton;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1200, 685);
        Controls.Add(remotePanel);
        Controls.Add(connectBarPanel);
        Controls.Add(statusStrip);
        Controls.Add(mainMenuStrip);
        Icon = (Icon)resources.GetObject("$this.Icon");
        KeyPreview = true;
        MainMenuStrip = mainMenuStrip;
        MinimumSize = new Size(900, 500);
        Name = "MainForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "Remote Desktop (VNC)";

        mainMenuStrip.ResumeLayout(false);
        mainMenuStrip.PerformLayout();
        connectBarPanel.ResumeLayout(false);
        connectBarPanel.PerformLayout();
        connectInputToolStrip.ResumeLayout(false);
        connectInputToolStrip.PerformLayout();
        connectActionsPanel.ResumeLayout(false);
        remotePanel.ResumeLayout(false);
        statusStrip.ResumeLayout(false);
        statusStrip.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }
}

#nullable restore
