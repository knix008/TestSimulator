namespace VIXFaceTest
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
            TestResult = new Button();
            GetFirmwareVersion = new Button();
            SetDefault = new Button();
            Report = new Button();
            DbResetButton = new Button();
            TestCommandGroup = new GroupBox();
            NetworkTest = new Button();
            WiegandTest = new Button();
            WifiTest = new Button();
            CameraTest = new Button();
            MACAddressButton = new Button();
            SelfTest = new Button();
            TamperTest = new Button();
            DoorLockTest = new Button();
            NFCTest = new Button();
            BLETest = new Button();
            DeviceTypeComboBox = new ComboBox();
            DeviceTypeLabel = new Label();
            IntellivixInfo = new Label();
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
            LogTextBox.Location = new Point(13, 400);
            LogTextBox.Multiline = true;
            LogTextBox.Name = "LogTextBox";
            LogTextBox.ScrollBars = ScrollBars.Vertical;
            LogTextBox.Size = new Size(1159, 349);
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
            IPAddressTextBox.Text = "127.0.0.1";
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
            InterfaceGroupBox.Location = new Point(549, 12);
            InterfaceGroupBox.Name = "InterfaceGroupBox";
            InterfaceGroupBox.Size = new Size(623, 61);
            InterfaceGroupBox.TabIndex = 1;
            InterfaceGroupBox.TabStop = false;
            InterfaceGroupBox.Text = "장치 연결 선택 :";
            // 
            // ConnectButton
            // 
            ConnectButton.BackColor = Color.Red;
            ConnectButton.Font = new Font("맑은 고딕", 12F, FontStyle.Bold, GraphicsUnit.Point, 129);
            ConnectButton.ForeColor = Color.Transparent;
            ConnectButton.Location = new Point(447, 18);
            ConnectButton.Name = "ConnectButton";
            ConnectButton.Size = new Size(170, 35);
            ConnectButton.TabIndex = 4;
            ConnectButton.Text = "연결...";
            ConnectButton.UseVisualStyleBackColor = false;
            ConnectButton.Click += ConnectButton_Click;
            // 
            // ControlCommand
            // 
            ControlCommand.Controls.Add(GetSerialNumber);
            ControlCommand.Controls.Add(SetSerialNumber);
            ControlCommand.Font = new Font("맑은 고딕", 12F, FontStyle.Bold, GraphicsUnit.Point, 129);
            ControlCommand.ForeColor = Color.DarkBlue;
            ControlCommand.Location = new Point(12, 107);
            ControlCommand.Name = "ControlCommand";
            ControlCommand.Size = new Size(400, 86);
            ControlCommand.TabIndex = 6;
            ControlCommand.TabStop = false;
            ControlCommand.Text = "장치 제어 명령 :";
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
            // TestResult
            // 
            TestResult.BackColor = Color.LightGray;
            TestResult.Font = new Font("맑은 고딕", 72F, FontStyle.Regular, GraphicsUnit.Point, 129);
            TestResult.ForeColor = Color.DarkBlue;
            TestResult.Location = new Point(798, 116);
            TestResult.Name = "TestResult";
            TestResult.Size = new Size(374, 270);
            TestResult.TabIndex = 1;
            TestResult.Text = " 준비";
            TestResult.UseVisualStyleBackColor = false;
            // 
            // GetFirmwareVersion
            // 
            GetFirmwareVersion.Font = new Font("굴림", 9.75F);
            GetFirmwareVersion.Location = new Point(9, 30);
            GetFirmwareVersion.Name = "GetFirmwareVersion";
            GetFirmwareVersion.Size = new Size(179, 34);
            GetFirmwareVersion.TabIndex = 0;
            GetFirmwareVersion.Text = "펌웨어 버전 (VER?)";
            GetFirmwareVersion.UseVisualStyleBackColor = true;
            GetFirmwareVersion.Click += GetFirmwareVersion_Click;
            // 
            // SetDefault
            // 
            SetDefault.Font = new Font("굴림", 9.75F);
            SetDefault.Location = new Point(9, 72);
            SetDefault.Name = "SetDefault";
            SetDefault.Size = new Size(179, 35);
            SetDefault.TabIndex = 3;
            SetDefault.Text = "DEFAULT 테스트";
            SetDefault.UseVisualStyleBackColor = true;
            SetDefault.Click += DefaultState_Click;
            // 
            // Report
            // 
            Report.Font = new Font("맑은 고딕", 12F, FontStyle.Bold, GraphicsUnit.Point, 129);
            Report.ForeColor = Color.DarkBlue;
            Report.Location = new Point(996, 74);
            Report.Name = "Report";
            Report.Size = new Size(169, 32);
            Report.TabIndex = 5;
            Report.Text = "보고서 생성";
            Report.UseVisualStyleBackColor = true;
            Report.Click += Report_Click;
            // 
            // DbResetButton
            // 
            DbResetButton.Font = new Font("맑은 고딕", 12F, FontStyle.Bold, GraphicsUnit.Point, 129);
            DbResetButton.ForeColor = Color.DarkRed;
            DbResetButton.Location = new Point(996, 112);
            DbResetButton.Name = "DbResetButton";
            DbResetButton.Size = new Size(169, 32);
            DbResetButton.TabIndex = 6;
            DbResetButton.Text = "DB 초기화";
            DbResetButton.UseVisualStyleBackColor = true;
            DbResetButton.Click += DbResetButton_Click;
            // 
            // TestCommandGroup
            // 
            TestCommandGroup.Controls.Add(NetworkTest);
            TestCommandGroup.Controls.Add(WiegandTest);
            TestCommandGroup.Controls.Add(WifiTest);
            TestCommandGroup.Controls.Add(CameraTest);
            TestCommandGroup.Controls.Add(SetDefault);
            TestCommandGroup.Controls.Add(GetFirmwareVersion);
            TestCommandGroup.Controls.Add(MACAddressButton);
            TestCommandGroup.Controls.Add(SelfTest);
            TestCommandGroup.Controls.Add(TamperTest);
            TestCommandGroup.Controls.Add(DoorLockTest);
            TestCommandGroup.Controls.Add(NFCTest);
            TestCommandGroup.Controls.Add(BLETest);
            TestCommandGroup.Font = new Font("맑은 고딕", 12F, FontStyle.Bold, GraphicsUnit.Point, 129);
            TestCommandGroup.ForeColor = Color.DarkBlue;
            TestCommandGroup.Location = new Point(13, 199);
            TestCommandGroup.Name = "TestCommandGroup";
            TestCommandGroup.Size = new Size(570, 195);
            TestCommandGroup.TabIndex = 7;
            TestCommandGroup.TabStop = false;
            TestCommandGroup.Text = "장치 테스트 명령 (VIXface 시뮬레이터) :";
            // 
            // NetworkTest
            // 
            NetworkTest.Font = new Font("굴림", 9.75F);
            NetworkTest.Location = new Point(385, 156);
            NetworkTest.Name = "NetworkTest";
            NetworkTest.Size = new Size(174, 35);
            NetworkTest.TabIndex = 11;
            NetworkTest.Text = "네트워크 (NETWORK)";
            NetworkTest.UseVisualStyleBackColor = true;
            NetworkTest.Click += NetworkTest_Click;
            // 
            // WiegandTest
            // 
            WiegandTest.Font = new Font("굴림", 9.75F);
            WiegandTest.Location = new Point(200, 114);
            WiegandTest.Name = "WiegandTest";
            WiegandTest.Size = new Size(175, 35);
            WiegandTest.TabIndex = 8;
            WiegandTest.Text = "Wiegand 테스트";
            WiegandTest.UseVisualStyleBackColor = true;
            WiegandTest.Click += WiegandTest_Click;
            // 
            // WifiTest
            // 
            WifiTest.Font = new Font("굴림", 9.75F);
            WifiTest.Location = new Point(385, 72);
            WifiTest.Name = "WifiTest";
            WifiTest.Size = new Size(174, 35);
            WifiTest.TabIndex = 5;
            WifiTest.Text = "WiFi 테스트";
            WifiTest.UseVisualStyleBackColor = true;
            WifiTest.Click += WifiTest_Click;
            // 
            // CameraTest
            // 
            CameraTest.Font = new Font("굴림", 9.75F);
            CameraTest.Location = new Point(200, 72);
            CameraTest.Name = "CameraTest";
            CameraTest.Size = new Size(175, 35);
            CameraTest.TabIndex = 4;
            CameraTest.Text = "카메라 테스트";
            CameraTest.UseVisualStyleBackColor = true;
            CameraTest.Click += CameraTest_Click;
            // 
            // MACAddressButton
            // 
            MACAddressButton.Font = new Font("굴림", 9.75F);
            MACAddressButton.Location = new Point(200, 30);
            MACAddressButton.Name = "MACAddressButton";
            MACAddressButton.Size = new Size(175, 35);
            MACAddressButton.TabIndex = 1;
            MACAddressButton.Text = "MAC 주소 (JSON)";
            MACAddressButton.UseVisualStyleBackColor = true;
            MACAddressButton.Click += GetMacAddress_Click;
            // 
            // SelfTest
            // 
            SelfTest.Font = new Font("굴림", 9.75F);
            SelfTest.Location = new Point(385, 30);
            SelfTest.Name = "SelfTest";
            SelfTest.Size = new Size(174, 36);
            SelfTest.TabIndex = 2;
            SelfTest.Text = "BIST 자가진단";
            SelfTest.UseVisualStyleBackColor = true;
            SelfTest.Click += SelfTest_Click;
            // 
            // TamperTest
            // 
            TamperTest.Font = new Font("굴림", 9.75F);
            TamperTest.Location = new Point(200, 156);
            TamperTest.Name = "TamperTest";
            TamperTest.Size = new Size(175, 35);
            TamperTest.TabIndex = 10;
            TamperTest.Text = "TAMPER 테스트";
            TamperTest.UseVisualStyleBackColor = true;
            TamperTest.Click += TamperTest_Click;
            // 
            // DoorLockTest
            // 
            DoorLockTest.Font = new Font("굴림", 9.75F);
            DoorLockTest.Location = new Point(9, 156);
            DoorLockTest.Name = "DoorLockTest";
            DoorLockTest.Size = new Size(179, 35);
            DoorLockTest.TabIndex = 9;
            DoorLockTest.Text = "LOCK 테스트";
            DoorLockTest.UseVisualStyleBackColor = true;
            DoorLockTest.Click += DoorLockTest_Click;
            // 
            // NFCTest
            // 
            NFCTest.Font = new Font("굴림", 9.75F);
            NFCTest.Location = new Point(385, 114);
            NFCTest.Name = "NFCTest";
            NFCTest.Size = new Size(174, 35);
            NFCTest.TabIndex = 7;
            NFCTest.Text = "NFC 테스트";
            NFCTest.UseVisualStyleBackColor = true;
            NFCTest.Click += NfcTest_Click;
            // 
            // BLETest
            // 
            BLETest.Font = new Font("굴림", 9.75F);
            BLETest.Location = new Point(9, 114);
            BLETest.Name = "BLETest";
            BLETest.Size = new Size(179, 35);
            BLETest.TabIndex = 6;
            BLETest.Text = "BLE 테스트";
            BLETest.UseVisualStyleBackColor = true;
            BLETest.Click += BleTest_Click;
            // 
            // DeviceTypeComboBox
            // 
            DeviceTypeComboBox.DropDownStyle = ComboBoxStyle.DropDownList;
            DeviceTypeComboBox.FormattingEnabled = true;
            DeviceTypeComboBox.Items.AddRange(new object[] { "M : 멀리언(Mullion) 타입", "G : 갱(Gang) 타입" });
            DeviceTypeComboBox.Location = new Point(818, 79);
            DeviceTypeComboBox.Name = "DeviceTypeComboBox";
            DeviceTypeComboBox.Size = new Size(166, 23);
            DeviceTypeComboBox.TabIndex = 4;
            // 
            // DeviceTypeLabel
            // 
            DeviceTypeLabel.AutoSize = true;
            DeviceTypeLabel.Font = new Font("굴림", 9.75F, FontStyle.Bold);
            DeviceTypeLabel.Location = new Point(709, 84);
            DeviceTypeLabel.Name = "DeviceTypeLabel";
            DeviceTypeLabel.Size = new Size(103, 13);
            DeviceTypeLabel.TabIndex = 3;
            DeviceTypeLabel.Text = "장치 타입 선택 :";
            // 
            // IntellivixInfo
            // 
            IntellivixInfo.AutoSize = true;
            IntellivixInfo.Font = new Font("맑은 고딕", 9F, FontStyle.Bold, GraphicsUnit.Point, 129);
            IntellivixInfo.Location = new Point(91, 12);
            IntellivixInfo.Name = "IntellivixInfo";
            IntellivixInfo.Size = new Size(320, 60);
            IntellivixInfo.TabIndex = 0;
            IntellivixInfo.Text = "VIXface Firmware Test Program\r\nVersion 2.0.0\r\nTLS 8443 (AT + JSON)\r\nVIXface2.0Simulator API 호환";
            // 
            // IntellivixLogo
            // 
            IntellivixLogo.BackColor = SystemColors.ControlDark;
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
            ClientSize = new Size(1184, 761);
            Controls.Add(DeviceTypeLabel);
            Controls.Add(DeviceTypeComboBox);
            Controls.Add(TestResult);
            Controls.Add(Report);
            Controls.Add(DbResetButton);
            Controls.Add(IntellivixInfo);
            Controls.Add(InterfaceGroupBox);
            Controls.Add(IntellivixLogo);
            Controls.Add(LogTextBox);
            Controls.Add(ControlCommand);
            Controls.Add(TestCommandGroup);
            MaximizeBox = false;
            MaximumSize = new Size(1200, 800);
            MinimumSize = new Size(1200, 800);
            Name = "Main";
            Text = "VIXFaceTest";
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
        private Button DoorLockTest;
        private Button NFCTest;
        private Button BLETest;
        private Button TamperTest;
        private Button SetDefault;
        private Button Report;
        private Button DbResetButton;
        private Button TestResult;
        private Button GetFirmwareVersion;
        private GroupBox TestCommandGroup;
        private Button ConnectButton;
        private ComboBox DeviceTypeComboBox;
        private Label DeviceTypeLabel;
        private Button MACAddressButton;
        private PictureBox IntellivixLogo;
        private Button CameraTest;
        private Button WifiTest;
        private Button WiegandTest;
        private Button NetworkTest;
    }
}
