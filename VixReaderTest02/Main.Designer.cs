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
            ConnectButton = new Button();
            ControlCommand = new GroupBox();
            Reboot = new Button();
            GetSerialNumber = new Button();
            SetSerialNumber = new Button();
            GetFirmwareVersion = new Button();
            SetDefault = new Button();
            ClearSetting = new Button();
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
            TestCommandGroup = new GroupBox();
            LEDTest = new Button();
            DeviceTypeComboBox = new ComboBox();
            DeviceTypeLabel = new Label();
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
            LogTextBox.Size = new Size(959, 187);
            LogTextBox.TabIndex = 50;
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
            IntellivixLogo.TabIndex = 0;
            IntellivixLogo.TabStop = false;
            IntellivixLogo.Click += IntellivixLogo_Click;
            // 
            // SerialCheckBox
            // 
            SerialCheckBox.AutoSize = true;
            SerialCheckBox.Enabled = false;
            SerialCheckBox.Font = new Font("맑은 고딕", 12F, FontStyle.Bold);
            SerialCheckBox.Location = new Point(8, 25);
            SerialCheckBox.Name = "SerialCheckBox";
            SerialCheckBox.Size = new Size(70, 25);
            SerialCheckBox.TabIndex = 1;
            SerialCheckBox.Text = "Serial";
            SerialCheckBox.UseVisualStyleBackColor = true;
            // 
            // EthernetCheckBox
            // 
            EthernetCheckBox.AutoSize = true;
            EthernetCheckBox.Checked = true;
            EthernetCheckBox.CheckState = CheckState.Checked;
            EthernetCheckBox.Font = new Font("맑은 고딕", 12F, FontStyle.Bold);
            EthernetCheckBox.Location = new Point(84, 25);
            EthernetCheckBox.Name = "EthernetCheckBox";
            EthernetCheckBox.Size = new Size(94, 25);
            EthernetCheckBox.TabIndex = 2;
            EthernetCheckBox.Text = "Ethernet";
            EthernetCheckBox.UseVisualStyleBackColor = true;
            // 
            // IPAddressTextBox
            // 
            IPAddressTextBox.Location = new Point(269, 25);
            IPAddressTextBox.Name = "IPAddressTextBox";
            IPAddressTextBox.Size = new Size(166, 29);
            IPAddressTextBox.TabIndex = 3;
            IPAddressTextBox.Text = "192.168.0.2\r\n";
            IPAddressTextBox.TextChanged += IPAddressTextBox_TextChanged;
            // 
            // IPAddressLabel
            // 
            IPAddressLabel.AutoSize = true;
            IPAddressLabel.Font = new Font("맑은 고딕", 12F, FontStyle.Bold, GraphicsUnit.Point, 129);
            IPAddressLabel.Location = new Point(200, 26);
            IPAddressLabel.Name = "IPAddressLabel";
            IPAddressLabel.Size = new Size(73, 21);
            IPAddressLabel.TabIndex = 0;
            IPAddressLabel.Text = "IP 주소 :";
            // 
            // InterfaceGroupBox
            // 
            InterfaceGroupBox.Controls.Add(ConnectButton);
            InterfaceGroupBox.Controls.Add(IPAddressTextBox);
            InterfaceGroupBox.Controls.Add(IPAddressLabel);
            InterfaceGroupBox.Controls.Add(EthernetCheckBox);
            InterfaceGroupBox.Controls.Add(SerialCheckBox);
            InterfaceGroupBox.Font = new Font("맑은 고딕", 12F, FontStyle.Bold, GraphicsUnit.Point, 129);
            InterfaceGroupBox.ForeColor = SystemColors.ActiveCaptionText;
            InterfaceGroupBox.Location = new Point(356, 12);
            InterfaceGroupBox.Name = "InterfaceGroupBox";
            InterfaceGroupBox.Size = new Size(616, 61);
            InterfaceGroupBox.TabIndex = 2;
            InterfaceGroupBox.TabStop = false;
            InterfaceGroupBox.Text = "장치 연결  선택 :";
            // 
            // ConnectButton
            // 
            ConnectButton.BackColor = Color.Red;
            ConnectButton.Font = new Font("맑은 고딕", 12F, FontStyle.Bold, GraphicsUnit.Point, 129);
            ConnectButton.ForeColor = Color.Transparent;
            ConnectButton.Location = new Point(447, 21);
            ConnectButton.Name = "ConnectButton";
            ConnectButton.Size = new Size(163, 35);
            ConnectButton.TabIndex = 4;
            ConnectButton.Text = "연결...";
            ConnectButton.UseVisualStyleBackColor = false;
            ConnectButton.Click += ConnectButton_Click;
            // 
            // ControlCommand
            // 
            ControlCommand.Controls.Add(Reboot);
            ControlCommand.Controls.Add(GetSerialNumber);
            ControlCommand.Controls.Add(SetSerialNumber);
            ControlCommand.Font = new Font("맑은 고딕", 12F, FontStyle.Bold, GraphicsUnit.Point, 129);
            ControlCommand.ForeColor = Color.DarkBlue;
            ControlCommand.Location = new Point(12, 107);
            ControlCommand.Name = "ControlCommand";
            ControlCommand.Size = new Size(571, 86);
            ControlCommand.TabIndex = 4;
            ControlCommand.TabStop = false;
            ControlCommand.Text = "장치 제어 명령 선택 : ";
            // 
            // Reboot
            // 
            Reboot.Font = new Font("맑은 고딕", 9.75F);
            Reboot.Location = new Point(381, 40);
            Reboot.Name = "Reboot";
            Reboot.Size = new Size(179, 35);
            Reboot.TabIndex = 5;
            Reboot.Text = "장치 재부팅";
            Reboot.UseVisualStyleBackColor = true;
            Reboot.Click += Reboot_Click;
            // 
            // GetSerialNumber
            // 
            GetSerialNumber.Font = new Font("맑은 고딕", 9.75F);
            GetSerialNumber.Location = new Point(10, 41);
            GetSerialNumber.Name = "GetSerialNumber";
            GetSerialNumber.Size = new Size(180, 34);
            GetSerialNumber.TabIndex = 1;
            GetSerialNumber.Text = "시리얼 번호 읽기";
            GetSerialNumber.UseVisualStyleBackColor = true;
            GetSerialNumber.Click += GetSerialNumber_Click;
            // 
            // SetSerialNumber
            // 
            SetSerialNumber.Font = new Font("맑은 고딕", 9.75F);
            SetSerialNumber.Location = new Point(196, 40);
            SetSerialNumber.Name = "SetSerialNumber";
            SetSerialNumber.Size = new Size(179, 35);
            SetSerialNumber.TabIndex = 2;
            SetSerialNumber.Text = "시리얼 번호 쓰기";
            SetSerialNumber.UseVisualStyleBackColor = true;
            SetSerialNumber.Click += SetSerialNumber_Click;
            // 
            // GetFirmwareVersion
            // 
            GetFirmwareVersion.Font = new Font("맑은 고딕", 9.75F);
            GetFirmwareVersion.Location = new Point(10, 29);
            GetFirmwareVersion.Name = "GetFirmwareVersion";
            GetFirmwareVersion.Size = new Size(179, 34);
            GetFirmwareVersion.TabIndex = 3;
            GetFirmwareVersion.Text = "펌웨어 버전 읽기";
            GetFirmwareVersion.UseVisualStyleBackColor = true;
            GetFirmwareVersion.Click += GetFirmwareVersion_Click;
            // 
            // SetDefault
            // 
            SetDefault.Font = new Font("맑은 고딕", 9.75F);
            SetDefault.Location = new Point(377, 30);
            SetDefault.Name = "SetDefault";
            SetDefault.Size = new Size(178, 34);
            SetDefault.TabIndex = 6;
            SetDefault.Text = "장치 상태 초기화";
            SetDefault.UseVisualStyleBackColor = true;
            SetDefault.Click += DefaultState_Click;
            // 
            // ClearSetting
            // 
            ClearSetting.Font = new Font("맑은 고딕", 9.75F);
            ClearSetting.Location = new Point(195, 30);
            ClearSetting.Name = "ClearSetting";
            ClearSetting.Size = new Size(175, 34);
            ClearSetting.TabIndex = 4;
            ClearSetting.Text = "장치 설정 지우기";
            ClearSetting.UseVisualStyleBackColor = true;
            ClearSetting.Click += ClearSetting_Click;
            // 
            // TestResult
            // 
            TestResult.BackColor = Color.LightGray;
            TestResult.Font = new Font("맑은 고딕", 72F, FontStyle.Regular, GraphicsUnit.Point, 129);
            TestResult.ForeColor = Color.DarkBlue;
            TestResult.Location = new Point(598, 116);
            TestResult.Name = "TestResult";
            TestResult.Size = new Size(374, 340);
            TestResult.TabIndex = 49;
            TestResult.Text = " 준비";
            TestResult.UseVisualStyleBackColor = false;
            // 
            // NetworkLink
            // 
            NetworkLink.Font = new Font("맑은 고딕", 9.75F);
            NetworkLink.ForeColor = Color.DarkBlue;
            NetworkLink.Location = new Point(377, 196);
            NetworkLink.Name = "NetworkLink";
            NetworkLink.Size = new Size(179, 36);
            NetworkLink.TabIndex = 12;
            NetworkLink.Text = "네트워크 링크 테스트 실행";
            NetworkLink.UseVisualStyleBackColor = true;
            NetworkLink.Click += NetworkLink_Click;
            // 
            // TamperTest
            // 
            TamperTest.Font = new Font("맑은 고딕", 9.75F);
            TamperTest.ForeColor = Color.DarkBlue;
            TamperTest.Location = new Point(377, 111);
            TamperTest.Name = "TamperTest";
            TamperTest.Size = new Size(179, 38);
            TamperTest.TabIndex = 9;
            TamperTest.Text = "템퍼 테스트 실행";
            TamperTest.UseVisualStyleBackColor = true;
            TamperTest.Click += TamperTest_Click;
            // 
            // BuzzerTest
            // 
            BuzzerTest.Font = new Font("맑은 고딕", 9.75F);
            BuzzerTest.ForeColor = Color.DarkBlue;
            BuzzerTest.Location = new Point(377, 70);
            BuzzerTest.Name = "BuzzerTest";
            BuzzerTest.Size = new Size(179, 35);
            BuzzerTest.TabIndex = 6;
            BuzzerTest.Text = "부저 테스트 실행";
            BuzzerTest.UseVisualStyleBackColor = true;
            BuzzerTest.Click += BuzzerTest_Click;
            // 
            // DoorButtonTest
            // 
            DoorButtonTest.Font = new Font("맑은 고딕", 9.75F);
            DoorButtonTest.ForeColor = Color.DarkBlue;
            DoorButtonTest.Location = new Point(195, 111);
            DoorButtonTest.Name = "DoorButtonTest";
            DoorButtonTest.Size = new Size(176, 38);
            DoorButtonTest.TabIndex = 5;
            DoorButtonTest.Text = "도어 버튼 테스트 실행";
            DoorButtonTest.UseVisualStyleBackColor = true;
            DoorButtonTest.Click += DoorButtonTest_Click;
            // 
            // DoorLockTest
            // 
            DoorLockTest.Font = new Font("맑은 고딕", 9.75F);
            DoorLockTest.Location = new Point(9, 155);
            DoorLockTest.Name = "DoorLockTest";
            DoorLockTest.Size = new Size(179, 35);
            DoorLockTest.TabIndex = 7;
            DoorLockTest.Text = "도어락 테스트 실행";
            DoorLockTest.UseVisualStyleBackColor = true;
            DoorLockTest.Click += DoorLockTest_Click;
            // 
            // SensorTest
            // 
            SensorTest.Font = new Font("맑은 고딕", 9.75F);
            SensorTest.ForeColor = Color.DarkBlue;
            SensorTest.Location = new Point(195, 70);
            SensorTest.Name = "SensorTest";
            SensorTest.Size = new Size(176, 35);
            SensorTest.TabIndex = 3;
            SensorTest.Text = "센서 테스트 실행";
            SensorTest.UseVisualStyleBackColor = true;
            SensorTest.Click += SensorTest_Click;
            // 
            // AUXInTest
            // 
            AUXInTest.Font = new Font("맑은 고딕", 9.75F);
            AUXInTest.ForeColor = Color.DarkBlue;
            AUXInTest.Location = new Point(195, 196);
            AUXInTest.Name = "AUXInTest";
            AUXInTest.Size = new Size(176, 36);
            AUXInTest.TabIndex = 11;
            AUXInTest.Text = "AUX IN 테스트 실행";
            AUXInTest.UseVisualStyleBackColor = true;
            AUXInTest.Click += AuxinTest_Click;
            // 
            // LFIDTest
            // 
            LFIDTest.Font = new Font("맑은 고딕", 9.75F);
            LFIDTest.ForeColor = Color.DarkBlue;
            LFIDTest.Location = new Point(9, 196);
            LFIDTest.Name = "LFIDTest";
            LFIDTest.Size = new Size(178, 35);
            LFIDTest.TabIndex = 10;
            LFIDTest.Text = "LFID 테스트 실행";
            LFIDTest.UseVisualStyleBackColor = true;
            LFIDTest.Click += LfidTest_Click;
            // 
            // NFCTest
            // 
            NFCTest.Font = new Font("맑은 고딕", 9.75F);
            NFCTest.ForeColor = Color.DarkBlue;
            NFCTest.Location = new Point(377, 155);
            NFCTest.Name = "NFCTest";
            NFCTest.Size = new Size(179, 35);
            NFCTest.TabIndex = 9;
            NFCTest.Text = "NFC 테스트 실행";
            NFCTest.UseVisualStyleBackColor = true;
            NFCTest.Click += NfcTest_Click;
            // 
            // BLETest
            // 
            BLETest.Font = new Font("맑은 고딕", 9.75F);
            BLETest.ForeColor = Color.DarkBlue;
            BLETest.Location = new Point(195, 155);
            BLETest.Name = "BLETest";
            BLETest.Size = new Size(176, 35);
            BLETest.TabIndex = 8;
            BLETest.Text = "Bluetooth 테스트 실행";
            BLETest.UseVisualStyleBackColor = true;
            BLETest.Click += BleTest_Click;
            // 
            // SelfTest
            // 
            SelfTest.Font = new Font("맑은 고딕", 9.75F);
            SelfTest.ForeColor = Color.DarkBlue;
            SelfTest.Location = new Point(9, 69);
            SelfTest.Name = "SelfTest";
            SelfTest.Size = new Size(179, 36);
            SelfTest.TabIndex = 1;
            SelfTest.Text = "자가 진단 실행";
            SelfTest.UseVisualStyleBackColor = true;
            SelfTest.Click += SelfTest_Click;
            // 
            // IntellivixInfo
            // 
            IntellivixInfo.AutoSize = true;
            IntellivixInfo.Font = new Font("맑은 고딕", 9F, FontStyle.Bold, GraphicsUnit.Point, 129);
            IntellivixInfo.ForeColor = SystemColors.ActiveCaptionText;
            IntellivixInfo.ImageAlign = ContentAlignment.BottomCenter;
            IntellivixInfo.Location = new Point(91, 12);
            IntellivixInfo.Name = "IntellivixInfo";
            IntellivixInfo.Size = new Size(241, 60);
            IntellivixInfo.TabIndex = 1;
            IntellivixInfo.Text = "Intellivix Reader Firmware Test Program\r\nVersion 1.0.0\r\nAll rights are reserved.\r\n(시리얼 연결은 현재 지원하지 않습니다.)\r\n";
            // 
            // Report
            // 
            Report.Font = new Font("맑은 고딕", 12F, FontStyle.Bold, GraphicsUnit.Point, 129);
            Report.ForeColor = Color.DarkBlue;
            Report.Location = new Point(803, 74);
            Report.Name = "Report";
            Report.Size = new Size(163, 32);
            Report.TabIndex = 7;
            Report.Text = "보고서 생성";
            Report.UseVisualStyleBackColor = true;
            Report.Click += Report_Click;
            // 
            // TestCommandGroup
            // 
            TestCommandGroup.Controls.Add(SetDefault);
            TestCommandGroup.Controls.Add(GetFirmwareVersion);
            TestCommandGroup.Controls.Add(LEDTest);
            TestCommandGroup.Controls.Add(ClearSetting);
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
            TestCommandGroup.Font = new Font("맑은 고딕", 12F, FontStyle.Bold, GraphicsUnit.Point, 129);
            TestCommandGroup.ForeColor = Color.DarkBlue;
            TestCommandGroup.Location = new Point(13, 199);
            TestCommandGroup.Name = "TestCommandGroup";
            TestCommandGroup.Size = new Size(570, 257);
            TestCommandGroup.TabIndex = 6;
            TestCommandGroup.TabStop = false;
            TestCommandGroup.Text = "장치 테스트 명령 선택 : ";
            // 
            // LEDTest
            // 
            LEDTest.Font = new Font("맑은 고딕", 9.75F);
            LEDTest.ForeColor = Color.DarkBlue;
            LEDTest.Location = new Point(9, 111);
            LEDTest.Name = "LEDTest";
            LEDTest.Size = new Size(179, 35);
            LEDTest.TabIndex = 4;
            LEDTest.Text = "LED 테스트 실행";
            LEDTest.UseVisualStyleBackColor = true;
            LEDTest.Click += LedTest_Click;
            // 
            // DeviceTypeComboBox
            // 
            DeviceTypeComboBox.AutoCompleteCustomSource.AddRange(new string[] { "M", "G" });
            DeviceTypeComboBox.DropDownStyle = ComboBoxStyle.DropDownList;
            DeviceTypeComboBox.FormattingEnabled = true;
            DeviceTypeComboBox.Items.AddRange(new object[] { "M : 멀리언(Mullion) 타입", "G : 갱(Gang) 타입" });
            DeviceTypeComboBox.Location = new Point(625, 79);
            DeviceTypeComboBox.Name = "DeviceTypeComboBox";
            DeviceTypeComboBox.Size = new Size(166, 23);
            DeviceTypeComboBox.TabIndex = 3;
            // 
            // DeviceTypeLabel
            // 
            DeviceTypeLabel.AutoSize = true;
            DeviceTypeLabel.Font = new Font("맑은 고딕", 12F, FontStyle.Bold, GraphicsUnit.Point, 129);
            DeviceTypeLabel.Location = new Point(501, 79);
            DeviceTypeLabel.Name = "DeviceTypeLabel";
            DeviceTypeLabel.Size = new Size(118, 21);
            DeviceTypeLabel.TabIndex = 5;
            DeviceTypeLabel.Text = "장치 타입 선택";
            // 
            // Main
            // 
            AutoScaleDimensions = new SizeF(7F, 15F);
            AutoScaleMode = AutoScaleMode.Font;
            AutoValidate = AutoValidate.EnableAllowFocusChange;
            BackColor = SystemColors.Control;
            ClientSize = new Size(984, 661);
            Controls.Add(DeviceTypeLabel);
            Controls.Add(DeviceTypeComboBox);
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
        private Button NetworkLink;
        private Button SetDefault;
        private Button Report;
        private Button TestResult;
        private Button GetFirmwareVersion;
        private GroupBox TestCommandGroup;
        private Button ConnectButton;
        private ComboBox DeviceTypeComboBox;
        private Label DeviceTypeLabel;
    }
}
