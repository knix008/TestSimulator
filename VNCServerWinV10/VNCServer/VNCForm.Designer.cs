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
        this.grpStatus = new GroupBox();
        this.lblConnections = new Label();
        this.lblPort = new Label();
        this.lblStatus = new Label();
        this.lblStatusLabel = new Label();
        
        this.grpSettings = new GroupBox();
        this.chkMinimizeToTray = new CheckBox();
        this.chkAutoStart = new CheckBox();
        this.chkAllowMultiple = new CheckBox();
        this.chkAllowMouse = new CheckBox();
        this.chkAllowKeyboard = new CheckBox();
        this.chkRequirePassword = new CheckBox();
        this.txtPassword = new TextBox();
        this.lblPassword = new Label();
        this.numPort = new NumericUpDown();
        this.lblPortSetting = new Label();
        this.btnSaveSettings = new Button();
        
        this.grpControl = new GroupBox();
        this.btnStart = new Button();
        this.btnStop = new Button();
        
        this.grpLog = new GroupBox();
        this.lstLog = new ListBox();
        
        this.grpStatus.SuspendLayout();
        this.grpSettings.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)this.numPort).BeginInit();
        this.grpControl.SuspendLayout();
        this.grpLog.SuspendLayout();
        this.SuspendLayout();
        
        // grpStatus
        this.grpStatus.Controls.Add(this.lblConnections);
        this.grpStatus.Controls.Add(this.lblPort);
        this.grpStatus.Controls.Add(this.lblStatus);
        this.grpStatus.Controls.Add(this.lblStatusLabel);
        this.grpStatus.Location = new Point(12, 12);
        this.grpStatus.Name = "grpStatus";
        this.grpStatus.Size = new Size(760, 80);
        this.grpStatus.TabIndex = 0;
        this.grpStatus.TabStop = false;
        this.grpStatus.Text = "상태";
        
        // lblStatusLabel
        this.lblStatusLabel.AutoSize = true;
        this.lblStatusLabel.Location = new Point(15, 30);
        this.lblStatusLabel.Name = "lblStatusLabel";
        this.lblStatusLabel.Size = new Size(43, 15);
        this.lblStatusLabel.TabIndex = 0;
        this.lblStatusLabel.Text = "상태:";
        
        // lblStatus
        this.lblStatus.AutoSize = true;
        this.lblStatus.Font = new Font("맑은 고딕", 9F, FontStyle.Bold);
        this.lblStatus.ForeColor = Color.Red;
        this.lblStatus.Location = new Point(65, 30);
        this.lblStatus.Name = "lblStatus";
        this.lblStatus.Size = new Size(55, 15);
        this.lblStatus.TabIndex = 1;
        this.lblStatus.Text = "중지됨";
        
        // lblPort
        this.lblPort.AutoSize = true;
        this.lblPort.Location = new Point(15, 50);
        this.lblPort.Name = "lblPort";
        this.lblPort.Size = new Size(67, 15);
        this.lblPort.TabIndex = 2;
        this.lblPort.Text = "포트: 5900";
        
        // lblConnections
        this.lblConnections.AutoSize = true;
        this.lblConnections.Location = new Point(150, 50);
        this.lblConnections.Name = "lblConnections";
        this.lblConnections.Size = new Size(55, 15);
        this.lblConnections.TabIndex = 3;
        this.lblConnections.Text = "연결: 0";
        
        // grpControl
        this.grpControl.Controls.Add(this.btnStart);
        this.grpControl.Controls.Add(this.btnStop);
        this.grpControl.Location = new Point(12, 98);
        this.grpControl.Name = "grpControl";
        this.grpControl.Size = new Size(760, 60);
        this.grpControl.TabIndex = 1;
        this.grpControl.TabStop = false;
        this.grpControl.Text = "제어";
        
        // btnStart
        this.btnStart.Location = new Point(15, 22);
        this.btnStart.Name = "btnStart";
        this.btnStart.Size = new Size(100, 30);
        this.btnStart.TabIndex = 0;
        this.btnStart.Text = "서버 시작";
        this.btnStart.UseVisualStyleBackColor = true;
        this.btnStart.Click += (s, e) => StartServer();
        
        // btnStop
        this.btnStop.Enabled = false;
        this.btnStop.Location = new Point(125, 22);
        this.btnStop.Name = "btnStop";
        this.btnStop.Size = new Size(100, 30);
        this.btnStop.TabIndex = 1;
        this.btnStop.Text = "서버 중지";
        this.btnStop.UseVisualStyleBackColor = true;
        this.btnStop.Click += (s, e) => StopServer();
        
        // grpSettings
        this.grpSettings.Controls.Add(this.btnSaveSettings);
        this.grpSettings.Controls.Add(this.lblPortSetting);
        this.grpSettings.Controls.Add(this.numPort);
        this.grpSettings.Controls.Add(this.lblPassword);
        this.grpSettings.Controls.Add(this.txtPassword);
        this.grpSettings.Controls.Add(this.chkRequirePassword);
        this.grpSettings.Controls.Add(this.chkAllowMouse);
        this.grpSettings.Controls.Add(this.chkAllowKeyboard);
        this.grpSettings.Controls.Add(this.chkAllowMultiple);
        this.grpSettings.Controls.Add(this.chkAutoStart);
        this.grpSettings.Controls.Add(this.chkMinimizeToTray);
        this.grpSettings.Location = new Point(12, 164);
        this.grpSettings.Name = "grpSettings";
        this.grpSettings.Size = new Size(760, 200);
        this.grpSettings.TabIndex = 2;
        this.grpSettings.TabStop = false;
        this.grpSettings.Text = "설정";
        
        // lblPortSetting
        this.lblPortSetting.AutoSize = true;
        this.lblPortSetting.Location = new Point(15, 30);
        this.lblPortSetting.Name = "lblPortSetting";
        this.lblPortSetting.Size = new Size(43, 15);
        this.lblPortSetting.TabIndex = 0;
        this.lblPortSetting.Text = "포트:";
        
        // numPort
        this.numPort.Location = new Point(100, 27);
        this.numPort.Maximum = new decimal(new int[] { 65535, 0, 0, 0 });
        this.numPort.Minimum = new decimal(new int[] { 1024, 0, 0, 0 });
        this.numPort.Name = "numPort";
        this.numPort.Size = new Size(120, 23);
        this.numPort.TabIndex = 1;
        this.numPort.Value = new decimal(new int[] { 5900, 0, 0, 0 });
        this.numPort.ValueChanged += (s, e) => _settings.Port = (int)numPort.Value;
        
        // chkRequirePassword
        this.chkRequirePassword.AutoSize = true;
        this.chkRequirePassword.Checked = true;
        this.chkRequirePassword.CheckState = CheckState.Checked;
        this.chkRequirePassword.Location = new Point(15, 60);
        this.chkRequirePassword.Name = "chkRequirePassword";
        this.chkRequirePassword.Size = new Size(122, 19);
        this.chkRequirePassword.TabIndex = 2;
        this.chkRequirePassword.Text = "비밀번호 요구";
        this.chkRequirePassword.UseVisualStyleBackColor = true;
        this.chkRequirePassword.CheckedChanged += (s, e) => {
            _settings.RequirePassword = chkRequirePassword.Checked;
            txtPassword.Enabled = chkRequirePassword.Checked;
        };
        
        // lblPassword
        this.lblPassword.AutoSize = true;
        this.lblPassword.Location = new Point(35, 90);
        this.lblPassword.Name = "lblPassword";
        this.lblPassword.Size = new Size(59, 15);
        this.lblPassword.TabIndex = 3;
        this.lblPassword.Text = "비밀번호:";
        
        // txtPassword
        this.txtPassword.Location = new Point(100, 87);
        this.txtPassword.Name = "txtPassword";
        this.txtPassword.PasswordChar = '*';
        this.txtPassword.Size = new Size(200, 23);
        this.txtPassword.TabIndex = 4;
        this.txtPassword.TextChanged += (s, e) => _settings.Password = txtPassword.Text;
        
        // chkAllowMouse
        this.chkAllowMouse.AutoSize = true;
        this.chkAllowMouse.Checked = true;
        this.chkAllowMouse.CheckState = CheckState.Checked;
        this.chkAllowMouse.Location = new Point(15, 120);
        this.chkAllowMouse.Name = "chkAllowMouse";
        this.chkAllowMouse.Size = new Size(146, 19);
        this.chkAllowMouse.TabIndex = 5;
        this.chkAllowMouse.Text = "마우스 제어 허용";
        this.chkAllowMouse.UseVisualStyleBackColor = true;
        this.chkAllowMouse.CheckedChanged += (s, e) => _settings.AllowMouseControl = chkAllowMouse.Checked;
        
        // chkAllowKeyboard
        this.chkAllowKeyboard.AutoSize = true;
        this.chkAllowKeyboard.Location = new Point(200, 120);
        this.chkAllowKeyboard.Name = "chkAllowKeyboard";
        this.chkAllowKeyboard.Size = new Size(146, 19);
        this.chkAllowKeyboard.TabIndex = 6;
        this.chkAllowKeyboard.Text = "키보드 제어 허용";
        this.chkAllowKeyboard.UseVisualStyleBackColor = true;
        this.chkAllowKeyboard.CheckedChanged += (s, e) => _settings.AllowKeyboardControl = chkAllowKeyboard.Checked;
        
        // chkAllowMultiple
        this.chkAllowMultiple.AutoSize = true;
        this.chkAllowMultiple.Location = new Point(400, 120);
        this.chkAllowMultiple.Name = "chkAllowMultiple";
        this.chkAllowMultiple.Size = new Size(146, 19);
        this.chkAllowMultiple.TabIndex = 7;
        this.chkAllowMultiple.Text = "다중 연결 허용";
        this.chkAllowMultiple.UseVisualStyleBackColor = true;
        this.chkAllowMultiple.CheckedChanged += (s, e) => _settings.AllowMultipleConnections = chkAllowMultiple.Checked;
        
        // chkAutoStart
        this.chkAutoStart.AutoSize = true;
        this.chkAutoStart.Location = new Point(15, 145);
        this.chkAutoStart.Name = "chkAutoStart";
        this.chkAutoStart.Size = new Size(122, 19);
        this.chkAutoStart.TabIndex = 8;
        this.chkAutoStart.Text = "자동 시작";
        this.chkAutoStart.UseVisualStyleBackColor = true;
        this.chkAutoStart.CheckedChanged += (s, e) => _settings.AutoStart = chkAutoStart.Checked;
        
        // chkMinimizeToTray
        this.chkMinimizeToTray.AutoSize = true;
        this.chkMinimizeToTray.Checked = true;
        this.chkMinimizeToTray.CheckState = CheckState.Checked;
        this.chkMinimizeToTray.Location = new Point(200, 145);
        this.chkMinimizeToTray.Name = "chkMinimizeToTray";
        this.chkMinimizeToTray.Size = new Size(170, 19);
        this.chkMinimizeToTray.TabIndex = 9;
        this.chkMinimizeToTray.Text = "트레이로 최소화";
        this.chkMinimizeToTray.UseVisualStyleBackColor = true;
        this.chkMinimizeToTray.CheckedChanged += (s, e) => _settings.MinimizeToTray = chkMinimizeToTray.Checked;
        
        // btnSaveSettings
        this.btnSaveSettings.Location = new Point(15, 170);
        this.btnSaveSettings.Name = "btnSaveSettings";
        this.btnSaveSettings.Size = new Size(100, 25);
        this.btnSaveSettings.TabIndex = 10;
        this.btnSaveSettings.Text = "설정 저장";
        this.btnSaveSettings.UseVisualStyleBackColor = true;
        this.btnSaveSettings.Click += (s, e) => {
            _settings.Save();
            MessageBox.Show("설정이 저장되었습니다.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
        };
        
        // grpLog
        this.grpLog.Controls.Add(this.lstLog);
        this.grpLog.Location = new Point(12, 370);
        this.grpLog.Name = "grpLog";
        this.grpLog.Size = new Size(760, 180);
        this.grpLog.TabIndex = 3;
        this.grpLog.TabStop = false;
        this.grpLog.Text = "로그";
        
        // lstLog
        this.lstLog.Dock = DockStyle.Fill;
        this.lstLog.FormattingEnabled = true;
        this.lstLog.ItemHeight = 15;
        this.lstLog.Location = new Point(3, 19);
        this.lstLog.Name = "lstLog";
        this.lstLog.Size = new Size(754, 158);
        this.lstLog.TabIndex = 0;
        
        // VNCForm
        this.AutoScaleDimensions = new SizeF(7F, 15F);
        this.AutoScaleMode = AutoScaleMode.Font;
        this.ClientSize = new Size(784, 561);
        this.Controls.Add(this.grpLog);
        this.Controls.Add(this.grpSettings);
        this.Controls.Add(this.grpControl);
        this.Controls.Add(this.grpStatus);
        this.FormBorderStyle = FormBorderStyle.FixedSingle;
        this.MaximizeBox = false;
        this.Name = "VNCForm";
        this.StartPosition = FormStartPosition.CenterScreen;
        this.Text = "VNC Server";
        
        this.grpStatus.ResumeLayout(false);
        this.grpStatus.PerformLayout();
        this.grpSettings.ResumeLayout(false);
        this.grpSettings.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)this.numPort).EndInit();
        this.grpControl.ResumeLayout(false);
        this.grpLog.ResumeLayout(false);
        this.ResumeLayout(false);
        
        // Load settings into controls
        this.numPort.Value = _settings.Port;
        this.txtPassword.Text = _settings.Password;
        this.chkRequirePassword.Checked = _settings.RequirePassword;
        this.chkAllowMouse.Checked = _settings.AllowMouseControl;
        this.chkAllowKeyboard.Checked = _settings.AllowKeyboardControl;
        this.chkAllowMultiple.Checked = _settings.AllowMultipleConnections;
        this.chkAutoStart.Checked = _settings.AutoStart;
        this.chkMinimizeToTray.Checked = _settings.MinimizeToTray;
        this.txtPassword.Enabled = _settings.RequirePassword;
    }

    #endregion

    private GroupBox grpStatus;
    private Label lblStatusLabel;
    private Label lblStatus;
    private Label lblPort;
    private Label lblConnections;
    
    private GroupBox grpControl;
    private Button btnStart;
    private Button btnStop;
    
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
    
    private GroupBox grpLog;
    private ListBox lstLog;
}
