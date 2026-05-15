namespace RemoteDesktopWinV10.App;

#nullable disable
public partial class ConnectionDialog
{
    private System.ComponentModel.IContainer components;

    private GroupBox groupConnection;
    private TableLayoutPanel tableConnection;
    private GroupBox groupRdpOptions;
    private FlowLayoutPanel flowRdpOptions;
    
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
    
    private CheckBox credSspCheck;
    private CheckBox nlaCheck;
    private CheckBox relaxedCertCheck;
    private CheckBox rdpClipboardCheck;
    private CheckBox rdpDrivesCheck;
    private CheckBox rdpPrintersCheck;
    
    private Button connectButton;
    private Button cancelButton;
    private Button saveProfileButton;

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
        groupConnection = new GroupBox();
        tableConnection = new TableLayoutPanel();
        groupRdpOptions = new GroupBox();
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
        credSspCheck = new CheckBox();
        nlaCheck = new CheckBox();
        relaxedCertCheck = new CheckBox();
        rdpClipboardCheck = new CheckBox();
        rdpDrivesCheck = new CheckBox();
        rdpPrintersCheck = new CheckBox();
        connectButton = new Button();
        cancelButton = new Button();
        saveProfileButton = new Button();
        
        groupConnection.SuspendLayout();
        tableConnection.SuspendLayout();
        groupRdpOptions.SuspendLayout();
        flowRdpOptions.SuspendLayout();
        SuspendLayout();
        
        //
        // groupConnection
        //
        groupConnection.Controls.Add(tableConnection);
        groupConnection.Location = new Point(12, 12);
        groupConnection.Name = "groupConnection";
        groupConnection.Padding = new Padding(8);
        groupConnection.Size = new Size(660, 160);
        groupConnection.TabIndex = 0;
        groupConnection.TabStop = false;
        groupConnection.Text = "연결 설정";
        
        //
        // tableConnection
        //
        tableConnection.ColumnCount = 4;
        tableConnection.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        tableConnection.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 40F));
        tableConnection.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        tableConnection.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 60F));
        tableConnection.Controls.Add(labelProfileHead, 0, 0);
        tableConnection.Controls.Add(profilesCombo, 1, 0);
        tableConnection.Controls.Add(labelHistoryHead, 2, 0);
        tableConnection.Controls.Add(historyCombo, 3, 0);
        tableConnection.Controls.Add(labelProtocolHead, 0, 1);
        tableConnection.Controls.Add(protocolCombo, 1, 1);
        tableConnection.Controls.Add(labelHostHead, 2, 1);
        tableConnection.Controls.Add(hostText, 3, 1);
        tableConnection.Controls.Add(labelPortHead, 0, 2);
        tableConnection.Controls.Add(portText, 1, 2);
        tableConnection.Controls.Add(labelUserHead, 2, 2);
        tableConnection.Controls.Add(userText, 3, 2);
        tableConnection.Controls.Add(labelPasswordHead, 2, 3);
        tableConnection.Controls.Add(passwordText, 3, 3);
        tableConnection.Dock = DockStyle.Fill;
        tableConnection.Location = new Point(8, 24);
        tableConnection.Name = "tableConnection";
        tableConnection.RowCount = 4;
        tableConnection.RowStyles.Add(new RowStyle(SizeType.Absolute, 32F));
        tableConnection.RowStyles.Add(new RowStyle(SizeType.Absolute, 32F));
        tableConnection.RowStyles.Add(new RowStyle(SizeType.Absolute, 32F));
        tableConnection.RowStyles.Add(new RowStyle(SizeType.Absolute, 32F));
        tableConnection.Size = new Size(644, 128);
        tableConnection.TabIndex = 0;
        
        //
        // labelProfileHead
        //
        labelProfileHead.Anchor = AnchorStyles.Left;
        labelProfileHead.AutoSize = true;
        labelProfileHead.Location = new Point(3, 8);
        labelProfileHead.Name = "labelProfileHead";
        labelProfileHead.Size = new Size(43, 15);
        labelProfileHead.TabIndex = 0;
        labelProfileHead.Text = "프로필";
        
        //
        // profilesCombo
        //
        profilesCombo.Anchor = AnchorStyles.Left | AnchorStyles.Right;
        profilesCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        profilesCombo.FormattingEnabled = true;
        profilesCombo.Location = new Point(52, 4);
        profilesCombo.Name = "profilesCombo";
        profilesCombo.Size = new Size(200, 23);
        profilesCombo.TabIndex = 1;
        profilesCombo.SelectedIndexChanged += OnProfileSelected;
        
        //
        // labelHistoryHead
        //
        labelHistoryHead.Anchor = AnchorStyles.Left;
        labelHistoryHead.AutoSize = true;
        labelHistoryHead.Location = new Point(258, 8);
        labelHistoryHead.Name = "labelHistoryHead";
        labelHistoryHead.Size = new Size(31, 15);
        labelHistoryHead.TabIndex = 2;
        labelHistoryHead.Text = "최근";
        
        //
        // historyCombo
        //
        historyCombo.Anchor = AnchorStyles.Left | AnchorStyles.Right;
        historyCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        historyCombo.FormattingEnabled = true;
        historyCombo.Location = new Point(295, 4);
        historyCombo.Name = "historyCombo";
        historyCombo.Size = new Size(346, 23);
        historyCombo.TabIndex = 3;
        historyCombo.SelectedIndexChanged += OnHistorySelected;
        
        //
        // labelProtocolHead
        //
        labelProtocolHead.Anchor = AnchorStyles.Left;
        labelProtocolHead.AutoSize = true;
        labelProtocolHead.Location = new Point(3, 40);
        labelProtocolHead.Name = "labelProtocolHead";
        labelProtocolHead.Size = new Size(55, 15);
        labelProtocolHead.TabIndex = 4;
        labelProtocolHead.Text = "프로토콜";
        
        //
        // protocolCombo
        //
        protocolCombo.Anchor = AnchorStyles.Left | AnchorStyles.Right;
        protocolCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        protocolCombo.FormattingEnabled = true;
        protocolCombo.Items.AddRange(new object[] { "RDP", "VNC" });
        protocolCombo.Location = new Point(64, 36);
        protocolCombo.Name = "protocolCombo";
        protocolCombo.Size = new Size(188, 23);
        protocolCombo.TabIndex = 5;
        protocolCombo.SelectedIndexChanged += OnProtocolChanged;
        
        //
        // labelHostHead
        //
        labelHostHead.Anchor = AnchorStyles.Left;
        labelHostHead.AutoSize = true;
        labelHostHead.Location = new Point(258, 40);
        labelHostHead.Name = "labelHostHead";
        labelHostHead.Size = new Size(31, 15);
        labelHostHead.TabIndex = 6;
        labelHostHead.Text = "서버";
        
        //
        // hostText
        //
        hostText.Anchor = AnchorStyles.Left | AnchorStyles.Right;
        hostText.Location = new Point(295, 36);
        hostText.Name = "hostText";
        hostText.PlaceholderText = "호스트 이름 또는 IP";
        hostText.Size = new Size(346, 23);
        hostText.TabIndex = 7;
        
        //
        // labelPortHead
        //
        labelPortHead.Anchor = AnchorStyles.Left;
        labelPortHead.AutoSize = true;
        labelPortHead.Location = new Point(3, 72);
        labelPortHead.Name = "labelPortHead";
        labelPortHead.Size = new Size(31, 15);
        labelPortHead.TabIndex = 8;
        labelPortHead.Text = "포트";
        
        //
        // portText
        //
        portText.Anchor = AnchorStyles.Left | AnchorStyles.Right;
        portText.Location = new Point(40, 68);
        portText.Name = "portText";
        portText.Size = new Size(212, 23);
        portText.TabIndex = 9;
        
        //
        // labelUserHead
        //
        labelUserHead.Anchor = AnchorStyles.Left;
        labelUserHead.AutoSize = true;
        labelUserHead.Location = new Point(258, 72);
        labelUserHead.Name = "labelUserHead";
        labelUserHead.Size = new Size(78, 15);
        labelUserHead.TabIndex = 10;
        labelUserHead.Text = "사용자(RDP)";
        
        //
        // userText
        //
        userText.Anchor = AnchorStyles.Left | AnchorStyles.Right;
        userText.Location = new Point(342, 68);
        userText.Name = "userText";
        userText.PlaceholderText = "DOMAIN\\user, user@도메인";
        userText.Size = new Size(299, 23);
        userText.TabIndex = 11;
        
        //
        // labelPasswordHead
        //
        labelPasswordHead.Anchor = AnchorStyles.Left;
        labelPasswordHead.AutoSize = true;
        labelPasswordHead.Location = new Point(258, 104);
        labelPasswordHead.Name = "labelPasswordHead";
        labelPasswordHead.Size = new Size(31, 15);
        labelPasswordHead.TabIndex = 12;
        labelPasswordHead.Text = "암호";
        
        //
        // passwordText
        //
        passwordText.Anchor = AnchorStyles.Left | AnchorStyles.Right;
        passwordText.Location = new Point(295, 100);
        passwordText.Name = "passwordText";
        passwordText.Size = new Size(346, 23);
        passwordText.TabIndex = 13;
        passwordText.UseSystemPasswordChar = true;
        
        //
        // groupRdpOptions
        //
        groupRdpOptions.Controls.Add(flowRdpOptions);
        groupRdpOptions.Location = new Point(12, 178);
        groupRdpOptions.Name = "groupRdpOptions";
        groupRdpOptions.Padding = new Padding(8);
        groupRdpOptions.Size = new Size(660, 100);
        groupRdpOptions.TabIndex = 1;
        groupRdpOptions.TabStop = false;
        groupRdpOptions.Text = "RDP 옵션";
        
        //
        // flowRdpOptions
        //
        flowRdpOptions.Controls.Add(credSspCheck);
        flowRdpOptions.Controls.Add(nlaCheck);
        flowRdpOptions.Controls.Add(relaxedCertCheck);
        flowRdpOptions.Controls.Add(rdpClipboardCheck);
        flowRdpOptions.Controls.Add(rdpDrivesCheck);
        flowRdpOptions.Controls.Add(rdpPrintersCheck);
        flowRdpOptions.Dock = DockStyle.Fill;
        flowRdpOptions.Location = new Point(8, 24);
        flowRdpOptions.Name = "flowRdpOptions";
        flowRdpOptions.Padding = new Padding(4);
        flowRdpOptions.Size = new Size(644, 68);
        flowRdpOptions.TabIndex = 0;
        flowRdpOptions.WrapContents = true;
        
        //
        // credSspCheck
        //
        credSspCheck.AutoSize = true;
        credSspCheck.Checked = true;
        credSspCheck.CheckState = CheckState.Checked;
        credSspCheck.Location = new Point(7, 7);
        credSspCheck.Margin = new Padding(3, 3, 12, 3);
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
        nlaCheck.Location = new Point(100, 7);
        nlaCheck.Margin = new Padding(3, 3, 12, 3);
        nlaCheck.Name = "nlaCheck";
        nlaCheck.Size = new Size(150, 19);
        nlaCheck.TabIndex = 1;
        nlaCheck.Text = "NLA(보안 계층 협상)";
        nlaCheck.UseVisualStyleBackColor = true;
        
        //
        // relaxedCertCheck
        //
        relaxedCertCheck.AutoSize = true;
        relaxedCertCheck.Checked = true;
        relaxedCertCheck.CheckState = CheckState.Checked;
        relaxedCertCheck.Location = new Point(265, 7);
        relaxedCertCheck.Margin = new Padding(3, 3, 12, 3);
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
        rdpClipboardCheck.Location = new Point(7, 32);
        rdpClipboardCheck.Margin = new Padding(3, 3, 12, 3);
        rdpClipboardCheck.Name = "rdpClipboardCheck";
        rdpClipboardCheck.Size = new Size(104, 19);
        rdpClipboardCheck.TabIndex = 3;
        rdpClipboardCheck.Text = "RDP 클립보드";
        rdpClipboardCheck.UseVisualStyleBackColor = true;
        
        //
        // rdpDrivesCheck
        //
        rdpDrivesCheck.AutoSize = true;
        rdpDrivesCheck.Location = new Point(126, 32);
        rdpDrivesCheck.Margin = new Padding(3, 3, 12, 3);
        rdpDrivesCheck.Name = "rdpDrivesCheck";
        rdpDrivesCheck.Size = new Size(96, 19);
        rdpDrivesCheck.TabIndex = 4;
        rdpDrivesCheck.Text = "RDP 드라이브";
        rdpDrivesCheck.UseVisualStyleBackColor = true;
        
        //
        // rdpPrintersCheck
        //
        rdpPrintersCheck.AutoSize = true;
        rdpPrintersCheck.Location = new Point(237, 32);
        rdpPrintersCheck.Margin = new Padding(3, 3, 12, 3);
        rdpPrintersCheck.Name = "rdpPrintersCheck";
        rdpPrintersCheck.Size = new Size(96, 19);
        rdpPrintersCheck.TabIndex = 5;
        rdpPrintersCheck.Text = "RDP 프린터";
        rdpPrintersCheck.UseVisualStyleBackColor = true;
        
        //
        // saveProfileButton
        //
        saveProfileButton.Location = new Point(12, 290);
        saveProfileButton.Name = "saveProfileButton";
        saveProfileButton.Size = new Size(120, 32);
        saveProfileButton.TabIndex = 1;
        saveProfileButton.Text = "프로필로 저장";
        saveProfileButton.UseVisualStyleBackColor = true;
        saveProfileButton.Click += OnSaveProfileClick;
        
        //
        // connectButton
        //
        connectButton.DialogResult = DialogResult.OK;
        connectButton.Location = new Point(512, 290);
        connectButton.Name = "connectButton";
        connectButton.Size = new Size(80, 32);
        connectButton.TabIndex = 2;
        connectButton.Text = "확인";
        connectButton.UseVisualStyleBackColor = true;
        connectButton.Click += OnConnectClick;
        
        //
        // cancelButton
        //
        cancelButton.DialogResult = DialogResult.Cancel;
        cancelButton.Location = new Point(598, 290);
        cancelButton.Name = "cancelButton";
        cancelButton.Size = new Size(80, 32);
        cancelButton.TabIndex = 3;
        cancelButton.Text = "취소";
        cancelButton.UseVisualStyleBackColor = true;
        cancelButton.Click += OnCancelClick;
        
        //
        // ConnectionDialog
        //
        AcceptButton = connectButton;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        CancelButton = cancelButton;
        ClientSize = new Size(684, 334);
        Controls.Add(groupConnection);
        Controls.Add(groupRdpOptions);
        Controls.Add(saveProfileButton);
        Controls.Add(connectButton);
        Controls.Add(cancelButton);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        Name = "ConnectionDialog";
        StartPosition = FormStartPosition.CenterParent;
        Text = "연결 설정";
        
        groupConnection.ResumeLayout(false);
        tableConnection.ResumeLayout(false);
        tableConnection.PerformLayout();
        groupRdpOptions.ResumeLayout(false);
        groupRdpOptions.PerformLayout();
        flowRdpOptions.ResumeLayout(false);
        flowRdpOptions.PerformLayout();
        ResumeLayout(false);
        
        // Initialize protocol to RDP
        protocolCombo.SelectedIndex = 0;
    }
}
