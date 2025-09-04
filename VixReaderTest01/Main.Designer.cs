namespace VixReaderTest01
{
    partial class Main
    {
        /// <summary>
        ///  Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        ///  Required method for Designer support - do not modify
        ///  the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(Main));
            LogTextBox = new TextBox();
            IntellivixLogo = new PictureBox();
            SerialCheckBox = new CheckBox();
            EthernetCheckBox = new CheckBox();
            InterfaceGroupBox = new GroupBox();
            CommandGroupBox = new GroupBox();
            GetSerialNumber = new Button();
            SetSerialNumber = new Button();
            GetMacAddress = new Button();
            GetCPUInfo = new Button();
            IntellivixInfo = new Label();
            ((System.ComponentModel.ISupportInitialize)IntellivixLogo).BeginInit();
            InterfaceGroupBox.SuspendLayout();
            CommandGroupBox.SuspendLayout();
            SuspendLayout();
            // 
            // LogTextBox
            // 
            LogTextBox.BorderStyle = BorderStyle.FixedSingle;
            LogTextBox.ForeColor = SystemColors.WindowText;
            LogTextBox.Location = new Point(30, 421);
            LogTextBox.Multiline = true;
            LogTextBox.Name = "LogTextBox";
            LogTextBox.ScrollBars = ScrollBars.Vertical;
            LogTextBox.Size = new Size(824, 128);
            LogTextBox.TabIndex = 0;
            // 
            // IntellivixLogo
            // 
            IntellivixLogo.BackColor = SystemColors.ControlDark;
            IntellivixLogo.BackgroundImageLayout = ImageLayout.Stretch;
            IntellivixLogo.Image = (Image)resources.GetObject("IntellivixLogo.Image");
            IntellivixLogo.Location = new Point(30, 12);
            IntellivixLogo.Name = "IntellivixLogo";
            IntellivixLogo.Size = new Size(73, 72);
            IntellivixLogo.SizeMode = PictureBoxSizeMode.StretchImage;
            IntellivixLogo.TabIndex = 1;
            IntellivixLogo.TabStop = false;
            IntellivixLogo.Click += IntellivixLogo_Click;
            // 
            // SerialCheckBox
            // 
            SerialCheckBox.AutoSize = true;
            SerialCheckBox.Location = new Point(47, 24);
            SerialCheckBox.Name = "SerialCheckBox";
            SerialCheckBox.Size = new Size(55, 19);
            SerialCheckBox.TabIndex = 2;
            SerialCheckBox.Text = "Serial";
            SerialCheckBox.UseVisualStyleBackColor = true;
            SerialCheckBox.CheckedChanged += SerialCheckBox_CheckedChanged;
            // 
            // EthernetCheckBox
            // 
            EthernetCheckBox.AutoSize = true;
            EthernetCheckBox.Checked = true;
            EthernetCheckBox.CheckState = CheckState.Checked;
            EthernetCheckBox.Location = new Point(161, 24);
            EthernetCheckBox.Name = "EthernetCheckBox";
            EthernetCheckBox.Size = new Size(70, 19);
            EthernetCheckBox.TabIndex = 3;
            EthernetCheckBox.Text = "Ethernet";
            EthernetCheckBox.UseVisualStyleBackColor = true;
            EthernetCheckBox.CheckedChanged += EthernetCheckBox_CheckedChanged;
            // 
            // InterfaceGroupBox
            // 
            InterfaceGroupBox.Controls.Add(EthernetCheckBox);
            InterfaceGroupBox.Controls.Add(SerialCheckBox);
            InterfaceGroupBox.Location = new Point(579, 5);
            InterfaceGroupBox.Name = "InterfaceGroupBox";
            InterfaceGroupBox.Size = new Size(272, 59);
            InterfaceGroupBox.TabIndex = 4;
            InterfaceGroupBox.TabStop = false;
            InterfaceGroupBox.Text = "Select Interface";
            // 
            // CommandGroupBox
            // 
            CommandGroupBox.Controls.Add(GetSerialNumber);
            CommandGroupBox.Controls.Add(SetSerialNumber);
            CommandGroupBox.Controls.Add(GetMacAddress);
            CommandGroupBox.Controls.Add(GetCPUInfo);
            CommandGroupBox.Location = new Point(579, 70);
            CommandGroupBox.Name = "CommandGroupBox";
            CommandGroupBox.Size = new Size(272, 334);
            CommandGroupBox.TabIndex = 5;
            CommandGroupBox.TabStop = false;
            CommandGroupBox.Text = "Click Test Item";
            // 
            // GetSerialNumber
            // 
            GetSerialNumber.Location = new Point(142, 63);
            GetSerialNumber.Name = "GetSerialNumber";
            GetSerialNumber.Size = new Size(124, 33);
            GetSerialNumber.TabIndex = 3;
            GetSerialNumber.Text = "Get Serial Number";
            GetSerialNumber.UseVisualStyleBackColor = true;
            GetSerialNumber.Click += GetSerialNumber_Click;
            // 
            // SetSerialNumber
            // 
            SetSerialNumber.Location = new Point(8, 62);
            SetSerialNumber.Name = "SetSerialNumber";
            SetSerialNumber.Size = new Size(128, 35);
            SetSerialNumber.TabIndex = 2;
            SetSerialNumber.Text = "Set Serial Number";
            SetSerialNumber.UseVisualStyleBackColor = true;
            SetSerialNumber.Click += SetSerialNumber_Click;
            // 
            // GetMacAddress
            // 
            GetMacAddress.Location = new Point(142, 22);
            GetMacAddress.Name = "GetMacAddress";
            GetMacAddress.Size = new Size(124, 34);
            GetMacAddress.TabIndex = 1;
            GetMacAddress.Text = "Get Mac Address";
            GetMacAddress.UseVisualStyleBackColor = true;
            GetMacAddress.Click += GetMacAddress_Click;
            // 
            // GetCPUInfo
            // 
            GetCPUInfo.Location = new Point(8, 22);
            GetCPUInfo.Name = "GetCPUInfo";
            GetCPUInfo.Size = new Size(128, 34);
            GetCPUInfo.TabIndex = 0;
            GetCPUInfo.Text = "Get CPU Info.";
            GetCPUInfo.UseVisualStyleBackColor = true;
            GetCPUInfo.Click += GetCPUInfo_Click;
            // 
            // IntellivixInfo
            // 
            IntellivixInfo.AutoSize = true;
            IntellivixInfo.Location = new Point(109, 12);
            IntellivixInfo.Name = "IntellivixInfo";
            IntellivixInfo.Size = new Size(179, 60);
            IntellivixInfo.TabIndex = 6;
            IntellivixInfo.Text = "Intellivix Firmware Test Program\r\nVersion 0.0.1\r\nAll rights are reserved.\r\n\r\n";
            // 
            // Main
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            AutoValidate = AutoValidate.EnableAllowFocusChange;
            BackColor = SystemColors.Window;
            ClientSize = new Size(884, 561);
            Controls.Add(IntellivixInfo);
            Controls.Add(CommandGroupBox);
            Controls.Add(InterfaceGroupBox);
            Controls.Add(IntellivixLogo);
            Controls.Add(LogTextBox);
            Icon = (Icon)resources.GetObject("$this.Icon");
            MaximizeBox = false;
            MaximumSize = new Size(900, 600);
            MinimumSize = new Size(900, 600);
            Name = "Main";
            Text = "VixAir Test";
            Load += Main_Load;
            ((System.ComponentModel.ISupportInitialize)IntellivixLogo).EndInit();
            InterfaceGroupBox.ResumeLayout(false);
            InterfaceGroupBox.PerformLayout();
            CommandGroupBox.ResumeLayout(false);
            ResumeLayout(false);
            PerformLayout();
        }

        private TextBox LogTextBox;
        private PictureBox IntellivixLogo;
        private CheckBox SerialCheckBox;
        private CheckBox EthernetCheckBox;
        private GroupBox InterfaceGroupBox;
        private GroupBox CommandGroupBox;
        private Button GetCPUInfo;
        private Button GetMacAddress;
        private Label IntellivixInfo;
        private Button GetSerialNumber;
        private Button SetSerialNumber;
    }
}
