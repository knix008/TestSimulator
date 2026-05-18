namespace VNCServer;

partial class VNCForm
{
    /// <summary>
    ///  Required designer variable.
    /// </summary>
    private System.ComponentModel.IContainer components = null;

    #region Windows Form Designer generated code

    /// <summary>
    ///  Required method for Designer support - do not modify
    ///  the contents of this method with the code editor.
    /// </summary>
    private void InitializeComponent()
    {
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(VNCForm));
        grpStatus = new GroupBox();
        lblConnections = new Label();
        lblPort = new Label();
        lblStatus = new Label();
        lblStatusLabel = new Label();
        grpProfiles = new GroupBox();
        lblProfile = new Label();
        cmbProfiles = new ComboBox();
        btnSaveProfile = new Button();
        btnLoadProfile = new Button();
        btnDeleteProfile = new Button();
        btnResetToDefaults = new Button();
        grpSettings = new GroupBox();
        btnAdvancedSettings = new Button();
        btnSaveSettings = new Button();
        lblPortSetting = new Label();
        numPort = new NumericUpDown();
        lblPassword = new Label();
        txtPassword = new TextBox();
        chkRequirePassword = new CheckBox();
        chkAllowMouse = new CheckBox();
        chkAllowKeyboard = new CheckBox();
        chkAllowMultiple = new CheckBox();
        chkAutoStart = new CheckBox();
        chkMinimizeToTray = new CheckBox();
        lblTransmissionSpeed = new Label();
        trackTransmissionSpeed = new TrackBar();
        lblTransmissionSpeedValue = new Label();
        lblSpeedSlow = new Label();
        lblSpeedFast = new Label();
        grpControl = new GroupBox();
        btnToggleServer = new Button();
        grpLog = new GroupBox();
        lstLog = new ListBox();
        grpStatus.SuspendLayout();
        grpProfiles.SuspendLayout();
        grpSettings.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)numPort).BeginInit();
        ((System.ComponentModel.ISupportInitialize)trackTransmissionSpeed).BeginInit();
        grpControl.SuspendLayout();
        grpLog.SuspendLayout();
        SuspendLayout();
        // 
        // grpStatus
        // 
        grpStatus.Controls.Add(lblConnections);
        grpStatus.Controls.Add(lblPort);
        grpStatus.Controls.Add(lblStatus);
        grpStatus.Controls.Add(lblStatusLabel);
        grpStatus.Location = new Point(12, 12);
        grpStatus.Name = "grpStatus";
        grpStatus.Size = new Size(760, 80);
        grpStatus.TabIndex = 0;
        grpStatus.TabStop = false;
        grpStatus.Text = "상태";
        // 
        // lblConnections
        // 
        lblConnections.AutoSize = true;
        lblConnections.Location = new Point(150, 50);
        lblConnections.Name = "lblConnections";
        lblConnections.Size = new Size(45, 15);
        lblConnections.TabIndex = 3;
        lblConnections.Text = "접속 클라이언트: 0개";
        // 
        // lblPort
        // 
        lblPort.AutoSize = true;
        lblPort.Location = new Point(15, 50);
        lblPort.Name = "lblPort";
        lblPort.Size = new Size(66, 15);
        lblPort.TabIndex = 2;
        lblPort.Text = "포트: 5900";
        // 
        // lblStatus
        // 
        lblStatus.AutoSize = true;
        lblStatus.Font = new Font("맑은 고딕", 9F, FontStyle.Bold);
        lblStatus.ForeColor = Color.Red;
        lblStatus.Location = new Point(65, 30);
        lblStatus.Name = "lblStatus";
        lblStatus.Size = new Size(43, 15);
        lblStatus.TabIndex = 1;
        lblStatus.Text = "중지됨";
        // 
        // lblStatusLabel
        // 
        lblStatusLabel.AutoSize = true;
        lblStatusLabel.Location = new Point(15, 30);
        lblStatusLabel.Name = "lblStatusLabel";
        lblStatusLabel.Size = new Size(34, 15);
        lblStatusLabel.TabIndex = 0;
        lblStatusLabel.Text = "상태:";
        // 
        // grpProfiles
        // 
        grpProfiles.Controls.Add(lblProfile);
        grpProfiles.Controls.Add(cmbProfiles);
        grpProfiles.Controls.Add(btnSaveProfile);
        grpProfiles.Controls.Add(btnLoadProfile);
        grpProfiles.Controls.Add(btnDeleteProfile);
        grpProfiles.Controls.Add(btnResetToDefaults);
        grpProfiles.Location = new Point(12, 98);
        grpProfiles.Name = "grpProfiles";
        grpProfiles.Size = new Size(760, 60);
        grpProfiles.TabIndex = 1;
        grpProfiles.TabStop = false;
        grpProfiles.Text = "프로필 관리";
        // 
        // lblProfile
        // 
        lblProfile.AutoSize = true;
        lblProfile.Location = new Point(15, 25);
        lblProfile.Name = "lblProfile";
        lblProfile.Size = new Size(46, 15);
        lblProfile.TabIndex = 0;
        lblProfile.Text = "프로필:";
        // 
        // cmbProfiles
        // 
        cmbProfiles.DropDownStyle = ComboBoxStyle.DropDownList;
        cmbProfiles.FormattingEnabled = true;
        cmbProfiles.Location = new Point(75, 22);
        cmbProfiles.Name = "cmbProfiles";
        cmbProfiles.Size = new Size(200, 23);
        cmbProfiles.TabIndex = 1;
        // 
        // btnSaveProfile
        // 
        btnSaveProfile.Location = new Point(285, 21);
        btnSaveProfile.Name = "btnSaveProfile";
        btnSaveProfile.Size = new Size(100, 25);
        btnSaveProfile.TabIndex = 2;
        btnSaveProfile.Text = "저장하기";
        btnSaveProfile.UseVisualStyleBackColor = true;
        // 
        // btnLoadProfile
        // 
        btnLoadProfile.Location = new Point(395, 21);
        btnLoadProfile.Name = "btnLoadProfile";
        btnLoadProfile.Size = new Size(100, 25);
        btnLoadProfile.TabIndex = 3;
        btnLoadProfile.Text = "불러오기";
        btnLoadProfile.UseVisualStyleBackColor = true;
        // 
        // btnDeleteProfile
        // 
        btnDeleteProfile.Location = new Point(505, 21);
        btnDeleteProfile.Name = "btnDeleteProfile";
        btnDeleteProfile.Size = new Size(100, 25);
        btnDeleteProfile.TabIndex = 4;
        btnDeleteProfile.Text = "삭제";
        btnDeleteProfile.UseVisualStyleBackColor = true;
        // 
        // btnResetToDefaults
        // 
        btnResetToDefaults.Location = new Point(615, 21);
        btnResetToDefaults.Name = "btnResetToDefaults";
        btnResetToDefaults.Size = new Size(130, 25);
        btnResetToDefaults.TabIndex = 5;
        btnResetToDefaults.Text = "기본값으로 초기화";
        btnResetToDefaults.UseVisualStyleBackColor = true;
        // 
        // grpSettings
        // 
        grpSettings.Controls.Add(btnAdvancedSettings);
        grpSettings.Controls.Add(btnSaveSettings);
        grpSettings.Controls.Add(lblPortSetting);
        grpSettings.Controls.Add(numPort);
        grpSettings.Controls.Add(lblPassword);
        grpSettings.Controls.Add(txtPassword);
        grpSettings.Controls.Add(chkRequirePassword);
        grpSettings.Controls.Add(chkAllowMouse);
        grpSettings.Controls.Add(chkAllowKeyboard);
        grpSettings.Controls.Add(chkAllowMultiple);
        grpSettings.Controls.Add(chkAutoStart);
        grpSettings.Controls.Add(chkMinimizeToTray);
        grpSettings.Location = new Point(12, 248);
        grpSettings.Name = "grpSettings";
        grpSettings.Size = new Size(760, 200);
        grpSettings.TabIndex = 2;
        grpSettings.TabStop = false;
        grpSettings.Text = "기본 설정";
        // 
        // btnAdvancedSettings
        // 
        btnAdvancedSettings.Location = new Point(125, 170);
        btnAdvancedSettings.Name = "btnAdvancedSettings";
        btnAdvancedSettings.Size = new Size(100, 25);
        btnAdvancedSettings.TabIndex = 11;
        btnAdvancedSettings.Text = "고급 설정...";
        btnAdvancedSettings.UseVisualStyleBackColor = true;
        // 
        // btnSaveSettings
        // 
        btnSaveSettings.Location = new Point(15, 170);
        btnSaveSettings.Name = "btnSaveSettings";
        btnSaveSettings.Size = new Size(100, 25);
        btnSaveSettings.TabIndex = 10;
        btnSaveSettings.Text = "설정 저장";
        btnSaveSettings.UseVisualStyleBackColor = true;
        // 
        // lblPortSetting
        // 
        lblPortSetting.AutoSize = true;
        lblPortSetting.Location = new Point(15, 30);
        lblPortSetting.Name = "lblPortSetting";
        lblPortSetting.Size = new Size(34, 15);
        lblPortSetting.TabIndex = 0;
        lblPortSetting.Text = "포트:";
        // 
        // numPort
        // 
        numPort.Location = new Point(100, 27);
        numPort.Maximum = new decimal(new int[] { 65535, 0, 0, 0 });
        numPort.Minimum = new decimal(new int[] { 1024, 0, 0, 0 });
        numPort.Name = "numPort";
        numPort.Size = new Size(120, 23);
        numPort.TabIndex = 1;
        numPort.Value = new decimal(new int[] { 5900, 0, 0, 0 });
        // 
        // lblPassword
        // 
        lblPassword.AutoSize = true;
        lblPassword.Location = new Point(35, 90);
        lblPassword.Name = "lblPassword";
        lblPassword.Size = new Size(58, 15);
        lblPassword.TabIndex = 3;
        lblPassword.Text = "비밀번호:";
        // 
        // txtPassword
        // 
        txtPassword.Location = new Point(100, 87);
        txtPassword.Name = "txtPassword";
        txtPassword.PasswordChar = '*';
        txtPassword.Size = new Size(200, 23);
        txtPassword.TabIndex = 4;
        // 
        // chkRequirePassword
        // 
        chkRequirePassword.AutoSize = true;
        chkRequirePassword.Checked = true;
        chkRequirePassword.CheckState = CheckState.Checked;
        chkRequirePassword.Location = new Point(15, 60);
        chkRequirePassword.Name = "chkRequirePassword";
        chkRequirePassword.Size = new Size(102, 19);
        chkRequirePassword.TabIndex = 2;
        chkRequirePassword.Text = "비밀번호 요구";
        chkRequirePassword.UseVisualStyleBackColor = true;
        // 
        // chkAllowMouse
        // 
        chkAllowMouse.AutoSize = true;
        chkAllowMouse.Checked = true;
        chkAllowMouse.CheckState = CheckState.Checked;
        chkAllowMouse.Location = new Point(15, 120);
        chkAllowMouse.Name = "chkAllowMouse";
        chkAllowMouse.Size = new Size(118, 19);
        chkAllowMouse.TabIndex = 5;
        chkAllowMouse.Text = "마우스 제어 허용";
        chkAllowMouse.UseVisualStyleBackColor = true;
        // 
        // chkAllowKeyboard
        // 
        chkAllowKeyboard.AutoSize = true;
        chkAllowKeyboard.Location = new Point(200, 120);
        chkAllowKeyboard.Name = "chkAllowKeyboard";
        chkAllowKeyboard.Size = new Size(118, 19);
        chkAllowKeyboard.TabIndex = 6;
        chkAllowKeyboard.Text = "키보드 제어 허용";
        chkAllowKeyboard.UseVisualStyleBackColor = true;
        // 
        // chkAllowMultiple
        // 
        chkAllowMultiple.AutoSize = true;
        chkAllowMultiple.Location = new Point(400, 120);
        chkAllowMultiple.Name = "chkAllowMultiple";
        chkAllowMultiple.Size = new Size(106, 19);
        chkAllowMultiple.TabIndex = 7;
        chkAllowMultiple.Text = "다중 연결 허용";
        chkAllowMultiple.UseVisualStyleBackColor = true;
        // 
        // chkAutoStart
        // 
        chkAutoStart.AutoSize = true;
        chkAutoStart.Location = new Point(15, 145);
        chkAutoStart.Name = "chkAutoStart";
        chkAutoStart.Size = new Size(78, 19);
        chkAutoStart.TabIndex = 8;
        chkAutoStart.Text = "자동 시작";
        chkAutoStart.UseVisualStyleBackColor = true;
        // 
        // chkMinimizeToTray
        // 
        chkMinimizeToTray.AutoSize = true;
        chkMinimizeToTray.Checked = true;
        chkMinimizeToTray.CheckState = CheckState.Checked;
        chkMinimizeToTray.Location = new Point(200, 145);
        chkMinimizeToTray.Name = "chkMinimizeToTray";
        chkMinimizeToTray.Size = new Size(114, 19);
        chkMinimizeToTray.TabIndex = 9;
        chkMinimizeToTray.Text = "트레이로 최소화";
        chkMinimizeToTray.UseVisualStyleBackColor = true;
        // 
        // lblTransmissionSpeed
        // 
        lblTransmissionSpeed.AutoSize = true;
        lblTransmissionSpeed.Location = new Point(135, 28);
        lblTransmissionSpeed.Name = "lblTransmissionSpeed";
        lblTransmissionSpeed.Size = new Size(62, 15);
        lblTransmissionSpeed.TabIndex = 1;
        lblTransmissionSpeed.Text = "전송 속도:";
        // 
        // trackTransmissionSpeed
        // 
        trackTransmissionSpeed.LargeChange = 10;
        trackTransmissionSpeed.Location = new Point(210, 16);
        trackTransmissionSpeed.Maximum = 100;
        trackTransmissionSpeed.Minimum = 10;
        trackTransmissionSpeed.Name = "trackTransmissionSpeed";
        trackTransmissionSpeed.Size = new Size(400, 45);
        trackTransmissionSpeed.SmallChange = 5;
        trackTransmissionSpeed.TabIndex = 2;
        trackTransmissionSpeed.TickFrequency = 10;
        trackTransmissionSpeed.TickStyle = TickStyle.Both;
        trackTransmissionSpeed.Value = 100;
        // 
        // lblTransmissionSpeedValue
        // 
        lblTransmissionSpeedValue.AutoSize = true;
        lblTransmissionSpeedValue.Font = new Font("맑은 고딕", 9F, FontStyle.Bold);
        lblTransmissionSpeedValue.Location = new Point(618, 30);
        lblTransmissionSpeedValue.Name = "lblTransmissionSpeedValue";
        lblTransmissionSpeedValue.Size = new Size(39, 15);
        lblTransmissionSpeedValue.TabIndex = 3;
        lblTransmissionSpeedValue.Text = "100%";
        // 
        // lblSpeedSlow
        // 
        lblSpeedSlow.AutoSize = true;
        lblSpeedSlow.ForeColor = Color.Gray;
        lblSpeedSlow.Location = new Point(210, 56);
        lblSpeedSlow.Name = "lblSpeedSlow";
        lblSpeedSlow.Size = new Size(31, 15);
        lblSpeedSlow.TabIndex = 4;
        lblSpeedSlow.Text = "느림";
        // 
        // lblSpeedFast
        // 
        lblSpeedFast.AutoSize = true;
        lblSpeedFast.ForeColor = Color.Gray;
        lblSpeedFast.Location = new Point(575, 56);
        lblSpeedFast.Name = "lblSpeedFast";
        lblSpeedFast.Size = new Size(31, 15);
        lblSpeedFast.TabIndex = 5;
        lblSpeedFast.Text = "빠름";
        // 
        // grpControl
        // 
        grpControl.Controls.Add(lblSpeedFast);
        grpControl.Controls.Add(lblSpeedSlow);
        grpControl.Controls.Add(lblTransmissionSpeedValue);
        grpControl.Controls.Add(trackTransmissionSpeed);
        grpControl.Controls.Add(lblTransmissionSpeed);
        grpControl.Controls.Add(btnToggleServer);
        grpControl.Location = new Point(12, 164);
        grpControl.Name = "grpControl";
        grpControl.Size = new Size(760, 78);
        grpControl.TabIndex = 1;
        grpControl.TabStop = false;
        grpControl.Text = "제어";
        // 
        // btnToggleServer
        // 
        btnToggleServer.FlatAppearance.BorderSize = 0;
        btnToggleServer.FlatStyle = FlatStyle.Flat;
        btnToggleServer.Location = new Point(15, 20);
        btnToggleServer.Name = "btnToggleServer";
        btnToggleServer.Size = new Size(110, 32);
        btnToggleServer.TabIndex = 0;
        btnToggleServer.Text = "서버 시작";
        btnToggleServer.UseVisualStyleBackColor = false;
        btnToggleServer.BackColor = Color.FromArgb(100, 181, 255);
        btnToggleServer.ForeColor = Color.Black;
        // 
        // grpLog
        // 
        grpLog.Controls.Add(lstLog);
        grpLog.Location = new Point(12, 454);
        grpLog.Name = "grpLog";
        grpLog.Size = new Size(760, 180);
        grpLog.TabIndex = 3;
        grpLog.TabStop = false;
        grpLog.Text = "로그";
        // 
        // lstLog
        // 
        lstLog.Dock = DockStyle.Fill;
        lstLog.FormattingEnabled = true;
        lstLog.ItemHeight = 15;
        lstLog.Location = new Point(3, 19);
        lstLog.Name = "lstLog";
        lstLog.Size = new Size(754, 158);
        lstLog.TabIndex = 0;
        // 
        // VNCForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(784, 645);
        Controls.Add(grpLog);
        Controls.Add(grpSettings);
        Controls.Add(grpControl);
        Controls.Add(grpProfiles);
        Controls.Add(grpStatus);
        FormBorderStyle = FormBorderStyle.FixedSingle;
        Icon = (Icon)resources.GetObject("$this.Icon");
        MaximizeBox = false;
        Name = "VNCForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "VNC Server";
        grpStatus.ResumeLayout(false);
        grpStatus.PerformLayout();
        grpProfiles.ResumeLayout(false);
        grpProfiles.PerformLayout();
        grpSettings.ResumeLayout(false);
        grpSettings.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)numPort).EndInit();
        ((System.ComponentModel.ISupportInitialize)trackTransmissionSpeed).EndInit();
        grpControl.ResumeLayout(false);
        grpControl.PerformLayout();
        grpLog.ResumeLayout(false);
        ResumeLayout(false);
    }

    #endregion

    private GroupBox grpStatus;
    private Label lblStatusLabel;
    private Label lblStatus;
    private Label lblPort;
    private Label lblConnections;
    
    private GroupBox grpControl;
    private Button btnToggleServer;
    
    private GroupBox grpProfiles;
    private Label lblProfile;
    private ComboBox cmbProfiles;
    private Button btnSaveProfile;
    private Button btnLoadProfile;
    private Button btnDeleteProfile;
    private Button btnResetToDefaults;
    
    private GroupBox grpSettings;
    private Label lblPortSetting;
    private NumericUpDown numPort;
    private CheckBox chkRequirePassword;
    private Label lblPassword;
    private TextBox txtPassword;
    private CheckBox chkAllowMouse;
    private CheckBox chkAllowKeyboard;
    private CheckBox chkAllowMultiple;
    private CheckBox chkAutoStart;
    private CheckBox chkMinimizeToTray;
    private Button btnSaveSettings;
    private Button btnAdvancedSettings;
    private Label lblTransmissionSpeed;
    private TrackBar trackTransmissionSpeed;
    private Label lblTransmissionSpeedValue;
    private Label lblSpeedSlow;
    private Label lblSpeedFast;
    
    private GroupBox grpLog;
    private ListBox lstLog;
}
