namespace RemoteDesktopWinV10.App;

#nullable disable
public partial class MainForm
{
    private System.ComponentModel.IContainer components;

    private MenuStrip mainMenuStrip;
    private ToolStrip mainToolStrip;
    private ToolStripButton toolStripManageProfiles;
    private ToolStripSeparator toolStripSeparatorQuick;
    private ToolStripButton toolStripAppSettings;
    private ToolStripMenuItem fileToolStripMenuItem;
    private ToolStripMenuItem openDataFolderToolStripMenuItem;
    private ToolStripSeparator toolStripSeparatorFile;
    private ToolStripMenuItem exitToolStripMenuItem;
    private ToolStripMenuItem profileToolStripMenuItem;
    private ToolStripMenuItem manageProfilesToolStripMenuItem;
    private ToolStripMenuItem viewToolStripMenuItem;
    private ToolStripMenuItem fullScreenToolStripMenuItem;
    private ToolStripMenuItem settingsToolStripMenuItem;
    private ToolStripMenuItem appMenuVisibilityToolStripMenuItem;

    private SplitContainer splitRoot;
    private Panel panelConnection;
    private Panel panelProfileRow;
    private Panel panelServerRow;
    private FlowLayoutPanel flowRdpOptions;
    private Panel remotePanel;
    private Panel rdpHostPanel;
    private Panel vncHostPanel;

    private Label labelProfileHead;
    private ComboBox profilesCombo;
    private Label labelHistoryHead;
    private ComboBox historyCombo;
    private Label labelProtocolHead;
    private ComboBox protocolCombo;
    private Label labelHostHead;
    private TextBox hostText;
    private Label labelPortHead;
    private TextBox portText;
    private Label labelUserHead;
    private TextBox userText;
    private Label labelPasswordHead;
    private TextBox passwordText;
    private Button connectButton;
    private CheckBox credSspCheck;
    private CheckBox nlaCheck;
    private CheckBox relaxedCertCheck;
    private CheckBox rdpClipboardCheck;
    private CheckBox rdpDrivesCheck;
    private CheckBox rdpPrintersCheck;

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
        components = new System.ComponentModel.Container();
        mainMenuStrip = new MenuStrip();
        mainToolStrip = new ToolStrip();
        toolStripManageProfiles = new ToolStripButton();
        toolStripSeparatorQuick = new ToolStripSeparator();
        toolStripAppSettings = new ToolStripButton();
        fileToolStripMenuItem = new ToolStripMenuItem();
        openDataFolderToolStripMenuItem = new ToolStripMenuItem();
        toolStripSeparatorFile = new ToolStripSeparator();
        exitToolStripMenuItem = new ToolStripMenuItem();
        profileToolStripMenuItem = new ToolStripMenuItem();
        manageProfilesToolStripMenuItem = new ToolStripMenuItem();
        viewToolStripMenuItem = new ToolStripMenuItem();
        fullScreenToolStripMenuItem = new ToolStripMenuItem();
        settingsToolStripMenuItem = new ToolStripMenuItem();
        appMenuVisibilityToolStripMenuItem = new ToolStripMenuItem();
        splitRoot = new SplitContainer();
        panelConnection = new Panel();
        panelProfileRow = new Panel();
        panelServerRow = new Panel();
        flowRdpOptions = new FlowLayoutPanel();
        labelProfileHead = new Label();
        profilesCombo = new ComboBox();
        labelHistoryHead = new Label();
        historyCombo = new ComboBox();
        labelProtocolHead = new Label();
        protocolCombo = new ComboBox();
        labelHostHead = new Label();
        hostText = new TextBox();
        labelPortHead = new Label();
        portText = new TextBox();
        labelUserHead = new Label();
        userText = new TextBox();
        labelPasswordHead = new Label();
        passwordText = new TextBox();
        connectButton = new Button();
        credSspCheck = new CheckBox();
        nlaCheck = new CheckBox();
        relaxedCertCheck = new CheckBox();
        rdpClipboardCheck = new CheckBox();
        rdpDrivesCheck = new CheckBox();
        rdpPrintersCheck = new CheckBox();
        statusStrip = new StatusStrip();
        toolStripStatusState = new ToolStripStatusLabel();
        toolStripStatusConnection = new ToolStripStatusLabel();
        toolStripStatusViewport = new ToolStripStatusLabel();
        toolStripStatusOptions = new ToolStripStatusLabel();
        remotePanel = new Panel();
        rdpHostPanel = new Panel();
        vncHostPanel = new Panel();
        mainMenuStrip.SuspendLayout();
        mainToolStrip.SuspendLayout();
        splitRoot.SuspendLayout();
        panelConnection.SuspendLayout();
        panelProfileRow.SuspendLayout();
        panelServerRow.SuspendLayout();
        flowRdpOptions.SuspendLayout();
        statusStrip.SuspendLayout();
        remotePanel.SuspendLayout();
        rdpHostPanel.SuspendLayout();
        vncHostPanel.SuspendLayout();
        SuspendLayout();
        //
        // mainMenuStrip
        //
        mainMenuStrip.Items.AddRange(new ToolStripItem[]
        {
            fileToolStripMenuItem,
            profileToolStripMenuItem,
            viewToolStripMenuItem,
            settingsToolStripMenuItem,
        });
        mainMenuStrip.Location = new Point(0, 0);
        mainMenuStrip.Name = "mainMenuStrip";
        mainMenuStrip.Size = new Size(984, 24);
        mainMenuStrip.TabIndex = 0;
        mainMenuStrip.Text = "menuStrip1";
        //
        // fileToolStripMenuItem
        //
        fileToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[]
        {
            openDataFolderToolStripMenuItem,
            toolStripSeparatorFile,
            exitToolStripMenuItem,
        });
        fileToolStripMenuItem.Name = "fileToolStripMenuItem";
        fileToolStripMenuItem.Size = new Size(37, 20);
        fileToolStripMenuItem.Text = "파일(&F)";
        //
        // openDataFolderToolStripMenuItem
        //
        openDataFolderToolStripMenuItem.Name = "openDataFolderToolStripMenuItem";
        openDataFolderToolStripMenuItem.Size = new Size(210, 22);
        openDataFolderToolStripMenuItem.Text = "데이터 폴더 열기(&D)";
        openDataFolderToolStripMenuItem.Visible = false;
        //
        // toolStripSeparatorFile
        //
        toolStripSeparatorFile.Name = "toolStripSeparatorFile";
        toolStripSeparatorFile.Size = new Size(207, 6);
        //
        // exitToolStripMenuItem
        //
        exitToolStripMenuItem.Name = "exitToolStripMenuItem";
        exitToolStripMenuItem.Size = new Size(210, 22);
        exitToolStripMenuItem.Text = "종료(&X)";
        //
        // viewToolStripMenuItem
        //
        viewToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[] { fullScreenToolStripMenuItem });
        viewToolStripMenuItem.Name = "viewToolStripMenuItem";
        viewToolStripMenuItem.Size = new Size(43, 20);
        viewToolStripMenuItem.Text = "보기(&V)";
        //
        // fullScreenToolStripMenuItem
        //
        fullScreenToolStripMenuItem.Name = "fullScreenToolStripMenuItem";
        fullScreenToolStripMenuItem.ShortcutKeys = Keys.F11;
        fullScreenToolStripMenuItem.Size = new Size(180, 22);
        fullScreenToolStripMenuItem.Text = "전체 화면(&F)";
        //
        // profileToolStripMenuItem
        //
        profileToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[] { manageProfilesToolStripMenuItem });
        profileToolStripMenuItem.Name = "profileToolStripMenuItem";
        profileToolStripMenuItem.Size = new Size(55, 20);
        profileToolStripMenuItem.Text = "프로필(&P)";
        //
        // manageProfilesToolStripMenuItem
        //
        manageProfilesToolStripMenuItem.Name = "manageProfilesToolStripMenuItem";
        manageProfilesToolStripMenuItem.Size = new Size(200, 22);
        manageProfilesToolStripMenuItem.Text = "프로필 관리(&M)...";
        //
        // settingsToolStripMenuItem
        //
        settingsToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[] { appMenuVisibilityToolStripMenuItem });
        settingsToolStripMenuItem.Name = "settingsToolStripMenuItem";
        settingsToolStripMenuItem.Size = new Size(58, 20);
        settingsToolStripMenuItem.Text = "설정(&S)";
        //
        // appMenuVisibilityToolStripMenuItem
        //
        appMenuVisibilityToolStripMenuItem.Name = "appMenuVisibilityToolStripMenuItem";
        appMenuVisibilityToolStripMenuItem.Size = new Size(260, 22);
        appMenuVisibilityToolStripMenuItem.Text = "메뉴 및 데이터 폴더 표시(&U)...";
        //
        // mainToolStrip
        //
        mainToolStrip.Dock = DockStyle.Top;
        mainToolStrip.GripStyle = ToolStripGripStyle.Hidden;
        mainToolStrip.Items.AddRange(new ToolStripItem[]
        {
            toolStripManageProfiles,
            toolStripSeparatorQuick,
            toolStripAppSettings,
        });
        mainToolStrip.Name = "mainToolStrip";
        mainToolStrip.Size = new Size(984, 25);
        mainToolStrip.TabIndex = 2;
        mainToolStrip.Text = "mainToolStrip";
        //
        // toolStripManageProfiles
        //
        toolStripManageProfiles.DisplayStyle = ToolStripItemDisplayStyle.Text;
        toolStripManageProfiles.Name = "toolStripManageProfiles";
        toolStripManageProfiles.Size = new Size(88, 22);
        toolStripManageProfiles.Text = "프로필 관리";
        //
        // toolStripSeparatorQuick
        //
        toolStripSeparatorQuick.Name = "toolStripSeparatorQuick";
        toolStripSeparatorQuick.Size = new Size(6, 25);
        //
        // toolStripAppSettings
        //
        toolStripAppSettings.DisplayStyle = ToolStripItemDisplayStyle.Text;
        toolStripAppSettings.Name = "toolStripAppSettings";
        toolStripAppSettings.Size = new Size(60, 22);
        toolStripAppSettings.Text = "앱 설정";
        //
        // splitRoot
        //
        splitRoot.Dock = DockStyle.Fill;
        splitRoot.FixedPanel = FixedPanel.None;
        splitRoot.Location = new Point(0, 0);
        splitRoot.Name = "splitRoot";
        splitRoot.Orientation = Orientation.Horizontal;
        splitRoot.Panel1MinSize = 120;
        splitRoot.Panel2MinSize = 80;
        splitRoot.Size = new Size(984, 612);
        splitRoot.SplitterDistance = 210;
        splitRoot.SplitterWidth = 6;
        splitRoot.TabIndex = 1;
        splitRoot.Panel1.Controls.Add(panelConnection);
        splitRoot.Panel2.Controls.Add(remotePanel);
        //
        // panelConnection
        //
        panelConnection.AutoScroll = true;
        panelConnection.Dock = DockStyle.Fill;
        panelConnection.Name = "panelConnection";
        panelConnection.Padding = new Padding(12, 8, 12, 6);
        panelConnection.Controls.Add(panelProfileRow);
        panelConnection.Controls.Add(panelServerRow);
        panelConnection.Controls.Add(flowRdpOptions);
        //
        // panelProfileRow
        //
        panelProfileRow.Controls.Add(labelProfileHead);
        panelProfileRow.Controls.Add(profilesCombo);
        panelProfileRow.Controls.Add(labelHistoryHead);
        panelProfileRow.Controls.Add(historyCombo);
        panelProfileRow.Dock = DockStyle.Top;
        panelProfileRow.Location = new Point(0, 0);
        panelProfileRow.Name = "panelProfileRow";
        panelProfileRow.Size = new Size(984, 42);
        panelProfileRow.TabIndex = 0;
        //
        // labelProfileHead
        //
        labelProfileHead.AutoSize = true;
        labelProfileHead.Location = new Point(0, 14);
        labelProfileHead.Name = "labelProfileHead";
        labelProfileHead.Size = new Size(43, 15);
        labelProfileHead.TabIndex = 0;
        labelProfileHead.Text = "프로필";
        //
        // profilesCombo
        //
        profilesCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        profilesCombo.FormattingEnabled = true;
        profilesCombo.Location = new Point(52, 10);
        profilesCombo.Name = "profilesCombo";
        profilesCombo.Size = new Size(200, 23);
        profilesCombo.TabIndex = 1;
        //
        // labelHistoryHead
        //
        labelHistoryHead.AutoSize = true;
        labelHistoryHead.Location = new Point(268, 14);
        labelHistoryHead.Name = "labelHistoryHead";
        labelHistoryHead.Size = new Size(31, 15);
        labelHistoryHead.TabIndex = 2;
        labelHistoryHead.Text = "최근";
        //
        // historyCombo
        //
        historyCombo.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        historyCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        historyCombo.FormattingEnabled = true;
        historyCombo.Location = new Point(312, 10);
        historyCombo.Name = "historyCombo";
        historyCombo.Size = new Size(640, 23);
        historyCombo.TabIndex = 3;
        //
        // panelServerRow
        //
        panelServerRow.Controls.Add(labelProtocolHead);
        panelServerRow.Controls.Add(protocolCombo);
        panelServerRow.Controls.Add(labelHostHead);
        panelServerRow.Controls.Add(hostText);
        panelServerRow.Controls.Add(connectButton);
        panelServerRow.Controls.Add(labelPortHead);
        panelServerRow.Controls.Add(portText);
        panelServerRow.Controls.Add(labelUserHead);
        panelServerRow.Controls.Add(userText);
        panelServerRow.Controls.Add(labelPasswordHead);
        panelServerRow.Controls.Add(passwordText);
        panelServerRow.Dock = DockStyle.Top;
        panelServerRow.Name = "panelServerRow";
        panelServerRow.Size = new Size(984, 84);
        panelServerRow.TabIndex = 1;
        //
        // labelProtocolHead
        //
        labelProtocolHead.AutoSize = true;
        labelProtocolHead.Location = new Point(0, 12);
        labelProtocolHead.Name = "labelProtocolHead";
        labelProtocolHead.Size = new Size(55, 15);
        labelProtocolHead.TabIndex = 0;
        labelProtocolHead.Text = "프로토콜";
        //
        // protocolCombo
        //
        protocolCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        protocolCombo.FormattingEnabled = true;
        protocolCombo.Location = new Point(64, 8);
        protocolCombo.Name = "protocolCombo";
        protocolCombo.Size = new Size(100, 23);
        protocolCombo.TabIndex = 1;
        //
        // labelHostHead
        //
        labelHostHead.AutoSize = true;
        labelHostHead.Location = new Point(176, 12);
        labelHostHead.Name = "labelHostHead";
        labelHostHead.Size = new Size(31, 15);
        labelHostHead.TabIndex = 2;
        labelHostHead.Text = "서버";
        //
        // hostText
        //
        hostText.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        hostText.Location = new Point(216, 8);
        hostText.Name = "hostText";
        hostText.PlaceholderText = "호스트 이름 또는 IP";
        hostText.Size = new Size(640, 23);
        hostText.TabIndex = 3;
        //
        // connectButton
        //
        connectButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        connectButton.Location = new Point(868, 5);
        connectButton.Name = "connectButton";
        connectButton.Size = new Size(96, 30);
        connectButton.TabIndex = 4;
        connectButton.Text = "연결";
        //
        // labelPortHead
        //
        labelPortHead.AutoSize = true;
        labelPortHead.Location = new Point(0, 52);
        labelPortHead.Name = "labelPortHead";
        labelPortHead.Size = new Size(31, 15);
        labelPortHead.TabIndex = 5;
        labelPortHead.Text = "포트";
        //
        // portText
        //
        portText.Location = new Point(52, 48);
        portText.Name = "portText";
        portText.Size = new Size(72, 23);
        portText.TabIndex = 6;
        //
        // labelUserHead
        //
        labelUserHead.AutoSize = true;
        labelUserHead.Location = new Point(136, 52);
        labelUserHead.Name = "labelUserHead";
        labelUserHead.Size = new Size(78, 15);
        labelUserHead.TabIndex = 7;
        labelUserHead.Text = "사용자(RDP)";
        //
        // userText
        //
        userText.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        userText.Location = new Point(224, 48);
        userText.Name = "userText";
        userText.PlaceholderText = "RDP 사용자 (DOMAIN\\user, user@도메인, 또는 이름)";
        userText.Size = new Size(380, 23);
        userText.TabIndex = 8;
        //
        // labelPasswordHead
        //
        labelPasswordHead.AutoSize = true;
        labelPasswordHead.Location = new Point(612, 52);
        labelPasswordHead.Name = "labelPasswordHead";
        labelPasswordHead.Size = new Size(31, 15);
        labelPasswordHead.TabIndex = 9;
        labelPasswordHead.Text = "암호";
        //
        // passwordText
        //
        passwordText.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        passwordText.Location = new Point(652, 48);
        passwordText.Name = "passwordText";
        passwordText.Size = new Size(200, 23);
        passwordText.TabIndex = 10;
        passwordText.UseSystemPasswordChar = true;
        //
        // flowRdpOptions
        //
        flowRdpOptions.AutoSize = true;
        flowRdpOptions.Controls.Add(credSspCheck);
        flowRdpOptions.Controls.Add(nlaCheck);
        flowRdpOptions.Controls.Add(relaxedCertCheck);
        flowRdpOptions.Controls.Add(rdpClipboardCheck);
        flowRdpOptions.Controls.Add(rdpDrivesCheck);
        flowRdpOptions.Controls.Add(rdpPrintersCheck);
        flowRdpOptions.Dock = DockStyle.Top;
        flowRdpOptions.Location = new Point(0, 126);
        flowRdpOptions.Name = "flowRdpOptions";
        flowRdpOptions.Padding = new Padding(0, 4, 0, 4);
        flowRdpOptions.Size = new Size(984, 72);
        flowRdpOptions.TabIndex = 2;
        flowRdpOptions.WrapContents = true;
        //
        // credSspCheck
        //
        credSspCheck.AutoSize = true;
        credSspCheck.Checked = true;
        credSspCheck.CheckState = CheckState.Checked;
        credSspCheck.Margin = new Padding(0, 4, 16, 4);
        credSspCheck.Name = "credSspCheck";
        credSspCheck.Size = new Size(78, 19);
        credSspCheck.TabIndex = 0;
        credSspCheck.Text = "CredSSP";
        credSspCheck.UseVisualStyleBackColor = true;
        //
        // nlaCheck
        //
        nlaCheck.AutoSize = true;
        nlaCheck.Checked = true;
        nlaCheck.CheckState = CheckState.Checked;
        nlaCheck.Margin = new Padding(0, 4, 16, 4);
        nlaCheck.Name = "nlaCheck";
        nlaCheck.Size = new Size(150, 19);
        nlaCheck.TabIndex = 1;
        nlaCheck.Text = "NLA(보안 계층 협상)";
        nlaCheck.UseVisualStyleBackColor = true;
        //
        // relaxedCertCheck
        //
        relaxedCertCheck.AutoSize = true;
        relaxedCertCheck.Margin = new Padding(0, 4, 16, 4);
        relaxedCertCheck.Name = "relaxedCertCheck";
        relaxedCertCheck.Size = new Size(258, 19);
        relaxedCertCheck.TabIndex = 2;
        relaxedCertCheck.Text = "신뢰되지 않은 호스트/인증서 완화(위험)";
        relaxedCertCheck.UseVisualStyleBackColor = true;
        //
        // rdpClipboardCheck
        //
        rdpClipboardCheck.AutoSize = true;
        rdpClipboardCheck.Checked = true;
        rdpClipboardCheck.CheckState = CheckState.Checked;
        rdpClipboardCheck.Margin = new Padding(0, 4, 16, 4);
        rdpClipboardCheck.Name = "rdpClipboardCheck";
        rdpClipboardCheck.Size = new Size(104, 19);
        rdpClipboardCheck.TabIndex = 3;
        rdpClipboardCheck.Text = "RDP 클립보드";
        rdpClipboardCheck.UseVisualStyleBackColor = true;
        //
        // rdpDrivesCheck
        //
        rdpDrivesCheck.AutoSize = true;
        rdpDrivesCheck.Margin = new Padding(0, 4, 16, 4);
        rdpDrivesCheck.Name = "rdpDrivesCheck";
        rdpDrivesCheck.Size = new Size(96, 19);
        rdpDrivesCheck.TabIndex = 4;
        rdpDrivesCheck.Text = "RDP 드라이브";
        rdpDrivesCheck.UseVisualStyleBackColor = true;
        //
        // rdpPrintersCheck
        //
        rdpPrintersCheck.AutoSize = true;
        rdpPrintersCheck.Margin = new Padding(0, 4, 16, 4);
        rdpPrintersCheck.Name = "rdpPrintersCheck";
        rdpPrintersCheck.Size = new Size(96, 19);
        rdpPrintersCheck.TabIndex = 5;
        rdpPrintersCheck.Text = "RDP 프린터";
        rdpPrintersCheck.UseVisualStyleBackColor = true;
        //
        // statusStrip
        //
        statusStrip.Dock = DockStyle.Bottom;
        statusStrip.Items.AddRange(new ToolStripItem[]
        {
            toolStripStatusState,
            toolStripStatusConnection,
            toolStripStatusViewport,
            toolStripStatusOptions,
        });
        statusStrip.Location = new Point(0, 639);
        statusStrip.Name = "statusStrip";
        statusStrip.Size = new Size(984, 24);
        statusStrip.TabIndex = 3;
        statusStrip.Text = "statusStrip";
        statusStrip.SizingGrip = false;
        //
        // toolStripStatusState
        //
        toolStripStatusState.Name = "toolStripStatusState";
        toolStripStatusState.Spring = true;
        toolStripStatusState.Text = "상태: 준비됨";
        toolStripStatusState.TextAlign = ContentAlignment.MiddleLeft;
        //
        // toolStripStatusConnection
        //
        toolStripStatusConnection.AutoSize = false;
        toolStripStatusConnection.BorderSides = ToolStripStatusLabelBorderSides.Left;
        toolStripStatusConnection.BorderStyle = Border3DStyle.Etched;
        toolStripStatusConnection.Margin = new Padding(6, 2, 0, 2);
        toolStripStatusConnection.Name = "toolStripStatusConnection";
        toolStripStatusConnection.Size = new Size(260, 20);
        toolStripStatusConnection.Text = "연결: —";
        toolStripStatusConnection.TextAlign = ContentAlignment.MiddleLeft;
        //
        // toolStripStatusViewport
        //
        toolStripStatusViewport.AutoSize = false;
        toolStripStatusViewport.BorderSides = ToolStripStatusLabelBorderSides.Left;
        toolStripStatusViewport.BorderStyle = Border3DStyle.Etched;
        toolStripStatusViewport.Margin = new Padding(6, 2, 0, 2);
        toolStripStatusViewport.Name = "toolStripStatusViewport";
        toolStripStatusViewport.Size = new Size(280, 20);
        toolStripStatusViewport.Text = "원격 패널: —";
        toolStripStatusViewport.TextAlign = ContentAlignment.MiddleLeft;
        //
        // toolStripStatusOptions
        //
        toolStripStatusOptions.AutoSize = false;
        toolStripStatusOptions.BorderSides = ToolStripStatusLabelBorderSides.Left;
        toolStripStatusOptions.BorderStyle = Border3DStyle.Etched;
        toolStripStatusOptions.Margin = new Padding(6, 2, 0, 2);
        toolStripStatusOptions.Name = "toolStripStatusOptions";
        toolStripStatusOptions.Size = new Size(320, 20);
        toolStripStatusOptions.Text = "옵션: —";
        toolStripStatusOptions.TextAlign = ContentAlignment.MiddleLeft;
        //
        // remotePanel
        //
        remotePanel.Controls.Add(rdpHostPanel);
        remotePanel.Controls.Add(vncHostPanel);
        remotePanel.Dock = DockStyle.Fill;
        remotePanel.Location = new Point(0, 0);
        remotePanel.Name = "remotePanel";
        remotePanel.Padding = new Padding(8, 0, 8, 8);
        remotePanel.Size = new Size(984, 396);
        remotePanel.TabIndex = 0;
        //
        // rdpHostPanel
        //
        rdpHostPanel.Dock = DockStyle.Fill;
        rdpHostPanel.Location = new Point(8, 0);
        rdpHostPanel.Name = "rdpHostPanel";
        rdpHostPanel.Size = new Size(968, 388);
        rdpHostPanel.TabIndex = 0;
        rdpHostPanel.Visible = false;
        //
        // vncHostPanel
        //
        vncHostPanel.Dock = DockStyle.Fill;
        vncHostPanel.Location = new Point(8, 0);
        vncHostPanel.Name = "vncHostPanel";
        vncHostPanel.Size = new Size(968, 388);
        vncHostPanel.TabIndex = 1;
        vncHostPanel.Visible = false;
        //
        // MainForm
        //
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(984, 661);
        Controls.Add(splitRoot);
        Controls.Add(mainToolStrip);
        Controls.Add(statusStrip);
        KeyPreview = true;
        MainMenuStrip = mainMenuStrip;
        MinimumSize = new Size(920, 620);
        Name = "MainForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "Remote Desktop (RDP / VNC)";
        mainMenuStrip.ResumeLayout(false);
        mainMenuStrip.PerformLayout();
        mainToolStrip.ResumeLayout(false);
        mainToolStrip.PerformLayout();
        splitRoot.Panel1.ResumeLayout(false);
        splitRoot.Panel2.ResumeLayout(false);
        splitRoot.ResumeLayout(false);
        panelConnection.ResumeLayout(false);
        panelConnection.PerformLayout();
        panelProfileRow.ResumeLayout(false);
        panelProfileRow.PerformLayout();
        panelServerRow.ResumeLayout(false);
        panelServerRow.PerformLayout();
        flowRdpOptions.ResumeLayout(false);
        flowRdpOptions.PerformLayout();
        statusStrip.ResumeLayout(false);
        statusStrip.PerformLayout();
        remotePanel.ResumeLayout(false);
        rdpHostPanel.ResumeLayout(false);
        vncHostPanel.ResumeLayout(false);
        ResumeLayout(false);
        PerformLayout();
    }
}

#nullable restore
