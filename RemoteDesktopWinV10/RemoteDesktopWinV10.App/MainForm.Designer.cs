namespace RemoteDesktopWinV10.App;

#nullable disable
public partial class MainForm
{
    private System.ComponentModel.IContainer components = null!;

    private MenuStrip mainMenuStrip;
    private ToolStrip quickConnectToolStrip;
    private ToolStripLabel toolStripLabelProtocol;
    private ToolStripComboBox toolStripProtocol;
    private ToolStripLabel toolStripLabelHost;
    private ToolStripTextBox toolStripHost;
    private ToolStripLabel toolStripLabelPort;
    private ToolStripTextBox toolStripPort;
    private ToolStripButton toolStripConnect;
    
    private ToolStripMenuItem fileToolStripMenuItem;
    private ToolStripMenuItem connectToolStripMenuItem;
    private ToolStripMenuItem connectionSettingsToolStripMenuItem;
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
    private Panel rdpHostPanel;
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
        connectionSettingsToolStripMenuItem = new ToolStripMenuItem();
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
        quickConnectToolStrip = new ToolStrip();
        toolStripLabelProtocol = new ToolStripLabel();
        toolStripProtocol = new ToolStripComboBox();
        toolStripLabelHost = new ToolStripLabel();
        toolStripHost = new ToolStripTextBox();
        toolStripLabelPort = new ToolStripLabel();
        toolStripPort = new ToolStripTextBox();
        toolStripConnect = new ToolStripButton();
        remotePanel = new Panel();
        rdpHostPanel = new Panel();
        vncHostPanel = new Panel();
        statusStrip = new StatusStrip();
        toolStripStatusState = new ToolStripStatusLabel();
        toolStripStatusConnection = new ToolStripStatusLabel();
        toolStripStatusViewport = new ToolStripStatusLabel();
        toolStripStatusOptions = new ToolStripStatusLabel();
        mainMenuStrip.SuspendLayout();
        quickConnectToolStrip.SuspendLayout();
        remotePanel.SuspendLayout();
        statusStrip.SuspendLayout();
        SuspendLayout();
        // 
        // mainMenuStrip
        // 
        mainMenuStrip.Items.AddRange(new ToolStripItem[] { fileToolStripMenuItem, profileToolStripMenuItem, viewToolStripMenuItem, settingsToolStripMenuItem });
        mainMenuStrip.Location = new Point(0, 0);
        mainMenuStrip.Name = "mainMenuStrip";
        mainMenuStrip.Size = new Size(1200, 24);
        mainMenuStrip.TabIndex = 0;
        mainMenuStrip.Text = "menuStrip1";
        // 
        // fileToolStripMenuItem
        // 
        fileToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[] { connectToolStripMenuItem, connectionSettingsToolStripMenuItem, toolStripSeparatorFileConnect, openDataFolderToolStripMenuItem, toolStripSeparatorFile, exitToolStripMenuItem });
        fileToolStripMenuItem.Name = "fileToolStripMenuItem";
        fileToolStripMenuItem.Size = new Size(57, 20);
        fileToolStripMenuItem.Text = "파일(&F)";
        // 
        // connectToolStripMenuItem
        // 
        connectToolStripMenuItem.Name = "connectToolStripMenuItem";
        connectToolStripMenuItem.ShortcutKeys = Keys.Control | Keys.N;
        connectToolStripMenuItem.Size = new Size(183, 22);
        connectToolStripMenuItem.Text = "연결(&N)";
        // 
        // connectionSettingsToolStripMenuItem
        // 
        connectionSettingsToolStripMenuItem.Name = "connectionSettingsToolStripMenuItem";
        connectionSettingsToolStripMenuItem.Size = new Size(183, 22);
        connectionSettingsToolStripMenuItem.Text = "연결 설정(&C)...";
        // 
        // toolStripSeparatorFileConnect
        // 
        toolStripSeparatorFileConnect.Name = "toolStripSeparatorFileConnect";
        toolStripSeparatorFileConnect.Size = new Size(180, 6);
        // 
        // openDataFolderToolStripMenuItem
        // 
        openDataFolderToolStripMenuItem.Name = "openDataFolderToolStripMenuItem";
        openDataFolderToolStripMenuItem.Size = new Size(183, 22);
        openDataFolderToolStripMenuItem.Text = "데이터 폴더 열기(&D)";
        openDataFolderToolStripMenuItem.Visible = false;
        // 
        // toolStripSeparatorFile
        // 
        toolStripSeparatorFile.Name = "toolStripSeparatorFile";
        toolStripSeparatorFile.Size = new Size(180, 6);
        // 
        // exitToolStripMenuItem
        // 
        exitToolStripMenuItem.Name = "exitToolStripMenuItem";
        exitToolStripMenuItem.Size = new Size(183, 22);
        exitToolStripMenuItem.Text = "종료(&X)";
        // 
        // profileToolStripMenuItem
        // 
        profileToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[] { manageProfilesToolStripMenuItem });
        profileToolStripMenuItem.Name = "profileToolStripMenuItem";
        profileToolStripMenuItem.Size = new Size(70, 20);
        profileToolStripMenuItem.Text = "프로필(&P)";
        // 
        // manageProfilesToolStripMenuItem
        // 
        manageProfilesToolStripMenuItem.Name = "manageProfilesToolStripMenuItem";
        manageProfilesToolStripMenuItem.Size = new Size(166, 22);
        manageProfilesToolStripMenuItem.Text = "프로필 관리(&M)...";
        // 
        // viewToolStripMenuItem
        // 
        viewToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[] { fullScreenToolStripMenuItem });
        viewToolStripMenuItem.Name = "viewToolStripMenuItem";
        viewToolStripMenuItem.Size = new Size(59, 20);
        viewToolStripMenuItem.Text = "보기(&V)";
        // 
        // fullScreenToolStripMenuItem
        // 
        fullScreenToolStripMenuItem.Name = "fullScreenToolStripMenuItem";
        fullScreenToolStripMenuItem.ShortcutKeys = Keys.F11;
        fullScreenToolStripMenuItem.Size = new Size(167, 22);
        fullScreenToolStripMenuItem.Text = "전체 화면(&F)";
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
        appMenuVisibilityToolStripMenuItem.Size = new Size(235, 22);
        appMenuVisibilityToolStripMenuItem.Text = "메뉴 및 데이터 폴더 표시(&U)...";
        // 
        // quickConnectToolStrip
        // 
        quickConnectToolStrip.GripStyle = ToolStripGripStyle.Hidden;
        quickConnectToolStrip.Items.AddRange(new ToolStripItem[] { toolStripLabelProtocol, toolStripProtocol, toolStripLabelHost, toolStripHost, toolStripLabelPort, toolStripPort, toolStripConnect });
        quickConnectToolStrip.Location = new Point(0, 24);
        quickConnectToolStrip.Name = "quickConnectToolStrip";
        quickConnectToolStrip.Size = new Size(1200, 25);
        quickConnectToolStrip.TabIndex = 1;
        quickConnectToolStrip.Text = "빠른 연결";
        // 
        // toolStripLabelProtocol
        // 
        toolStripLabelProtocol.Name = "toolStripLabelProtocol";
        toolStripLabelProtocol.Size = new Size(58, 22);
        toolStripLabelProtocol.Text = "프로토콜:";
        // 
        // toolStripProtocol
        // 
        toolStripProtocol.DropDownStyle = ComboBoxStyle.DropDownList;
        toolStripProtocol.Name = "toolStripProtocol";
        toolStripProtocol.Size = new Size(80, 25);
        // 
        // toolStripLabelHost
        // 
        toolStripLabelHost.Name = "toolStripLabelHost";
        toolStripLabelHost.Size = new Size(34, 22);
        toolStripLabelHost.Text = "서버:";
        // 
        // toolStripHost
        // 
        toolStripHost.Name = "toolStripHost";
        toolStripHost.Size = new Size(300, 25);
        // 
        // toolStripLabelPort
        // 
        toolStripLabelPort.Name = "toolStripLabelPort";
        toolStripLabelPort.Size = new Size(34, 22);
        toolStripLabelPort.Text = "포트:";
        // 
        // toolStripPort
        // 
        toolStripPort.Name = "toolStripPort";
        toolStripPort.Size = new Size(60, 25);
        // 
        // toolStripConnect
        // 
        toolStripConnect.AutoSize = false;
        toolStripConnect.BackColor = Color.FromArgb(40, 167, 69);
        toolStripConnect.DisplayStyle = ToolStripItemDisplayStyle.Text;
        toolStripConnect.Font = new Font("맑은 고딕", 10F, FontStyle.Bold);
        toolStripConnect.ForeColor = Color.White;
        toolStripConnect.Name = "toolStripConnect";
        toolStripConnect.Size = new Size(100, 25);
        toolStripConnect.Text = "연결";
        // 
        // remotePanel
        // 
        remotePanel.Controls.Add(rdpHostPanel);
        remotePanel.Controls.Add(vncHostPanel);
        remotePanel.Dock = DockStyle.Fill;
        remotePanel.Location = new Point(0, 49);
        remotePanel.Name = "remotePanel";
        remotePanel.Padding = new Padding(4);
        remotePanel.Size = new Size(1200, 612);
        remotePanel.TabIndex = 2;
        // 
        // rdpHostPanel
        // 
        rdpHostPanel.Dock = DockStyle.Fill;
        rdpHostPanel.Location = new Point(4, 4);
        rdpHostPanel.Name = "rdpHostPanel";
        rdpHostPanel.Size = new Size(1192, 604);
        rdpHostPanel.TabIndex = 0;
        rdpHostPanel.Visible = false;
        // 
        // vncHostPanel
        // 
        vncHostPanel.Dock = DockStyle.Fill;
        vncHostPanel.Location = new Point(4, 4);
        vncHostPanel.Name = "vncHostPanel";
        vncHostPanel.Size = new Size(1192, 604);
        vncHostPanel.TabIndex = 1;
        vncHostPanel.Visible = false;
        // 
        // statusStrip
        // 
        statusStrip.Items.AddRange(new ToolStripItem[] { toolStripStatusState, toolStripStatusConnection, toolStripStatusViewport, toolStripStatusOptions });
        statusStrip.Location = new Point(0, 661);
        statusStrip.Name = "statusStrip";
        statusStrip.Size = new Size(1200, 24);
        statusStrip.SizingGrip = false;
        statusStrip.TabIndex = 3;
        statusStrip.Text = "statusStrip";
        // 
        // toolStripStatusState
        // 
        toolStripStatusState.Name = "toolStripStatusState";
        toolStripStatusState.Size = new Size(307, 19);
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
        // MainForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1200, 685);
        Controls.Add(remotePanel);
        Controls.Add(quickConnectToolStrip);
        Controls.Add(statusStrip);
        Controls.Add(mainMenuStrip);
        Icon = (Icon)resources.GetObject("$this.Icon");
        KeyPreview = true;
        MainMenuStrip = mainMenuStrip;
        MinimumSize = new Size(800, 500);
        Name = "MainForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "Remote Desktop (RDP / VNC)";
        mainMenuStrip.ResumeLayout(false);
        mainMenuStrip.PerformLayout();
        quickConnectToolStrip.ResumeLayout(false);
        quickConnectToolStrip.PerformLayout();
        remotePanel.ResumeLayout(false);
        statusStrip.ResumeLayout(false);
        statusStrip.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }
}

#nullable restore
