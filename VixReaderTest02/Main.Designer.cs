namespace VixReaderTest01
{
    partial class Main
    {
        private void InitializeComponent()
        {
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(Main));
            LogTextBox = new TextBox();
            SerialCheckBox = new CheckBox();
            EthernetCheckBox = new CheckBox();
            IPAddressTextBox = new TextBox();
            IPAddressLabel = new Label();
            InterfaceGroupBox = new GroupBox();
            ConnectButton = new Button();
            ControlCommand = new GroupBox();
            GetSerialNumber = new Button();
            SetSerialNumber = new Button();
            ClearSetting = new Button();
            Reboot = new Button();
            GetFirmwareVersion = new Button();
            SetDefault = new Button();
            TestResult = new Button();
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
            MACAddressButton = new Button();
            LEDTest = new Button();
            DeviceTypeComboBox = new ComboBox();
            DeviceTypeLabel = new Label();
            IntellivixLogo = new PictureBox();
            InterfaceGroupBox.SuspendLayout();
            ControlCommand.SuspendLayout();
            TestCommandGroup.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)IntellivixLogo).BeginInit();
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
            LogTextBox.TabIndex = 8;
            // 
            // SerialCheckBox
            // 
            SerialCheckBox.AutoSize = true;
            SerialCheckBox.Enabled = false;
            SerialCheckBox.Font = new Font("굴림", 9.75F, FontStyle.Bold);
            SerialCheckBox.Location = new Point(8, 31);
            SerialCheckBox.Name = "SerialCheckBox";
            SerialCheckBox.Size = new Size(68, 17);
            SerialCheckBox.TabIndex = 0;
            SerialCheckBox.Text = "Serial";
            SerialCheckBox.UseVisualStyleBackColor = true;
            // 
            // EthernetCheckBox
            // 
            EthernetCheckBox.AutoSize = true;
            EthernetCheckBox.Checked = true;
            EthernetCheckBox.CheckState = CheckState.Checked;
            EthernetCheckBox.Font = new Font("굴림", 9.75F, FontStyle.Bold);
            EthernetCheckBox.Location = new Point(84, 31);
            EthernetCheckBox.Name = "EthernetCheckBox";
            EthernetCheckBox.Size = new Size(85, 17);
            EthernetCheckBox.TabIndex = 1;
            EthernetCheckBox.Text = "Ethernet";
            EthernetCheckBox.UseVisualStyleBackColor = true;
            // 
            // IPAddressTextBox
            // 
            IPAddressTextBox.Font = new Font("굴림", 9.75F, FontStyle.Bold);
            IPAddressTextBox.Location = new Point(269, 27);
            IPAddressTextBox.Name = "IPAddressTextBox";
            IPAddressTextBox.Size = new Size(166, 22);
            IPAddressTextBox.TabIndex = 3;
            IPAddressTextBox.Text = "192.168.0.2\r\n";
            IPAddressTextBox.TextChanged += IPAddressTextBox_TextChanged;
            // 
            // IPAddressLabel
            // 
            IPAddressLabel.AutoSize = true;
            IPAddressLabel.Font = new Font("굴림", 9.75F, FontStyle.Bold);
            IPAddressLabel.Location = new Point(200, 31);
            IPAddressLabel.Name = "IPAddressLabel";
            IPAddressLabel.Size = new Size(64, 13);
            IPAddressLabel.TabIndex = 2;
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
            InterfaceGroupBox.TabIndex = 1;
            InterfaceGroupBox.TabStop = false;
            InterfaceGroupBox.Text = "장치 연결  선택 :";
            // 
            // ConnectButton
            // 
            ConnectButton.BackColor = Color.Red;
            ConnectButton.Font = new Font("맑은 고딕", 12F, FontStyle.Bold, GraphicsUnit.Point, 129);
            ConnectButton.ForeColor = Color.Transparent;
            ConnectButton.Location = new Point(447, 18);
            ConnectButton.Name = "ConnectButton";
            ConnectButton.Size = new Size(163, 35);
            ConnectButton.TabIndex = 4;
            ConnectButton.Text = "연결...";
            ConnectButton.UseVisualStyleBackColor = false;
            ConnectButton.Click += ConnectButton_Click;
            // 
            // ControlCommand
            // 
            ControlCommand.Controls.Add(GetSerialNumber);
            ControlCommand.Controls.Add(SetSerialNumber);
            ControlCommand.Controls.Add(ClearSetting);
            ControlCommand.Font = new Font("맑은 고딕", 12F, FontStyle.Bold, GraphicsUnit.Point, 129);
            ControlCommand.ForeColor = Color.DarkBlue;
            ControlCommand.Location = new Point(12, 107);
            ControlCommand.Name = "ControlCommand";
            ControlCommand.Size = new Size(571, 86);
            ControlCommand.TabIndex = 6;
            ControlCommand.TabStop = false;
            ControlCommand.Text = "장치 제어 명령 선택 : ";
            // 
            // GetSerialNumber
            // 
            GetSerialNumber.Font = new Font("맑은 고딕", 9.75F);
            GetSerialNumber.Location = new Point(10, 40);
            GetSerialNumber.Name = "GetSerialNumber";
            GetSerialNumber.Size = new Size(180, 35);
            GetSerialNumber.TabIndex = 0;
            GetSerialNumber.Text = "시리얼 번호 읽기";
            GetSerialNumber.UseVisualStyleBackColor = true;
            GetSerialNumber.Click += GetSerialNumber_Click;
            // 
            // SetSerialNumber
            // 
            SetSerialNumber.Font = new Font("맑은 고딕", 9.75F);
            SetSerialNumber.Location = new Point(201, 40);
            SetSerialNumber.Name = "SetSerialNumber";
            SetSerialNumber.Size = new Size(175, 36);
            SetSerialNumber.TabIndex = 1;
            SetSerialNumber.Text = "시리얼 번호 쓰기";
            SetSerialNumber.UseVisualStyleBackColor = true;
            SetSerialNumber.Click += SetSerialNumber_Click;
            // 
            // ClearSetting
            // 
            ClearSetting.Font = new Font("맑은 고딕", 9.75F);
            ClearSetting.Location = new Point(386, 41);
            ClearSetting.Name = "ClearSetting";
            ClearSetting.Size = new Size(174, 35);
            ClearSetting.TabIndex = 2;
            ClearSetting.Text = "장치 설정 지우기";
            ClearSetting.UseVisualStyleBackColor = true;
            ClearSetting.Click += ClearSetting_Click;
            // 
            // Reboot
            // 
            Reboot.Font = new Font("굴림", 9.75F);
            Reboot.Location = new Point(385, 201);
            Reboot.Name = "Reboot";
            Reboot.Size = new Size(174, 38);
            Reboot.TabIndex = 14;
            Reboot.Text = "장치 재부팅";
            Reboot.UseVisualStyleBackColor = true;
            Reboot.Click += Reboot_Click;
            // 
            // GetFirmwareVersion
            // 
            GetFirmwareVersion.Font = new Font("굴림", 9.75F);
            GetFirmwareVersion.Location = new Point(9, 30);
            GetFirmwareVersion.Name = "GetFirmwareVersion";
            GetFirmwareVersion.Size = new Size(179, 34);
            GetFirmwareVersion.TabIndex = 0;
            GetFirmwareVersion.Text = "펌웨어 버전 읽기";
            GetFirmwareVersion.UseVisualStyleBackColor = true;
            GetFirmwareVersion.Click += GetFirmwareVersion_Click;
            // 
            // SetDefault
            // 
            SetDefault.Font = new Font("굴림", 9.75F);
            SetDefault.Location = new Point(200, 199);
            SetDefault.Name = "SetDefault";
            SetDefault.Size = new Size(174, 38);
            SetDefault.TabIndex = 13;
            SetDefault.Text = "리셋 버튼 실행";
            SetDefault.UseVisualStyleBackColor = true;
            SetDefault.Click += DefaultState_Click;
            // 
            // TestResult
            // 
            TestResult.BackColor = Color.LightGray;
            TestResult.Font = new Font("맑은 고딕", 72F, FontStyle.Regular, GraphicsUnit.Point, 129);
            TestResult.ForeColor = Color.DarkBlue;
            TestResult.Location = new Point(598, 116);
            TestResult.Name = "TestResult";
            TestResult.Size = new Size(374, 340);
            TestResult.TabIndex = 1;
            TestResult.Text = " 준비";
            TestResult.UseVisualStyleBackColor = false;
            // 
            // TamperTest
            // 
            TamperTest.Font = new Font("굴림", 9.75F);
            TamperTest.ForeColor = Color.DarkBlue;
            TamperTest.Location = new Point(10, 201);
            TamperTest.Name = "TamperTest";
            TamperTest.Size = new Size(176, 38);
            TamperTest.TabIndex = 12;
            TamperTest.Text = "템퍼 버튼 실행";
            TamperTest.UseVisualStyleBackColor = true;
            TamperTest.Click += TamperTest_Click;
            // 
            // BuzzerTest
            // 
            BuzzerTest.Font = new Font("굴림", 9.75F);
            BuzzerTest.ForeColor = Color.DarkBlue;
            BuzzerTest.Location = new Point(200, 70);
            BuzzerTest.Name = "BuzzerTest";
            BuzzerTest.Size = new Size(175, 35);
            BuzzerTest.TabIndex = 4;
            BuzzerTest.Text = "부저 테스트 실행";
            BuzzerTest.UseVisualStyleBackColor = true;
            BuzzerTest.Click += BuzzerTest_Click;
            // 
            // DoorButtonTest
            // 
            DoorButtonTest.Font = new Font("굴림", 9.75F);
            DoorButtonTest.ForeColor = Color.DarkBlue;
            DoorButtonTest.Location = new Point(385, 113);
            DoorButtonTest.Name = "DoorButtonTest";
            DoorButtonTest.Size = new Size(174, 38);
            DoorButtonTest.TabIndex = 8;
            DoorButtonTest.Text = "도어 버튼 테스트 실행";
            DoorButtonTest.UseVisualStyleBackColor = true;
            DoorButtonTest.Click += DoorButtonTest_Click;
            // 
            // DoorLockTest
            // 
            DoorLockTest.Font = new Font("굴림", 9.75F);
            DoorLockTest.Location = new Point(385, 72);
            DoorLockTest.Name = "DoorLockTest";
            DoorLockTest.Size = new Size(174, 35);
            DoorLockTest.TabIndex = 5;
            DoorLockTest.Text = "릴레이제어 실행";
            DoorLockTest.UseVisualStyleBackColor = true;
            DoorLockTest.Click += DoorLockTest_Click;
            // 
            // SensorTest
            // 
            SensorTest.Font = new Font("굴림", 9.75F);
            SensorTest.ForeColor = Color.DarkBlue;
            SensorTest.Location = new Point(200, 114);
            SensorTest.Name = "SensorTest";
            SensorTest.Size = new Size(174, 35);
            SensorTest.TabIndex = 7;
            SensorTest.Text = "센서 테스트 실행";
            SensorTest.UseVisualStyleBackColor = true;
            SensorTest.Click += SensorTest_Click;
            // 
            // AUXInTest
            // 
            AUXInTest.Font = new Font("굴림", 9.75F);
            AUXInTest.ForeColor = Color.DarkBlue;
            AUXInTest.Location = new Point(10, 114);
            AUXInTest.Name = "AUXInTest";
            AUXInTest.Size = new Size(176, 36);
            AUXInTest.TabIndex = 6;
            AUXInTest.Text = "AUX IN 테스트 실행";
            AUXInTest.UseVisualStyleBackColor = true;
            AUXInTest.Click += AuxinTest_Click;
            // 
            // LFIDTest
            // 
            LFIDTest.Font = new Font("굴림", 9.75F);
            LFIDTest.ForeColor = Color.DarkBlue;
            LFIDTest.Location = new Point(10, 158);
            LFIDTest.Name = "LFIDTest";
            LFIDTest.Size = new Size(176, 35);
            LFIDTest.TabIndex = 9;
            LFIDTest.Text = "LFID 테스트 실행";
            LFIDTest.UseVisualStyleBackColor = true;
            LFIDTest.Click += LfidTest_Click;
            // 
            // NFCTest
            // 
            NFCTest.Font = new Font("굴림", 9.75F);
            NFCTest.ForeColor = Color.DarkBlue;
            NFCTest.Location = new Point(200, 158);
            NFCTest.Name = "NFCTest";
            NFCTest.Size = new Size(175, 35);
            NFCTest.TabIndex = 10;
            NFCTest.Text = "NFC 테스트 실행";
            NFCTest.UseVisualStyleBackColor = true;
            NFCTest.Click += NfcTest_Click;
            // 
            // BLETest
            // 
            BLETest.Font = new Font("굴림", 9.75F);
            BLETest.ForeColor = Color.DarkBlue;
            BLETest.Location = new Point(385, 157);
            BLETest.Name = "BLETest";
            BLETest.Size = new Size(174, 36);
            BLETest.TabIndex = 11;
            BLETest.Text = "Bluetooth 테스트 실행";
            BLETest.UseVisualStyleBackColor = true;
            BLETest.Click += BleTest_Click;
            // 
            // SelfTest
            // 
            SelfTest.Font = new Font("굴림", 9.75F);
            SelfTest.ForeColor = Color.DarkBlue;
            SelfTest.Location = new Point(385, 30);
            SelfTest.Name = "SelfTest";
            SelfTest.Size = new Size(174, 36);
            SelfTest.TabIndex = 2;
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
            IntellivixInfo.TabIndex = 0;
            IntellivixInfo.Text = "Intellivix Reader Firmware Test Program\r\nVersion 1.0.0\r\nAll rights are reserved.\r\n(시리얼 연결은 지원하지 않습니다.)\r\n";
            // 
            // Report
            // 
            Report.Font = new Font("맑은 고딕", 12F, FontStyle.Bold, GraphicsUnit.Point, 129);
            Report.ForeColor = Color.DarkBlue;
            Report.Location = new Point(803, 74);
            Report.Name = "Report";
            Report.Size = new Size(163, 32);
            Report.TabIndex = 5;
            Report.Text = "보고서 생성";
            Report.UseVisualStyleBackColor = true;
            Report.Click += Report_Click;
            // 
            // TestCommandGroup
            // 
            TestCommandGroup.Controls.Add(MACAddressButton);
            TestCommandGroup.Controls.Add(Reboot);
            TestCommandGroup.Controls.Add(SetDefault);
            TestCommandGroup.Controls.Add(GetFirmwareVersion);
            TestCommandGroup.Controls.Add(LEDTest);
            TestCommandGroup.Controls.Add(SelfTest);
            TestCommandGroup.Controls.Add(TamperTest);
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
            TestCommandGroup.TabIndex = 7;
            TestCommandGroup.TabStop = false;
            TestCommandGroup.Text = "장치 테스트 명령 선택 : ";
            // 
            // MACAddressButton
            // 
            MACAddressButton.Font = new Font("굴림", 9.75F);
            MACAddressButton.Location = new Point(200, 30);
            MACAddressButton.Name = "MACAddressButton";
            MACAddressButton.Size = new Size(175, 35);
            MACAddressButton.TabIndex = 1;
            MACAddressButton.Text = "MAC 주소 읽기 실행";
            MACAddressButton.UseVisualStyleBackColor = true;
            MACAddressButton.Click += GetMacAddress_Click;
            // 
            // LEDTest
            // 
            LEDTest.Font = new Font("굴림", 9.75F);
            LEDTest.ForeColor = Color.DarkBlue;
            LEDTest.Location = new Point(9, 70);
            LEDTest.Name = "LEDTest";
            LEDTest.Size = new Size(179, 35);
            LEDTest.TabIndex = 3;
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
            DeviceTypeComboBox.TabIndex = 4;
            // 
            // DeviceTypeLabel
            // 
            DeviceTypeLabel.AutoSize = true;
            DeviceTypeLabel.Font = new Font("굴림", 9.75F, FontStyle.Bold);
            DeviceTypeLabel.Location = new Point(516, 84);
            DeviceTypeLabel.Name = "DeviceTypeLabel";
            DeviceTypeLabel.Size = new Size(111, 13);
            DeviceTypeLabel.TabIndex = 3;
            DeviceTypeLabel.Text = "장치 타입 선택 :\r\n";
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
            InterfaceGroupBox.ResumeLayout(false);
            InterfaceGroupBox.PerformLayout();
            ControlCommand.ResumeLayout(false);
            TestCommandGroup.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)IntellivixLogo).EndInit();
            ResumeLayout(false);
            PerformLayout();
        }

        private TextBox LogTextBox;
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
        private Button SetDefault;
        private Button Report;
        private Button TestResult;
        private Button GetFirmwareVersion;
        private GroupBox TestCommandGroup;
        private Button ConnectButton;
        private ComboBox DeviceTypeComboBox;
        private Label DeviceTypeLabel;
        private Button MACAddressButton;
        private PictureBox IntellivixLogo;
    }
}
