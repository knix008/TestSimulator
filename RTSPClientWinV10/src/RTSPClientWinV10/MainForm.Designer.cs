#nullable disable
namespace RTSPClientWinV10;

partial class MainForm
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
            components.Dispose();
        base.Dispose(disposing);
    }

    #region Windows Form Designer generated code

    private void InitializeComponent()
    {
        panelTop = new Panel();
        lblDeviceUrl = new Label();
        txtDeviceUrl = new TextBox();
        btnLocalSim = new Button();
        lblRtspPort = new Label();
        txtLocalPort = new TextBox();
        chkLoopback = new CheckBox();
        lblHost = new Label();
        btnRefresh = new Button();
        btnCallToggle = new Button();
        lblCamera = new Label();
        cboVideo = new ComboBox();
        lblMic = new Label();
        cboAudio = new ComboBox();
        lblState = new Label();
        lblTheme = new Label();
        cboTheme = new ComboBox();
        lblLanguage = new Label();
        cboLanguage = new ComboBox();
        lblHint = new Label();
        panelMain = new Panel();
        panelVideo = new Panel();
        lblVideoTitle = new Label();
        panelSide = new Panel();
        lblSessionTitle = new Label();
        lblDeviceRtsp = new Label();
        lblLocalRtsp = new Label();
        lblSessionId = new Label();
        lblPorts = new Label();
        panelLog = new Panel();
        lblLogTitle = new Label();
        txtLog = new TextBox();
        panelTop.SuspendLayout();
        panelMain.SuspendLayout();
        panelVideo.SuspendLayout();
        panelSide.SuspendLayout();
        panelLog.SuspendLayout();
        SuspendLayout();
        //
        // panelTop
        //
        panelTop.BackColor = Color.FromArgb(43, 45, 49);
        panelTop.Controls.Add(lblHint);
        panelTop.Controls.Add(cboLanguage);
        panelTop.Controls.Add(lblLanguage);
        panelTop.Controls.Add(cboTheme);
        panelTop.Controls.Add(lblTheme);
        panelTop.Controls.Add(lblState);
        panelTop.Controls.Add(cboAudio);
        panelTop.Controls.Add(lblMic);
        panelTop.Controls.Add(cboVideo);
        panelTop.Controls.Add(lblCamera);
        panelTop.Controls.Add(btnCallToggle);
        panelTop.Controls.Add(btnRefresh);
        panelTop.Controls.Add(lblHost);
        panelTop.Controls.Add(chkLoopback);
        panelTop.Controls.Add(txtLocalPort);
        panelTop.Controls.Add(lblRtspPort);
        panelTop.Controls.Add(btnLocalSim);
        panelTop.Controls.Add(txtDeviceUrl);
        panelTop.Controls.Add(lblDeviceUrl);
        panelTop.Dock = DockStyle.Top;
        panelTop.Location = new Point(0, 0);
        panelTop.Name = "panelTop";
        panelTop.Padding = new Padding(12);
        panelTop.Size = new Size(1100, 130);
        panelTop.TabIndex = 0;
        //
        // lblDeviceUrl
        //
        lblDeviceUrl.AutoSize = true;
        lblDeviceUrl.ForeColor = Color.White;
        lblDeviceUrl.Location = new Point(15, 18);
        lblDeviceUrl.Name = "lblDeviceUrl";
        lblDeviceUrl.Size = new Size(70, 15);
        lblDeviceUrl.TabIndex = 0;
        lblDeviceUrl.Text = "Device URL";
        //
        // txtDeviceUrl
        //
        txtDeviceUrl.BackColor = Color.White;
        txtDeviceUrl.ForeColor = Color.FromArgb(20, 22, 26);
        txtDeviceUrl.Location = new Point(91, 15);
        txtDeviceUrl.Name = "txtDeviceUrl";
        txtDeviceUrl.Size = new Size(260, 23);
        txtDeviceUrl.TabIndex = 1;
        txtDeviceUrl.Text = "http://127.0.0.1:8080";
        //
        // btnLocalSim
        //
        btnLocalSim.Location = new Point(357, 12);
        btnLocalSim.Name = "btnLocalSim";
        btnLocalSim.Size = new Size(100, 30);
        btnLocalSim.TabIndex = 2;
        btnLocalSim.Text = "Local sim";
        btnLocalSim.UseVisualStyleBackColor = true;
        btnLocalSim.Click += btnLocalSim_Click;
        //
        // lblRtspPort
        //
        lblRtspPort.AutoSize = true;
        lblRtspPort.ForeColor = Color.White;
        lblRtspPort.Location = new Point(468, 18);
        lblRtspPort.Name = "lblRtspPort";
        lblRtspPort.Size = new Size(60, 15);
        lblRtspPort.TabIndex = 3;
        lblRtspPort.Text = "RTSP port";
        //
        // txtLocalPort
        //
        txtLocalPort.BackColor = Color.White;
        txtLocalPort.ForeColor = Color.FromArgb(20, 22, 26);
        txtLocalPort.Location = new Point(534, 15);
        txtLocalPort.Name = "txtLocalPort";
        txtLocalPort.Size = new Size(60, 23);
        txtLocalPort.TabIndex = 4;
        txtLocalPort.Text = "8554";
        //
        // chkLoopback
        //
        chkLoopback.AutoSize = true;
        chkLoopback.Checked = true;
        chkLoopback.CheckState = CheckState.Checked;
        chkLoopback.ForeColor = Color.White;
        chkLoopback.Location = new Point(608, 17);
        chkLoopback.Name = "chkLoopback";
        chkLoopback.Size = new Size(80, 19);
        chkLoopback.TabIndex = 5;
        chkLoopback.Text = "Loopback";
        chkLoopback.UseVisualStyleBackColor = false;
        //
        // lblHost
        //
        lblHost.AutoSize = true;
        lblHost.ForeColor = Color.FromArgb(180, 220, 255);
        lblHost.Location = new Point(694, 18);
        lblHost.Name = "lblHost";
        lblHost.Size = new Size(70, 15);
        lblHost.TabIndex = 6;
        lblHost.Text = "Host: ...";
        //
        // btnRefresh
        //
        btnRefresh.Location = new Point(820, 12);
        btnRefresh.Name = "btnRefresh";
        btnRefresh.Size = new Size(140, 30);
        btnRefresh.TabIndex = 7;
        btnRefresh.Text = "Refresh devices";
        btnRefresh.UseVisualStyleBackColor = true;
        btnRefresh.Click += btnRefresh_Click;
        //
        // btnCallToggle
        //
        btnCallToggle.Location = new Point(968, 12);
        btnCallToggle.Name = "btnCallToggle";
        btnCallToggle.Size = new Size(120, 30);
        btnCallToggle.TabIndex = 8;
        btnCallToggle.Text = "Start call";
        btnCallToggle.UseVisualStyleBackColor = true;
        btnCallToggle.Click += btnCallToggle_Click;
        //
        // lblCamera
        //
        lblCamera.AutoSize = true;
        lblCamera.ForeColor = Color.White;
        lblCamera.Location = new Point(15, 55);
        lblCamera.Name = "lblCamera";
        lblCamera.Size = new Size(51, 15);
        lblCamera.TabIndex = 10;
        lblCamera.Text = "Camera";
        //
        // cboVideo
        //
        cboVideo.BackColor = Color.White;
        cboVideo.DropDownStyle = ComboBoxStyle.DropDownList;
        cboVideo.ForeColor = Color.FromArgb(20, 22, 26);
        cboVideo.FormattingEnabled = true;
        cboVideo.Location = new Point(72, 52);
        cboVideo.Name = "cboVideo";
        cboVideo.Size = new Size(280, 23);
        cboVideo.TabIndex = 11;
        //
        // lblMic
        //
        lblMic.AutoSize = true;
        lblMic.ForeColor = Color.White;
        lblMic.Location = new Point(370, 55);
        lblMic.Name = "lblMic";
        lblMic.Size = new Size(28, 15);
        lblMic.TabIndex = 12;
        lblMic.Text = "Mic";
        //
        // cboAudio
        //
        cboAudio.BackColor = Color.White;
        cboAudio.DropDownStyle = ComboBoxStyle.DropDownList;
        cboAudio.ForeColor = Color.FromArgb(20, 22, 26);
        cboAudio.FormattingEnabled = true;
        cboAudio.Location = new Point(404, 52);
        cboAudio.Name = "cboAudio";
        cboAudio.Size = new Size(240, 23);
        cboAudio.TabIndex = 13;
        //
        // lblState
        //
        lblState.AutoSize = true;
        lblState.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblState.ForeColor = Color.White;
        lblState.Location = new Point(660, 55);
        lblState.Name = "lblState";
        lblState.Size = new Size(70, 15);
        lblState.TabIndex = 14;
        lblState.Text = "State: Idle";
        //
        // lblTheme
        //
        lblTheme.AutoSize = true;
        lblTheme.ForeColor = Color.White;
        lblTheme.Location = new Point(800, 55);
        lblTheme.Name = "lblTheme";
        lblTheme.Size = new Size(42, 15);
        lblTheme.TabIndex = 15;
        lblTheme.Text = "Theme";
        //
        // cboTheme
        //
        cboTheme.BackColor = Color.White;
        cboTheme.DropDownStyle = ComboBoxStyle.DropDownList;
        cboTheme.ForeColor = Color.FromArgb(20, 22, 26);
        cboTheme.FormattingEnabled = true;
        cboTheme.Location = new Point(848, 52);
        cboTheme.Name = "cboTheme";
        cboTheme.Size = new Size(80, 23);
        cboTheme.TabIndex = 16;
        cboTheme.SelectedIndexChanged += cboTheme_SelectedIndexChanged;
        //
        // lblLanguage
        //
        lblLanguage.AutoSize = true;
        lblLanguage.ForeColor = Color.White;
        lblLanguage.Location = new Point(940, 55);
        lblLanguage.Name = "lblLanguage";
        lblLanguage.Size = new Size(59, 15);
        lblLanguage.TabIndex = 17;
        lblLanguage.Text = "Language";
        //
        // cboLanguage
        //
        cboLanguage.BackColor = Color.White;
        cboLanguage.DropDownStyle = ComboBoxStyle.DropDownList;
        cboLanguage.ForeColor = Color.FromArgb(20, 22, 26);
        cboLanguage.FormattingEnabled = true;
        cboLanguage.Location = new Point(1005, 52);
        cboLanguage.Name = "cboLanguage";
        cboLanguage.Size = new Size(82, 23);
        cboLanguage.TabIndex = 18;
        cboLanguage.SelectedIndexChanged += cboLanguage_SelectedIndexChanged;
        //
        // lblHint
        //
        lblHint.ForeColor = Color.Silver;
        lblHint.Location = new Point(15, 88);
        lblHint.Name = "lblHint";
        lblHint.Size = new Size(1060, 30);
        lblHint.TabIndex = 19;
        lblHint.Text = "Local sim: start RTSPDeviceSimWinV10 first, then Local sim + Start call. Use (test pattern) if only one webcam.";
        //
        // panelMain
        //
        panelMain.Controls.Add(panelSide);
        panelMain.Controls.Add(panelVideo);
        panelMain.Dock = DockStyle.Fill;
        panelMain.Location = new Point(0, 130);
        panelMain.Name = "panelMain";
        panelMain.Padding = new Padding(12, 8, 12, 8);
        panelMain.Size = new Size(1100, 410);
        panelMain.TabIndex = 1;
        //
        // panelVideo
        //
        panelVideo.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        panelVideo.BackColor = Color.FromArgb(17, 18, 20);
        panelVideo.Controls.Add(lblVideoTitle);
        panelVideo.Location = new Point(12, 8);
        panelVideo.Name = "panelVideo";
        panelVideo.Size = new Size(720, 394);
        panelVideo.TabIndex = 0;
        //
        // lblVideoTitle
        //
        lblVideoTitle.AutoSize = true;
        lblVideoTitle.ForeColor = Color.Silver;
        lblVideoTitle.Location = new Point(10, 8);
        lblVideoTitle.Name = "lblVideoTitle";
        lblVideoTitle.Size = new Size(150, 15);
        lblVideoTitle.TabIndex = 0;
        lblVideoTitle.Text = "Remote (device / simulator)";
        //
        // panelSide
        //
        panelSide.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Right;
        panelSide.BackColor = Color.FromArgb(17, 18, 20);
        panelSide.Controls.Add(lblPorts);
        panelSide.Controls.Add(lblSessionId);
        panelSide.Controls.Add(lblLocalRtsp);
        panelSide.Controls.Add(lblDeviceRtsp);
        panelSide.Controls.Add(lblSessionTitle);
        panelSide.Location = new Point(750, 8);
        panelSide.Name = "panelSide";
        panelSide.Padding = new Padding(12);
        panelSide.Size = new Size(338, 394);
        panelSide.TabIndex = 1;
        //
        // lblSessionTitle
        //
        lblSessionTitle.AutoSize = true;
        lblSessionTitle.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblSessionTitle.ForeColor = Color.White;
        lblSessionTitle.Location = new Point(12, 12);
        lblSessionTitle.Name = "lblSessionTitle";
        lblSessionTitle.Size = new Size(53, 15);
        lblSessionTitle.TabIndex = 0;
        lblSessionTitle.Text = "Session";
        //
        // lblDeviceRtsp
        //
        lblDeviceRtsp.ForeColor = Color.FromArgb(160, 230, 255);
        lblDeviceRtsp.Location = new Point(12, 40);
        lblDeviceRtsp.Name = "lblDeviceRtsp";
        lblDeviceRtsp.Size = new Size(310, 40);
        lblDeviceRtsp.TabIndex = 1;
        //
        // lblLocalRtsp
        //
        lblLocalRtsp.ForeColor = Color.FromArgb(160, 230, 255);
        lblLocalRtsp.Location = new Point(12, 85);
        lblLocalRtsp.Name = "lblLocalRtsp";
        lblLocalRtsp.Size = new Size(310, 40);
        lblLocalRtsp.TabIndex = 2;
        //
        // lblSessionId
        //
        lblSessionId.ForeColor = Color.White;
        lblSessionId.Location = new Point(12, 130);
        lblSessionId.Name = "lblSessionId";
        lblSessionId.Size = new Size(310, 30);
        lblSessionId.TabIndex = 3;
        //
        // lblPorts
        //
        lblPorts.ForeColor = Color.FromArgb(220, 230, 240);
        lblPorts.Location = new Point(12, 180);
        lblPorts.Name = "lblPorts";
        lblPorts.Size = new Size(310, 80);
        lblPorts.TabIndex = 4;
        lblPorts.Text = "Ports (same PC)\r\nPC RTSP: 8554/pc\r\nDevice sim RTSP: 8555/device\r\nSignaling: 8080";
        //
        // panelLog
        //
        panelLog.BackColor = Color.FromArgb(43, 45, 49);
        panelLog.Controls.Add(txtLog);
        panelLog.Controls.Add(lblLogTitle);
        panelLog.Dock = DockStyle.Bottom;
        panelLog.Location = new Point(0, 540);
        panelLog.Name = "panelLog";
        panelLog.Padding = new Padding(12);
        panelLog.Size = new Size(1100, 160);
        panelLog.TabIndex = 2;
        //
        // lblLogTitle
        //
        lblLogTitle.AutoSize = true;
        lblLogTitle.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblLogTitle.ForeColor = Color.White;
        lblLogTitle.Location = new Point(12, 10);
        lblLogTitle.Name = "lblLogTitle";
        lblLogTitle.Size = new Size(28, 15);
        lblLogTitle.TabIndex = 0;
        lblLogTitle.Text = "Log";
        //
        // txtLog
        //
        txtLog.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        txtLog.BackColor = Color.White;
        txtLog.Font = new Font("Consolas", 9F);
        txtLog.ForeColor = Color.FromArgb(20, 22, 26);
        txtLog.Location = new Point(12, 32);
        txtLog.Multiline = true;
        txtLog.Name = "txtLog";
        txtLog.ReadOnly = true;
        txtLog.ScrollBars = ScrollBars.Vertical;
        txtLog.Size = new Size(1076, 116);
        txtLog.TabIndex = 1;
        //
        // MainForm
        //
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        BackColor = Color.FromArgb(30, 31, 34);
        ClientSize = new Size(1100, 700);
        Controls.Add(panelMain);
        Controls.Add(panelLog);
        Controls.Add(panelTop);
        MinimumSize = new Size(900, 560);
        Name = "MainForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "RTSP Client Win V10 — LAN Video Call";
        panelTop.ResumeLayout(false);
        panelTop.PerformLayout();
        panelMain.ResumeLayout(false);
        panelVideo.ResumeLayout(false);
        panelVideo.PerformLayout();
        panelSide.ResumeLayout(false);
        panelSide.PerformLayout();
        panelLog.ResumeLayout(false);
        panelLog.PerformLayout();
        ResumeLayout(false);
    }

    #endregion

    private Panel panelTop;
    private Label lblDeviceUrl;
    private TextBox txtDeviceUrl;
    private Button btnLocalSim;
    private Label lblRtspPort;
    private TextBox txtLocalPort;
    private CheckBox chkLoopback;
    private Label lblHost;
    private Button btnRefresh;
    private Button btnCallToggle;
    private Label lblCamera;
    private ComboBox cboVideo;
    private Label lblMic;
    private ComboBox cboAudio;
    private Label lblState;
    private Label lblTheme;
    private ComboBox cboTheme;
    private Label lblLanguage;
    private ComboBox cboLanguage;
    private Label lblHint;
    private Panel panelMain;
    private Panel panelVideo;
    private Label lblVideoTitle;
    private Panel panelSide;
    private Label lblSessionTitle;
    private Label lblDeviceRtsp;
    private Label lblLocalRtsp;
    private Label lblSessionId;
    private Label lblPorts;
    private Panel panelLog;
    private Label lblLogTitle;
    private TextBox txtLog;
}
