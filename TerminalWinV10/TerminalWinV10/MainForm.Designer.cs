namespace TerminalWinV10
{
    partial class MainForm
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
                components.Dispose();
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(MainForm));
            terminalTabs = new TerminalTabContainer();
            cmbConnectionType = new System.Windows.Forms.ComboBox();
            cmbPort = new System.Windows.Forms.ComboBox();
            txtTcpPort = new System.Windows.Forms.TextBox();
            cmbBaud = new System.Windows.Forms.ComboBox();
            txtIP = new System.Windows.Forms.TextBox();
            txtLocalShell = new System.Windows.Forms.TextBox();
            lblLocalShell = new System.Windows.Forms.Label();
            btnConnect = new System.Windows.Forms.Button();
            btnDisconnect = new System.Windows.Forms.Button();
            cmbProfile = new System.Windows.Forms.ComboBox();
            btnSaveProfile = new System.Windows.Forms.Button();
            btnDeleteProfile = new System.Windows.Forms.Button();
            chkSsl = new System.Windows.Forms.CheckBox();
            SuspendLayout();
            // 
            // terminalTabs
            // 
            terminalTabs.Anchor = System.Windows.Forms.AnchorStyles.Top | System.Windows.Forms.AnchorStyles.Bottom | System.Windows.Forms.AnchorStyles.Left | System.Windows.Forms.AnchorStyles.Right;
            terminalTabs.Location = new System.Drawing.Point(14, 81);
            terminalTabs.Margin = new System.Windows.Forms.Padding(4, 3, 4, 3);
            terminalTabs.Name = "terminalTabs";
            terminalTabs.Size = new System.Drawing.Size(1064, 587);
            terminalTabs.TabIndex = 0;
            // 
            // cmbConnectionType
            // 
            cmbConnectionType.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            cmbConnectionType.Items.AddRange(new object[] { "Local", "Serial", "TCP/IP" });
            cmbConnectionType.Location = new System.Drawing.Point(14, 14);
            cmbConnectionType.Margin = new System.Windows.Forms.Padding(4, 3, 4, 3);
            cmbConnectionType.Name = "cmbConnectionType";
            cmbConnectionType.Size = new System.Drawing.Size(93, 23);
            cmbConnectionType.TabIndex = 1;
            cmbConnectionType.SelectedIndexChanged += cmbConnectionType_SelectedIndexChanged;
            // 
            // cmbPort
            // 
            cmbPort.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            cmbPort.Location = new System.Drawing.Point(114, 14);
            cmbPort.Margin = new System.Windows.Forms.Padding(4, 3, 4, 3);
            cmbPort.Name = "cmbPort";
            cmbPort.Size = new System.Drawing.Size(58, 23);
            cmbPort.TabIndex = 2;
            // 
            // txtTcpPort
            // 
            txtTcpPort.Location = new System.Drawing.Point(242, 14);
            txtTcpPort.Margin = new System.Windows.Forms.Padding(4, 3, 4, 3);
            txtTcpPort.Name = "txtTcpPort";
            txtTcpPort.Size = new System.Drawing.Size(50, 23);
            txtTcpPort.TabIndex = 11;
            txtTcpPort.Text = "8443";
            // 
            // cmbBaud
            // 
            cmbBaud.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            cmbBaud.Location = new System.Drawing.Point(178, 14);
            cmbBaud.Margin = new System.Windows.Forms.Padding(4, 3, 4, 3);
            cmbBaud.Name = "cmbBaud";
            cmbBaud.Size = new System.Drawing.Size(58, 23);
            cmbBaud.TabIndex = 3;
            // 
            // txtIP
            // 
            txtIP.Location = new System.Drawing.Point(296, 14);
            txtIP.Margin = new System.Windows.Forms.Padding(4, 3, 4, 3);
            txtIP.Name = "txtIP";
            txtIP.Size = new System.Drawing.Size(96, 23);
            txtIP.TabIndex = 4;
            txtIP.Text = "127.0.0.1";
            // 
            // txtLocalShell
            // 
            txtLocalShell.Location = new System.Drawing.Point(428, 14);
            txtLocalShell.Margin = new System.Windows.Forms.Padding(4, 3, 4, 3);
            txtLocalShell.Name = "txtLocalShell";
            txtLocalShell.PlaceholderText = "비우면 COMSPEC/cmd.exe";
            txtLocalShell.Size = new System.Drawing.Size(170, 23);
            txtLocalShell.TabIndex = 12;
            // 
            // lblLocalShell
            // 
            lblLocalShell.AutoSize = true;
            lblLocalShell.Location = new System.Drawing.Point(396, 17);
            lblLocalShell.Margin = new System.Windows.Forms.Padding(4, 0, 4, 0);
            lblLocalShell.Name = "lblLocalShell";
            lblLocalShell.Size = new System.Drawing.Size(27, 15);
            lblLocalShell.TabIndex = 13;
            lblLocalShell.Text = "CLI:";
            // 
            // btnConnect
            // 
            btnConnect.Location = new System.Drawing.Point(606, 12);
            btnConnect.Margin = new System.Windows.Forms.Padding(4, 3, 4, 3);
            btnConnect.Name = "btnConnect";
            btnConnect.Size = new System.Drawing.Size(88, 27);
            btnConnect.TabIndex = 5;
            btnConnect.Text = "Connect";
            btnConnect.UseVisualStyleBackColor = true;
            btnConnect.Click += btnConnect_Click;
            // 
            // btnDisconnect
            // 
            btnDisconnect.Location = new System.Drawing.Point(700, 12);
            btnDisconnect.Margin = new System.Windows.Forms.Padding(4, 3, 4, 3);
            btnDisconnect.Name = "btnDisconnect";
            btnDisconnect.Size = new System.Drawing.Size(88, 27);
            btnDisconnect.TabIndex = 6;
            btnDisconnect.Text = "Disconnect";
            btnDisconnect.UseVisualStyleBackColor = true;
            btnDisconnect.Click += btnDisconnect_Click;
            // 
            // cmbProfile
            // 
            cmbProfile.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
            cmbProfile.Location = new System.Drawing.Point(14, 46);
            cmbProfile.Margin = new System.Windows.Forms.Padding(4, 3, 4, 3);
            cmbProfile.Name = "cmbProfile";
            cmbProfile.Size = new System.Drawing.Size(174, 23);
            cmbProfile.TabIndex = 7;
            cmbProfile.SelectedIndexChanged += cmbProfile_SelectedIndexChanged;
            // 
            // btnSaveProfile
            // 
            btnSaveProfile.Location = new System.Drawing.Point(198, 46);
            btnSaveProfile.Margin = new System.Windows.Forms.Padding(4, 3, 4, 3);
            btnSaveProfile.Name = "btnSaveProfile";
            btnSaveProfile.Size = new System.Drawing.Size(88, 27);
            btnSaveProfile.TabIndex = 8;
            btnSaveProfile.Text = "Save";
            btnSaveProfile.UseVisualStyleBackColor = true;
            btnSaveProfile.Click += btnSaveProfile_Click;
            // 
            // btnDeleteProfile
            // 
            btnDeleteProfile.Location = new System.Drawing.Point(298, 46);
            btnDeleteProfile.Margin = new System.Windows.Forms.Padding(4, 3, 4, 3);
            btnDeleteProfile.Name = "btnDeleteProfile";
            btnDeleteProfile.Size = new System.Drawing.Size(88, 27);
            btnDeleteProfile.TabIndex = 9;
            btnDeleteProfile.Text = "Delete";
            btnDeleteProfile.UseVisualStyleBackColor = true;
            btnDeleteProfile.Click += btnDeleteProfile_Click;
            // 
            // chkSsl
            // 
            chkSsl.Location = new System.Drawing.Point(400, 48);
            chkSsl.Margin = new System.Windows.Forms.Padding(4, 3, 4, 3);
            chkSsl.Name = "chkSsl";
            chkSsl.Size = new System.Drawing.Size(140, 24);
            chkSsl.TabIndex = 10;
            chkSsl.Text = "SSL/TLS 사용";
            chkSsl.UseVisualStyleBackColor = true;
            // 
            // MainForm
            // 
            AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
            AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            ClientSize = new System.Drawing.Size(1092, 681);
            Controls.Add(lblLocalShell);
            Controls.Add(txtLocalShell);
            Controls.Add(chkSsl);
            Controls.Add(btnDeleteProfile);
            Controls.Add(btnSaveProfile);
            Controls.Add(cmbProfile);
            Controls.Add(btnDisconnect);
            Controls.Add(btnConnect);
            Controls.Add(txtIP);
            Controls.Add(cmbBaud);
            Controls.Add(cmbPort);
            Controls.Add(txtTcpPort);
            Controls.Add(cmbConnectionType);
            Controls.Add(terminalTabs);
            Icon = (System.Drawing.Icon)resources.GetObject("$this.Icon");
            Margin = new System.Windows.Forms.Padding(4, 3, 4, 3);
            Name = "MainForm";
            Text = "TerminalWinV10";
            FormClosing += MainForm_FormClosing;
            ResumeLayout(false);
            PerformLayout();
        }

        private TerminalTabContainer terminalTabs;
        private System.Windows.Forms.ComboBox cmbConnectionType;
        private System.Windows.Forms.ComboBox cmbPort;
        private System.Windows.Forms.TextBox txtTcpPort;
        private System.Windows.Forms.ComboBox cmbBaud;
        private System.Windows.Forms.TextBox txtIP;
        private System.Windows.Forms.TextBox txtLocalShell;
        private System.Windows.Forms.Label lblLocalShell;
        private System.Windows.Forms.Button btnConnect;
        private System.Windows.Forms.Button btnDisconnect;
        private System.Windows.Forms.CheckBox chkSsl;
        private System.Windows.Forms.ComboBox cmbProfile;
        private System.Windows.Forms.Button btnSaveProfile;
        private System.Windows.Forms.Button btnDeleteProfile;
    }
}
