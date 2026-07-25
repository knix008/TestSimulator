#nullable disable
namespace RTSPDeviceSimWinV10;

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
        lblSignaling = new Label();
        txtSignalingPort = new TextBox();
        lblRtsp = new Label();
        txtRtspPort = new TextBox();
        chkLoopback = new CheckBox();
        btnStartStop = new Button();
        lblSource = new Label();
        cboVideo = new ComboBox();
        lblStatus = new Label();
        btnRefresh = new Button();
        lblTheme = new Label();
        cboTheme = new ComboBox();
        lblLanguage = new Label();
        cboLanguage = new ComboBox();
        panelMain = new Panel();
        panelVideo = new Panel();
        lblVideoTitle = new Label();
        panelSide = new Panel();
        lblHowTo = new Label();
        lblHowToBody = new Label();
        lblDeviceUrl = new Label();
        lblPcUrl = new Label();
        panelLog = new Panel();
        lblLog = new Label();
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
        panelTop.BackColor = Color.FromArgb(36, 52, 71);
        panelTop.Controls.Add(cboLanguage);
        panelTop.Controls.Add(lblLanguage);
        panelTop.Controls.Add(cboTheme);
        panelTop.Controls.Add(lblTheme);
        panelTop.Controls.Add(btnRefresh);
        panelTop.Controls.Add(lblStatus);
        panelTop.Controls.Add(cboVideo);
        panelTop.Controls.Add(lblSource);
        panelTop.Controls.Add(btnStartStop);
        panelTop.Controls.Add(chkLoopback);
        panelTop.Controls.Add(txtRtspPort);
        panelTop.Controls.Add(lblRtsp);
        panelTop.Controls.Add(txtSignalingPort);
        panelTop.Controls.Add(lblSignaling);
        panelTop.Dock = DockStyle.Top;
        panelTop.Location = new Point(0, 0);
        panelTop.Name = "panelTop";
        panelTop.Size = new Size(1280, 110);
        panelTop.TabIndex = 0;
        //
        // lblSignaling
        //
        lblSignaling.AutoSize = true;
        lblSignaling.ForeColor = Color.White;
        lblSignaling.Location = new Point(12, 18);
        lblSignaling.Name = "lblSignaling";
        lblSignaling.Size = new Size(88, 15);
        lblSignaling.TabIndex = 0;
        lblSignaling.Text = "Signaling port";
        //
        // txtSignalingPort
        //
        txtSignalingPort.BackColor = Color.White;
        txtSignalingPort.ForeColor = Color.FromArgb(20, 22, 26);
        txtSignalingPort.Location = new Point(106, 15);
        txtSignalingPort.Name = "txtSignalingPort";
        txtSignalingPort.Size = new Size(60, 23);
        txtSignalingPort.TabIndex = 1;
        txtSignalingPort.Text = "8080";
        //
        // lblRtsp
        //
        lblRtsp.AutoSize = true;
        lblRtsp.ForeColor = Color.White;
        lblRtsp.Location = new Point(180, 18);
        lblRtsp.Name = "lblRtsp";
        lblRtsp.Size = new Size(60, 15);
        lblRtsp.TabIndex = 2;
        lblRtsp.Text = "RTSP port";
        //
        // txtRtspPort
        //
        txtRtspPort.BackColor = Color.White;
        txtRtspPort.ForeColor = Color.FromArgb(20, 22, 26);
        txtRtspPort.Location = new Point(246, 15);
        txtRtspPort.Name = "txtRtspPort";
        txtRtspPort.Size = new Size(60, 23);
        txtRtspPort.TabIndex = 3;
        txtRtspPort.Text = "8555";
        //
        // chkLoopback
        //
        chkLoopback.AutoSize = true;
        chkLoopback.Checked = true;
        chkLoopback.CheckState = CheckState.Checked;
        chkLoopback.ForeColor = Color.White;
        chkLoopback.Location = new Point(320, 17);
        chkLoopback.Name = "chkLoopback";
        chkLoopback.Size = new Size(145, 19);
        chkLoopback.TabIndex = 4;
        chkLoopback.Text = "Loopback (127.0.0.1)";
        chkLoopback.UseVisualStyleBackColor = false;
        //
        // btnStartStop
        //
        btnStartStop.Location = new Point(490, 12);
        btnStartStop.Name = "btnStartStop";
        btnStartStop.Size = new Size(180, 32);
        btnStartStop.TabIndex = 5;
        btnStartStop.Text = "Start simulator";
        btnStartStop.UseVisualStyleBackColor = true;
        btnStartStop.Click += btnStartStop_Click;
        //
        // lblSource
        //
        lblSource.AutoSize = true;
        lblSource.ForeColor = Color.White;
        lblSource.Location = new Point(12, 55);
        lblSource.Name = "lblSource";
        lblSource.Size = new Size(44, 15);
        lblSource.TabIndex = 7;
        lblSource.Text = "Source";
        //
        // cboVideo
        //
        cboVideo.BackColor = Color.White;
        cboVideo.DropDownStyle = ComboBoxStyle.DropDownList;
        cboVideo.ForeColor = Color.FromArgb(20, 22, 26);
        cboVideo.FormattingEnabled = true;
        cboVideo.Location = new Point(62, 52);
        cboVideo.Name = "cboVideo";
        cboVideo.Size = new Size(280, 23);
        cboVideo.TabIndex = 8;
        //
        // lblStatus
        //
        lblStatus.AutoSize = true;
        lblStatus.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblStatus.ForeColor = Color.White;
        lblStatus.Location = new Point(360, 55);
        lblStatus.Name = "lblStatus";
        lblStatus.Size = new Size(100, 15);
        lblStatus.TabIndex = 9;
        lblStatus.Text = "Status: stopped";
        //
        // btnRefresh
        //
        btnRefresh.Location = new Point(680, 12);
        btnRefresh.Name = "btnRefresh";
        btnRefresh.Size = new Size(170, 32);
        btnRefresh.TabIndex = 10;
        btnRefresh.Text = "Refresh devices";
        btnRefresh.UseVisualStyleBackColor = true;
        btnRefresh.Click += btnRefresh_Click;
        //
        // lblTheme
        //
        lblTheme.AutoSize = true;
        lblTheme.ForeColor = Color.White;
        lblTheme.Location = new Point(700, 55);
        lblTheme.Name = "lblTheme";
        lblTheme.Size = new Size(42, 15);
        lblTheme.TabIndex = 11;
        lblTheme.Text = "Theme";
        //
        // cboTheme
        //
        cboTheme.BackColor = Color.White;
        cboTheme.DropDownStyle = ComboBoxStyle.DropDownList;
        cboTheme.ForeColor = Color.FromArgb(20, 22, 26);
        cboTheme.FormattingEnabled = true;
        cboTheme.Location = new Point(748, 52);
        cboTheme.Name = "cboTheme";
        cboTheme.Size = new Size(80, 23);
        cboTheme.TabIndex = 12;
        cboTheme.SelectedIndexChanged += cboTheme_SelectedIndexChanged;
        //
        // lblLanguage
        //
        lblLanguage.AutoSize = true;
        lblLanguage.ForeColor = Color.White;
        lblLanguage.Location = new Point(840, 55);
        lblLanguage.Name = "lblLanguage";
        lblLanguage.Size = new Size(59, 15);
        lblLanguage.TabIndex = 13;
        lblLanguage.Text = "Language";
        //
        // cboLanguage
        //
        cboLanguage.BackColor = Color.White;
        cboLanguage.DropDownStyle = ComboBoxStyle.DropDownList;
        cboLanguage.ForeColor = Color.FromArgb(20, 22, 26);
        cboLanguage.FormattingEnabled = true;
        cboLanguage.Location = new Point(905, 52);
        cboLanguage.Name = "cboLanguage";
        cboLanguage.Size = new Size(82, 23);
        cboLanguage.TabIndex = 14;
        cboLanguage.SelectedIndexChanged += cboLanguage_SelectedIndexChanged;
        //
        // panelMain
        //
        panelMain.Controls.Add(panelSide);
        panelMain.Controls.Add(panelVideo);
        panelMain.Dock = DockStyle.Fill;
        panelMain.Location = new Point(0, 110);
        panelMain.Name = "panelMain";
        panelMain.Padding = new Padding(12, 8, 12, 8);
        panelMain.Size = new Size(1280, 430);
        panelMain.TabIndex = 1;
        //
        // panelVideo
        //
        panelVideo.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        panelVideo.BackColor = Color.FromArgb(15, 22, 32);
        panelVideo.Controls.Add(lblVideoTitle);
        panelVideo.Location = new Point(12, 8);
        panelVideo.Name = "panelVideo";
        panelVideo.Size = new Size(640, 374);
        panelVideo.TabIndex = 0;
        //
        // lblVideoTitle
        //
        lblVideoTitle.AutoSize = true;
        lblVideoTitle.ForeColor = Color.Silver;
        lblVideoTitle.Location = new Point(10, 8);
        lblVideoTitle.Name = "lblVideoTitle";
        lblVideoTitle.Size = new Size(108, 15);
        lblVideoTitle.TabIndex = 0;
        lblVideoTitle.Text = "Local preview (device source)";
        //
        // panelSide
        //
        panelSide.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Right;
        panelSide.BackColor = Color.FromArgb(15, 22, 32);
        panelSide.Controls.Add(lblPcUrl);
        panelSide.Controls.Add(lblDeviceUrl);
        panelSide.Controls.Add(lblHowToBody);
        panelSide.Controls.Add(lblHowTo);
        panelSide.Location = new Point(670, 8);
        panelSide.Name = "panelSide";
        panelSide.Padding = new Padding(12);
        panelSide.Size = new Size(318, 374);
        panelSide.TabIndex = 1;
        //
        // lblHowTo
        //
        lblHowTo.AutoSize = true;
        lblHowTo.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblHowTo.ForeColor = Color.White;
        lblHowTo.Location = new Point(12, 12);
        lblHowTo.Name = "lblHowTo";
        lblHowTo.Size = new Size(140, 15);
        lblHowTo.TabIndex = 0;
        lblHowTo.Text = "How to test (same PC)";
        //
        // lblHowToBody
        //
        lblHowToBody.ForeColor = Color.FromArgb(220, 230, 240);
        lblHowToBody.Location = new Point(12, 40);
        lblHowToBody.Name = "lblHowToBody";
        lblHowToBody.Size = new Size(290, 140);
        lblHowToBody.TabIndex = 1;
        lblHowToBody.Text = "1) Start simulator — local test pattern/camera preview appears.\r\n2) Run RTSPClientWinV10.\r\n3) Device URL = http://127.0.0.1:8080\r\n4) Enable Loopback, Start call (panel switches to PC remote).\r\n\r\nDefault source is (test pattern).";
        //
        // lblDeviceUrl
        //
        lblDeviceUrl.ForeColor = Color.FromArgb(160, 230, 255);
        lblDeviceUrl.Location = new Point(12, 200);
        lblDeviceUrl.Name = "lblDeviceUrl";
        lblDeviceUrl.Size = new Size(290, 50);
        lblDeviceUrl.TabIndex = 2;
        //
        // lblPcUrl
        //
        lblPcUrl.ForeColor = Color.FromArgb(160, 230, 255);
        lblPcUrl.Location = new Point(12, 255);
        lblPcUrl.Name = "lblPcUrl";
        lblPcUrl.Size = new Size(290, 50);
        lblPcUrl.TabIndex = 3;
        //
        // panelLog
        //
        panelLog.BackColor = Color.FromArgb(36, 52, 71);
        panelLog.Controls.Add(txtLog);
        panelLog.Controls.Add(lblLog);
        panelLog.Dock = DockStyle.Bottom;
        panelLog.Location = new Point(0, 480);
        panelLog.Name = "panelLog";
        panelLog.Size = new Size(1000, 160);
        panelLog.TabIndex = 2;
        //
        // lblLog
        //
        lblLog.AutoSize = true;
        lblLog.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        lblLog.ForeColor = Color.White;
        lblLog.Location = new Point(12, 10);
        lblLog.Name = "lblLog";
        lblLog.Size = new Size(28, 15);
        lblLog.TabIndex = 0;
        lblLog.Text = "Log";
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
        txtLog.Size = new Size(976, 116);
        txtLog.TabIndex = 1;
        //
        // MainForm
        //
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        BackColor = Color.FromArgb(26, 35, 50);
        ClientSize = new Size(1280, 740);
        Controls.Add(panelMain);
        Controls.Add(panelLog);
        Controls.Add(panelTop);
        MinimumSize = new Size(1180, 640);
        Name = "MainForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "RTSP Device Simulator — local peer";
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
    private Label lblSignaling;
    private TextBox txtSignalingPort;
    private Label lblRtsp;
    private TextBox txtRtspPort;
    private CheckBox chkLoopback;
    private Button btnStartStop;
    private Label lblSource;
    private ComboBox cboVideo;
    private Label lblStatus;
    private Button btnRefresh;
    private Label lblTheme;
    private ComboBox cboTheme;
    private Label lblLanguage;
    private ComboBox cboLanguage;
    private Panel panelMain;
    private Panel panelVideo;
    private Label lblVideoTitle;
    private Panel panelSide;
    private Label lblHowTo;
    private Label lblHowToBody;
    private Label lblDeviceUrl;
    private Label lblPcUrl;
    private Panel panelLog;
    private Label lblLog;
    private TextBox txtLog;
}
