namespace VixReaderTest01
{
    partial class Main
    {
        private void InitializeComponent()
        {
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(Main));
            LogTextBox = new TextBox();
            IntellivixLogo = new PictureBox();
            SerialCheckBox = new CheckBox();
            EthernetCheckBox = new CheckBox();
            IPAddressTextBox = new TextBox();
            IPAddressLabel = new Label();
            InterfaceGroupBox = new GroupBox();
            ControlCommand = new GroupBox();
            GetFirmwareVersion = new Button();
            SetDefault = new Button();
            FirmwareVersion = new Button();
            Reboot = new Button();
            ClearSetting = new Button();
            GetSerialNumber = new Button();
            SetSerialNumber = new Button();
            GetMacAddress = new Button();
            GetCPUInfo = new Button();
            TestResult = new Button();
            NetworkLink = new Button();
            TamperTest = new Button();
            BuzzerTest = new Button();
            DoorButtonTest = new Button();
            DoorLockTest = new Button();
            SensorTest = new Button();
            AUXInTest = new Button();
            LFIDTest = new Button();
            NFCTest = new Button();
            BLETest = new Button();
            SelfTest = new Button();
            IntellivixInfo = new Label();
            Report = new Button();
            FullTest = new Button();
            TestCommandGroup = new GroupBox();
            LEDTest = new Button();
            ConnectButton = new Button();
            ((System.ComponentModel.ISupportInitialize)IntellivixLogo).BeginInit();
            InterfaceGroupBox.SuspendLayout();
            ControlCommand.SuspendLayout();
            TestCommandGroup.SuspendLayout();
            SuspendLayout();
            // 
            // LogTextBox
            // 
            LogTextBox.BorderStyle = BorderStyle.FixedSingle;
            LogTextBox.ForeColor = SystemColors.WindowText;
            LogTextBox.Location = new Point(13, 462);
            LogTextBox.Multiline = true;
            LogTextBox.Name = "LogTextBox";
            LogTextBox.ScrollBars = ScrollBars.Vertical;
            LogTextBox.Size = new Size(960, 187);
            LogTextBox.TabIndex = 0;
            // 
            // IntellivixLogo
            // 
            IntellivixLogo.BackColor = SystemColors.ControlDark;
            IntellivixLogo.BackgroundImageLayout = ImageLayout.Stretch;
            IntellivixLogo.Image = (Image)resources.GetObject("IntellivixLogo.Image");
            IntellivixLogo.Location = new Point(12, 12);
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
            SerialCheckBox.Enabled = false;
            SerialCheckBox.Location = new Point(8, 24);
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
            EthernetCheckBox.Location = new Point(75, 24);
            EthernetCheckBox.Name = "EthernetCheckBox";
            EthernetCheckBox.Size = new Size(70, 19);
            EthernetCheckBox.TabIndex = 3;
            EthernetCheckBox.Text = "Ethernet";
            EthernetCheckBox.UseVisualStyleBackColor = true;
            EthernetCheckBox.CheckedChanged += EthernetCheckBox_CheckedChanged;
            // 
            // IPAddressTextBox
            // 
            IPAddressTextBox.Location = new Point(179, 23);
            IPAddressTextBox.Name = "IPAddressTextBox";
            IPAddressTextBox.Size = new Size(200, 23);
            IPAddressTextBox.TabIndex = 5;
            IPAddressTextBox.Text = "localhost";
            IPAddressTextBox.TextChanged += IPAddressTextBox_TextChanged;
            // 
            // IPAddressLabel
            // 
            IPAddressLabel.AutoSize = true;
            IPAddressLabel.Location = new Point(151, 26);
            IPAddressLabel.Name = "IPAddressLabel";
            IPAddressLabel.Size = new Size(20, 15);
            IPAddressLabel.TabIndex = 4;
            IPAddressLabel.Text = "IP:";
            // 
            // InterfaceGroupBox
            // 
            InterfaceGroupBox.Controls.Add(IPAddressTextBox);
            InterfaceGroupBox.Controls.Add(IPAddressLabel);
            InterfaceGroupBox.Controls.Add(EthernetCheckBox);
            InterfaceGroupBox.Controls.Add(SerialCheckBox);
            InterfaceGroupBox.ForeColor = SystemColors.ActiveCaptionText;
            InterfaceGroupBox.Location = new Point(412, 12);
            InterfaceGroupBox.Name = "InterfaceGroupBox";
            InterfaceGroupBox.Size = new Size(565, 52);
            InterfaceGroupBox.TabIndex = 4;
            InterfaceGroupBox.TabStop = false;
            InterfaceGroupBox.Text = "Select Interface";
            // 
            // ControlCommand
            // 
            ControlCommand.Controls.Add(GetFirmwareVersion);
            ControlCommand.Controls.Add(SetDefault);
            ControlCommand.Controls.Add(FirmwareVersion);
            ControlCommand.Controls.Add(Reboot);
            ControlCommand.Controls.Add(ClearSetting);
            ControlCommand.Controls.Add(GetSerialNumber);
            ControlCommand.Controls.Add(SetSerialNumber);
            ControlCommand.Controls.Add(GetMacAddress);
            ControlCommand.Controls.Add(GetCPUInfo);
            ControlCommand.ForeColor = Color.DarkBlue;
            ControlCommand.Location = new Point(12, 107);
            ControlCommand.Name = "ControlCommand";
            ControlCommand.Size = new Size(580, 150);
            ControlCommand.TabIndex = 5;
            ControlCommand.TabStop = false;
            ControlCommand.Text = "Click Device Control Command";
            // 
            // GetFirmwareVersion
            // 
            GetFirmwareVersion.Location = new Point(381, 62);
            GetFirmwareVersion.Name = "GetFirmwareVersion";
            GetFirmwareVersion.Size = new Size(176, 34);
            GetFirmwareVersion.TabIndex = 21;
            GetFirmwareVersion.Text = "펌웨어 버전 읽기";
            GetFirmwareVersion.UseVisualStyleBackColor = true;
            GetFirmwareVersion.Click += GetFirmwareVersion_Click;
            // 
            // SetDefault
            // 
            SetDefault.Location = new Point(381, 102);
            SetDefault.Name = "SetDefault";
            SetDefault.Size = new Size(176, 34);
            SetDefault.TabIndex = 19;
            SetDefault.Text = "상태 초기화";
            SetDefault.UseVisualStyleBackColor = true;
            SetDefault.Click += DefaultState_Click;
            // 
            // FirmwareVersion
            // 
            FirmwareVersion.Location = new Point(381, 22);
            FirmwareVersion.Name = "FirmwareVersion";
            FirmwareVersion.Size = new Size(176, 35);
            FirmwareVersion.TabIndex = 15;
            FirmwareVersion.Text = "펌웨어 버전 설정";
            FirmwareVersion.UseVisualStyleBackColor = true;
            FirmwareVersion.Click += FirmwareVersion_Click;
            // 
            // Reboot
            // 
            Reboot.Location = new Point(196, 22);
            Reboot.Name = "Reboot";
            Reboot.Size = new Size(179, 35);
            Reboot.TabIndex = 5;
            Reboot.Text = "장치 재부팅";
            Reboot.UseVisualStyleBackColor = true;
            Reboot.Click += Reboot_Click;
            // 
            // ClearSetting
            // 
            ClearSetting.Location = new Point(9, 22);
            ClearSetting.Name = "ClearSetting";
            ClearSetting.Size = new Size(179, 34);
            ClearSetting.TabIndex = 4;
            ClearSetting.Text = "설정 지우기";
            ClearSetting.UseVisualStyleBackColor = true;
            ClearSetting.Click += ClearSetting_Click;
            // 
            // GetSerialNumber
            // 
            GetSerialNumber.Location = new Point(194, 102);
            GetSerialNumber.Name = "GetSerialNumber";
            GetSerialNumber.Size = new Size(180, 34);
            GetSerialNumber.TabIndex = 3;
            GetSerialNumber.Text = "시리얼 번호 읽기";
            GetSerialNumber.UseVisualStyleBackColor = true;
            GetSerialNumber.Click += GetSerialNumber_Click;
            // 
            // SetSerialNumber
            // 
            SetSerialNumber.Location = new Point(9, 102);
            SetSerialNumber.Name = "SetSerialNumber";
            SetSerialNumber.Size = new Size(179, 35);
            SetSerialNumber.TabIndex = 2;
            SetSerialNumber.Text = "시리얼 번호 쓰기";
            SetSerialNumber.UseVisualStyleBackColor = true;
            SetSerialNumber.Click += SetSerialNumber_Click;
            // 
            // GetMacAddress
            // 
            GetMacAddress.Location = new Point(195, 62);
            GetMacAddress.Name = "GetMacAddress";
            GetMacAddress.Size = new Size(180, 34);
            GetMacAddress.TabIndex = 1;
            GetMacAddress.Text = "MAC 주소 읽기";
            GetMacAddress.UseVisualStyleBackColor = true;
            GetMacAddress.Click += GetMacAddress_Click;
            // 
            // GetCPUInfo
            // 
            GetCPUInfo.Location = new Point(9, 62);
            GetCPUInfo.Name = "GetCPUInfo";
            GetCPUInfo.Size = new Size(179, 34);
            GetCPUInfo.TabIndex = 0;
            GetCPUInfo.Text = "CPU 정보 읽기";
            GetCPUInfo.UseVisualStyleBackColor = true;
            GetCPUInfo.Click += GetCPUInfo_Click;
            // 
            // TestResult
            // 
            TestResult.BackColor = Color.Lime;
            TestResult.Font = new Font("맑은 고딕", 72F, FontStyle.Regular, GraphicsUnit.Point, 129);
            TestResult.ForeColor = Color.Blue;
            TestResult.Location = new Point(598, 116);
            TestResult.Name = "TestResult";
            TestResult.Size = new Size(385, 340);
            TestResult.TabIndex = 20;
            TestResult.Text = "PASS";
            TestResult.UseVisualStyleBackColor = false;
            // 
            // NetworkLink
            // 
            NetworkLink.ForeColor = Color.DarkBlue;
            NetworkLink.Location = new Point(377, 149);
            NetworkLink.Name = "NetworkLink";
            NetworkLink.Size = new Size(179, 36);
            NetworkLink.TabIndex = 18;
            NetworkLink.Text = "네트워크 링크 테스트 실행";
            NetworkLink.UseVisualStyleBackColor = true;
            NetworkLink.Click += NetworkLink_Click;
            // 
            // TamperTest
            // 
            TamperTest.ForeColor = Color.DarkBlue;
            TamperTest.Location = new Point(377, 64);
            TamperTest.Name = "TamperTest";
            TamperTest.Size = new Size(179, 38);
            TamperTest.TabIndex = 17;
            TamperTest.Text = "템퍼 테스트 실행";
            TamperTest.UseVisualStyleBackColor = true;
            TamperTest.Click += TamperTest_Click;
            // 
            // BuzzerTest
            // 
            BuzzerTest.ForeColor = Color.DarkBlue;
            BuzzerTest.Location = new Point(377, 23);
            BuzzerTest.Name = "BuzzerTest";
            BuzzerTest.Size = new Size(179, 35);
            BuzzerTest.TabIndex = 16;
            BuzzerTest.Text = "부저 테스트 실행";
            BuzzerTest.UseVisualStyleBackColor = true;
            BuzzerTest.Click += BuzzerTest_Click;
            // 
            // DoorButtonTest
            // 
            DoorButtonTest.ForeColor = Color.DarkBlue;
            DoorButtonTest.Location = new Point(191, 64);
            DoorButtonTest.Name = "DoorButtonTest";
            DoorButtonTest.Size = new Size(180, 38);
            DoorButtonTest.TabIndex = 13;
            DoorButtonTest.Text = "도어 버튼 테스트 실행";
            DoorButtonTest.UseVisualStyleBackColor = true;
            DoorButtonTest.Click += DoorButtonTest_Click;
            // 
            // DoorLockTest
            // 
            DoorLockTest.Location = new Point(9, 108);
            DoorLockTest.Name = "DoorLockTest";
            DoorLockTest.Size = new Size(179, 35);
            DoorLockTest.TabIndex = 12;
            DoorLockTest.Text = "도어락 테스트 실행";
            DoorLockTest.UseVisualStyleBackColor = true;
            DoorLockTest.Click += DoorLockTest_Click;
            // 
            // SensorTest
            // 
            SensorTest.ForeColor = Color.DarkBlue;
            SensorTest.Location = new Point(191, 23);
            SensorTest.Name = "SensorTest";
            SensorTest.Size = new Size(180, 35);
            SensorTest.TabIndex = 11;
            SensorTest.Text = "센서 테스트 실행";
            SensorTest.UseVisualStyleBackColor = true;
            SensorTest.Click += SensorTest_Click;
            // 
            // AUXInTest
            // 
            AUXInTest.ForeColor = Color.DarkBlue;
            AUXInTest.Location = new Point(191, 149);
            AUXInTest.Name = "AUXInTest";
            AUXInTest.Size = new Size(180, 36);
            AUXInTest.TabIndex = 10;
            AUXInTest.Text = "AUX IN 테스트 실행";
            AUXInTest.UseVisualStyleBackColor = true;
            AUXInTest.Click += AuxinTest_Click;
            // 
            // LFIDTest
            // 
            LFIDTest.ForeColor = Color.DarkBlue;
            LFIDTest.Location = new Point(9, 149);
            LFIDTest.Name = "LFIDTest";
            LFIDTest.Size = new Size(178, 35);
            LFIDTest.TabIndex = 9;
            LFIDTest.Text = "LFID 테스트 실행";
            LFIDTest.UseVisualStyleBackColor = true;
            LFIDTest.Click += LfidTest_Click;
            // 
            // NFCTest
            // 
            NFCTest.ForeColor = Color.DarkBlue;
            NFCTest.Location = new Point(377, 108);
            NFCTest.Name = "NFCTest";
            NFCTest.Size = new Size(179, 35);
            NFCTest.TabIndex = 8;
            NFCTest.Text = "NFC 테스트 실행";
            NFCTest.UseVisualStyleBackColor = true;
            NFCTest.Click += NfcTest_Click;
            // 
            // BLETest
            // 
            BLETest.ForeColor = Color.DarkBlue;
            BLETest.Location = new Point(191, 108);
            BLETest.Name = "BLETest";
            BLETest.Size = new Size(180, 35);
            BLETest.TabIndex = 7;
            BLETest.Text = "Bluetooth 테스트 실행";
            BLETest.UseVisualStyleBackColor = true;
            BLETest.Click += BleTest_Click;
            // 
            // SelfTest
            // 
            SelfTest.ForeColor = Color.DarkBlue;
            SelfTest.Location = new Point(9, 22);
            SelfTest.Name = "SelfTest";
            SelfTest.Size = new Size(179, 36);
            SelfTest.TabIndex = 6;
            SelfTest.Text = "자가 진단 실행";
            SelfTest.UseVisualStyleBackColor = true;
            SelfTest.Click += SelfTest_Click;
            // 
            // IntellivixInfo
            // 
            IntellivixInfo.AutoSize = true;
            IntellivixInfo.ForeColor = SystemColors.ActiveCaptionText;
            IntellivixInfo.Location = new Point(91, 12);
            IntellivixInfo.Name = "IntellivixInfo";
            IntellivixInfo.Size = new Size(198, 60);
            IntellivixInfo.TabIndex = 6;
            IntellivixInfo.Text = "Intellivix Firmware Test Program\r\nVersion 0.0.1\r\nAll rights are reserved.\r\n(시리얼은 현재 지원하지 않습니다.)";
            // 
            // Report
            // 
            Report.ForeColor = Color.DarkBlue;
            Report.Location = new Point(803, 70);
            Report.Name = "Report";
            Report.Size = new Size(174, 40);
            Report.TabIndex = 7;
            Report.Text = "보고서 생성";
            Report.UseVisualStyleBackColor = true;
            Report.Click += Report_Click;
            // 
            // FullTest
            // 
            FullTest.ForeColor = Color.DarkBlue;
            FullTest.Location = new Point(598, 70);
            FullTest.Name = "FullTest";
            FullTest.Size = new Size(199, 40);
            FullTest.TabIndex = 8;
            FullTest.Text = "한번에 실행";
            FullTest.UseVisualStyleBackColor = true;
            // 
            // TestCommandGroup
            // 
            TestCommandGroup.Controls.Add(LEDTest);
            TestCommandGroup.Controls.Add(SelfTest);
            TestCommandGroup.Controls.Add(TamperTest);
            TestCommandGroup.Controls.Add(NetworkLink);
            TestCommandGroup.Controls.Add(LFIDTest);
            TestCommandGroup.Controls.Add(BLETest);
            TestCommandGroup.Controls.Add(NFCTest);
            TestCommandGroup.Controls.Add(BuzzerTest);
            TestCommandGroup.Controls.Add(SensorTest);
            TestCommandGroup.Controls.Add(AUXInTest);
            TestCommandGroup.Controls.Add(DoorLockTest);
            TestCommandGroup.Controls.Add(DoorButtonTest);
            TestCommandGroup.ForeColor = Color.DarkBlue;
            TestCommandGroup.Location = new Point(13, 263);
            TestCommandGroup.Name = "TestCommandGroup";
            TestCommandGroup.Size = new Size(579, 193);
            TestCommandGroup.TabIndex = 21;
            TestCommandGroup.TabStop = false;
            TestCommandGroup.Text = "Click Device Test Command";
            // 
            // LEDTest
            // 
            LEDTest.ForeColor = Color.DarkBlue;
            LEDTest.Location = new Point(9, 64);
            LEDTest.Name = "LEDTest";
            LEDTest.Size = new Size(179, 35);
            LEDTest.TabIndex = 14;
            LEDTest.Text = "LED 테스트 실행";
            LEDTest.UseVisualStyleBackColor = true;
            LEDTest.Click += LedTest_Click;
            // 
            // ConnectButton
            // 
            ConnectButton.Location = new Point(803, 19);
            ConnectButton.Name = "ConnectButton";
            ConnectButton.Size = new Size(171, 40);
            ConnectButton.TabIndex = 22;
            ConnectButton.Text = "연결...";
            ConnectButton.UseVisualStyleBackColor = true;
            ConnectButton.Click += ConnectButton_Click;
            // 
            // Main
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            AutoValidate = AutoValidate.EnableAllowFocusChange;
            BackColor = SystemColors.Control;
            ClientSize = new Size(984, 661);
            Controls.Add(ConnectButton);
            Controls.Add(FullTest);
            Controls.Add(TestResult);
            Controls.Add(Report);
            Controls.Add(IntellivixInfo);
            Controls.Add(InterfaceGroupBox);
            Controls.Add(IntellivixLogo);
            Controls.Add(LogTextBox);
            Controls.Add(ControlCommand);
            Controls.Add(TestCommandGroup);
            ForeColor = SystemColors.ActiveCaptionText;
            Icon = (Icon)resources.GetObject("$this.Icon");
            MaximizeBox = false;
            MaximumSize = new Size(1000, 700);
            MinimumSize = new Size(1000, 700);
            Name = "Main";
            Text = "VixReader 테스트";
            Load += Main_Load;
            ((System.ComponentModel.ISupportInitialize)IntellivixLogo).EndInit();
            InterfaceGroupBox.ResumeLayout(false);
            InterfaceGroupBox.PerformLayout();
            ControlCommand.ResumeLayout(false);
            TestCommandGroup.ResumeLayout(false);
            ResumeLayout(false);
            PerformLayout();
        }

        private TextBox LogTextBox;
        private PictureBox IntellivixLogo;
        private CheckBox SerialCheckBox;
        private CheckBox EthernetCheckBox;
        private TextBox IPAddressTextBox;
        private Label IPAddressLabel;
        private GroupBox InterfaceGroupBox;
        private GroupBox ControlCommand;
        private Button GetCPUInfo;
        private Button GetMacAddress;
        private Label IntellivixInfo;
        private Button GetSerialNumber;
        private Button SetSerialNumber;
        private Button SelfTest;
        private Button Reboot;
        private Button ClearSetting;
        private Button DoorLockTest;
        private Button SensorTest;
        private Button AUXInTest;
        private Button LFIDTest;
        private Button NFCTest;
        private Button BLETest;
        private Button DoorButtonTest;
        private Button LEDTest;
        private Button TamperTest;
        private Button BuzzerTest;
        private Button FirmwareVersion;
        private Button NetworkLink;
        private Button SetDefault;
        private Button Report;
        private Button TestResult;
        private Button FullTest;
        private Button GetFirmwareVersion;
        private GroupBox TestCommandGroup;
        private Button ConnectButton;
    }
}
