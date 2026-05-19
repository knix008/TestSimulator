namespace RemoteDesktopWinV10.App;

#nullable disable
public partial class ProfileEditForm
{
    private System.ComponentModel.IContainer components;

    private Panel panelRoot;
    private Panel panelBody;
    private Panel panelButtons;
    private Label labelName;
    private TextBox nameText;
    private Label labelProtocol;
    private ComboBox protocolCombo;
    private Label labelHost;
    private TextBox hostText;
    private Label labelPort;
    private TextBox portText;
    private Label labelUser;
    private TextBox userText;
    private Label labelPassword;
    private TextBox passwordText;
    private GroupBox groupRdp;
    private CheckBox credSspCheck;
    private CheckBox nlaCheck;
    private CheckBox relaxedCertCheck;
    private CheckBox rdpClipboardCheck;
    private CheckBox rdpDrivesCheck;
    private CheckBox rdpPrintersCheck;
    private GroupBox groupVnc;
    private CheckBox vncViewOnlyCheck;
    private CheckBox vncShareDesktopCheck;
    private CheckBox vncClipFromServerCheck;
    private CheckBox vncClipToServerCheck;
    private CheckBox vncRemoteCursorCheck;
    private CheckBox vncAutoReconnectCheck;
    private Label labelVncSizeMode;
    private ComboBox vncSizeModeCombo;
    private Label labelVncMaxFps;
    private ComboBox vncMaxFpsCombo;
    private CheckBox vncUseTlsCheck;
    private CheckBox vncIgnoreTlsCertCheck;
    private FlowLayoutPanel flowButtons;
    private Button buttonOk;
    private Button buttonCancel;

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
        panelRoot = new Panel();
        panelBody = new Panel();
        panelButtons = new Panel();
        labelName = new Label();
        nameText = new TextBox();
        labelProtocol = new Label();
        protocolCombo = new ComboBox();
        labelHost = new Label();
        hostText = new TextBox();
        labelPort = new Label();
        portText = new TextBox();
        labelUser = new Label();
        userText = new TextBox();
        labelPassword = new Label();
        passwordText = new TextBox();
        groupRdp = new GroupBox();
        credSspCheck = new CheckBox();
        nlaCheck = new CheckBox();
        relaxedCertCheck = new CheckBox();
        rdpClipboardCheck = new CheckBox();
        rdpDrivesCheck = new CheckBox();
        rdpPrintersCheck = new CheckBox();
        groupVnc = new GroupBox();
        vncViewOnlyCheck = new CheckBox();
        vncShareDesktopCheck = new CheckBox();
        vncClipFromServerCheck = new CheckBox();
        vncClipToServerCheck = new CheckBox();
        vncRemoteCursorCheck = new CheckBox();
        vncAutoReconnectCheck = new CheckBox();
        labelVncSizeMode = new Label();
        vncSizeModeCombo = new ComboBox();
        labelVncMaxFps = new Label();
        vncMaxFpsCombo = new ComboBox();
        vncUseTlsCheck = new CheckBox();
        vncIgnoreTlsCertCheck = new CheckBox();
        flowButtons = new FlowLayoutPanel();
        buttonOk = new Button();
        buttonCancel = new Button();
        panelRoot.SuspendLayout();
        panelBody.SuspendLayout();
        panelButtons.SuspendLayout();
        groupRdp.SuspendLayout();
        groupVnc.SuspendLayout();
        flowButtons.SuspendLayout();
        SuspendLayout();
        //
        // panelRoot
        //
        panelRoot.Controls.Add(panelButtons);
        panelRoot.Controls.Add(panelBody);
        panelRoot.Dock = DockStyle.Fill;
        panelRoot.Name = "panelRoot";
        panelRoot.Padding = new Padding(12);
        //
        // panelButtons
        //
        panelButtons.Controls.Add(flowButtons);
        panelButtons.Dock = DockStyle.Bottom;
        panelButtons.Name = "panelButtons";
        panelButtons.Padding = new Padding(0, 8, 0, 0);
        panelButtons.Size = new Size(456, 52);
        panelButtons.TabIndex = 1;
        //
        // flowButtons
        //
        flowButtons.AutoSize = true;
        flowButtons.Controls.Add(buttonOk);
        flowButtons.Controls.Add(buttonCancel);
        flowButtons.Dock = DockStyle.Right;
        flowButtons.FlowDirection = FlowDirection.RightToLeft;
        flowButtons.Location = new Point(232, 8);
        flowButtons.Name = "flowButtons";
        flowButtons.Padding = new Padding(0, 4, 0, 0);
        flowButtons.Size = new Size(224, 36);
        flowButtons.TabIndex = 0;
        //
        // buttonOk
        //
        buttonOk.Location = new Point(118, 4);
        buttonOk.Name = "buttonOk";
        buttonOk.Size = new Size(87, 28);
        buttonOk.TabIndex = 0;
        buttonOk.Text = "확인";
        buttonOk.UseVisualStyleBackColor = true;
        buttonOk.Click += buttonOk_Click;
        //
        // buttonCancel
        //
        buttonCancel.DialogResult = DialogResult.Cancel;
        buttonCancel.Location = new Point(25, 4);
        buttonCancel.Name = "buttonCancel";
        buttonCancel.Size = new Size(87, 28);
        buttonCancel.TabIndex = 1;
        buttonCancel.Text = "취소";
        buttonCancel.UseVisualStyleBackColor = true;
        buttonCancel.Click += buttonCancel_Click;
        //
        // panelBody
        //
        panelBody.AutoScroll = true;
        panelBody.Controls.Add(groupVnc);
        panelBody.Controls.Add(groupRdp);
        panelBody.Controls.Add(passwordText);
        panelBody.Controls.Add(labelPassword);
        panelBody.Controls.Add(userText);
        panelBody.Controls.Add(labelUser);
        panelBody.Controls.Add(portText);
        panelBody.Controls.Add(labelPort);
        panelBody.Controls.Add(hostText);
        panelBody.Controls.Add(labelHost);
        panelBody.Controls.Add(protocolCombo);
        panelBody.Controls.Add(labelProtocol);
        panelBody.Controls.Add(nameText);
        panelBody.Controls.Add(labelName);
        panelBody.Dock = DockStyle.Fill;
        panelBody.Name = "panelBody";
        panelBody.Padding = new Padding(4, 4, 4, 8);
        //
        // labelName
        //
        labelName.AutoSize = true;
        labelName.Location = new Point(8, 12);
        labelName.Name = "labelName";
        labelName.Size = new Size(67, 15);
        labelName.TabIndex = 0;
        labelName.Text = "프로필 이름";
        //
        // nameText
        //
        nameText.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        nameText.Location = new Point(112, 8);
        nameText.Name = "nameText";
        nameText.Size = new Size(320, 23);
        nameText.TabIndex = 1;
        //
        // labelProtocol
        //
        labelProtocol.AutoSize = true;
        labelProtocol.Location = new Point(8, 44);
        labelProtocol.Name = "labelProtocol";
        labelProtocol.Size = new Size(55, 15);
        labelProtocol.TabIndex = 2;
        labelProtocol.Text = "프로토콜";
        //
        // protocolCombo
        //
        protocolCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        protocolCombo.FormattingEnabled = true;
        protocolCombo.Location = new Point(112, 40);
        protocolCombo.Name = "protocolCombo";
        protocolCombo.Size = new Size(120, 23);
        protocolCombo.TabIndex = 3;
        //
        // labelHost
        //
        labelHost.AutoSize = true;
        labelHost.Location = new Point(8, 76);
        labelHost.Name = "labelHost";
        labelHost.Size = new Size(31, 15);
        labelHost.TabIndex = 4;
        labelHost.Text = "서버";
        //
        // hostText
        //
        hostText.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        hostText.Location = new Point(112, 72);
        hostText.Name = "hostText";
        hostText.PlaceholderText = "호스트 또는 IP";
        hostText.Size = new Size(320, 23);
        hostText.TabIndex = 5;
        //
        // labelPort
        //
        labelPort.AutoSize = true;
        labelPort.Location = new Point(8, 108);
        labelPort.Name = "labelPort";
        labelPort.Size = new Size(31, 15);
        labelPort.TabIndex = 6;
        labelPort.Text = "포트";
        //
        // portText
        //
        portText.Location = new Point(112, 104);
        portText.Name = "portText";
        portText.Size = new Size(80, 23);
        portText.TabIndex = 7;
        //
        // labelUser
        //
        labelUser.AutoSize = true;
        labelUser.Location = new Point(8, 140);
        labelUser.Name = "labelUser";
        labelUser.Size = new Size(78, 15);
        labelUser.TabIndex = 8;
        labelUser.Text = "사용자 (RDP)";
        //
        // userText
        //
        userText.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        userText.Location = new Point(112, 136);
        userText.Name = "userText";
        userText.PlaceholderText = "RDP 사용자 (DOMAIN\\user, user@도메인)";
        userText.Size = new Size(320, 23);
        userText.TabIndex = 9;
        //
        // labelPassword
        //
        labelPassword.AutoSize = true;
        labelPassword.Location = new Point(8, 172);
        labelPassword.Name = "labelPassword";
        labelPassword.Size = new Size(31, 15);
        labelPassword.TabIndex = 10;
        labelPassword.Text = "암호";
        //
        // passwordText
        //
        passwordText.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        passwordText.Location = new Point(112, 168);
        passwordText.Name = "passwordText";
        passwordText.Size = new Size(320, 23);
        passwordText.TabIndex = 11;
        passwordText.UseSystemPasswordChar = true;
        //
        // groupRdp
        //
        groupRdp.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        groupRdp.Controls.Add(credSspCheck);
        groupRdp.Controls.Add(nlaCheck);
        groupRdp.Controls.Add(relaxedCertCheck);
        groupRdp.Controls.Add(rdpClipboardCheck);
        groupRdp.Controls.Add(rdpDrivesCheck);
        groupRdp.Controls.Add(rdpPrintersCheck);
        groupRdp.Location = new Point(8, 204);
        groupRdp.Name = "groupRdp";
        groupRdp.Padding = new Padding(8, 4, 8, 8);
        groupRdp.Size = new Size(432, 132);
        groupRdp.TabIndex = 12;
        groupRdp.TabStop = false;
        groupRdp.Text = "RDP 옵션";
        //
        // credSspCheck
        //
        credSspCheck.AutoSize = true;
        credSspCheck.Checked = true;
        credSspCheck.CheckState = CheckState.Checked;
        credSspCheck.Location = new Point(12, 24);
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
        nlaCheck.Location = new Point(100, 24);
        nlaCheck.Name = "nlaCheck";
        nlaCheck.Size = new Size(150, 19);
        nlaCheck.TabIndex = 1;
        nlaCheck.Text = "NLA(보안 계층 협상)";
        nlaCheck.UseVisualStyleBackColor = true;
        //
        // relaxedCertCheck
        //
        relaxedCertCheck.AutoSize = true;
        relaxedCertCheck.Location = new Point(12, 52);
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
        rdpClipboardCheck.Location = new Point(12, 80);
        rdpClipboardCheck.Name = "rdpClipboardCheck";
        rdpClipboardCheck.Size = new Size(104, 19);
        rdpClipboardCheck.TabIndex = 3;
        rdpClipboardCheck.Text = "RDP 클립보드";
        rdpClipboardCheck.UseVisualStyleBackColor = true;
        //
        // rdpDrivesCheck
        //
        rdpDrivesCheck.AutoSize = true;
        rdpDrivesCheck.Location = new Point(130, 80);
        rdpDrivesCheck.Name = "rdpDrivesCheck";
        rdpDrivesCheck.Size = new Size(96, 19);
        rdpDrivesCheck.TabIndex = 4;
        rdpDrivesCheck.Text = "RDP 드라이브";
        rdpDrivesCheck.UseVisualStyleBackColor = true;
        //
        // rdpPrintersCheck
        //
        rdpPrintersCheck.AutoSize = true;
        rdpPrintersCheck.Location = new Point(240, 80);
        rdpPrintersCheck.Name = "rdpPrintersCheck";
        rdpPrintersCheck.Size = new Size(96, 19);
        rdpPrintersCheck.TabIndex = 5;
        rdpPrintersCheck.Text = "RDP 프린터";
        rdpPrintersCheck.UseVisualStyleBackColor = true;
        //
        // groupVnc
        //
        groupVnc.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        groupVnc.Controls.Add(vncViewOnlyCheck);
        groupVnc.Controls.Add(vncShareDesktopCheck);
        groupVnc.Controls.Add(vncClipFromServerCheck);
        groupVnc.Controls.Add(vncClipToServerCheck);
        groupVnc.Controls.Add(vncRemoteCursorCheck);
        groupVnc.Controls.Add(vncAutoReconnectCheck);
        groupVnc.Controls.Add(labelVncSizeMode);
        groupVnc.Controls.Add(vncSizeModeCombo);
        groupVnc.Controls.Add(labelVncMaxFps);
        groupVnc.Controls.Add(vncMaxFpsCombo);
        groupVnc.Controls.Add(vncUseTlsCheck);
        groupVnc.Controls.Add(vncIgnoreTlsCertCheck);
        groupVnc.Location = new Point(8, 204);
        groupVnc.Name = "groupVnc";
        groupVnc.Padding = new Padding(8, 4, 8, 8);
        groupVnc.Size = new Size(432, 156);
        groupVnc.TabIndex = 13;
        groupVnc.TabStop = false;
        groupVnc.Text = "VNC 옵션";
        groupVnc.Visible = false;
        //
        // vncViewOnlyCheck
        //
        vncViewOnlyCheck.AutoSize = true;
        vncViewOnlyCheck.Location = new Point(12, 20);
        vncViewOnlyCheck.Name = "vncViewOnlyCheck";
        vncViewOnlyCheck.TabIndex = 0;
        vncViewOnlyCheck.Text = "화면 전용(뷰 온리)";
        vncViewOnlyCheck.UseVisualStyleBackColor = true;
        //
        // vncShareDesktopCheck
        //
        vncShareDesktopCheck.AutoSize = true;
        vncShareDesktopCheck.Checked = true;
        vncShareDesktopCheck.CheckState = CheckState.Checked;
        vncShareDesktopCheck.Location = new Point(200, 20);
        vncShareDesktopCheck.Name = "vncShareDesktopCheck";
        vncShareDesktopCheck.TabIndex = 1;
        vncShareDesktopCheck.Text = "화면 공유(다중 뷰어)";
        vncShareDesktopCheck.UseVisualStyleBackColor = true;
        //
        // vncClipFromServerCheck
        //
        vncClipFromServerCheck.AutoSize = true;
        vncClipFromServerCheck.Checked = true;
        vncClipFromServerCheck.CheckState = CheckState.Checked;
        vncClipFromServerCheck.Location = new Point(12, 46);
        vncClipFromServerCheck.Name = "vncClipFromServerCheck";
        vncClipFromServerCheck.TabIndex = 2;
        vncClipFromServerCheck.Text = "클립보드 수신(서버→)";
        vncClipFromServerCheck.UseVisualStyleBackColor = true;
        //
        // vncClipToServerCheck
        //
        vncClipToServerCheck.AutoSize = true;
        vncClipToServerCheck.Checked = true;
        vncClipToServerCheck.CheckState = CheckState.Checked;
        vncClipToServerCheck.Location = new Point(200, 46);
        vncClipToServerCheck.Name = "vncClipToServerCheck";
        vncClipToServerCheck.TabIndex = 3;
        vncClipToServerCheck.Text = "클립보드 송신(→서버)";
        vncClipToServerCheck.UseVisualStyleBackColor = true;
        //
        // vncRemoteCursorCheck
        //
        vncRemoteCursorCheck.AutoSize = true;
        vncRemoteCursorCheck.Checked = true;
        vncRemoteCursorCheck.CheckState = CheckState.Checked;
        vncRemoteCursorCheck.Location = new Point(12, 72);
        vncRemoteCursorCheck.Name = "vncRemoteCursorCheck";
        vncRemoteCursorCheck.TabIndex = 4;
        vncRemoteCursorCheck.Text = "원격 커서 표시";
        vncRemoteCursorCheck.UseVisualStyleBackColor = true;
        //
        // vncAutoReconnectCheck
        //
        vncAutoReconnectCheck.AutoSize = true;
        vncAutoReconnectCheck.Location = new Point(200, 72);
        vncAutoReconnectCheck.Name = "vncAutoReconnectCheck";
        vncAutoReconnectCheck.TabIndex = 5;
        vncAutoReconnectCheck.Text = "자동 재연결(실험)";
        vncAutoReconnectCheck.UseVisualStyleBackColor = true;
        //
        // labelVncSizeMode
        //
        labelVncSizeMode.AutoSize = true;
        labelVncSizeMode.Location = new Point(12, 102);
        labelVncSizeMode.Name = "labelVncSizeMode";
        labelVncSizeMode.TabIndex = 6;
        labelVncSizeMode.Text = "화면 맞춤:";
        //
        // vncSizeModeCombo
        //
        vncSizeModeCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        vncSizeModeCombo.FormattingEnabled = true;
        vncSizeModeCombo.Items.AddRange(new object[] { "Zoom", "Stretch", "Clip", "AutoSize", "Center" });
        vncSizeModeCombo.Location = new Point(84, 98);
        vncSizeModeCombo.Name = "vncSizeModeCombo";
        vncSizeModeCombo.Size = new Size(100, 23);
        vncSizeModeCombo.TabIndex = 7;
        //
        // labelVncMaxFps
        //
        labelVncMaxFps.AutoSize = true;
        labelVncMaxFps.Location = new Point(198, 102);
        labelVncMaxFps.Name = "labelVncMaxFps";
        labelVncMaxFps.TabIndex = 8;
        labelVncMaxFps.Text = "최대 FPS:";
        //
        // vncMaxFpsCombo
        //
        vncMaxFpsCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        vncMaxFpsCombo.FormattingEnabled = true;
        vncMaxFpsCombo.Items.AddRange(new object[] { "기본값 (15 fps)", "30 fps", "15 fps", "10 fps", "5 fps" });
        vncMaxFpsCombo.Location = new Point(268, 98);
        vncMaxFpsCombo.Name = "vncMaxFpsCombo";
        vncMaxFpsCombo.Size = new Size(110, 23);
        vncMaxFpsCombo.TabIndex = 9;
        //
        // vncUseTlsCheck
        //
        vncUseTlsCheck.AutoSize = true;
        vncUseTlsCheck.Location = new Point(12, 128);
        vncUseTlsCheck.Name = "vncUseTlsCheck";
        vncUseTlsCheck.TabIndex = 10;
        vncUseTlsCheck.Text = "TLS 암호화 사용";
        vncUseTlsCheck.UseVisualStyleBackColor = true;
        //
        // vncIgnoreTlsCertCheck
        //
        vncIgnoreTlsCertCheck.AutoSize = true;
        vncIgnoreTlsCertCheck.Location = new Point(160, 128);
        vncIgnoreTlsCertCheck.Name = "vncIgnoreTlsCertCheck";
        vncIgnoreTlsCertCheck.TabIndex = 11;
        vncIgnoreTlsCertCheck.Text = "인증서 오류 무시(자체서명)";
        vncIgnoreTlsCertCheck.UseVisualStyleBackColor = true;
        //
        // ProfileEditForm
        //
        AcceptButton = buttonOk;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = buttonCancel;
        ClientSize = new Size(480, 400);
        Controls.Add(panelRoot);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "ProfileEditForm";
        StartPosition = FormStartPosition.CenterParent;
        Text = "프로필";
        panelRoot.ResumeLayout(false);
        panelBody.ResumeLayout(false);
        panelBody.PerformLayout();
        panelButtons.ResumeLayout(false);
        panelButtons.PerformLayout();
        groupRdp.ResumeLayout(false);
        groupRdp.PerformLayout();
        groupVnc.ResumeLayout(false);
        groupVnc.PerformLayout();
        flowButtons.ResumeLayout(false);
        ResumeLayout(false);
        PerformLayout();
    }
}

#nullable restore
